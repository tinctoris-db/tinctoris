// Utilitários comuns às fontes externas de metadados.
import { semAcentos } from '../ficheiros.js'
import { log } from '../registo.js'

export function agenteUtilizador(email) {
  return `BibliotecaFontes/1.0 (personal research library${email ? '; mailto:' + email : ''})`
}

// Serviço de um endereço: o servidor, salvo no www.googleapis.com, onde o Google Books e o YouTube têm quotas
// separadas (uma recusa de um não deve pôr o outro em pausa)
export function servicoDe(url) {
  const u = new URL(url)
  return u.host === 'www.googleapis.com' ? `${u.host}/${u.pathname.split('/')[1]}` : u.host
}
const NOMES = { 'www.googleapis.com/books': 'Google Books', 'www.googleapis.com/youtube': 'YouTube', 'api.semanticscholar.org': 'Semantic Scholar' }
const nomeDo = (servico) => NOMES[servico] || servico

// Ritmo por serviço: no máximo ~5 pedidos por segundo a cada um (evita recusas "429").
const ritmos = new Map()
// (a Gallica responde "429 Trop de requêtes" a pedidos seguidos; o Semantic Scholar com chave aceita 1 por segundo;
// o Google Books recusa rajadas mesmo com chave: no máximo ~1 por segundo)
const LENTOS = /musicbrainz|gallica\.bnf\.fr|catalogue\.bnf\.fr|semanticscholar\.org|googleapis\.com\/books/
function ritmoDe(servico) {
  if (!ritmos.has(servico)) ritmos.set(servico, limitador(LENTOS.test(servico) ? 1100 : 200))
  return ritmos.get(servico)
}

// Serviço que recusa repetidamente fica em pausa: 10 minutos, e mais tempo se voltar a recusar logo a seguir
// (quota diária esgotada: 1 hora, depois 6 horas); um pedido bem-sucedido volta ao início
const suspensos = new Map()
const recusasSeguidas = new Map()
const PAUSAS = [10, 60, 360].map((m) => m * 60 * 1000)
// (quantas vezes seguidas cada serviço deixou um pedido sem resposta)
const semResposta = new Map()

// Erro de um serviço em pausa: quem consulta várias fontes salta-o sem aviso (a pausa já foi registada uma vez)
export class EmPausa extends Error {
  constructor(servico, ate) {
    super(`${nomeDo(servico)} em pausa até ${horaDe(ate)} (demasiados pedidos)`)
    this.emPausa = true
  }
}
// Junta o erro de uma fonte à lista de avisos, salvo se a fonte está só em pausa
export function anotarErro(erros, nome, e) {
  if (!e?.emPausa) erros.push(`${nome}: ${e?.message || e}`)
}
const horaDe = (t) => new Date(t).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

function pausar(servico, motivo, duracao) {
  const ate = Date.now() + duracao
  suspensos.set(servico, ate)
  log.info(`${nomeDo(servico)} em pausa até ${horaDe(ate)} (${motivo}); as outras fontes continuam`)
  return new EmPausa(servico, ate)
}

export async function obterJson(url, opcoes = {}) {
  return obter(url, { ...opcoes, comoTexto: false })
}

// Catálogos que respondem em XML (SRU, OAI, MARC) ou HTML: o texto da resposta
export async function obterTexto(url, opcoes = {}) {
  return obter(url, { ...opcoes, comoTexto: true, cabecalhos: { Accept: 'application/xml, text/xml, text/html;q=0.9, */*;q=0.8', ...(opcoes.cabecalhos || {}) } })
}

async function obter(url, { email, cabecalhos = {}, timeout = 20000, comoTexto = false } = {}) {
  const host = new URL(url).host
  const servico = servicoDe(url)
  const ate = suspensos.get(servico) || 0
  if (ate > Date.now()) throw new EmPausa(servico, ate)
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await ritmoDe(servico)()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeout)
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': agenteUtilizador(email), Accept: 'application/json', ...cabecalhos },
      })
      if (r.status === 429 || r.status === 503) {
        // Demasiados pedidos: esperar e tentar de novo (respeitando "Retry-After", até 10 s)
        const espera = Math.min(10, Number(r.headers.get('retry-after')) || 2 * (tentativa + 1)) * 1000
        await new Promise((ok) => setTimeout(ok, espera))
        continue
      }
      // (a Gallica, depois de muitos pedidos seguidos, passa a responder "403" durante algum tempo: pausa)
      if (r.status === 403 && /musicbrainz|gallica\.bnf\.fr|catalogue\.bnf\.fr/.test(servico)) throw pausar(servico, 'recusou o acesso', PAUSAS[0])
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${host}`)
      const resposta = comoTexto ? (await r.text()).replace(/^﻿/, '') : await r.json()
      semResposta.delete(servico)
      recusasSeguidas.delete(servico)
      return resposta
    } catch (e) {
      // Serviço que não responde (ex.: a Gallica em baixo): à 2.ª vez seguida fica em pausa 10 minutos, para não
      // fazer esperar cada ficheiro (um atraso isolado não pára o serviço)
      if (e.name !== 'AbortError') throw e
      const vezes = (semResposta.get(servico) || 0) + 1
      semResposta.set(servico, vezes)
      if (vezes < 2) throw new Error(`${host} não respondeu em ${Math.round(timeout / 1000)} s`)
      semResposta.delete(servico)
      throw pausar(servico, 'não respondeu', PAUSAS[0])
    } finally {
      clearTimeout(t)
    }
  }
  // Recusou duas vezes seguidas: pausa, mais longa se já tinha recusado logo depois da pausa anterior
  const n = recusasSeguidas.get(servico) || 0
  recusasSeguidas.set(servico, n + 1)
  throw pausar(servico, n ? 'voltou a recusar logo depois da pausa: quota esgotada?' : 'demasiados pedidos', PAUSAS[Math.min(n, PAUSAS.length - 1)])
}

// Nomes de instituições e grupos (ficam como nome literal, sem apelido/nome)
const INSTITUICAO = /\b(orquestra|orchestra|ensemble|coro|choir|quartet|quarteto|trio|band|banda|consort|capella|cappella|academy|academia|instituto|institute|universidade|university|biblioteca|library|museu|museum|sociedade|society|association|associação|associacao|council|conselho|committee|comissão|press|editora|foundation|fundação|group|grupo|department|departamento|ministry|ministério|school|escola|conservatório|conservatory|college|centre|center|centro)\b/i
export const eInstituicao = (s) => INSTITUICAO.test(String(s || ''))

// "Bach, Johann Sebastian" | "Johann Sebastian Bach" -> {apelido, nome, papel}
export function pessoa(texto, papel = 'autor') {
  const s = String(texto || '').trim()
  if (!s) return null
  if (s.includes(',')) {
    const [apelido, ...resto] = s.split(',')
    return { apelido: apelido.trim(), nome: resto.join(',').trim(), papel }
  }
  const partes = s.split(/\s+/)
  if (partes.length === 1) return { apelido: s, nome: '', papel }
  // Instituições/grupos ficam como nome literal
  if (eInstituicao(s)) {
    return { literal: s, papel }
  }
  const particulas = ['da', 'de', 'do', 'das', 'dos', 'van', 'von', 'der', 'di', 'du', 'la', 'le', 'del', 'des']
  let i = partes.length - 1
  while (i > 1 && particulas.includes(partes[i - 1].toLowerCase())) i--
  return { apelido: partes.slice(i).join(' '), nome: partes.slice(0, i).join(' '), papel }
}

export function normalizar(s) {
  return semAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Semelhança entre dois textos (0..1), por palavras em comum (coeficiente de Dice).
export function semelhanca(a, b) {
  const pa = new Set(normalizar(a).split(' ').filter((w) => w.length > 1))
  const pb = new Set(normalizar(b).split(' ').filter((w) => w.length > 1))
  if (!pa.size || !pb.size) return 0
  let comuns = 0
  for (const w of pa) if (pb.has(w)) comuns++
  return (2 * comuns) / (pa.size + pb.size)
}

// Proporção das palavras de "a" que aparecem em "b" (0..1).
export function contido(a, b) {
  const pa = new Set(normalizar(a).split(' ').filter((w) => w.length > 1))
  const pb = new Set(normalizar(b).split(' ').filter((w) => w.length > 1))
  if (pa.size < 3 || !pb.size) return 0
  let comuns = 0
  for (const w of pa) if (pb.has(w)) comuns++
  return comuns / pa.size
}

export function dataDePartes(partes) {
  if (!Array.isArray(partes) || !partes.length || !partes[0]) return ''
  const [a, m, d] = partes
  return [a, m && String(m).padStart(2, '0'), d && String(d).padStart(2, '0')].filter(Boolean).join('-')
}

export const primeiro = (v) => (Array.isArray(v) ? v[0] : v) || ''

// «[s.n.]» (sine nomine) e «[S.l.]» (sine loco) dizem só que a fonte não traz editora nem local: ficam vazios
// (Pedro, 2/10/2026: Agricola 1543 da Gallica ficava com a editora «[s.n.]»). Também "s.n.", "S.l. : s.n.", "[s.l.n.d.]",
// "sine nomine", "sine loco", "sans nom", "sans lieu".
const SEM_NOME_LOCAL = /^[\s[(]*(?:s\.\s?[nl]\.?(?:\s?[nl]\.?)?(?:\s?d\.?)?|(?<=\[)s[nl]d?(?=\])|sine\s+(?:nomine|loco)|sans\s+(?:nom|lieu)|ohne\s+(?:verlag|ort)|o\.\s?o\.|o\.\s?v\.)[\s\])?.,;:]*$/i
export function semNomeLocal(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  // ("[S.l.] : [s.n.]", "[S.l.] ; [s.n.], 1543": cada parte é sine nomine/loco ou só a data)
  const partes = t.split(/\s*[:;]\s*|,\s*(?=\[?\d{4}|\[?[MDCLXVI.]{3,}\]?$)/).filter(Boolean)
  const soData = (x) => /^\[?\s*c?\.?\s*1[4-9]\d\d\??\s*\]?\.?$/i.test(x.trim())
  if (partes.every((x) => SEM_NOME_LOCAL.test(x) || soData(x)) && partes.some((x) => SEM_NOME_LOCAL.test(x))) return ''
  return t
}

// Imprenta inteira no campo da editora ("À Lyon : par Michel du Bois, M.D.LVI") → { local, editora } sem a data.
// Só quando se deixa separar com segurança: um só ":", o local com 1 a 3 palavras sem algarismos, e uma editora que
// sobra depois de tirar a data; senão devolve null (e fica como está).
const PREPOSICAO_LOCAL = /^(?:à|a|á|en|in|im|zu|apud)\s+/i
const PREPOSICAO_EDITORA = /^(?:par|chez|apud|appresso|presso|per|por|bei|bey|by|de chez)\s+/i
const DATA_NO_FIM = /[\s,.;]*\[?\s*(?:(?:[MDCLXVI]\s?\.?\s?){3,}|c?\.?\s*1[4-9]\d\d\??)\s*\]?\.?$/
export function separarImprenta(s) {
  const t = String(s || '').trim()
  const partes = t.split(/\s+:\s+|\s*:\s+/)
  if (partes.length !== 2) return null
  const local = partes[0].replace(PREPOSICAO_LOCAL, '').replace(/^\[|\]$/g, '').trim()
  if (!local || /\d/.test(local) || local.split(/\s+/).length > 3 || !/^\p{Lu}/u.test(local)) return null
  const editora = partes[1].replace(DATA_NO_FIM, '').replace(PREPOSICAO_EDITORA, '').replace(/[\s,;:.]+$/, '').trim()
  if (!editora || /:/.test(editora)) return null
  return { local: semNomeLocal(local), editora: semNomeLocal(editora) }
}

export function candidato(dados) {
  const c = {
    fonte: '',
    confianca: 0,
    tipo_sugerido: '',
    titulo: '',
    autores: [],
    data: '',
    editora: '',
    local: '',
    doi: '',
    isbn: '',
    url: '',
    metadados: {},
    palavras_chave: [],
    ...dados,
  }
  c.editora = semNomeLocal(c.editora)
  c.local = semNomeLocal(c.local)
  return c
}

// ---- Comparação de títulos (partilhada pela importação e pela watch folder)

// Título compacto: sem acentos, espaços nem pontuação ("Zacconi ' s" = "Zacconi's")
export const tituloCompacto = (t) => normalizar(t).replace(/ /g, '').slice(0, 80)

// Iguais: idênticos, ou (se longos) um é o início do outro
export function titulosIguais(a, b) {
  const x = tituloCompacto(a)
  const y = tituloCompacto(b)
  if (!x || !y) return false
  if (x === y) return true
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x]
  if (curto.length < 30 || !longo.startsWith(curto)) return false
  // "…before 1700 I" ≠ "…before 1700 II"; "Volume 1" ≠ "Volume 2": o que sobra é só um número de parte
  const resto = longo.slice(curto.length)
  if (/^(i{1,3}|iv|vi{0,3}|ix|x{1,3}|\d{1,3})$/.test(resto)) return false
  const [tc, tl] = [a, b].map((t) => normalizar(t)).sort((m, n) => m.length - n.length)
  if (/\b(i{1,3}|iv|vi{0,3}|ix|\d{1,3})$/.test(tc) && /\b(i{1,3}|iv|vi{0,3}|ix|\d{1,3})$/.test(tl) && tc.split(' ').pop() !== tl.split(' ').pop()) return false
  return true
}

// Anos compatíveis: iguais, ou um deles sem ano
export function anosCompativeis(a, b) {
  const x = (/(\d{4})/.exec(a || '') || [])[1]
  const y = (/(\d{4})/.exec(b || '') || [])[1]
  return !x || !y || x === y
}

// Limita pedidos a um serviço (ex.: MusicBrainz exige no máximo 1 por segundo).
export function limitador(intervaloMs) {
  let proximo = 0
  return async () => {
    const agora = Date.now()
    const espera = Math.max(0, proximo - agora)
    proximo = Math.max(agora, proximo) + intervaloMs
    if (espera) await new Promise((r) => setTimeout(r, espera))
  }
}
