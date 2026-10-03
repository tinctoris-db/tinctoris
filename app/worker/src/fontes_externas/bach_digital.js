// Bach digital (bach-digital.de, Bach-Archiv Leipzig): obras de J. S. Bach (e da família) e todas as fontes conhecidas
// de cada obra — arquivo e cota, tipo de fonte, autógrafo ou cópia, copista, datação e proveniência.
// Interface aberta: pesquisa Solr em /api/v1/search e registos completos em /api/v1/objects/<id> (XML MyCoRe).
// (as páginas HTML do site têm uma verificação contra robôs; a interface de dados não)
import { obterTexto, pessoa, candidato } from './util.js'
import { blocos, desentidade } from './xml.js'

const BASE = 'https://www.bach-digital.de'
const API = `${BASE}/api/v1`

const solr = async (q, fl, rows, email) => obterTexto(`${API}/search?q=${encodeURIComponent(q)}&rows=${rows}${fl ? `&fl=${encodeURIComponent(fl)}` : ''}`, { email })
// Documentos Solr (<doc>…</doc>) como objetos { campo: valor | [valores] }
function docs(xml) {
  return blocos(xml, 'doc').map((d) => {
    const o = {}
    for (const [, tipo, nome, corpo] of d.matchAll(/<(str|arr|int|bool|date|long)\s+name="([^"]+)">([\s\S]*?)<\/\1>/g)) {
      o[nome] = tipo === 'arr' ? [...corpo.matchAll(/<\w+>([\s\S]*?)<\/\w+>/g)].map((m) => desentidade(m[1])) : desentidade(corpo)
    }
    return o
  })
}

// ---------------- Classificações (tipo de fonte, datação, copista…): rótulos em inglês, guardados em memória
const classificacoes = new Map()
async function rotulos(classe, email) {
  if (classificacoes.has(classe)) return classificacoes.get(classe)
  const xml = await obterTexto(`${API}/classifications/${classe}`, { email })
  const mapa = {}
  for (const [, id, corpo] of xml.matchAll(/<category ID="([^"]+)">([\s\S]*?)(?=<category |<\/category>)/g)) {
    const en = (/<label xml:lang="en" text="([^"]*)"/.exec(corpo) || [])[1]
    const de = (/<label xml:lang="de" text="([^"]*)"/.exec(corpo) || [])[1]
    mapa[id] = desentidade(en || de || '').trim()
  }
  classificacoes.set(classe, mapa)
  return mapa
}
const daCategoria = (doc, classe) => (doc.category || []).filter((c) => c.startsWith(`${classe}:`)).map((c) => c.slice(classe.length + 1)).sort((a, b) => b.length - a.length)[0] || ''

// ---------------- Obra pelo número BWV
export async function bachObra(codigo, email) {
  const c = String(codigo || '').trim()
  if (!/^BWV\s/i.test(c)) return null
  const lista = docs(await solr(`musicrepo_work01:"${c.replace(/"/g, '')}" AND objectType:work`, 'id,musicrepo_work01,musicrepo_work02', 5, email))
  // (o número exato primeiro: "BWV 528" antes de "BWV 528.2")
  const obra = lista.find((d) => (d.musicrepo_work01 || []).some((x) => x.toLowerCase() === c.toLowerCase())) || lista[0]
  if (!obra) return null
  return { id: obra.id, numeros: obra.musicrepo_work01 || [], titulos: obra.musicrepo_work02 || [], url: `${BASE}/receive/${obra.id}` }
}

// ---------------- Rótulos em português (o Bach digital só os tem em alemão, inglês, francês, italiano e japonês)
// (pelas categorias do Bach digital, que não mudam: BachDigitalSourceType1, BachDigitalTimeOfOrigin)
const TIPOS_PT = {
  '0001': 'manuscrito individual',
  '0002': 'manuscrito individual num volume compósito',
  '0003': 'volume compósito',
  '0005': 'manuscrito coletivo',
  '0006': 'manuscrito coletivo num volume compósito',
  '0008': 'particella (partitura reduzida)',
  '0009': 'impresso',
  '0004': 'edição original',
  '0010': 'primeira edição',
}
const SECULOS = { '0006': 'XVII', '0001': 'XVIII', '0003': 'XIX', '0005': 'XX' }
const PARTES = { '0001': 'início', '0002': '1.ª metade', '0003': 'meados', '0004': '2.ª metade', '0005': 'fim' }
// "0001.0004" (+ rótulo "… (ca. 1760–1789)") → "2.ª metade do séc. XVIII (c. 1760–1789)"
export function datacaoPt(id, rotulo = '') {
  if (id === '0002') return 'c. 1800'
  const [sec, parte] = String(id || '').split('.')
  if (!SECULOS[sec]) return ''
  const intervalo = (/\(ca\.\s*([\d–-]+)\)/.exec(rotulo) || [])[1]
  return `${parte && PARTES[parte] ? `${PARTES[parte]} do ` : ''}séc. ${SECULOS[sec]}${intervalo ? ` (c. ${intervalo})` : ''}`
}
export const tipoPt = (id, rotulo = '') => TIPOS_PT[id] || (/^unknown/i.test(rotulo) ? '' : rotulo)

// Fontes conhecidas de uma obra: "D-B Am.B 51 — manuscrito coletivo, cópia, 2.ª metade do séc. XVIII (c. 1760–1789)"
export async function bachFontesDaObra(idObra, email, limite = 80) {
  const lista = docs(await solr(`link:${idObra} AND objectType:source`, 'id,musicrepo_source01,category', limite, email))
  const [tipos, autografo, datas] = await Promise.all([rotulos('BachDigitalSourceType1', email), rotulos('BachDigitalHasAutograph', email), rotulos('BachDigitalTimeOfOrigin', email)])
  return lista
    .filter((d) => d.musicrepo_source01)
    .map((d) => {
      const aut = daCategoria(d, 'BachDigitalHasAutograph')
      const tipo = daCategoria(d, 'BachDigitalSourceType1')
      const data = daCategoria(d, 'BachDigitalTimeOfOrigin')
      const partes = [tipoPt(tipo, tipos[tipo]), aut ? (autografo[aut] === 'yes' ? 'autógrafo' : 'cópia') : '', datacaoPt(data, datas[data])].filter(Boolean)
      return { cota: d.musicrepo_source01, id: d.id, linha: `${d.musicrepo_source01}${partes.length ? ` — ${partes.join(', ')}` : ''}` }
    })
    .sort((a, b) => a.cota.localeCompare(b.cota))
}

// ---------------- Uma fonte pela sigla + cota ("D-B Am.B 51"): registo completo
const textoDe = (xml, n, lingua = '') => {
  const todos = [...xml.matchAll(new RegExp(`<${n}\\b([^>]*)>([\\s\\S]*?)</${n}>`, 'g'))].map((m) => ({ atr: m[1], v: desentidade(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() }))
  const certos = lingua ? todos.filter((t) => t.atr.includes(`xml:lang="${lingua}"`)) : []
  return (certos.length ? certos : todos).map((t) => t.v).filter(Boolean)
}
const categoria = (xml, n) => (new RegExp(`<${n}\\b[^>]*categid="([^"]+)"`).exec(xml) || [])[1] || ''

// Datas do Bach digital (em alemão): "2. Hälfte 18. Jh." → "séc. XVIII (2.ª metade)"; "um 1730" → "c. 1730"
const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
export function dataBach(d) {
  const s = String(d || '').trim()
  const m = /^(?:(\d)\.\s*(Hälfte|Viertel|Drittel)|(Anfang|Mitte|Ende))?\s*(?:des\s*)?(\d{1,2})\.\s*(?:Jh\.?|Jahrhunderts?)$/i.exec(s)
  if (m) {
    const parte = m[2] ? { hälfte: 'metade', viertel: 'quartel', drittel: 'terço' }[m[2].toLowerCase()] : ''
    const qual = parte ? `${m[1]}.${parte === 'metade' ? 'ª' : 'º'} ${parte}` : m[3] ? { anfang: 'início', mitte: 'meados', ende: 'fim' }[m[3].toLowerCase()] : ''
    return `séc. ${ROMANOS[Number(m[4])] || m[4]}${qual ? ` (${qual})` : ''}`
  }
  return s.replace(/^um\s+(\d{4})/i, 'c. $1').replace(/^nach\s+(\d{4})/i, 'depois de $1').replace(/^vor\s+(\d{4})/i, 'antes de $1')
}

export async function bachFonte(id, email) {
  const xml = await obterTexto(`${API}/objects/${id}`, { email })
  const siglaCota = textoDe(xml, 'source01')[0] || ''
  if (!siglaCota) return null
  const [tipos, copistas, compositores] = await Promise.all([rotulos('BachDigitalSourceType1', email), rotulos('BachDigitalSourceScribe', email), rotulos('BachDigitalComposer', email)])
  const tipo = tipoPt(categoria(xml, 'source25'), tipos[categoria(xml, 'source25')] || '')
  const impresso = ['0009', '0004', '0010'].includes(categoria(xml, 'source25'))
  const autografo = categoria(xml, 'source37') === '0001'
  const comp = compositores[categoria(xml, 'source43')] || ''
  const [sigla, ...cota] = siglaCota.split(' ')
  const obras = textoDe(xml, 'source02')[0] || ''
  const rism = textoDe(xml, 'source46')[0] || ''
  return candidato({
    fonte: 'Bach digital',
    tipo_sugerido: impresso ? 'Partitura' : 'Manuscrito',
    titulo: obras ? `${siglaCota} — ${obras}` : siglaCota,
    autores: comp && !/unknown|unbekannt/i.test(comp) ? [pessoa(comp.replace(/\s*\([^)]*\)\s*$/, ''), 'compositor')] : [],
    data: dataBach(textoDe(blocos(xml, 'source12')[0] || '', 'text', 'de')[0] || ''),
    url: `${BASE}/receive/${id}`,
    metadados: {
      forma: impresso ? 'Impresso' : 'Manuscrito',
      sigla,
      cota: cota.join(' '),
      descricao_catalogo: [tipo, autografo ? 'autógrafo' : !impresso ? 'cópia' : ''].filter(Boolean).join(', '),
      copista: copistas[categoria(xml, 'source11')] && !/unknown/i.test(copistas[categoria(xml, 'source11')]) ? copistas[categoria(xml, 'source11')] : '',
      // ("49 leaves" → "49 folhas")
      formato: (textoDe(xml, 'source28', 'en')[0] || textoDe(xml, 'source28')[0] || '').replace(/\bleaves\b/i, 'folhas').replace(/\bleaf\b/i, 'folha').replace(/\bpages\b/i, 'páginas'),
      dimensoes: textoDe(xml, 'source15')[0] || '',
      // (cadeia de possuidores, do mais antigo ao atual)
      proveniencia: textoDe(xml, 'source14').filter((p) => p !== '?').join(' → '),
      conteudo: obras,
      rism: /^\d+$/.test(rism) ? rism : '',
    },
  })
}

export const chaveOrdem = (sigla, cota) => `${sigla}${cota}`.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/\d+/g, (n) => n.padStart(3, '0'))

export async function bachPorCota(sigla, cota, email) {
  if (!sigla || !cota) return null
  const chave = `${sigla} ${cota}`.toLowerCase().replace(/\s+/g, ' ').trim()
  let [d] = docs(await solr(`musicrepo_sourceid01:"${chave.replace(/"/g, '')}" AND objectType:source`, 'id', 2, email))
  // (grafias diferentes da cota, "Am.B.51" ou "AmB 51": a chave de ordenação do Bach digital, "dbamb051")
  if (!d) [d] = docs(await solr(`musicrepo_sourcesort01:"${chaveOrdem(sigla, cota)}" AND objectType:source`, 'id', 2, email))
  return d ? bachFonte(d.id, email) : null
}
