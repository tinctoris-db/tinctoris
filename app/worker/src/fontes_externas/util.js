// Utilitários comuns às fontes externas de metadados.
import { semAcentos } from '../ficheiros.js'

export function agenteUtilizador(email) {
  return `BibliotecaFontes/1.0 (personal research library${email ? '; mailto:' + email : ''})`
}

// Ritmo por serviço: no máximo ~5 pedidos por segundo a cada um (evita recusas "429").
const ritmos = new Map()
// (a Gallica responde "429 Trop de requêtes" a pedidos seguidos: no máximo ~1 por segundo)
const LENTOS = /musicbrainz|gallica\.bnf\.fr|catalogue\.bnf\.fr/
function ritmoDe(host) {
  if (!ritmos.has(host)) ritmos.set(host, limitador(LENTOS.test(host) ? 1100 : 200))
  return ritmos.get(host)
}

// Serviço que recusa repetidamente fica em pausa 10 minutos (não atrasar cada ficheiro)
const suspensos = new Map()
// (quantas vezes seguidas cada serviço deixou um pedido sem resposta)
const semResposta = new Map()

export async function obterJson(url, opcoes = {}) {
  return obter(url, { ...opcoes, comoTexto: false })
}

// Catálogos que respondem em XML (SRU, OAI, MARC) ou HTML: o texto da resposta
export async function obterTexto(url, opcoes = {}) {
  return obter(url, { ...opcoes, comoTexto: true, cabecalhos: { Accept: 'application/xml, text/xml, text/html;q=0.9, */*;q=0.8', ...(opcoes.cabecalhos || {}) } })
}

async function obter(url, { email, cabecalhos = {}, timeout = 20000, comoTexto = false } = {}) {
  const host = new URL(url).host
  if ((suspensos.get(host) || 0) > Date.now()) throw new Error(`${host} em pausa (demasiados pedidos)`)
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await ritmoDe(host)()
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
      if (r.status === 403 && LENTOS.test(host)) {
        suspensos.set(host, Date.now() + 10 * 60 * 1000)
        throw new Error(`HTTP 403 em ${host} (em pausa durante 10 minutos)`)
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${host}`)
      const resposta = comoTexto ? (await r.text()).replace(/^﻿/, '') : await r.json()
      semResposta.delete(host)
      return resposta
    } catch (e) {
      // Serviço que não responde (ex.: a Gallica em baixo): à 2.ª vez seguida fica em pausa 10 minutos, para não
      // fazer esperar cada ficheiro (um atraso isolado não pára o serviço)
      if (e.name !== 'AbortError') throw e
      const vezes = (semResposta.get(host) || 0) + 1
      semResposta.set(host, vezes)
      if (vezes < 2) throw new Error(`${host} não respondeu em ${Math.round(timeout / 1000)} s`)
      semResposta.delete(host)
      suspensos.set(host, Date.now() + 10 * 60 * 1000)
      throw new Error(`${host} não respondeu (em pausa durante 10 minutos)`)
    } finally {
      clearTimeout(t)
    }
  }
  suspensos.set(host, Date.now() + 10 * 60 * 1000)
  throw new Error(`HTTP 429 em ${host} (em pausa durante 10 minutos)`)
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

export function candidato(dados) {
  return {
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
