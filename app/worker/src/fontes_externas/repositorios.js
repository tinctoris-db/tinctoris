// Repositórios institucionais portugueses em DSpace 7 (interface REST pública): teses, dissertações, artigos e
// capítulos depositados pelas instituições. Começa pelo RECIPP (Politécnico do Porto, inclui a ESMAE).
// Para acrescentar outro repositório DSpace 7: uma linha em REPOSITORIOS (nome e endereço do servidor).
// (o RCAAP agrega estes repositórios, mas a sua interface de pesquisa não respondeu a pedidos automáticos;
//  o conteúdo do RCAAP já chega pelo OpenAIRE)
import { obterJson, pessoa, candidato } from './util.js'

// (instituicao: a instituição de que as escolas fazem parte, acrescentada quando o registo só diz a escola)
export const REPOSITORIOS = [{ nome: 'RECIPP (P.Porto)', servidor: 'https://recipp.ipp.pt/server', instituicao: 'Politécnico do Porto' }]

const TIPOS = [
  [/doctoralThesis|doctoral thesis/i, 'Tese / dissertação', 'Doutoramento'],
  [/masterThesis|master thesis/i, 'Tese / dissertação', 'Mestrado'],
  [/bachelorThesis|thesis/i, 'Tese / dissertação', ''],
  [/bookPart|book part|chapter/i, 'Capítulo de livro'],
  [/conferenceObject|conference/i, 'Capítulo de livro'],
  [/article|review/i, 'Artigo'],
  [/book/i, 'Livro'],
  [/report/i, 'Relatório'],
]

const valores = (md, k) => (md[k] || []).map((x) => x.value).filter(Boolean)

// "Dissertação apresentada à Escola Superior de Música e Artes do Espetáculo como requisito…" → a instituição
// ("… à Escola Superior de Música e Artes do Espetáculo e à Escola Superior de Educação como …" → "… Espetáculo e Escola
//  Superior de Educação")
const instituicaoDe = (s) => ((/apresentad[ao] (?:à|ao|a)\s+(.+?)\s+(?:como|para)\b/i.exec(String(s || '')) || [])[1] || '').replace(/\s+e\s+(?:à|ao|a)\s+/gi, ' e ')

export function candidatoDspace(item, nomeRepositorio, instituicaoMae = '') {
  const md = item.metadata || {}
  const tipoTexto = [...valores(md, 'rcaap.type'), ...valores(md, 'dc.type')].join(' ')
  const [, tipo = 'Outro', grau = ''] = TIPOS.find(([re]) => re.test(tipoTexto)) || []
  const metadados = {}
  if (tipo === 'Tese / dissertação') {
    if (grau) metadados.grau = grau
    const orient = valores(md, 'dc.contributor.advisor')
    if (orient.length) metadados.orientacao = orient.join('; ')
    const inst = valores(md, 'thesis.degree.grantor')[0] || instituicaoDe(valores(md, 'thesis.degree.name')[0])
    if (inst) metadados.instituicao = instituicaoMae && !inst.toLowerCase().includes(instituicaoMae.toLowerCase()) && !/polit[ée]cnico|universidade/i.test(inst) ? `${inst}, ${instituicaoMae}` : inst
  }
  const revista = valores(md, 'dc.relation.ispartof')[0] || valores(md, 'dc.source')[0]
  if (tipo === 'Artigo' && revista) metadados.revista = revista
  const doi = (valores(md, 'dc.identifier.doi')[0] || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  return candidato({
    fonte: nomeRepositorio,
    tipo_sugerido: tipo,
    titulo: valores(md, 'dc.title')[0] || item.name || '',
    autores: valores(md, 'dc.contributor.author').map((n) => pessoa(n)).filter(Boolean),
    data: valores(md, 'dc.date.issued')[0] || '',
    editora: valores(md, 'dc.publisher')[0] || '',
    doi,
    url: valores(md, 'dc.identifier.uri')[0] || (item.handle ? `http://hdl.handle.net/${item.handle}` : ''),
    metadados,
    palavras_chave: valores(md, 'dc.subject').slice(0, 10),
  })
}

export async function dspacePesquisar({ titulo, autor, linhas = 5 }, email, repositorio = REPOSITORIOS[0]) {
  if (!titulo) return []
  const q = [titulo, autor].filter(Boolean).join(' ').replace(/[():"[\]{}^~*?\\/!+-]/g, ' ').replace(/\s+/g, ' ').trim()
  const j = await obterJson(`${repositorio.servidor}/api/discover/search/objects?dsoType=ITEM&size=${linhas}&query=${encodeURIComponent(q)}`, { email, timeout: 30000 })
  const objetos = j?._embedded?.searchResult?._embedded?.objects || []
  return objetos.map((o) => o?._embedded?.indexableObject).filter(Boolean).map((it) => candidatoDspace(it, repositorio.nome, repositorio.instituicao))
}
