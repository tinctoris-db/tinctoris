// Fontes bibliográficas: CrossRef, Open Library, Google Books, Internet Archive.
import { obterJson, pessoa, dataDePartes, primeiro, candidato } from './util.js'

// ---------------- CrossRef (artigos, livros académicos, capítulos, teses)

const TIPOS_CROSSREF = {
  'journal-article': 'Artigo',
  book: 'Livro',
  monograph: 'Livro',
  'edited-book': 'Livro',
  'reference-book': 'Livro',
  'book-chapter': 'Capítulo de livro',
  'book-section': 'Capítulo de livro',
  'book-part': 'Capítulo de livro',
  'reference-entry': 'Capítulo de livro',
  'proceedings-article': 'Capítulo de livro',
  dissertation: 'Tese / dissertação',
  report: 'Relatório',
  'posted-content': 'Ensaio',
}

function deCrossref(m) {
  const tipo = TIPOS_CROSSREF[m.type] || 'Outro'
  const autores = [
    ...(m.author || []).map((a) => (a.family ? { apelido: a.family, nome: a.given || '', papel: 'autor' } : { literal: a.name, papel: 'autor' })),
    ...(m.editor || []).map((a) => (a.family ? { apelido: a.family, nome: a.given || '', papel: 'editor' } : { literal: a.name, papel: 'editor' })),
  ]
  const titulo = [primeiro(m.title), primeiro(m.subtitle)].filter(Boolean).join(': ')
  const contentor = primeiro(m['container-title'])
  const metadados = {}
  if (tipo === 'Artigo') Object.assign(metadados, { revista: contentor, volume: m.volume || '', numero: m.issue || '', paginas: m.page || '' })
  if (tipo === 'Capítulo de livro') Object.assign(metadados, { livro: contentor, paginas: m.page || '' })
  const data = dataDePartes((m.issued || m.published || m['published-print'] || {})['date-parts']?.[0])
  return candidato({
    fonte: 'CrossRef',
    tipo_sugerido: tipo,
    titulo,
    autores,
    data,
    editora: m.publisher || '',
    local: m['publisher-location'] || '',
    doi: m.DOI || '',
    isbn: primeiro(m.ISBN).replace(/-/g, ''),
    url: m.URL || '',
    metadados,
  })
}

export async function crossrefPorDoi(doi, email) {
  const j = await obterJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { email })
  return { ...deCrossref(j.message), confianca: 1 }
}

export async function crossrefPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const p = new URLSearchParams({ 'query.bibliographic': titulo, rows: String(linhas) })
  if (autor) p.set('query.author', autor)
  if (email) p.set('mailto', email)
  const j = await obterJson(`https://api.crossref.org/works?${p}`, { email })
  return (j.message?.items || []).map(deCrossref)
}

// ---------------- Open Library (livros, sobretudo por ISBN)

export async function openLibraryPorIsbn(isbn, email) {
  const campos = 'title,subtitle,author_name,first_publish_year,publisher,publish_place,number_of_pages_median,key'
  const j = await obterJson(`https://openlibrary.org/search.json?isbn=${isbn}&fields=${campos}`, { email })
  const d = (j.docs || [])[0]
  if (!d) return null
  // Dados da edição concreta (ano e editora desse ISBN), quando disponíveis
  let ed = {}
  try {
    ed = await obterJson(`https://openlibrary.org/isbn/${isbn}.json`, { email })
  } catch (_) {}
  return candidato({
    fonte: 'Open Library',
    confianca: 1,
    tipo_sugerido: 'Livro',
    titulo: [d.title, d.subtitle].filter(Boolean).join(': '),
    autores: (d.author_name || []).slice(0, 8).map((n) => pessoa(n)).filter(Boolean),
    data: ((ed.publish_date || '').match(/\d{4}/) || [])[0] || (d.first_publish_year ? String(d.first_publish_year) : ''),
    editora: primeiro(ed.publishers) || primeiro(d.publisher),
    local: primeiro(ed.publish_places) || primeiro(d.publish_place),
    isbn,
    url: d.key ? `https://openlibrary.org${d.key}` : '',
    metadados: ed.number_of_pages || d.number_of_pages_median ? { n_paginas: ed.number_of_pages || d.number_of_pages_median } : {},
  })
}

export async function openLibraryPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const p = new URLSearchParams({ q: titulo, limit: String(linhas), fields: 'title,subtitle,author_name,first_publish_year,publisher,publish_place,isbn,key' })
  if (autor) p.set('author', autor)
  const j = await obterJson(`https://openlibrary.org/search.json?${p}`, { email })
  return (j.docs || []).map((d) =>
    candidato({
      fonte: 'Open Library',
      tipo_sugerido: 'Livro',
      titulo: [d.title, d.subtitle].filter(Boolean).join(': '),
      autores: (d.author_name || []).slice(0, 6).map((n) => pessoa(n)).filter(Boolean),
      data: d.first_publish_year ? String(d.first_publish_year) : '',
      editora: primeiro(d.publisher),
      local: primeiro(d.publish_place),
      isbn: (d.isbn || []).find((x) => x.length === 13) || primeiro(d.isbn),
      url: d.key ? `https://openlibrary.org${d.key}` : '',
    })
  )
}

// ---------------- Google Books

function deGoogle(v) {
  const i = v.volumeInfo || {}
  const ids = i.industryIdentifiers || []
  return candidato({
    fonte: 'Google Books',
    tipo_sugerido: 'Livro',
    titulo: [i.title, i.subtitle].filter(Boolean).join(': '),
    autores: (i.authors || []).map((n) => pessoa(n)).filter(Boolean),
    data: i.publishedDate || '',
    editora: i.publisher || '',
    isbn: (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier || '',
    url: i.infoLink || '',
    metadados: i.pageCount ? { n_paginas: i.pageCount } : {},
  })
}

// (chave: a do Pedro em Definições — sem ela, a quota partilhada esgota-se e o Google responde "429")
const chaveGoogle = (chave) => (chave ? `&key=${encodeURIComponent(chave)}` : '')
export async function googleBooksPorIsbn(isbn, email, chave = '') {
  const j = await obterJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${chaveGoogle(chave)}`, { email })
  const v = (j.items || [])[0]
  return v ? { ...deGoogle(v), confianca: 1 } : null
}

export async function googleBooksPesquisar({ titulo, autor, linhas = 5 }, email, chave = '') {
  if (!titulo) return []
  const q = `intitle:${titulo}` + (autor ? ` inauthor:${autor}` : '')
  const j = await obterJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${linhas}${chaveGoogle(chave)}`, { email })
  return (j.items || []).map(deGoogle)
}

// ---------------- Internet Archive (impressos antigos, gravações históricas, vídeos)

const TIPOS_IA = { texts: 'Livro', audio: 'Gravação', etree: 'Registo de concerto', movies: 'Vídeo', image: 'Outro', software: 'Tecnologia (hardware / software)' }

export async function internetArchivePesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const limpo = (s) => s.replace(/[():"\[\]]/g, ' ')
  let q = `title:(${limpo(titulo)})`
  if (autor) q += ` AND creator:(${limpo(autor)})`
  const campos = ['identifier', 'title', 'creator', 'date', 'year', 'publisher', 'mediatype']
  const p = new URLSearchParams({ q, rows: String(linhas), output: 'json' })
  campos.forEach((c) => p.append('fl[]', c))
  const j = await obterJson(`https://archive.org/advancedsearch.php?${p}`, { email })
  return (j.response?.docs || []).map((d) =>
    candidato({
      fonte: 'Internet Archive',
      tipo_sugerido: TIPOS_IA[d.mediatype] || 'Outro',
      titulo: primeiro(d.title),
      autores: [].concat(d.creator || []).slice(0, 6).map((n) => pessoa(n, d.mediatype === 'audio' ? 'intérprete' : 'autor')).filter(Boolean),
      data: (d.date || '').slice(0, 10) || (d.year ? String(d.year) : ''),
      editora: primeiro(d.publisher),
      url: `https://archive.org/details/${d.identifier}`,
    })
  )
}
