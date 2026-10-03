// Coordena a pesquisa de metadados em todas as fontes externas.
import * as B from './bibliograficas.js'
import * as A from './audiovisuais.js'
import * as C from './academicas.js'
import { gallicaPesquisar } from './gallica.js'
import { dspacePesquisar } from './repositorios.js'
import { semelhanca, contido, normalizar } from './util.js'

// Cada fonte recebe a consulta {titulo, autor, artista} e as definições.
const FONTES = {
  crossref: (q, d) => B.crossrefPesquisar(q, d.email_contacto),
  openalex: (q, d) => C.openAlexPesquisar(q, d.email_contacto),
  openaire: (q, d) => C.openAirePesquisar(q, d.email_contacto),
  openlibrary: (q, d) => B.openLibraryPesquisar(q, d.email_contacto),
  googlebooks: (q, d) => B.googleBooksPesquisar(q, d.email_contacto, d.google_books_api_key),
  zenodo: (q, d) => C.zenodoPesquisar(q, d.email_contacto),
  datacite: (q, d) => C.dataCitePesquisar(q, d.email_contacto),
  hal: (q, d) => C.halPesquisar(q, d.email_contacto),
  semanticscholar: (q, d) => C.semanticScholarPesquisar(q, d.email_contacto, d.semantic_scholar_api_key),
  internetarchive: (q, d) => B.internetArchivePesquisar(q, d.email_contacto),
  rism: (q, d) => C.rismPesquisar(q, d.email_contacto),
  imslp: (q, d) => C.imslpPesquisar(q, d.email_contacto),
  gallica: (q, d) => gallicaPesquisar(q, d.email_contacto),
  recipp: (q, d) => dspacePesquisar(q, d.email_contacto),
  musicbrainz: (q, d) => A.musicBrainzPesquisar({ ...q, artista: q.artista || q.autor }, d.email_contacto),
  itunes: (q, d) => A.itunesPesquisar({ ...q, artista: q.artista || q.autor }, d.email_contacto),
  deezer: (q, d) => A.deezerPesquisar({ ...q, artista: q.artista || q.autor }, d.email_contacto),
  youtube: (q, d) => A.youtubePesquisar({ ...q, artista: q.artista || q.autor }, d.email_contacto, d.youtube_api_key),
}

// Fontes consultadas automaticamente, conforme o género de ficheiro.
const AUTOMATICO = {
  audio: ['musicbrainz', 'itunes', 'deezer', 'youtube'],
  video: ['youtube', 'musicbrainz', 'internetarchive'],
  partitura: ['imslp', 'rism'],
  // (Google Books e repositórios nacionais — RECIPP — também, a pedido do Pedro, 1/10/2026; Google Scholar e JSTOR
  // não permitem pesquisa automática: ficam as ligações na ficha)
  escrita: ['crossref', 'openalex', 'openlibrary', 'openaire', 'googlebooks', 'recipp'],
  tese: ['openaire', 'recipp', 'openalex', 'crossref'],
}

function textoAutores(c) {
  return (c.autores || []).map((a) => [a.literal, a.nome, a.apelido].filter(Boolean).join(' ')).join(' ')
}

// Confiança (0..1): semelhança do título e presença do autor/artista.
function pontuar(c, q) {
  if (c.confianca >= 1) return c
  const consulta = q.titulo || ''
  let conf = Math.max(
    semelhanca(consulta, c.titulo),
    semelhanca(consulta, `${c.titulo} ${textoAutores(c)}`),
    contido(consulta, c.titulo) * 0.9
  )
  // Apelidos conhecidos (autor/compositor e intérprete): basta um coincidir.
  const apelidos = [q.autor, q.artista].map((n) => normalizar(n || '').split(' ').filter((w) => w.length > 2).pop()).filter(Boolean)
  if (apelidos.length) {
    const nomes = normalizar(textoAutores(c))
    const doAutor = apelidos.some((a) => nomes.includes(a))
    conf = conf * 0.75 + (doAutor ? 0.25 : 0)
    // Recensão: o nome do autor aparece no TÍTULO do resultado, mas não nos autores
    // ("Karol Berger, Musica Ficta" por Caldwell). Não é a obra procurada.
    if (!doAutor && apelidos.some((a) => normalizar(c.titulo).split(' ').includes(a))) conf *= 0.5
  }
  // Um documento longo (livro, tese) não é um artigo curto — tipicamente uma recensão com o mesmo título
  if (q.paginas > 60 && ['Artigo', 'Ensaio'].includes(c.tipo_sugerido)) {
    const pg = /(\d+)\s*[-–]\s*(\d+)/.exec(String(c.metadados?.paginas || ''))
    const extensao = pg ? Math.abs(Number(pg[2]) - Number(pg[1])) + 1 : 0
    if (!pg || extensao < q.paginas / 3) conf *= 0.5
  }
  // Título do tipo "Karol Berger, Musica Ficta" (recensão de um livro) quando a obra procurada não começa assim
  if (/^[\p{Lu}][\p{L}.'’-]+(?: [\p{Lu}][\p{L}.'’-]+){1,3}, /u.test(c.titulo) && !/^[\p{Lu}][\p{L}.'’-]+(?: [\p{Lu}][\p{L}.'’-]+){1,3}, /u.test(consulta)) conf *= 0.6
  c.confianca = Math.round(conf * 100) / 100
  return c
}

function semDuplicados(lista) {
  const vistos = new Set()
  return lista.filter((c) => {
    const chave = c.doi ? 'doi:' + c.doi.toLowerCase() : normalizar(c.titulo) + '|' + String(c.data).slice(0, 4) + '|' + c.fonte
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

async function consultar(nomes, q, defs) {
  const erros = []
  const res = await Promise.allSettled(nomes.map((n) => FONTES[n](q, defs)))
  const todos = []
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') todos.push(...(r.value || []))
    else erros.push(`${nomes[i]}: ${r.reason?.message || r.reason}`)
  })
  const lista = semDuplicados(todos.filter((c) => c && c.titulo).map((c) => pontuar(c, q)))
  lista.sort((a, b) => b.confianca - a.confianca)
  // A mesma obra em várias fontes (ex.: a tese no OpenAIRE e no repositório da escola): o que a primeira não tem
  // (instituição, orientador, palavras-chave) vem das outras
  const [a, ...resto] = lista
  if (a) {
    for (const b of resto.filter((x) => x.confianca >= a.confianca - 0.05 && normalizar(x.titulo) === normalizar(a.titulo) && String(x.data).slice(0, 4) === String(a.data).slice(0, 4) && x.tipo_sugerido === a.tipo_sugerido)) {
      for (const [k, v] of Object.entries(b.metadados || {})) if (v && !a.metadados?.[k]) a.metadados = { ...a.metadados, [k]: v }
      if (!a.palavras_chave?.length && b.palavras_chave?.length) a.palavras_chave = b.palavras_chave
    }
  }
  return { candidatos: lista, erros }
}

async function porIdentificador(q, defs) {
  const email = defs.email_contacto
  if (q.doi) {
    try {
      return await B.crossrefPorDoi(q.doi, email)
    } catch (_) {}
    try {
      return await C.dataCitePorDoi(q.doi, email)
    } catch (_) {}
  }
  if (q.isbn) {
    try {
      const r = await B.openLibraryPorIsbn(q.isbn, email)
      if (r) return r
    } catch (_) {}
    try {
      const r = await B.googleBooksPorIsbn(q.isbn, email, defs.google_books_api_key)
      if (r) return r
    } catch (_) {}
  }
  return null
}

// Pesquisa automática ao entrar um ficheiro. q: {genero, titulo, autor, artista, doi, isbn}
export async function automatico(q, defs) {
  const exato = await porIdentificador(q, defs)
  if (exato) return { candidatos: [exato], erros: [] }
  // (o Google Books só entra na pesquisa automática com a chave do Pedro: sem ela a quota partilhada está sempre esgotada;
  //  continua na «Pesquisa aprofundada»)
  const nomes = (AUTOMATICO[q.genero] || AUTOMATICO.escrita).filter((n) => n !== 'googlebooks' || defs.google_books_api_key)
  const r = await consultar(nomes, q, defs)
  r.candidatos = r.candidatos.slice(0, 10)
  return r
}

// Pesquisa alargada a pedido: todas as fontes.
export async function aprofundado(q, defs) {
  const exato = await porIdentificador(q, defs)
  const r = await consultar(Object.keys(FONTES), q, defs)
  if (exato) r.candidatos.unshift(exato)
  r.candidatos = semDuplicados(r.candidatos).slice(0, 40)
  return r
}

// Aceitar automaticamente só quando o melhor candidato é confiável e não há empate
// com um candidato diferente (ex.: livro vs. recensão do livro com o mesmo título).
const PAGINA_INTERNA = /^(about the authors?|contents|table of contents|preface|foreword|introduction|index|bibliography|references|copyright|front matter|back matter|title page|acknowledg(e)?ments|notes on contributors|list of (figures|tables)|thesis|dissertation|tese|th[èe]se|untitled|no title|sem t[íi]tulo|title|review|book reviews?|editorial|abstract|resumo)\.?$/i

export function escolher(candidatos, limiar = 0.8) {
  const [a, b] = candidatos.filter((c) => !PAGINA_INTERNA.test(String(c.titulo || '').trim()))
  if (!a || a.confianca < limiar) return null
  const mesmaObra = () =>
    normalizar(a.titulo) === normalizar(b.titulo) &&
    String(a.data).slice(0, 4) === String(b.data).slice(0, 4) &&
    a.tipo_sugerido === b.tipo_sugerido
  // (confiança máxima só ganha sozinha: dois registos diferentes com o título igual — "O Ewigkeit, du Donnerwort" do
  //  RISM e do IMSLP, BWV 20 e BWV 60 — são um empate)
  if (a.confianca >= 1) return !b || b.confianca < 1 || mesmaObra() ? a : null
  if (!b || b.confianca < a.confianca - 0.05) return a
  return mesmaObra() ? a : null
}

export function juntarCandidatos(a, b) {
  return semDuplicados([...a, ...b]).sort((x, y) => y.confianca - x.confianca).slice(0, 15)
}

export const NOMES_FONTES = Object.keys(FONTES)
