// Catálogos de fontes musicais antigas: RISM (manuscritos e impressos) e DIAMM (manuscritos até c. 1650).
// Com sigla + cota a identificação é quase exata; nos impressos, o ano + compositor + título na fonte
// chegam normalmente para encontrar o registo RISM (séries A/I e B/I).
import { obterJson, pessoa, primeiro, candidato, semelhanca, contido, normalizar } from './util.js'
import { cantusPorCota, ligacoesCantus } from './cantus.js'
import { gallicaPesquisar } from './gallica.js'
import { bachPorCota } from './bach_digital.js'
import { k10plusPesquisar } from './k10plus.js'
import { europeanaDigitalizacoes } from './europeana.js'

// Catálogos que descrevem a própria fonte antiga (não um livro moderno sobre ela): uma identificação por eles
// vale como a do RISM — forma, tipo, natureza primária, título da própria fonte
export const CATALOGOS_FONTES = /RISM|DIAMM|Cantus|PEM|Gallica|BSB|BNP|K10plus|Bach digital/

const RISM = 'https://rism.online'
const DIAMM = 'https://www.diamm.ac.uk'
const JSONLD = { Accept: 'application/ld+json' }

// Texto de um rótulo multilingue do RISM ({en:[…]}, {none:[…]}…)
const rotulo = (obj) => primeiro(obj?.en || obj?.none || obj?.pt || Object.values(obj || {})[0])
const rotulos = (obj) => obj?.en || obj?.none || obj?.pt || Object.values(obj || {})[0] || []

// Latim impresso: V por U ("PRIMVS"), J por I; para comparar títulos
export const latim = (s) => normalizar(s).replace(/v/g, 'u').replace(/j/g, 'i')
const semelhancaLatim = (a, b) => Math.max(semelhanca(latim(a), latim(b)), contido(latim(a), latim(b)), contido(latim(b), latim(a)) * 0.9)

// Palavras em maiúsculas com V no lugar de U ("VOCIBVS" → "VOCIBUS"), para pesquisar
const desLatinizar = (s) => String(s || '').replace(/\b([A-Z])([A-Z]*)\b/g, (_, a, resto) => a + resto.replace(/V/g, 'U'))

// Sigla + cota comparáveis: "P-Cug MM.12" = "p-cug mm 12"
export const chaveCota = (sigla, cota) => `${sigla || ''} ${cota || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '')

// ---------------- Siglas RISM (validadas no próprio RISM; guardadas em memória)

const siglas = new Map()

// Devolve { sigla, instituicao, local } se "texto" for uma sigla RISM que existe, ou null
export async function siglaRism(texto, email) {
  const s = String(texto || '').trim()
  if (!/^[A-Z]{1,3}-[A-Za-z]{1,8}$/i.test(s)) return null
  const chave = s.toLowerCase()
  if (siglas.has(chave)) return siglas.get(chave)
  // (a pesquisa "siglum:" distingue maiúsculas: "E-TUY" mas "P-Cug"; tentar as grafias habituais)
  const [pais, cidade] = s.split('-')
  const grafias = [...new Set([s, `${pais.toUpperCase()}-${cidade}`, `${pais.toUpperCase()}-${cidade.toUpperCase()}`, `${pais.toUpperCase()}-${cidade[0].toUpperCase()}${cidade.slice(1).toLowerCase()}`])]
  let res = null
  for (const g of grafias) {
    const j = await obterJson(`${RISM}/search?mode=institutions&rows=20&q=${encodeURIComponent(`siglum:${g}`)}`, { email, cabecalhos: JSONLD })
    for (const it of j.items || []) {
      const m = /^(.*?),\s*([^,(]+?)\s*\(([^)]+)\)\s*$/.exec(rotulo(it.label))
      if (m && m[3].toLowerCase() === chave) {
        res = { sigla: m[3], instituicao: m[1].trim(), local: m[2].trim(), url: it.id }
        break
      }
    }
    if (res) break
  }
  // Variante da sigla ("P-BRd" = P-BRad, "P-Arouca" = P-AR): só quando há uma única sigla equivalente no RISM
  if (!res) {
    const eq = await siglasEquivalentes(s, email)
    if (eq.length === 1) res = { ...eq[0], variante: s }
  }
  siglas.set(chave, res)
  return res
}

// Siglas do RISM equivalentes a uma variante escrita no nome do ficheiro (decisão do Pedro, 2/10/2026: aceitar
// variantes equivalentes das siglas). Duas maneiras:
// - abreviatura: as letras da variante aparecem, pela mesma ordem, na sigla do RISM, que começa da mesma maneira
//   ("P-BRd" → P-BRad; "P-Ev" → P-EVc, P-EVp, P-EVad… — várias: fica por decidir);
// - nome da cidade em vez das letras ("P-Arouca" → a única sigla do RISM em Arouca, P-AR).
// Devolve a lista de { sigla, instituicao, local, url } possíveis (vazia se nenhuma)
const equivalentes = new Map()
const eSubsequencia = (curta, longa) => {
  let i = 0
  for (const ch of longa) if (ch === curta[i]) i++
  return i === curta.length
}
// Instituições do RISM ("Arquivo Distrital, Braga (P-BRad)") → { sigla, instituicao, local, url }
async function institucoes(q, email) {
  const j = await obterJson(`${RISM}/search?mode=institutions&rows=100&q=${encodeURIComponent(q)}`, { email, cabecalhos: JSONLD })
  const lista = []
  for (const it of j.items || []) {
    const m = /^(.*?),\s*([^,(]+?)\s*\(([^)]+)\)\s*$/.exec(rotulo(it.label))
    if (m) lista.push({ sigla: m[3], instituicao: m[1].trim(), local: m[2].trim(), url: it.id })
  }
  return lista
}
// (abreviatura: mesmas duas primeiras letras e as outras pela mesma ordem — "P-BRd" em P-BRad, não em P-BRs)
export function abreviaturasDe(texto, lista) {
  const [pais, resto = ''] = String(texto || '').split('-')
  const P = pais.toUpperCase()
  const r = resto.toLowerCase()
  return (lista || []).filter((x) => {
    if (!x.sigla.startsWith(`${P}-`)) return false
    const c = x.sigla.slice(P.length + 1).toLowerCase()
    return r.length >= 2 && c !== r && c.startsWith(r.slice(0, 2)) && eSubsequencia(r, c)
  })
}
export async function siglasEquivalentes(texto, email) {
  const s = String(texto || '').trim()
  if (!/^[A-Z]{1,3}-[A-Za-z]{2,8}$/i.test(s)) return []
  const chave = s.toLowerCase()
  if (equivalentes.has(chave)) return equivalentes.get(chave)
  const [pais, resto] = s.split('-')
  const P = pais.toUpperCase()
  const r = resto.toLowerCase()
  let lista = []
  lista = abreviaturasDe(s, await institucoes(`siglum:${P}-${resto[0].toUpperCase()}*`, email))
  // (nome da cidade: "Arouca", "Braga" — só conta se houver uma única sigla nessa cidade)
  if (!lista.length && r.length >= 4 && /^[A-Z]?[a-zà-ÿ]+$/.test(resto)) {
    const daCidade = (await institucoes(resto, email)).filter((x) => x.sigla.startsWith(`${P}-`) && normalizar(x.local) === normalizar(resto))
    lista = daCidade
  }
  const unicas = [...new Map(lista.map((x) => [x.sigla, x])).values()]
  equivalentes.set(chave, unicas)
  return unicas
}

// ---------------- RISM: registo completo de uma fonte

function valorResumo(lista, rotuloEn) {
  const s = (lista || []).find((x) => rotulos(x.label).includes(rotuloEn))
  return s ? rotulos(s.value) : []
}

// "Lhéritier, Jean (1480c-1552c)" → pessoa
function compositorRism(nome, papel = 'compositor') {
  const limpo = String(nome || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (!limpo || /^anonymus$|^anonymous$/i.test(limpo)) return limpo ? { literal: 'Anónimo', papel } : null
  return pessoa(limpo, papel)
}

// "Phinot, Dominique (1510c-1561a)" → "Dominique Phinot"; "Jachet de Mantua (1483-1559)" → "Jachet de Mantua"
function nomeLegivel(nome) {
  const s = String(nome || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const m = /^([^,]+),\s*(.+)$/.exec(s)
  return m ? `${m[2]} ${m[1]}` : s
}

// Cidades de impressão (e grafias antigas) que o RISM junta ao nome do impressor
const CIDADES = /^(venezia|venetia|venetiis|venice|roma|romae|rome|milano|mediolani|milan|napoli|neapoli|naples|bologna|bononiae|firenze|florentiae|florence|genova|torino|parma|ferrara|mantova|palermo|messina|antwerpen|anversa|antverpiae|antwerp|anvers|amsterdam|amstelodami|den haag|la haye|'s-gravenhage|leiden|utrecht|rotterdam|paris|parisiis|lyon|lugduni|london|londini|oxford|edinburgh|dublin|leipzig|lipsiae|nürnberg|nuremberg|norimbergae|augsburg|augustae vindelicorum|münchen|monachii|munich|wien|viennae|vienna|praha|prague|kraków|cracoviae|dresden|berlin|hamburg|frankfurt|francofurti|köln|coloniae|mainz|strasbourg|argentorati|basel|basileae|zürich|genève|madrid|matriti|sevilla|hispali|toledo|valencia|salamanca|barcelona|lisboa|lisbon|olisipone|coimbra|conimbricae|bruxelles|brussel|bruxellae|leuven|lovanii|louvain|douai|duaci|copenhagen|københavn|stockholm)$/i
function nomeDoImpressor(rotuloRism, localPub) {
  // (datas "(1557-1601)" / "(16/17)" e "[s. n.]" / "[s. l.]", sem nome nem lugar, saem)
  const r = String(rotuloRism || '').replace(/\s*\([^)]*\d[^)]*\)/g, '').replace(/\[\s*s\.\s*[nl]\.\s*\]/gi, '').replace(/^[\s,;]+|[\s,;]+$/g, '').trim()
  const i = r.indexOf(',')
  if (i < 0) return r
  const cabeca = r.slice(0, i).trim()
  const cauda = r.slice(i + 1).trim()
  // "Nome, Cidade" ou "Nome, Cidade; Cidade; …": fica o nome (as cidades vão para o local)
  const eLugar = (l) => CIDADES.test(normalizar(l)) || normalizar(l) === normalizar(localPub || '')
  const segmentos = cauda.split(/\s*[;,]\s*/).filter(Boolean)
  const semLugares = segmentos.filter((l) => !eLugar(l))
  // "Apelido, Nome" (e "Apelido, Nome, Cidade"): pessoa
  const nomeProprio = /^[\p{Lu}][\p{Ll}'’-]+(?: [\p{Lu}][\p{Ll}'’.-]*)?$/u
  if (semLugares.length === 1 && semLugares[0] === segmentos[0] && nomeProprio.test(semLugares[0]) && !eLugar(semLugares[0]) && (segmentos.length === 1 || segmentos.slice(1).every(eLugar))) return `${semLugares[0]} ${cabeca}`
  // "Nome, Cidade" ou "Nome, Cidade; Cidade; …": fica o nome (as cidades vão para o local)
  if (segmentos.some(eLugar) || /;/.test(cauda)) return cabeca
  return r
}

export async function rismFonte(id, email) {
  const url = /^https?:/.test(id) ? id : `${RISM}/sources/${id}`
  const j = await obterJson(url, { email, cabecalhos: JSONLD })
  const resumo = j.contents?.summary || []
  const grupo = (j.materialGroups?.items || [])[0]?.summary || []
  const tipoFonte = rotulo(valorResumo(resumo, 'Source type'))
  const impresso = /print/i.test(tipoFonte)
  const tituloFonte = primeiro(valorResumo(resumo, 'Title on source'))
    .replace(/^\s*\[(caption|cover|head|spine|title page|added) title:?\]\s*/i, '')
    .replace(/\s*\|\s*/g, ' ')
    // notas do catalogador ("[cut of some fruit]") e nome da voz do livro de partes ("CANTUS.")
    .replace(/\s*\[\p{Ll}[^\]]*\]/gu, '')
    .replace(/^(cantus|altus|tenor|bassus|quintus|quinta pars|sextus|sexta pars|superius|discantus|contratenor|vagans)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const uniforme = primeiro(valorResumo(resumo, 'Standardized title'))
  const serie = valorResumo(resumo, 'Series statement fields').join('; ')
  const partes = rotulo(j.label).split('; ')
  // Manuscrito: a sigla e a cota estão no rótulo ("…; Manuscript copy; P-Cug MM.12")
  const [siglaMs, ...cotaMs] = !impresso && partes.length > 2 ? partes[partes.length - 1].split(' ') : []
  const exemplares = (j.exemplars?.items || []).map((x) => rotulo(x.label)).filter(Boolean)
  const arquivoMs = !impresso && exemplares[0] ? exemplares[0].replace(/\s*\([^)]*\)\s*,.*$/, '') : ''
  const autores = []
  if (j.creator?.relatedTo) autores.push(compositorRism(rotulo(j.creator.relatedTo.label)))
  // Coletânea impressa (RISM B/I) sem compositor único: "Vários"
  if (!autores.length && impresso && /B\/I/.test(serie)) autores.push({ literal: 'Vários', papel: 'compositor' })
  // Conteúdo da coletânea (obras e compositores); o RISM pode listar só parte: pedir a lista completa
  let itens = j.sourceItems?.items || []
  if (j.sourceItems?.url && j.sourceItems.totalItems > itens.length) {
    try {
      itens = (await obterJson(`${j.sourceItems.url}?rows=100`, { email, cabecalhos: JSONLD })).items || itens
    } catch (_) {}
  }
  // Impressor / editor: nas "relações" do registo (papel pbl = publisher, prt = printer…), ou no resumo do exemplar.
  // O RISM escreve "Nome, Cidade" ("Ricciardo Amadino, Venezia": a cidade vai para o local) ou "Apelido, Nome"
  // ("Fernandez de Cordova, Francisco" → "Francisco Fernandez de Cordova")
  // ("[s. l.]" = sem lugar)
  const localPub = primeiro(valorResumo(grupo, 'Place of publication')).replace(/^\[?\s*s\.\s*l\.\s*\]?$/i, '')
  const impressores = (j.relationships?.items || [])
    .filter((r) => /^(pbl|prt|pbd|bsl|dst|pop|pma)$/.test(r.role?.value || ''))
    .map((r) => nomeDoImpressor(rotulo(r.relatedTo?.label), localPub))
    .filter(Boolean)
  // (sem local de publicação no exemplar: a cidade que o RISM junta ao nome do impressor, "Windet, John, London")
  const cidadeDoImpressor = (j.relationships?.items || [])
    .filter((r) => /^(pbl|prt|pbd)$/.test(r.role?.value || ''))
    .flatMap((r) => rotulo(r.relatedTo?.label).split(/\s*[;,]\s*/).slice(1))
    .find((l) => CIDADES.test(normalizar(l))) || ''
  const obras = itens.map((it) => ({ titulo: rotulo(it.label).split('; ')[0], compositor: nomeLegivel(rotulo(it.creator?.relatedTo?.label)) }))
  const compositores = [...new Set(obras.map((o) => o.compositor).filter((c) => c && !/^an[oó]n/i.test(c)))]
  const notaConteudo = (j.referencesNotes?.notes || []).find((n) => rotulos(n.label).includes('Contents note'))
  const conteudo = obras.length ? obras.map((o) => (o.compositor ? `${o.titulo} — ${o.compositor}` : o.titulo)).join('\n') : rotulos(notaConteudo?.value).join('\n')
  // (o impressor e a cidade que o RISM junta no fim do título, "[Venezia, Ricciardo Amadino]", vão para os seus campos)
  const semImprenta = impresso ? tituloFonte.replace(/\s*\[[^\]]*\]\s*[.,;]?\s*$/, (m) => (/\d{4}|,/.test(m) || (localPub && m.includes(localPub)) ? '' : m)).trim() : tituloFonte
  const titulo = semImprenta || (uniforme && uniforme !== '[No title]' ? uniforme : '') || (siglaMs ? `${siglaMs} ${cotaMs.join(' ')}` : '')
  return candidato({
    fonte: 'RISM',
    tipo_sugerido: impresso ? 'Partitura' : 'Manuscrito',
    titulo,
    autores: autores.filter(Boolean),
    // ("1850 (1850c)": fica a forma legível)
    data: (primeiro(valorResumo(resumo, 'Dates')) || primeiro(valorResumo(grupo, 'Date'))).replace(/\s*\([^)]*\)\s*$/, ''),
    editora: impresso ? [...new Set(impressores.length ? impressores : [...valorResumo(grupo, 'Publisher, copyist'), ...valorResumo(grupo, 'Publisher')].map((x) => nomeDoImpressor(x, localPub)))].filter(Boolean).join('; ') : '',
    local: impresso ? localPub || cidadeDoImpressor : '',
    url: j.id || url,
    metadados: {
      forma: impresso ? 'Impresso' : 'Manuscrito',
      rism: String(j.id || url).split('/').pop(),
      rism_serie: serie ? `RISM ${serie}` : '',
      titulo_uniforme: uniforme && uniforme !== '[No title]' ? uniforme : '',
      sigla: siglaMs || '',
      cota: cotaMs.join(' '),
      arquivo: arquivoMs,
      copista: !impresso ? primeiro(valorResumo(grupo, 'Publisher, copyist')) : '',
      formato: primeiro(valorResumo(grupo, 'Format, extent')),
      exemplares: impresso ? exemplares.slice(0, 40).join('\n') : '',
      conteudo,
      compositores: compositores.join('; '),
    },
  })
}

async function rismProcurar(q, email, ano = '') {
  const filtro = ano ? `&fq=${encodeURIComponent(`date-range:[${ano} TO ${ano}]`)}` : ''
  const j = await obterJson(`${RISM}/search?mode=sources&rows=20&q=${encodeURIComponent(q)}${filtro}`, { email, cabecalhos: JSONLD })
  // (registos "external" são cópias do DIAMM/Cantus dentro do RISM: consultados na origem)
  return (j.items || []).filter((it) => !/\/external\//.test(it.id || '')).map((it) => {
    const s = it.summary || {}
    return { id: it.id, rotulo: rotulo(it.label), data: rotulo(s.dateStatements?.value) }
  })
}

// Impressos de um compositor num ano ("Rossi", 1608): para ficheiros que só dizem isso no nome
export async function rismImpressosDe(apelido, ano, email) {
  const j = await obterJson(`${RISM}/search?mode=sources&rows=40&q=${encodeURIComponent(apelido)}&fq=${encodeURIComponent(`date-range:[${ano} TO ${ano}]`)}`, { email, cabecalhos: JSONLD })
  const alvo = normalizar(apelido)
  return (j.items || [])
    .filter((it) => /; Print$/.test(rotulo(it.label)) && !/\/external\//.test(it.id || ''))
    .filter((it) => {
      // "Rossi, Salamone (1570c-1630c)": o apelido tem de ser o do compositor (não basta aparecer no título)
      const comp = rotulo(it.summary?.sourceComposer?.value)
      return normalizar(comp.split(',')[0]) === alvo
    })
    .map((it) => it.id)
}

// Manuscrito com sigla + cota: pesquisa pela cota (com variantes de pontuação) e confirma a sigla
async function rismPorCota(sigla, cota, email) {
  const base = cota.trim()
  // ("MM 12", "MM.12", "MM. 12": o RISM guarda a cota tal como a biblioteca a escreve)
  const variantes = [...new Set(['$1 $2', '$1.$2', '$1. $2'].map((f) => base.replace(/^([A-Za-z]+)\.?\s*(\d)/, f)).concat(base))]
  const alvo = chaveCota(sigla, cota)
  for (const v of variantes) {
    const itens = await rismProcurar(`shelfmark:"${v}"`, email)
    const certo = itens.find((it) => {
      const partes = it.rotulo.split('; ')
      return partes.length > 2 && chaveCota(partes[partes.length - 1], '') === alvo
    })
    if (certo) return certo.id
  }
  return null
}

// Palavras de pesquisa de um título lido (sem pontuação, V→U nas maiúsculas, só as mais distintivas)
function palavrasTitulo(t, n = 4) {
  const vazias = new Set(['del', 'della', 'di', 'de', 'la', 'le', 'les', 'et', 'cum', 'in', 'ad', 'per', 'con', 'the', 'of', 'and', 'und', 'der', 'die', 'das', 'liber', 'libro', 'book'])
  return desLatinizar(t)
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 4 && !vazias.has(w.toLowerCase()) && !/^\d+$/.test(w))
    .slice(0, n)
    .join(' ')
}

// Pontuação própria (0..1): ano, compositor e título na fonte
function pontuarMusical(c, q) {
  const ano = String(q.ano || '').slice(0, 4)
  const anoC = (/(\d{4})/.exec(c.data || '') || [])[1] || ''
  let conf = 0
  if (/^\d{4}$/.test(ano) && anoC) conf += ano === anoC ? 0.35 : -0.3
  else conf += 0.15
  const apelido = normalizar(q.autor || '').split(' ').filter((w) => w.length > 2).pop()
  const nomes = normalizar((c.autores || []).map((a) => [a.literal, a.nome, a.apelido].join(' ')).join(' '))
  if (apelido) conf += nomes.includes(apelido) ? 0.25 : 0
  else conf += 0.15
  const titulos = [q.titulo, q.tituloAlt].filter(Boolean)
  const t = Math.max(0, ...titulos.map((x) => Math.max(semelhancaLatim(x, c.titulo), semelhancaLatim(x, c.metadados?.titulo_uniforme || ''))))
  conf += t * 0.4
  if (q.forma && c.metadados?.forma && q.forma.toLowerCase() !== c.metadados.forma.toLowerCase()) conf *= 0.7
  c.confianca = Math.max(0, Math.min(0.96, Math.round(conf * 100) / 100))
  c.pontuado = true
  return c
}

// Impresso (ou manuscrito sem cota): várias pesquisas curtas, registos completos dos melhores
async function rismPorTitulo(q, email) {
  const ano = /^\d{4}$/.test(String(q.ano || '')) ? q.ano : ''
  const apelido = normalizar(q.autor || '').split(' ').filter((w) => w.length > 2).pop() || ''
  const palavras = palavrasTitulo(q.titulo)
  // (com ano: filtro de datas do RISM, que é exato; sem ano: pesquisa livre)
  const consultas = [
    apelido && ano && [apelido, ano],
    palavras && ano && [palavras.split(' ').slice(0, 2).join(' '), ano],
    apelido && palavras && [`${apelido} ${palavras.split(' ').slice(0, 2).join(' ')}`, ''],
    !ano && !apelido && palavras && [palavras, ''],
  ].filter(Boolean)
  const vistos = new Map()
  for (const [c, a] of consultas) {
    for (const it of await rismProcurar(c, email, a)) if (!vistos.has(it.id)) vistos.set(it.id, it)
  }
  // Preferir o ano certo e a forma certa (impresso/manuscrito) antes de pedir os registos completos
  const querImpresso = q.forma === 'impresso'
  const lista = [...vistos.values()]
    .map((it) => ({ ...it, pontos: (ano && it.data.includes(ano) ? 2 : 0) + (q.forma ? (/; Print$/.test(it.rotulo) === querImpresso ? 1 : 0) : 0) }))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 6)
  const res = []
  for (const it of lista) {
    try {
      res.push(pontuarMusical(await rismFonte(it.id, email), q))
    } catch (_) {}
  }
  return res
}

// ---------------- DIAMM

async function diammFonte(url, email) {
  const j = await obterJson(url, { email })
  const arq = j.archive || {}
  return candidato({
    fonte: 'DIAMM',
    tipo_sugerido: 'Manuscrito',
    titulo: j.name ? `${j.display_name} (${j.name})` : j.display_name,
    autores: [],
    data: j.date_statement || '',
    url: j.url || url,
    metadados: {
      forma: 'Manuscrito',
      sigla: arq.siglum || '',
      cota: j.shelfmark || '',
      arquivo: arq.name || '',
      local_arquivo: [arq.city, arq.country].filter(Boolean).join(', '),
      suporte: j.surface_type || '',
      dimensoes: j.measurements || '',
      notacao_catalogo: (j.notations || []).map((n) => n.name).join('; '),
      descricao_catalogo: j.source_type || '',
      diamm: String(j.pk || ''),
    },
  })
}

async function diammProcurar(q, email) {
  const j = await obterJson(`${DIAMM}/search/?type=sources&q=${encodeURIComponent(q)}`, { email })
  return (j.results || []).filter((r) => r.type === 'source' && r.url)
}

// ---------------- Pesquisa combinada
// q: { titulo, tituloAlt, autor, ano, sigla, cota, forma: 'manuscrito' | 'impresso' | '', exemplar, cotaDoNome }
// (cotaDoNome: a sigla e a cota vêm do nome do ficheiro)
// (exemplar: o exemplar digitalizado reconhecido pela folha inicial, com o registo do catálogo da biblioteca)
// Ordem: RISM e DIAMM primeiro; depois o Cantus (manuscritos de cantochão, com a PEM pelo Cantus Index); só quando
// nenhum destes identifica a fonte, o registo do exemplar (Gallica/BSB) ou a pesquisa na Gallica.
// Devolve também "outros": ligações para a mesma fonte noutras bases (Cantus Database, PEM, SEMM…), e
// "digitalizacoes": outras digitalizações da mesma edição noutras bibliotecas (Europeana).
// opcoes.europeana: chave da Europeana (sem ela, a chave pública de demonstração)
export async function pesquisarMusical(q, email, opcoes = {}) {
  const candidatos = []
  const erros = []
  const outros = []
  const tentar = async (nome, fn) => {
    try {
      candidatos.push(...((await fn()) || []).filter(Boolean))
    } catch (e) {
      erros.push(`${nome}: ${e.message}`)
    }
  }
  const limiar = 0.8
  const bom = () => candidatos.some((c) => c.confianca >= limiar)

  // 1) Sigla + cota: identificação quase exata
  if (q.sigla && q.cota) {
    await tentar('rism', async () => {
      const id = await rismPorCota(q.sigla, q.cota, email)
      if (!id) return []
      const c = await rismFonte(id, email)
      c.confianca = 0.97
      c.pontuado = true
      return [c]
    })
    await tentar('diamm', async () => {
      const alvo = chaveCota(q.sigla, q.cota)
      const r = (await diammProcurar(`${q.sigla} ${q.cota}`, email)).find((x) => chaveCota(x.display_name, '') === alvo)
      if (!r) return []
      const c = await diammFonte(r.url, email)
      c.confianca = 0.97
      c.pontuado = true
      return [c]
    })
    // Cantochão: em que bases da rede Cantus está esta fonte (Cantus Database, PEM…) e, na Cantus Database, a descrição
    // (também num «impresso» quando a sigla e a cota vêm do nome do ficheiro: a IA pode ler mal uma capa vazia — Pedro,
    //  2/10, #15445 «P-BRd_964»; se a PEM/Cantus tiver a fonte, é ela que diz se é manuscrito)
    if (q.forma !== 'impresso' || q.cotaDoNome) {
      try {
        const r = await cantusPorCota(q.sigla, q.cota, email)
        outros.push(...ligacoesCantus(r.indice))
        if (r.candidato) {
          r.candidato.confianca = 0.97
          r.candidato.pontuado = true
          if (candidatos.length) completarCom(candidatos[0], r.candidato)
          else candidatos.push(r.candidato)
        } else if (r.indice && candidatos.length) {
          // (só no Cantus Index, ex.: na PEM: o arquivo e a cidade que o RISM/DIAMM não tenham dado)
          const m = candidatos[0].metadados
          if (!m.arquivo && r.indice.arquivo) m.arquivo = r.indice.arquivo
          if (!m.local_arquivo && r.indice.cidade) m.local_arquivo = r.indice.cidade
        }
      } catch (e) {
        erros.push(`cantus: ${e.message}`)
      }
    }
    // Fontes de Bach (e da família) no Bach digital: copista, datação e cadeia de possuidores
    try {
      const b = await bachPorCota(q.sigla, q.cota, email)
      if (b) {
        outros.push(`Bach digital: ${b.url}`)
        b.confianca = 0.97
        b.pontuado = true
        if (candidatos.length) completarCom(candidatos[0], b)
        else candidatos.push(b)
      }
    } catch (e) {
      erros.push(`bach digital: ${e.message}`)
    }
    if (candidatos.length) return { candidatos: juntarPorCota(candidatos), erros, outros }
  }

  // 2) Sem cota (ou cota não encontrada): pesquisa pelo título, compositor e ano
  if (q.titulo || q.autor) await tentar('rism', () => rismPorTitulo(q, email))
  if (q.forma !== 'impresso' && q.titulo) {
    await tentar('diamm', async () => {
      const r = (await diammProcurar(palavrasTitulo(q.titulo, 3) || q.titulo, email)).slice(0, 3)
      const res = []
      for (const x of r) res.push(pontuarMusical(await diammFonte(x.url, email), q))
      return res
    })
  }

  // O exemplar da folha inicial confirma um registo do RISM: está na lista de exemplares (sigla + cota), ou tem o mesmo
  // título e o mesmo ano (desempata, por exemplo, o "Missarum liber primus" e o "secundus" do mesmo ano)
  const ex = q.exemplar
  if (ex?.candidato || (ex?.sigla && ex?.cota)) {
    const anoEx = (/(\d{4})/.exec(ex.candidato?.data || '') || [])[1]
    const rism = candidatos.filter((x) => x.fonte === 'RISM')
    // (pelo título: só o registo mais parecido, e só se for o único com essa semelhança)
    const sem = rism.map((c) => {
      const anoC = (/(\d{4})/.exec(c.data || '') || [])[1]
      return ex.candidato?.titulo && (!anoEx || !anoC || anoEx === anoC) ? Math.max(semelhancaLatim(ex.candidato.titulo, c.titulo), semelhancaLatim(ex.candidato.titulo, c.metadados?.titulo_uniforme || '')) : 0
    })
    const melhor = Math.max(0, ...sem)
    rism.forEach((c, i) => {
      const naLista = ex.sigla && ex.cota && String(c.metadados?.exemplares || '').split('\n').some((l) => l.includes(`(${ex.sigla})`) && chaveCota('', l.split('), ').pop()) === chaveCota('', ex.cota))
      if (naLista) c.confianca = Math.max(c.confianca, 0.97)
      else if (melhor >= 0.6 && sem[i] === melhor && sem.filter((x) => x === melhor).length === 1) c.confianca = Math.min(0.98, Math.round((c.confianca + 0.06) * 100) / 100)
    })
  }

  // 3) Nada seguro no RISM nem no DIAMM: o registo do próprio exemplar (pelo identificador da folha inicial) ou,
  //    sem ele, a pesquisa na Gallica (partituras e manuscritos da BnF)
  if (!bom()) {
    if (q.exemplar?.candidato) candidatos.push(q.exemplar.candidato)
    else if (q.titulo || q.autor) {
      await tentar('gallica', async () => (await gallicaPesquisar(q, email, { palavras: (t) => palavrasTitulo(t, 4) })).map((c) => pontuarMusical(c, q)))
    }
    // (impressos: o catálogo comum alemão K10plus, com os números VD16/VD17/VD18 e as cotas dos exemplares)
    // (só com o ano: sem ele, as reedições e os fac-símiles modernos com o mesmo título passariam à frente)
    if (!bom() && q.forma !== 'manuscrito' && /^\d{4}$/.test(String(q.ano || '')) && (q.titulo || q.autor)) {
      await tentar('k10plus', async () => (await k10plusPesquisar(q, email, { palavras: (t) => palavrasTitulo(t, 3) })).map((c) => pontuarMusical(c, q)))
    }
  }
  candidatos.sort((a, b) => b.confianca - a.confianca)

  // Outras digitalizações da mesma edição (Europeana): só para impressos identificados com segurança
  let digitalizacoes = []
  const melhor = candidatos[0]
  if (melhor && melhor.confianca >= limiar && (melhor.metadados?.forma === 'Impresso' || q.forma === 'impresso')) {
    try {
      const autor = (melhor.autores || []).find((a) => a.papel === 'compositor' || a.papel === 'autor')
      digitalizacoes = await europeanaDigitalizacoes(
        { titulo: melhor.metadados?.titulo_uniforme && melhor.metadados.titulo_uniforme !== '[No title]' ? melhor.metadados.titulo_uniforme : melhor.titulo, autor: autor?.apelido || autor?.literal || q.autor, ano: (/(\d{4})/.exec(melhor.data || '') || [])[1] || q.ano },
        { email, chave: opcoes.europeana, semelhanca: semelhancaLatim }
      )
      // (a mesma pesquisa com o título na fonte, se o uniformizado não deu nada)
      if (!digitalizacoes.length && melhor.metadados?.titulo_uniforme) {
        digitalizacoes = await europeanaDigitalizacoes({ titulo: melhor.titulo, autor: autor?.apelido || q.autor, ano: (/(\d{4})/.exec(melhor.data || '') || [])[1] || q.ano }, { email, chave: opcoes.europeana, semelhanca: semelhancaLatim })
      }
    } catch (e) {
      erros.push(`europeana: ${e.message}`)
    }
  }
  return { candidatos, erros, outros, digitalizacoes }
}

// O que um segundo catálogo da mesma fonte acrescenta sem mudar o que o primeiro disse
function completarCom(c, outro) {
  for (const [k, v] of Object.entries(outro.metadados || {})) if (v && !c.metadados[k]) c.metadados[k] = v
  if (!c.data && outro.data) c.data = outro.data
}

// O mesmo manuscrito no RISM e no DIAMM: um só candidato com os dados dos dois
function juntarPorCota(lista) {
  const rism = lista.find((c) => c.fonte === 'RISM')
  const diamm = lista.find((c) => c.fonte === 'DIAMM')
  if (!rism || !diamm) return lista
  rism.metadados = { ...diamm.metadados, ...Object.fromEntries(Object.entries(rism.metadados).filter(([, v]) => v)) }
  if (!rism.data) rism.data = diamm.data
  if ((!rism.titulo || rism.titulo === `${rism.metadados.sigla} ${rism.metadados.cota}`) && diamm.titulo) rism.titulo = diamm.titulo
  rism.fonte = 'RISM + DIAMM'
  return [rism]
}
