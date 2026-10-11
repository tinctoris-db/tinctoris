// Discos (CD, LP…): identificação por código de barras ou pelo texto da capa, em catálogos gratuitos e sem chave:
// Apple Music (iTunes), Deezer e MusicBrainz. Só devolve um candidato quando tem a certeza de que é este disco.
import { obterJson, pessoa, eInstituicao, candidato, normalizar, semelhanca } from './util.js'
import { formatarDuracao } from '../extracao.js'

// (o MusicBrainz exige no máximo 1 pedido por segundo: `obterJson` já espaça os pedidos a este serviço com `limitador`)
const APPLE = 'https://itunes.apple.com'
const DEEZER = 'https://api.deezer.com'
const MB = 'https://musicbrainz.org/ws/2'

// ---------------- Auxiliares

// Pedido que nunca rebenta: erro de rede, 404 e respostas «{error}» (Deezer «no data», MusicBrainz ocupado) = nada
async function consultar(url, email) {
  try {
    const j = await obterJson(url, { email })
    return j && typeof j === 'object' && !j.error ? j : null
  } catch {
    return null
  }
}

// Para frases do MusicBrainz: só letras e algarismos («Ni Dufay: …» e «Ni Dufay - …» são o mesmo título para o índice, mas não para a frase)
const aspas = (s) => String(s || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// Grupos e colectivos que a lista de instituições de `util.js` não apanha («Segréis de Lisboa», «Capela Real»,
// «Collegium Vocale», «Coro Gulbenkian»…)
const GRUPO = /\b(coletivo|colectivo|collective|vozes|voices|singers|players|cantores|musici|sinfonietta|schola|capela|duo|consort|segr[eé]is|coro|cappella|capilla|chapelle|kapelle|collegium|cantoria|menestr[eé]is|ministriles)\b/i
// «Various Artists», «Vários»: não é um intérprete
const VARIOS = /^(various( artists)?|v[áa]rios( artistas| int[ée]rpretes)?|artistes divers|verschiedene( interpreten)?)$/i
const GENERICAS = new Set(
  'the and of for de da do das dos del di la le los las el e y et von van der ensemble ensembles orchestra orquestra orchestre quartet quarteto trio quintet choir coro voices vozes consort collective coletivo colectivo band duo various artists varios musica music baroque barroca antiga early'.split(' ')
)

// Intérprete: pessoa (apelido + nome) ou, se for grupo ou nome artístico, nome literal
export function interprete(nome) {
  const n = String(nome || '').trim()
  if (!n || VARIOS.test(n)) return null
  if (eInstituicao(n) || GRUPO.test(n) || /[&+/\d]/.test(n)) return { literal: n, papel: 'intérprete' }
  // «astrophil & stella», «sunn o)))»: nome artístico todo em minúsculas, mais de uma palavra
  if (n.includes(' ') && n === n.toLowerCase()) return { literal: n, papel: 'intérprete' }
  return pessoa(n, 'intérprete')
}

const chaveAutor = (a) => normalizar(a.literal || `${a.nome || ''} ${a.apelido || ''}`)

function juntarAutores(lista) {
  const vistos = new Set()
  const r = []
  for (const a of lista) {
    if (!a) continue
    const k = chaveAutor(a)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    r.push(a)
  }
  return r
}

// «A, B & C» → [A, B, C]. As pistas (nomes lidos na capa) que contêm «&», «,»… ficam inteiras («astrophil & stella»)
export function separarArtistas(texto, pistas = []) {
  let s = String(texto || '')
  const guardados = []
  const unicas = [...new Set(pistas.map((p) => String(p || '').trim()).filter((p) => /[&+,;/]|\be\b|\band\b/i.test(p)))]
  for (const p of unicas.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[\\s,;])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,;])`, 'i')
    s = s.replace(re, (_, antes) => `${antes}\u0001${guardados.push(p) - 1}\u0001`)
  }
  return s
    .split(/\s*(?:,|;|&|\+|\/|\s+e\s+|\s+and\s+|\s+et\s+|\s+with\s+|\s+feat\.?\s+)\s*/i)
    .map((x) => x.replace(/\u0001(\d+)\u0001/g, (_, i) => guardados[Number(i)]).trim())
    .filter(Boolean)
}

// «℗ 2025 Passacaille» → «Passacaille»
export function editoraDoCopyright(c) {
  return String(c || '')
    .replace(/^(?:[℗©&]|\([pc]\)|\s)+/i, '')
    .replace(/^\d{4}(?:\s*[-–,]\s*\d{4})*\s*/, '')
    .replace(/\s*(?:all rights reserved|todos os direitos reservados)\.?\s*$/i, '')
    .replace(/[.\s]+$/, '')
    .trim()
}

// EAN-13 / UPC-A com o dígito de controlo certo (o UPC de 12 algarismos passa a 13 com um 0 à frente), ou ''
function eanValido(c) {
  let d = String(c || '').replace(/\s/g, '')
  if (/^\d{12}$/.test(d)) d = '0' + d
  if (!/^\d{13}$/.test(d)) return ''
  let s = 0
  for (let i = 0; i < 13; i++) s += Number(d[i]) * (i % 2 ? 3 : 1)
  return s % 10 === 0 ? d : ''
}

const faixaTexto = (n, titulo, segundos) => `${n}. ${titulo}${segundos ? ` (${formatarDuracao(segundos)})` : ''}`
const ano = (d) => (/^(\d{4})/.exec(d || '') || [])[1] || ''
// «2025-04-11T07:00:00Z» → «2025-04-11»; «2019-05» → «2019»; «0000-00-00» (Deezer sem data) → nada
export const dataCurta = (d) => {
  const s = String(d || '').slice(0, 10)
  if (/^0000/.test(s)) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ano(s)
}

// ---------------- Apple Music

function dadosApple(resultados) {
  const col = (resultados || []).find((r) => r.wrapperType === 'collection')
  if (!col) return null
  const musicas = resultados
    .filter((r) => r.wrapperType === 'track' && r.kind === 'song' && r.collectionId === col.collectionId)
    .sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0))
  const varios = musicas.some((m) => (m.discNumber || 1) > 1)
  return {
    id: col.collectionId,
    titulo: col.collectionName || '',
    artista: col.artistName || '',
    data: dataCurta(col.releaseDate),
    editora: editoraDoCopyright(col.copyright),
    url: String(col.collectionViewUrl || '').replace(/\?uo=\d+$/, ''),
    faixas: musicas.map((m, i) => faixaTexto(varios ? `${m.discNumber || 1}-${m.trackNumber || i + 1}` : m.trackNumber || i + 1, m.trackName, (m.trackTimeMillis || 0) / 1000)),
  }
}

// Pelo código de barras: primeiro a loja portuguesa, depois a predefinida
async function applePorCodigo(ean, email) {
  for (const pais of ['&country=PT', '']) {
    const j = await consultar(`${APPLE}/lookup?upc=${ean}&entity=song&limit=200${pais}`, email)
    const d = j && dadosApple(j.results)
    if (d) return d
  }
  return null
}

async function appleFaixas(id, email) {
  const j = await consultar(`${APPLE}/lookup?id=${id}&entity=song&limit=200`, email)
  return j ? dadosApple(j.results)?.faixas || [] : []
}

// ---------------- Deezer

function dadosDeezer(a) {
  if (!a || !a.title) return null
  const nomes = (a.contributors || []).map((c) => c.name).filter(Boolean)
  if (!nomes.length && a.artist?.name) nomes.push(a.artist.name)
  const musicas = a.tracks?.data || []
  return {
    titulo: a.title,
    nomes,
    data: dataCurta(a.release_date),
    editora: String(a.label || '').trim(),
    url: a.link || '',
    upc: String(a.upc || ''),
    // (só quando a lista vem completa: os álbuns muito longos vêm cortados)
    faixas: musicas.length && musicas.length === a.nb_tracks ? musicas.map((m, i) => faixaTexto(i + 1, m.title, m.duration)) : [],
  }
}

async function deezerPorCodigo(ean, email) {
  return dadosDeezer(await consultar(`${DEEZER}/album/upc:${ean}`, email))
}

// ---------------- MusicBrainz

const COMPOSITOR = /\b(composer|compositor|compositeur|komponist|componista)\b/i

function dadosMusicBrainz(r) {
  if (!r || !r.title) return null
  const info = r['label-info'] || []
  const catalogos = info.map((l) => String(l['catalog-number'] || '').trim()).filter(Boolean)
  const etiqueta = info.map((l) => l.label?.name).find((n) => n && !/^\[no label\]$/i.test(n)) || ''
  const compositores = []
  const interpretes = []
  for (const c of r['artist-credit'] || []) {
    const nome = c.name || c.artist?.name
    if (!nome) continue
    if (COMPOSITOR.test(c.artist?.disambiguation || '')) {
      // (os nomes de pessoas vêm bem ordenados em «sort-name»: «Pullois, Johannes»)
      compositores.push(pessoa(c.artist?.['sort-name']?.includes(',') ? c.artist['sort-name'] : nome, 'compositor'))
    } else interpretes.push(nome)
  }
  return {
    id: r.id,
    titulo: r.title,
    interpretes,
    compositores: compositores.filter(Boolean),
    data: dataCurta(r.date),
    editora: etiqueta,
    catalogos,
    barcode: String(r.barcode || ''),
    url: `https://musicbrainz.org/release/${r.id}`,
  }
}

async function musicBrainzPorCodigo(ean, email) {
  const j = await consultar(`${MB}/release/?query=barcode:${ean}&fmt=json`, email)
  // (só uma edição cujo código de barras seja exactamente este)
  const r = (j?.releases || []).find((x) => String(x.barcode || '').replace(/\D/g, '') === ean)
  return dadosMusicBrainz(r)
}

// ---------------- Montar o candidato (junta o que cada catálogo sabe da MESMA edição)

function montar({ ean = '', apple, deezer, mb, confianca, pistas = [] }) {
  const fontes = [apple && 'Apple Music', deezer && 'Deezer', mb && 'MusicBrainz'].filter(Boolean)
  if (!fontes.length) return null
  // Intérpretes: a lista de colaboradores do Deezer é a mais limpa; a do Apple vem num só texto («A, B & C»)
  let autores = []
  if (deezer?.nomes.length) autores = deezer.nomes.map(interprete)
  else if (apple?.artista) autores = separarArtistas(apple.artista, pistas).map(interprete)
  else if (mb) autores = mb.interpretes.map(interprete)
  autores = juntarAutores([...autores, ...(mb?.compositores || [])])
  const faixas = apple?.faixas.length ? apple.faixas : deezer?.faixas || []
  // Data: a do MusicBrainz (a edição com este código de barras; o Apple e o Deezer dão muitas vezes a data da edição
  // digital), ou outra mais precisa do mesmo ano; as outras ficam em «datas» (referencias_discos.js escolhe a que bate
  // com o ano ℗/© da fotografia)
  const datas = [...new Set([mb?.data, apple?.data, deezer?.data].filter(Boolean))]
  let data = datas[0] || ''
  for (const d of datas) if (ano(d) === ano(data) && d.length > data.length) data = d
  const metadados = {
    codigo_barras: ean,
    n_catalogo: mb?.catalogos[0] || '',
    faixas: faixas.join('\n'),
    publicado: true,
  }
  for (const k of Object.keys(metadados)) if (!metadados[k]) delete metadados[k]
  return candidato({
    fonte: fontes.join(' + '),
    confianca,
    tipo_sugerido: 'Disco',
    titulo: apple?.titulo || deezer?.titulo || mb?.titulo || '',
    autores,
    data,
    datas,
    editora: deezer?.editora || apple?.editora || mb?.editora || '',
    url: apple?.url || deezer?.url || mb?.url || '',
    metadados,
  })
}

// ---------------- Pelo código de barras

// Mesmo disco com e sem o zero inicial (UPC de 12 algarismos = EAN de 13 com «0»)
function formasDoCodigo(ean) {
  if (ean.length === 12) return [ean, '0' + ean]
  return ean.startsWith('0') ? [ean, ean.slice(1)] : [ean]
}

export async function discoPorCodigo(ean, defs = {}) {
  const codigo = String(ean || '').replace(/[\s-]/g, '')
  if (!/^\d{12,13}$/.test(codigo)) return null
  const email = defs?.email_contacto
  for (const forma of formasDoCodigo(codigo)) {
    const [apple, deezer, mb] = await Promise.all([applePorCodigo(forma, email), deezerPorCodigo(forma, email), musicBrainzPorCodigo(forma, email)])
    const c = montar({ ean: codigo, apple, deezer, mb, confianca: 1 })
    if (c) return c
  }
  return null
}

// ---------------- Pelo texto da capa

// Títulos iguais depois de normalizados, ou um dentro do outro (a capa pode ter só o título principal)
export function tituloIgual(a, b) {
  const x = normalizar(a)
  const y = normalizar(b)
  if (!x || !y) return false
  if (x === y) return true
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x]
  if (curto.split(' ').length < 2 || !` ${longo} `.includes(` ${curto} `)) return false
  // (o título da capa é o início do título completo: «…: subtítulo»)
  if (curto.split(' ').length >= 3 && longo.startsWith(curto + ' ')) return true
  return semelhanca(a, b) >= 0.7
}

// Pelo menos uma palavra do intérprete lido na capa (duas, se tiver duas ou mais), sem contar palavras genéricas («Ensemble»)
export function artistaCoincide(lido, nomes) {
  const palavras = [...new Set(normalizar(lido).split(' ').filter((w) => w.length >= 3 && !GENERICAS.has(w)))]
  const alvo = normalizar(nomes.join(' '))
  if (!palavras.length) return !!normalizar(lido) && nomes.some((n) => normalizar(n) === normalizar(lido))
  const conjunto = new Set(alvo.split(' '))
  return palavras.filter((w) => conjunto.has(w)).length >= Math.min(2, palavras.length)
}

const compacto = (s) => normalizar(s).replace(/ /g, '')

function pistasDaCapa(artista) {
  return String(artista || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

export async function discoPorTexto(q, defs = {}) {
  const titulo = String(q?.titulo || '').trim()
  const artista = String(q?.artista || '').trim()
  const catalogo = String(q?.n_catalogo || '').trim()
  // Sem intérprete nem nº de catálogo não há como confirmar que é este disco
  if (!titulo || (!artista && !catalogo)) return null
  const email = defs?.email_contacto
  const pistas = pistasDaCapa(artista)

  // 1) Deezer (a pesquisa de álbuns é a mais tolerante); o Apple junta-se pelo mesmo código de barras da edição
  const termos = [...new Set([[titulo, artista].filter(Boolean).join(' '), titulo])]
  for (const termo of termos) {
    const j = await consultar(`${DEEZER}/search/album?q=${encodeURIComponent(termo)}&limit=10`, email)
    const parecidos = (j?.data || []).filter((a) => a.id && tituloIgual(titulo, a.title)).slice(0, 3)
    for (const a of parecidos) {
      const deezer = dadosDeezer(await consultar(`${DEEZER}/album/${a.id}`, email))
      if (!deezer || !tituloIgual(titulo, deezer.titulo)) continue
      if (!artista || !artistaCoincide(artista, deezer.nomes)) continue
      let apple = deezer.upc ? await applePorCodigo(deezer.upc, email) : null
      // (o código de barras do Deezer pode ser o da edição digital: só se grava se o Apple Music não o contradisser — o
      // mesmo código com outro título; a fotografia confere-o depois em referencias_discos.js)
      const contradito = apple && normalizar(apple.titulo) !== normalizar(deezer.titulo)
      if (contradito) apple = null
      return montar({ ean: contradito ? '' : eanValido(deezer.upc), apple, deezer, confianca: 0.9, pistas })
    }
    if (parecidos.length) break // havia o título mas não o intérprete: outra pesquisa só traria os mesmos álbuns
  }

  // 2) Apple Music
  for (const termo of termos) {
    const j = await consultar(`${APPLE}/search?term=${encodeURIComponent(termo)}&entity=album&limit=10`, email)
    for (const col of (j?.results || []).filter((r) => r.wrapperType === 'collection')) {
      if (!tituloIgual(titulo, col.collectionName)) continue
      if (!artista || !artistaCoincide(artista, [col.artistName])) continue
      const apple = dadosApple([col])
      apple.faixas = await appleFaixas(apple.id, email)
      return montar({ apple, confianca: 0.9, pistas })
    }
  }

  // 3) MusicBrainz (também confirma pelo nº de catálogo)
  const primeiro = pistas[0] || ''
  const filtro = primeiro ? `artist:"${aspas(primeiro)}"` : `catno:"${aspas(catalogo)}"`
  const j = await consultar(`${MB}/release/?query=${encodeURIComponent(`release:"${aspas(titulo)}" AND ${filtro}`)}&fmt=json&limit=10`, email)
  for (const r of j?.releases || []) {
    const mb = dadosMusicBrainz(r)
    if (!mb || !tituloIgual(titulo, mb.titulo)) continue
    const nomes = (r['artist-credit'] || []).flatMap((c) => [c.name, c.artist?.name]).filter(Boolean)
    const porCatalogo = !!catalogo && mb.catalogos.some((c) => compacto(c) === compacto(catalogo))
    if (!porCatalogo && !(artista && artistaCoincide(artista, nomes))) continue
    return montar({ ean: mb.barcode, mb: { ...mb, interpretes: mb.interpretes }, confianca: 0.9 })
  }
  return null
}
