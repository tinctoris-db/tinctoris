// Fontes musicais antigas: pistas do nome do ficheiro (data, sigla RISM + cota, fólios, compositor)
// e a distinção entre manuscrito e impresso.
import path from 'node:path'
import { reconhecerExemplar } from './fontes_externas/bibliotecas_digitais.js'

const ROMANOS = { I: 1, V: 5, X: 10, L: 50, C: 100 }
function deRomano(r) {
  let n = 0
  const s = String(r || '').toUpperCase()
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]] || 0
    n += v < (ROMANOS[s[i + 1]] || 0) ? -v : v
  }
  return n
}
const ROMANO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI']

// "séc. XVIII" → "17xx" (para pastas e nomes de ficheiro quando não há ano exato)
export function seculoParaAnos(data) {
  const m = /s[ée]c(?:ulo|\.)?\s*([IVXL]+)\b/i.exec(String(data || ''))
  const n = m ? deRomano(m[1]) : 0
  return n >= 9 && n <= 21 ? `${n - 1}xx` : ''
}

// Palavras que começam títulos, não nomes de compositores ("1502 Missae…", "17xx Partita…")
export const NAO_AUTOR = /^(missa[es]?|missas|misse|missarum|liber|libro|livro|primus|secundus|tertius|il|la|le|les|lo|el|os|as|the|das|die|der|partita|sonata|sonate|sonatas|suite|motetti|motets?|mottetti|cantiones|cantus|canzon[ei]?|canzona|madrigal[ei]?|madrigals|magnificat|hymn[io]s?|vesper[ae]?|reglas|regras|arte|tratado|trattato|tractatus|opus|op|fantasia|fantasias|ricercar[ei]?|toccata|toccate|intavolatura|tablatura|cancionero|cancioneiro|codex|codice|ms|mss|manuscrito|manuscript|fac|facsimile|facs[ií]mil|responsorios?|lamenta[çc][õo]es|lamentationes|officium|psalm[io]s?|salmos|te|tuy|livre|pieces|pi[èe]ces|concerto|concerti|trio|quartetto)$/i

// Sinais de manuscrito / impresso no nome do ficheiro
const NOME_MANUSCRITO = /\b(ms|mss|manuscri\w*|manoscritt\w*|handschrift\w*|autograph\w*|aut[óo]graf\w*|codex|c[óo]dice|cod)\b/i
const NOME_IMPRESSO = /\b(impresso|printed|print|druck|stampa|edi[çc][ãa]o impressa)\b/i

// Abreviaturas de arquivos usadas nos nomes dos ficheiros → sigla RISM (confirmadas pelo Pedro a 1/10/2026)
export const ABREVIATURAS = { BGUC: 'P-Cug', BPMP: 'P-Pm' }
// Cotas "mm243", "MM-40", "MM.51" → "MM 243" (Manuscritos Musicais, como escrevem Coimbra e Porto)
const cotaNormal = (c) => c.replace(/^mm[\s.\-]?(\d+)/i, 'MM $1')

// Pistas do nome do ficheiro. Devolve { data, ano, siglas: [{texto, cota}], folios, autor, titulo, forma }
// (as siglas ainda têm de ser confirmadas no RISM: "G-Dur" ou "I-XII" não são bibliotecas)
// O resto do nome depois do arquivo e da cota ("P-Cug MI 4 Duarte LOBO - Missas 1621" → "Duarte LOBO - Missas 1621"):
// sem a data inicial, outras siglas, "LR"/"pdf"/"cópia", "(59 páginas)", letras soltas e anos modernos (das fotografias)
export function restoDoNome(ficheiro, sigla, cota) {
  let s = path.basename(String(ficheiro || ''), path.extname(String(ficheiro || ''))).normalize('NFC')
  s = s.replace(/\(\d+ p[áa]ginas\)/i, ' ').replace(/[_]+/g, ' ')
  const abrev = Object.keys(ABREVIATURAS).join('|')
  const palavrasCota = String(cota || '').toLowerCase().split(/\s+/).filter(Boolean)
  const fora = (w) => {
    const l = w.toLowerCase()
    return /^[A-Z]{1,3}-[A-Za-z]{1,8}$/.test(w) || new RegExp(`^(${abrev})$`, 'i').test(w) || palavrasCota.includes(l) || l === `${palavrasCota.join('')}` ||
      /^(lr|hr|pdf|c[óo]pia|copy|new|scan|f|ff|-|–)$/i.test(w) || /^(19|20)\d{2}$/.test(w) || /^[frv]$/i.test(w) || /^mm-?\d+$/i.test(w)
  }
  const palavras = s.replace(/\b\d+\.(?=\p{L}{3,})/gu, ' ').replace(/^\s*(c\.?\s?)?(1[0-9]{3}|1[0-9]xx)\b/i, ' ').split(/\s+/).filter((w) => w && !fora(w))
  const vistas = new Set()
  return palavras.filter((w) => (vistas.has(w.toLowerCase()) ? false : vistas.add(w.toLowerCase()))).join(' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim()
}
// Compositores escritos em maiúsculas no nome ("Duarte LOBO", "VICTORIA", "ROGIER e GHERSEM"): candidatos a autor
export function maiusculasDoNome(ficheiro) {
  const s = path.basename(String(ficheiro || ''), path.extname(String(ficheiro || ''))).normalize('NFC').replace(/[_]+/g, ' ')
  return [...new Set((s.match(/\b\p{Lu}[\p{Lu}'’-]{2,}\b/gu) || []).filter((w) => !/^[IVXLCDM]+$/.test(w) && !/^[A-Z]{1,3}-/.test(w) && !/^(LR|HR|PDF|MM|MI|MS|MSS|COD|BGUC|BPMP)$/.test(w)))]
}

export function pistasDoNome(ficheiro) {
  const r = { data: '', ano: '', siglas: [], folios: '', autor: '', titulo: '', forma: '' }
  const original = path.basename(String(ficheiro || ''), path.extname(String(ficheiro || ''))).normalize('NFC')
  let base = original
    .replace(/[_]+/g, ' ')
    .replace(/\s+(pdf|copy|c[óo]pia)\s*$/i, '')
    .replace(/\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Data no início: "1538 …", "1580-1590 …", "17xx …", "c1520 …", "c. 1520 …", "séc. XVI …"
  let m
  if ((m = /^(?:c\.?\s?|ca\.?\s?)(1[0-9]{3})\b[\s,.-]*/i.exec(base))) {
    r.data = `c. ${m[1]}`
    r.ano = m[1]
  } else if ((m = /^(1[0-9]{3}|20[0-2]\d)(?:\s?[-–]\s?(1[0-9]{3}|\d{2}))?\b[\s,.-]*/.exec(base))) {
    r.ano = m[1]
    r.data = m[2] ? `${m[1]}-${m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]}` : m[1]
  } else if ((m = /^(1[0-9])(?:xx|\?\?|XX)\b[\s,.-]*/.exec(base))) {
    r.data = `séc. ${ROMANO[Number(m[1]) + 1]}`
  } else if ((m = /^s[ée]c(?:ulo|\.)?\s*([IVXL]+)\b[\s,.-]*/i.exec(base))) {
    r.data = `séc. ${m[1].toUpperCase()}`
  }
  const resto = m ? base.slice(m[0].length) : base

  // Fólios: "fol 34v", "ff. 12r-15v"
  const f = /\bf(?:ol|f)?\.?\s?(\d+[rv]?(?:\s?[-–]\s?\d+[rv]?)?)\b/i.exec(resto)
  if (f && /[rv]|\d+\s?[-–]/.test(f[1])) r.folios = f[1].replace(/\s/g, '')

  // Siglas RISM candidatas: "P-Cug", "E- Tuy", "D-Mbs" (+ cota a seguir: "MM 37", "L I", "Mus.ms. 34")
  const tokens = resto.split(' ')
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i]
    let salto = 0
    // ("bguc_mm243", "BPMP_MM-40": abreviatura do arquivo em vez da sigla)
    if (ABREVIATURAS[t.toUpperCase()]) t = ABREVIATURAS[t.toUpperCase()]
    // "E- Tuy" (o "_" do nome original partiu a sigla)
    if (/^[A-Z]{1,3}-$/.test(t) && /^[A-Za-z]{1,8}$/.test(tokens[i + 1] || '')) {
      t = t + tokens[i + 1]
      salto = 1
    }
    const s = /^([A-Z]{1,3}-[A-Za-z]{1,8})[.,;:]?$/.exec(t)
    // (tonalidades "G-Dur" e numerações "I-XII" nunca são siglas; o resto é confirmado no RISM)
    if (!s || /-(dur|moll)$/i.test(s[1]) || /^[IVXLC]+-[IVXLC]+$/.test(s[1])) continue
    const cota = []
    for (let j = i + 1 + salto; j < tokens.length && cota.length < 4; j++) {
      const c = tokens[j]
      // (nomes de pastas de fotografias: "E-TZ 2-3 New", "P-Cs - SantaCruz", "P-Cug_MM51")
      if (/^(pdf|com|de|do|da|with|and|e|y|et|fol|ff?\.?|new|copy|c[óo]pia|fotos?|photos?|pictures|imagens|scans?|facs|lr|hr|-)$/i.test(c)) break
      // (um ano a seguir à cota é a data das fotografias: "P-Cug_MM243_2005")
      if (cota.length && /^(1[4-9]|20)\d{2}$/.test(c)) break
      // (depois do número, a cota acabou: "MI 12 Frei Emanuel CARDOSO", "Cod 4 LR", "MM 1 HINOS")
      if (cota.some((x) => /\d/.test(x)) && !/\d/.test(c)) break
      // ("MI 11.VICTORIA": o número cola-se ao nome do compositor)
      const colado = /^(\d+)\.\p{L}{3,}/u.exec(c)
      if (colado) {
        cota.push(colado[1])
        break
      }
      if (/^([A-Za-z]{1,4}-\d+|[A-Za-z]{1,6}\d+[A-Za-z]?|[A-Za-z]{1,6}\.?|[IVXLCDM]{1,6}|\d+[A-Za-z]?|[\d.,/-]+[A-Za-z]?|Mus\.ms\.?|[A-Za-z]{1,4}\.[A-Za-z0-9.]+)$/.test(c)) cota.push(c)
      else break
    }
    r.siglas.push({ texto: s[1], cota: cotaNormal(cota.join(' ')) })
  }

  // Compositor e título: "1410_Fernand Estevan_Reglas …" (partes separadas por "_") ou "1502 Josquin Missas"
  const partes = original.split('_').map((p) => p.trim()).filter(Boolean)
  if (partes.length >= 3 && /^(c\.?\s?)?(1[0-9]{3}|1[0-9]xx)/i.test(partes[0]) && /^[\p{Lu}][\p{L}'’.-]+(?: [\p{L}'’.-]+){0,3}$/u.test(partes[1]) && !NAO_AUTOR.test(partes[1].split(' ')[0])) {
    r.autor = partes[1]
    r.titulo = partes.slice(2).join(' ').replace(/\s+pdf$/i, '').trim()
  } else if (m) {
    const palavras = resto.split(' ')
    // (palavras todas em maiúsculas são o título impresso: "PRIMVS LIBER…")
    if (palavras.length >= 2 && /^[\p{Lu}][\p{Ll}'’-]{2,}$/u.test(palavras[0]) && !NAO_AUTOR.test(palavras[0]) && !r.siglas.some((s) => s.texto.startsWith(palavras[0]))) {
      r.autor = palavras[0]
      r.titulo = palavras.slice(1).join(' ')
    } else r.titulo = resto
  }

  if (NOME_MANUSCRITO.test(resto) || r.siglas.some((s) => /^(MM \d|Mss?\.?\s?\d)/i.test(s.cota))) r.forma = 'manuscrito'
  else if (NOME_IMPRESSO.test(resto)) r.forma = 'impresso'
  return r
}

// Manuscrito ou impresso, juntando os sinais (o catálogo, quando identifica, tem a última palavra)
// (antes: a ficha já era de um manuscrito — numa reanálise a IA, que só vê uma página, não a passa a impresso)
export function formaProvavel({ ia, nome, temCota, antes = '' }) {
  if (nome.forma) return nome.forma
  if (antes) return antes
  if (ia?.escrita === 'manuscrito') return 'manuscrito'
  if (ia?.escrita === 'impresso') return 'impresso'
  if (temCota) return 'manuscrito'
  return ''
}

// Fonte de arquivo (sigla do RISM + cota no nome do ficheiro) que a IA leu como «impresso» sem nenhum sinal de impressão
// — sem impressor/editora, local ou data de impressão, nem fórmula de imprenta —: é um manuscrito (Pedro, 2/10/2026:
// «P-BRd_949_antifonario», #15445 «P-BRd_964», códices fotografados cuja capa vazia a IA tomou por um livro impresso)
// (não se aplica a cotas e nomes de impressos — «4 Mus.pr. 96», «Res.» — nem a digitalizações com bsb/ark/purl no nome)
const COTA_DE_IMPRESSO = /\bmus\.?\s*pr\b|(^|[\s.-])res(\.|[\s-]|$)|\bbsb\d|btv1b|bpt6k|\bark:|purl/i
const FORMULA_DE_IMPRENTA = /\b(apud|typis|typographi\w*|excud\w*|stampa|appresso|impress[oa]|gedruckt|verlegt|chez|printed|imprim\w*|en casa de|ex officina|in officina)\b/i
export function manuscritoPelaCota({ ia, nome = {}, temCota, antes = '', ficheiro = '', cota = '', texto = '' }) {
  if (!temCota || ia?.escrita !== 'impresso' || nome.forma || antes) return false
  if (ia.editora || ia.local || ia.ano) return false
  if (COTA_DE_IMPRESSO.test(`${cota} ${path.basename(String(ficheiro))}`.replace(/_/g, ' '))) return false
  return !FORMULA_DE_IMPRENTA.test(`${ia.titulo || ''}\n${texto || ''}`)
}

// ---------------- Exemplar digitalizado
// Muitas bibliotecas digitais põem à frente do PDF uma página própria com o título, a cota do exemplar
// e um identificador permanente (URN, ark, purl). A lista das bibliotecas reconhecidas está em
// fontes_externas/bibliotecas_digitais.js. Ordem: identificador no nome do ficheiro → camada de texto da 1.ª página
// → OCR da 1.ª página (o texto dessa página vem muitas vezes cifrado), este só quando "ocr" é verdadeiro.
export async function exemplarDigitalizado(pdf, { linguas, tessdata, correr, pdftoppm, tesseract, texto = '', nome = '', ocr = true } = {}) {
  const direto = reconhecerExemplar({ nome, texto })
  // (a biblioteca reconhecida só por uma frase legível — «Bayerische Staatsbibliothek» na nota de direitos —, sem cota
  //  nem identificador: o resto da folha vem cifrado e lê-se por OCR)
  if ((direto && (direto.id || direto.cota)) || !ocr || !pdf) return direto
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'exemplar-'))
  let lido = ''
  try {
    const base = path.join(tmp, 'p1')
    await correr(pdftoppm, ['-r', '200', '-gray', '-png', '-singlefile', '-f', '1', '-l', '1', pdf, base], { timeout: 120000 })
    const args = [base + '.png', 'stdout', '-l', linguas || 'deu+eng']
    if (tessdata) args.splice(2, 0, '--tessdata-dir', tessdata)
    lido = await correr(tesseract, args, { timeout: 180000 })
  } catch (_) {
    return direto
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
  // (o que o OCR leu só preenche o que faltava: a camada de texto escreve melhor do que o OCR)
  const porOcr = reconhecerExemplar({ nome, texto: lido })
  if (!porOcr) return direto
  return direto ? { ...porOcr, ...Object.fromEntries(Object.entries(direto).filter(([, v]) => v)) } : porOcr
}

// ---------------- Nomes de ficheiro mais ou menos informativos
// "17xx Bach Partita la m flauta BWV 1013" diz muito mais do que "facsimile de partita de bach":
// data, compositor, número de catálogo, sigla + cota, e palavras com sentido
const GENERICAS = /^(scan|img|image|copy|copia|c[óo]pia|pdf|file|document|documento|facsimile|facs[ií]mil|final|new|novo|version|versao|vers[ãa]o|page|pagina|p[áa]gina)$/i
export function informacaoDoNome(nome, catalogoDe) {
  const p = pistasDoNome(nome)
  const base = path.basename(String(nome || ''), path.extname(String(nome || '')))
  let n = 0
  if (p.data) n += 2
  if (p.siglas.length) n += 2
  if (p.autor) n += 1
  if (catalogoDe && catalogoDe(base)) n += 3
  const palavras = base.split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !GENERICAS.test(w))
  return n + Math.min(2, palavras.length / 3)
}

export function melhorNome(nomes, catalogoDe) {
  return nomes.filter(Boolean).reduce((a, b) => (informacaoDoNome(b, catalogoDe) > informacaoDoNome(a, catalogoDe) ? b : a), '')
}
