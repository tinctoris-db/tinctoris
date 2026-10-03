// Gallica e catálogo da Bibliothèque nationale de France (BnF).
// - Exemplar: o identificador "ark:/12148/…" lido na folha inicial (ou no nome do ficheiro) dá o registo exato do
//   exemplar digitalizado (cota, biblioteca de origem) e a notícia do catálogo (outros exemplares da BnF, proveniência).
// - Pesquisa: por compositor, título e ano nas partituras e manuscritos da Gallica (depois do RISM e do DIAMM).
import { obterTexto, pessoa, candidato, normalizar, semelhanca } from './util.js'
import { texto, textos, blocos, camposMarc, marc, registosSru } from './xml.js'

const GALLICA = 'https://gallica.bnf.fr'
const CATALOGO = 'https://catalogue.bnf.fr'

// "ark:/12148/btv1b52500918r", "…/ark:/12148/bpt6k12803212.pdf", ou só "btv1b52500918r" no nome do ficheiro
// (só os documentos digitalizados: "cb…" é uma notícia do catálogo, não uma digitalização)
const ARK = /ark:\/12148\/((?:btv1b|bpt6k|bd6t)[0-9a-z]{6,14})\b/i
const ARK_SOLTO = /(?:^|[^0-9a-z])((?:btv1b|bpt6k)[0-9]{7,9}[0-9a-z]?)(?![0-9a-z])/i
export function arkDe(textoOuNome) {
  const s = String(textoOuNome || '')
  const m = ARK.exec(s) || ARK_SOLTO.exec(s)
  if (!m) return ''
  // ("btv1b52500918r.pdf", "btv1b52500918r_f12": fica só o identificador)
  return m[1].toLowerCase()
}

// Papéis da BnF ("Morales, Cristóbal de (1500?-1553). Compositeur") → papéis da biblioteca
const PAPEIS = [
  [/compositeur(?! de l.oeuvre adapt)/i, 'compositor'],
  [/auteur du texte|librettiste|parolier|auteur$/i, 'autor'],
  [/arrangeur/i, 'arranjador'],
  [/[ée]diteur scientifique/i, 'editor'],
]
export function pessoaBnf(s) {
  const m = /^(.*?)(?:\s*\([^)]*\))?\s*\.\s*([^.]+)$/.exec(String(s || '').trim())
  const nome = (m ? m[1] : String(s || '')).replace(/\s*\([^)]*\)\s*$/, '').trim()
  const funcao = m ? m[2].trim() : ''
  const papel = (PAPEIS.find(([re]) => re.test(funcao)) || [])[1]
  if (!nome || (funcao && !papel)) return null
  return pessoa(nome, papel || 'autor')
}

// "Valerio et Lodovico Dorico (Roma)" → { editora, local }
function editoraLocal(s) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(String(s || '').trim())
  return m ? { editora: m[1].trim(), local: m[2].trim() } : { editora: String(s || '').trim(), local: '' }
}

// "Bibliothèque nationale de France, département Musique, RES F-714" → biblioteca + cota
export function origemGallica(fonte) {
  const s = String(fonte || '').trim()
  const bnf = /^(Biblioth[èe]que nationale de France(?:, d[ée]partement [^,]+)?),\s*(.+)$/i.exec(s)
  if (bnf) return { biblioteca: bnf[1], sigla: 'F-Pn', cota: bnf[2].trim() }
  // (parceiros da Gallica: "Bibliothèque municipale de Lyon, Rés 123": a última parte é a cota)
  const i = s.lastIndexOf(', ')
  return i > 0 ? { biblioteca: s.slice(0, i), sigla: '', cota: s.slice(i + 2) } : { biblioteca: s, sigla: '', cota: '' }
}

const MS = /\bms\b|\bms\.|manuscrit|\bmss?\s*-/i
const linhaExemplar = (o) => [o.biblioteca && (o.sigla ? `${o.biblioteca} (${o.sigla})` : o.biblioteca), o.cota].filter(Boolean).join(', ')

// Um registo Dublin Core da Gallica (OAI ou SRU) → candidato
function candidatoDc(dc, { ark, extra = '' } = {}) {
  const autores = [...textos(dc, 'creator'), ...textos(dc, 'contributor')].map(pessoaBnf).filter(Boolean)
  const { editora, local } = editoraLocal(texto(dc, 'publisher'))
  const origem = origemGallica(texto(dc, 'source') || texto(extra, 'source'))
  const notice = (/catalogue\.bnf\.fr\/(ark:\/12148\/cb[0-9a-z]+)/i.exec(textos(dc, 'relation').join(' ')) || [])[1] || ''
  const id = ark || arkDe(textos(dc, 'identifier').join(' '))
  const tipo = `${textos(dc, 'type').join(' ')} ${texto(extra, 'typedoc')}`
  const manuscrito = /manuscrit/i.test(tipo) || MS.test(origem.cota)
  return candidato({
    fonte: 'Gallica (BnF)',
    tipo_sugerido: manuscrito ? 'Manuscrito' : /partition/i.test(tipo) ? 'Partitura' : 'Livro',
    titulo: texto(dc, 'title').replace(/\s*\[(musique imprim[ée]e|musique manuscrite|manuscrit)\]\s*/gi, ' ').trim(),
    autores,
    data: texto(dc, 'date'),
    editora: manuscrito ? '' : editora,
    local: manuscrito ? '' : local,
    url: id ? `${GALLICA}/ark:/12148/${id}` : '',
    metadados: {
      ...(manuscrito ? { forma: 'Manuscrito' } : /partition/i.test(tipo) ? { forma: 'Impresso' } : {}),
      formato: textos(dc, 'format').filter((f) => !/^application\/|nombre total de vues/i.test(f)).join('; '),
      // (o exemplar da BnF: só é «o exemplar» da ficha quando o PDF veio dela; na pesquisa conta como exemplar conhecido)
      exemplares: linhaExemplar(origem),
      registo_biblioteca: notice ? `${CATALOGO}/${notice}` : '',
      ...(manuscrito && origem.cota ? { arquivo: origem.biblioteca, sigla: origem.sigla, cota: origem.cota } : {}),
    },
  })
}

// ---------------- Exemplar: registo da Gallica pelo identificador ark
export async function gallicaExemplar(ark, email) {
  const xml = await obterTexto(`${GALLICA}/services/OAIRecord?ark=${encodeURIComponent(ark)}`, { email })
  const dc = (/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/.exec(xml) || [])[0]
  if (!dc) return null
  const c = candidatoDc(dc, { ark, extra: xml })
  const origem = origemGallica(texto(dc, 'source') || texto(xml, 'source'))
  c.confianca = 0.95
  c.pontuado = true
  c.fonte = 'Gallica (exemplar)'
  c.metadados.exemplares = ''
  // A notícia do catálogo da BnF: proveniência e outros exemplares da mesma edição na BnF
  if (c.metadados.registo_biblioteca) {
    try {
      Object.assign(c.metadados, await bnfNotice((/cb[0-9a-z]+/.exec(c.metadados.registo_biblioteca) || [])[0], email, origem.cota))
    } catch (_) {}
  }
  return {
    candidato: c,
    biblioteca: origem.biblioteca,
    sigla: origem.sigla,
    cota: origem.cota,
    identificador: `ark:/12148/${ark}`,
    ligacao: `${GALLICA}/ark:/12148/${ark}`,
    registo: c.metadados.registo_biblioteca || '',
    proveniencia: c.metadados.proveniencia || '',
  }
}

// ---------------- Catálogo da BnF (UNIMARC): exemplares e proveniência
export async function bnfNotice(arkCb, email, cotaDoExemplar = '') {
  const id = String(arkCb || '').replace(/^ark:\/12148\//, '')
  const xml = await obterTexto(`${CATALOGO}/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=unimarcxchange&maximumRecords=1&query=${encodeURIComponent(`bib.persistentid all "ark:/12148/${id}"`)}`, { email })
  const campos = camposMarc(registosSru(xml)[0] || '')
  if (!campos.length) return {}
  // 930: um campo por exemplar ($a cota, $c localização); "Document numérisé" é a própria digitalização
  const copias = campos
    .filter((c) => c.tag === '930')
    .map((c) => Object.fromEntries(c.sub))
    .filter((x) => x.a && !/num[ée]ris/i.test(x.c || ''))
  const outros = copias.filter((x) => normalizar(x.a) !== normalizar(cotaDoExemplar))
  // 317: nota de proveniência; 316: nota sobre o exemplar (encadernação, carimbos…)
  const proveniencia = [...marc(campos, '317', 'a'), ...marc(campos, '316', 'a')].join(' ')
  const formaCat = marc(campos, '200', 'b').join(' ')
  return {
    ...(proveniencia ? { proveniencia } : {}),
    ...(outros.length ? { outros_exemplares: outros.map((x) => `Bibliothèque nationale de France (F-Pn), ${x.a}${x.c ? ` [${x.c}]` : ''}`).join('\n') } : {}),
    ...(/manuscrite/i.test(formaCat) ? { forma: 'Manuscrito' } : /imprim/i.test(formaCat) ? { forma: 'Impresso' } : {}),
  }
}

// ---------------- Pesquisa por compositor, título e ano (partituras e manuscritos)
const cql = (s) => String(s || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()
export async function gallicaPesquisar({ titulo, autor, ano, forma }, email, { palavras = (t) => t } = {}) {
  const partes = []
  const apelido = normalizar(autor || '').split(' ').filter((w) => w.length > 2).pop()
  if (apelido) partes.push(`dc.creator all "${cql(apelido)}"`)
  const p = cql(palavras(titulo || ''))
  if (p) partes.push(`dc.title any "${p}"`)
  if (!partes.length) return []
  if (/^\d{4}$/.test(String(ano || ''))) partes.push(`gallicapublication_date="${ano}"`)
  partes.push(forma === 'manuscrito' ? 'dc.type all "manuscrit"' : '(dc.type all "partition" or dc.type all "manuscrit")')
  const xml = await obterTexto(`${GALLICA}/SRU?operation=searchRetrieve&version=1.2&maximumRecords=8&query=${encodeURIComponent(partes.join(' and '))}`, { email })
  // (cada <srw:record> traz o Dublin Core e, à parte, o tipo de documento da Gallica: "partitions", "manuscrits")
  return blocos(xml, 'record').map((r) => candidatoDc((/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/.exec(r) || [])[0] || r, { extra: r }))
}

export const ligacaoPesquisaGallica = (q) => `${GALLICA}/services/engine/search/sru?operation=searchRetrieve&query=${encodeURIComponent(`(gallica all "${cql(q)}")`)}`

// ---------------- PDFs da Gallica sem o identificador (ark)
// Muitos PDFs descarregados da Gallica não trazem o ark em lado nenhum: só a folha inicial ("Epitome musical des tons…
// / Source gallica.bnf.fr / Bibliothèque nationale de France") e a notícia na página seguinte ("Jambe de Fer, Philibert
// (1515?-1566?). Auteur du texte. Epitome musical… 1556."). Com o título, o autor e o ano procura-se na Gallica; só se
// aceita quando há um único resultado claro (o mesmo ano e um título parecido).
export function lerNoticiaGallica(texto, titulos = []) {
  const linhas = String(texto || '').split('\n').map((l) => l.trim())
  const iFonte = linhas.findIndex((l) => /source\s*gallica\.bnf\.fr/i.test(l))
  const fundo = iFonte >= 0 ? ((/source\s*gallica\.bnf\.fr\s*\/\s*(.+)$/i.exec(linhas[iFonte]) || [])[1] || '').trim() : ''
  // (título: as linhas antes de "Source gallica.bnf.fr", sem a responsabilidade depois de " / " nem o "[...]" do corte)
  const antes = iFonte > 0 ? linhas.slice(0, iFonte).filter(Boolean).join(' ') : ''
  const tituloPagina = antes.split(/\s+\/\s+/)[0].replace(/\s*\[\s*(\.\.\.|…)\s*\]\s*$/, '').replace(/[\s,;:&….]+$/, '').trim()
  // A notícia inteira: da linha a seguir a "Source gallica.bnf.fr" até à linha vazia, a "1/ Les contenus…" ou ao fim
  // (Pedro, 2/10: só a 1.ª linha era lida, e o ano da notícia do «Epitome» saía 1566, a morte do autor)
  const resto = []
  if (iFonte >= 0) {
    let i = iFonte + 1
    while (i < linhas.length && !linhas[i]) i++
    for (; i < linhas.length && linhas[i] && !/^1\s*\/\s*les contenus/i.test(linhas[i]); i++) resto.push(linhas[i])
  }
  const noticia = resto.join(' ').replace(/\s+/g, ' ').trim()
  const { autor, vida, depois } = autorDaNoticia(noticia)
  // (o ano da edição: o último ano da notícia que não é um dos anos de vida do autor; sem outro, o último que houver)
  const anos = (depois.match(/\b1[4-9]\d\d\b/g) || [])
  const ano = [...anos].reverse().find((a) => !vida.includes(a)) || anos[anos.length - 1] || (/\b(1[4-9]\d\d)\b/.exec(antes) || [])[1] || ''
  // (título da notícia: o que vem depois do autor e do papel, até à responsabilidade ou à data)
  const tituloNoticia = depois
    .replace(/^((auteur du texte|compositeur|auteur|éditeur scientifique|traducteur|imprimeur-libraire|libraire)\.\s*)+/i, '')
    .split(/\s+\/\s+|\.\s+(?=[A-ZÀ-Ý][^.]{0,40}\b1[4-9]\d\d\b)/)[0]
    .replace(/[\s,;:.]+$/, '')
    .trim()
  const titulo = tituloPagina || tituloNoticia || [...titulos].filter(Boolean).sort((a, b) => b.length - a.length)[0] || ''
  return { titulo, titulos: [...new Set([tituloPagina, tituloNoticia, ...titulos].filter(Boolean))], autor, ano, fundo, vida }
}

// O autor no início da notícia, nas três formas da Gallica:
// "Jambe de Fer, Philibert (1515?-1566?). Auteur du texte. …", "Agricola, Martin (1486?-1556). …" e
// "Certon / Pierre / 1515-1572 / 0220. …" → { autor: "Apelido, Nome", vida: [anos de vida], depois: o resto da notícia }
export function autorDaNoticia(noticia) {
  const n = String(noticia || '')
  const anosDe = (s) => String(s || '').match(/\b\d{3,4}\b/g) || []
  let m = /^([^()/.]{2,80}?)\s*\(([^()]*\d{3,4}[^()]*)\)\.?\s*/.exec(n)
  if (m) return { autor: m[1].trim(), vida: anosDe(m[2]), depois: n.slice(m[0].length) }
  m = /^([^/().]{2,60}?)\s*\/\s*([^/().]{2,60}?)\s*\/\s*(\d{3,4}\??\s*-\s*\d{3,4}\??)\s*(?:\/\s*[^/.]*)?\.\s*/.exec(n)
  if (m) return { autor: `${m[1].trim()}, ${m[2].trim()}`, vida: anosDe(m[3]), depois: n.slice(m[0].length) }
  return { autor: '', vida: [], depois: n }
}

// Pesquisa na Gallica pela notícia. Só se aceita um resultado único, por esta ordem:
// 1) cada título (folha inicial, notícia, títulos do PDF) com o autor e o ano;
// 2) só o autor e o ano (título estragado), com o fundo a filtrar;
// 3) o título sem o ano, aceitando só registos SEM data no catálogo (o Agricola do «Ancien fonds du Conservatoire» diz
//    «[s.d.]»), muito parecidos com o título e do mesmo fundo.
export async function gallicaPorDescricao({ titulo, titulos = [], autor, ano, fundo }, email) {
  const apelido = normalizar(String(autor || '').split(',')[0]).split(' ').filter((w) => w.length > 2).join(' ')
  const fundoProprio = fundo && !/^biblioth[èe]que nationale de france$/i.test(fundo)
  const doFundo = (lista) => (fundoProprio ? lista.filter((x) => normalizar(x.fonte).includes(normalizar(fundo))) : lista)
  const procurar = async (partes) => {
    const xml = await obterTexto(`${GALLICA}/SRU?operation=searchRetrieve&version=1.2&maximumRecords=10&query=${encodeURIComponent(partes.join(' and '))}`, { email })
    return blocos(xml, 'record')
      .map((r) => (/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/.exec(r) || [])[0] || r)
      .map((dc) => ({ ark: arkDe(textos(dc, 'identifier').join(' ')), titulo: texto(dc, 'title'), data: textos(dc, 'date').join(' '), fonte: textos(dc, 'source').join(' ') }))
      .filter((x) => x.ark)
  }
  const temAno = /^\d{4}$/.test(String(ano || ''))
  const comAno = temAno ? [`gallicapublication_date="${ano}"`] : []
  const daCriador = apelido ? [`dc.creator all "${cql(apelido)}"`] : []
  const lista = [...new Set([titulo, ...titulos].filter(Boolean))].map((t) => ({ t, palavras: normalizar(t).split(' ').filter((w) => w.length >= 4).slice(0, 4).join(' ') })).filter((x) => x.palavras)
  const parecido = (x, t, palavras) => Math.max(semelhanca(t, x.titulo), semelhanca(palavras, x.titulo))
  if (!apelido && !temAno) return ''
  // 1) título + autor + ano
  for (const { t, palavras } of lista) {
    let r = (await procurar([`dc.title all "${cql(palavras)}"`, ...daCriador, ...comAno])).filter((x) => (!temAno || x.data.includes(ano)) && parecido(x, t, palavras) >= 0.3)
    // (vários exemplares: o fundo da folha inicial — "Ancien fonds du Conservatoire" — desempata)
    if (r.length > 1) {
      const f = doFundo(r)
      if (f.length) r = f
    }
    if (r.length === 1) return r[0].ark
    if (r.length > 1) return ''
  }
  // 2) só autor + ano (+ fundo)
  if (apelido && temAno) {
    let r = (await procurar([...daCriador, ...comAno])).filter((x) => x.data.includes(ano))
    if (r.length > 1) r = doFundo(r)
    if (r.length === 1) return r[0].ark
    if (r.length > 1) return ''
  }
  // 3) título + autor sem o ano: só registos sem data, muito parecidos, do mesmo fundo
  if (apelido && fundoProprio) {
    for (const { t, palavras } of lista) {
      const todos = await procurar([`dc.title all "${cql(palavras)}"`, ...daCriador])
      const r = doFundo(todos.filter((x) => !/\d{4}/.test(x.data) && parecido(x, t, palavras) >= 0.6))
      if (r.length === 1 && todos.filter((x) => parecido(x, t, palavras) >= 0.6).length === 1) return r[0].ark
    }
  }
  return ''
}
