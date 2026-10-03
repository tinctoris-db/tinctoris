// Imagens que ficaram em fichas soltas (versão antiga, noite de 30/9 para 1/10) e que pertencem a uma fonte já
// fotografada página a página: a imagem original vai, intacta, para a pasta de originais da fonte, o PDF de
// visualização é refeito com todas as páginas, o PDF antigo vai para _duplicados e a ficha solta é retirada.
// (aprovado pelo Pedro a 1/10/2026: «Sim, avança»; lista vinda da simulação das sobras)
// Uso: node src/completar_originais.js [--aplicar]
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PASTAS, PORTA, DUPLICADOS, segredo } from './config.js'
import { paraVisualizacao, conjuntoDe, pastasOriginais } from './juntar.js'
import * as F from './ficheiros.js'

const aplicar = process.argv.includes('--aplicar')
// ficha da fonte ← fichas soltas; (título/cota corrigidos quando o nome da pasta perdeu a cota)
const PLANO = [
  { destino: 16898, soltas: [16221, 16222, 16223, 16349, 16350, 16351, 16352, 16353], titulo: 'P-Csc Ms1', cota: 'Ms1' },
  { destino: 15751, soltas: [16354, 16355, 16356] },
  { destino: 16838, soltas: [10627, 10628] },
  { destino: 16855, soltas: [5929] },
  { destino: 16900, soltas: [10625] },
  { destino: 16899, soltas: [10626] },
]
const IMAGEM = /\.(jpe?g|tiff?|png|heic|bmp|gif|jp2)$/i
const num = (n) => `#${String(n).padStart(4, '0')}`

// Ordem das páginas: capa/guarda/portada da frente primeiro, capa de trás/contracapa no fim, o resto pela ordem
// natural dos nomes ("2" antes de "10")
function ordenar(ficheiros) {
  const nome = (f) => path.basename(f, path.extname(f)).normalize('NFC')
  const peso = (f) => {
    const n = nome(f)
    if (/contracapa|inside back/i.test(n)) return 2
    if (/(posterior|traseira|back)/i.test(n) && /(capa|cover|guarda)/i.test(n)) return 3
    return /(capa|portada|guarda|cover|frontis)/i.test(n) ? 0 : 1
  }
  return [...ficheiros].sort((a, b) => peso(a) - peso(b) || nome(a).localeCompare(nome(b), 'pt', { numeric: true, sensitivity: 'base' }))
}

async function servico(acao, corpo) {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}

await garantirSessao()
if (aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-completar-originais')}`)
let imagens = 0
let retiradas = 0
for (const p of PLANO) {
  const alvo = await pb.collection('fontes').getFirstListItem(`numero = ${p.destino}`)
  const pastas = pastasOriginais(alvo.metadados)
  const cab = `${num(alvo.numero)} «${alvo.titulo}»`
  if (alvo.estado === 'processando' || pastas.length !== 1) {
    console.log(`${cab}: SALTADA (${alvo.estado === 'processando' ? 'está a ser processada' : 'não tem uma só pasta de originais'})`)
    continue
  }
  const pasta = path.join(PASTAS.biblioteca, pastas[0])
  const pdfAntigo = path.join(PASTAS.biblioteca, alvo.ficheiro)
  if (!fs.existsSync(pasta) || !fs.existsSync(pdfAntigo)) {
    console.log(`${cab}: SALTADA (pasta de originais ou PDF em falta)`)
    continue
  }
  // As fichas soltas: só imagens, sem notas de leitura nem ficheiros adicionais
  const soltas = []
  for (const n of p.soltas) {
    const f = await pb.collection('fontes').getFirstListItem(`numero = ${n}`).catch(() => null)
    if (!f) continue
    const abs = f.ficheiro ? path.join(PASTAS.biblioteca, f.ficheiro) : ''
    const notas = await pb.collection('notas_leitura').getList(1, 1, { filter: pb.filter('fonte = {:f}', { f: f.id }) })
    const porque = f.estado === 'processando' ? 'está a ser processada' : !abs || !fs.existsSync(abs) ? 'ficheiro em falta' : !IMAGEM.test(abs) ? 'não é uma imagem' : notas.totalItems ? 'tem notas de leitura' : f.ficheiros_extra?.length ? 'tem ficheiros adicionais' : ''
    if (porque) console.log(`   ${num(n)} fica como está (${porque})`)
    else soltas.push({ f, abs, nome: F.seguro(f.ficheiro_original || path.basename(abs)) })
  }
  const atuais = fs.readdirSync(pasta).filter((x) => !x.startsWith('.') && IMAGEM.test(x))
  const total = atuais.length + soltas.filter((s) => !atuais.includes(s.nome)).length
  console.log(`${cab}: ${atuais.length} → ${total} páginas${p.titulo ? `; título «${p.titulo}», cota ${p.cota}` : ''}`)
  for (const s of soltas) console.log(`   + ${num(s.f.numero)} ${s.nome}`)
  if (!aplicar || !soltas.length) continue

  // 1. As imagens originais entram na pasta da fonte (com o nome original; uma igual que já lá esteja → _duplicados)
  for (const s of soltas) {
    const ja = path.join(pasta, s.nome)
    if (fs.existsSync(ja)) {
      const dest = fs.statSync(ja).size === fs.statSync(s.abs).size ? path.join(PASTAS.biblioteca, DUPLICADOS) : null
      if (!dest) throw new Error(`${s.nome}: já existe na pasta com outro tamanho`)
      await F.mover(s.abs, dest, s.nome)
    } else {
      await F.mover(s.abs, pasta, s.nome)
    }
    imagens++
  }
  // 2. Novo PDF de visualização com todas as páginas (as mesmas regras do juntar.js: 1600 px, JPEG 60%)
  const todas = ordenar(fs.readdirSync(pasta).filter((x) => !x.startsWith('.') && IMAGEM.test(x)).map((x) => path.join(pasta, x)))
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'completar-'))
  try {
    const pdf = await PDFDocument.create()
    let i = 0
    for (const f of todas) {
      const img = await pdf.embedJpg(await paraVisualizacao(f, tmp, ++i))
      const escala = 842 / Math.max(img.width, img.height)
      pdf.addPage([img.width * escala, img.height * escala]).drawImage(img, { x: 0, y: 0, width: img.width * escala, height: img.height * escala })
    }
    const conjunto = conjuntoDe(todas)
    const titulo = p.titulo || alvo.titulo
    pdf.setTitle(titulo)
    pdf.setSubject(`Páginas juntadas de: ${todas.map((f) => path.basename(f)).join(', ')}`.slice(0, 1000))
    pdf.setKeywords([`originais=${pastas[0]}; conjunto=${conjunto}`])
    pdf.setProducer('Biblioteca de Fontes (PDF de visualização; originais à parte)')
    const novo = path.join(tmp, 'novo.pdf')
    await fsp.writeFile(novo, await pdf.save())
    // 3. O PDF antigo vai para _duplicados; o novo fica no mesmo sítio
    await F.mover(pdfAntigo, path.join(PASTAS.biblioteca, DUPLICADOS), path.basename(pdfAntigo))
    await fsp.copyFile(novo, pdfAntigo)
    const alt = { hash: await F.hashFicheiro(pdfAntigo), paginas: todas.length, metadados: { ...(alvo.metadados || {}), originais_conjunto: conjunto } }
    if (p.titulo) Object.assign(alt, { titulo: p.titulo }, { metadados: { ...alt.metadados, cota: p.cota } })
    await pb.collection('fontes').update(alvo.id, alt)
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
  // 4. As fichas soltas saem (a imagem já está na fonte)
  for (const s of soltas) {
    await pb.collection('fontes').delete(s.f.id)
    retiradas++
  }
  if (p.titulo) {
    try {
      const r = await servico('reorganizar', { id: alvo.id })
      console.log(`   ficheiro: ${r.ficheiro}`)
    } catch (e) {
      console.log(`   (nome do ficheiro não atualizado: ${e.message})`)
    }
  }
  console.log(`   FEITO: ${todas.length} páginas`)
}
console.log(aplicar ? `\n${imagens} imagens juntadas às suas fontes; ${retiradas} fichas soltas retiradas (nada apagado).` : '\n(simulação: nada foi alterado; para aplicar: --aplicar)')
process.exit(0)
