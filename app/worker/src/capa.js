// Leitura da capa e das primeiras páginas de um PDF: título, autor, ano,
// tipo (tese, JSTOR…), orientador, instituição e palavras-chave.
// Usa as posições e o tamanho das letras (pdftotext -bbox-layout), não só o texto corrido.
import path from 'node:path'
import { BIN } from './config.js'
import { correr } from './extracao.js'
import { pessoa, eInstituicao } from './fontes_externas/util.js'
import { NAO_AUTOR } from './musica_antiga.js'

// Primeiras palavras que não são apelidos: abreviaturas de catálogo e nomes genéricos de ficheiro
export const NAO_APELIDO = /^(bwv|bwvanh|hwv|twv|kv|rv|woo|hob|buxwv|zwv|wq|swv|fwv|gwv|mwv|no|nr|num|n|vol|volume|tomo|scan|img|image|imagem|foto|photo|dsc|doc|documento|file|ficheiro|track|faixa|midi|audio|copy|copia|c[óo]pia|new|novo|final|teste?|untitled|catalogo|cat[áa]logo|catalogue|programa|program|concerto|concerts?|recital|festival|ano|year|pr[ée]ludes?|preludi[oi]?|sinfoni[ae]|symphon\w*|suites?|dances?|danses?|airs?|arie|aria|lessons?|duets?|duett[io]|trios?|quartets?|variations?|variazioni|minuets?|menuets?|gavottes?|chaconnes?|ciaccona|passacaglia|studies|[ée]tudes?|exercises?|exerc[íi]cios|methods?|m[ée]todo|m[ée]thode|canons?|fugues?|fugas?|chorales?|lieder|songs?|hymns?|carols?|masses|anthems?|marche?s?|galliards?|pavanes?|allemandes?|courantes?|sarabandes?|gigues?|rondos?|nocturnes?|valses?|waltz\w*|pdf)$/i
// Compositores com catálogo próprio: "bach_1013" é o BWV 1013, não o ano 1013
const DONO_CATALOGO = /^(bach|buxtehude|handel|h[äa]ndel|haendel|vivaldi|telemann|quantz|sch[üu]tz|schuetz|mozart|haydn|beethoven|purcell)$/i
const entidades = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[e])

// ---------------------------------------------------------------------------
// Layout: páginas → blocos → linhas, com coordenadas e altura (≈ tamanho de letra)

export async function lerLayout(pdf, ultima = 3) {
  let xml = ''
  try {
    xml = await correr(BIN.pdftotext, ['-f', '1', '-l', String(ultima), '-bbox-layout', pdf, '-'], { timeout: 60000 })
  } catch (_) {
    return []
  }
  const paginas = []
  for (const mp of xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const pag = { largura: +mp[1], altura: +mp[2], blocos: [] }
    for (const mb of mp[3].matchAll(/<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/block>/g)) {
      const linhas = []
      for (const ml of mb[5].matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)) {
        const ws = [...ml[5].matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map((w) => ({ x0: +w[1], x1: +w[2], t: entidades(w[3]) }))
        if (!ws.length) continue
        // Letras espaçadas ("W E S T E R N  M U S I C"): juntar letras muito próximas
        const alt = +ml[4] - +ml[2]
        const soltas = ws.filter((w) => w.t.length <= 2).length / ws.length > 0.5
        let texto = ws[0].t
        for (let k = 1; k < ws.length; k++) {
          const gap = ws[k].x0 - ws[k - 1].x1
          const junta = soltas && ws[k - 1].t.length <= 2 && ws[k].t.length <= 2 && gap < alt * 0.45
          texto += (junta ? '' : ' ') + ws[k].t
        }
        linhas.push({ texto, altura: alt, y: +ml[2] })
      }
      if (!linhas.length) continue
      const alturas = linhas.map((l) => l.altura).sort((a, b) => a - b)
      pag.blocos.push({
        x0: +mb[1],
        y0: +mb[2],
        x1: +mb[3],
        y1: +mb[4],
        linhas,
        texto: linhas.map((l) => l.texto).join(' ').replace(/\s+/g, ' ').trim(),
        altura: alturas[Math.floor(alturas.length / 2)],
      })
    }
    paginas.push(pag)
  }
  return paginas
}

// Digitalizações: o Tesseract devolve cada palavra com a posição e a altura (formato TSV)
export async function lerLayoutOcr(pdf, linguas, paginas = 2, tessdata) {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'capa-'))
  const out = []
  try {
    for (let pg = 1; pg <= paginas; pg++) {
      const base = path.join(tmp, 'p' + pg)
      try {
        await correr(BIN.pdftoppm, ['-r', '200', '-gray', '-png', '-singlefile', '-f', String(pg), '-l', String(pg), pdf, base], { timeout: 120000 })
      } catch (_) {
        break
      }
      const args = [base + '.png', 'stdout', '-l', linguas || 'por+eng', 'tsv']
      if (tessdata) args.splice(2, 0, '--tessdata-dir', tessdata)
      const tsv = await correr(BIN.tesseract, args, { timeout: 180000 })
      const blocos = new Map()
      for (const linha of tsv.split('\n').slice(1)) {
        const c = linha.split('\t')
        if (c.length < 12 || c[0] !== '5' || !c[11].trim() || Number(c[10]) < 30) continue
        const [bl, par, ln] = [c[2], c[3], c[4]]
        const [x, y, w, h] = [+c[6], +c[7], +c[8], +c[9]]
        const b = blocos.get(bl) || { x0: x, y0: y, x1: x + w, y1: y + h, linhas: new Map() }
        b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + w); b.y1 = Math.max(b.y1, y + h)
        const k = par + '.' + ln
        const l = b.linhas.get(k) || { palavras: [], alturas: [], y }
        l.palavras.push(c[11]); l.alturas.push(h)
        b.linhas.set(k, l)
        blocos.set(bl, b)
      }
      const pag = { largura: 0, altura: 0, blocos: [] }
      for (const b of blocos.values()) {
        const linhas = [...b.linhas.values()].map((l) => ({ texto: l.palavras.join(' '), altura: l.alturas.sort((a, z) => a - z)[Math.floor(l.alturas.length / 2)] * 0.36, y: l.y * 0.36 }))
        const alturas = linhas.map((l) => l.altura).sort((a, z) => a - z)
        pag.blocos.push({ x0: b.x0 * 0.36, y0: b.y0 * 0.36, x1: b.x1 * 0.36, y1: b.y1 * 0.36, linhas, texto: linhas.map((l) => l.texto).join(' ').replace(/\s+/g, ' ').trim(), altura: alturas[Math.floor(alturas.length / 2)] })
      }
      out.push(pag)
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
  return out
}

// ---------------------------------------------------------------------------
// Partituras e texto cifrado

// Editores de partituras gravam as notas como caracteres ("œœœ", "˙", "‰", "∑")
const MUSICAIS = /[œŒ˙‰∑ÓÏÎ¿∂¯ˆ˘‹›≈]/g
export function tokenMusical(t) {
  const n = (t.match(MUSICAIS) || []).length
  return n > 0 && n >= t.replace(/\s/g, '').length * 0.4
}
export function eTextoMusical(texto) {
  const tokens = String(texto || '').split(/\s+/).filter(Boolean)
  if (tokens.length < 10) return false
  const m = tokens.filter(tokenMusical).length
  return m >= 25 || m / tokens.length > 0.15
}
export function limparMusica(texto) {
  return String(texto || '')
    .split('\n')
    .map((l) => l.split(/(\s+)/).filter((t) => !tokenMusical(t)).join('').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => /\p{L}{2,}/u.test(l))
    .join('\n')
}

// Texto "cifrado": fontes com codificação própria ("&OWVFEFMPCUFOUJPOEV", "5)µ4&")
function tokenCifrado(t) {
  if (t.length < 4) return false
  if (/[\p{L}\d]/u.test(t) && /[&%$²µ¬@#)(*+=<>|\\]/.test(t) && /\p{L}{2,}/u.test(t)) return true
  if (t.length >= 14 && !/\p{Ll}/u.test(t) && /\p{Lu}/u.test(t)) return true
  const letras = (t.match(/\p{L}/gu) || []).length
  if (t.length >= 6 && letras / t.length < 0.3 && (t.match(/[&%$²µ"*/\\-]/g) || []).length >= 3) return true
  return false
}
export function cifrado(texto) {
  const tokens = String(texto || '').split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  return tokens.filter(tokenCifrado).length / tokens.length >= 0.5
}

// Datas por extenso: "le 12 septembre 2015", "12 de setembro de 2015", "September 12, 2015"
const MESES = '(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|dicembre|enero|febrero|marzo|mayo|junio|julio|septiembre|octubre|noviembre|diciembre|januar|februar|märz|juni|juli|oktober|dezember)'
const DATA_EXTENSO = new RegExp(`^(le |el |il |am |on |em |a )?(\\d{1,2}(er|º|\\.)?\\s+(de\\s+)?${MESES}(\\s+de)?,?\\s+(1[5-9]|20)\\d{2}|${MESES}\\s+\\d{1,2},?\\s+(1[5-9]|20)\\d{2}|${MESES}\\s+(de\\s+)?(1[5-9]|20)\\d{2})\\.?$`, 'i')
export const eDataExtenso = (t) => DATA_EXTENSO.test(String(t || '').trim())

// ---------------------------------------------------------------------------
// Classificação de blocos

const RX = {
  instituicao: /\b(universidade|university|universit[àéa]|universidad|instituto|institute|escola superior|faculdade|faculty|faculdad|departamento|department|school of|conservat[oó]ri|college|academia|academy|hochschule|centro de estudos)\b/i,
  ano: /^(ano|year|année)?\s*(1[5-9]|20)\d{2}\.?$/i,
  declaracao: /\b(apresentad[ao]|submitted|submetid[ao]|presented|requisitos|requirements|obten[çc][ãa]o do grau|degree of|grau de|in partial fulfil|en vue de l.obtention|pr[ée]sent[ée]e et soutenue|soutenue publiquement|pour obtenir le grade|para optar|presentada por|zur erlangung|doktorgrades|dottorato di ricerca|doctor of philosophy)/i,
  rotuloTese: /^(tese|disserta[çc][ãa]o|thesis|dissertation|th[èe]se|tesis|tesi|relat[óo]rio|trabalho de projeto|projeto|inaugural-dissertation)( (de|of|final|di|zur))?( (doutoramento|mestrado|licenciatura|doctorate|master|phd|doctorat|doctoral|dottorato|laurea))?\.?$|^(doctorat de l.universit|th[èe]se de doctorat|tesis doctoral|tesi di dottorato|doctoral (thesis|dissertation)|phd (thesis|dissertation))/i,
  orientacao: /\b(orienta[çc][ãa]o|orientador|orientadora|co-orienta|supervis(ed|or|ão|ora)|advisor|directeur|relatore)\b/i,
  apoio: /\b(apoio financeiro|financiad|funded by|bolsa|fct\b|fse\b|protec\b|quadro comunit|grant)\b/i,
  lixo: /(^©|copyright|all rights reserved|todos os direitos|https?:\/\/|www\.|\bdoi\b|issn|isbn|downloaded from|this content downloaded|jstor|terms and conditions|page \d+|^\d+$|^p\.\s*\d+|vol\.\s*\d+|pp\.\s*\d+|\bno\.\s*\d+)/i,
  juri: /^(o )?j[úu]ri\b|^jury\b|^presidente\b|^vogais?\b|^membres du jury|^composition du jury|^tribunal\b|^commissione\b|^pr[üu]fungskommission|professeur des universit[ée]s|directeur de recherche|directrice de recherche|ma[îi]tre de conf[ée]rences/i,
}

// Palavras que existem em títulos mas não em nomes de pessoas
const NAO_NOMES = new Set(['edition', 'edição', 'édition', 'ediçao', 'series', 'série', 'serie', 'volume', 'vol', 'contents', 'brief', 'critique', 'critical', 'crítica', 'music', 'música', 'musica', 'musique', 'musik', 'century', 'século', 'history', 'história', 'handbook', 'journal', 'review', 'revista', 'studies', 'estudos', 'introduction', 'introdução', 'press', 'university', 'part', 'parte', 'book', 'livro', 'chapter', 'capítulo', 'revised', 'second', 'third', 'fourth', 'new', 'nova', 'novo', 'science', 'ciência', 'theory', 'teoria', 'practice', 'prática', 'performance', 'education', 'educação', 'research', 'investigação', 'science', 'arts', 'art', 'arte', 'department', 'departamento', 'index', 'índice', 'preface', 'prefácio', 'foreword', 'abstract', 'resumo', 'acknowledgements', 'agradecimentos', 'copyright', 'library', 'um', 'uma', 'o', 'os', 'a', 'as', 'para', 'no', 'na', 'nos', 'nas', 'com', 'em', 'sobre', 'entre', 'pelo', 'pela', 'the', 'of', 'and', 'in', 'on', 'for', 'to', 'an', 'at', 'from', 'with', 'le', 'les', 'des', 'du', 'et', 'il', 'lo', 'gli', 'el', 'los', 'las', 'y', 'und', 'der', 'die', 'das', 'im', 'zur', 'zum'])
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'van', 'von', 'di', 'del', 'della', 'la', 'le', 'du', 'y', 'ten', 'ter'])

function pareceNome(t) {
  const s = t.replace(/[.,;]+$/, '').trim()
  if (!s || s.length > 70 || /[\d:!?@()"“”«»/]/.test(s) || RX.instituicao.test(s) || eInstituicao(s)) return false
  const ps = s.split(/\s+/)
  if (ps.length < 2 || ps.length > 7) return false
  for (const p of ps) {
    const baixa = p.toLowerCase()
    if (NAO_NOMES.has(baixa) && !PARTICULAS.has(baixa)) return false
    if (PARTICULAS.has(baixa)) continue
    if (!/^[\p{Lu}][\p{L}'’.\-]*$/u.test(p)) return false
  }
  return true
}

const maiusculas = (s) => s === s.toUpperCase() && /\p{Lu}{3}/u.test(s)

// "PEDRO ALEXANDRE SOUSA E SILVA" → "Pedro Alexandre Sousa e Silva"
function nomeProprio(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i && PARTICULAS.has(p) ? p : p.replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())))
    .join(' ')
}

// Títulos em maiúsculas passam a "Maiúscula só no início" (como nos repositórios)
function tituloNormal(s) {
  s = s.replace(/\s+/g, ' ').replace(/\s+([:;,.])/g, '$1').replace(/\s+\p{L}$/u, '').trim()
  if (!maiusculas(s)) return s
  const baixo = s.toLowerCase()
  return baixo.charAt(0).toUpperCase() + baixo.slice(1).replace(/([:.?!]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
}

// Agradecimentos, notas biográficas, índices, notas de rodapé, texto corrido
function naoTitulo(t) {
  if (/^[\[(*†‡§¹²³\d]/.test(t) && !/^\d{4}\b/.test(t)) return true
  // Páginas internas de um livro, não títulos
  if (/^(about the authors?|sobre o autor|contents|[íi]ndice|table of contents|preface|pref[áa]cio|foreword|introduction|introdu[çc][ãa]o|acknowledg(e)?ments|agradecimentos|index|bibliography|bibliografia|references|copyright|list of (figures|tables|illustrations)|notes on contributors|abbreviations|abreviaturas)\.?$/i.test(t.trim())) return true
  if (/\b(agrade[çc]|thank|grateful|gratitude|dedico|dedicated to|is (an )?(associate |assistant )?professor|received (his|her)|range of content|trusted digital archive|all rights|this article|este artigo|cet article|questo articolo)\b/i.test(t)) return true
  if (/(\d+\s+){3,}/.test(t)) return true
  if (/\b(por|pelo|pela|pelos|pelas|for)\s+(\S+\s+){0,3}(apoio|ajuda|paci[êe]ncia|incentivo|carinho|amizade|disponibilidade|support|help|patience|guidance|friendship)\b/i.test(t)) return true
  // Frases (com verbo) em vez de títulos: "Silvestro Ganassi é considerado hoje…"
  if (/\s(é|são|foi|foram|era|is|are|was|were|est|sont|ist|sind)\s/i.test(` ${t} `) && t.split(/\s+/).length > 8) return true
  const palavras = t.split(/\s+/).length
  if (palavras > 28) return true
  if (/[a-zà-ú]\.\s+[A-ZÀ-Ú]/.test(t) && palavras > 14) return true
  return false
}

function classificar(b) {
  const t = b.texto
  if (cifrado(t)) return 'lixo'
  if (eDataExtenso(t)) return 'ano'
  if (RX.juri.test(t)) return 'juri'
  if (RX.declaracao.test(t) && /\b(tese|disserta[çc][ãa]o|thesis|dissertation|th[èe]se|tesis|relat[óo]rio de est[áa]gio|trabalho de projeto)\b/i.test(t) && t.length < 900) return 'declaracao'
  if (RX.rotuloTese.test(t)) return 'rotulo'
  if (RX.orientacao.test(t)) return 'orientacao'
  if (RX.apoio.test(t)) return 'apoio'
  if (RX.ano.test(t)) return 'ano'
  if (RX.instituicao.test(t) && t.split(' ').length <= 16) return 'instituicao'
  if (RX.lixo.test(t)) return 'lixo'
  if (pareceNome(t)) return 'nome'
  if (naoTitulo(t)) return 'lixo'
  return 'texto'
}

// ---------------------------------------------------------------------------
// Capa de tese / documento

function orientadorDe(texto) {
  const m = /orienta[çc][ãa]o(?: cient[íi]fica)?(?: d[oa]s?)?\s+(?:(?:Prof(?:\.|essor[a]?)?|Doutor[a]?|Dr\.?[a]?|Professora?)\s+)*([\p{Lu}][\p{L}'’\-]+(?:\s+(?:d[aeo]s?|e|[\p{Lu}][\p{L}'’\-]+)){1,7})/u.exec(texto)
  return m ? m[1].replace(/\s+(Professor|Professora|Doutor|Doutora)$/u, '').trim() : ''
}

function grauDe(texto) {
  if (/\b(doutor|doutoramento|doctor|doctoral|phd|ph\.d|doctorat|dottorato)\b/i.test(texto)) return 'Doutoramento'
  if (/\b(mestre|mestrado|master|maîtrise|laurea magistrale)\b/i.test(texto)) return 'Mestrado'
  if (/\b(licenciatura|licenciado|bachelor)\b/i.test(texto)) return 'Licenciatura'
  return ''
}

function anoDe(texto) {
  const m = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(texto || '')
  return m ? m[1] : ''
}

export function analisarCapa(paginas) {
  const r = { titulo: '', autores: [], ano: '', tese: false, grau: '', orientador: '', instituicao: '', confianca: 0 }
  if (!paginas.length) return r
  const todos = paginas.flatMap((p, i) => p.blocos.map((b) => ({ ...b, pagina: i, classe: classificar(b) })))

  // Tese: rótulo ("Dissertação de doutoramento") ou declaração ("apresentada à Universidade…")
  const decl = todos.find((b) => b.classe === 'declaracao')
  const rot = todos.find((b) => b.classe === 'rotulo')
  const juri = todos.filter((b) => b.classe === 'juri').length >= 1 && todos.some((b) => b.classe === 'instituicao')
  if (decl || rot || juri) {
    r.tese = true
    r.grau = grauDe(`${decl?.texto || ''} ${rot?.texto || ''}`) || (juri ? 'Doutoramento' : '')
    r.orientador = orientadorDe(todos.filter((b) => b.classe === 'declaracao' || b.classe === 'orientacao').map((b) => b.texto).join(' '))
  }
  const inst = todos.find((b) => b.classe === 'instituicao')
  if (inst) r.instituicao = (/((universidade|university|instituto|escola superior|faculdade)[^,;]*?)(?=\s+(departamento|department|faculdade|escola|\d{4})|$)/i.exec(inst.texto) || [])[1] || ''

  // Página da capa: a primeira com texto útil (numa tese, a da declaração ou a 1.ª)
  const pagCapa = paginas.findIndex((p) => p.blocos.some((b) => ['texto', 'nome'].includes(classificar(b))))
  if (pagCapa < 0) return r
  const blocos = todos.filter((b) => b.pagina === pagCapa)

  // Ano: bloco só com o ano, ou ano no bloco da instituição, ou na declaração
  const blocoAno = blocos.find((b) => b.classe === 'ano') || todos.find((b) => b.classe === 'ano')
  r.ano = anoDe(blocoAno?.texto) || anoDe(inst?.texto) || (r.tese ? anoDe(decl?.texto) : '')
  if (!blocoAno && inst) {
    // "Universidade de Aveiro Departamento… 2010" (ano na mesma caixa)
    const m = /\b(19|20)\d{2}\b/.exec(inst.texto)
    if (m) r.ano = m[0]
  }

  // Título: o bloco de texto com letra maior (desempate: mais acima); junta subtítulo contíguo
  const textos = blocos.filter((b) => b.classe === 'texto' && b.texto.split(' ').length >= 2 && b.texto.length <= 400)
  if (textos.length) {
    const maior = Math.max(...textos.map((b) => b.altura))
    const cands = textos.filter((b) => b.altura >= maior * 0.92).sort((a, b) => a.y0 - b.y0)
    let t = cands[0]
    let titulo = t.texto
    for (const b of textos) {
      if (b === t) continue
      const contiguo = b.y0 >= t.y1 - 2 && b.y0 - t.y1 < t.altura * 1.6 && Math.abs(b.x0 - t.x0) < 20 && b.altura >= t.altura * 0.7
      if (contiguo) {
        titulo += (/[:.?!]$/.test(titulo) ? ' ' : ': ') + b.texto
        t = { ...t, y1: b.y1 }
      }
    }
    r.titulo = tituloNormal(titulo)
    r.confianca = cands.length === 1 ? 0.8 : 0.6
    if (textos.length === 1) r.confianca = 0.85
  }

  // Autor: bloco com cara de nome; preferir o mais perto do título (mesma altura ou logo acima/abaixo)
  const nomes = blocos.filter((b) => b.classe === 'nome')
  if (nomes.length) {
    const tb = textos.find((b) => r.titulo && tituloNormal(b.texto) === r.titulo.split(': ')[0]) || textos[0]
    const dist = (b) => (tb ? Math.abs(b.y0 - tb.y0) : b.y0)
    const autor = nomes.sort((a, b) => dist(a) - dist(b))[0]
    const nome = maiusculas(autor.texto) ? nomeProprio(autor.texto) : autor.texto.replace(/[.,;]+$/, '')
    const p = pessoa(nome.replace(/\s+/g, ' '))
    if (p) r.autores = [p]
  }
  return r
}

// ---------------------------------------------------------------------------
// Capa do JSTOR ("Author(s): …", "Source: …", "Stable URL: …/stable/123")

export function analisarJstor(texto) {
  if (!/jstor\.org\/stable\/|This content downloaded|JSTOR is a not-for-profit/i.test(texto || '')) return null
  const linhas = texto.split('\n').map((l) => l.trim())
  const iAut = linhas.findIndex((l) => /^Author\(s\):/i.test(l))
  const titulo = (iAut > 0 ? linhas.slice(0, iAut) : []).filter((l) => l && !/^Review:?$/i.test(l)).join(' ').trim()
  const autores = iAut >= 0 ? linhas[iAut].replace(/^Author\(s\):\s*/i, '').split(/\s*(?:,|\band\b|&)\s*/).map((n) => pessoa(n.trim())).filter(Boolean) : []
  const fonte = (linhas.find((l) => /^Source:/i.test(l)) || '').replace(/^Source:\s*/i, '')
  const estavel = (/jstor\.org\/stable\/(\d+)/i.exec(texto) || [])[1] || ''
  return { titulo: tituloNormal(titulo), autores, ano: anoDe(fonte), fonte, doi: estavel ? `10.2307/${estavel}` : '' }
}

// ---------------------------------------------------------------------------
// Palavras-chave escritas pelo autor ("Palavras-chave: …", "Keywords …")

const ROTULOS_PC = '(?:palavras[\\s-]*chave|key\\s*-?words|mots[\\s-]*cl[ée]s|parole\\s+chiave|palabras\\s+clave|schl[üu]sselw[öo]rter|schlagw[öo]rter|stichw[öo]rter)'

export function palavrasChaveDoTexto(texto) {
  if (!texto) return []
  const linhas = texto.split('\n')
  const rx = new RegExp(`^(\\s*)${ROTULOS_PC}\\s*[:.\\-–—]?\\s*(.*)$`, 'i')
  for (let i = 0; i < linhas.length; i++) {
    const m = rx.exec(linhas[i])
    if (!m) continue
    let recolha = m[2].trim()
    // Continuação: linhas seguintes indentadas (layout em colunas) ou até linha vazia
    const coluna = linhas[i].length - linhas[i].trimStart().length + (linhas[i].trim().length - m[2].trim().length)
    for (let j = i + 1; j < Math.min(linhas.length, i + 8); j++) {
      const l = linhas[j]
      if (!l.trim()) break
      const indent = l.length - l.trimStart().length
      if (/^\s*(resumo|abstract|r[ée]sum[ée]|riassunto|resumen|zusammenfassung|introdu|1[.\s]|índice|contents)/i.test(l)) break
      if (!recolha || indent >= Math.max(1, coluna - 4) || /[,;]\s*$/.test(recolha)) recolha += ' ' + l.trim()
      else break
    }
    const lista = recolha
      .split(/\s*[;,·•|]\s*|\s+[-–—]\s+(?=\p{Lu})/u)
      .map((s) => s.split(/\s{3,}/)[0].replace(/^[.\s:;–-]+|[.\s-]+$/g, '').trim())
      .filter((s) => !/-$/.test(s) && s.split(' ').length <= 6)
      .filter((s) => s.length >= 2 && s.length <= 60 && !/^\d+$/.test(s))
    if (lista.length >= 2) return [...new Set(lista)].slice(0, 12)
  }
  return []
}

// ---------------------------------------------------------------------------
// Nome do ficheiro: "Silva_2010_TÍTULO", "Soares 2013 Título", "PERKINS - Título",
// "Duke et all 2009 Título", "Meinz and Hambrick 2010"

export function doNomeFicheiro(ficheiro) {
  // (só contadores de cópias, "(2)"; "(1735)" é um ano)
  const base = path.basename(ficheiro, path.extname(ficheiro)).normalize('NFC').replace(/\s*\(\d{1,2}\)$/, '').trim()
  const r = { autor: '', ano: '', titulo: '' }
  // ("IMG 1604", "Scan 2019", "Suite 1720 …", "Op 12": a 1.ª palavra não é um autor)
  const naoAutor = (a) => NAO_APELIDO.test(String(a).split(/[\s,]/)[0]) || NAO_AUTOR.test(String(a).split(/[\s,]/)[0])
  // Nome dado pela própria biblioteca: "{data}_{AUTOR}_{Titulo}" (menos fiável: pode ter sido um palpite)
  let m = /^(\d{4}(?:-\d{2}){0,2}|SD)_([A-Z0-9][A-Z0-9-]*)_(.+)$/.exec(base)
  if (m) {
    const autor = /^(ANONIMO|NONE|SD|\d+)$/.test(m[2]) ? '' : nomeProprio(m[2].replace(/-/g, ' '))
    const titulo = m[3].replace(/-/g, ' ')
    // O "título" pode ser o nome original do Mendeley ("Berger 1987 Musica ficta")
    const dentro = /^([\p{Lu}][\p{L}'’]+(?: et al)?) ((?:1[5-9]|20)\d{2}) (.{3,})$/u.exec(titulo)
    if (dentro && !autor) return { autor: dentro[1].replace(/ et al$/, ''), ano: dentro[2], titulo: dentro[3] }
    return { autor, ano: m[1] === 'SD' ? '' : m[1].slice(0, 4), titulo, propria: true }
  }
  m = /^([\p{Lu}][\p{L}'’\-]+(?:,? (?:et al+\.?|and|&|e) [\p{Lu}]?[\p{L}'’\-.]*)?)[_\s]+((?:1[5-9]|20)\d{2})[_\s]+(.{3,})$/u.exec(base)
  if (m && !naoAutor(m[1])) return { autor: m[1].replace(/,? (et al+\.?|and .*|& .*|e .*)$/, ''), ano: m[2], titulo: tituloNormal(m[3].replace(/_/g, ' ')) }
  m = /^([\p{Lu}][\p{Lu}'’\-]{2,})\s*[-–]\s*(.{3,})$/u.exec(base)
  if (m) return { autor: nomeProprio(m[1]), ano: anoDe(m[2].match(/\((?:[^)]*\s)?(\d{4})\)/)?.[1] || ''), titulo: tituloNormal(m[2].replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, '').replace(/_/g, ' ')) }
  // "Mozart - Var. (12) K179…", "Bach - Sonata in B Minor…" (sem ano)
  m = /^([\p{Lu}][\p{L}'’]+(?: [\p{Lu}][\p{L}'’]+){0,2})\s+[-–]\s+(.{4,})$/u.exec(base)
  if (m && !/^(violino?|violin|viola|flauta|flute|flauto|piano|oboe|cello|violoncello|guitarra|guitar|orgão|organ|cravo|harpsichord|canto|voz|voice|coro|choir|vol|volume|parte|part|livro|book|cap[íi]tulo|chapter|ex|exerc[íi]cio)$/i.test(m[1].split(' ')[0])) {
    return { autor: m[1], ano: anoDe(m[2].match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[0] || ''), titulo: m[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim() }
  }
  m = /^([\p{Lu}][\p{L}'’\-]+(?:,? (?:et al+\.?|and|&|e) [\p{L}'’\-.]+)?)[_\s]+((?:1[5-9]|20)\d{2})$/u.exec(base)
  if (m && !naoAutor(m[1])) return { autor: m[1].replace(/,? (et al+\.?|and .*|& .*|e .*)$/, ''), ano: m[2], titulo: '' }
  // "rossi_1608_9", "abel_1771_1", "banchieri_1605_sonata_1" (mesmo em minúsculas): a 1.ª palavra é
  // provavelmente o apelido (o processador só o aceita confirmado: compositor já conhecido na biblioteca ou
  // no RISM) e quatro algarismos entre 1400 e o ano atual são o ano; o número final é o da peça.
  // (1000–1399: só "anoAntigo", aceite se o compositor for conhecido; nos donos de catálogo, "bach_1013" é o BWV)
  m = /^([\p{L}][\p{L}'’]{2,})[_\s-]+([12]\d{3})(?:[_\s-]+(.*))?$/u.exec(base)
  const n = m ? Number(m[2]) : 0
  if (m && !NAO_AUTOR.test(m[1]) && !NAO_APELIDO.test(m[1]) && n >= (DONO_CATALOGO.test(m[1]) ? 1400 : 1000) && n <= new Date().getFullYear()) {
    const titulo = (m[3] || '').replace(/[_-]+/g, ' ').replace(/\s*\bpdf$/i, '').replace(/(^|\s+)\d{1,3}[a-z]?$/i, '').trim()
    return { autor: nomeProprio(m[1]), provavel: true, ano: n >= 1400 ? m[2] : '', anoAntigo: n < 1400 ? m[2] : '', titulo: titulo.length >= 3 ? titulo : '' }
  }
  // Só o ano: quatro algarismos soltos entre 1400 e o ano atual ("sonata_1720_2", "Suite (1735)"), a não ser
  // que venham logo a seguir a um catálogo ou número ("BWV 1013", "Op. 1720", "No 1500")
  // (fora: datas de descarga "2018-12-13 16_26_38", períodos "1500-1800" / "c. 1500–1837", nomes só com números "1490_001")
  const limpo = base
    .replace(/(?<!\d)(19|20)\d{2}-\d{2}-\d{2}[\s_]+\d{2}[_.:]\d{2}[_.:]\d{2}(?!\d)/g, ' ')
    .replace(/(?<!\d)1\d{3}\s?[-–]\s?(1\d{3}|20\d{2}|\d{2})(?!\d)/g, ' ')
  const tokens = /^[\d\s_.-]+$/.test(base) ? [] : limpo.split(/[_\s().,;[\]-]+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    if (!/^(1[4-9]\d{2}|20\d{2})$/.test(tokens[i]) || Number(tokens[i]) > new Date().getFullYear()) continue
    if (i && /^(bwv|bwvanh|anh|hwv|twv|kv?|rv|woo|hob|buxwv|zwv|wq|swv|fwv|gwv|mwv|qv|op|opus|no|nr|n|num|s|d|l|h|z|p|pp|fol|f|ms|mss|cod|codex|mus|img|image|dsc|dscn|scan|scans|photo|foto|pic|pict|screenshot|captura|page|pagina|página|track|faixa|file|doc)\.?$/i.test(tokens[i - 1])) continue
    return { ...r, ano: tokens[i] }
  }
  return r
}
