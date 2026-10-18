// Fichas da Bach-Gesellschaft-Ausgabe (BGA) — decisão do Pedro (17/10/2026): todas as fichas da BGA, completas e por
// rever, ficam com a edição certa (ver bga.js): volumes inteiros como «Edição crítica» (Jahrgang, editor, ano,
// Breitkopf & Härtel, Leipzig); extractos como «Partitura» de J. S. Bach, com o BWV, o ano do volume e a colecção
// «Johann Sebastian Bach's Werke (Bach-Gesellschaft), Jahrgang NN». O que outra identificação deixou de errado (Open
// Library, RISM, CrossRef, OpenAIRE, JSTOR…) sai e fica escrito na nota para rever. Fichas «A processar» não se tocam.
// Mostra a lista (simulação); com --aplicar (cópia de segurança antes) grava pela API e pede ao serviço que arrume o
// ficheiro (POST reorganizar).
// Uso: node src/bga_fichas.js [--aplicar] [--excluir 1158,2475] [--saida ficheiro.txt]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pb, garantirSessao, copiaDeSeguranca, definicoes, tipos } from './pb.js'
import { PASTAS, PORTA, segredo, BIN } from './config.js'
import { correr } from './extracao.js'
import { reconhecerBga, tituloBga, catalogoEVolume, bwvDoNome, ETIQUETA_BGA, ORIGENS_ERRADAS } from './bga.js'
import { normalizar } from './fontes_externas/util.js'

const aplicar = process.argv.includes('--aplicar')
const opcao = (nome) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? String(process.argv[i + 1] || '') : ''
}
const excluir = new Set(opcao('--excluir').split(',').filter(Boolean).map(Number))
const num = (n) => `#${String(n).padStart(4, '0')}`
const servico = async (acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}
const linhas = []
const escrever = (s = '') => (linhas.push(s), console.log(s))
const ORIGEM_BGA = 'Bach-Gesellschaft (BGA)'

await garantirSessao()
const defs = await definicoes()
const listaTipos = await tipos()
const tipoId = (nome) => listaTipos.find((t) => t.nome === nome)?.id
const tipoNome = (id) => listaTipos.find((t) => t.id === id)?.nome || ''

// ---- 1. Fichas com PDF (ou imagem) e os dados internos do PDF ------------------------------------------------
const todas = await pb.collection('fontes').getFullList({
  filter: "ficheiro ~ '.pdf' || ficheiro ~ '.PDF'",
  fields: 'id,numero,titulo,estado,origem,tipo,autores,data,editora,local,doi,isbn,url,ficheiro,ficheiro_original,ficheiros_extra,metadados,tags,paginas',
  sort: 'numero',
})
console.error(`${todas.length} fichas com PDF; a ler os dados internos dos PDFs…`)

async function emParalelo(lista, n, f) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < lista.length) {
      const x = lista[i++]
      await f(x)
    }
  }))
}
const infoPdf = async (abs) => {
  try {
    const out = await correr(BIN.pdfinfo, ['-enc', 'UTF-8', abs], { timeout: 30000 })
    const d = {}
    for (const l of out.split('\n')) {
      const i = l.indexOf(':')
      if (i > 0) d[l.slice(0, i).trim()] = l.slice(i + 1).trim()
    }
    return { titulo: d.Title || '', autor: d.Author || '', programa: d.Creator || '', produtor: d.Producer || '', paginas: Number(d.Pages) || 0 }
  } catch (_) {
    return null
  }
}
const info = new Map()
const semFicheiro = []
await emParalelo(todas, 8, async (f) => {
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  if (!fs.existsSync(abs)) return semFicheiro.push(f)
  info.set(f.id, await infoPdf(abs))
})

// ---- 2. Primeiro reconhecimento (sem texto) ----------------------------------------------------------------
const md = (f) => f.metadados || {}
const entrada = (f, texto = '') => {
  const i = info.get(f.id) || {}
  return {
    nome: f.ficheiro_original || path.basename(f.ficheiro),
    pdfTitulo: i.titulo || '',
    pdfAutor: i.autor || '',
    programa: i.programa || '',
    produtor: i.produtor || '',
    texto,
    titulo: f.titulo || '',
    // (o nº sugerido pela IA só conta se for o rodapé do volume, «B.W. XXIX»: um BWV inventado não serve)
    catalogo: [md(f).catalogo, catalogoEVolume(md(f).catalogo_ia) ? md(f).catalogo_ia : ''].filter(Boolean),
  }
}
const reconhecidas = new Map()
const paraTexto = []
const eBach = (f) => (f.autores || []).some((a) => /^bach$/i.test(a.apelido || '')) || /\bBWV\s?\d|\bbach\b/i.test(`${f.titulo} ${f.ficheiro_original}`)
for (const f of todas) {
  if (!info.has(f.id)) continue
  const r = reconhecerBga(entrada(f))
  if (r) reconhecidas.set(f.id, r)
  else {
    const i = info.get(f.id) || {}
    // (candidatas ao rodapé «B. W. …»: Bach com BWV conhecido; fora os PDFs do Finale/Sibelius e os grandes)
    const temBwv = bwvDoNome(f.ficheiro_original || '') || bwvDoNome(f.titulo) || [md(f).catalogo, md(f).catalogo_ia].some((c) => c && (catalogoEVolume(c) || bwvDoNome(c)))
    if (eBach(f) && temBwv && (i.paginas || 0) <= 120 && !/Finale|Sibelius|MuseScore|Dorico|LilyPond|PStill/i.test(`${i.programa} ${i.produtor}`)) paraTexto.push(f)
  }
}

// ---- 3. Texto das primeiras páginas (rodapé «B. W. XXVII.», «Bach-Gesellschaft») — OCR guardado em cache ----
const CACHE = path.join(PASTAS.app, 'cache', 'bga-texto.json')
let cache = {}
try {
  cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) || {}
} catch (_) {}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bga-'))
async function textoDe(f) {
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  const st = fs.statSync(abs)
  const chave = `${f.ficheiro_original || ''}|${st.size}`
  if (cache[chave] !== undefined) return cache[chave]
  let t = ''
  try {
    t = await correr(BIN.pdftotext, ['-enc', 'UTF-8', '-l', '2', abs, '-'], { timeout: 60000 })
  } catch (_) {}
  if ((t.match(/[A-Za-z]/g) || []).length < 40) {
    // (sem texto: OCR das 2 primeiras páginas)
    t = ''
    const base = path.join(temp, String(f.numero))
    try {
      await correr(BIN.pdftoppm, ['-f', '1', '-l', '2', '-r', '200', '-gray', '-png', abs, base], { timeout: 120000 })
      for (const img of fs.readdirSync(temp).filter((x) => x.startsWith(`${f.numero}-`)).sort()) {
        const p = path.join(temp, img)
        t += (await correr(BIN.tesseract, [p, 'stdout', '--tessdata-dir', PASTAS.tessdata, '-l', 'deu+eng', '--psm', '3'], { timeout: 120000 })) + '\n'
        fs.rmSync(p, { force: true })
      }
    } catch (_) {}
  }
  cache[chave] = t.slice(0, 20000)
  return cache[chave]
}
console.error(`${reconhecidas.size} reconhecidas pelo nome/dados do PDF; ${paraTexto.length} a ver pelo texto/rodapé…`)
let vistos = 0
await emParalelo(paraTexto, 6, async (f) => {
  const r = reconhecerBga(entrada(f, await textoDe(f)))
  if (r) reconhecidas.set(f.id, r)
  if (++vistos % 50 === 0) {
    console.error(`  ${vistos}/${paraTexto.length}`)
    fs.mkdirSync(path.dirname(CACHE), { recursive: true })
    fs.writeFileSync(CACHE, JSON.stringify(cache))
  }
})
fs.mkdirSync(path.dirname(CACHE), { recursive: true })
fs.writeFileSync(CACHE, JSON.stringify(cache))
fs.rmSync(temp, { recursive: true, force: true })

// ---- 4. A ficha nova de cada uma -------------------------------------------------------------------------------
// Campos de metadados que vêm sempre de uma identificação errada (registo de manuscrito do RISM, artigo, tese, outra edição)
const DE_OUTRA_EDICAO = ['rism', 'rism_serie', 'titulo_uniforme', 'exemplares', 'arquivo', 'cota', 'suporte', 'revista', 'paginas', 'issn', 'numero', 'fasciculo', 'edicao_imslp', 'n_chapa', 'exemplar', 'registo_biblioteca', 'outros_exemplares', 'outras_digitalizacoes', 'urn', 'digitalizacao', 'vd', 'instituicao', 'orientador', 'orientacao', 'grau', 'conteudo', 'compositores', 'isbn']
const nomeAutor = (a) => [a.nome, a.apelido].filter(Boolean).join(' ') || a.literal || ''
const curto = (t, n = 70) => (String(t || '').length > n ? String(t).slice(0, n - 1) + '…' : String(t || ''))
const iniciais = (n) => String(n || '').split(/[\s.]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('')
// (o mesmo compositor com outra grafia: «J.S. Bach» = «Johann Sebastian Bach», «C. P. E. Bach» = «Carl Philipp Emanuel Bach»)
const igualAutor = (a, b) => (a.apelido || '') === (b.apelido || '') && (!a.nome || iniciais(a.nome) === iniciais(b.nome))

function descreverOrigem(f) {
  const m = md(f)
  if (/RISM/i.test(f.origem)) return `RISM${m.rism ? ` ${m.rism}` : ''}${m.arquivo ? `: ${/manuscr|autógrafo/i.test(`${m.suporte || ''} ${m.forma || ''}`) || m.cota ? 'manuscrito ' : ''}${m.arquivo}${m.cota ? ` ${m.cota}` : ''}` : ''}`
  const extra = [f.editora, (f.data || '').slice(0, 4)].filter(Boolean).join(' ')
  return `${f.origem}: «${curto(f.titulo, 60)}»${extra ? `, ${extra}` : ''}`
}

async function fichaNova(f, r) {
  const m0 = md(f)
  // (página do IMSLP de outro compositor — Hasse, Perti, Zimpel… — também é identificação errada)
  // («(Bach, Wilhelm Friedemann)» também é outro compositor: na família Bach conta o nome próprio)
  const compositorDoUrl = (u) => {
    const x = /\(([^,()]+),([^()]*)\)$/.exec(decodeURIComponent(String(u || '').replace(/_/g, ' ')))
    if (!x) return ''
    return normalizar(x[1]) === 'bach' ? `bach ${normalizar(x[2])}` : normalizar(x[1])
  }
  const urlImslp = [f.url, m0.imslp].find((u) => /imslp\.org/i.test(u || ''))
  const novo = r.campos.autores?.[0] || {}
  const novoApelido = normalizar(novo.apelido || '') === 'bach' ? `bach ${normalizar(novo.nome || '')}` : normalizar(novo.apelido || '')
  const imslpErrado = !!urlImslp && !!novoApelido && !!compositorDoUrl(urlImslp) && compositorDoUrl(urlImslp) !== novoApelido
  const origemErrada = ORIGENS_ERRADAS.test(f.origem || '') || (/imslp/i.test(f.origem || '') && imslpErrado)
  const notas = []
  const m = { ...m0 }
  const alt = {}
  const c = r.campos
  if (r.tipo === 'nba') {
    // (só a colecção e a nota; sem dados para confirmar)
    if (c.metadados.colecao && !m.colecao) m.colecao = c.metadados.colecao
    if (c.metadados.catalogo && !m.catalogo) m.catalogo = c.metadados.catalogo
    m.nota_revisao = [r.motivo, m0.nota_revisao && !String(r.motivo).includes(m0.nota_revisao) ? `(Nota anterior: ${m0.nota_revisao})` : ''].filter(Boolean).join(' ')
    return { alt: { metadados: m, estado: 'a_rever' }, notas: [r.motivo], titulo: f.titulo }
  }
  const banda = r.banda ? `Jahrgang ${String(r.banda).replace('_', '.')}` : 'BGA'
  if (origemErrada) {
    notas.push(`Identificação anterior retirada (${descreverOrigem(f)}${imslpErrado ? `, página de ${(/\(([^()]+)\)$/.exec(decodeURIComponent(String(urlImslp).replace(/_/g, ' '))) || [])[1] || 'outro compositor'}` : ''}) — é a BGA, ${r.tipo === 'volume' && r.banda === '47' ? 'Supplement (1926)' : banda}.`)
    for (const k of DE_OUTRA_EDICAO) delete m[k]
    if (!/imslp/i.test(f.origem)) delete m.titulo_fonte
    if (f.doi) alt.doi = ''
    if (f.isbn) alt.isbn = ''
    if (f.url && (!/imslp\.org/i.test(f.url) || imslpErrado)) alt.url = ''
    if (imslpErrado) for (const k of ['imslp', 'data_composicao', 'instrumentacao', 'tonalidade', 'titulo_fonte']) delete m[k]
  } else {
    // (de outra edição mesmo sem origem errada: um RISM, uma edição do IMSLP, o volume de uma revista)
    for (const k of ['rism', 'rism_serie', 'titulo_uniforme', 'arquivo', 'cota', 'suporte', 'edicao_imslp', 'revista', 'instituicao', 'orientacao']) delete m[k]
    if (f.url && (/rism\.online/i.test(f.url) || imslpErrado)) alt.url = ''
    if (imslpErrado && m.imslp === urlImslp) delete m.imslp
    if (m0.edicao_imslp && !/Bach-?Gesellschaft|Breitkopf/i.test(m0.edicao_imslp)) notas.push(`Edição do IMSLP retirada («${curto(m0.edicao_imslp, 60)}») — é a BGA, ${banda}.`)
  }
  // Outro autor (nome do ficheiro / atribuição actual): se a ficha já o tem, fica o da ficha
  if (r.outroAutor) {
    const ap = (x) => normalizar(x).slice(0, 6)
    const ja = (f.autores || []).filter((a) => a.apelido && ap(a.apelido) === ap(r.outroAutor.apelido) && (normalizar(a.apelido) !== 'bach' || iniciais(a.nome) === iniciais(r.outroAutor.nome)))
    if (ja.length) c.autores = ja
  }
  // Compositor
  const antigos = (f.autores || []).filter((a) => !['editor', 'intérprete', 'tradutor'].includes(a.papel))
  const fora = antigos.filter((a) => !c.autores.some((b) => igualAutor(a, b)))
  if (fora.length) notas.push(`Compositor anterior retirado (${fora.map(nomeAutor).join('; ')}).`)
  // Nº de catálogo
  const catNovo = c.metadados.catalogo || ''
  if (m0.catalogo && catalogoEVolume(m0.catalogo)) notas.push(`O nº de catálogo «${m0.catalogo}» era o volume da BGA, não o BWV.`)
  else if (m0.catalogo && catNovo && m0.catalogo.replace(/\s/g, '') !== catNovo.replace(/\s/g, '') && r.tipo === 'extracto') notas.push(`Nº de catálogo «${m0.catalogo}» corrigido para «${catNovo}» (nome do ficheiro).`)
  if (m.catalogo_ia && (catalogoEVolume(m.catalogo_ia) || m.catalogo_ia.replace(/\s/g, '') === catNovo.replace(/\s/g, ''))) delete m.catalogo_ia
  if (r.tipo === 'volume') delete m.catalogo_ia
  Object.assign(m, c.metadados)
  if (r.tipo === 'extracto') delete m.volume
  if (r.tipo === 'volume') m.forma = 'Impresso'
  // Título
  let titulo = c.titulo
  let deOnde = 'BGA'
  if (r.tipo === 'extracto') {
    const t = await tituloBga(r, { tituloAtual: f.titulo, origemErrada, nome: f.ficheiro_original || path.basename(f.ficheiro), email: defs.email_contacto })
    titulo = t.titulo
    deOnde = t.de
    if (t.obra) {
      if (t.obra.url) m.imslp = t.obra.url
      if (t.obra.tonalidade && !m.tonalidade) m.tonalidade = t.obra.tonalidade
      if (t.obra.instrumentacao && !m.instrumentacao) m.instrumentacao = t.obra.instrumentacao
      if (t.obra.data_composicao && !m.data_composicao) m.data_composicao = t.obra.data_composicao
    }
  }
  // (o cabeçalho que a IA leu na página passa a «Título na fonte», se ainda não houver)
  if (titulo !== f.titulo && !m.titulo_fonte && !origemErrada && /^(IA local|ficheiro|capa do PDF)?$/.test(f.origem || '') && f.titulo && !/^Johann Sebastian Bach'?s Werke\.?$/i.test(f.titulo)) m.titulo_fonte = f.titulo
  for (const n of r.notas) notas.push(n)
  if (r.motivo) notas.unshift(r.motivo)
  if (r.tipo === 'extracto' && r.completa && r.pistas.every((p) => /^rodapé/.test(p))) notas.push('Identificada só pelo rodapé «B. W. …» da BGA (as reimpressões Dover/Kalmus têm as mesmas chapas).')
  // (a nota antiga nunca se perde: fica a seguir à nova, marcada como anterior)
  const antiga = String(m0.nota_revisao || '').trim()
  const nova = notas.join(' ')
  if (nova || antiga) m.nota_revisao = [nova, antiga && !nova.includes(antiga) ? `(Nota anterior: ${antiga})` : ''].filter(Boolean).join(' ')
  const estado = r.completa ? 'completo' : 'a_rever'
  let tags = [...new Set([...(f.tags || []), ETIQUETA_BGA])]
  if (estado === 'completo') tags = tags.filter((t) => t !== 'por confirmar')
  Object.assign(alt, {
    titulo,
    tipo: tipoId(c.tipoNome),
    autores: r.tipo === 'volume' ? c.autores : [...c.autores, ...(f.autores || []).filter((a) => ['intérprete'].includes(a.papel))],
    editora: c.editora,
    local: c.local,
    ...(c.data ? { data: c.data } : {}),
    metadados: m,
    tags,
    estado,
    origem: ORIGEM_BGA,
    ...(estado === 'completo' ? { candidatos: [] } : {}),
  })
  return { alt, notas, titulo, deOnde }
}

// ---- 5. Grupos -------------------------------------------------------------------------------------------------
const porId = new Map(todas.map((f) => [f.id, f]))
const itens = []
const processando = []
for (const [id, r] of reconhecidas) {
  const f = porId.get(id)
  if (f.estado === 'processando') {
    processando.push({ f, r })
    continue
  }
  itens.push({ f, r })
}
itens.sort((a, b) => a.f.numero - b.f.numero)
console.error(`A preparar ${itens.length} fichas (títulos do IMSLP quando é preciso)…`)
for (const it of itens) Object.assign(it, await fichaNova(it.f, it.r))

const grupos = { A: [], B: [], C: [], D: [], N: [] }
for (const it of itens) {
  if (it.r.tipo === 'volume') grupos.A.push(it)
  else if (it.r.tipo === 'nba' || it.alt.estado !== 'completo') grupos.D.push(it)
  else if (it.f.estado === 'completo') grupos.C.push(it)
  else grupos.B.push(it)
}

const autoresTxt = (l) => (l || []).map((a) => nomeAutor(a) + (a.papel === 'editor' ? ' (ed.)' : '')).join('; ') || '—'
function mostrar(it, { diferencas = true } = {}) {
  const { f, r, alt } = it
  const antes = `${tipoNome(f.tipo)} | ${f.estado} | ${f.origem || '—'} | «${curto(f.titulo, 80)}» | ${autoresTxt(f.autores)} | ${f.data || 's.d.'} | ${f.editora || '—'} | cat. ${md(f).catalogo || '—'}`
  const depois = `${tipoNome(alt.tipo) || tipoNome(f.tipo)} | ${alt.estado} | «${curto(alt.titulo ?? f.titulo, 80)}» | ${autoresTxt(alt.autores ?? f.autores)} | ${alt.data || f.data || 's.d.'} | cat. ${alt.metadados.catalogo || '—'} | ${alt.metadados.colecao || ''}`
  escrever(`${num(f.numero)} ${f.ficheiro_original || path.basename(f.ficheiro)}${excluir.has(f.numero) ? '  (EXCLUÍDA)' : ''}`)
  escrever(`     antes:  ${antes}`)
  escrever(`     depois: ${depois}`)
  escrever(`     indícios: ${r.pistas.join('; ') || '—'}${it.deOnde && it.deOnde !== 'BGA' ? `; título: ${it.deOnde}` : ''}`)
  if (diferencas) {
    const sai = []
    for (const k of DE_OUTRA_EDICAO.concat(['titulo_fonte', 'catalogo_ia', 'edicao_imslp'])) if (md(f)[k] !== undefined && alt.metadados[k] === undefined) sai.push(`${k}=${curto(typeof md(f)[k] === 'string' ? md(f)[k] : JSON.stringify(md(f)[k]), 40)}`)
    for (const k of ['doi', 'isbn', 'url']) if (alt[k] === '' && f[k]) sai.push(`${k}=${curto(f[k], 40)}`)
    if (sai.length) escrever(`     sai: ${sai.join(' · ')}`)
  }
  if (alt.metadados.nota_revisao) escrever(`     nota: ${alt.metadados.nota_revisao}`)
}

const contar = (l, k) => l.reduce((m, x) => m.set(k(x), (m.get(k(x)) || 0) + 1), new Map())
escrever(`BGA — Bach-Gesellschaft-Ausgabe: ${itens.length + processando.length} fichas reconhecidas (${todas.length} fichas com PDF vistas)`)
escrever(`  A) volumes inteiros: ${grupos.A.length}`)
escrever(`  B) extractos por rever que ficam completos: ${grupos.B.length}`)
escrever(`  C) extractos já completos, corrigidos: ${grupos.C.length}`)
escrever(`  D) ficam por rever: ${grupos.D.length}`)
escrever(`  E) de fora: ${processando.length} «A processar» (não se tocam) + ver fim da lista`)
escrever(`  Indícios: ${[...contar(itens, (x) => [...new Set(x.r.pistas.map((p) => p.replace(/[:(].*/, '').trim()))].join(' + ') || '—')].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
escrever(`\n===== A) VOLUMES INTEIROS (${grupos.A.length}) =====`)
for (const it of grupos.A) mostrar(it)
escrever(`\n===== B) EXTRACTOS QUE FICAM COMPLETOS (estavam por rever) (${grupos.B.length}) =====`)
for (const it of grupos.B) mostrar(it)
escrever(`\n===== C) COMPLETAS ANTIGAS CORRIGIDAS (${grupos.C.length}) =====`)
for (const it of grupos.C) mostrar(it)
escrever(`\n===== D) FICAM POR REVER (${grupos.D.length}) =====`)
for (const it of grupos.D) mostrar(it)
escrever(`\n===== E) DE FORA =====`)
escrever(`«A processar» (não se tocam; correr outra vez quando saírem da fila): ${processando.length}`)
for (const { f, r } of processando) escrever(`  ${num(f.numero)} ${f.ficheiro_original} — BGA ${r.banda || ''} ${r.bwv.join(', ')}`)
escrever(`Fichas sem ficheiro no disco (não vistas): ${semFicheiro.length}`)
// (o que parece Bach/BWV e não é da BGA: só contagens, e as que têm algum indício solto)
const naoBga = todas.filter((f) => info.has(f.id) && !reconhecidas.has(f.id) && eBach(f))
const reducao = naoBga.filter((f) => /Church Cantatas|bh2000/i.test(`${(info.get(f.id) || {}).titulo} ${(info.get(f.id) || {}).autor}`))
const corais = naoBga.filter((f) => !reducao.includes(f) && /^0\d{5}[a-z]?\.pdf$/i.test(f.ficheiro_original || '') || /jsbchorales|Greentree/i.test(JSON.stringify(f.autores || []) + (f.editora || '')))
escrever(`Bach/BWV que não são da BGA: ${naoBga.length} (reduções «J.S. Bach – Church Cantatas» ${reducao.length}; corais de 1 página/Greentree ${corais.length}; outras ${naoBga.length - reducao.length - corais.length})`)
const soltos = naoBga.filter((f) => /\bBGA\b|Gesellschaft|NBA/i.test(`${f.ficheiro_original} ${f.titulo}`) || catalogoEVolume(md(f).catalogo) || catalogoEVolume(md(f).catalogo_ia))
escrever(`Com algum indício solto, mas sem confirmação (ficam como estão): ${soltos.length}`)
for (const f of soltos) escrever(`  ${num(f.numero)} ${f.ficheiro_original} | «${curto(f.titulo, 60)}» | cat. ${md(f).catalogo || md(f).catalogo_ia || '—'} | PDF: ${(info.get(f.id) || {}).titulo || '—'}`)

const guardar = (nome) => {
  const destino = opcao('--saida') || path.join(PASTAS.app, 'registos', nome)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, linhas.join('\n') + '\n')
  console.log(`\nLista guardada em ${destino}`)
}
const hoje = new Date().toISOString().slice(0, 10)
if (!aplicar) {
  escrever(`\n(simulação: nada foi alterado; para aplicar: --aplicar)`)
  guardar(`bga-simulacao-${hoje}.txt`)
  process.exit(0)
}

// ---- 6. Aplicar ------------------------------------------------------------------------------------------------
escrever(`\nCópia de segurança: ${await copiaDeSeguranca('antes-bga')}`)
let feitas = 0
let saltadas = 0
for (const it of itens) {
  const { f, alt } = it
  if (excluir.has(f.numero)) continue
  try {
    const atual = await pb.collection('fontes').getOne(f.id)
    if (atual.estado === 'processando' || atual.ficheiro !== f.ficheiro) {
      escrever(`${num(f.numero)}: entretanto mudou (a processar ou ficheiro movido) — saltada`)
      saltadas++
      continue
    }
    await pb.collection('fontes').update(f.id, alt)
    const final = await servico('reorganizar', { id: f.id })
    escrever(`${num(f.numero)} ${alt.estado === 'completo' ? 'completa' : 'por rever'}: ${final.ficheiro}`)
    feitas++
  } catch (e) {
    escrever(`${num(f.numero)}: ERRO ${e.message}`)
    saltadas++
  }
}
escrever(`\n${feitas} fichas tratadas, ${saltadas} saltadas.`)
guardar(`bga-aplicado-${hoje}.txt`)
