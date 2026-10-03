// Extração de informação dos ficheiros: PDF, áudio/vídeo, identificadores.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { BIN } from './config.js'
import { comPrioridade } from './intensidade.js'

const exec = promisify(execFile)

export async function correr(bin, args, opcoes = {}) {
  // (em poupança, em prioridade baixa: ver intensidade.js)
  ;[bin, args] = comPrioridade(bin, args)
  const { stdout } = await exec(bin, args, { maxBuffer: 512 * 1024 * 1024, timeout: opcoes.timeout || 600000, env: opcoes.env || process.env })
  return stdout
}

export async function pdfInfo(p) {
  try {
    const out = await correr(BIN.pdfinfo, ['-enc', 'UTF-8', p], { timeout: 30000 })
    const d = {}
    for (const linha of out.split('\n')) {
      const i = linha.indexOf(':')
      if (i > 0) d[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
    }
    return { titulo: d.Title || '', autor: d.Author || '', assunto: d.Subject || '', palavras: d.Keywords || '', paginas: parseInt(d.Pages || '0', 10) || 0, programa: d.Creator || '' }
  } catch (_) {
    return { titulo: '', autor: '', assunto: '', palavras: '', paginas: 0, programa: '' }
  }
}

export async function pdfTexto(p, primeira, ultima, layout = false) {
  const args = ['-enc', 'UTF-8']
  if (layout) args.push('-layout')
  if (primeira) args.push('-f', String(primeira))
  if (ultima) args.push('-l', String(ultima))
  try {
    return await correr(BIN.pdftotext, [...args, p, '-'], { timeout: 300000 })
  } catch (_) {
    return ''
  }
}

// Um PDF "tem texto" se a camada de texto tiver conteúdo razoável por página.
export function temTextoUtil(texto, paginas) {
  const letras = (texto.match(/\p{L}/gu) || []).length
  return letras > 200 * Math.max(1, Math.min(paginas || 1, 3)) * 0.5
}

export async function ffprobe(p) {
  try {
    const out = await correr(BIN.ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', p], { timeout: 60000 })
    const f = JSON.parse(out).format || {}
    const tags = {}
    for (const [k, v] of Object.entries(f.tags || {})) tags[k.toLowerCase()] = v
    return { tags, duracao: Number(f.duration) || 0 }
  } catch (_) {
    return { tags: {}, duracao: 0 }
  }
}

export function formatarDuracao(s) {
  if (!s) return ''
  s = Math.round(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export async function lerTextoSimples(p) {
  try {
    return (await fsp.readFile(p, 'utf8')).slice(0, 20_000_000)
  } catch (_) {
    return ''
  }
}

// ---- Identificadores

export function encontrarDoi(texto) {
  const m = /\b(10\.\d{4,9}\/[^\s"'<>\]]+)/i.exec(texto || '')
  return m ? m[1].replace(/[.,;:)\]]+$/, '') : ''
}

function isbnValido(d) {
  if (d.length === 10) {
    let s = 0
    for (let i = 0; i < 10; i++) s += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i)
    return s % 11 === 0
  }
  if (d.length === 13) {
    let s = 0
    for (let i = 0; i < 13; i++) s += Number(d[i]) * (i % 2 ? 3 : 1)
    return s % 10 === 0
  }
  return false
}

export function encontrarIsbn(texto) {
  const re = /ISBN(?:-1[03])?[:\s]*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])/g
  let m
  while ((m = re.exec(texto || ''))) {
    const d = m[1].replace(/[\s-]/g, '').toUpperCase()
    if (isbnValido(d)) return d
  }
  return ''
}

// Título provável a partir do nome do ficheiro ("Bach_-_Fuga_BWV_578.pdf" -> "Bach - Fuga BWV 578")
export function tituloDoNome(ficheiro) {
  return path
    .basename(ficheiro, path.extname(ficheiro))
    .normalize('NFC')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Descarta títulos de metadados PDF que não dizem nada.
export function tituloPdfUtil(t) {
  if (!t || t.length < 4) return false
  if (/^(none|null|untitled|sem t[íi]tulo|title|t[íi]tulo|document|documento|folhas de rosto|capa|cover|front matter|book|livro|pdf|print|\d+|about the authors?|contents|[íi]ndice|preface|introduction|index|copyright)$/i.test(t.trim())) return false
  if (/_|academia[ _-]?preview|z-lib|libgen|\.(docx?|pdf|indd|tex|qxd|p65)\b/i.test(t)) return false
  // Nome da coleção ou da editora em vez da obra ("\"CD Sheet Music\" by Stephens Publishing Company")
  if (/\bby [\p{Lu}][\p{L}]+.*\b(publishing|publishers?|company|co\.|corp|inc|ltd|llc|verlag|music)\b|readme|©|all rights|cd sheet music/iu.test(t)) return false
  return !/^(microsoft (word|powerpoint)|untitled|sem título|document\d*|scan|img[_ -]?\d|\S+\.(docx?|pdf|indd|tex))/i.test(t)
}

// Nomes de ficheiro que não dizem nada ("Scan_0001", "IMG_2034", "documento (3)")
const PALAVRAS_GENERICAS = new Set(['scan', 'scans', 'img', 'image', 'imagem', 'dsc', 'pxl', 'photo', 'foto', 'document', 'documento', 'doc', 'file', 'ficheiro', 'arquivo', 'untitled', 'sem', 'titulo', 'page', 'pagina', 'screenshot', 'captura', 'ecra', 'digitalizacao', 'digitalizado', 'copia', 'copy', 'final', 'versao', 'version', 'novo', 'new', 'download', 'pdf', 'audio', 'video', 'gravacao', 'recording', 'voice', 'memo'])
export function nomeGenerico(ficheiro) {
  const palavras = tituloDoNome(ficheiro)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !PALAVRAS_GENERICAS.has(w))
  return palavras.length < 2
}

// Primeira linha "com cara de título" do texto de um documento.
export function tituloDoTexto(texto) {
  for (const bruta of String(texto || '').split('\n').slice(0, 40)) {
    const l = bruta.replace(/\s+/g, ' ').trim()
    if (l.length < 10 || l.length > 250) continue
    if (/^(doi|https?:|www\.|©|\(c\)|isbn|issn|\[p\.|p\.|page|vol\.|volume)\b/i.test(l)) continue
    if (/HYPERLINK|MERGEFORMAT|PAGEREF|\bTOC\b|_Toc\d|EMBED |INCLUDEPICTURE/.test(l)) continue
    const palavras = l.split(' ').filter((w) => /\p{L}{2,}/u.test(w))
    if (palavras.length >= 3) return l
  }
  return ''
}

// Word, OpenDocument, RTF: o macOS converte para texto (textutil). Os Word 97–2003 (.doc) que o
// textutil não entende ele devolve-os como "texto" binário: esses são lidos pelo word-extractor
const binario = (t) => t.startsWith('ÐÏ\u0011à') || t.startsWith('ÐÏ') || (t.slice(0, 4000).match(/[\u0000-\u0008\u000e-\u001f�]/g) || []).length > 40
export async function textoDocumento(p) {
  let texto = ''
  try {
    texto = await correr('/usr/bin/textutil', ['-convert', 'txt', '-stdout', p], { timeout: 120000 })
  } catch (_) {}
  if (/\.(doc|dot)$/i.test(p) && (!texto.trim() || binario(texto))) {
    try {
      const { default: WordExtractor } = await import('word-extractor')
      texto = (await new WordExtractor().extract(p)).getBody()
    } catch (_) {
      texto = ''
    }
  }
  return binario(texto) ? '' : texto.slice(0, 20_000_000)
}

// Autor dos metadados escondidos do PDF: só se parecer um nome completo
export function autorPdfUtil(a) {
  const s = String(a || '').trim()
  if (!s || s.length > 80 || /@|\\|\/|\d/.test(s)) return ''
  if (/^(none|null|unknown|anonymous|admin|administrator|user|owner|utilizador|utilizadores|autor|author|microsoft|adobe|scanner|hp|canon|epson)$/i.test(s)) return ''
  if (/\b(your name|author name|nome do autor|name surname|first last|z-lib|libgen|b-ok|booksc)\b/i.test(s)) return ''
  if (s.split(/\s+/).length < 2) return ''
  if (editoraPdf(s)) return ''
  return s
}

// Metadados "Autor" que são, na verdade, a editora ou o programa que fez o PDF
export function editoraPdf(a) {
  const s = String(a || '').trim()
  return /\b(software|corporation|corp\.?|inc\.?|ltd\.?|llc|gmbh|s\.a\.|publishing|publishers?|pub\.? ?co\.?|verlag|edizioni|[ée]ditions|editora|editorial|press|music corp|records|recordings)\b/i.test(s) ? s : ''
}

// "Assunto" do PDF no formato "Compositor: Título" (ex.: "Mozart: 12 Variations fm Oboe Concerto K179, P1-10")
export function assuntoUtil(a) {
  const s = String(a || '').replace(/,?\s*(p|pp|pages?)\.?\s*\d+(\s*-\s*\d+)?\s*$/i, '').trim()
  if (!s || s.length < 6 || /©|all rights|copyright|p[áa]ginas juntadas/i.test(s)) return null
  const m = /^([\p{Lu}][\p{L}'’.\- ]{1,40}?):\s*(.{4,})$/u.exec(s)
  if (m && m[1].split(/\s+/).length <= 4) return { autor: m[1].trim(), titulo: m[2].trim() }
  return { autor: '', titulo: s }
}
