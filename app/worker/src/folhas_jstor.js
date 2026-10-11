// Fichas antigas com a folha do JSTOR à frente do PDF (pedido do Pedro, 5/10/2026, #0470 e #13984): a folha diz tudo
// — título, autores, revista, volume, número, páginas, ano e editora; nas recensões, a obra recenseada —, mas as versões
// antigas só liam título, autor e ano, inventavam um DOI a partir do número estável e, sem ele, iam procurar pelo título
// (outros artigos do mesmo autor; nas recensões, o próprio livro recenseado, «completo» pela Open Library).
//   A) lidas pela própria biblioteca (ficheiro, IA, capa) → reanalisar (as regras novas usam a folha inteira)
//   B) identificadas num catálogo que contradiz a folha (recensão tomada pelo livro, outro título, outro autor, outro
//      ano) → passam a ter os dados da folha, com nota do que estava antes
//   C) catálogo que concorda com a folha → só se acrescenta o que falta (revista, volume, número, páginas, ligação)
//   D) Mendeley: nada muda (é a referência do Pedro); só a lista do que a folha diz de diferente
// Também: E) nomes «accepted manuscript» (versão do autor de um artigo) que ficaram «Manuscrito» → deixam de o ser e
// são reanalisadas; F) só lista: fichas «completas» com um DOI do JSTOR (10.2307) sem folha do JSTOR no PDF — muitas
// são partituras que o CrossRef tomou por artigos com o mesmo título.
// Uso: node src/folhas_jstor.js [--aplicar] [--excluir 13,56]
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca, tipoPorNome } from './pb.js'
import { PASTAS, PORTA, segredo } from './config.js'
import * as X from './extracao.js'
import { analisarJstor } from './capa.js'
import { versaoDoAutor } from './musica_antiga.js'
import { crossrefPorDoi } from './fontes_externas/bibliograficas.js'
import { semelhanca, anosCompativeis } from './fontes_externas/util.js'
import { semAcentos } from './ficheiros.js'

const aplicar = process.argv.includes('--aplicar')
const iEx = process.argv.indexOf('--excluir')
const excluir = new Set(iEx > 0 ? String(process.argv[iEx + 1] || '').split(',').map(Number) : [])
const num = (n) => `#${String(n).padStart(4, '0')}`
const servico = async (acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.statusText)
}
const FRACA = /^(IA local|ficheiro|capa do PDF|capa do JSTOR)?$/
// (palavras dos apelidos: «Diego Pacheco» do CrossRef e «Cristina Diego Pacheco» da folha são a mesma pessoa)
// (também sem acentos e com qualquer hífen: «Kertész‐Wilkinson» = «Kertesz-Wilkinson»)
const apelidos = (l) => new Set((l || []).flatMap((a) => semAcentos(String(a.apelido || a.literal || '')).toLowerCase().split(/[\s\-‐‑–—]+/)).filter((w) => w.length >= 2))
const nomes = (l) => (l || []).map((a) => [a.nome, a.apelido].filter(Boolean).join(' ') || a.literal).join('; ')

await garantirSessao()
const todas = await pb.collection('fontes').getFullList({ filter: "ficheiro ~ '.pdf'", fields: 'id,numero,titulo,estado,origem,autores,data,doi,url,ficheiro,ficheiro_original,metadados,tipo', sort: 'numero' })
const A = []
const B = []
const C = []
const D = []
const E = []
const F = []
const depois = []
const doiConfirmado = new Map()
for (const f of todas) {
  if (excluir.has(f.numero)) continue
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  // E) versão do autor de um artigo tomada por manuscrito
  if (versaoDoAutor(f.ficheiro_original) && f.metadados?.forma === 'Manuscrito') {
    E.push({ f })
    continue
  }
  if (!fs.existsSync(abs)) continue
  let inicio = ''
  try {
    inicio = await X.pdfTexto(abs, 1, 3)
  } catch (_) {
    continue
  }
  const j = /jstor\.org\/stable\/|This content downloaded|JSTOR is a not-for-profit/i.test(inicio) ? analisarJstor(inicio, await X.pdfTexto(abs).catch(() => '')) : null
  if (!j?.completo) {
    if (!j && f.estado === 'completo' && /^10\.2307\//.test(f.doi || '') && !FRACA.test(String(f.origem || '').trim()) && !/Mendeley/.test(f.origem || '')) F.push({ f })
    continue
  }
  if (f.estado === 'processando') {
    depois.push({ f, j })
    continue
  }
  const origem = String(f.origem || '').trim()
  if (FRACA.test(origem)) {
    A.push({ f, j })
    continue
  }
  // O que a folha contradiz na ficha
  const motivos = []
  if (j.recensao && !/^review/i.test(f.titulo || '') && !/^review/i.test(j.titulo.replace(/^Review of: /, '')) && semelhanca(f.titulo, j.titulo) < 0.9) motivos.push('é uma recensão')
  if (semelhanca(f.titulo, j.titulo) < 0.6 && !motivos.length) motivos.push('outro título')
  if (j.autores.length && f.autores?.length && ![...apelidos(j.autores)].some((a) => apelidos(f.autores).has(a))) motivos.push('outros autores')
  // (um ano de diferença é a data em linha contra a do volume impresso: 1968 / 1969)
  const anoFicha = Number(String(f.data || '').slice(0, 4))
  if (j.ano && anoFicha && Math.abs(anoFicha - Number(j.ano)) > 1 && !anosCompativeis(j.ano, f.data)) motivos.push(`outro ano (${f.data} ≠ ${j.ano})`)
  if (/Mendeley/.test(origem)) {
    if (motivos.length) D.push({ f, j, motivos })
    continue
  }
  if (motivos.length) B.push({ f, j, motivos })
  else C.push({ f, j })
}
// DOI do JSTOR confirmado no CrossRef (só para as fichas que mudam)
for (const { j } of B) {
  if (!j.doiPossivel || doiConfirmado.has(j.doiPossivel)) continue
  let ok = false
  try {
    const c = await crossrefPorDoi(j.doiPossivel)
    ok = !!c && semelhanca(c.titulo, j.titulo) >= 0.6
  } catch (_) {}
  doiConfirmado.set(j.doiPossivel, ok)
}

const ref = (j) => [j.revista, j.volume && `vol. ${j.volume}`, j.numero && `n.º ${j.numero}`, j.ano && `(${j.ano})`, j.paginas && `pp. ${j.paginas}`].filter(Boolean).join(', ')
const linha = (f) => `${num(f.numero)} ${String(f.estado).padEnd(9)} ${String(f.origem || '-').padEnd(13)} «${String(f.titulo || '').slice(0, 70)}» — ${nomes(f.autores).slice(0, 40)}, ${f.data || 's.d.'}`
const mostrar = (titulo, l, extra) => {
  console.log(`\n===== ${titulo} (${l.length}) =====`)
  for (const x of l) {
    console.log(linha(x.f))
    if (extra) console.log(`        ${extra(x)}`)
  }
}
const folha = ({ j, motivos }) => `→ «${j.titulo.slice(0, 90)}» — ${nomes(j.autores)}, ${ref(j)}${motivos ? `   [${motivos.join(', ')}]` : ''}`
mostrar('A) LIDAS PELA BIBLIOTECA: reanalisar com a folha inteira', A, folha)
mostrar('B) CATÁLOGO CONTRADIZ A FOLHA: passam a ter os dados da folha (com nota)', B, folha)
mostrar('C) CATÁLOGO CONCORDA: só se acrescenta o que falta', C)
mostrar('D) MENDELEY: nada muda — só para o Pedro ver', D, folha)
mostrar('E) «ACCEPTED MANUSCRIPT» TOMADO POR MANUSCRITO: deixa de ser «Manuscrito» e é reanalisada', E, ({ f }) => f.ficheiro_original)
mostrar('F) SÓ LISTA: «completas» com DOI do JSTOR mas sem folha do JSTOR no PDF (partituras tomadas por artigos?)', F, ({ f }) => `${f.doi}  ficheiro: ${f.ficheiro_original}`)
mostrar('A PROCESSAR: correr outra vez depois', depois)
if (!aplicar) {
  console.log(`\nSimulação: nada foi alterado. A mudar: ${A.length + B.length + C.length + E.length} (para aplicar: --aplicar)`)
  process.exit(0)
}

console.log(`\nCópia de segurança: ${await copiaDeSeguranca('antes-folhas-jstor')}`)
const artigo = await tipoPorNome('Artigo')
let n = 0
const saltar = async (f) => {
  const atual = await pb.collection('fontes').getOne(f.id)
  if (atual.estado === 'processando') console.log(`${num(f.numero)}: entretanto a processar — saltada`)
  return atual.estado === 'processando' ? null : atual
}
for (const { f, j, motivos } of B) {
  const atual = await saltar(f)
  if (!atual) continue
  const meta = { ...(atual.metadados || {}) }
  for (const k of ['n_paginas', 'isbn_lido']) delete meta[k]
  Object.assign(meta, Object.fromEntries(Object.entries({ revista: j.revista, volume: j.volume, numero: j.numero, paginas: j.paginas, recensao_de: j.recensaoDe.join('; ') }).filter(([, v]) => v)))
  const antes = `${atual.origem} «${atual.titulo}»${atual.autores?.length ? ` (${nomes(atual.autores)})` : ''}${atual.data ? `, ${atual.data}` : ''}`
  meta.nota_revisao = [meta.nota_revisao, `Identificação anterior substituída pela folha do JSTOR (${motivos.join(', ')}): ${antes}.`].filter(Boolean).join(' ')
  await pb.collection('fontes').update(f.id, {
    titulo: j.titulo,
    autores: j.autores,
    data: j.ano,
    editora: j.editora,
    doi: doiConfirmado.get(j.doiPossivel) ? j.doiPossivel : '',
    url: j.url,
    isbn: '',
    local: '',
    tipo: artigo?.id,
    metadados: meta,
    origem: 'capa do JSTOR',
    candidatos: [],
    // (sem autor na folha — «Back Matter», «Editorial» — não fica completa, como as outras fichas)
    estado: j.autores.length ? atual.estado : 'a_rever',
  })
  await servico('reorganizar', { id: f.id }).catch((e) => console.log(`${num(f.numero)}: reorganizar — ${e.message}`))
  n++
}
for (const { f, j } of C) {
  const atual = await saltar(f)
  if (!atual) continue
  const meta = { ...(atual.metadados || {}) }
  // (páginas: também quando o catálogo só tem a primeira — «33» — e a folha tem o intervalo «33-43»)
  const paginasMelhores = j.paginas.includes('-') && meta.paginas && !String(meta.paginas).includes('-') && j.paginas.startsWith(`${meta.paginas}-`)
  const novos = Object.entries({ revista: j.revista, volume: j.volume, numero: j.numero, paginas: j.paginas, recensao_de: j.recensaoDe.join('; ') }).filter(([k, v]) => v && (!meta[k] || (k === 'paginas' && paginasMelhores)))
  if (!novos.length && atual.url) continue
  Object.assign(meta, Object.fromEntries(novos))
  await pb.collection('fontes').update(f.id, { metadados: meta, ...(atual.url ? {} : { url: j.url }) })
  n++
}
for (const { f } of E) {
  const atual = await saltar(f)
  if (!atual) continue
  const meta = { ...(atual.metadados || {}) }
  delete meta.forma
  // (as frases «… é uma fonte fotografada ou manuscrita» deixam de fazer sentido)
  meta.nota_revisao = String(meta.nota_revisao || '').split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ«])/).filter((s) => !/fotografada ou manuscrita|Identificação anterior não aceite/.test(s)).join(' ')
  if (!meta.nota_revisao) delete meta.nota_revisao
  await pb.collection('fontes').update(f.id, { metadados: meta, tipo: artigo?.id })
  await servico('reanalisar', { id: f.id }).catch((e) => console.log(`${num(f.numero)}: reanalisar — ${e.message}`))
  n++
}
for (const { f } of A) {
  await servico('reanalisar', { id: f.id }).catch((e) => console.log(`${num(f.numero)}: reanalisar — ${e.message}`))
  n++
}
console.log(`${n} fichas tratadas (${A.length + E.length} pedidas à reanálise: acabam dentro de alguns minutos).`)
process.exit(0)
