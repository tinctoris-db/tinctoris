// Exportação de bibliografias (CSL): APA, Chicago, MLA, Harvard, ABNT, NP 405...
// Qualquer ficheiro .csl colocado em app/estilos/ fica disponível automaticamente.
import fs from 'node:fs'
import path from 'node:path'
import { Cite, plugins } from '@citation-js/core'
import '@citation-js/plugin-csl'
import '@citation-js/plugin-bibtex'
import '@citation-js/plugin-ris'
import { PASTAS } from './config.js'
import { semAcentos } from './ficheiros.js'

const configCsl = plugins.config.get('@csl')

// ---- Estilos e línguas

let estilos = null
export function listarEstilos() {
  if (!estilos) {
    estilos = []
    for (const f of fs.readdirSync(PASTAS.estilos).filter((x) => x.endsWith('.csl')).sort()) {
      const xml = fs.readFileSync(path.join(PASTAS.estilos, f), 'utf8')
      const titulo = (/<title>([^<]+)<\/title>/.exec(xml) || [])[1] || f
      estilos.push({ id: f.replace(/\.csl$/, ''), titulo: titulo.replace(/&amp;/g, '&'), xml })
    }
    for (const f of fs.readdirSync(PASTAS.estilos).filter((x) => /^locales-.+\.xml$/.test(x))) {
      configCsl.locales.add(f.replace(/^locales-|\.xml$/g, ''), fs.readFileSync(path.join(PASTAS.estilos, f), 'utf8'))
    }
  }
  return estilos.map(({ id, titulo }) => ({ id, titulo }))
}

// Regista o estilo forçando a língua escolhida (ex.: APA com termos em português).
function prepararEstilo(id, lingua) {
  listarEstilos()
  const e = estilos.find((x) => x.id === id)
  if (!e) throw new Error(`Estilo desconhecido: ${id}`)
  const nome = `${id}__${lingua || 'orig'}`
  if (!configCsl.styles.has(nome)) {
    let xml = e.xml
    if (lingua) {
      xml = /default-locale="[^"]*"/.test(xml)
        ? xml.replace(/default-locale="[^"]*"/, `default-locale="${lingua}"`)
        : xml.replace(/<style\b/, `<style default-locale="${lingua}"`)
    }
    configCsl.styles.add(nome, xml)
  }
  return nome
}

// ---- Conversão das fontes para CSL-JSON

const PAPEL_CSL = {
  autor: 'author',
  compositor: 'composer',
  editor: 'editor',
  tradutor: 'translator',
  'intérprete': 'performer',
  maestro: 'performer',
  realizador: 'director',
  'destinatário': 'recipient',
  construtor: 'author',
  organizador: 'organizer',
  compilador: 'compiler',
  produtor: 'producer',
  ilustrador: 'illustrator',
  entrevistador: 'interviewer',
  copista: 'contributor',
  arranjador: 'contributor',
  libretista: 'contributor',
}

export function dataCsl(texto) {
  const s = String(texto || '').trim()
  if (!s) return undefined
  let m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s)
  if (m) return { 'date-parts': [[m[1], m[2], m[3]].filter(Boolean).map(Number)] }
  m = /(\d{4})/.exec(s)
  if (m) {
    const d = { 'date-parts': [[Number(m[1])]] }
    if (/\b(c\.|ca\.|circa|cerca|\?)/i.test(s)) d.circa = true
    return d
  }
  return { literal: s }
}

function nomeCsl(a) {
  if (a.literal) return { literal: a.literal }
  return { family: a.apelido || '', given: a.nome || '' }
}

export function paraCsl(fonte, tipo) {
  const item = {
    id: fonte.id,
    type: tipo?.csl_tipo || 'document',
    title: fonte.titulo || '',
  }
  if (tipo?.csl_genero) item.genre = tipo.csl_genero

  for (const a of Array.isArray(fonte.autores) ? fonte.autores : []) {
    const v = PAPEL_CSL[a.papel || 'autor'] || 'contributor'
    ;(item[v] = item[v] || []).push(nomeCsl(a))
  }
  // Muitos estilos só mostram "author": usar o compositor/realizador/intérprete na falta dele.
  // (Nas gravações, a convenção CSL é: author = intérprete; composer = compositor.)
  if (!item.author) {
    const ordem = item.type === 'song' ? ['performer', 'composer', 'organizer'] : ['composer', 'director', 'performer', 'organizer', 'compiler']
    for (const alt of ordem) {
      if (item[alt]) {
        item.author = item[alt]
        break
      }
    }
  }

  const issued = dataCsl(fonte.data)
  if (issued) item.issued = issued
  if (fonte.editora) item.publisher = fonte.editora
  if (fonte.local) item['publisher-place'] = fonte.local
  if (fonte.doi) item.DOI = fonte.doi
  if (fonte.isbn) item.ISBN = fonte.isbn
  if (fonte.url) item.URL = fonte.url

  const meta = fonte.metadados || {}
  for (const campo of tipo?.campos || []) {
    const valor = meta[campo.chave]
    if (!campo.csl || valor === undefined || valor === null || valor === '') continue
    if (campo.tipo === 'data' || ['accessed', 'event-date', 'original-date'].includes(campo.csl)) {
      const d = dataCsl(valor)
      if (d) item[campo.csl] = d
    } else if (campo.csl === 'genre' && item.genre) {
      item.genre = String(valor)
    } else {
      item[campo.csl] = String(valor)
    }
  }
  // Etiqueta curta para BibTeX (ex.: sutcliffe2003keyboard)
  const apelido = semAcentos((fonte.autores || [])[0]?.apelido || (fonte.autores || [])[0]?.literal || 'anon').toLowerCase().replace(/[^a-z]/g, '')
  const palavra = semAcentos(fonte.titulo || '').toLowerCase().replace(/[^a-z ]/g, '').split(' ').find((w) => w.length > 3) || ''
  item['citation-key'] = `${apelido}${fonte.ano || ''}${palavra}`
  return item
}

function chavesUnicas(itens) {
  const usadas = new Map()
  for (const it of itens) {
    const base = it['citation-key']
    const n = usadas.get(base) || 0
    usadas.set(base, n + 1)
    if (n) it['citation-key'] = base + String.fromCharCode(97 + n)
  }
  return itens
}

// ---- Formatação

export const FORMATOS = {
  texto: { mime: 'text/plain', extensao: 'txt' },
  html: { mime: 'text/html', extensao: 'html' },
  rtf: { mime: 'application/rtf', extensao: 'rtf' },
  bibtex: { mime: 'application/x-bibtex', extensao: 'bib' },
  ris: { mime: 'application/x-research-info-systems', extensao: 'ris' },
  'csl-json': { mime: 'application/json', extensao: 'json' },
}

// fontes: registos com expand.tipo. Devolve {conteudo, mime, extensao}.
export function exportar(fontes, { estilo = 'apa', formato = 'texto', lingua = 'pt-PT' } = {}) {
  const itens = chavesUnicas(fontes.map((f) => paraCsl(f, f.expand?.tipo)))
  const cite = new Cite(itens)
  const fmt = FORMATOS[formato]
  if (!fmt) throw new Error(`Formato desconhecido: ${formato}`)
  let conteudo
  if (formato === 'bibtex') conteudo = cite.format('bibtex')
  else if (formato === 'ris') conteudo = cite.format('ris')
  else if (formato === 'csl-json') conteudo = JSON.stringify(itens, null, 2)
  else {
    const template = prepararEstilo(estilo, lingua)
    conteudo = cite.format('bibliography', { format: formato === 'texto' ? 'text' : formato, template, lang: lingua })
  }
  return { conteudo, ...fmt }
}

// ---- Notas de leitura em Markdown (referência no estilo escolhido + notas por localização)

export function exportarNotas(fontes, notas, { estilo = 'apa', lingua = 'pt-PT' } = {}) {
  const template = prepararEstilo(estilo, lingua)
  const porFonte = new Map()
  for (const n of notas) {
    if (!porFonte.has(n.fonte)) porFonte.set(n.fonte, [])
    porFonte.get(n.fonte).push(n)
  }
  const blocos = ['# Notas de leitura', '']
  for (const f of fontes) {
    const lista = porFonte.get(f.id) || []
    if (!lista.length) continue
    // Alguns estilos omitem certos tipos (ex.: Chicago e manuscritos sem arquivo): usar uma referência simples.
    const ref =
      new Cite([paraCsl(f, f.expand?.tipo)]).format('bibliography', { format: 'text', template, lang: lingua }).trim() ||
      [(f.autores || []).map((a) => a.literal || [a.apelido, a.nome].filter(Boolean).join(', ')).join('; '), f.titulo, f.data].filter(Boolean).join('. ') + '.'
    blocos.push(`## ${f.titulo || 'Sem título'}`, '', ref, '')
    for (const n of lista) {
      const cabeca = [n.localizacao && `**${n.localizacao}**`, n.tipo_nota && `*${n.tipo_nota}*`].filter(Boolean).join(' · ')
      const tags = (Array.isArray(n.tags) ? n.tags : []).map((t) => `#${String(t).replace(/\s+/g, '-')}`).join(' ')
      const texto = String(n.texto || '').trim()
      const corpo = n.tipo_nota === 'Citação' ? texto.split('\n').map((l) => `> ${l}`).join('\n') : texto
      blocos.push(cabeca ? `${cabeca}\n\n${corpo}` : corpo)
      if (tags) blocos.push(tags)
      blocos.push('')
    }
  }
  return { conteudo: blocos.join('\n'), mime: 'text/markdown', extensao: 'md' }
}
