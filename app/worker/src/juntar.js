// Imagens de páginas soltas do mesmo documento ("matteo 1.jpeg", "matteo 2.jpeg"…, ou uma pasta com as
// fotografias de um manuscrito, "243r.jpg", "f. 012v.tif"…) dão uma só fonte:
// - um PDF comprimido, só para ver (é ele que a biblioteca lê);
// - as imagens originais, intactas e com o nome original, em biblioteca/_originais/<nome>/, ligadas à ficha
//   (metadados.originais). O PDF diz onde estão nas "palavras-chave" (originais=…; conjunto=…).
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { PASTAS, ORIGINAIS } from './config.js'
import { correr } from './extracao.js'
import * as F from './ficheiros.js'
import { log } from './registo.js'
import { esperarVez } from './intensidade.js'

// Nome base sem o número final: "matteo 3" → "matteo"; "matteo 3r" → "matteo"; "001" → "" (só números)
export function nomeBase(ficheiro) {
  const base = path.basename(ficheiro, path.extname(ficheiro)).normalize('NFC')
  return base.replace(/[\s_\-.(]*(\d+\s*[rv]?|[ivxlc]{1,4})?[)\s]*$/i, '').trim().toLowerCase()
}
const numeroFinal = (f) => Number((/(\d+)\D*$/.exec(path.basename(f, path.extname(f))) || [])[1] || 0)

// Ordem das páginas de uma pasta: capa/portada/guarda primeiro, depois pela ordem natural dos nomes
// ("2" antes de "10"; "243r" antes de "243v")
const ANTES = /(capa|portada|guarda|cover|frontis)/i
export function ordenarPaginas(ficheiros) {
  const nome = (f) => path.basename(f, path.extname(f)).normalize('NFC')
  const peso = (f) => (ANTES.test(nome(f)) && !/contra/i.test(nome(f)) ? 0 : 1)
  return [...ficheiros].sort((a, b) => peso(a) - peso(b) || nome(a).localeCompare(nome(b), 'pt', { numeric: true, sensitivity: 'base' }))
}

// Agrupa as imagens de uma pasta pelo nome base. Numa subpasta da watch folder ("uma fonte por pasta"):
// a pasta inteira é uma fonte, a não ser que tenha claramente vários documentos com nomes próprios
// ("matteo 1–5" e "luca 1–3": 2+ grupos de 2+ imagens e quase nenhuma imagem sozinha).
export function agrupar(ficheiros, { pastaInteira = false, nomePasta = '' } = {}) {
  const grupos = new Map()
  for (const f of ficheiros) {
    const b = nomeBase(f)
    const chave = b.length >= 3 ? b : b ? `curto:${b}` : '__pasta__'
    grupos.set(chave, [...(grupos.get(chave) || []), f])
  }
  const lista = [...grupos.entries()].map(([chave, l]) => ({
    nome: chave === '__pasta__' ? nomePasta || path.basename(path.dirname(l[0])) : chave.replace(/^curto:/, '') || path.basename(path.dirname(l[0])),
    ficheiros: l.sort((a, b) => numeroFinal(a) - numeroFinal(b) || a.localeCompare(b)),
  }))
  if (pastaInteira && ficheiros.length >= 2) {
    // (só contam nomes que diferem nas letras: "07-02-1123-9283" e "08-02-1123-9283" são o mesmo livro)
    const letras = (g) => F.semAcentos(g.nome).toLowerCase().replace(/[^a-z]/g, '')
    const nomesProprios = new Set(lista.filter((g) => g.ficheiros.length >= 2 && letras(g)).map(letras))
    const sozinhas = lista.filter((g) => g.ficheiros.length < 2).length
    if (!(nomesProprios.size >= 2 && sozinhas <= ficheiros.length * 0.2)) {
      return [{ nome: nomePasta || path.basename(path.dirname(ficheiros[0])), ficheiros: ordenarPaginas(ficheiros), pasta: true }]
    }
  }
  return lista
}

// Imagem reduzida para o PDF de visualização (lado maior ≤ 1600 px, JPEG 60%): o original não é tocado
const LADO_MAXIMO = 1600
export async function paraVisualizacao(f, tmp, i) {
  const destino = path.join(tmp, `${String(i).padStart(5, '0')}.jpg`)
  const props = await correr('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f], { timeout: 60000 })
  const w = Number((/pixelWidth:\s*(\d+)/.exec(props) || [])[1] || 0)
  const h = Number((/pixelHeight:\s*(\d+)/.exec(props) || [])[1] || 0)
  const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', '60']
  if (Math.max(w, h) > LADO_MAXIMO) args.push('-Z', String(LADO_MAXIMO))
  await correr('/usr/bin/sips', [...args, f, '--out', destino], { timeout: 120000 })
  return fsp.readFile(destino)
}

// Impressão digital do conjunto de imagens (nomes e tamanhos): a mesma pasta largada outra vez é repetida
export function conjuntoDe(ficheiros) {
  const linhas = ficheiros.map((f) => `${path.basename(f).normalize('NFC')}:${fs.statSync(f).size}`).sort()
  return crypto.createHash('sha1').update(linhas.join('\n')).digest('hex').slice(0, 16)
}

// Lê as palavras-chave do PDF de visualização: { originais: '_originais/…', conjunto: '…' } ou null
export function originaisDasPalavras(palavras) {
  const m = /originais=([^;]+)/.exec(palavras || '')
  if (!m) return null
  const c = /conjunto=([0-9a-f]+)/.exec(palavras || '')
  return { originais: m[1].trim(), conjunto: c ? c[1] : '' }
}

// metadados.originais de uma ficha: "_originais/E-TZ 2-3 New" (várias pastas separadas por " | ")
export const pastasOriginais = (md) => String(md?.originais || '').split(' | ').filter(Boolean)
export const juntarOriginais = (...valores) => [...new Set(valores.flatMap((v) => String(v || '').split(' | ')).filter(Boolean))].join(' | ')

// Junta um grupo num PDF colocado na mesma pasta (a watch folder trata-o a seguir).
// As imagens originais vão para biblioteca/_originais/<nome>/ (sem alterações).
export async function juntarGrupo(grupo) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'juntar-'))
  const movidas = []
  try {
    const pdf = await PDFDocument.create()
    let i = 0
    for (const f of grupo.ficheiros) {
      const img = await pdf.embedJpg(await paraVisualizacao(f, tmp, ++i))
      const escala = 842 / Math.max(img.width, img.height) // lado maior ≈ A4 (842 pt)
      const w = img.width * escala
      const h = img.height * escala
      pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h })
    }
    const conjunto = conjuntoDe(grupo.ficheiros)
    // Pasta dos originais: nome do grupo (com _2, _3… se já existir outra igual)
    const base = F.seguro(grupo.nome) || 'imagens'
    let nomePasta = base
    for (let n = 2; fs.existsSync(path.join(PASTAS.biblioteca, ORIGINAIS, nomePasta)); n++) nomePasta = `${base}_${n}`
    const pastaOriginais = path.join(PASTAS.biblioteca, ORIGINAIS, nomePasta)
    const relOriginais = `${ORIGINAIS}/${nomePasta}`
    pdf.setTitle(grupo.nome)
    pdf.setSubject(`Páginas juntadas de: ${grupo.ficheiros.map((f) => path.basename(f)).join(', ')}`.slice(0, 1000))
    pdf.setKeywords([`originais=${relOriginais}; conjunto=${conjunto}`])
    pdf.setProducer('Biblioteca de Fontes (PDF de visualização; originais à parte)')
    const dir = path.dirname(grupo.ficheiros[0])
    const nome = F.seguro(`${grupo.nome} (${grupo.ficheiros.length} páginas)`) + '.pdf'
    const provisorio = path.join(tmp, nome)
    await fsp.writeFile(provisorio, await pdf.save())
    // Guardar as imagens originais antes de pôr o PDF na watch folder (se algo falhar, voltam ao sítio)
    try {
      for (const f of grupo.ficheiros) movidas.push([f, await F.mover(f, pastaOriginais, path.basename(f))])
    } catch (e) {
      for (const [de, para] of movidas.reverse()) await F.mover(para, path.dirname(de), path.basename(de)).catch(() => {})
      await F.limparPastasVazias(pastaOriginais, PASTAS.biblioteca)
      throw e
    }
    const final = await F.mover(provisorio, dir, nome)
    log.info(`${grupo.ficheiros.length} imagens juntadas num PDF de visualização: ${path.basename(final)} (originais em ${relOriginais})`)
    return final
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

// Espera que as imagens de uma pasta acabem de chegar e decide: juntar ou tratar uma a uma
const emEspera = new Map()
export function agendarImagem(ficheiro, tratarUma) {
  const dir = path.dirname(ficheiro)
  const e = emEspera.get(dir) || { ficheiros: new Set(), t: null }
  e.ficheiros.add(ficheiro)
  clearTimeout(e.t)
  e.t = setTimeout(async () => {
    emEspera.delete(dir)
    const existentes = [...e.ficheiros].filter((f) => fs.existsSync(f))
    // (numa subpasta, o nome da fonte é o caminho das pastas: "tratados_ibéricos_de_vihuela - Libro_6")
    const rel = path.relative(PASTAS.watch, dir)
    const subpasta = rel && !rel.startsWith('..')
    const nomePasta = subpasta ? rel.split(path.sep).join(' - ') : ''
    for (const g of agrupar(existentes, { pastaInteira: subpasta, nomePasta })) {
      if (g.ficheiros.length < 2) {
        g.ficheiros.forEach(tratarUma)
        continue
      }
      try {
        await esperarVez()
        await juntarGrupo(g) // o PDF novo entra pela watch folder
      } catch (err) {
        // (as fotografias de uma fonte nunca são tratadas uma a uma: ficam na watch folder até ao próximo arranque)
        if (g.pasta) log.erro(`Não consegui juntar as imagens de «${g.nome}» (${err.message}); ficam na watch folder`)
        else {
          log.aviso(`Não consegui juntar as imagens de «${g.nome}» (${err.message}); vão ser tratadas uma a uma`)
          g.ficheiros.filter((f) => fs.existsSync(f)).forEach(tratarUma)
        }
      }
    }
  }, path.relative(PASTAS.watch, dir) ? 30000 : 8000) // (numa pasta grande a copiar, as imagens chegam aos poucos)
  emEspera.set(dir, e)
}
