// Importação de bibliotecas (BibTeX do Mendeley/Zotero; RIS também é aceite).
// Em dois passos: analisar (mostra o que vai acontecer) e importar (em segundo plano).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { Cite, plugins } from '@citation-js/core'
import '@citation-js/plugin-bibtex'
import '@citation-js/plugin-ris'
import valor from '@citation-js/plugin-bibtex/lib/input/value.js'
import { PASTAS } from './config.js'
import { pb, garantirSessao, definicoes, tipos, guardarTexto } from './pb.js'
import * as F from './ficheiros.js'
import * as X from './extracao.js'
import { normalizar, eInstituicao, tituloCompacto, titulosIguais, anosCompativeis } from './fontes_externas/util.js'
import { cicloOcr, reorganizar } from './processador.js'
import { palavrasUteis } from './palavras.js'
import * as E from './fontes_externas/index.js'
import { log } from './registo.js'

const TIPO_POR_CSL = {
  'article-journal': 'Artigo',
  'article-magazine': 'Artigo',
  'article-newspaper': 'Artigo',
  article: 'Ensaio',
  chapter: 'Capítulo de livro',
  'paper-conference': 'Capítulo de livro',
  'entry-encyclopedia': 'Capítulo de livro',
  'entry-dictionary': 'Capítulo de livro',
  entry: 'Capítulo de livro',
  book: 'Livro',
  collection: 'Livro',
  thesis: 'Tese / dissertação',
  report: 'Relatório',
  manuscript: 'Manuscrito',
  musical_score: 'Partitura',
  song: 'Gravação',
  motion_picture: 'Vídeo',
  broadcast: 'Vídeo',
  performance: 'Espetáculo ao vivo',
  legislation: 'Legislação',
  bill: 'Legislação',
  regulation: 'Legislação',
  dataset: 'Base de dados',
  software: 'Biblioteca de software',
  personal_communication: 'Carta',
  letter: 'Carta',
  webpage: 'Repositório',
}

const PAPEL_POR_CSL = { author: 'autor', editor: 'editor', translator: 'tradutor', composer: 'compositor', director: 'realizador', performer: 'intérprete', recipient: 'destinatário', compiler: 'compilador', organizer: 'organizador', illustrator: 'ilustrador', interviewer: 'entrevistador', producer: 'produtor' }

const decodificar = (s) => {
  try {
    return valor.parse(String(s), 'note')
  } catch (_) {
    return String(s).replace(/[{}]/g, '')
  }
}

const lista = (s) => (s ? decodificar(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [])

// Caminhos dos PDFs no campo "file" do Mendeley:
// ":Users/pedro/Documents/Mendeley Desktop/Autor - 2006 - Titulo.pdf:pdf;..."
function ficheirosMendeley(campo) {
  if (!campo) return []
  return decodificar(campo)
    .replace(/\\:/g, '\u0000')
    .split(';')
    .map((parte) => {
      const bits = parte.split(':').map((b) => b.replace(/\u0000/g, ':'))
      // formato ":caminho:tipo" ou "descrição:caminho:tipo"
      let p = bits.length >= 3 ? bits[bits.length - 2] : bits[0]
      if (!p) return ''
      if (/^[A-Za-z]:?\\/.test(p)) return '' // caminho Windows
      if (!p.startsWith('/')) p = '/' + p
      return p.replace(/\\_/g, '_').replace(/\\&/g, '&')
    })
    .filter(Boolean)
}

function dataDe(csl) {
  const d = csl.issued
  if (!d) return ''
  if (d['date-parts']?.[0]?.[0]) {
    const [a, m, dia] = d['date-parts'][0]
    return [a, m && String(m).padStart(2, '0'), dia && String(dia).padStart(2, '0')].filter(Boolean).join('-')
  }
  return d.literal || d.raw || ''
}

function chaveDuplicado({ doi, isbn, titulo }) {
  const out = []
  if (doi) out.push('doi:' + doi.toLowerCase().trim())
  if (isbn) out.push('isbn:' + isbn.replace(/[^0-9X]/gi, ''))
  const c = titulo ? tituloCompacto(titulo) : ''
  if (c.length >= 8) out.push('t:' + (c.length >= 30 ? c.slice(0, 30) : c))
  return out
}

// Completa a fonte que fica com o que só existe na repetida.
function fundir(fica, outra, idOutro) {
  const letrasSoltas = (t) => /^(\S ){6,}/.test(t)
  if (letrasSoltas(fica.titulo) && !letrasSoltas(outra.titulo)) fica.titulo = outra.titulo
  if (!fica.autores.length && outra.autores.length) fica.autores = outra.autores
  for (const k of ['data', 'editora', 'local', 'doi', 'isbn', 'url', 'notas']) if (!fica[k] && outra[k]) fica[k] = outra[k]
  for (const [k, v] of Object.entries(outra.metadados)) if (fica.metadados[k] === undefined) fica.metadados[k] = v
  if (fica.tipoNome === 'Outro' && outra.tipoNome !== 'Outro') (fica.tipo = outra.tipo), (fica.tipoNome = outra.tipoNome)
  void idOutro
}

// Converte uma entrada (CSL + campos em bruto) em dados de uma fonte.
function paraFonte(csl, bruto, tipo) {
  const autores = []
  for (const [variavel, papel] of Object.entries(PAPEL_POR_CSL)) {
    for (const a of csl[variavel] || []) {
      const completo = [a.given, a['non-dropping-particle'], a.family].filter(Boolean).join(' ')
      if (a.literal) autores.push({ literal: a.literal, papel })
      else if (eInstituicao(completo)) autores.push({ literal: completo, papel })
      else if (a.family || a.given) autores.push({ apelido: [a['non-dropping-particle'], a.family].filter(Boolean).join(' '), nome: [a.given, a['dropping-particle']].filter(Boolean).join(' '), papel })
    }
  }
  const vistos = new Set()
  for (let i = autores.length - 1; i >= 0; i--) {
    const k = normalizar(`${autores[i].literal || ''}${autores[i].apelido || ''}${autores[i].nome || ''}${autores[i].papel}`)
    if (vistos.has(k)) autores.splice(i, 1)
    else vistos.add(k)
  }
  // Campos específicos do tipo, pela correspondência CSL definida em cada campo
  const metadados = {}
  const usados = new Set(['title', 'author', 'editor', 'translator', 'composer', 'issued', 'publisher', 'publisher-place', 'DOI', 'ISBN', 'URL', 'abstract', 'annote', 'keyword', 'id', 'citation-key', 'type', '_graph'])
  for (const c of tipo?.campos || []) {
    if (c.csl && csl[c.csl] !== undefined && csl[c.csl] !== '') {
      metadados[c.chave] = typeof csl[c.csl] === 'object' ? dataDe({ issued: csl[c.csl] }) : String(csl[c.csl])
      usados.add(c.csl)
    }
  }
  if (csl['container-title'] && !usados.has('container-title')) metadados.publicado_em = csl['container-title']
  if (csl.ISSN) metadados.issn = csl.ISSN
  const palavras_chave = csl.keyword ? palavrasUteis(decodificar(csl.keyword).split(/\s*[,;]\s*/)).slice(0, 12) : []
  if (palavras_chave.length) metadados.palavras_chave_origem = 'Mendeley'
  if (csl.genre && tipo?.nome === 'Tese / dissertação') metadados.grau = /master/i.test(csl.genre) ? 'Mestrado' : /phd|doctor/i.test(csl.genre) ? 'Doutoramento' : csl.genre
  if (csl.note) metadados.nota_original = csl.note

  const url = csl.URL && /^https?:\/\//i.test(csl.URL) ? csl.URL.split(/\s/)[0] : ''
  if (csl.URL && !url) metadados.url_original = csl.URL

  return {
    titulo: csl.title || '(sem título)',
    autores,
    data: dataDe(csl),
    editora: csl.publisher || '',
    local: csl['publisher-place'] || '',
    doi: (csl.DOI || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''),
    isbn: String(csl.ISBN || '').split(/[\s,;]/)[0].replace(/-/g, ''),
    url,
    metadados,
    notas: csl.abstract ? decodificar(bruto?.abstract || csl.abstract) : '',
    palavras_chave,
    origem: 'Mendeley',
    estado: 'completo',
  }
}

// O Mendeley classifica mal muitas entradas: corrigir os casos mais evidentes.
function tipoProvavel(csl) {
  const contentor = csl['container-title'] && normalizar(csl['container-title']) !== normalizar(csl.title)
  if (csl.type === 'report' && !csl.publisher && !csl.number) return contentor ? 'Artigo' : 'Outro'
  if (csl.type === 'book' && contentor && (csl.volume || csl.issue)) return 'Artigo'
  if (csl.type === 'document' || csl.type === 'article') {
    if (contentor) return csl.ISBN ? 'Capítulo de livro' : 'Artigo'
    return csl.type === 'article' ? 'Ensaio' : 'Outro'
  }
  return TIPO_POR_CSL[csl.type] || 'Outro'
}

// Títulos que são nomes de ficheiro: "Bent_2002_Counterpoint, composition(2)"
function corrigirTituloFicheiro(fonte) {
  const t = fonte.titulo
  // "GAULDIN - A Practical Approach to…": apelido em maiúsculas, hífen, título
  const m = /^([A-ZÀ-Ý][A-ZÀ-Ý'\-]{2,})\s+[-–]\s+(.{4,})$/u.exec(t)
  if (m) {
    fonte.metadados.titulo_original = t
    fonte.titulo = m[2].trim()
    if (!fonte.autores.length) fonte.autores = [{ apelido: m[1].charAt(0) + m[1].slice(1).toLowerCase(), nome: '', papel: 'autor' }]
    return
  }
  if (!t.includes('_')) return
  const partes = t.split('_').map((x) => x.trim()).filter(Boolean)
  if (partes.length < 2 || !/^[\p{L}'\-]+$/u.test(partes[0])) return
  const iAno = partes.findIndex((x, i) => i > 0 && /^\d{4}$/.test(x))
  const comEspacos = partes.slice(1).some((x) => x.includes(' '))
  let apelido = ''
  let ano = ''
  let resto
  if (iAno > 0) {
    // Autor_Ano_Título  ou  Autor_Título_Ano
    apelido = partes[0]
    ano = partes[iAno]
    resto = partes.filter((_, i) => i !== 0 && i !== iAno).join(' ')
  } else if (partes.length === 2 && comEspacos) {
    // Autor_Título com espaços
    apelido = partes[0]
    resto = partes[1]
  } else {
    // Só um título com "_" no lugar dos espaços
    resto = partes.join(' ')
  }
  resto = resto.replace(/\(\d+\)\s*$/, '').replace(/\s+/g, ' ').trim()
  if (!resto || resto.length < 4) return
  fonte.metadados.titulo_original = t
  fonte.titulo = resto.charAt(0).toUpperCase() + resto.slice(1)
  if (apelido && !fonte.autores.length) fonte.autores = [{ apelido: apelido.charAt(0).toUpperCase() + apelido.slice(1).toLowerCase(), nome: '', papel: 'autor' }]
  if (ano && !fonte.data) fonte.data = ano
}

// Preenche só o que falta (não substitui o que veio do Mendeley).
async function preencherEmFalta(dados, c, listaTipos) {
  if (!dados.autores.length && c.autores?.length) dados.autores = c.autores
  for (const k of ['data', 'editora', 'local', 'doi', 'isbn', 'url']) if (!dados[k] && c[k]) dados[k] = String(c[k])
  for (const [k, v] of Object.entries(c.metadados || {})) if (v !== '' && dados.metadados[k] === undefined) dados.metadados[k] = v
  const atual = listaTipos.find((t) => t.id === dados.tipo)
  if ((!atual || atual.nome === 'Outro') && c.tipo_sugerido) {
    const t = listaTipos.find((x) => x.nome === c.tipo_sugerido)
    if (t) dados.tipo = t.id
  }
  if (!dados.palavras_chave?.length && palavrasUteis(c.palavras_chave).length) {
    dados.palavras_chave = palavrasUteis(c.palavras_chave)
    dados.metadados.palavras_chave_origem = c.fonte
  }
  dados.origem = `Mendeley + ${c.fonte}`
}

function completude(f) {
  return [f.autores.length, f.data, f.doi, f.isbn, f.editora, f.local, f.notas].filter(Boolean).length + Object.keys(f.metadados).length
}

// ---------------------------------------------------------------------------

const analises = new Map()
export let importacaoAtual = null

export async function analisar(texto, nomeFicheiro = '') {
  await garantirSessao()
  const bibtex = /^\s*@/m.test(texto) && !/^TY {2}- /m.test(texto)
  // Acentos na forma normal (o Mendeley às vezes escreve "é" como "e" + acento solto)
  texto = texto.normalize('NFC')
  // O Mendeley exporta entradas sem chave ("@techReport{,"): dar-lhes uma provisória.
  let n = 0
  if (bibtex) texto = texto.replace(/^(\s*@\w+\s*\{)\s*,/gm, (_, ini) => `${ini}semchave${++n},`)
  let brutos = []
  if (bibtex) {
    try {
      brutos = plugins.input.chainLink(texto)
    } catch (_) {}
  }
  const cite = await Cite.async(texto)
  // Campos em bruto, pela mesma ordem das entradas convertidas
  const brutoDe = (i, csl) => (brutos[i]?.label === csl.id ? brutos[i].properties : brutos.find((b) => b.label === csl.id)?.properties) || {}
  const listaTipos = await tipos()
  const outro = listaTipos.find((t) => t.nome === 'Outro')

  // Duplicados: com o que já existe na biblioteca e dentro do próprio ficheiro
  const existentes = await pb.collection('fontes').getFullList({ fields: 'id,doi,isbn,titulo,ano' })
  const vistas = new Map()
  for (const f of existentes) for (const k of chaveDuplicado(f)) vistas.set(k, [...(vistas.get(k) || []), { bd: f.id, data: f.ano ? String(f.ano) : '', titulo: f.titulo }])

  const entradas = []
  const grupos = new Set()
  let comNotas = 0
  let comFicheiros = 0
  let ficheirosEncontrados = 0
  let semAcesso = 0
  let duplicados = 0 // eslint-disable-line no-unused-vars

  for (const [i, csl] of cite.data.entries()) {
    delete csl._graph
    const bruto = brutoDe(i, csl)
    // Campos que o conversor ignora: "city" (local) e "issue" (número), comuns no Mendeley
    if (bruto.city && !csl['publisher-place']) csl['publisher-place'] = decodificar(bruto.city)
    if (bruto.issue && !csl.issue) csl.issue = decodificar(bruto.issue)
    const tipo = listaTipos.find((t) => t.nome === tipoProvavel(csl)) || outro
    const fonte = paraFonte(csl, bruto, tipo)
    fonte.tipo = tipo.id
    if (bruto.pmid) fonte.metadados.pmid = decodificar(bruto.pmid)
    corrigirTituloFicheiro(fonte)

    fonte.tipoNome = tipo.nome
    const chaves = chaveDuplicado(fonte)
    let duplicadoDe = null
    for (const k of chaves) {
      const alvo = (vistas.get(k) || []).find((v) => (k.startsWith('t:') ? anosCompativeis(v.data, fonte.data) && titulosIguais(v.titulo, fonte.titulo) : true))
      if (!alvo) continue
      if (alvo.bd) duplicadoDe = alvo.bd
      else {
        fundir(entradas[alvo.indice].fonte, fonte)
        alvo.data = alvo.data || fonte.data
        duplicadoDe = 'ficheiro'
      }
      break
    }
    if (!duplicadoDe) for (const k of chaves) vistas.set(k, [...(vistas.get(k) || []), { indice: entradas.length, data: fonte.data, titulo: fonte.titulo }])
    if (duplicadoDe) duplicados++
    const etiquetas = lista(bruto['mendeley-tags'])
    const pastas = lista(bruto['mendeley-groups'])
    pastas.forEach((g) => grupos.add(g))
    const anotacao = bruto.annote ? decodificar(bruto.annote).trim() : csl.annote || ''
    if (anotacao) comNotas++
    const ficheiros = ficheirosMendeley(bruto.file)
    let acessivel = ''
    if (ficheiros.length) {
      comFicheiros++
      for (const p of ficheiros) {
        try {
          fs.accessSync(p, fs.constants.R_OK)
          acessivel = p
          break
        } catch (e) {
          if (e.code === 'EPERM' || e.code === 'EACCES') semAcesso++
        }
      }
      if (acessivel) ficheirosEncontrados++
    }
    entradas.push({ fonte, etiquetas, pastas, anotacao, ficheiro: acessivel, outrosFicheiros: ficheiros.filter((p) => p !== acessivel), duplicadoDe })
  }

  const id = crypto.randomUUID()
  analises.set(id, { entradas, nomeFicheiro, quando: Date.now() })
  // Esquecer análises antigas (30 min)
  for (const [k, v] of analises) if (Date.now() - v.quando > 1800000) analises.delete(k)

  const novas = entradas.filter((e) => !e.duplicadoDe)
  for (const e of novas) {
    e.fonte.incompleta = !e.fonte.autores.length || !e.fonte.data
    e.fonte.estado = e.fonte.incompleta ? 'a_rever' : 'completo'
  }
  return {
    id,
    total: entradas.length,
    porTipo: novas.reduce((o, e) => ((o[listaTipos.find((t) => t.id === e.fonte.tipo)?.nome] = (o[listaTipos.find((t) => t.id === e.fonte.tipo)?.nome] || 0) + 1), o), {}),
    duplicados: entradas.length - novas.length,
    incompletas: novas.filter((e) => e.fonte.incompleta).length,
    comNotas,
    comFicheiros,
    ficheirosEncontrados,
    semAcesso: semAcesso > 0,
    grupos: [...grupos].sort(),
    exemplos: novas.slice(0, 5).map((e) => ({ titulo: e.fonte.titulo, data: e.fonte.data, tipo: listaTipos.find((t) => t.id === e.fonte.tipo)?.nome })),
  }
}

async function copiarFicheiro(origem, fonte, tipoNome, defs) {
  const ext = path.extname(origem)
  const hash = await F.hashFicheiro(origem)
  const subpasta = F.pastaDestino(defs.padrao_pastas, fonte, tipoNome)
  const destinoDir = path.join(PASTAS.biblioteca, subpasta)
  await fsp.mkdir(destinoDir, { recursive: true })
  const nome = F.nomeFicheiro(defs.padrao_nome, fonte, tipoNome, ext)
  // Copiar (não mover): a pasta do Mendeley fica intacta.
  const tmp = path.join(os.tmpdir(), 'imp-' + crypto.randomUUID() + ext)
  await fsp.copyFile(origem, tmp)
  const final = await F.mover(tmp, destinoDir, nome)
  return { ficheiro: path.relative(PASTAS.biblioteca, final).split(path.sep).join('/'), hash, abs: final }
}

export function importar(id, opcoes = {}) {
  const analise = analises.get(id)
  if (!analise) throw new Error('A análise expirou. Escolha o ficheiro outra vez.')
  if (importacaoAtual && !importacaoAtual.terminado) throw new Error('Já está uma importação a decorrer.')
  const entradas = analise.entradas.filter((e) => !(opcoes.ignorarDuplicados !== false && e.duplicadoDe))
  // Entradas que já existem na biblioteca (ex.: vindas da watch folder): completá-las com os dados do Mendeley
  // (uma vez por fonte: o .bib pode ter a mesma obra repetida várias vezes)
  const vistasBd = new Set()
  const existentes = analise.entradas.filter((e) => e.duplicadoDe && e.duplicadoDe !== 'ficheiro' && !vistasBd.has(e.duplicadoDe) && vistasBd.add(e.duplicadoDe))
  importacaoAtual = { total: entradas.length + existentes.length, feitas: 0, criadas: 0, completadas: 0, enriquecidas: 0, notas: 0, ficheiros: 0, erros: [], terminado: false, ficheiroOrigem: analise.nomeFicheiro }
  entradas.existentes = existentes
  log.info(`Importação iniciada: ${entradas.length} referências de ${analise.nomeFicheiro || 'ficheiro'}`)
  correrImportacao(entradas, opcoes).catch((e) => {
    importacaoAtual.erros.push(e.message)
    importacaoAtual.terminado = true
  })
  analises.delete(id)
  return { ok: true, total: entradas.length }
}

async function correrImportacao(entradas, opcoes) {
  const estado = importacaoAtual
  const defs = await definicoes()
  let precisaOcr = false
  for (const e of entradas) {
    try {
      await garantirSessao()
      const tipo = (await tipos()).find((t) => t.id === e.fonte.tipo)
      const tags = [...e.etiquetas, ...(opcoes.pastasComoEtiquetas !== false ? e.pastas : [])]
      const dados = { ...e.fonte, tags: [...new Set(tags)], ocr_estado: 'nao_aplicavel' }
      if (opcoes.contexto) dados.contextos = [opcoes.contexto]
      if (e.outrosFicheiros.length) dados.metadados = { ...dados.metadados, outros_ficheiros_mendeley: e.outrosFicheiros.join('\n') }

      let texto = ''
      if (e.ficheiro && opcoes.copiarFicheiros !== false) {
        try {
          const c = await copiarFicheiro(e.ficheiro, dados, tipo?.nome, defs)
          Object.assign(dados, { ficheiro: c.ficheiro, hash: c.hash, ficheiro_original: path.basename(e.ficheiro) })
          if (F.categoriaPorExtensao(c.abs) === 'pdf') {
            const info = await X.pdfInfo(c.abs)
            dados.paginas = info.paginas
            const inicio = await X.pdfTexto(c.abs, 1, 3)
            if (X.temTextoUtil(inicio, info.paginas)) texto = await X.pdfTexto(c.abs)
            else if (defs.ocr_ativo !== false) (dados.ocr_estado = 'pendente'), (precisaOcr = true)
          }
          estado.ficheiros++
        } catch (err) {
          estado.erros.push(`Ficheiro de «${dados.titulo}»: ${err.message}`)
        }
      }

      // Referências incompletas: procurar online o que falta
      if (opcoes.completarOnline && dados.estado === 'a_rever') {
        try {
          const autor = dados.autores[0] ? dados.autores[0].apelido || dados.autores[0].literal : ''
          const r = await E.automatico({ genero: 'escrita', titulo: dados.titulo, autor, doi: dados.doi, isbn: dados.isbn }, defs)
          // Só aceitar sozinho se o autor já conhecido coincidir: evita confundir um livro
          // com uma recensão desse livro (mesmo título, outro autor).
          const apelido = normalizar(autor).split(' ').filter((w) => w.length > 2).pop()
          const coincide = (c) => apelido && normalizar(c.autores.map((a) => `${a.literal || ''} ${a.apelido || ''}`).join(' ')).includes(apelido)
          const melhor = E.escolher(r.candidatos, Number(defs.limiar_confianca) || 0.8)
          const escolhido = melhor && coincide(melhor) ? melhor : null
          if (escolhido) {
            await preencherEmFalta(dados, escolhido, await tipos())
            if (dados.autores.length && dados.data) dados.estado = 'completo'
            estado.completadas++
          } else dados.candidatos = r.candidatos.slice(0, 10)
        } catch (_) {}
      }
      delete dados.incompleta
      delete dados.tipoNome

      const criada = await pb.collection('fontes').create(dados)
      if (texto) await guardarTexto(criada.id, texto, 'pdf')
      if (e.anotacao) {
        await pb.collection('notas_leitura').create({ fonte: criada.id, tipo_nota: 'Comentário', localizacao: '', texto: e.anotacao, tags: ['Mendeley'] })
        estado.notas++
      }
      estado.criadas++
    } catch (err) {
      const d = err?.response?.data
      const detalhe = d && typeof d === 'object' && Object.keys(d).length ? Object.entries(d).map(([k, v]) => `${k}: ${v.message}`).join('; ') : err.message
      estado.erros.push(`«${e.fonte.titulo}»: ${detalhe}`)
    }
    estado.feitas++
  }
  // Fontes já existentes: o Mendeley (dados curados pelo utilizador) completa-as.
  // Se estavam "por rever", os dados do Mendeley substituem os palpites lidos do ficheiro.
  for (const e of entradas.existentes || []) {
    try {
      const f = await pb.collection('fontes').getOne(e.duplicadoDe)
      const m = e.fonte
      const substituir = f.estado === 'a_rever'
      const d = {}
      for (const k of ['titulo', 'data', 'editora', 'local', 'doi', 'isbn', 'url']) if (m[k] && (substituir || !f[k])) d[k] = m[k]
      if (m.autores.length && (substituir || !f.autores?.length)) d.autores = m.autores
      if (m.palavras_chave?.length && !f.palavras_chave?.length) d.palavras_chave = m.palavras_chave
      d.metadados = { ...m.metadados, ...(f.metadados || {}) }
      if (substituir && m.tipo) d.tipo = m.tipo
      const tags = [...new Set([...(f.tags || []), ...e.etiquetas, ...(opcoes.pastasComoEtiquetas !== false ? e.pastas : [])])]
      if (tags.length) d.tags = tags
      if (substituir && (d.autores || f.autores?.length) && (d.data || f.data)) (d.estado = 'completo'), (d.candidatos = [])
      d.origem = !f.origem || f.origem === 'ficheiro' ? 'Mendeley' : f.origem.includes('Mendeley') ? f.origem : `${f.origem} + Mendeley`
      await pb.collection('fontes').update(f.id, d)
      if (e.anotacao) await pb.collection('notas_leitura').create({ fonte: f.id, tipo_nota: 'Comentário', localizacao: '', texto: e.anotacao, tags: ['Mendeley'] })
      if (f.ficheiro) await reorganizar(f.id) // renomear o ficheiro segundo os dados novos
      estado.enriquecidas++
    } catch (err) {
      estado.erros.push(`«${e.fonte.titulo}» (existente): ${err.message}`)
    }
    estado.feitas++
  }

  estado.terminado = true
  log.info(`Importação concluída: ${estado.criadas} fontes novas (${estado.completadas} completadas online), ${estado.enriquecidas} existentes completadas, ${estado.notas} notas, ${estado.erros.length} erros`)
  if (precisaOcr) cicloOcr()
}

// Para testes: entradas de uma análise
export const _analise = (id) => analises.get(id)?.entradas
