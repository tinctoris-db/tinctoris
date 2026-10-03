// PDFs duplicados "quase iguais": o mesmo documento com bytes diferentes (gravado de novo, outro nome,
// metadados internos diferentes, uma capa ou página em branco a mais). Os exatamente iguais já são postos
// de lado à entrada (hash); estes não.
//
// Método: cada página é reduzida a uma "impressão digital" do seu aspeto (uma grelha de claro/escuro,
// com o pdftoppm). Dois PDFs são candidatos se a 1.ª ou a última página coincidem e o nº de páginas é
// igual ou difere em 1–2 (capa, página em branco). Depois comparam-se as páginas 1, 2, 3, do meio,
// penúltima e última (admitindo o deslocamento das páginas a mais) e, por fim, a 1.ª e a do meio em
// alta resolução, que distingue partes diferentes da mesma peça (Cantus/Altus, Recorder I/II).
//   "certo":    mesmo nº de páginas, todas as comparadas iguais nas duas resoluções → junta-se sozinho
//   "duvidoso": muito parecidos (ou com páginas a mais) → o Pedro decide no ecrã "Duplicados"
//
// Juntar = fica a ficha mais completa; da outra passam as notas de leitura, etiquetas, contextos, o nome
// do ficheiro (nomes_alternativos) e o texto integral (se faltar); o ficheiro repetido vai para
// biblioteca/_duplicados (nunca é apagado) e a ficha repetida deixa de existir.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { PASTAS, DUPLICADOS, BIN } from './config.js'
import { pb, garantirSessao } from './pb.js'
import * as F from './ficheiros.js'
import { log } from './registo.js'
import { juntarOriginais } from './juntar.js'

const CACHE = path.join(PASTAS.app, 'cache', 'impressoes-pdf.json') // (pelo conteúdo: serve à cópia de teste e à real)
const REVISAO = path.join(PASTAS.dados, 'duplicados.json')

// Limites (medidos na biblioteca a 30/9/2026: cópias verdadeiras ficam abaixo de ~20 / ~45; partes
// diferentes da mesma peça ficam acima de ~80 / ~130)
const BAIXA = { altura: 200, n: 32 } // 2 × 32 × 32 = 2048 bits
const ALTA = { altura: 800, n: 64 } // 8192 bits
const CANDIDATO = 100 // bits diferentes (em 2048) na 1.ª ou última página para ser candidato
const CERTO_BAIXA = 20
const CERTO_ALTA = 50 // (em 8192)
const DUVIDOSO_ALTA = 120 // (acima: quase sempre partes ou edições diferentes da mesma obra)
const PAGINAS_A_MAIS = 2
// Com páginas a mais, só o que tem pelo menos 2 páginas e é mesmo parecido (um PDF de 1 página "cabe"
// numa página quase vazia de qualquer outro)
const A_MAIS_BAIXA = 40

const numeroFmt = (n) => '#' + String(n).padStart(4, '0')
const chavePar = (a, b) => [a, b].sort().join('|')

// ---------------------------------------------------------------------------
// Impressões digitais das páginas

function correr(args, timeout = 180000) {
  return new Promise((ok) => {
    const p = spawn('nice', ['-n', '15', ...args])
    const partes = []
    const t = setTimeout(() => p.kill('SIGKILL'), timeout)
    p.stdout.on('data', (d) => partes.push(d))
    p.stderr.on('data', () => {})
    p.on('error', () => (clearTimeout(t), ok(null)))
    p.on('close', (codigo) => (clearTimeout(t), ok(codigo === 0 ? Buffer.concat(partes) : null)))
  })
}

// Imagem PGM (cinzento) → { w, h, px }
function lerPgm(b) {
  if (!b || b.length < 10 || b[0] !== 0x50 || b[1] !== 0x35) return null
  const campos = []
  let i = 2
  while (campos.length < 3) {
    while (/\s/.test(String.fromCharCode(b[i]))) i++
    if (b[i] === 0x23) {
      while (b[i] !== 0x0a) i++
      continue
    }
    let j = i
    while (!/\s/.test(String.fromCharCode(b[j]))) j++
    campos.push(Number(b.subarray(i, j).toString()))
    i = j
  }
  const [w, h] = campos
  return { w, h, px: b.subarray(i + 1, i + 1 + w * h) }
}

// Grelha (n+1)×(n+1) de médias; bits = cada célula é mais clara do que a da direita / a de baixo
function impressao({ w, h, px }, n) {
  const N = n + 1
  const g = new Float64Array(N * N)
  for (let y = 0; y < N; y++) {
    const y0 = Math.floor((y * h) / N)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / N))
    for (let x = 0; x < N; x++) {
      const x0 = Math.floor((x * w) / N)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / N))
      let s = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0, o = yy * w; xx < x1; xx++) s += px[o + xx]
      g[y * N + x] = s / ((y1 - y0) * (x1 - x0))
    }
  }
  const bits = new Uint32Array((2 * n * n) / 32)
  let k = 0
  const por = (v) => {
    if (v) bits[k >> 5] |= 1 << (31 - (k & 31))
    k++
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) por(g[y * N + x] > g[y * N + x + 1])
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) por(g[y * N + x] > g[(y + 1) * N + x])
  return Buffer.from(bits.buffer).toString('hex')
}

const palavras = new Map()
function emPalavras(hex) {
  let p = palavras.get(hex)
  if (!p) {
    const b = Buffer.from(hex, 'hex')
    p = new Uint32Array(b.buffer, b.byteOffset, b.length / 4)
    palavras.set(hex, p)
  }
  return p
}
function diferenca(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  const x = emPalavras(a)
  const y = emPalavras(b)
  let d = 0
  for (let i = 0; i < x.length; i++) {
    let v = x[i] ^ y[i]
    v -= (v >>> 1) & 0x55555555
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
    d += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
  }
  return d
}

let cache = null
let cacheMudou = 0
function lerCache() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    } catch (_) {
      cache = {}
    }
  }
  return cache
}
async function gravarCache(forcar) {
  if (!cache || !cacheMudou || (!forcar && cacheMudou < 200)) return
  cacheMudou = 0
  await fsp.mkdir(path.dirname(CACHE), { recursive: true })
  await fsp.writeFile(CACHE + '.tmp', JSON.stringify(cache))
  await fsp.rename(CACHE + '.tmp', CACHE)
}

async function contarPaginas(abs) {
  const out = await correr([BIN.pdfinfo, abs], 60000)
  return Number((/Pages:\s+(\d+)/.exec(String(out || '')) || [])[1]) || 0
}

// Impressão de uma página de um documento (d = { abs, chave }), em baixa ou alta resolução
async function pagina(d, p, res = BAIXA) {
  const c = lerCache()
  const e = (c[d.chave] ||= {})
  const campo = res === ALTA ? 'a' : 'b'
  const tabela = (e[campo] ||= {})
  if (p in tabela) return tabela[p]
  const img = lerPgm(await correr([BIN.pdftoppm, '-gray', '-scale-to', String(res.altura), '-f', String(p), '-l', String(p), d.abs]))
  tabela[p] = img ? impressao(img, res.n) : null
  cacheMudou++
  return tabela[p]
}

// Corre fn sobre a lista, com até `n` ao mesmo tempo
async function emParalelo(lista, n, fn) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < lista.length) {
        const k = i++
        await fn(lista[k], k)
      }
    })
  )
}

// ---------------------------------------------------------------------------
// Procurar

// Títulos das duas fichas compatíveis? (metade das palavras do mais curto no outro). O mesmo PDF em fichas
// com títulos diferentes quer dizer que uma delas tem o ficheiro errado (ex.: uma referência do Mendeley a
// que se associou outro PDF): isso decide o Pedro, não se junta sozinho
const palavrasDe = (t) => new Set(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])
function titulosCompativeis(x, y) {
  const a = palavrasDe(x)
  const b = palavrasDe(y)
  if (!a.size || !b.size) return true // (sem palavras: títulos lidos da pauta, "œœ.œjœœ")
  let comuns = 0
  for (const w of a) if (b.has(w)) comuns++
  return comuns / Math.min(a.size, b.size) >= 0.5
}

// Compara a (n páginas) com b (n + d páginas): para cada página de amostra de a, a mais parecida de b
// entre k e k+d, sem voltar atrás (as páginas a mais podem estar no início, no meio ou no fim)
async function comparar(a, b) {
  const n = a.n
  const d = b.n - a.n
  const amostra = [...new Set([1, 2, 3, Math.ceil(n / 2), n - 1, n])].filter((k) => k >= 1 && k <= n).sort((x, y) => x - y)
  const baixa = []
  const pares = []
  let o = 0
  for (const k of amostra) {
    const ha = await pagina(a, k)
    let melhor = Infinity
    let melhorO = o
    for (let oo = o; oo <= d; oo++) {
      const dist = diferenca(ha, await pagina(b, k + oo))
      if (dist < melhor) (melhor = dist), (melhorO = oo)
    }
    o = melhorO
    baixa.push(melhor)
    pares.push([k, k + o])
    if (melhor > CANDIDATO) return { baixa: Math.max(...baixa), alta: Infinity }
  }
  // Alta resolução: 1.ª página e a do meio
  const meio = pares[amostra.indexOf(Math.ceil(n / 2))]
  const alta = []
  for (const [ka, kb] of meio[0] === 1 ? [pares[0]] : [pares[0], meio]) alta.push(diferenca(await pagina(a, ka, ALTA), await pagina(b, kb, ALTA)))
  return { baixa: Math.max(...baixa), alta: Math.max(...alta), deslocamento: o }
}

// Procura em todos os PDFs com ficha. Devolve { certos: [[id, id…]…], duvidosos: [par…], vistos }
export async function procurar({ aoProgresso = () => {} } = {}) {
  await garantirSessao()
  const fichas = (await pb.collection('fontes').getFullList({ filter: "ficheiro ~ '.pdf'", fields: 'id,numero,titulo,estado,ficheiro,hash,paginas,ficheiros_extra' }))
    .filter((f) => /\.pdf$/i.test(f.ficheiro))
  const docs = []
  let fase = 'A ler a 1.ª e a última página de cada PDF'
  await emParalelo(fichas, 4, async (f, i) => {
    const abs = path.join(PASTAS.biblioteca, f.ficheiro)
    let tamanho
    try {
      tamanho = fs.statSync(abs).size
    } catch (_) {
      return
    }
    const chave = `${f.hash || f.ficheiro}:${tamanho}`
    const c = lerCache()
    const n = c[chave]?.n || f.paginas || (await contarPaginas(abs))
    if (!n) return
    ;(c[chave] ||= {}).n = n
    const d = { id: f.id, numero: f.numero, titulo: f.titulo, abs, chave, n, extra: !!f.ficheiros_extra?.length, estado: f.estado }
    d.primeira = await pagina(d, 1)
    d.ultima = n > 1 ? await pagina(d, n) : d.primeira
    if (d.primeira) docs.push(d)
    if (i % 100 === 0) aoProgresso(fase, i, fichas.length)
    await gravarCache()
  })
  await gravarCache(true)

  // Candidatos: 1.ª ou última página parecidas, nº de páginas igual ou com 1–2 a mais
  const porN = new Map()
  for (const d of docs) porN.set(d.n, [...(porN.get(d.n) || []), d])
  const candidatos = []
  for (const a of docs) {
    for (let dd = 0; dd <= PAGINAS_A_MAIS; dd++) {
      for (const b of porN.get(a.n + dd) || []) {
        if ((dd === 0 && b.id <= a.id) || a.abs === b.abs) continue
        if (diferenca(a.primeira, b.primeira) <= CANDIDATO || diferenca(a.ultima, b.ultima) <= CANDIDATO) candidatos.push([a, b])
      }
    }
  }

  fase = 'A comparar os pares parecidos página a página'
  const certos = []
  const duvidosos = []
  await emParalelo(candidatos, 4, async ([a, b], i) => {
    const r = await comparar(a, b)
    if (i % 50 === 0) aoProgresso(fase, i, candidatos.length)
    await gravarCache()
    if (r.alta > DUVIDOSO_ALTA) return
    if (a.n !== b.n && (a.n < 2 || r.baixa > A_MAIS_BAIXA)) return
    const par = { a: a.id, b: b.id, paginas: [a.n, b.n], baixa: r.baixa, alta: r.alta, deslocamento: r.deslocamento }
    if (!titulosCompativeis(a.titulo, b.titulo)) par.titulos_diferentes = true
    if (a.n === b.n && r.baixa <= CERTO_BAIXA && r.alta <= CERTO_ALTA && !a.extra && !b.extra && !par.titulos_diferentes) certos.push(par)
    else duvidosos.push(par)
  })
  await gravarCache(true)

  // Grupos de iguais (A=B e B=C → A, B, C)
  const pai = new Map()
  const raiz = (x) => {
    while (pai.get(x) !== x) x = pai.get(x)
    return x
  }
  for (const { a, b } of certos) {
    for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x)
    pai.set(raiz(a), raiz(b))
  }
  const grupos = new Map()
  for (const x of pai.keys()) grupos.set(raiz(x), [...(grupos.get(raiz(x)) || []), x])
  // (um par duvidoso dentro de um grupo de certos já não interessa)
  const noMesmoGrupo = (p) => pai.has(p.a) && pai.has(p.b) && raiz(p.a) === raiz(p.b)
  return { certos: [...grupos.values()], pares: certos, duvidosos: duvidosos.filter((p) => !noMesmoGrupo(p)), vistos: docs.length }
}

// ---------------------------------------------------------------------------
// Escolher a ficha que fica e juntar

// Pontuação: completa > por rever; com notas de leitura, autores, data, contextos…; empate → a mais antiga
function pontos(f, notas) {
  let p = { completo: 1000, a_rever: 500 }[f.estado] || 0
  p += 100 * (notas || 0)
  if (f.autores?.length) p += 50
  if (f.ano || f.data) p += 30
  if (f.contextos?.length) p += 40
  for (const k of ['doi', 'isbn', 'editora', 'local', 'url']) if (f[k]) p += 20
  if (f.tags?.length) p += 10
  if (f.origem && f.origem !== 'ficheiro') p += 50
  if (/Mendeley/i.test(f.origem || '')) p += 300 // (a referência do Mendeley é a do Pedro)
  return p
}

async function contarNotas(id) {
  return (await pb.collection('notas_leitura').getList(1, 1, { filter: pb.filter('fonte = {:f}', { f: id }), fields: 'id' })).totalItems
}

export async function escolherPrincipal(ids) {
  const fichas = []
  for (const id of ids) {
    const f = await pb.collection('fontes').getOne(id)
    fichas.push({ f, p: pontos(f, await contarNotas(id)) })
  }
  fichas.sort((x, y) => y.p - x.p || x.f.numero - y.f.numero)
  return fichas.map((x) => x.f)
}

const nomesAlternativos = (f) => String(f.metadados?.nomes_alternativos || '').split(' | ').filter(Boolean)
const referencias = (s) => String(s || '').match(/#\d+/g) || []

// Retira a ficha `retirarId` (repetida) a favor de `manterId`. Devolve { manter, retirada, guardado_em }
export async function juntarDuplicado(manterId, retirarId) {
  await garantirSessao()
  if (manterId === retirarId) throw new Error('As duas fichas são a mesma.')
  const manter = await pb.collection('fontes').getOne(manterId)
  const retirar = await pb.collection('fontes').getOne(retirarId)
  for (const f of [manter, retirar]) {
    if (f.estado === 'processando') throw new Error(`A ficha ${numeroFmt(f.numero)} está a ser processada. Tente daqui a pouco.`)
  }
  if (retirar.ficheiros_extra?.length) throw new Error(`A ficha ${numeroFmt(retirar.numero)} tem vários ficheiros: junte-a à mão ("Juntar outras fichas a esta…").`)

  // 1. O que passa para a ficha que fica
  const md = { ...(manter.metadados || {}) }
  const nomes = [...new Set([...nomesAlternativos(manter), retirar.ficheiro_original, ...nomesAlternativos(retirar)])].filter((n) => n && n !== manter.ficheiro_original)
  if (nomes.length) md.nomes_alternativos = nomes.slice(-8).join(' | ')
  // (transcrições MIDI ligadas a um dos PDFs: a ligação passa para o que fica)
  for (const k of ['transcricao_midi', 'transcricao']) {
    const refs = [...new Set([...referencias(md[k]), ...referencias(retirar.metadados?.[k])])]
    if (refs.length && retirar.metadados?.[k]) md[k] = refs.join(', ')
  }
  // (fotografias originais da repetida: a ficha que fica passa a apontar também para elas)
  if (retirar.metadados?.originais) {
    md.originais = juntarOriginais(md.originais, retirar.metadados.originais)
    md.originais_conjunto = juntarOriginais(md.originais_conjunto, retirar.metadados.originais_conjunto)
  }
  const alt = {
    tags: [...new Set([...(manter.tags || []), ...(retirar.tags || [])])],
    contextos: [...new Set([...(manter.contextos || []), ...(retirar.contextos || [])])],
  }
  // Uma ficha repetida completa pode ter dados que a outra não tem (só se preenche o que está vazio)
  if (retirar.estado === 'completo') {
    for (const k of ['doi', 'isbn', 'editora', 'local', 'url', 'natureza', 'data']) if (!manter[k] && retirar[k]) alt[k] = retirar[k]
    if (!manter.ano && retirar.ano) alt.ano = retirar.ano
    if (!manter.autores?.length && retirar.autores?.length) alt.autores = retirar.autores
    for (const [k, v] of Object.entries(retirar.metadados || {})) {
      if (!['nomes_alternativos', 'duplicados_retirados', 'herdado_de', 'transcricao_midi', 'transcricao', 'originais', 'originais_conjunto'].includes(k) && !(k in md) && v !== '' && v !== null) md[k] = v
    }
  }
  const notas = await pb.collection('notas_leitura').getFullList({ filter: pb.filter('fonte = {:f}', { f: retirar.id }), fields: 'id' })
  const texto = async (id) => {
    try {
      return await pb.collection('textos').getFirstListItem(pb.filter('fonte = {:f}', { f: id }), { fields: 'id' })
    } catch (_) {
      return null
    }
  }
  const textoRetirar = (await texto(manter.id)) ? null : await texto(retirar.id)

  // 2. O ficheiro repetido vai para _duplicados
  const abs = retirar.ficheiro ? path.join(PASTAS.biblioteca, retirar.ficheiro) : null
  let destino = null
  if (abs && fs.existsSync(abs) && retirar.ficheiro !== manter.ficheiro) destino = await F.mover(abs, path.join(PASTAS.biblioteca, DUPLICADOS), path.basename(abs))
  const guardado = destino ? path.relative(PASTAS.biblioteca, destino).split(path.sep).join('/') : ''
  md.duplicados_retirados = [
    ...(md.duplicados_retirados || []),
    { numero: numeroFmt(retirar.numero), titulo: retirar.titulo, ficheiro_original: retirar.ficheiro_original || '', guardado_em: guardado, quando: new Date().toISOString().slice(0, 10) },
  ]

  // 3. Gravar a ficha que fica; só depois mudar notas/texto/ligações e apagar a repetida
  // (se algo falhar antes de apagar, o ficheiro volta ao sítio: nunca fica uma ficha sem ficheiro)
  try {
    if (textoRetirar && manter.ocr_estado !== 'feito' && retirar.ocr_estado === 'feito') alt.ocr_estado = 'feito'
    await pb.collection('fontes').update(manter.id, { ...alt, metadados: md })
    for (const n of notas) await pb.collection('notas_leitura').update(n.id, { fonte: manter.id })
    if (textoRetirar) await pb.collection('textos').update(textoRetirar.id, { fonte: manter.id })
    const herdeiros = await pb.collection('fontes').getFullList({ filter: pb.filter('metadados.herdado_de = {:n}', { n: numeroFmt(retirar.numero) }), fields: 'id,metadados' })
    for (const h of herdeiros) await pb.collection('fontes').update(h.id, { metadados: { ...h.metadados, herdado_de: numeroFmt(manter.numero) } })
    await pb.collection('fontes').delete(retirar.id)
  } catch (e) {
    if (destino) await F.mover(destino, path.dirname(abs), path.basename(abs)).catch(() => {})
    throw e
  }
  log.info(`Duplicado ${numeroFmt(retirar.numero)} retirado a favor de ${numeroFmt(manter.numero)} «${manter.titulo}»${guardado ? `: ficheiro em ${guardado}` : ''}`)
  await esquecerPares([retirar.id])
  return { manter: numeroFmt(manter.numero), retirada: numeroFmt(retirar.numero), titulo: retirar.titulo, guardado_em: guardado }
}

// ---------------------------------------------------------------------------
// Lista para o ecrã "Duplicados" (pares duvidosos e o que o Pedro já decidiu)

export function lerRevisao() {
  try {
    return JSON.parse(fs.readFileSync(REVISAO, 'utf8'))
  } catch (_) {
    return { gerado_em: null, pares: [], decididos: {} }
  }
}

async function gravarRevisao(r) {
  await fsp.mkdir(path.dirname(REVISAO), { recursive: true })
  await fsp.writeFile(REVISAO + '.tmp', JSON.stringify(r, null, 1))
  await fsp.rename(REVISAO + '.tmp', REVISAO)
}

// (novos pares substituem os antigos; as decisões "são diferentes" mantêm-se entre procuras)
export async function guardarDuvidosos(pares) {
  const r = lerRevisao()
  r.gerado_em = new Date().toISOString()
  r.pares = pares.filter((p) => !r.decididos[chavePar(p.a, p.b)])
  await gravarRevisao(r)
  return r.pares.length
}

async function esquecerPares(ids) {
  const r = lerRevisao()
  const antes = r.pares.length
  r.pares = r.pares.filter((p) => !ids.includes(p.a) && !ids.includes(p.b))
  if (r.pares.length !== antes) await gravarRevisao(r)
}

// Pares por decidir, com um resumo de cada ficha
export async function paraRever() {
  await garantirSessao()
  const r = lerRevisao()
  const ids = [...new Set(r.pares.flatMap((p) => [p.a, p.b]))]
  const fichas = new Map()
  for (let i = 0; i < ids.length; i += 80) {
    const bloco = ids.slice(i, i + 80)
    const lista = await pb.collection('fontes').getFullList({
      filter: pb.filter(bloco.map((_, j) => `id = {:i${j}}`).join(' || '), Object.fromEntries(bloco.map((id, j) => [`i${j}`, id]))),
      fields: 'id,numero,titulo,autores,data,ano,estado,ficheiro,ficheiro_original,paginas,editora',
    })
    lista.forEach((f) => fichas.set(f.id, f))
  }
  const pares = r.pares.filter((p) => fichas.has(p.a) && fichas.has(p.b) && !r.decididos[chavePar(p.a, p.b)]).map((p) => ({ ...p, fa: fichas.get(p.a), fb: fichas.get(p.b) }))
  return { gerado_em: r.gerado_em, pares }
}

// decisao: "diferentes" (não voltam a aparecer) ou "manter" (fica `manter`, a outra é retirada)
export async function decidir({ a, b, decisao, manter }) {
  if (!a || !b) throw new Error('Par inválido.')
  if (decisao === 'diferentes') {
    const r = lerRevisao()
    r.decididos[chavePar(a, b)] = { decisao, quando: new Date().toISOString() }
    r.pares = r.pares.filter((p) => chavePar(p.a, p.b) !== chavePar(a, b))
    await gravarRevisao(r)
    return { ok: true }
  }
  if (decisao === 'manter') {
    if (manter !== a && manter !== b) throw new Error('Escolha uma das duas fichas.')
    return juntarDuplicado(manter, manter === a ? b : a)
  }
  throw new Error('Decisão desconhecida.')
}
