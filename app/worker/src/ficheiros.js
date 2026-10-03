// Organização de ficheiros: classificação, nomes, pastas, mover, hash.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { seculoParaAnos } from './musica_antiga.js'

const EXTENSOES = {
  pdf: ['pdf'],
  imagem: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'gif', 'webp', 'heic'],
  texto: ['txt', 'md', 'rtf'],
  documento: ['doc', 'docx', 'odt', 'epub', 'djvu', 'pages'],
  audio: ['mp3', 'wav', 'flac', 'aif', 'aiff', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'alac'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm', 'mpg', 'mpeg', 'wmv'],
  partitura: ['mid', 'midi', 'musicxml', 'mxl', 'mscz', 'mscx', 'dorico', 'sib', 'mus', 'musx', 'mei', 'ly', 'gp', 'gpx'],
}

export function categoriaPorExtensao(ficheiro) {
  const ext = path.extname(ficheiro).slice(1).toLowerCase()
  for (const [cat, lista] of Object.entries(EXTENSOES)) if (lista.includes(ext)) return cat
  return 'outro'
}

// Ficheiros a ignorar na watch folder (temporários, ocultos, descargas incompletas)
export function ignorar(p) {
  const b = path.basename(p)
  return b.startsWith('.') || b.startsWith('~$') || /\.(part|crdownload|download|tmp|partial)$/i.test(b) || b === 'Icon\r'
}

export const semAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// Remove caracteres proibidos em nomes de ficheiros/pastas.
export function seguro(s) {
  return String(s || '')
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\-]+|[\s.\-]+$/g, '')
}

// "Sonata em Ré menor, K. 1" -> "Sonata-em-Re-menor-K-1"
function tituloFicheiro(t, max = 80) {
  const palavras = semAcentos(t).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  let out = ''
  for (const p of palavras) {
    if ((out + '-' + p).length > max) break
    out = out ? out + '-' + p : p
  }
  return out || 'Sem-titulo'
}

function dataFicheiro(data, ano) {
  const d = String(data || '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{4})-(\d{2})$/.exec(d)
  if (m) return `${m[1]}-${m[2]}`
  return ano ? String(ano) : 'SD'
}

function apelidoPrincipal(fonte) {
  const autores = Array.isArray(fonte.autores) ? fonte.autores : []
  const principais = ['autor', 'compositor', 'construtor', 'realizador']
  const a = autores.find((x) => principais.includes(x.papel || 'autor')) || autores[0]
  if (!a) return ''
  return a.literal || a.apelido || a.nome || ''
}

function valores(fonte, tipoNome) {
  const apelido = semAcentos(apelidoPrincipal(fonte)).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  // (sem ano exato, "séc. XVIII" arruma-se em "17xx")
  const ano = fonte.ano || (/(\d{4})/.exec(fonte.data || '') || [])[1] || seculoParaAnos(fonte.data)
  const contextos = Array.isArray(fonte.contextos) ? fonte.contextos : []
  return {
    data: dataFicheiro(fonte.data, ano),
    ano: ano ? String(ano) : 'SD',
    AUTOR: apelido ? apelido.toUpperCase() : 'ANONIMO',
    autor: apelido || 'Anonimo',
    Titulo: tituloFicheiro(fonte.titulo),
    tipo: tipoNome || 'Outro',
    natureza: fonte.natureza ? (fonte.natureza === 'primária' ? 'Primárias' : 'Secundárias') : 'Sem natureza',
    contexto: contextos[0] || 'Sem contexto',
    editora: fonte.editora || 'Sem editora',
  }
}

function substituir(padrao, v) {
  return padrao.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : ''))
}

// Nome final do ficheiro segundo o padrão (ex.: "{data}_{AUTOR}_{Titulo}")
export function nomeFicheiro(padrao, fonte, tipoNome, ext) {
  let nome = substituir(padrao || '{data}_{AUTOR}_{Titulo}', valores(fonte, tipoNome))
  nome = seguro(nome).replace(/_+/g, '_').replace(/^_|_$/g, '')
  return (nome || 'Sem-titulo').slice(0, 180) + ext.toLowerCase()
}

// Subpasta relativa dentro de "biblioteca" (ex.: "{tipo}/{ano}")
export function pastaDestino(padrao, fonte, tipoNome) {
  const v = valores(fonte, tipoNome)
  return (padrao || '{tipo}/{ano}')
    .split('/')
    .map((seg) => seguro(substituir(seg, v)))
    .filter(Boolean)
    .join('/')
}

export async function hashFicheiro(p) {
  const h = crypto.createHash('sha256')
  await new Promise((ok, falha) => {
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', ok).on('error', falha)
  })
  return h.digest('hex')
}

// Move (não copia) um ficheiro para destinoDir/nome, evitando sobrescrever.
export async function mover(origem, destinoDir, nome) {
  await fsp.mkdir(destinoDir, { recursive: true })
  const ext = path.extname(nome)
  const base = nome.slice(0, nome.length - ext.length)
  let alvo = path.join(destinoDir, nome)
  for (let i = 2; fs.existsSync(alvo) && path.resolve(alvo) !== path.resolve(origem); i++) {
    alvo = path.join(destinoDir, `${base}_${i}${ext}`)
  }
  if (path.resolve(alvo) === path.resolve(origem)) return alvo
  try {
    await fsp.rename(origem, alvo)
  } catch (e) {
    if (e.code !== 'EXDEV') throw e
    await fsp.copyFile(origem, alvo)
    await fsp.unlink(origem)
  }
  return alvo
}

// Apaga pastas vazias deixadas na watch folder (sem apagar a própria raiz).
export async function limparPastasVazias(dir, raiz) {
  let atual = dir
  while (path.resolve(atual) !== path.resolve(raiz) && atual.startsWith(raiz)) {
    const itens = (await fsp.readdir(atual).catch(() => ['x'])).filter((f) => f !== '.DS_Store')
    if (itens.length) break
    await fsp.rm(atual, { recursive: true, force: true })
    atual = path.dirname(atual)
  }
}
