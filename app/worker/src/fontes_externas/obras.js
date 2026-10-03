// Títulos normalizados de obras musicais, a partir do número de catálogo (BWV, K., HWV, RV, TWV, op.…),
// segundo o IMSLP: "SONATA IV" + "BWV 528, 2" → "Organ Sonata No.4 in E minor, BWV 528".
import { obterJson, normalizar } from './util.js'
import { semAcentos } from '../ficheiros.js'

const IMSLP = 'https://imslp.org/api.php'

// Catálogos reconhecidos: [expressão, forma do IMSLP, distingue maiúsculas (TWV 41:c2 ≠ 41:C2)]
const CATALOGOS = [
  [/\bBWV\s*Anh\.?\s*(\d+[a-z]?)/i, (n) => `BWV Anh.${n}`],
  [/\bBWV\s*(\d+[a-z]?)(?![\d])/i, (n) => `BWV ${n}`],
  [/\bBuxWV\s*(\d+)/i, (n) => `BuxWV ${n}`],
  [/\bHWV\s*(\d+[a-z]?)/i, (n) => `HWV ${n}`],
  [/\bRV\s*(\d+[a-z]?)/i, (n) => `RV ${n}`],
  [/\bTWV\s*(\d+\s*(?::\s*[A-Za-z]{0,2}\s*:?\s*\d+|\s+[A-Za-z]{1,2}\s*:?\s*\d+|:\s*[A-Za-z]{1,2}\b))/, (n) => `TWV ${n.replace(/\s+/g, '').replace(/^(\d+)(?=[A-Za-z])/, '$1:').replace(/([A-Za-z]):(?=\d)/, '$1')}`, true],
  [/\bQV\s*(\d+\s*:\s*[A-Za-z0-9]+)/, (n) => `QV ${n.replace(/\s+/g, '')}`, true],
  [/\bSWV\s*(\d+)/i, (n) => `SWV ${n}`],
  [/\bWq\.?\s*(\d+)/i, (n) => `Wq.${n}`],
  [/\bK(?:V|\.)\s*(\d+[a-z]?)/, (n) => `K.${n}`],
  [/\bHob\.?\s*([IVXL]+\s*[:.]\s*[A-Za-z0-9]+)/i, (n) => `Hob.${n.replace(/\s+/g, '').replace('.', ':')}`],
  [/\bWoO\s*(\d+)/i, (n) => `WoO ${n}`],
  [/\bZ\.?\s*(\d{2,3})\b/, (n) => `Z.${n}`],
  [/\bOp(?:us|\.)?\s*(\d+)(?:\s*,?\s*(?:N(?:o|º|r|°)?\.?|№)\s*(\d+|[IVX]{1,5}\b))?/i, (n, no) => (no ? `Op.${n} No.${/^\d/.test(no) ? no : romano(no)}` : `Op.${n}`)],
]

// Número de catálogo (sem o andamento): "BWV 528, 2" → { codigo: "BWV 528" }; "bwv528_2.pdf" → idem
export function catalogoDe(texto) {
  const s = String(texto || '').replace(/_/g, ' ')
  for (const [re, forma, maiusculas] of CATALOGOS) {
    const m = re.exec(s)
    if (m) return { codigo: forma(m[1], m[2]), maiusculas: !!maiusculas }
  }
  return null
}

// Todos os números de catálogo escritos num texto (forma normalizada, sem o andamento nem o "No.")
const base = (codigo) => normalizar(String(codigo).replace(/\s+No\.\d+$/, '')).replace(/ /g, '')
export function codigosEm(texto) {
  const s = String(texto || '').replace(/_/g, ' ')
  const out = new Set()
  for (const [re, forma] of CATALOGOS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    for (const m of s.matchAll(g)) out.add(base(forma(m[1], m[2])))
  }
  return out
}

// O número de catálogo (ex.: dado pela IA local) está mesmo escrito nalgum destes textos?
// (a IA inventa números quando não os vê: "BWV 1047" aparece em partituras que nada têm a ver)
export function catalogoConfirmado(catalogo, textos) {
  const cat = catalogoDe(catalogo)
  if (!cat) return false
  const alvo = base(cat.codigo)
  return textos.some((t) => codigosEm(t).has(alvo))
}

// Número de catálogo que o nome do ficheiro dá sem sigla: "Cantata nº 093.pdf" de Bach → BWV 93
// (a numeração das cantatas da Bach-Gesellschaft é a do BWV)
export function catalogoPeloNome(nome, apelido) {
  if (!/\bbach\b/.test(normalizar(apelido))) return null
  const m = /\b(?:cantata|kantate|cantate)\b\s*(?:n\s*[ro.º°]*|nr\.?|no\.?)?\s*0*(\d{1,3}[a-z]?)\b/i.exec(semAcentos(String(nome || '')).replace(/_/g, ' '))
  const n = m ? parseInt(m[1], 10) : 0
  return n >= 1 && n <= 224 ? { codigo: `BWV ${m[1].replace(/^0+/, '')}`, maiusculas: false } : null
}

// O título tem exatamente este número? ("BWV 528" sim em "…, BWV 528 (Bach…)"; não em "BWV 5280" nem "BWV 528a")
function temCodigo(titulo, { codigo, maiusculas }) {
  const compacto = (x) => (maiusculas ? x : x.toLowerCase()).replace(/[\s.]/g, '')
  const t = compacto(titulo)
  const c = compacto(codigo)
  let i = t.indexOf(c)
  while (i >= 0) {
    const depois = t[i + c.length] || ''
    // (Op.5 não pode ser Op.50; "Op.5 No.3" pedido não aceita a coletânea "Op.5")
    if (!/[0-9a-z]/i.test(depois) || (/^(bwv|k)/i.test(c) && depois === '/')) return true
    i = t.indexOf(c, i + 1)
  }
  return false
}

// Página de obra do IMSLP: "Organ Sonata No.4 in E minor, BWV 528 (Bach, Johann Sebastian)"
const partes = (pagina) => {
  const m = /^(.*)\s+\(([^()]+)\)\s*$/.exec(pagina)
  return m ? { obra: m[1], compositor: m[2] } : { obra: pagina, compositor: '' }
}

const cache = new Map()

// Devolve { titulo, url, compositor, tonalidade, instrumentacao, data_composicao, titulo_alternativo } ou null
// Catálogos de um só compositor: o número já diz de quem é a obra (os autores da ficha podem estar errados:
// "Anna Magdalena Bach" numa obra BWV, "HWV 369" como autor…)
const DONO = { bwv: 'Bach', buxwv: 'Buxtehude', hwv: 'Handel', rv: 'Vivaldi', twv: 'Telemann', qv: 'Quantz', swv: 'Schutz', wq: 'Bach', k: 'Mozart', hob: 'Haydn', woo: 'Beethoven', z: 'Purcell' }
const familiaDe = (codigo) => ((/^[A-Za-z]+/.exec(String(codigo || '').trim()) || [''])[0]).toLowerCase()
// O compositor de um catálogo de um só compositor ("BWV 60" → "Bach"), ou ''
export const donoDoCatalogo = (codigo) => DONO[familiaDe(codigo)] || ''

export async function obraPorCatalogo(catalogo, apelido, email, nomeProprio = '') {
  const cat = typeof catalogo === 'string' ? catalogoDe(catalogo) : catalogo
  if (!cat) return null
  const dono = DONO[familiaDe(cat.codigo)]
  // ("Рахманинов" fica vazio depois de normalizar: não pode aceitar obras de qualquer compositor)
  const apelidoUsado = dono || (/\d/.test(apelido || '') ? '' : apelido)
  if (!normalizar(apelidoUsado)) return null
  const obra = await obraPorCatalogoDe(cat, apelidoUsado, email, nomeProprio)
  // Peça de uma coleção ("Op.59 No.4") sem página própria: a obra é a coleção ("6 Lieder, Op.59")
  if (!obra && / No\.\d+$/.test(cat.codigo)) return obraPorCatalogoDe({ ...cat, codigo: cat.codigo.replace(/ No\.\d+$/, '') }, apelidoUsado, email, nomeProprio)
  return obra
}

async function obraPorCatalogoDe(cat, apelido, email, nomeProprio) {
  // Nome próprio ("Robert" Schumann ≠ Georg Schumann): só para desempatar (os nomes próprios das fichas falham muito)
  const proprio = normalizar(nomeProprio).split(' ').find((w) => w.length >= 3) || ''
  const chave = `${cat.codigo}|${normalizar(apelido).split(' ').pop()}|${proprio}`
  if (cache.has(chave)) return cache.get(chave)
  // (o IMSLP não encontra "Händel": pesquisar sem acentos, e só pelo número se nada vier)
  const procurar = async (q) => ((await obterJson(`${IMSLP}?${new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: '10', srnamespace: '0', format: 'json' })}`, { email })).query?.search || []).map((r) => r.title)
  let titulos = await procurar(`${cat.codigo} ${semAcentos(normalizar(apelido).split(' ').pop())}`)
  if (!titulos.length) titulos = await procurar(cat.codigo)
  if (!titulos.length) return guardar(chave, null)
  // Títulos antigos redirecionam para o canónico
  const r = await obterJson(`${IMSLP}?${new URLSearchParams({ action: 'query', titles: titulos.join('|'), redirects: '1', format: 'json' })}`, { email })
  const destino = new Map((r.query?.redirects || []).map((x) => [x.from, x.to]))
  const normal = new Map((r.query?.normalized || []).map((x) => [x.from, x.to]))
  // ("J.S.Bach", "VAN BEETHOVEN": conta a última palavra)
  const apel = normalizar(apelido).split(' ').pop()
  const canonicos = [...new Set(titulos.map((t) => destino.get(normal.get(t) || t) || normal.get(t) || t))].filter((t) => {
    const { obra, compositor } = partes(t)
    return normalizar(compositor).includes(apel) && temCodigo(obra, cat)
  })
  // Várias páginas com o mesmo número e compositor: é a mesma obra com títulos diferentes.
  // Preferir a que não é coletânea ("4 Recorder Sonatas…"), depois a que diz a tonalidade, depois a mais completa
  const pontos = (t) => (proprio && normalizar(partes(t).compositor).includes(proprio) ? 1000 : 0) + (/^\d+\s/.test(t) ? 0 : 100) + (/ in [A-G](-flat|-sharp)? (major|minor)/.test(t) ? 10 : 0) + Math.min(9, t.length / 10)
  const escolhida = canonicos.sort((a, b) => pontos(b) - pontos(a))[0] || null
  if (!escolhida) return guardar(chave, null)
  const res = { titulo: partes(escolhida).obra, compositor: partes(escolhida).compositor, url: `https://imslp.org/wiki/${encodeURIComponent(escolhida.replace(/ /g, '_'))}` }
  try {
    Object.assign(res, await detalhes(escolhida, email))
  } catch (_) {}
  return guardar(chave, res)
}

function guardar(chave, v) {
  cache.set(chave, v)
  return v
}

// Tonalidade, instrumentação, data de composição e título alternativo (da ficha da obra no IMSLP)
const TONS = { c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A', b: 'B' }
function tonalidade(k) {
  const m = /^([a-gA-G])(flat|sharp|b|#)?\s*(major|minor)?$/.exec(String(k || '').trim())
  if (!m) return ''
  const nome = TONS[m[1].toLowerCase()] + (m[2] ? (/flat|b/.test(m[2]) ? '-flat' : '-sharp') : '')
  return `${nome} ${m[3] || (m[1] === m[1].toLowerCase() ? 'minor' : 'major')}`
}
const semModelos = (s) =>
  String(s || '')
    .replace(/\{\{LinkWork\|([^|}]+)[^}]*\}\}/g, '$1')
    .replace(/\{\{[^|}]*\|([^|}]*)[^}]*\}\}/g, '$1')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

async function detalhes(pagina, email) {
  const j = await obterJson(`${IMSLP}?${new URLSearchParams({ action: 'parse', page: pagina, prop: 'wikitext', format: 'json' })}`, { email })
  const t = j.parse?.wikitext?.['*'] || ''
  const campo = (k) => (new RegExp(`\\|${k.replace(/[/]/g, '\\/')}=([^\\n]*)`).exec(t) || [])[1] || ''
  const chaveTon = (/\{\{Key\|([^}|]+)/.exec(campo('Key')) || [])[1] || ''
  return {
    tonalidade: tonalidade(chaveTon),
    instrumentacao: semModelos(campo('Instrumentation')).slice(0, 200),
    data_composicao: semModelos(campo('Year/Date of Composition')).slice(0, 200),
    titulo_alternativo: semModelos(campo('Alternative Title')).slice(0, 200),
    // (lista de andamentos: "# Adagio – Vivace\n# Andante…")
    andamentos: ((/\|Number of Movements\/Sections=([\s\S]*?)\n\|/.exec(t) || [])[1] || '').slice(0, 3000),
  }
}

// Géneros (em várias línguas) para confirmar que a obra encontrada é a mesma de que a ficha fala
const GENEROS = [
  ['concerto', /\bconcert[oi]s?\b|\bkonzert/i],
  ['sonata', /\bsonat[aei]n?s?\b/i],
  ['suite', /\bsuite/i],
  ['partita', /\bpartit/i],
  ['cantata', /\bcantat|\bkantate/i],
  ['preludio', /\bpr[ée]lud|\bpr[äa]ludium|\bpreludio/i],
  ['fuga', /\bfug(a|ue|e)\b/i],
  ['sinfonia', /\bsymphon|\bsinfoni/i],
  ['missa', /\bmiss[ae]\b|\bmass\b/i],
  ['variacoes', /\bvariat|\bvaria[çc]/i],
  ['quarteto', /\bquartet/i],
  ['trio', /\btrio\b/i],
  ['minueto', /\bminuet|\bmenuet/i],
  ['fantasia', /\bfantas|\bphantas/i],
  ['invencao', /\binvenzion|\binvention/i],
  ['tocata', /\btoccat/i],
  ['magnificat', /\bmagnificat/i],
  ['motete', /\bmot[eo]t/i],
]
const DANCAS = [
  [/chacon|ciaccon|chacony/i],
  [/rigaudon|rigadoon/i],
  [/men?uet|minuet/i],
  [/gavott/i],
  [/bourr[ée]e?/i],
  [/saraband/i],
  [/gigue|giga\b|\bjig/i],
  [/alleman/i],
  [/courante|corrente/i],
  [/passacag|passacail/i],
  [/polonais|polacca/i],
  [/badinerie/i],
  [/siciliano|sicilienne/i],
  [/hornpipe/i],
  [/loure\b/i],
  [/musette/i],
  [/rondeau/i],
].map(([re]) => [re])
const romano = (r) => [...String(r).toUpperCase()].reduce((n, c, i, a) => {
  const v = { I: 1, V: 5, X: 10 }[c] || 0
  return n + (v < ({ I: 1, V: 5, X: 10 }[a[i + 1]] || 0) ? -v : v)
}, 0)
const COLECAO = /^(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|zwei|drei|vier|f[üu]nf|sechs|sieben|acht|neun|zehn|zw[öo]lf|achtzehn|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|doze|due|tre|quattro|sei|dodici|deux|trois|quatre|six|douze)\b/i

// Tonalidade escrita no título, em várias línguas → "c minor", "f major", "b-flat major"
const NOTAS = { do: 'c', ut: 'c', re: 'd', ré: 'd', mi: 'e', fa: 'f', sol: 'g', la: 'a', si: 'b' }
export function tonalidadeDoTitulo(t) {
  const s = String(t || '').replace(/♭/g, '-flat').replace(/♯/g, '-sharp')
  let m = /\b([A-Ga-g])(?:[\s-]?(flat|sharp|b|#|is|es))?[\s-]+(major|minor|dur|moll)\b/i.exec(s)
  if (m) {
    const alt = m[2] ? (/flat|b|es/i.test(m[2]) ? '-flat' : '-sharp') : ''
    const modo = /minor|moll/i.test(m[3]) ? 'minor' : 'major'
    return `${m[1].toLowerCase()}${alt} ${modo}`
  }
  m = /\b(do|ut|re|ré|mi|fa|sol|la|si)(?:\s?(bemolle|b[ée]mol|diesis|di[èe]se|bemol|sustenido))?\s+(magg\w*|min\w*|maj\w*|men\w*|maior|menor|mayor)\b/i.exec(s)
  if (m) {
    const alt = m[2] ? (/b[ée]?mol/i.test(m[2]) ? '-flat' : '-sharp') : ''
    const modo = /^(min|men)/i.test(m[3]) ? 'minor' : 'major'
    return `${NOTAS[m[1].toLowerCase()]}${alt} ${modo}`
  }
  return ''
}

// Coleções: palavras no plural, conjuntos de números de catálogo, "4 Pieces"
const PLURAL = /\b(fantazias|fantasias|fantasies|fantasien|inventions|invenzioni|inventionen|sonatas|sonaten|sonates|suites|suiten|partitas|partiten|concerti|concertos|konzerte|preludes|pr[ée]ludes|praeludien|fugues|fugen|chor[äa]le|chorales|choral-?ges[äa]nge|cantatas|kantaten|anthems|variations|variationen|pieces|st[üu]cke|lieder|songs|duets|duette|trios)\b/i
const INTERVALO = { test: (t) => /\b(?:BWV|BuxWV|HWV|TWV|RV|K\.?|Z\.?|SWV|WoO|Hob\.?)\s*[\dA-Za-z:.]*\d\s*[-–]\s*\d/.test(String(t || '')) && eIntervalo(t) }
const NUMEROS = { two: 2, zwei: 2, deux: 2, due: 2, dois: 2, duas: 2, three: 3, drei: 3, trois: 3, tre: 3, tres: 3, four: 4, vier: 4, quatre: 4, quattro: 4, quatro: 4, five: 5, funf: 5, cinq: 5, cinque: 5, cinco: 5, six: 6, sechs: 6, sei: 6, seis: 6, seven: 7, sieben: 7, sept: 7, sette: 7, sete: 7, eight: 8, acht: 8, huit: 8, otto: 8, oito: 8, nine: 9, neun: 9, neuf: 9, nove: 9, ten: 10, zehn: 10, dix: 10, dieci: 10, dez: 10, twelve: 12, zwolf: 12, douze: 12, dodici: 12, doze: 12 }
function quantas(t) {
  const w = normalizar(t).split(' ')[0] || ''
  return /^\d{1,2}$/.test(w) ? Number(w) : NUMEROS[w] || 0
}

// Palavras que dizem pouco sobre a obra (andamentos, tonalidades, ligações)
const FRACAS = new Set('allegro allegretto andante andantino adagio largo larghetto presto prestissimo vivace moderato grave lento spiritoso affettuoso cantabile assai poco molto tempo major minor flat sharp with from dell della delle degli dello the der die das des den dem und and for per con par pour avec opus nach'.split(' '))
const radical = (w) => w.slice(0, 5)
const fortes = (t) => new Set(normalizar(t).split(' ').filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !/^[ivxlc]+$/.test(w) && !FRACAS.has(w)).map(radical))

// A obra do IMSLP bate com o título impresso? (para aceitar um nº de catálogo que a IA leu mas que não
// está escrito em mais lado nenhum): compatível e com uma palavra forte em comum com o título, o título
// alternativo ou a lista de andamentos (ou um andamento de dança que a obra tem)
export function obraPlausivel(tituloFicha, obra, cat) {
  // (aqui só interessa se o número é desta obra: uma peça de uma coleção pode ter o número da coleção)
  if (!obra || !obraCompativel(tituloFicha, obra, cat, { colecoes: false })) return false
  const danca = DANCAS.find(([re]) => re.test(String(tituloFicha || '')))
  if (danca && obra.andamentos && danca[0].test(obra.andamentos)) return true
  // O título é um andamento inteiro da obra ("Andante cantabile")
  const t = normalizar(tituloFicha)
  if (t.split(' ').length >= 2 && String(obra.andamentos || '').split('\n').some((l) => normalizar(l) === t || normalizar(l).startsWith(t + ' '))) return true
  const daObra = fortes(`${obra.titulo} ${obra.titulo_alternativo || ''} ${obra.andamentos || ''}`)
  const daFicha = [...fortes(tituloFicha)]
  // (palavras compostas: "Triosonate" contém "sonat")
  const longas = normalizar(tituloFicha).split(' ').filter((w) => w.length >= 8)
  return daFicha.some((w) => daObra.has(w)) || longas.some((l) => [...daObra].some((w) => w.length >= 5 && l.includes(w)))
}

// O número do catálogo (3 ou mais algarismos) está sozinho no nome do ficheiro? ("Bach.Cm.1030.pdf", "1047(III)Fl.pdf")
export function numeroNoNome(catalogo, nome) {
  const cat = typeof catalogo === 'string' ? catalogoDe(catalogo) : catalogo
  const d = (/\d+/.exec(cat?.codigo || '') || [])[0] || ''
  return d.length >= 3 && new RegExp(`(^|\\D)${d}(\\D|$)`).test(String(nome || ''))
}

// Número de catálogo que é um conjunto ("BWV 772–786"): a ficha é uma coleção, não uma obra
export const eIntervalo = (texto) => [...String(texto || '').matchAll(/(\d+)\s*[-–]\s*(\d+)/g)].some((m) => Number(m[2]) > Number(m[1]) && Number(m[2]) > 12 && Number(m[2]) - Number(m[1]) < 500 && !/^(19|20)\d\d$/.test(m[1]))

const generosDe = (t) => new Set(GENEROS.filter(([, re]) => re.test(String(t || ''))).map(([g]) => g))

// A obra encontrada é compatível com a ficha? Não, se o título da ficha tem outro número de catálogo
// ("Cello Concerto…, Op. 129" com catálogo "Op.54") ou fala de outro género ("Concerto" ≠ "Sonata")
export function obraCompativel(tituloFicha, obra, cat, { colecoes = true } = {}) {
  const doTitulo = catalogoDe(tituloFicha)
  const familia = (c) => c.replace(/[\s.]*[\d:].*$/, '').toLowerCase()
  if (doTitulo && familia(doTitulo.codigo) === familia(cat.codigo) && normalizar(doTitulo.codigo) !== normalizar(cat.codigo)) return false
  // "No. 6" na ficha e "No.2" na obra: é outra obra da mesma série
  const numero = (t) => {
    const m = /\bN(?:o|r|º|°)?\.?\s?(\d{1,3})\b|\b(?:concerto|sonata|suite|partita|symphon\w*|sinfonia)\s+([IVX]{1,5})\b/i.exec(String(t || ''))
    return m ? (m[1] ? Number(m[1]) : romano(m[2])) : 0
  }
  const nf = numero(tituloFicha)
  const no = numero(obra.titulo)
  if (nf && no && nf !== no) return false
  // Peça numerada ("Sonata II") não recebe o título da coleção inteira ("10 Recorder Sonatas, Op.3")
  if (colecoes && nf && /^\d+\s/.test(obra.titulo)) return false
  // Coleção na ficha ("Achtzehn Choräle…", "Six Sonatas", "Fantazias and In Nomines") não recebe o título de uma só peça
  const colecaoFicha = colecoes && (COLECAO.test(String(tituloFicha || '').trim()) || PLURAL.test(String(tituloFicha || '')))
  const colecaoObra = /^\d+\s/.test(obra.titulo) || PLURAL.test(obra.titulo) || INTERVALO.test(obra.titulo)
  if (colecaoFicha && !colecaoObra && generosDe(obra.titulo).size) return false
  // Peça com número próprio ("Zadok the Priest", HWV 258) não recebe o título de um conjunto de números
  // ("Coronation Anthems, HWV 258-261", "Chorale Preludes, BWV 714-765", "Cantatas, BWV 141-150")
  if (colecoes && !colecaoFicha && INTERVALO.test(obra.titulo)) return false
  // Número de peças diferente ("4 Nachtstücke" / "3 Stücke")
  const qf = quantas(tituloFicha)
  const qo = quantas(obra.titulo)
  if (colecoes && qf && qo && qf !== qo) return false
  // Tonalidade diferente ("Sonata c-Moll" / "Flute Sonata in B minor"): transposição ou catálogo errado
  const tf = tonalidadeDoTitulo(tituloFicha)
  const to = tonalidadeDoTitulo(obra.titulo) || (obra.tonalidade || '').toLowerCase()
  if (tf && to && tf !== to) return false
  // Andamento de dança ("Rigaudon", "Chaconne"): tem de existir na lista de andamentos da obra
  const danca = DANCAS.find(([re]) => re.test(String(tituloFicha || '')))
  if (danca && obra.andamentos) return danca[0].test(obra.andamentos)
  const a = generosDe(tituloFicha)
  const b = generosDe(`${obra.titulo} ${obra.titulo_alternativo || ''}`)
  // (o género pode ser o de um andamento: "Preludio" da "Cello Suite No.1"; os andamentos só confirmam, não recusam)
  const doAndamento = generosDe(obra.andamentos || '')
  if (a.size && b.size && ![...a].some((g) => b.has(g) || doAndamento.has(g))) return false
  return true
}

// Alterações a fazer numa ficha com a obra identificada: título normalizado; o título impresso passa
// para "Título na fonte"; tonalidade e instrumentação só se faltarem (a edição pode ser um arranjo)
export function aplicarObra(ficha, obra, cat) {
  const md = { ...(ficha.metadados || {}) }
  if (ficha.titulo && normalizar(ficha.titulo) !== normalizar(obra.titulo) && !md.titulo_fonte) md.titulo_fonte = ficha.titulo
  if (!md.catalogo) md.catalogo = cat.codigo
  md.imslp = obra.url
  if (obra.tonalidade && !md.tonalidade) md.tonalidade = obra.tonalidade
  if (obra.instrumentacao && !md.instrumentacao) md.instrumentacao = obra.instrumentacao
  if (obra.data_composicao) md.data_composicao = obra.data_composicao
  return { titulo: obra.titulo, metadados: md }
}

// Compositor da ficha para a pesquisa (o primeiro com apelido que não seja intérprete)
export const compositorDe = (autores) => (autores || []).find((a) => a.apelido && !['intérprete', 'editor', 'tradutor'].includes(a.papel))
