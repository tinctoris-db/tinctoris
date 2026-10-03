// Pastas de fotografias que entraram duas vezes a 1/10/2026 (de manhã e às 12h46, originais em «<pasta>_2»):
// fica a versão mais completa (decisão do Pedro, 1/10: «sim para tudo»). Nada se apaga: o PDF e a pasta que saem vão
// para _duplicados, a ficha que sai passa as notas/etiquetas/ligações à que fica (como no ecrã Duplicados).
//   superconjunto — a pasta de uma ficha tem todas as imagens da outra (mesmo nome e tamanho) e mais: fica essa
//   uniao         — cada pasta tem imagens que a outra não tem: as que faltam passam para a que fica; PDF refeito
//   separar       — a pasta repetida tem imagens de OUTRAS fontes: a ficha dela fica só com essas (nova pasta)
// Uso: node src/escolher_pastas.js [--aplicar]
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PASTAS, PORTA, DUPLICADOS, ORIGINAIS, segredo } from './config.js'
import { paraVisualizacao, conjuntoDe, pastasOriginais, ordenarPaginas } from './juntar.js'
import { juntarDuplicado } from './duplicados.js'
import * as F from './ficheiros.js'

const aplicar = process.argv.includes('--aplicar')
const PLANO = [
  { tipo: 'superconjunto', fica: 17231, sai: 15584 }, // Cancionero Copenhague Thott 291 8º: 82 → 84
  { tipo: 'superconjunto', fica: 17241, sai: 16865 }, // Cancionero IV a 24: 31 → 138
  { tipo: 'superconjunto', fica: 17240, sai: 15672 }, // Odhecaton: 144 → 207
  { tipo: 'superconjunto', fica: 17242, sai: 15750 }, // P-LA Lv143 Morales 1551: 215 → 216
  { tipo: 'superconjunto', fica: 17236, sai: 16924 }, // tratados ibéricos de vihuela: 6 → 13
  { tipo: 'superconjunto', fica: 17236, sai: 15840 }, // «vihuela - los libros» (6 imagens, todas também na 17236) — Pedro, 1/10 «sim»
  { tipo: 'uniao', fica: 16895, sai: 17235 }, // Cancionero Escorial V.III.24: 129 + 2 = 131
  {
    tipo: 'separar', fica: 16894, sai: 17238, // E-TZ 2-3: a repetida trazia 30 imagens de outras fontes
    pasta: 'E-TZ 2-3 - materiais de comparação',
    titulo: 'E-TZ 2-3 — materiais de comparação (E-Bbc M 1167, Tordesillas…)',
    nota: 'Imagens de outras fontes (E-Bbc M 1167, Tordesillas, Escobar…) que vinham juntas com as fotografias do E-TZ 2-3 (entrada das 12h46 de 1/10/2026): separadas numa ficha própria a pedido do Pedro. Rever e identificar cada fonte.',
  },
]
const IMAGEM = /\.(jpe?g|tiff?|png|heic|bmp|gif|jp2)$/i
const num = (n) => `#${String(n).padStart(4, '0')}`
const relativo = (abs) => path.relative(PASTAS.biblioteca, abs).split(path.sep).join('/')
const imagensDe = (pasta) => fs.readdirSync(pasta).filter((x) => !x.startsWith('.') && IMAGEM.test(x))
const tamanho = (f) => fs.statSync(f).size

async function servico(acao, corpo) {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}

// PDF de visualização refeito com todas as imagens da pasta (as mesmas regras do juntar.js: 1600 px, JPEG 60%);
// o PDF antigo vai para _duplicados e o novo fica no mesmo sítio
async function refazerPdf(ficha, pasta, titulo) {
  const todas = ordenarPaginas(imagensDe(pasta).map((x) => path.join(pasta, x)))
  const pdfAntigo = path.join(PASTAS.biblioteca, ficha.ficheiro)
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'pastas-'))
  try {
    const pdf = await PDFDocument.create()
    let i = 0
    for (const f of todas) {
      const img = await pdf.embedJpg(await paraVisualizacao(f, tmp, ++i))
      const escala = 842 / Math.max(img.width, img.height)
      pdf.addPage([img.width * escala, img.height * escala]).drawImage(img, { x: 0, y: 0, width: img.width * escala, height: img.height * escala })
    }
    const conjunto = conjuntoDe(todas)
    pdf.setTitle(titulo)
    pdf.setSubject(`Páginas juntadas de: ${todas.map((f) => path.basename(f)).join(', ')}`.slice(0, 1000))
    pdf.setKeywords([`originais=${relativo(pasta)}; conjunto=${conjunto}`])
    pdf.setProducer('Biblioteca de Fontes (PDF de visualização; originais à parte)')
    const novo = path.join(tmp, 'novo.pdf')
    await fsp.writeFile(novo, await pdf.save())
    await F.mover(pdfAntigo, path.join(PASTAS.biblioteca, DUPLICADOS), path.basename(pdfAntigo))
    await fsp.copyFile(novo, pdfAntigo)
    return { hash: await F.hashFicheiro(pdfAntigo), paginas: todas.length, conjunto }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

// A pasta que sai vai inteira para _duplicados e a ficha que fica aponta só para a sua
async function guardarPastaQueSai(fica, pastaSai, pastaFica) {
  const destino = await F.mover(pastaSai, path.join(PASTAS.biblioteca, DUPLICADOS), `${path.basename(pastaSai)} - originais`)
  const atual = await pb.collection('fontes').getOne(fica.id)
  const md = { ...(atual.metadados || {}), originais: relativo(pastaFica), originais_conjunto: conjuntoDe(imagensDe(pastaFica).map((x) => path.join(pastaFica, x))) }
  const ret = [...(md.duplicados_retirados || [])]
  if (ret.length) ret[ret.length - 1] = { ...ret[ret.length - 1], originais_guardados_em: relativo(destino) }
  md.duplicados_retirados = ret
  await pb.collection('fontes').update(fica.id, { metadados: md })
  return relativo(destino)
}

await garantirSessao()
const passos = []
for (const p of PLANO) {
  const fica = await pb.collection('fontes').getFirstListItem(`numero = ${p.fica}`).catch(() => null)
  const sai = await pb.collection('fontes').getFirstListItem(`numero = ${p.sai}`).catch(() => null)
  const cab = `${p.tipo.padEnd(13)} fica ${num(p.fica)} «${fica?.titulo || '?'}» · sai ${num(p.sai)} «${sai?.titulo || '?'}»`
  const problema = () => {
    if (!fica || !sai) return 'ficha em falta'
    if ([fica, sai].some((f) => f.estado === 'processando')) return 'a ser processada'
    if ([fica, sai].some((f) => pastasOriginais(f.metadados).length !== 1)) return 'sem uma só pasta de originais'
    if ([fica, sai].some((f) => !f.ficheiro || !fs.existsSync(path.join(PASTAS.biblioteca, f.ficheiro)))) return 'PDF em falta'
    return ''
  }
  let porque = problema()
  // (caso já feito numa volta anterior)
  if (!porque && p.tipo === 'separar' && pastasOriginais(sai.metadados)[0] === `${ORIGINAIS}/${p.pasta}`) porque = 'já feito'
  if (porque) {
    console.log(`${cab}\n   SALTADA (${porque})`)
    continue
  }
  const pastaFica = path.join(PASTAS.biblioteca, pastasOriginais(fica.metadados)[0])
  const pastaSai = path.join(PASTAS.biblioteca, pastasOriginais(sai.metadados)[0])
  const iFica = imagensDe(pastaFica)
  const iSai = imagensDe(pastaSai)
  const comuns = iSai.filter((x) => iFica.includes(x))
  const diferentes = comuns.filter((x) => tamanho(path.join(pastaFica, x)) !== tamanho(path.join(pastaSai, x)))
  const soFica = iFica.filter((x) => !iSai.includes(x))
  const soSai = iSai.filter((x) => !iFica.includes(x))
  if (diferentes.length) porque = `${diferentes.length} imagens com o mesmo nome e tamanho diferente (${diferentes.slice(0, 3).join(', ')})`
  else if (p.tipo === 'superconjunto' && soSai.length) porque = `a que sai tem ${soSai.length} imagens que a outra não tem`
  if (porque) {
    console.log(`${cab}\n   SALTADA (${porque})`)
    continue
  }
  console.log(`${cab}\n   pastas: fica ${relativo(pastaFica)} (${iFica.length}) · sai ${relativo(pastaSai)} (${iSai.length}); em comum ${comuns.length}, só na que fica ${soFica.length}, só na que sai ${soSai.length}`)
  if (p.tipo === 'uniao') console.log(`   passam para a que fica: ${soSai.join(', ')} → ${iFica.length + soSai.length} páginas`)
  if (p.tipo === 'separar') console.log(`   ${num(p.sai)} fica só com as ${soSai.length} imagens de outras fontes, em ${ORIGINAIS}/${p.pasta}; título «${p.titulo}»`)
  passos.push({ p, fica, sai, pastaFica, pastaSai, comuns, soSai })
}
if (!aplicar) {
  console.log(`\n${passos.length} casos (simulação: nada foi alterado; para aplicar: --aplicar)`)
  process.exit(0)
}
console.log(`\nCópia de segurança: ${await copiaDeSeguranca('antes-escolher-pastas')}`)
const contar = (d) => fs.readdirSync(d, { recursive: true }).filter((x) => IMAGEM.test(String(x))).length
for (const { p, fica, sai, pastaFica, pastaSai, comuns, soSai } of passos) {
  try {
    if (p.tipo === 'superconjunto') {
      await juntarDuplicado(fica.id, sai.id)
      const guardada = await guardarPastaQueSai(fica, pastaSai, pastaFica)
      console.log(`${num(p.fica)}: FEITO — ${num(p.sai)} retirada; pasta em ${guardada}`)
    } else if (p.tipo === 'uniao') {
      for (const x of soSai) await F.mover(path.join(pastaSai, x), pastaFica, x)
      const r = await refazerPdf(fica, pastaFica, fica.titulo)
      await pb.collection('fontes').update(fica.id, { hash: r.hash, paginas: r.paginas, metadados: { ...(fica.metadados || {}), originais_conjunto: r.conjunto } })
      await juntarDuplicado(fica.id, sai.id)
      const guardada = await guardarPastaQueSai(fica, pastaSai, pastaFica)
      console.log(`${num(p.fica)}: FEITO — ${r.paginas} páginas; ${num(p.sai)} retirada; pasta em ${guardada}`)
    } else if (p.tipo === 'separar') {
      // as imagens repetidas (iguais às da ficha que fica) vão para _duplicados; a pasta passa a ter só as outras
      const repetidas = path.join(PASTAS.biblioteca, DUPLICADOS, `${path.basename(pastaSai)} - originais repetidos`)
      if (fs.existsSync(repetidas)) throw new Error(`${relativo(repetidas)} já existe`)
      await fsp.mkdir(repetidas, { recursive: true })
      for (const x of comuns) await F.mover(path.join(pastaSai, x), repetidas, x)
      const nova = path.join(PASTAS.biblioteca, ORIGINAIS, p.pasta)
      if (fs.existsSync(nova)) throw new Error(`${relativo(nova)} já existe`)
      await fsp.rename(pastaSai, nova)
      const r = await refazerPdf(sai, nova, p.titulo)
      const md = { ...(sai.metadados || {}), originais: relativo(nova), originais_conjunto: r.conjunto }
      for (const k of ['sigla', 'cota', 'arquivo', 'local_arquivo']) delete md[k]
      md.nota_revisao = [md.nota_revisao, p.nota].filter(Boolean).join('\n')
      await pb.collection('fontes').update(sai.id, { titulo: p.titulo, hash: r.hash, paginas: r.paginas, estado: 'a_rever', metadados: md })
      await servico('reorganizar', { id: sai.id }).catch((e) => console.log(`   (nome do ficheiro não atualizado: ${e.message})`))
      console.log(`${num(p.sai)}: FEITO — ${r.paginas} imagens de outras fontes em ${relativo(nova)}; ${comuns.length} repetidas em ${relativo(repetidas)}`)
    }
  } catch (e) {
    console.log(`${num(p.fica)}/${num(p.sai)}: ERRO — ${e.message} (parou aqui; o resto do caso fica como estava)`)
  }
}
console.log(`\nImagens em _originais: ${contar(path.join(PASTAS.biblioteca, ORIGINAIS))}; em _duplicados: ${contar(path.join(PASTAS.biblioteca, DUPLICADOS))}`)
process.exit(0)
