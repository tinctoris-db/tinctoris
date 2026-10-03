// Repositórios académicos e musicológicos com acesso aberto:
// OpenAlex, Zenodo, DataCite, HAL, Semantic Scholar, RISM, IMSLP.
// (JSTOR e Google Scholar não têm API pública: a interface oferece ligações de pesquisa.)
import { obterJson, pessoa, dataDePartes, primeiro, candidato } from './util.js'

const semDoiUrl = (d) => String(d || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')

// ---------------- OpenAlex (índice académico aberto, cobertura semelhante ao Google Scholar)

const TIPOS_OPENALEX = {
  article: 'Artigo',
  review: 'Artigo',
  letter: 'Artigo',
  book: 'Livro',
  'book-chapter': 'Capítulo de livro',
  dissertation: 'Tese / dissertação',
  report: 'Relatório',
  dataset: 'Base de dados',
  preprint: 'Ensaio',
}

export async function openAlexPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const p = new URLSearchParams({
    search: [titulo, autor].filter(Boolean).join(' '),
    'per-page': String(linhas),
    select: 'id,doi,title,publication_year,publication_date,type,authorships,primary_location,biblio,keywords',
  })
  if (email) p.set('mailto', email)
  const j = await obterJson(`https://api.openalex.org/works?${p}`, { email })
  return (j.results || []).map((w) => {
    const tipo = TIPOS_OPENALEX[w.type] || 'Outro'
    const src = w.primary_location?.source || {}
    const b = w.biblio || {}
    const paginas = [b.first_page, b.last_page].filter(Boolean).join('-')
    const metadados = {}
    if (tipo === 'Artigo') Object.assign(metadados, { revista: src.display_name || '', volume: b.volume || '', numero: b.issue || '', paginas })
    if (tipo === 'Capítulo de livro') Object.assign(metadados, { livro: src.display_name || '', paginas })
    return candidato({
      fonte: 'OpenAlex',
      tipo_sugerido: tipo,
      titulo: w.title || '',
      autores: (w.authorships || []).slice(0, 12).map((a) => pessoa(a.author?.display_name)).filter(Boolean),
      data: w.publication_date || (w.publication_year ? String(w.publication_year) : ''),
      editora: src.host_organization_name || '',
      doi: semDoiUrl(w.doi),
      url: w.doi || w.id || '',
      metadados,
      palavras_chave: (w.keywords || []).map((k) => k.display_name).filter(Boolean).slice(0, 8),
    })
  })
}

// ---------------- Zenodo (repositório aberto: artigos, dados, gravações, software)

function tipoZenodo(rt = {}) {
  const sub = rt.subtype || ''
  if (rt.type === 'publication') {
    return { article: 'Artigo', book: 'Livro', section: 'Capítulo de livro', thesis: 'Tese / dissertação', report: 'Relatório', conferencepaper: 'Capítulo de livro' }[sub] || 'Ensaio'
  }
  return { dataset: 'Base de dados', software: 'Biblioteca de software', video: 'Vídeo', audio: 'Gravação', lesson: 'Outro', presentation: 'Outro', poster: 'Outro', image: 'Outro' }[rt.type] || 'Outro'
}

export async function zenodoPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const j = await obterJson(`https://zenodo.org/api/records?q=${encodeURIComponent(q)}&size=${linhas}`, { email })
  return (j.hits?.hits || []).map((h) => {
    const m = h.metadata || {}
    const tipo = tipoZenodo(m.resource_type)
    const metadados = {}
    if (m.journal) Object.assign(metadados, { revista: m.journal.title || '', volume: m.journal.volume || '', numero: m.journal.issue || '', paginas: m.journal.pages || '' })
    if (m.version && /software/.test(tipo.toLowerCase())) metadados.versao = m.version
    return candidato({
      fonte: 'Zenodo',
      tipo_sugerido: tipo,
      titulo: m.title || '',
      autores: (m.creators || []).map((c) => pessoa(c.name)).filter(Boolean),
      data: m.publication_date || '',
      editora: m.imprint?.publisher || 'Zenodo',
      doi: m.doi || h.doi || '',
      url: h.links?.self_html || (m.doi ? `https://doi.org/${m.doi}` : ''),
      metadados,
      palavras_chave: (m.keywords || []).slice(0, 10),
    })
  })
}

// ---------------- DataCite (DOIs de repositórios institucionais e dados de investigação)

const TIPOS_DATACITE = {
  JournalArticle: 'Artigo',
  Book: 'Livro',
  BookChapter: 'Capítulo de livro',
  Dissertation: 'Tese / dissertação',
  Report: 'Relatório',
  Dataset: 'Base de dados',
  Software: 'Biblioteca de software',
  Audiovisual: 'Vídeo',
  Sound: 'Gravação',
  Text: 'Ensaio',
  Preprint: 'Ensaio',
}

export async function dataCitePesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const j = await obterJson(`https://api.datacite.org/dois?query=${encodeURIComponent(q)}&page%5Bsize%5D=${linhas}`, { email })
  return (j.data || []).map((d) => {
    const a = d.attributes || {}
    return candidato({
      fonte: 'DataCite',
      tipo_sugerido: TIPOS_DATACITE[a.types?.resourceTypeGeneral] || 'Outro',
      titulo: primeiro(a.titles)?.title || '',
      autores: (a.creators || []).map((c) => (c.familyName ? { apelido: c.familyName, nome: c.givenName || '', papel: 'autor' } : pessoa(c.name))).filter(Boolean),
      data: a.publicationYear ? String(a.publicationYear) : '',
      editora: typeof a.publisher === 'object' ? a.publisher?.name || '' : a.publisher || '',
      doi: a.doi || '',
      url: a.url || (a.doi ? `https://doi.org/${a.doi}` : ''),
    })
  })
}

// ---------------- HAL (arquivo aberto europeu, forte em humanidades)

const TIPOS_HAL = { ART: 'Artigo', COUV: 'Capítulo de livro', OUV: 'Livro', DOUV: 'Livro', THESE: 'Tese / dissertação', HDR: 'Tese / dissertação', COMM: 'Capítulo de livro', REPORT: 'Relatório', UNDEFINED: 'Ensaio', SON: 'Gravação', VIDEO: 'Vídeo' }

export async function halPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const fl = 'title_s,authFullName_s,producedDate_s,producedDateY_i,journalTitle_s,bookTitle_s,doiId_s,uri_s,docType_s,publisher_s,volume_s,issue_s,page_s,city_s,keyword_s'
  const j = await obterJson(`https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(q)}&wt=json&rows=${linhas}&fl=${fl}`, { email })
  return (j.response?.docs || []).map((d) => {
    const tipo = TIPOS_HAL[d.docType_s] || 'Outro'
    const metadados = {}
    if (tipo === 'Artigo') Object.assign(metadados, { revista: d.journalTitle_s || '', volume: d.volume_s || '', numero: d.issue_s || '', paginas: d.page_s || '' })
    if (tipo === 'Capítulo de livro') Object.assign(metadados, { livro: d.bookTitle_s || '', paginas: d.page_s || '' })
    return candidato({
      fonte: 'HAL',
      tipo_sugerido: tipo,
      titulo: primeiro(d.title_s),
      autores: (d.authFullName_s || []).slice(0, 12).map((n) => pessoa(n)).filter(Boolean),
      data: d.producedDate_s || (d.producedDateY_i ? String(d.producedDateY_i) : ''),
      editora: primeiro(d.publisher_s),
      local: primeiro(d.city_s),
      doi: d.doiId_s || '',
      url: d.uri_s || '',
      metadados,
      palavras_chave: (d.keyword_s || []).slice(0, 10),
    })
  })
}

// ---------------- Semantic Scholar (funciona melhor com chave gratuita)

export async function semanticScholarPesquisar({ titulo, autor, linhas = 5 }, email, chave) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const campos = 'title,authors,year,venue,externalIds,url,publicationTypes,journal'
  const j = await obterJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${linhas}&fields=${campos}`, {
    email,
    cabecalhos: chave ? { 'x-api-key': chave } : {},
  })
  return (j.data || []).map((p) => {
    const tipos = p.publicationTypes || []
    const tipo = tipos.includes('JournalArticle') ? 'Artigo' : tipos.includes('Book') ? 'Livro' : tipos.includes('BookSection') ? 'Capítulo de livro' : 'Artigo'
    return candidato({
      fonte: 'Semantic Scholar',
      tipo_sugerido: tipo,
      titulo: p.title || '',
      autores: (p.authors || []).slice(0, 12).map((a) => pessoa(a.name)).filter(Boolean),
      data: p.year ? String(p.year) : '',
      doi: p.externalIds?.DOI || '',
      url: p.url || '',
      metadados: tipo === 'Artigo' ? { revista: p.journal?.name || p.venue || '', volume: p.journal?.volume || '', paginas: p.journal?.pages || '' } : {},
    })
  })
}

// ---------------- RISM (Répertoire International des Sources Musicales)

const rotulo = (obj) => primeiro(obj?.pt || obj?.en || obj?.none || Object.values(obj || {})[0])

export async function rismPesquisar({ titulo, autor }, email) {
  if (!titulo) return []
  const q = [autor, titulo].filter(Boolean).join(' ')
  const j = await obterJson(`https://rism.online/search?q=${encodeURIComponent(q)}&mode=sources&rows=20`, {
    email,
    cabecalhos: { Accept: 'application/ld+json' },
  })
  return (j.items || []).slice(0, 8).map((it) => {
    const partes = rotulo(it.label).split('; ')
    const s = it.summary || {}
    const material = rotulo(s.materialSourceTypes?.value) || partes[1] || ''
    const manuscrito = /manuscri|autógraf|autograph|handschrift/i.test(material)
    const ultima = partes.length > 2 ? partes[partes.length - 1] : ''
    const [sigla, ...cota] = ultima.split(' ')
    const compositor = rotulo(s.sourceComposer?.value).replace(/\s*\([^)]*\)\s*$/, '')
    return candidato({
      fonte: 'RISM',
      tipo_sugerido: manuscrito ? 'Manuscrito' : 'Partitura',
      titulo: partes[0] || '',
      autores: compositor ? [pessoa(compositor, 'compositor')] : [],
      data: rotulo(s.dateStatements?.value),
      url: it.id || '',
      metadados: {
        rism: String(it.id || '').split('/').pop(),
        arquivo: sigla || '',
        cota: cota.join(' '),
        suporte: material,
      },
    })
  })
}

// ---------------- IMSLP (partituras em domínio público)

export async function imslpPesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const j = await obterJson(`https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${linhas}&srnamespace=0`, { email })
  return (j.query?.search || []).map((r) => {
    const m = /^(.*)\s+\(([^()]+)\)\s*$/.exec(r.title)
    return candidato({
      fonte: 'IMSLP',
      tipo_sugerido: 'Partitura',
      titulo: m ? m[1] : r.title,
      autores: m ? [pessoa(m[2], 'compositor')] : [],
      url: `https://imslp.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    })
  })
}

// DOIs que não são da CrossRef (ex.: Zenodo, repositórios) resolvem-se na DataCite.
export async function dataCitePorDoi(doi, email) {
  const j = await obterJson(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, { email })
  const a = j.data?.attributes || {}
  return candidato({
    fonte: 'DataCite',
    confianca: 1,
    tipo_sugerido: TIPOS_DATACITE[a.types?.resourceTypeGeneral] || 'Outro',
    titulo: primeiro(a.titles)?.title || '',
    autores: (a.creators || []).map((c) => (c.familyName ? { apelido: c.familyName, nome: c.givenName || '', papel: 'autor' } : pessoa(c.name))).filter(Boolean),
    data: a.publicationYear ? String(a.publicationYear) : '',
    editora: typeof a.publisher === 'object' ? a.publisher?.name || '' : a.publisher || '',
    doi: a.doi || doi,
    url: a.url || `https://doi.org/${doi}`,
  })
}

// ---------------- OpenAIRE (recolhe os repositórios europeus, incluindo o RCAAP e o RIA de Aveiro)
// Forte em teses e dissertações portuguesas; devolve palavras-chave e orientador.

const TIPOS_OPENAIRE = [
  [/doctoral thesis|phd thesis|doctoral/i, 'Tese / dissertação', 'Doutoramento'],
  [/master thesis|master/i, 'Tese / dissertação', 'Mestrado'],
  [/bachelor thesis|thesis/i, 'Tese / dissertação', ''],
  [/part of book|chapter/i, 'Capítulo de livro'],
  [/conference/i, 'Capítulo de livro'],
  [/article|review/i, 'Artigo'],
  [/book/i, 'Livro'],
  [/report/i, 'Relatório'],
  [/dataset/i, 'Base de dados'],
  [/software/i, 'Biblioteca de software'],
  [/sound|audio/i, 'Gravação'],
  [/video|film/i, 'Vídeo'],
]

export async function openAirePesquisar({ titulo, autor, linhas = 5 }, email) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ')
  const j = await obterJson(`https://api.openaire.eu/graph/v1/researchProducts?search=${encodeURIComponent(q)}&pageSize=${linhas}`, { email, timeout: 30000 })
  return (j.results || []).map((r) => {
    const inst = (r.instances || [])[0] || {}
    const [, tipo = 'Outro', grau = ''] = TIPOS_OPENAIRE.find(([rx]) => rx.test(inst.type || r.type || '')) || []
    const pids = [...(r.pids || []), ...(inst.pids || []), ...(inst.alternateIdentifiers || [])]
    const doi = (pids.find((p) => /doi/i.test(p.scheme)) || {}).value || ''
    const handle = (pids.find((p) => /handle/i.test(p.scheme)) || {}).value || ''
    const metadados = {}
    if (tipo === 'Tese / dissertação') {
      if (grau) metadados.grau = grau
      // (o OpenAIRE junta aos contribuidores o próprio repositório: "REPOSITÓRIO P.PORTO")
      const orient = (r.contributors || []).filter((c) => typeof c === 'string' && !/^[A-Z]{3,}$/.test(c) && !/^reposit[óo]rio\b/i.test(c))
      if (orient.length) metadados.orientacao = orient.join('; ')
    }
    return candidato({
      fonte: 'OpenAIRE',
      tipo_sugerido: tipo,
      titulo: [r.mainTitle, r.subTitle].filter(Boolean).join(': '),
      // O nome completo ("Silva, Pedro Alexandre Sousa e") é mais fiel do que os campos separados
      autores: (r.authors || []).map((a) => (a.fullName?.includes(',') ? pessoa(a.fullName) : a.surname ? { apelido: a.surname, nome: a.name || '', papel: 'autor' } : pessoa(a.fullName))).filter(Boolean),
      data: r.publicationDate || '',
      editora: r.publisher || '',
      doi,
      url: handle ? `http://hdl.handle.net/${handle}` : (inst.urls || [])[0] || '',
      metadados,
      palavras_chave: (r.subjects || []).filter((x) => x.subject?.scheme === 'keyword').map((x) => x.subject.value).slice(0, 10),
    })
  })
}
