// Regras que protegem a identificação das fontes (sobretudo na reanálise), em funções sem acesso à base de dados
// nem à internet, para poderem ser testadas sozinhas (testes/regras_identificacao.test.js).
// Decisões do Pedro (2/10/2026, depois do teste com 22 fichas reais):
// - um registo cujo compositor contradiz o compositor conhecido não tem confiança máxima;
// - uma ficha já identificada num catálogo de fontes só troca de registo se o novo for claramente melhor;
// - um registo de MANUSCRITO não identifica um PDF que é uma edição moderna (salvo sigla + cota no nome);
// - num trabalho académico, o compositor do título é o assunto, não o autor;
// - a reanálise não troca uma data precisa só pelo ano da mesma data.
import { normalizar } from './fontes_externas/util.js'
import { catalogoDe, donoDoCatalogo } from './fontes_externas/obras.js'

const ANONIMO = /^(anonymus|anonymous|an[oó]nimo|anon\.?|anonyme|unbekannt|unknown)$/i
const apelidoDe = (a) => normalizar(a?.apelido || a?.literal || '').split(' ').filter(Boolean).pop() || ''
const eAnonimo = (a) => ANONIMO.test(String(a?.literal || a?.apelido || '').trim())

// Apelidos (normalizados) do compositor que já se sabe: pelo nº de catálogo (BWV → bach), pelos compositores da ficha
// antiga (quando ela veio de um catálogo ou foi corrigida à mão) e pelo nome do ficheiro
export function compositoresConhecidos({ catalogos = [], autoresAntigos = [], autorNome = '' } = {}) {
  const s = new Set()
  for (const c of catalogos) {
    const cat = typeof c === 'string' ? catalogoDe(c) : c
    const dono = cat && donoDoCatalogo(cat.codigo)
    if (dono) s.add(normalizar(dono))
  }
  for (const a of autoresAntigos || []) if (a?.papel === 'compositor' && !eAnonimo(a) && apelidoDe(a)) s.add(apelidoDe(a))
  const n = normalizar(autorNome).split(' ').filter((w) => w.length > 2).pop()
  if (n) s.add(n)
  return s
}

// Família de um nº de catálogo ("BWV 60" → "bwv") e o número completo
const familia = (codigo) => ((/^[A-Za-z]+/.exec(String(codigo || '')) || [''])[0]).toLowerCase()
const codigosDo = (c) => [catalogoDe(c.metadados?.catalogo), catalogoDe(c.titulo)].filter(Boolean).map((x) => x.codigo)

// Um registo de manuscrito (RISM, DIAMM, PEM…)?
export const registoManuscrito = (c) => c?.tipo_sugerido === 'Manuscrito' || /manuscri/i.test(c?.metadados?.forma || '') || /manuscri|aut[oó]graf|autograph|handschrift/i.test(c?.metadados?.suporte || '')

// O PDF é uma edição moderna? (lida como impressa, ou com um ano da fonte de 1800 em diante)
// (um manuscrito do séc. XIX com registo do mesmo ano não conta: o registo tem de ser bem mais antigo do que o ano lido)
export function edicaoModernaPara(c, { forma = '', anoLido = '' } = {}) {
  if (forma === 'impresso') return true
  const ano = Number((/(\d{4})/.exec(String(anoLido || '')) || [])[1])
  if (!(ano >= 1800)) return false
  const anoRegisto = Number((/(\d{4})/.exec(String(c?.data || '')) || [])[1])
  return !anoRegisto || ano - anoRegisto > 25
}

// Ajusta a confiança dos candidatos às regras acima e volta a ordená-los. Devolve as notas (para nota_revisao) sobre
// o candidato que teria sido escolhido e deixou de poder sê-lo.
// opcoes: { conhecidos: Set, catalogo: "BWV 60", forma, anoLido, nomeComCota, limiar }
export function ajustarCandidatos(candidatos, { conhecidos = new Set(), catalogo = '', forma = '', anoLido = '', nomeComCota = false, limiar = 0.8 } = {}) {
  const notas = []
  const alvo = catalogoDe(catalogo)
  const antes = [...candidatos].sort((a, b) => b.confianca - a.confianca)[0]
  // (a confiança original: a nota só se escreve se o candidato recusado teria mesmo ganho — Pedro, 2/10, #16993)
  const confiancaAntes = antes?.confianca || 0
  // (PDF impresso com um ano anterior a 1800, ou sem ano: é um impresso antigo, não uma edição moderna)
  const anoNum = Number((/(\d{4})/.exec(String(anoLido || '')) || [])[1])
  const queEPdf = forma === 'impresso' && !(anoNum >= 1800) ? 'o PDF é um impresso' : 'o PDF é uma edição moderna'
  for (const c of candidatos) {
    const motivos = []
    const compositores = (c.autores || []).filter((a) => !a.papel || a.papel === 'compositor')
    if (conhecidos.size && compositores.length) {
      const algum = compositores.some((a) => !eAnonimo(a) && conhecidos.has(apelidoDe(a)))
      if (!algum) motivos.push(compositores.some(eAnonimo) ? 'o registo é anónimo e o compositor é conhecido' : `o compositor do registo (${compositores.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')}) não é o conhecido`)
    }
    if (alvo) {
      const cods = codigosDo(c).filter((x) => familia(x) === familia(alvo.codigo))
      if (cods.length && !cods.includes(alvo.codigo)) motivos.push(`o registo é de outra obra (${cods[0]}, não ${alvo.codigo})`)
    }
    if (!nomeComCota && registoManuscrito(c) && edicaoModernaPara(c, { forma, anoLido })) motivos.push(`é um registo de manuscrito e ${queEPdf}`)
    if (motivos.length) {
      c.confianca = Math.min(c.confianca || 0, 0.5)
      c.recusado = motivos.join('; ')
    }
  }
  candidatos.sort((a, b) => b.confianca - a.confianca)
  if (antes && antes.recusado && confiancaAntes >= limiar && antes.confianca < limiar) notas.push(`${antes.fonte} sugeria «${antes.titulo}»${antes.data ? ` (${antes.data})` : ''}: não aceite, ${antes.recusado}.`)
  return { candidatos, notas }
}

// Reanálise de uma ficha identificada num catálogo de fontes: o registo novo só substitui o antigo se for claramente
// melhor — o mesmo compositor e a mesma obra (o mesmo nº de catálogo, ou um título praticamente igual)
export const CATALOGOS_DE_FONTES = /RISM|DIAMM|IMSLP|Cantus|PEM|Gallica|BSB|BNP|K10plus|Bach digital/
export function trocaAceitavel(antiga, novo, { semelhanca = () => 0 } = {}) {
  if (!antiga || !novo) return true
  if (!CATALOGOS_DE_FONTES.test(String(antiga.origem || ''))) return true
  const mesmoRegisto = (antiga.url && novo.url && antiga.url.replace(/\/$/, '') === novo.url.replace(/\/$/, '')) || (antiga.metadados?.rism && antiga.metadados.rism === novo.metadados?.rism)
  if (mesmoRegisto) return true
  const comp = (lista) => new Set((lista || []).filter((a) => a.papel === 'compositor' && !eAnonimo(a)).map(apelidoDe).filter(Boolean))
  const ca = comp(antiga.autores)
  const cn = comp(novo.autores)
  const mesmoCompositor = ca.size ? [...cn].some((x) => ca.has(x)) : true
  const catA = catalogoDe(antiga.metadados?.catalogo) || catalogoDe(antiga.titulo)
  const catN = codigosDo(novo)
  const mesmaObra = catA && catN.length ? catN.includes(catA.codigo) : semelhanca(antiga.titulo, novo.titulo) >= 0.8
  return mesmoCompositor && mesmaObra
}

// Forma e suporte que se contradizem («Impresso» com suporte «Manuscrito autógrafo», ou o contrário)
export function contradicaoForma(md = {}) {
  const forma = String(md.forma || '')
  const suporte = String(md.suporte || '')
  if (/impress/i.test(forma) && /manuscri|aut[oó]graf|autograph/i.test(suporte)) return `a forma é «${forma}» e o suporte «${suporte}»`
  if (/manuscri/i.test(forma) && /\b(print|impress)/i.test(suporte)) return `a forma é «${forma}» e o suporte «${suporte}»`
  return ''
}

// Estado da ficha antes da reanálise: reanalisar() põe a ficha «A processar» antes de a fila a ler, por isso o estado
// anterior fica guardado em metadados.estado_antes_reanalise (sobrevive a um reinício a meio) e sai no fim
// (Pedro, 2/10: a regra «ficha completa de catálogo continua completa» nunca atuava)
export const CHAVE_ESTADO_ANTES = 'estado_antes_reanalise'
// (ao pôr «A processar»: uma ficha que já estava «A processar» guarda o estado que tinha antes disso)
export function marcarReanalise(estado, metadados = {}) {
  const md = { ...(metadados || {}) }
  if (estado !== 'processando') md[CHAVE_ESTADO_ANTES] = estado || ''
  return md
}
// (ao ler a ficha na fila: o estado anterior e a ficha sem a chave, para ela não ser copiada para os dados novos)
export function estadoAntesDaReanalise(ficha) {
  if (!ficha) return { estado: '', ficha }
  const md = { ...(ficha.metadados || {}) }
  const guardado = md[CHAVE_ESTADO_ANTES]
  delete md[CHAVE_ESTADO_ANTES]
  const estado = ficha.estado === 'processando' ? guardado || '' : ficha.estado || ''
  return { estado, ficha: { ...ficha, metadados: md } }
}
// Reanálise de uma ficha completa que veio de um catálogo (ou do Mendeley) e que ficou com os mesmos dados: continua
// completa — uma sugestão recusada ou uma pesquisa que desta vez não encontrou nada só deixam nota
export function continuaCompleta({ estadoAntes = '', protegida = false, dados = {}, contradicao = '', dataAntiga = '' } = {}) {
  return estadoAntes === 'completo' && protegida && dados.estado === 'a_rever' && !contradicao && !!String(dados.titulo || '').trim() && !!dados.autores?.length && (!!String(dados.data || '').trim() || !String(dataAntiga || '').trim())
}

// A data antiga é mais precisa do que a nova e é a mesma ("2019-07-17" e "2019")
export const dataMaisPrecisa = (velha, nova) => {
  const v = String(velha || '').trim()
  const n = String(nova || '').trim()
  return !!(v && n && v.length > n.length && v.startsWith(n))
}

// Trabalhos académicos: o compositor que aparece no título é o assunto, não o autor
export const TIPOS_ACADEMICOS = ['Tese / dissertação', 'Artigo', 'Capítulo de livro', 'Ensaio', 'Estudo analítico / teórico', 'Relatório']
export function autoresAcademicos(autores = [], { titulo = '', antigos = [] } = {}) {
  const notas = []
  const tit = ` ${normalizar(titulo)} `
  // (papel «intérprete» num trabalho escrito é um engano: é o autor)
  const fixar = (lista) => (lista || []).map((a) => (a && a.papel === 'intérprete' ? { ...a, papel: 'autor' } : a)).filter(Boolean)
  let lista = fixar(autores)
  const assunto = (a) => a.papel === 'compositor' && apelidoDe(a).length > 2 && tit.includes(` ${apelidoDe(a)} `)
  const doTitulo = lista.filter(assunto)
  if (doTitulo.length) {
    const resto = lista.filter((a) => !assunto(a))
    const antigosBons = fixar(antigos).filter((a) => a.papel !== 'compositor')
    if (resto.length) lista = resto
    else if (antigosBons.length) lista = antigosBons
    else lista = []
    notas.push(`${doTitulo.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')}: compositor que aparece no título (é o assunto do trabalho, não o autor).`)
  }
  // (a reanálise não troca o autor de um trabalho pelo compositor que a IA leu)
  const antigosBons = fixar(antigos).filter((a) => a.papel !== 'compositor')
  if (antigosBons.length && lista.length && lista.every((a) => a.papel === 'compositor')) {
    notas.push(`A IA leu como autor: ${lista.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')}; ficou o autor que a ficha já tinha.`)
    lista = antigosBons
  }
  return { autores: lista, notas }
}
