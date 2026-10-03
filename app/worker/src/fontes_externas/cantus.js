// Manuscritos de cantochão: Cantus Index (lista das fontes de 11 bases da rede Cantus, entre elas a Cantus Database,
// a PEM — Portuguese Early Music Database — e a SEMM / Musica Hispanica) e Cantus Database (descrição da fonte).
// Com sigla + cota, o Cantus Index diz em que bases a fonte está inventariada (e quantos cânticos tem cada uma);
// a Cantus Database dá a datação, o cursus, a proveniência e o conteúdo litúrgico.
// (as fontes da PEM encontram-se pela lista do Cantus Index, que tem a ligação para a página da fonte na PEM)
import { obterJson, obterTexto, candidato } from './util.js'
import { desentidade } from './xml.js'
import { pemFonte } from './pem.js'

const INDEX = 'https://cantusindex.org'
const CANTUSDB = 'https://cantusdatabase.org'

// Nomes legíveis das bases (colunas da lista de fontes do Cantus Index)
const BASES = {
  CD: 'Cantus Database',
  PEM: 'PEM (Portuguese Early Music Database)',
  SEMM: 'SEMM (Musica Hispanica)',
  MMMO: 'MMMO (Medieval Music Manuscripts Online)',
  FCB: 'Fontes Cantus Bohemiae',
  CSK: 'Cantus Planus in Polonia (CSK)',
  CPL: 'Cantus Planus (CPL)',
  HCD: 'Hungarian Chant Database',
  HYM: 'Hymnorum (HYM)',
  CM: 'CM',
  A4M: 'A4M',
}

// Cota comparável: sem pontuação nem zeros à esquerda ("Ms. 032" = "ms 32")
export const chaveCantus = (s) => String(s || '').toLowerCase().replace(/\d+/g, (n) => String(Number(n))).replace(/[^a-z0-9]+/g, '')

// "P-BRs (Braga) Arquivo da Sé Ms. 032" → { sigla, cidade, resto }
export function lerSigla(rotulo) {
  const m = /^([A-Z]{1,3}-[A-Za-z]+)\s*(?:\(([^)]*)\))?\s*(.*)$/.exec(String(rotulo || '').trim())
  return m ? { sigla: m[1], cidade: m[2] || '', resto: m[3].trim() } : { sigla: '', cidade: '', resto: String(rotulo || '').trim() }
}

// ---------------- Lista de fontes do Cantus Index (por prefixo do país, guardada em memória durante um dia)
const listas = new Map()
export function lerListaFontes(html) {
  const cabecalho = [...String(html).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => desentidade(m[1].replace(/<[^>]+>/g, '')).trim())
  const linhas = []
  for (const [, corpo] of String(html).matchAll(/<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g)) {
    const celulas = [...corpo.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1])
    if (!celulas.length) continue
    const rotulo = desentidade(celulas[0].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    const bases = []
    celulas.slice(1).forEach((c, i) => {
      // (contagens com separador de milhares: "2,807")
      const a = /<a href="([^"]+)"[^>]*>\s*([\d.,\s]+?)\s*</.exec(c)
      const col = cabecalho[i + 1] || ''
      if (a && col !== 'Total') bases.push({ base: BASES[col] || col, codigo: col, url: desentidade(a[1]), canticos: Number(a[2].replace(/\D/g, '')) })
    })
    linhas.push({ rotulo, ...lerSigla(rotulo), bases })
  }
  return linhas
}

async function fontesDoPais(prefixo, email) {
  const guardada = listas.get(prefixo)
  if (guardada && guardada.ate > Date.now()) return guardada.linhas
  const linhas = []
  for (let pagina = 0; pagina < 40; pagina++) {
    const html = await obterTexto(`${INDEX}/sources?prefix=${encodeURIComponent(prefixo)}${pagina ? `&page=${pagina}` : ''}`, { email })
    const lidas = lerListaFontes(html)
    linhas.push(...lidas)
    if (lidas.length < 100) break
  }
  listas.set(prefixo, { linhas, ate: Date.now() + 24 * 3600 * 1000 })
  return linhas
}

// A fonte com esta sigla + cota no Cantus Index: { rotulo, sigla, cidade, arquivo, bases: [{base, url, canticos}] }
export async function cantusIndexFonte(sigla, cota, email) {
  if (!sigla || !cota) return null
  const prefixo = sigla.split('-')[0].toUpperCase() + '-'
  const alvo = chaveCantus(cota)
  if (alvo.length < 2) return null
  const linhas = (await fontesDoPais(prefixo, email)).filter((l) => l.sigla.toLowerCase() === sigla.toLowerCase())
  // (a cota está no fim do rótulo, depois do nome do arquivo: "Arquivo da Sé Ms. 032")
  // (várias fontes com a mesma terminação, "Ms. 032" e "Res. 032" para a cota "32": fica a que coincide mais; empate = nenhuma)
  const certas = linhas.map((x) => ({ x, n: cotaNoFim(x.resto, alvo).length })).filter((c) => c.n).sort((a, b) => b.n - a.n)
  if (!certas.length || (certas[1] && certas[1].n === certas[0].n && certas[1].x.rotulo !== certas[0].x.rotulo)) return null
  const l = certas[0].x
  const fim = cotaNoFim(l.resto, alvo)
  return { ...l, arquivo: l.resto.slice(0, l.resto.length - fim.length).trim() }
}

// O pedaço final de "texto" cuja chave é "alvo" ("Arquivo da Sé Ms. 032", "ms32" → "Ms. 032")
function cotaNoFim(texto, alvo) {
  for (let i = texto.length - 1; i >= 0; i--) {
    const fim = texto.slice(i)
    if (chaveCantus(fim) === alvo && (i === 0 || /\s/.test(texto[i - 1]))) return fim
  }
  return ''
}

// ---------------- Cantus Database: registo completo da fonte
const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
// "1300s" → "séc. XIV"; "1450-1500" fica igual
export const dataCantus = (d) => String(d || '').trim().replace(/^(\d{2})00s$/, (_, s) => `séc. ${ROMANOS[Number(s) + 1] || ''}`.trim())

export async function cantusDbFonte(id, email) {
  const j = await obterJson(`${CANTUSDB}/json-node/${id}`, { email })
  if (!j || !j.siglum) return null
  // "Graz, Universitätsbibliothek, 29 (olim 38/8 f.)": cidade, arquivo e cota
  const titulo = String(j.title || '')
  const semCota = j.shelfmark && titulo.endsWith(j.shelfmark) ? titulo.slice(0, -j.shelfmark.length).replace(/[,\s]+$/, '') : titulo
  const [cidade, ...arquivo] = semCota.split(', ')
  let proveniencia = ''
  if (j.provenance_id) {
    try {
      const p = await obterJson(`${CANTUSDB}/json-node/${j.provenance_id}`, { email })
      proveniencia = p?.name || ''
    } catch (_) {}
  }
  const sigla = String(j.siglum).split(' ')[0]
  const c = candidato({
    fonte: 'Cantus Database',
    tipo_sugerido: 'Manuscrito',
    titulo: j.name ? `${j.siglum} — ${j.name}` : j.siglum,
    autores: [],
    data: dataCantus(j.date),
    url: `${CANTUSDB}/source/${j.id}`,
    metadados: {
      forma: 'Manuscrito',
      sigla,
      cota: j.shelfmark || String(j.siglum).split(' ').slice(1).join(' '),
      arquivo: arquivo.join(', '),
      local_arquivo: cidade || '',
      descricao_catalogo: [j.summary, j.cursus && `Cursus: ${j.cursus}.`].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      conteudo: String(j.liturgical_occasions || '').replace(/\r\n/g, '\n').trim(),
      proveniencia: [proveniencia, j.provenance_notes].filter(Boolean).join('. '),
      cantus: String(j.id),
    },
  })
  return c
}

// Fonte na Cantus Database ou na PEM pela sigla + cota (através do Cantus Index): candidato completo, ou null
export async function cantusPorCota(sigla, cota, email) {
  const ci = await cantusIndexFonte(sigla, cota, email)
  if (!ci) return { indice: null, candidato: null }
  const cd = ci.bases.find((b) => b.codigo === 'CD')
  const id = cd && (/\/source\/(\d+)/.exec(cd.url) || [])[1]
  let c = null
  if (id) {
    try {
      c = await cantusDbFonte(id, email)
    } catch (_) {}
  }
  // PEM (fontes portuguesas): a descrição da PEM, ou o que ela acrescenta à da Cantus Database
  const pem = ci.bases.find((b) => b.codigo === 'PEM')
  if (pem) {
    try {
      const p = await pemFonte(pem.url, email)
      if (p && !c) c = p
      else if (p) for (const [k, v] of Object.entries(p.metadados)) if (v && !c.metadados[k]) c.metadados[k] = v
    } catch (_) {}
  }
  return { indice: ci, candidato: c }
}

// Linhas para o campo «Noutros catálogos»: "PEM (Portuguese Early Music Database): https://… (233 cânticos)"
export const ligacoesCantus = (indice) => (indice?.bases || []).map((b) => `${b.base}: ${b.url}${b.canticos ? ` (${b.canticos} ${b.canticos === 1 ? 'cântico' : 'cânticos'})` : ''}`)
