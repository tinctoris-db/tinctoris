// Processamento de ficheiros novos (watch folder), OCR em fila e reorganização.
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS, POR_REVER, DUPLICADOS, ORIGINAIS, BIN, eDoDono, EDITOR_PARTITURAS, DIGITALIZACAO } from './config.js'
import { originaisDasPalavras, juntarOriginais } from './juntar.js'
import { pb, garantirSessao, definicoes, tipoPorNome, tipoPorId, guardarTexto, fontesPorIds } from './pb.js'
import * as F from './ficheiros.js'
import * as X from './extracao.js'
import { ocrPdf, ocrImagem } from './ocr.js'
import * as E from './fontes_externas/index.js'
import { pessoa, titulosIguais, anosCompativeis, semelhanca, contido, tituloCompacto } from './fontes_externas/util.js'
import { siglaRism, siglasEquivalentes, pesquisarMusical, CATALOGOS_FONTES } from './fontes_externas/musicologicas.js'
import { completarExemplar, reconhecerExemplar, IDENTIFICADORES } from './fontes_externas/bibliotecas_digitais.js'
import { fontesConhecidas } from './fontes_externas/compositores.js'
import { pistasDoNome, formaProvavel, manuscritoPelaCota, exemplarDigitalizado, informacaoDoNome, melhorNome, restoDoNome, maiusculasDoNome } from './musica_antiga.js'
import { chaveCota } from './fontes_externas/musicologicas.js'
import { catalogoDe, obraPorCatalogo, aplicarObra, compositorDe, obraCompativel, obraPlausivel, catalogoConfirmado, catalogoPeloNome, numeroNoNome, eIntervalo, donoDoCatalogo } from './fontes_externas/obras.js'
import { lerLayout, lerLayoutOcr, analisarCapa, analisarJstor, palavrasChaveDoTexto, doNomeFicheiro, eTextoMusical, limparMusica, tokenMusical, cifrado } from './capa.js'
import { eMidi, formatoDe, chaveLote, numeroNoLote, fichaDoLote, livroDoCompositor, camposDaTranscricao, ligarAoLivro, livroDaFicha, autorDoNome, pessoaDe, livroPeloNome, autoresConhecidos } from './lotes_midi.js'
import { imslpPagina, correcoesImslp, PECA } from './fontes_externas/imslp_pagina.js'
import { iaDisponivel, lerComIA, PAGINA_DE_AVISO } from './ia.js'
import { gerarPalavrasChave, palavrasUteis } from './palavras.js'
import { log } from './registo.js'
import { CHAVE_ESTADO_ANTES, marcarReanalise, estadoAntesDaReanalise, continuaCompleta, compositoresConhecidos, ajustarCandidatos, trocaAceitavel, contradicaoForma, registoManuscrito, edicaoModernaPara, dataMaisPrecisa, TIPOS_ACADEMICOS, autoresAcademicos } from './regras_identificacao.js'
import { esperarVez, folgaEntreReanalises, emPoupanca, emPausa } from './intensidade.js'

// Fila sequencial: um ficheiro de cada vez. Se entrarem muitos de uma vez
// (ex.: uma pasta enorme largada por engano), fica em pausa até confirmar.
const LIMITE_LOTE = 300
function criarFila(nome, trabalho) {
  const itens = []
  const prioritarios = new Set()
  let ativo = null
  let pausada = false
  let confirmada = false
  let aCorrer = false
  async function correr() {
    // (uma só volta de cada vez: as esperas da intensidade não podem deixar arrancar uma segunda)
    if (aCorrer || pausada) return
    aCorrer = true
    try {
      await voltaDaFila()
    } finally {
      aCorrer = false
    }
  }
  async function voltaDaFila() {
    while (itens.length && !pausada) {
      // (intensidade «pausa»: espera aqui; em poupança, uma folga entre reanálises — os novos não esperam)
      await esperarVez()
      if (!itens.length || pausada) break
      ativo = itens.shift()
      prioritarios.delete(ativo)
      try {
        await trabalho(ativo)
      } catch (e) {
        log.erro(`${nome} (${path.basename(String(ativo))}): ${e.message}`)
      }
      if (itens.length && !prioritarios.has(itens[0])) await folgaEntreReanalises(() => prioritarios.has(itens[0]))
    }
    ativo = null
    if (!itens.length) confirmada = false
  }
  return {
    juntar(x, { confirmado = false, prioritario = false } = {}) {
      if (ativo === x) return
      // Ficheiros novos da watch folder e reanálises pedidas à mão passam à frente de reanálises longas
      const urgente = prioritario || String(x).startsWith(PASTAS.watch)
      const ja = itens.indexOf(x)
      if (ja >= 0) {
        if (!urgente || prioritarios.has(x)) return
        itens.splice(ja, 1)
      }
      if (urgente) {
        prioritarios.add(x)
        const i = itens.findIndex((y) => !prioritarios.has(y))
        if (i >= 0) itens.splice(i, 0, x)
        else itens.push(x)
      } else itens.push(x)
      if (confirmado) confirmada = true
      if (!confirmada && !pausada && itens.length > LIMITE_LOTE) {
        pausada = true
        log.aviso(`Entraram mais de ${LIMITE_LOTE} ficheiros de uma vez: o processamento está em pausa até confirmar na página Atividade.`)
      }
      correr()
    },
    retomar() {
      pausada = false
      confirmada = true
      correr()
    },
    cancelar() {
      const n = itens.length
      itens.length = 0
      prioritarios.clear()
      pausada = false
      confirmada = false
      return n
    },
    // (novos: da watch folder ou pedidos à mão; o resto são reanálises longas)
    estado: () => ({ ativo: ativo ? path.basename(ativo) : null, pendentes: itens.length, novos: prioritarios.size, pausada }),
  }
}

const GENERO = { pdf: 'escrita', imagem: 'escrita', texto: 'escrita', documento: 'escrita', outro: 'escrita', audio: 'audio', video: 'video', partitura: 'partitura' }
const TIPO_INICIAL = { audio: 'Gravação', video: 'Vídeo', partitura: 'Partitura' }
const SUPORTADAS = new Set(['pdf', 'imagem', 'texto', 'documento', 'audio', 'video', 'partitura'])
const IMAGEM_MINIMA = 60 * 1024 // imagens mais pequenas são ícones/ilustrações de páginas web

const relativo = (abs) => path.relative(PASTAS.biblioteca, abs).split(path.sep).join('/')
const semVazios = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined))

// Reanálise: o que a ficha já tinha não se perde. Nenhum campo com valor fica vazio; e se a ficha veio de um
// catálogo (RISM, IMSLP, Mendeley, CrossRef…) ou foi corrigida à mão, o título, os autores, a data e o resto não
// são trocados por uma leitura da IA ou do nome do ficheiro, que só preenchem o que falta.
// (só um catálogo encontrado na própria reanálise pode substituir os valores de outro)
const ORIGEM_FRACA = /^(IA local|ficheiro|capa do PDF)?$/
// Catálogos de livros e artigos modernos: não identificam fotografias de páginas nem manuscritos
const CATALOGOS_MODERNOS = /^(CrossRef|Open Library|OpenAlex|OpenAIRE|DataCite)\b/
// Metadados que não vêm de nenhum catálogo (ligações da própria biblioteca): passam sempre
const PROPRIOS = ['originais', 'originais_conjunto', 'transcricao_midi', 'transcricao', 'herdado_de', 'nomes_alternativos', 'duplicados_retirados', 'nota_revisao']
const vazio = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
const CAMPOS_PROTEGIDOS = ['titulo', 'autores', 'data', 'editora', 'local', 'doi', 'isbn', 'url', 'tipo', 'natureza', 'palavras_chave']
// (semRepor: campos que as regras esvaziaram de propósito — ex.: o ano das fotografias — e que não voltam)
// (autorInvalido: autores antigos que não voltam — o dono numa digitalização, letras de uma cota tomadas por apelido)
export function protegerReanalise(antiga, dados, { novaDeCatalogo = false, recusada = false, semRepor = [], autorInvalido = () => false } = {}) {
  const deCatalogo = !ORIGEM_FRACA.test(String(antiga?.origem || '').trim()) && !novaDeCatalogo && !recusada
  const d = { ...dados, metadados: { ...(dados.metadados || {}) } }
  const mantidos = []
  if (!antiga) return { dados: d, mantidos, deCatalogo: false }
  // (identificação antiga recusada — fonte fotografada «identificada» num catálogo de livros modernos: os dados dela
  // não voltam; só passam as ligações da própria biblioteca)
  if (recusada) {
    for (const k of PROPRIOS) if (vazio(d.metadados[k]) && !vazio(antiga.metadados?.[k])) (d.metadados[k] = antiga.metadados[k]), mantidos.push(`metadados.${k}`)
    return { dados: d, mantidos, deCatalogo: false }
  }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // (título antigo mais completo, que começa pelo novo: «CONCERTO I. G-dur.» em vez de «CONCERTO I.»)
  const norm = (t) => F.semAcentos(String(t || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const maisCompleto = (velho, novo) => !tituloLixo(velho) && norm(novo) && norm(velho) !== norm(novo) && norm(velho).startsWith(`${norm(novo)} `)
  for (const k of CAMPOS_PROTEGIDOS) {
    // (o que as regras corrigiram de propósito não volta, a não ser que venha de um catálogo)
    if (vazio(antiga[k]) || igual(d[k], antiga[k]) || (semRepor.includes(k) && !deCatalogo)) continue
    // (a data mais precisa fica: "2019-07-17" não passa a "2019")
    if (k === 'data' && dataMaisPrecisa(antiga.data, d.data)) {
      mantidos.push(k)
      d[k] = antiga[k]
      continue
    }
    let valor = antiga[k]
    if (k === 'autores' && !deCatalogo) {
      valor = (antiga.autores || []).filter((a) => !autorInvalido(a))
      if (!valor.length) continue
    }
    if (vazio(d[k]) || deCatalogo || (k === 'titulo' && maisCompleto(antiga.titulo, d.titulo))) {
      mantidos.push(k)
      d[k] = valor
    }
  }
  for (const [k, v] of Object.entries(antiga.metadados || {})) {
    if (vazio(v) || igual(d.metadados[k], v)) continue
    // (a sugestão da IA que entretanto ficou confirmada como nº de catálogo já não volta)
    if (k === 'catalogo_ia' && d.metadados.catalogo) continue
    // (nem o nº que a IA tinha inventado e que as regras novas passaram a sugestão)
    if (k === 'catalogo' && !deCatalogo && d.metadados.catalogo_ia) continue
    // (o título escrito na própria fonte fica: a reanálise não o troca pelo de outro exemplar — Pedro, 2/10, #2152)
    if (vazio(d.metadados[k]) || deCatalogo || k === 'titulo_fonte') {
      mantidos.push(`metadados.${k}`)
      d.metadados[k] = v
    }
  }
  // (ficha de um catálogo: a leitura da IA não lhe acrescenta «Manuscrito» ou «Impresso»)
  if (deCatalogo && !antiga.metadados?.forma) delete d.metadados.forma
  if (d.metadados.catalogo && d.metadados.catalogo_ia && catalogoDe(d.metadados.catalogo_ia)?.codigo === catalogoDe(d.metadados.catalogo)?.codigo) delete d.metadados.catalogo_ia
  // (a ficha continua a dizer de onde veio: a próxima reanálise também a protege)
  if (deCatalogo && d.origem !== antiga.origem) d.origem = antiga.origem
  return { dados: d, mantidos, deCatalogo }
}
// "A IA leu como impresso; a PEM descreve um manuscrito."
const ARTIGO_CATALOGO = { PEM: 'a PEM', 'Cantus Database': 'a Cantus Database', Gallica: 'a Gallica', BSB: 'a BSB', BNP: 'a BNP' }
export const notaFormaDoCatalogo = (fonte) => `A IA leu como impresso; ${ARTIGO_CATALOGO[fonte] || `o ${fonte}`} descreve um manuscrito.`
const raizDe = (caminho) => (caminho.startsWith(PASTAS.watch) ? PASTAS.watch : PASTAS.biblioteca)
// Páginas de condições de uso de bibliotecas digitais (BSB, ÖNB, Google…): não contam para as palavras-chave
const semAvisos = (texto) => String(texto || '').split('\f').filter((p) => !(p.length < 5000 && PAGINA_DE_AVISO.test(p))).join('\f')

// Ficheiros que não são fontes (páginas web, ícones, ficheiros de sistema)
export function eFonte(caminho) {
  const cat = F.categoriaPorExtensao(caminho)
  if (!SUPORTADAS.has(cat)) return false
  if (cat === 'imagem') {
    try {
      return fs.statSync(caminho).size >= IMAGEM_MINIMA
    } catch (_) {
      return false
    }
  }
  return true
}

// Põe de lado (em nao_processados/, com a mesma estrutura de pastas) um ficheiro da watch folder
let contadorLado = 0
export async function porDeLado(caminho) {
  if (!fs.existsSync(caminho)) return
  const rel = path.relative(PASTAS.watch, caminho)
  await F.mover(caminho, path.join(PASTAS.naoProcessados, path.dirname(rel)), path.basename(caminho))
  if (++contadorLado <= 20 || contadorLado % 500 === 0) log.aviso(`Não é uma fonte: ${rel} → nao_processados/${contadorLado > 20 ? ` (${contadorLado} até agora)` : ''}`)
  await F.limparPastasVazias(path.dirname(caminho), PASTAS.watch)
}

// Converte um candidato (de uma fonte externa) em campos da fonte.
// juntarAutores: acrescenta nomes novos aos existentes em vez de os substituir
// (útil em gravações, onde as etiquetas do ficheiro costumam estar certas).
export async function dadosDoCandidato(atual, c, { mudarTipo = true, juntarAutores = false } = {}) {
  const d = {}
  for (const k of ['titulo', 'data', 'editora', 'local', 'doi', 'isbn', 'url']) if (c[k]) d[k] = String(c[k])
  if (c.autores?.length) {
    if (juntarAutores && atual.autores?.length) {
      const chave = (a) => F.semAcentos(a.literal || a.apelido || '').toLowerCase()
      const existentes = new Set(atual.autores.map(chave))
      d.autores = [...atual.autores, ...c.autores.filter((a) => !existentes.has(chave(a)))]
    } else d.autores = c.autores
  }
  d.metadados = { ...(atual.metadados || {}), ...semVazios(c.metadados) }
  if (mudarTipo && c.tipo_sugerido) {
    const t = await tipoPorNome(c.tipo_sugerido)
    if (t) d.tipo = t.id
  }
  if (palavrasUteis(c.palavras_chave).length && !atual.palavras_chave?.length) {
    d.palavras_chave = palavrasUteis(c.palavras_chave)
    d.metadados.palavras_chave_origem = c.fonte
  }
  d.origem = c.fonte
  return d
}

// Lê o que o próprio ficheiro diz sobre si. Ordem de confiança para o título:
// capa do JSTOR → capa do documento (tamanho das letras) → nome do ficheiro →
// metadados escondidos do PDF → primeira linha de texto.
async function lerFicheiro(caminho, categoria, defs, nomeReal) {
  const info = { titulos: [], autores: [], ano: '', artista: '', compositor: '', editora: '', paginas: 0, texto: '', inicio: '', precisaOcr: false, metadados: {}, tese: false, doi: '', palavrasAutor: [] }
  // (numa reanálise, o nome original do ficheiro — o de antes de ser renomeado — é a melhor pista)
  const nome = doNomeFicheiro(nomeReal || caminho)
  let meta = { titulo: '', autor: '', editora: '', assunto: null }
  info.partitura = categoria === 'partitura'
  let jstor = null
  let capa = null
  let layoutTexto = ''

  if (categoria === 'pdf') {
    const pi = await X.pdfInfo(caminho)
    info.paginas = pi.paginas
    // (programa que criou o PDF: Finale, Sibelius… = transcrição; Pré-visualização, scanner… = digitalização)
    info.programaPdf = pi.programa
    info.autorPdf = pi.autor
    meta = { titulo: X.tituloPdfUtil(pi.titulo) ? pi.titulo : '', autor: X.autorPdfUtil(pi.autor), editora: X.editoraPdf(pi.autor), assunto: X.assuntoUtil(pi.assunto) }
    // Pistas para a IA local: o que o ficheiro diz sobre si fora da página
    info.pistas = [nomeReal && `Original file name: ${nomeReal}`, pi.titulo && `PDF title: ${pi.titulo}`, pi.assunto && `PDF subject: ${pi.assunto}`, pi.autor && `PDF author: ${pi.autor}`].filter(Boolean).join('\n')
    const inicio = await X.pdfTexto(caminho, 1, 3)
    let layout = []
    if (X.temTextoUtil(inicio, pi.paginas)) {
      info.inicio = inicio
      info.texto = semAvisos(await X.pdfTexto(caminho))
      layout = await lerLayout(caminho, 3)
      layoutTexto = semAvisos(await X.pdfTexto(caminho, 1, 14, true))
    } else {
      info.precisaOcr = true
      // Digitalização: OCR das 2 primeiras páginas com posição das palavras, para ler a capa
      if (defs.ocr_ativo !== false) {
        try {
          layout = await lerLayoutOcr(caminho, defs.linguas_ocr, Math.min(2, pi.paginas || 1), PASTAS.tessdata)
          info.inicio = layout.map((p) => p.blocos.map((b) => b.linhas.map((l) => l.texto).join('\n')).join('\n\n')).join('\n\n')
        } catch (_) {}
      }
    }
    // Partitura: as notas vêm como caracteres ("œœœ"); retirá-las antes de ler o resto
    if (eTextoMusical(info.inicio)) {
      info.partitura = true
      info.inicio = limparMusica(info.inicio)
      info.texto = limparMusica(info.texto)
      layoutTexto = limparMusica(layoutTexto)
      layout = semMusica(layout)
    }
    jstor = analisarJstor(info.inicio)
    if (!jstor) capa = analisarCapa(layout)
    // Capa com texto cifrado (fontes com codificação própria): ler a imagem por OCR
    const pag1 = layout[0]?.blocos || []
    const cifrados = pag1.filter((b) => cifrado(b.texto)).length
    if (!jstor && pag1.length && (cifrados / pag1.length > 0.3 || !capa?.titulo) && defs.ocr_ativo !== false && !info.precisaOcr) {
      try {
        const ocr = await lerLayoutOcr(caminho, defs.linguas_ocr, 1, PASTAS.tessdata)
        const capaOcr = analisarCapa(ocr)
        if (capaOcr.titulo && (capaOcr.confianca >= (capa?.confianca || 0) || cifrados / pag1.length > 0.3)) capa = { ...capaOcr, tese: capaOcr.tese || capa?.tese }
      } catch (_) {}
    }
  } else if (categoria === 'imagem') {
    info.precisaOcr = true
    info.paginas = 1
  } else if (categoria === 'texto' || categoria === 'documento') {
    info.texto = categoria === 'texto' ? await X.lerTextoSimples(caminho) : await X.textoDocumento(caminho)
    info.inicio = info.texto.slice(0, 8000)
    layoutTexto = info.texto.slice(0, 60000)
  } else if (categoria === 'audio' || categoria === 'video') {
    const { tags: t, duracao } = await X.ffprobe(caminho)
    info.titulos.push(t.title || '')
    info.artista = t.artist || t.album_artist || t.performer || ''
    info.ano = t.date || (t.creation_time || '').slice(0, 10)
    info.editora = t.publisher || t.label || ''
    info.compositor = t.composer || ''
    info.metadados = semVazios({ duracao: X.formatarDuracao(duracao), album: t.album || '' })
    if (!t.title) {
      // Nomes do tipo "Artista - Título"
      const n = X.tituloDoNome(nomeReal || caminho)
      const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(n)
      if (m) {
        info.artista = info.artista || m[1]
        info.titulos = [m[2]]
      } else info.titulos = [n]
    }
  }

  if (categoria !== 'audio' && categoria !== 'video') {
    const capaBoa = capa && capa.titulo && capa.confianca >= 0.6 ? capa : null
    info.titulos = [jstor?.titulo, capaBoa?.titulo, meta.assunto?.titulo, !nome.propria && nome.titulo, meta.titulo, nome.propria && nome.titulo]
    // (do nome original do ficheiro, não do nome que a biblioteca lhe deu: "SD_ANONIMO_…" repetia-se a cada reanálise)
    const nomeTitulo = nomeReal || caminho
    if (!info.titulos.some(Boolean)) info.titulos.push(X.tituloDoTexto(info.inicio), X.nomeGenerico(nomeTitulo) ? '' : X.tituloDoNome(nomeTitulo))
    info.titulos = [...new Set(info.titulos.filter(Boolean).map((t) => t.trim()))]
    if (jstor?.autores.length) info.autores = jstor.autores
    else if (capa?.autores.length) info.autores = capa.autores
    else if (meta.assunto?.autor) info.autores = [pessoa(meta.assunto.autor, info.partitura ? 'compositor' : 'autor')].filter(Boolean)
    else if (nome.autor && !nome.propria && !nome.provavel) info.autores = [pessoa(nome.autor, info.partitura ? 'compositor' : 'autor')].filter(Boolean)
    else if (meta.autor) info.autores = [pessoa(meta.autor)].filter(Boolean)
    // (nomes dados pela própria biblioteca podem guardar palpites antigos errados: não servem para autor nem ano)
    info.ano = jstor?.ano || capa?.ano || (!nome.propria && nome.ano) || ''
    info.doi = jstor?.doi || ''
    info.jstor = !!jstor
    info.confiancaCapa = capaBoa && capaBoa.autores.length && capaBoa.ano ? capaBoa.confianca : 0
    if (capa?.tese) {
      info.tese = true
      info.metadados = semVazios({ grau: capa.grau, orientacao: capa.orientador, instituicao: capa.instituicao })
    }
    info.palavrasAutor = palavrasChaveDoTexto(layoutTexto || info.inicio)
    if (!info.editora && meta.editora) info.editora = meta.editora
    info.pistaAutor = meta.assunto?.autor || (!nome.propria && !nome.provavel && nome.autor) || ''
  }
  if (!info.titulos.length) info.titulos = [X.tituloDoNome(nomeReal || caminho)]
  return info
}

// Retira da capa os blocos/palavras que são notação musical
function semMusica(paginas) {
  return paginas.map((p) => ({
    ...p,
    blocos: p.blocos
      .map((b) => {
        const linhas = b.linhas.map((l) => ({ ...l, texto: l.texto.split(/\s+/).filter((t) => !tokenMusical(t)).join(' ') })).filter((l) => /\p{L}{2,}/u.test(l.texto))
        return { ...b, linhas, texto: linhas.map((l) => l.texto).join(' ').trim() }
      })
      .filter((b) => b.linhas.length),
  }))
}

// Procura uma fonte já existente SEM ficheiro que seja a mesma obra (ex.: importada
// do Mendeley), para lhe associar este ficheiro em vez de criar uma duplicada.
async function obraExistente(dados, excluirId) {
  const ids = new Set()
  const apelidoAutor = (dados.autores || [])[0]?.apelido || (dados.autores || [])[0]?.literal || ''
  // Palavras principais do título (4+ letras, as mais longas): tolera gralhas e prefixos/sufixos a mais
  const principais = [...new Set(F.semAcentos(String(dados.titulo || '')).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4))]
    .sort((a, b) => b.length - a.length)
  const procurar = async (query) => (await pb.send('/api/bib/pesquisa', { query: { ...query, limite: 15 } })).forEach((r) => ids.add(r.id))
  try {
    if (dados.doi) (await pb.collection('fontes').getFullList({ filter: pb.filter("doi = {:d} && ficheiro = ''", { d: dados.doi }), fields: 'id' })).forEach((r) => ids.add(r.id))
    if (principais.length) await procurar({ titulo: principais.slice(0, 5).join(' ') })
    if (apelidoAutor && principais.length) await procurar({ autor: apelidoAutor, titulo: principais.slice(0, 2).join(' ') })
  } catch (_) {}
  ids.delete(excluirId)
  if (!ids.size) return null
  const cands = await fontesPorIds([...ids])
  const apelido = F.semAcentos((dados.autores || [])[0]?.apelido || '').toLowerCase()
  return (
    cands.find((c) => {
      if (c.ficheiro) return false
      if (dados.doi && c.doi && c.doi.toLowerCase() === dados.doi.toLowerCase()) return true
      if (!anosCompativeis(c.data, dados.data)) return false
      const outro = F.semAcentos((c.autores || [])[0]?.apelido || (c.autores || [])[0]?.literal || '').toLowerCase()
      const mesmoAutor = apelido && outro && (outro.includes(apelido) || apelido.includes(outro))
      if (titulosIguais(c.titulo, dados.titulo)) return !apelido || !outro || mesmoAutor
      // Títulos quase iguais (gralha, prefixo ou sufixo a mais) só com o mesmo autor
      const [curto, longo] = c.titulo.length <= dados.titulo.length ? [c.titulo, dados.titulo] : [dados.titulo, c.titulo]
      if (mesmoAutor) return semelhanca(c.titulo, dados.titulo) >= 0.8 || contido(curto, longo) >= 0.85
      // A fonte existente não tem autor (ex.: entrada incompleta do Mendeley): exigir títulos quase iguais
      return !outro && (semelhanca(c.titulo, dados.titulo) >= 0.9 || contido(curto, longo) >= 0.92)
    }) || null
  )
}

// Título lido de uma página de música que parece mesmo um título: não sílabas do texto cantado
// ("Mes de - spa - ran - che"), não uma cota ("O.L. 239"), com pelo menos duas palavras a sério
function tituloPlausivel(t) {
  const s = String(t || '').trim()
  if ((s.match(/\p{L}{1,5}\s+[-–]\s+\p{L}/gu) || []).length >= 2) return false
  if (/^[\p{Lu}]{1,4}\.?\s?[\p{Lu}]?\.?\s*\d+/u.test(s)) return false
  if (/[—:]\s*$|^[a-z]\.\s/.test(s)) return false
  return (s.match(/\p{L}{3,}/gu) || []).length >= 2
}

// Títulos que são restos de nomes de ficheiro ou de metadados vazios
function tituloLixo(t) {
  const s = String(t || '').trim()
  return !s || /unknown\s+unknown|\bpdf\b|z-lib|libgen|academia[ _-]?preview|\bno title\b|^untitled$|_/i.test(s) || /\b\w+(-\w+){3,}\b/.test(s)
}

// Mesma obra, já com ficheiro: mesmo DOI, ou mesmo título exato + mesmo autor + mesmo ano
async function mesmaObraComFicheiro(dados, excluirId) {
  try {
    if (dados.doi) {
      const r = await pb.collection('fontes').getList(1, 1, { filter: pb.filter("doi = {:d} && ficheiro != '' && id != {:id}", { d: dados.doi, id: excluirId }) })
      if (r.items[0]) return r.items[0]
    }
    const apelido = F.semAcentos((dados.autores || [])[0]?.apelido || '').toLowerCase()
    const ano = (/(\d{4})/.exec(dados.data || '') || [])[1]
    if (!apelido || !ano || !dados.titulo) return null
    const fts = await pb.send('/api/bib/pesquisa', { query: { titulo: String(dados.titulo).slice(0, 120), autor: apelido, limite: 10 } })
    const ids = fts.map((r) => r.id).filter((id) => id !== excluirId)
    if (!ids.length) return null
    return (await fontesPorIds(ids)).find(
      (c) => c.ficheiro && tituloCompacto(c.titulo) === tituloCompacto(dados.titulo) && String(c.data || '').slice(0, 4) === ano && F.semAcentos((c.autores || [])[0]?.apelido || '').toLowerCase() === apelido
    ) || null
  } catch (_) {
    return null
  }
}

async function palavrasChave(info, escolhido, titulo, ia) {
  if (palavrasUteis(info.palavrasAutor).length) return { lista: palavrasUteis(info.palavrasAutor), origem: 'autor' }
  if (palavrasUteis(escolhido?.palavras_chave).length) return { lista: palavrasUteis(escolhido.palavras_chave), origem: escolhido.fonte }
  if (palavrasUteis(ia?.palavras_chave).length) return { lista: palavrasUteis(ia.palavras_chave), origem: 'IA local' }
  const geradas = gerarPalavrasChave(info.texto, titulo)
  return geradas.length ? { lista: geradas, origem: 'automáticas' } : { lista: [], origem: '' }
}

// Compositor já conhecido na biblioteca (em 2+ fichas completas): quem publicou a própria música continua compositor
async function compositorConhecido() {
  const conhecidos = await autoresConhecidos()
  return (apelido) => (conhecidos.get(F.semAcentos(apelido || '').toLowerCase())?.papeis.get('compositor') || 0) >= 2
}

// Fontes fotografadas página a página (ver juntar.js): a ficha tem o PDF de visualização e a(s) pasta(s)
// dos originais em metadados.originais ("_originais/E-TZ 2-3 New", várias separadas por " | ").
// PDF de visualização que não fica (repetido): a pasta dos seus originais vai com ele para _duplicados,
// a não ser que alguma ficha a use
async function originaisParaDuplicados(orig) {
  if (!orig?.originais) return
  const abs = path.join(PASTAS.biblioteca, orig.originais)
  if (!fs.existsSync(abs)) return
  try {
    await pb.collection('fontes').getFirstListItem(pb.filter('metadados.originais ~ {:o}', { o: orig.originais }))
    return
  } catch (_) {}
  const destino = await F.mover(abs, path.join(PASTAS.biblioteca, DUPLICADOS), `${path.basename(abs)} - originais`)
  log.aviso(`Originais repetidos: ${orig.originais} → ${relativo(destino)}`)
}

async function processarFicheiro(caminho) {
  if (!fs.existsSync(caminho)) return
  await garantirSessao()
  const defs = await definicoes()
  const raiz = raizDe(caminho)
  const nomeOriginal = path.basename(caminho)
  const ext = path.extname(caminho)
  const categoria = F.categoriaPorExtensao(caminho)
  const genero = GENERO[categoria]

  if (!eFonte(caminho)) {
    if (raiz === PASTAS.watch) await porDeLado(caminho)
    return
  }

  // PDF de visualização de imagens (ver juntar.js): onde estão os originais
  const orig = categoria === 'pdf' ? originaisDasPalavras((await X.pdfInfo(caminho)).palavras) : null

  // Duplicados (mesmo conteúdo, qualquer nome)
  const hash = await F.hashFicheiro(caminho)
  let existente = null
  try {
    existente = await pb.collection('fontes').getFirstListItem(pb.filter('hash = {:h}', { h: hash }))
  } catch (_) {}
  // Ficheiro adicional de outra fonte (volume, livro de partes): é dela, nunca é reanalisado sozinho
  if (!existente) {
    const dono = await donoDoFicheiroExtra(hash)
    if (dono) {
      if ((dono.ficheiros_extra || []).some((x) => x.ficheiro === relativo(caminho))) return
      const destino = await F.mover(caminho, path.join(PASTAS.biblioteca, DUPLICADOS), nomeOriginal)
      log.aviso(`Duplicado de um ficheiro de «${dono.titulo}»: movido para ${relativo(destino)}`)
      await originaisParaDuplicados(orig)
      await F.limparPastasVazias(path.dirname(caminho), raiz)
      return
    }
  }
  if (existente && existente.ficheiro && existente.estado !== 'processando') {
    if (existente.ficheiro === relativo(caminho)) return // é o próprio ficheiro (releitura da biblioteca)
    const destino = await F.mover(caminho, path.join(PASTAS.biblioteca, DUPLICADOS), nomeOriginal)
    log.aviso(`Duplicado de «${existente.titulo}»: movido para ${relativo(destino)}`)
    await originaisParaDuplicados(orig)
    await F.limparPastasVazias(path.dirname(caminho), raiz)
    try {
      await aproveitarNomeDoRepetido(existente, nomeOriginal)
    } catch (e) {
      log.aviso(`Nome do repetido não aproveitado: ${e.message}`)
    }
    return
  }
  // As mesmas fotografias (nomes e tamanhos) já têm ficha: o PDF novo e os originais vão para _duplicados
  if (!existente && orig?.conjunto) {
    let igual = null
    try {
      igual = await pb.collection('fontes').getFirstListItem(pb.filter('metadados.originais_conjunto ~ {:c}', { c: orig.conjunto }))
    } catch (_) {}
    if (igual) {
      const destino = await F.mover(caminho, path.join(PASTAS.biblioteca, DUPLICADOS), nomeOriginal)
      log.aviso(`As mesmas fotografias de «${igual.titulo}» (#${String(igual.numero || '').padStart(4, '0')}): movidas para ${relativo(destino)}`)
      await originaisParaDuplicados(orig)
      await F.limparPastasVazias(path.dirname(caminho), raiz)
      return
    }
  }
  // Reanálise: o estado que a ficha tinha antes de ficar «A processar» (e a ficha sem essa chave, para não ser copiada)
  const antes = estadoAntesDaReanalise(existente)
  const estadoAntes = antes.estado
  existente = antes.ficha
  // MIDI de um lote que já tem ficha ("rossi_1608_36.mid" depois de "rossi_1608_1.mid"): entra nela
  if (!existente && eMidi(caminho)) {
    const lote = await fichaDoLote(chaveLote(nomeOriginal), ext)
    if (lote && lote.estado !== 'processando') return juntarAoLote(lote, caminho, hash, nomeOriginal, raiz)
  }
  log.info(`A ler: ${nomeOriginal}`)

  // (numa reanálise: o nome mais informativo entre o original e os dos repetidos que entraram depois)
  const nomeReal = existente ? melhorNome([existente.ficheiro_original, ...nomesAlternativos(existente)], catalogoDe) || nomeOriginal : nomeOriginal
  const info = await lerFicheiro(caminho, categoria, defs, nomeReal)
  const pesquisaTexto = `${nomeOriginal}\n${info.inicio}`
  const doi = info.doi || X.encontrarDoi(pesquisaTexto)
  const isbn = X.encontrarIsbn(pesquisaTexto)
  let autoresFicheiro = [
    ...info.autores,
    info.compositor && pessoa(info.compositor, 'compositor'),
    info.artista && pessoa(info.artista, 'intérprete'),
  ].filter(Boolean)
  // Sem autor por outra via: a 1.ª palavra do nome ("rossi_1608_9", "telemann_duetto_1") conta se for um
  // autor já conhecido na biblioteca ou, com ano no nome, um compositor com impressos nesse ano no RISM
  // (o dono nos dados internos de um PDF do Finale ou de digitalizações não conta: é o editor ou quem digitalizou;
  // nos textos dele — Word, Pages — é mesmo o autor)
  const pdfDeTerceiros = EDITOR_PARTITURAS.test(info.programaPdf || '') || DIGITALIZACAO.test(info.programaPdf || '')
  if ((!autoresFicheiro.length || (pdfDeTerceiros && !autoresFicheiro.some((a) => !eDoDono(a)))) && defs.enriquecimento_auto !== false) {
    const doNome = doNomeFicheiro(nomeReal)
    try {
      const a = await autorDoNome(nomeReal, { ano: doNome.ano || doNome.anoAntigo, email: defs.email_contacto, papel: info.partitura ? 'compositor' : '' })
      if (a) {
        autoresFicheiro = [pessoaDe(a)]
        // (ano anterior a 1400 no nome: só com um compositor já conhecido)
        if (!info.ano && doNome.anoAntigo && a.conhecido) info.ano = doNome.anoAntigo
      }
    } catch (e) {
      log.aviso(`Autor pelo nome de «${nomeOriginal}»: ${e.message}`)
    }
  }
  // (fotografias de páginas: o nome do dono no PDF de visualização/digitalização não é o autor — ver mais abaixo)
  if (orig && autoresFicheiro.some(eDoDono)) autoresFicheiro = autoresFicheiro.filter((a) => !eDoDono(a))
  const tipoProvisorio = await tipoPorNome(info.tese ? 'Tese / dissertação' : info.partitura ? 'Partitura' : TIPO_INICIAL[genero] || 'Outro')
  let fonte =
    existente ||
    (await pb.collection('fontes').create({ titulo: info.titulos[0], tipo: tipoProvisorio?.id, estado: 'processando', ficheiro_original: nomeOriginal, hash, ocr_estado: 'nao_aplicavel' }))

  // A obra já existe na biblioteca (ex.: importada do Mendeley)? Então não é preciso pesquisar online.
  let previa = await obraExistente({ titulo: info.titulos[0], autores: autoresFicheiro, data: info.ano, doi }, fonte.id)

  // Regras sem certeza: pedir à IA local que leia a 1.ª página "como uma pessoa"
  const regrasSeguras = info.jstor || doi || isbn || info.confiancaCapa >= 0.85
  let ia = null
  let semFrontispicio = false
  if (!previa && !regrasSeguras && ['pdf', 'imagem'].includes(categoria) && (await iaDisponivel(defs))) {
    // Se a 1.ª página for um aviso (condições de uso, capa de descarga…), ler a seguinte
    for (let pagina = 1; pagina <= (categoria === 'pdf' ? Math.min(emPoupanca() ? 1 : 3, info.paginas || 1) : 1); pagina++) {
      try {
        ia = await lerComIA(caminho, categoria, defs, { pagina, pistas: info.pistas || (nomeReal ? `Original file name: ${nomeReal}` : '') })
      } catch (e) {
        log.aviso(`IA local não conseguiu ler «${nomeOriginal}» (página ${pagina}): ${e.message}`)
        ia = null
      }
      if (ia?.titulo && !PAGINA_DE_AVISO.test(ia.titulo) && !/^(contents|[íi]ndice|table of contents|preface|index)$/i.test(ia.titulo)) break
      ia = null
    }
  }
  // O nome do ficheiro é a 1.ª pista (Pedro, 1/10/2026): um nome informativo ("1502 Josquin Missas", "Corelli
  // Triosonatas opus2", "Bach Partita BWV 1013") manda sobre uma leitura da IA que não tem nada a ver com ele
  const notas = []
  const semRepor = []
  const nomeLido = doNomeFicheiro(nomeReal)
  const nomeInformativo = !nomeLido.propria && informacaoDoNome(nomeReal, catalogoDe) >= 3
  const tituloNome = nomeInformativo ? nomeLido.titulo || pistasDoNome(nomeReal).titulo || X.tituloDoNome(nomeReal) : ''
  const autorNome = !nomeLido.propria && !nomeLido.provavel ? nomeLido.autor || pistasDoNome(nomeReal).autor : ''
  // (palavras de 3+ letras e números de 2+ algarismos: "OP15" e "Op. 15" têm o 15 em comum)
  const palavrasDe = (t) => new Set(F.semAcentos(String(t || '')).toLowerCase().replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9]+/).filter((w) => (/^\d+$/.test(w) ? w.length >= 2 : w.length >= 3) && !/^(the|and|for|del|des|der|die|das|les|con|per|pdf|par|une|uno|una|von|van)$/.test(w)))
  const nadaEmComum = (a, b) => {
    const ca = catalogoDe(path.basename(a, path.extname(a)))
    const cb = catalogoDe(b)
    if (ca && cb && ca.codigo === cb.codigo) return false
    const pa = palavrasDe(path.basename(a, path.extname(a)))
    return ![...palavrasDe(b)].some((w) => pa.has(w))
  }
  if (ia?.titulo) {
    // "Variations on a Minuet … by Fischer": se o "compositor" lido só aparece no título como autor do tema,
    // e o ficheiro (Assunto do PDF, nome original) indica outro, fica esse (aqui, Mozart)
    const primeiro = ia.autores[0]
    const apelidoIa = F.semAcentos(primeiro?.apelido || primeiro?.literal || '').toLowerCase()
    const pista = F.semAcentos(info.pistaAutor || '').toLowerCase()
    if (apelidoIa && pista && !pista.includes(apelidoIa) && new RegExp(`\\b(by|de|di|von|du|della|after|on a theme (by|of)|sur un th[eè]me de|sobre um tema de)\\s+(\\S+\\s+){0,2}${apelidoIa}\\b`, 'i').test(F.semAcentos(ia.titulo))) {
      ia.autores = [pessoa(info.pistaAutor, 'compositor'), ...ia.autores.slice(1)].filter(Boolean)
    }
    // (leitura da IA sem nada em comum com um nome informativo: fica o nome, por rever, com a leitura numa nota)
    const iaContraNome = nomeInformativo && tituloNome && nadaEmComum(nomeReal, `${ia.titulo} ${ia.autores.map((a) => a.apelido || a.literal).join(' ')}`)
    if (iaContraNome) {
      notas.push(`A IA leu na 1.ª página: «${ia.titulo}»${ia.autores.length ? ` (${ia.autores.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')})` : ''}; ficou o que diz o nome do ficheiro.`)
      info.titulos = [tituloNome, ...info.titulos.filter((t) => t !== tituloNome), ia.titulo]
    } else info.titulos = nomeInformativo && tituloNome ? [ia.titulo, tituloNome, ...info.titulos.filter((t) => t !== ia.titulo && t !== tituloNome)] : [ia.titulo, ...info.titulos.filter((t) => t !== ia.titulo)]
    // (o autor do nome do ficheiro fica se a IA leu outro)
    const apNome = F.semAcentos(autorNome).toLowerCase()
    const iaTemAutorDoNome = ia.autores.some((a) => { const x = F.semAcentos(a.apelido || a.literal || '').toLowerCase(); return x && (apNome.includes(x) || x.includes(apNome)) })
    if (ia.autores.length && apNome && !iaTemAutorDoNome && autoresFicheiro.length) notas.push(`A IA leu como autor: ${ia.autores.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')}; ficou o do nome do ficheiro.`)
    else if (ia.autores.length && !iaContraNome) autoresFicheiro = ia.autores
    if (ia.ano) info.ano = ia.ano
    if (ia.tipo === 'Tese / dissertação') info.tese = true
    if (ia.tipo === 'Partitura') info.partitura = true
    if (ia.editora) info.editora = ia.editora
    if (ia.local) info.local = ia.local
    // Impressor lido também como compositor ("Paulus Matthysz"): sai dos compositores, a não ser que seja um
    // compositor já conhecido na biblioteca (Telemann, Marais publicaram a própria música)
    if (ia.editora && autoresFicheiro.length) {
      const conhecido = await compositorConhecido()
      const ed = F.semAcentos(ia.editora).toLowerCase()
      const fica = autoresFicheiro.filter((a) => {
        const ap = F.semAcentos(a.apelido || '').toLowerCase()
        return !ap || ap.length < 3 || !new RegExp(`\\b${ap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(ed) || conhecido(ap)
      })
      if (fica.length !== autoresFicheiro.length) autoresFicheiro = fica
    }
    // Título de uma peça numerada ("Sonata I", "Concerto I") num PDF com muitas páginas: provavelmente uma
    // coleção sem frontispício (a IA só vê a 1.ª página)
    semFrontispicio = ia.conteudo !== 'colecao' && PECA.test(ia.titulo) && (info.paginas || 0) >= 30
    // Nº de catálogo lido pela IA: só conta se estiver escrito no nome do ficheiro ou no texto
    // (a IA inventa números, sobretudo "BWV 1047"); senão fica como sugestão, confirmada mais abaixo pelo IMSLP
    const catConfirmado = ia.catalogo && (catalogoConfirmado(ia.catalogo, [nomeReal, info.pistas, info.inicio, String(info.texto || '').slice(0, 60000)]) || numeroNoNome(ia.catalogo, nomeReal))
    info.metadados = semVazios({
      ...info.metadados,
      grau: ia.grau || info.metadados.grau,
      orientacao: ia.orientador || info.metadados.orientacao,
      instituicao: ia.instituicao || info.metadados.instituicao,
      catalogo: catConfirmado ? ia.catalogo : '',
      catalogo_ia: ia.catalogo && !catConfirmado ? ia.catalogo : '',
      instrumentacao: ia.instrumentacao,
      conteudo_tipo: ia.conteudo === 'colecao' || semFrontispicio ? 'Coleção' : ia.conteudo === 'peca' ? 'Peça de uma coleção' : ia.conteudo === 'obra' ? 'Obra' : '',
      nota_revisao: semFrontispicio ? `O PDF tem ${info.paginas} páginas e começa pela peça «${ia.titulo}»: provavelmente uma coleção sem frontispício (o título é o da 1.ª peça).` : '',
    })
    previa = await obraExistente({ titulo: ia.titulo, autores: autoresFicheiro, data: info.ano, doi }, fonte.id)
  }
  const nomeTipo = ia && ia.tipo !== 'Outro' ? ia.tipo : info.tese ? 'Tese / dissertação' : info.partitura ? 'Partitura' : TIPO_INICIAL[genero] || 'Outro'
  const tipoInicial = await tipoPorNome(nomeTipo)
  const generoPesquisa = info.tese ? 'tese' : info.partitura ? 'partitura' : genero
  const apelido = autoresFicheiro[0] ? autoresFicheiro[0].apelido || autoresFicheiro[0].literal : ''

  // Metadados online (teses: primeiro o OpenAIRE/RCAAP)
  let candidatos = []
  let escolhido = null

  // Fontes musicais antigas: sigla RISM + cota e data do nome do ficheiro, manuscrito ou impresso,
  // e pesquisa primeiro no RISM e no DIAMM (identificação quase exata com sigla + cota)
  const nomeMus = pistasDoNome(nomeReal)
  let sigla = null
  let cota = ''
  // (sigla no início do nome que o RISM não confirma — "P-Ev_alegria_cod_1" —: o ficheiro é na mesma um manuscrito
  //  com cota; os catálogos modernos não contam e a ficha fica por rever com nota — Pedro, 2/10/2026)
  let siglaDesconhecida = null
  // (uma "cota" sem algarismos nem numeração romana não é cota: "P-Arouca_livro_polifónico")
  const cotaValida = (c) => (/\d/.test(c) || /(^|\s)[IVXLCDM]{1,6}($|\s)/.test(c) ? c : '')
  const inicioDoNome = path.basename(nomeReal, path.extname(nomeReal)).replace(/^[\s_]+/, '').toLowerCase()
  for (const s of nomeMus.siglas) {
    try {
      sigla = await siglaRism(s.texto, defs.email_contacto)
    } catch (_) {}
    if (sigla) {
      cota = cotaValida(s.cota)
      break
    }
    if (!siglaDesconhecida && inicioDoNome.startsWith(s.texto.toLowerCase())) {
      let possiveis = []
      try {
        possiveis = (await siglasEquivalentes(s.texto, defs.email_contacto)).map((x) => x.sigla)
      } catch (_) {}
      siglaDesconhecida = { texto: s.texto, cota: cotaValida(s.cota), possiveis }
    }
  }
  if (sigla) siglaDesconhecida = null
  // (numa reanálise, a ficha que já era de um manuscrito continua a sê-lo: a IA só vê uma página)
  const formaAntes = existente?.metadados?.forma === 'Manuscrito' || (existente?.tipo && existente.tipo === (await tipoPorNome('Manuscrito'))?.id) ? 'manuscrito' : ''
  const formaLida = formaProvavel({ ia, nome: nomeMus, temCota: !!(sigla && cota) || !!siglaDesconhecida, antes: formaAntes })
  // Fonte de arquivo (sigla do RISM + cota no nome do ficheiro) que a IA leu como «impresso» sem impressor, local, data
  // de impressão nem fórmula de imprenta: é um manuscrito (Pedro, 2/10: «P-BRd_949_antifonario», #15445 «P-BRd_964»)
  // (fichas de catálogo ou feitas à mão não mudam, como na proteção da reanálise)
  const paginaUm = String(info.inicio || '').split('\f')[0]
  const msPelaCota = formaLida === 'impresso' && !!(sigla && cota) && ORIGEM_FRACA.test(String(existente?.origem || '').trim()) && !reconhecerExemplar({ nome: nomeReal })?.id &&
    manuscritoPelaCota({ ia, nome: nomeMus, temCota: true, antes: formaAntes, ficheiro: nomeReal, cota, texto: PAGINA_DE_AVISO.test(paginaUm) ? '' : paginaUm })
  const forma = msPelaCota ? 'manuscrito' : formaLida
  if (formaAntes && !nomeMus.forma && ia?.escrita === 'impresso') notas.push('A IA leu como impresso; ficou «Manuscrito», como a ficha já dizia.')
  const anoPista = nomeMus.ano || (/(\d{4})/.exec(info.ano || '') || [])[1] || ''
  const antiga = ['pdf', 'imagem'].includes(categoria) && (!!sigla || !!siglaDesconhecida || forma === 'manuscrito' || nomeTipo === 'Manuscrito' || (anoPista && Number(anoPista) < 1800))
  // (um identificador de biblioteca digital no nome — "bsb00016944", "btv1b…" — é um exemplar digitalizado de uma fonte
  //  histórica, mesmo que a IA não a tenha reconhecido como partitura)
  const exemplarNoNome = ['pdf', 'imagem'].includes(categoria) && !!reconhecerExemplar({ nome: nomeReal })?.id
  const musical = antiga || exemplarNoNome || (['pdf', 'imagem'].includes(categoria) && (info.partitura || nomeTipo === 'Partitura'))
  // Exemplar digitalizado: identificador no nome do ficheiro ("bsb00016944", "btv1b…") ou página de rosto da biblioteca
  // digital (BSB, Gallica, ÖNB, BNP…) com cota e identificador permanente; depois, o registo no catálogo da biblioteca
  let exemplar = null
  let outrosCatalogos = []
  let outrasDigitalizacoes = []
  if (musical && ['pdf', 'imagem'].includes(categoria)) {
    const primeira = info.inicio.split('\f')[0]
    const aviso = categoria === 'pdf' && (PAGINA_DE_AVISO.test(primeira) || /urn:nbn:/i.test(info.inicio))
    // (a camada de texto só conta numa página de rosto da biblioteca ou com um identificador: uma edição moderna que
    // agradece à "British Library" na 1.ª página não é um exemplar dela)
    exemplar = await exemplarDigitalizado(categoria === 'pdf' ? caminho : '', { linguas: 'deu+eng+fra+ita+lat', tessdata: PASTAS.tessdata, correr: X.correr, pdftoppm: BIN.pdftoppm, tesseract: BIN.tesseract, nome: nomeReal, texto: aviso || IDENTIFICADORES.test(primeira) ? primeira : '', ocr: aviso })
    if (exemplar && defs.enriquecimento_auto !== false) {
      try {
        exemplar = await completarExemplar(exemplar, defs.email_contacto, { texto: info.inicio.split('\f').slice(0, 2).join('\n'), titulos: info.titulos, europeana: defs.europeana_api_key })
      } catch (e) {
        log.aviso(`Registo do exemplar (${exemplar.biblioteca || exemplar.identificador}): ${e.message}`)
      }
    }
  }
  // Compositor e obra já conhecidos (nº de catálogo, ficha antiga de um catálogo ou corrigida à mão, nome do ficheiro):
  // um registo que os contradiz não ganha, mesmo com o título igual (Pedro, 2/10: «Cantata nº 60» de Bach ficou com
  // um registo anónimo do RISM; uma edição moderna ficou com o autógrafo)
  const antigosFortes = existente && !ORIGEM_FRACA.test(String(existente.origem || '').trim()) ? existente.autores || [] : []
  const catalogoConhecido = catalogoDe(info.metadados?.catalogo) || catalogoDe(existente?.metadados?.catalogo) || catalogoDe(nomeReal) || catalogoPeloNome(nomeReal, compositorDe(antigosFortes)?.apelido || '')
  const conhecidos = musical ? compositoresConhecidos({ catalogos: [catalogoConhecido].filter(Boolean), autoresAntigos: antigosFortes, autorNome }) : new Set()
  const pistaCompositor = musical && !apelido ? compositorDe(antigosFortes)?.apelido || donoDoCatalogo(catalogoConhecido?.codigo) || '' : ''
  const limiar = Number(defs.limiar_confianca) || 0.8
  const ajustar = (lista) => {
    const a = ajustarCandidatos(lista, { conhecidos, catalogo: catalogoConhecido?.codigo, forma, anoLido: anoPista || info.ano, nomeComCota: !!(sigla && cota), limiar })
    notas.push(...a.notas)
    return a.candidatos
  }
  if (musical && !previa && defs.enriquecimento_auto !== false) {
    try {
      // (manuscrito sem sigla no nome do ficheiro: a biblioteca e a cota da folha inicial servem para o RISM/DIAMM/Cantus)
      const doExemplar = !sigla && forma !== 'impresso' && exemplar?.sigla && exemplar?.cota
      const r = await pesquisarMusical({ titulo: info.titulos[0], tituloAlt: nomeMus.titulo, autor: apelido || nomeMus.autor || pistaCompositor, ano: anoPista, sigla: sigla?.sigla || (doExemplar ? exemplar.sigla : undefined), cota: cota || (doExemplar ? exemplar.cota : ''), forma, exemplar, cotaDoNome: !!(sigla && cota) }, defs.email_contacto, { europeana: defs.europeana_api_key })
      outrosCatalogos = r.outros || []
      outrasDigitalizacoes = r.digitalizacoes || []
      if (r.erros.length) log.aviso(`Algumas fontes de metadados falharam: ${r.erros.join('; ')}`)
      r.candidatos = ajustar(r.candidatos)
      candidatos = r.candidatos.slice(0, 10)
      escolhido = E.escolher(r.candidatos, limiar)
    } catch (e) {
      log.aviso(`Pesquisa no RISM/DIAMM falhou: ${e.message}`)
    }
  }

  // Nome com arquivo e cota ("P-Cug_MM243", "bguc_mm243"): a fonte é essa; só o RISM/DIAMM a podem identificar melhor
  const nomeComCota = !!(sigla && cota) || !!siglaDesconhecida
  if (!previa && !escolhido && !nomeComCota && defs.enriquecimento_auto !== false) {
    for (const titulo of info.titulos.slice(0, 2)) {
      try {
        const r = await E.automatico({ genero: generoPesquisa, titulo, autor: apelido || info.compositor || pistaCompositor, artista: info.artista, doi, isbn, paginas: info.paginas }, defs)
        if (r.erros.length) log.aviso(`Algumas fontes de metadados falharam: ${r.erros.join('; ')}`)
        r.candidatos = ajustar(r.candidatos)
        candidatos = E.juntarCandidatos(candidatos, r.candidatos)
        escolhido = E.escolher(r.candidatos, limiar)
        if (escolhido || doi || isbn) break
      } catch (e) {
        log.aviso(`Pesquisa de metadados falhou: ${e.message}`)
      }
    }
  }

  // Reanálise de uma ficha já identificada num catálogo de fontes (RISM, IMSLP…): o registo novo só a substitui se for
  // claramente melhor (o mesmo compositor e a mesma obra); senão fica o antigo, e o novo fica como sugestão na nota
  if (existente && escolhido && !trocaAceitavel(existente, escolhido, { semelhanca })) {
    notas.push(`${escolhido.fonte} sugeria «${escolhido.titulo}»${escolhido.data ? ` (${escolhido.data})` : ''}${escolhido.url ? ` — ${escolhido.url}` : ''}: não aceite, a ficha já estava identificada (${existente.origem}) com outro compositor ou outra obra.`)
    escolhido = null
  }

  // Fotografias de páginas e manuscritos não são livros nem artigos modernos: o que o CrossRef, a Open Library, o
  // OpenAlex, o OpenAIRE ou o DataCite encontrem fica só como sugestão (por rever), nunca «completo»
  const fotografada = !!orig || nomeComCota || forma === 'manuscrito' || nomeTipo === 'Manuscrito'
  if (escolhido && fotografada && CATALOGOS_MODERNOS.test(escolhido.fonte || '')) {
    notas.push(`${escolhido.fonte} sugeria «${escolhido.titulo}»${escolhido.data ? ` (${escolhido.data})` : ''}: não aceite, é uma fonte fotografada ou manuscrita.`)
    log.info(`«${nomeOriginal}»: ${escolhido.fonte} sugere «${escolhido.titulo}», mas é uma fonte fotografada/manuscrita — fica como sugestão`)
    escolhido = null
  }
  // Texto do dono (o PDF diz que é dele e não saiu de um editor de partituras nem de digitalizações): um catálogo que
  // não o tem como autor é outra obra com um título parecido («ANEXO revisto FINAL» ≠ um capítulo de 2012)
  if (escolhido && !fotografada && eDoDono(info.autorPdf || '') && !pdfDeTerceiros && !(escolhido.autores || []).some(eDoDono)) {
    notas.push(`${escolhido.fonte} sugeria «${escolhido.titulo}»${escolhido.data ? ` (${escolhido.data})` : ''}: não aceite, o PDF é do dono da biblioteca e o catálogo não o tem como autor.`)
    log.info(`«${nomeOriginal}»: ${escolhido.fonte} sugere «${escolhido.titulo}», mas o PDF é do dono e o catálogo não o tem como autor — fica como sugestão`)
    escolhido = null
  }

  // (o nome do dono da biblioteca nos dados internos do PDF de uma digitalização não é o autor da fonte)
  if (fotografada && autoresFicheiro.some(eDoDono)) autoresFicheiro = autoresFicheiro.filter((a) => !eDoDono(a))
  // (o dono nos dados internos de um PDF que não é fotografado: se o PDF saiu de um editor de partituras — as
  // transcrições e edições dele no Finale — é o editor; se foi juntado de digitalizações na Pré-visualização ou num
  // scanner, não é autor; nos textos dele — Word, Pages, LaTeX — continua autor)
  let donoDigitalizou = false
  const donoNoPdf = autoresFicheiro.some(eDoDono) || eDoDono(info.autorPdf || '')
  if (!fotografada && donoNoPdf && !autoresFicheiro.some((a) => eDoDono(a) && a.papel === 'compositor')) {
    if (EDITOR_PARTITURAS.test(info.programaPdf || '') || /\.mus[x]?\b/i.test(nomeReal)) {
      // (fica como editor ao lado do compositor que a IA ou o nome do ficheiro derem)
      const dono = autoresFicheiro.find(eDoDono) || pessoa(info.autorPdf, 'editor')
      autoresFicheiro = [...autoresFicheiro.filter((a) => !eDoDono(a)), dono && { ...dono, papel: 'editor' }].filter(Boolean)
    } else if (DIGITALIZACAO.test(info.programaPdf || '')) {
      donoDigitalizou = true
      autoresFicheiro = autoresFicheiro.filter((a) => !eDoDono(a))
    }
  }


  // Capa bem lida (título + autor + ano, numa tese ou capa do JSTOR) conta como identificação segura
  const capaSegura = !escolhido && info.confiancaCapa >= 0.8 && (info.tese || info.jstor)
  // Leitura da IA confirmada pelo próprio texto do documento (o título lido existe mesmo na página)
  // (nas partituras o título raramente está na camada de texto, cheia de símbolos musicais: basta a leitura da IA)
  const iaVerificada =
    !escolhido &&
    ia?.titulo &&
    ((nomeTipo === 'Partitura' && tituloPlausivel(ia.titulo) && (ia.autores.some((a) => a.literal !== 'Anónimo') || ia.catalogo)) ||
      (ia.autores.length && contido(ia.titulo, `${info.inicio}\n${String(info.texto).slice(0, 30000)}`) >= 0.7))
  const dados = {
    titulo: info.titulos[0],
    autores: autoresFicheiro,
    data: info.ano,
    editora: info.editora,
    doi,
    isbn,
    tipo: tipoInicial?.id,
    metadados: info.metadados,
    paginas: info.paginas,
    estado: escolhido || capaSegura || iaVerificada ? 'completo' : 'a_rever',
    candidatos: escolhido ? [] : candidatos,
    origem: capaSegura ? 'capa do PDF' : ia?.titulo ? 'IA local' : 'ficheiro',
    // (o OCR lê texto, não notas: nas partituras não serve para nada e ocupa o Mac durante horas)
    ocr_estado: info.precisaOcr && nomeTipo !== 'Partitura' ? 'pendente' : 'nao_aplicavel',
  }
  if (escolhido) {
    // Para áudio/vídeo/partituras o tipo vem do ficheiro; nos escritos, da fonte externa.
    const escrita = genero === 'escrita'
    Object.assign(dados, await dadosDoCandidato(dados, escolhido, { mudarTipo: escrita && !info.tese && !info.partitura, juntarAutores: !escrita }))
    // Nas teses, o ano da capa (defesa) vale mais do que a data de depósito no repositório
    if (info.tese && info.ano) dados.data = info.ano
    dados.metadados = { ...info.metadados, ...dados.metadados }
  }

  // Fonte antiga: forma (manuscrito/impresso), tipo, arquivo e cota; data e compositor do nome quando faltam
  let nomeTipoFinal = nomeTipo
  if (musical) {
    const doCatalogo = CATALOGOS_FONTES.test(escolhido?.fonte || '')
    // Catálogo de biblioteca que diz "[Manuscrito]" no título: é manuscrito (e a marca sai do título)
    const marcaMs = /\s*\[(manuscrito|manuscript|manuscrit|manoscritto|handschrift|ms\.?)\]/i
    const catalogoDizMs = marcaMs.test(dados.titulo || '')
    if (catalogoDizMs) dados.titulo = dados.titulo.replace(marcaMs, '').replace(/\s+:/, ' :').trim()
    const formaFinal = doCatalogo && escolhido.metadados?.forma ? escolhido.metadados.forma.toLowerCase() : catalogoDizMs ? 'manuscrito' : forma
    // (a IA leu como impresso, mas o catálogo da sigla + cota do nome — PEM, Cantus… — descreve um manuscrito: fica manuscrito)
    if (forma === 'impresso' && formaFinal === 'manuscrito' && doCatalogo && nomeComCota) notas.push(notaFormaDoCatalogo(escolhido.fonte))
    if (formaFinal === 'manuscrito' || (formaFinal && (doCatalogo || antiga))) dados.metadados = { ...dados.metadados, forma: formaFinal === 'manuscrito' ? 'Manuscrito' : 'Impresso' }
    // (os valores do catálogo prevalecem sobre os do nome do ficheiro)
    if (sigla) dados.metadados = { sigla: sigla.sigla, arquivo: sigla.instituicao, local_arquivo: sigla.local, ...(cota ? { cota } : {}), ...dados.metadados }
    if (nomeMus.folios && !dados.metadados.folios) dados.metadados.folios = nomeMus.folios
    // A mesma fonte noutras bases (Cantus Database, PEM, SEMM…)
    if (outrosCatalogos.length) dados.metadados.outros_catalogos = outrosCatalogos.join('\n')
    // Outras digitalizações da mesma edição noutras bibliotecas (Europeana; a do próprio exemplar não se repete)
    // (comparado pelos identificadores — "bsb00071914", ark, purl, URN —, também com o exemplar que a ficha já tinha)
    const idsDe = (s) => [/bsb\d{8}/gi, /btv1b\w+|bpt6k\w+/gi, /purl\.pt\/\d+/gi, /urn:nbn:[\w:.-]+/gi].flatMap((re) => String(s || '').match(re) || []).map((x) => x.toLowerCase())
    const proprios = new Set([exemplar?.ligacao, exemplar?.identificador, dados.metadados.urn, dados.metadados.digitalizacao, existente?.metadados?.urn, existente?.metadados?.digitalizacao].flatMap(idsDe))
    const eDoExemplar = (l) => [exemplar?.ligacao, exemplar?.identificador].some((x) => x && l.includes(x)) || idsDe(l).some((x) => proprios.has(x))
    const digitais = outrasDigitalizacoes.filter((l) => !eDoExemplar(l))
    if (digitais.length) dados.metadados.outras_digitalizacoes = [...new Set([dados.metadados.outras_digitalizacoes, ...digitais].filter(Boolean))].join('\n')
    if (exemplar) {
      // O exemplar digitalizado, confirmado na lista de exemplares do RISM quando possível
      const doRism = String(dados.metadados.exemplares || '')
        .split('\n')
        .find((l) => l.includes(`(${exemplar.sigla})`) && (!exemplar.cota || chaveCota('', l.split('), ').pop()) === chaveCota('', exemplar.cota)))
      dados.metadados.exemplar = doRism || [exemplar.biblioteca && (exemplar.sigla ? `${exemplar.biblioteca} (${exemplar.sigla})` : exemplar.biblioteca), exemplar.cota].filter(Boolean).join(', ')
      if (exemplar.ligacao) dados.metadados.digitalizacao = exemplar.ligacao
      if (exemplar.urn) dados.metadados.urn = exemplar.urn
      // (o registo do exemplar no catálogo da biblioteca e a proveniência, se o catálogo a tiver)
      if (exemplar.registo && !dados.metadados.registo_biblioteca) dados.metadados.registo_biblioteca = exemplar.registo
      if (exemplar.proveniencia && !dados.metadados.proveniencia) dados.metadados.proveniencia = exemplar.proveniencia
      // Manuscrito sem sigla no nome do ficheiro: o arquivo e a cota vêm do exemplar
      if (formaFinal === 'manuscrito' && !dados.metadados.sigla && exemplar.sigla) Object.assign(dados.metadados, { sigla: exemplar.sigla, arquivo: exemplar.biblioteca, ...(exemplar.cota ? { cota: exemplar.cota } : {}) })
    }
    if (!String(dados.data || '').trim() && nomeMus.data) dados.data = nomeMus.data
    // (o editor de uma transcrição não é o compositor: o do nome do ficheiro entra à frente dele)
    if (!dados.autores?.some((a) => a.papel !== 'editor') && nomeMus.autor) dados.autores = [pessoa(nomeMus.autor, info.partitura || nomeTipo === 'Partitura' ? 'compositor' : 'autor'), ...(dados.autores || [])].filter(Boolean)
    if (formaFinal === 'manuscrito' && !['Carta', 'Diário'].includes(nomeTipo)) nomeTipoFinal = 'Manuscrito'
    else if (formaFinal === 'impresso' && nomeTipo === 'Manuscrito') nomeTipoFinal = info.partitura || doCatalogo ? 'Partitura' : 'Livro'
    else if (doCatalogo && escolhido.tipo_sugerido === 'Partitura' && !['Livro', 'Tese / dissertação', 'Edição crítica'].includes(nomeTipo)) nomeTipoFinal = 'Partitura'
    if (nomeTipoFinal !== nomeTipo) dados.tipo = (await tipoPorNome(nomeTipoFinal))?.id || dados.tipo
    if (formaFinal === 'manuscrito' || doCatalogo) dados.natureza = 'primária'
    // Manuscrito sem título legível ("Tuy", "45"): identifica-se pela sigla e cota, como é costume
    // (e também um manuscrito fotografado página a página: a IA só lê uma página, muitas vezes uma nota de arquivo)
    // (e sempre que o nome do ficheiro diz o arquivo e a cota: "bguc_mm243" é o P-Cug MM 243, leia a IA o que ler)
    if (!doCatalogo && sigla && cota && (nomeComCota || (!escolhido && formaFinal === 'manuscrito' && (!ia?.titulo || !tituloPlausivel(ia.titulo) || orig)))) {
      if (ia?.titulo && !dados.titulo.startsWith(sigla.sigla) && !notas.some((n) => n.startsWith('A IA leu na 1.ª página'))) notas.push(`A IA leu na 1.ª página: «${ia.titulo}».`)
      // (o resto do nome — compositor, obra, data — fica no título até um catálogo dar o certo)
      const resto = nomeComCota ? restoDoNome(nomeReal, sigla.sigla, cota) : ''
      dados.titulo = `${sigla.sigla} ${cota}${resto ? ` — ${resto}` : ''}`
      if (nomeComCota) semRepor.push('titulo')
      // (compositor em maiúsculas no nome: "Duarte LOBO", "Frei Emanuel CARDOSO" — nome próprio + apelido em maiúsculas —
      // ou só o apelido, se já for compositor conhecido na biblioteca: "VICTORIA", "PALESTRINA")
      if (nomeComCota) {
        const conhecido = await compositorConhecido()
        const comNome = new Set([...String(path.basename(nomeReal, path.extname(nomeReal))).replace(/_/g, ' ').matchAll(/\b\p{Lu}\p{Ll}{2,}(?:\s+\p{Lu}\p{Ll}+)*\s+(\p{Lu}[\p{Lu}'’-]{2,})\b/gu)].map((m) => m[1]))
        // (as letras da cota não são compositores: "P-Lf FSVL 1P H-6")
        const daCota = new Set(String(cota).toUpperCase().split(/[\s.]+/))
        const doNome = maiusculasDoNome(nomeReal).filter((w) => !daCota.has(w.toUpperCase()) && (comNome.has(w) || conhecido(F.semAcentos(w).toLowerCase())))
        const jaTem = (dados.autores || []).some((a) => doNome.some((w) => F.semAcentos(w).toLowerCase() === F.semAcentos(a.apelido || '').toLowerCase()))
        if (doNome.length && !jaTem) {
          if (dados.autores?.length) notas.push(`A IA leu como autor: ${dados.autores.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).join(', ')}; ficou o do nome do ficheiro.`)
          dados.autores = doNome.map((w) => pessoa(w.charAt(0) + w.slice(1).toLowerCase(), 'compositor')).filter(Boolean)
        }
      }
      // (um ano de 1900 em diante no nome de um manuscrito fotografado é o das fotografias: "P-Cug_MM243_2005" →
      // campo próprio «Data das fotografias / digitalização»; a «Data» fica para a da fonte e não é reposta)
      if (nomeComCota && /^(19|20)\d{2}/.test(String(dados.data || ''))) {
        dados.metadados = { ...dados.metadados, data_fotografias: String(dados.data) }
        dados.data = ''
        semRepor.push('data')
      }
      // (sem identificação no RISM/DIAMM fica por rever: o conteúdo vem dos catálogos, não da leitura das fotografias)
      if (dados.estado === 'completo') (dados.estado = 'a_rever'), (dados.candidatos = candidatos)
    }
    // (manuscrito pela sigla e cota do nome, contra a leitura «impresso» da IA: fica por rever, salvo se um catálogo de
    //  manuscritos — PEM, Cantus, DIAMM, registo de manuscrito do RISM — o identificar)
    if (msPelaCota && formaFinal === 'manuscrito') {
      notas.push(`A IA leu como impresso (sem impressor, local nem data de impressão); ficou «Manuscrito» por causa da sigla e da cota no nome do ficheiro (${sigla.variante || sigla.sigla} ${cota}).`)
      const catalogoDeMs = doCatalogo && (/PEM|Cantus|DIAMM/.test(escolhido.fonte) || (/RISM/.test(escolhido.fonte) && escolhido.metadados?.forma === 'Manuscrito'))
      if (!catalogoDeMs && dados.estado === 'completo') (dados.estado = 'a_rever'), (dados.candidatos = candidatos)
    }
    // Sigla no início do nome que o RISM não reconhece: manuscrito identificado pela sigla e cota do nome, por rever
    if (siglaDesconhecida && !doCatalogo) {
      const restoSD = restoDoNome(nomeReal, siglaDesconhecida.texto, siglaDesconhecida.cota)
      dados.titulo = `${siglaDesconhecida.texto}${siglaDesconhecida.cota ? ` ${siglaDesconhecida.cota}` : ''}${restoSD ? ` — ${restoSD}` : ''}`
      semRepor.push('titulo')
      dados.metadados = { ...dados.metadados, forma: 'Manuscrito', ...(siglaDesconhecida.cota && !dados.metadados.cota ? { cota: siglaDesconhecida.cota } : {}) }
      if (nomeTipoFinal !== 'Manuscrito' && !['Carta', 'Diário'].includes(nomeTipo)) {
        nomeTipoFinal = 'Manuscrito'
        dados.tipo = (await tipoPorNome('Manuscrito'))?.id || dados.tipo
      }
      dados.natureza = 'primária'
      notas.push(`Sigla «${siglaDesconhecida.texto}» não reconhecida no RISM${siglaDesconhecida.possiveis.length ? ` (pode ser: ${siglaDesconhecida.possiveis.join(', ')})` : ''}: tratada como manuscrito com a cota do nome do ficheiro.`)
      if (dados.estado === 'completo') (dados.estado = 'a_rever'), (dados.candidatos = candidatos)
    }
    // (variante da sigla no nome — "P-BRd" — lida como a sigla do RISM: fica dito na nota, sem pôr a ficha por rever)
    if (sigla?.variante) {
      const aviso = `Sigla do nome «${sigla.variante}» lida como ${sigla.sigla} (${sigla.instituicao}, ${sigla.local}).`
      if (!String(dados.metadados.nota_revisao || '').includes(aviso)) dados.metadados = { ...dados.metadados, nota_revisao: [dados.metadados.nota_revisao, aviso].filter(Boolean).join(' ') }
    }
    // (o OCR não lê letra manuscrita nem notas: não vale as horas que demora)
    if (nomeTipoFinal === 'Manuscrito') dados.ocr_estado = 'nao_aplicavel'
  }

  // Obra com número de catálogo (BWV, K., HWV, RV, op.…): título normalizado do IMSLP.
  // (não nos impressos antigos identificados no RISM: aí o título é o da própria fonte)
  if (musical && ['Partitura', 'Manuscrito'].includes(nomeTipoFinal) && !CATALOGOS_FONTES.test(escolhido?.fonte || '') && defs.enriquecimento_auto !== false) {
    const comp = compositorDe(dados.autores)
    const md = dados.metadados || {}
    // (um conjunto de números, "BWV 772–786", é uma coleção: fica o título impresso)
    const cat = eIntervalo(md.catalogo) ? null : catalogoDe(md.catalogo) || catalogoPeloNome(nomeReal, comp ? comp.apelido : /^\s*BWV/i.test(md.catalogo_ia || '') ? 'Bach' : '') || catalogoDe(nomeReal) || catalogoDe(dados.titulo)
    if (cat || md.catalogo_ia) {
      try {
        if (cat) {
          const obra = await obraPorCatalogo(cat, comp?.apelido, defs.email_contacto, comp?.nome)
          if (obra && obraCompativel(dados.titulo, obra, cat)) Object.assign(dados, aplicarObra(dados, obra, cat))
          // (a sugestão da IA que coincide com o número confirmado já não é precisa)
          if (dados.metadados?.catalogo_ia && catalogoDe(dados.metadados.catalogo_ia)?.codigo === cat.codigo) {
            dados.metadados = { ...dados.metadados }
            delete dados.metadados.catalogo_ia
          }
        } else {
          // Número só da IA: aceita-se se a obra do IMSLP bater com o título impresso
          const catIa = eIntervalo(md.catalogo_ia) ? null : catalogoDe(md.catalogo_ia)
          const obra = catIa && (await obraPorCatalogo(catIa, comp?.apelido, defs.email_contacto, comp?.nome))
          if (obra && obraPlausivel(dados.titulo, obra, catIa)) {
            dados.metadados = { ...md, catalogo: md.catalogo_ia }
            delete dados.metadados.catalogo_ia
            Object.assign(dados, aplicarObra(dados, obra, catIa))
          }
        }
      } catch (e) {
        log.aviso(`IMSLP (título normalizado): ${e.message}`)
      }
    }
  }

  // Bases de compositores (Bach digital…): as fontes conhecidas desta obra (arquivo, cota, autógrafo ou cópia, datação)
  if (musical && ['Partitura', 'Manuscrito', 'Edição crítica'].includes(nomeTipoFinal) && defs.enriquecimento_auto !== false) {
    const md = dados.metadados || {}
    const cat = eIntervalo(md.catalogo) ? null : catalogoDe(md.catalogo) || (eIntervalo(dados.titulo) ? null : catalogoDe(dados.titulo))
    if (cat) {
      try {
        const f = await fontesConhecidas(cat.codigo, defs.email_contacto)
        if (f?.linhas.length) {
          dados.metadados = { ...md, fontes_conhecidas: `${f.base} (${f.linhas.length}):\n${f.linhas.join('\n')}` }
          const ligacao = `${f.base} (${cat.codigo}): ${f.url}`
          if (!String(md.outros_catalogos || '').includes(f.url)) dados.metadados.outros_catalogos = [md.outros_catalogos, ligacao].filter(Boolean).join('\n')
        }
      } catch (e) {
        log.aviso(`Fontes conhecidas de ${cat.codigo}: ${e.message}`)
      }
    }
  }

  // Transcrições (MIDI, Finale, MusicXML…): o nome "rossi_1608_9" dá o compositor e o ano; com eles,
  // o livro de onde vêm (o PDF já na biblioteca, ou o impresso único desse ano no RISM)
  let livro = null
  const formatoNotacao = categoria === 'partitura' ? formatoDe(caminho) : ''
  if (formatoNotacao) {
    const n = 1 + (fonte.ficheiros_extra?.length || 0)
    const chave = eMidi(caminho) ? chaveLote(nomeReal) : ''
    const anoNome = /^\d{4}$/.test(String(info.ano || '')) ? String(info.ano) : ''
    // (1.º o PDF da coleção com o mesmo nome de ficheiro, "fluythemel.pdf"; depois compositor + ano)
    if (!escolhido && !previa && chave) {
      try {
        livro = await livroPeloNome(chave, { excluirId: fonte.id })
      } catch (_) {}
      if (livro?.ambiguo) livro = null
    }
    if (!livro && !escolhido && !previa && apelido && anoNome && defs.enriquecimento_auto !== false) {
      try {
        livro = await livroDoCompositor({ apelido, ano: anoNome, chave }, { email: defs.email_contacto, excluirId: fonte.id })
      } catch (e) {
        log.aviso(`Livro de «${nomeOriginal}» no RISM: ${e.message}`)
      }
    }
    const campos = camposDaTranscricao(dados, livro, { formato: formatoNotacao, n, chave, numero: numeroNoLote(nomeReal) })
    if (campos.candidatos && !livro?.titulo) campos.candidatos = [...campos.candidatos, ...(dados.candidatos || [])].slice(0, 10)
    Object.assign(dados, campos)
  }
  // (numa reanálise, a ligação às transcrições desta fonte não se perde)
  for (const k of ['transcricao_midi', 'transcricao']) if (existente?.metadados?.[k]) dados.metadados = { ...dados.metadados, [k]: existente.metadados[k] }
  // (e às imagens originais, se é um PDF de visualização)
  const originais = juntarOriginais(existente?.metadados?.originais, orig?.originais)
  if (originais) dados.metadados = { ...dados.metadados, originais, originais_conjunto: juntarOriginais(existente?.metadados?.originais_conjunto, orig?.conjunto) }

  // Identificada no IMSLP: a página da obra diz se é coleção ou obra, quem é o impressor (e se o nome entre
  // parênteses é o dele e não o do compositor) e a edição do exemplar
  if (/imslp\.org\/wiki\//.test(dados.url || '') && categoria === 'pdf' && defs.enriquecimento_auto !== false) {
    try {
      const pagina = await imslpPagina(dados.url, defs.email_contacto)
      if (pagina) Object.assign(dados, correcoesImslp({ ...dados, ficheiro_original: nomeReal }, pagina, { conhecido: await compositorConhecido() }).alt)
    } catch (e) {
      log.aviso(`IMSLP (página da obra): ${e.message}`)
    }
  }
  if (info.local && !dados.local) dados.local = info.local
  // Trabalhos académicos (teses, artigos…): o compositor que aparece no título é o assunto, não o autor; «intérprete»
  // num texto é o autor; e a reanálise não troca o autor que a ficha tinha pelo compositor que a IA leu
  // (avisos: ficam na nota, mas não põem a ficha «por rever»)
  const avisos = []
  if (TIPOS_ACADEMICOS.includes((await tipoPorId(dados.tipo))?.nome || nomeTipoFinal)) {
    const r = autoresAcademicos(dados.autores, { titulo: dados.titulo, antigos: existente?.autores })
    dados.autores = r.autores
    avisos.push(...r.notas)
  }
  // Reanálise: não esvaziar campos nem trocar o que veio de um catálogo por uma leitura da IA
  let protegida = false
  if (existente) {
    // (identificação antiga por um registo de manuscrito num PDF que é uma edição moderna — «006507.pdf», edição de 2004,
    //  «identificada» como o autógrafo de Bach —: também não volta)
    const antigaManuscritoErrado = CATALOGOS_FONTES.test(existente.origem || '') && !nomeComCota && existente.metadados?.forma !== 'Manuscrito' && registoManuscrito({ metadados: existente.metadados }) && edicaoModernaPara({ data: existente.data }, { forma, anoLido: anoPista || info.ano })
    const recusada = (fotografada && CATALOGOS_MODERNOS.test(existente.origem || '')) || antigaManuscritoErrado
    if (recusada) notas.push(`Identificação anterior não aceite (${existente.origem}): «${existente.titulo}»${existente.data ? `, ${existente.data}` : ''}.`)
    const letrasDaCota = new Set(String(cota || '').toUpperCase().split(/[\s.]+/).filter(Boolean))
    const autorInvalido = (a) => ((fotografada || donoDigitalizou) && eDoDono(a)) || (nomeComCota && letrasDaCota.has(String(a.apelido || a.literal || '').toUpperCase()))
    const p = protegerReanalise(existente, dados, { novaDeCatalogo: !!escolhido, recusada, semRepor, autorInvalido })
    Object.assign(dados, p.dados)
    protegida = p.deCatalogo
      if (p.deCatalogo && p.mantidos.includes('titulo')) {
      // (o título é o do catálogo, não o da 1.ª peça: o aviso de "coleção sem frontispício" não se aplica)
      if (semFrontispicio && !existente.metadados?.nota_revisao) delete dados.metadados.nota_revisao
      semFrontispicio = false
    }
    if (p.mantidos.length) log.info(`Reanálise de «${dados.titulo}»: mantido o que já tinha (${p.mantidos.join(', ')})${p.deCatalogo ? ` — veio de ${existente.origem}` : ''}`)
  }
  // (o dono como editor de uma transcrição dele não se perde com os autores que um catálogo ou o nome do ficheiro deram)
  const editorDono = autoresFicheiro.find((a) => eDoDono(a) && a.papel === 'editor')
  if (editorDono && !(dados.autores || []).some(eDoDono)) dados.autores = [...(dados.autores || []), editorDono]
  // O que a IA ou um catálogo disseram e não foi aceite fica escrito na nota para rever (e a ficha por rever)
  // (numa reanálise a nota antiga já pode ter a mesma frase: não se repete)
  const notasNovas = [...new Set(notas)].filter((n) => !String(dados.metadados?.nota_revisao || '').includes(n))
  if (notasNovas.length) {
    dados.metadados = { ...dados.metadados, nota_revisao: [dados.metadados?.nota_revisao, ...notasNovas].filter(Boolean).join(' ') }
    if (dados.estado === 'completo' && !escolhido) (dados.estado = 'a_rever'), (dados.candidatos = candidatos)
  }
  // Coleção sem frontispício (título da 1.ª peça) e sem identificação num catálogo: fica por rever
  if (semFrontispicio && !escolhido && dados.estado === 'completo') {
    dados.estado = 'a_rever'
    dados.candidatos = candidatos
  }

  // Só fica completa com título, autor (ou «Anónimo» / «Vários») e data, pelo menos aproximada
  // (exceto uma edição moderna identificada pelo IMSLP a quem só falta a data da edição: completa, com nota — Pedro, 2/10)
  if (dados.estado === 'completo' && (!String(dados.data || '').trim() || !dados.autores?.length)) {
    const soFaltaData = dados.autores?.length && !antiga && ['Partitura', 'Edição crítica'].includes(nomeTipoFinal) && (dados.metadados?.imslp || /IMSLP/.test(`${escolhido?.fonte || ''} ${dados.origem || ''}`))
    if (soFaltaData) avisos.push('Sem data da edição (edição moderna identificada pelo IMSLP).')
    else {
      dados.estado = 'a_rever'
      dados.candidatos = candidatos
    }
  }
  // Forma e suporte que se contradizem («Impresso» e «Manuscrito autógrafo»): nunca completa
  const contradicao = contradicaoForma(dados.metadados)
  if (contradicao) {
    avisos.push(`Dados contraditórios: ${contradicao}.`)
    dados.estado = 'a_rever'
    dados.candidatos = candidatos
  }
  // Reanálise de uma ficha completa que veio de um catálogo (ou do Mendeley) e que ficou com os mesmos dados: continua
  // completa — uma sugestão recusada ou uma pesquisa que desta vez não encontrou nada só deixam nota (Pedro, 2/10)
  if (existente && continuaCompleta({ estadoAntes, protegida, dados, contradicao, dataAntiga: existente.data })) {
    dados.estado = 'completo'
    dados.candidatos = []
  }
  const avisosNovos = [...new Set(avisos)].filter((n) => !String(dados.metadados?.nota_revisao || '').includes(n))
  if (avisosNovos.length) dados.metadados = { ...dados.metadados, nota_revisao: [dados.metadados?.nota_revisao, ...avisosNovos].filter(Boolean).join(' ') }
  // (o estado guardado antes da reanálise sai da ficha)
  if (dados.metadados) delete dados.metadados[CHAVE_ESTADO_ANTES]
  const pc = await palavrasChave(info, escolhido, dados.titulo, ia)
  if (pc.lista.length && !dados.palavras_chave?.length) {
    dados.palavras_chave = pc.lista
    dados.metadados = { ...dados.metadados, palavras_chave_origem: pc.origem }
  }

  // A mesma obra já tem outro ficheiro (outra cópia/digitalização)? Pôr esta cópia de parte.
  // (uma transcrição identificada pelo livro não é outra cópia dele, nem a ficha do impresso vinda do Mendeley)
  const gemea = !existente && !livro?.titulo && !orig && (await mesmaObraComFicheiro(dados, fonte.id))
  if (gemea) {
    await pb.collection('fontes').delete(fonte.id)
    const destino = await F.mover(caminho, path.join(PASTAS.biblioteca, DUPLICADOS), nomeOriginal)
    log.aviso(`Outra cópia de «${gemea.titulo}» (#${String(gemea.numero || '').padStart(4, '0')}): movida para ${relativo(destino)}`)
    await F.limparPastasVazias(path.dirname(caminho), raiz)
    return
  }

  // Já existe esta obra sem ficheiro (ex.: importada do Mendeley)? Associar em vez de duplicar.
  const alvo = previa || (!livro?.titulo && (await obraExistente(dados, fonte.id)))
  if (alvo) {
    const junta = { ficheiro_original: nomeReal, hash, paginas: dados.paginas, ocr_estado: dados.ocr_estado }
    if (!alvo.autores?.length && dados.autores.length) junta.autores = dados.autores
    for (const k of ['data', 'editora', 'doi', 'isbn', 'url']) if (!alvo[k] && dados[k]) junta[k] = dados[k]
    junta.metadados = { ...semVazios(dados.metadados), ...(alvo.metadados || {}) }
    // (a chave do estado antes da reanálise só fica numa ficha que ainda está «A processar»)
    if (alvo.estado !== 'processando') delete junta.metadados[CHAVE_ESTADO_ANTES]
    if (originais) Object.assign(junta.metadados, { originais: juntarOriginais(alvo.metadados?.originais, originais), originais_conjunto: juntarOriginais(alvo.metadados?.originais_conjunto, dados.metadados.originais_conjunto) })
    if (!alvo.palavras_chave?.length && dados.palavras_chave?.length) junta.palavras_chave = dados.palavras_chave
    // Título do Mendeley que é lixo ("Unknown Unknown…", "judy-tarling-the-weapons…"): usar o lido do ficheiro
    const identificado = escolhido || capaSegura || iaVerificada
    if (tituloLixo(alvo.titulo) && identificado && dados.titulo && !tituloLixo(dados.titulo)) junta.titulo = dados.titulo
    // Fica completa se, depois de juntar, tiver título, autor e ano
    const fica = { ...alvo, ...junta }
    if (alvo.estado === 'a_rever' && fica.titulo && !tituloLixo(fica.titulo) && fica.autores?.length && fica.data) {
      junta.estado = 'completo'
      junta.candidatos = []
    }
    // O tipo dado pelo Mendeley é muitas vezes errado: corrigir quando o ficheiro é claro
    // (capa de tese, ou identificação exata por DOI/ISBN)
    if (dados.tipo && dados.tipo !== alvo.tipo && (info.tese || info.partitura || (escolhido && escolhido.confianca >= 0.95))) junta.tipo = dados.tipo
    // (numa reanálise, a fonte antiga pode ter notas de leitura e ficheiros adicionais: passam para a fonte que fica)
    if (existente?.ficheiros_extra?.length) junta.ficheiros_extra = [...(alvo.ficheiros_extra || []), ...existente.ficheiros_extra]
    if (existente) {
      for (const n of await pb.collection('notas_leitura').getFullList({ filter: pb.filter('fonte = {:f}', { f: fonte.id }), fields: 'id' })) {
        await pb.collection('notas_leitura').update(n.id, { fonte: alvo.id })
      }
    }
    await pb.collection('fontes').delete(fonte.id)
    fonte = await pb.collection('fontes').update(alvo.id, junta, { expand: 'tipo' })
    log.info(`Ficheiro associado à fonte já existente «${fonte.titulo}»`)
  } else {
    fonte = await pb.collection('fontes').update(fonte.id, dados, { expand: 'tipo' })
  }

  // Renomear e mover segundo os metadados finais
  const tipoNome = fonte.expand?.tipo?.nome
  const subpasta = fonte.estado === 'completo' ? F.pastaDestino(defs.padrao_pastas, fonte, tipoNome) : POR_REVER
  const final = await F.mover(caminho, path.join(PASTAS.biblioteca, subpasta), nomePrincipal(defs, fonte, tipoNome, ext))
  const extras = await arrumarExtras(fonte, subpasta, defs, tipoNome)
  fonte = await pb.collection('fontes').update(fonte.id, { ficheiro: relativo(final), ...(extras ? { ficheiros_extra: extras } : {}) })
  if (info.texto) {
    try {
      await guardarTexto(fonte.id, info.texto, categoria === 'pdf' ? 'pdf' : 'manual')
    } catch (e) {
      log.aviso(`Texto integral de «${fonte.titulo}» não guardado: ${e.message}`)
    }
  }
  await F.limparPastasVazias(path.dirname(caminho), raiz)

  log.info(fonte.estado === 'completo' ? `Organizado (${escolhido?.fonte || fonte.origem}): ${fonte.ficheiro}` : `Por rever: ${fonte.ficheiro}`)
  if (livro?.ficha) {
    try {
      await ligarAoLivro(livro.ficha.numero, fonte, { n: 1 + (fonte.ficheiros_extra?.length || 0), formato: formatoNotacao })
    } catch (e) {
      log.aviso(`Ligação ao livro ${livro.ficha.numero}: ${e.message}`)
    }
  }
  if (info.precisaOcr) cicloOcr()
}

// Mais um ficheiro de um lote (peça de uma coleção): passa a ficheiro adicional da ficha do lote,
// que fica com o título no plural e o nº de ficheiros atualizado
async function juntarAoLote(lote, caminho, hash, nomeOriginal, raiz) {
  const destinoDir = path.dirname(path.join(PASTAS.biblioteca, lote.ficheiro))
  const movido = await F.mover(caminho, destinoDir, nomeOriginal)
  const rotulo = path.basename(nomeOriginal, path.extname(nomeOriginal)).slice(0, 60)
  const extra = [...(lote.ficheiros_extra || []), { ficheiro: relativo(movido), rotulo, hash, original: nomeOriginal }]
  const n = 1 + extra.length
  const formato = formatoDe(nomeOriginal)
  const campos = camposDaTranscricao(lote, null, { formato, n, chave: chaveLote(nomeOriginal) })
  // (título dado à mão numa ficha já confirmada: não se mexe)
  if (lote.estado === 'completo' && !/\s—\stranscriç/i.test(lote.titulo || '')) delete campos.titulo
  await pb.collection('fontes').update(lote.id, { titulo: campos.titulo || lote.titulo, metadados: campos.metadados, ficheiros_extra: extra })
  const final = await reorganizar(lote.id)
  await F.limparPastasVazias(path.dirname(caminho), raiz)
  log.info(`Mais uma peça do lote «${final.titulo}» (${numeroFicha(final.numero)}): ${nomeOriginal} (${n} ficheiros)`)
  const livro = livroDaFicha(final)
  if (livro) await ligarAoLivro(livro, final, { n, formato }).catch((e) => log.aviso(`Ligação ao livro ${livro}: ${e.message}`))
}
const numeroFicha = (n) => '#' + String(n || '').padStart(4, '0')

const nomesAlternativos = (f) => String(f.metadados?.nomes_alternativos || '').split(' | ').filter(Boolean)

// ---------------------------------------------------------------------------
// Vários ficheiros por fonte (livros de partes, obras em vários volumes): o principal fica em
// "ficheiro", os outros em "ficheiros_extra" [{ ficheiro, rotulo, hash, original }]

async function donoDoFicheiroExtra(hash) {
  try {
    return await pb.collection('fontes').getFirstListItem(pb.filter('ficheiros_extra ~ {:h}', { h: hash }))
  } catch (_) {
    return null
  }
}

// "…_SADIE_The-New-Grove.doc" + rótulo "B" → "…_SADIE_The-New-Grove_B.doc"
function comRotulo(nome, rotulo) {
  const r = F.seguro(String(rotulo || '')).slice(0, 40)
  if (!r) return nome
  const ext = path.extname(nome)
  return `${nome.slice(0, nome.length - ext.length)}_${r}${ext}`
}

// Os ficheiros adicionais acompanham o principal: mesma pasta, mesmo nome com o rótulo no fim
async function arrumarExtras(f, subpasta, defs, tipoNome) {
  const extra = f.ficheiros_extra || []
  if (!extra.length) return null
  const nova = []
  for (const x of extra) {
    const abs = path.join(PASTAS.biblioteca, x.ficheiro)
    if (!fs.existsSync(abs)) {
      nova.push(x)
      continue
    }
    const final = await F.mover(abs, path.join(PASTAS.biblioteca, subpasta), comRotulo(F.nomeFicheiro(defs.padrao_nome, f, tipoNome, path.extname(abs)), x.rotulo))
    if (relativo(final) !== x.ficheiro) await F.limparPastasVazias(path.dirname(abs), PASTAS.biblioteca)
    nova.push({ ...x, ficheiro: relativo(final) })
  }
  return nova
}

const rotuloDe = (f) => {
  const nome = path.basename(f.ficheiro_original || f.ficheiro || '')
  return nome.slice(0, nome.length - path.extname(nome).length).slice(0, 60)
}

// Com vários ficheiros, também o principal leva o seu rótulo ("…_A.doc", "…_Cantus.pdf")
const nomePrincipal = (defs, f, tipoNome, ext) => {
  const nome = F.nomeFicheiro(defs.padrao_nome, f, tipoNome, ext)
  return f.ficheiros_extra?.length ? comRotulo(nome, rotuloDe(f)) : nome
}

// Junta outras fichas a esta: os ficheiros delas passam a ficheiros adicionais desta, as notas de
// leitura e as etiquetas também passam, e as outras fichas são apagadas (os ficheiros nunca)
export async function juntarFichas(destinoId, origemIds) {
  await garantirSessao()
  const destino = await pb.collection('fontes').getOne(destinoId)
  const origens = []
  for (const id of [...new Set(origemIds)].filter((id) => id && id !== destinoId)) origens.push(await pb.collection('fontes').getOne(id))
  if (!origens.length) throw new Error('Escolha pelo menos uma outra ficha para juntar.')
  for (const f of [destino, ...origens]) {
    if (f.estado === 'processando') throw new Error(`A ficha #${String(f.numero).padStart(4, '0')} está a ser processada. Tente daqui a pouco.`)
  }
  const extra = [...(destino.ficheiros_extra || [])]
  const tags = new Set(destino.tags || [])
  const junta = {}
  for (const o of origens) {
    if (o.ficheiro) {
      if (!destino.ficheiro && !junta.ficheiro) Object.assign(junta, { ficheiro: o.ficheiro, ficheiro_original: o.ficheiro_original, hash: o.hash })
      else extra.push({ ficheiro: o.ficheiro, rotulo: rotuloDe(o), hash: o.hash || '', original: o.ficheiro_original || '' })
    }
    extra.push(...(o.ficheiros_extra || []))
    ;(o.tags || []).forEach((t) => tags.add(t))
  }
  // Ligações que passam para a ficha que fica: imagens originais e transcrições MIDI (os lotes passam a herdar dela)
  const md = { ...(destino.metadados || {}) }
  const refs = (v) => String(v || '').match(/#\d+/g) || []
  for (const o of origens) {
    const mo = o.metadados || {}
    if (mo.originais) Object.assign(md, { originais: juntarOriginais(md.originais, mo.originais), originais_conjunto: juntarOriginais(md.originais_conjunto, mo.originais_conjunto) })
    for (const k of ['transcricao_midi', 'transcricao']) if (mo[k]) md[k] = md[k] ? [...new Set([...refs(md[k]), ...refs(mo[k])])].join(', ') : mo[k]
  }
  // (primeiro gravar a ficha que fica; só depois apagar as outras: nunca há ficheiros sem ficha)
  await pb.collection('fontes').update(destinoId, { ...junta, ficheiros_extra: extra, tags: [...tags], metadados: md })
  const numeroDestino = `#${String(destino.numero).padStart(4, '0')}`
  for (const o of origens) {
    for (const n of await pb.collection('notas_leitura').getFullList({ filter: pb.filter('fonte = {:f}', { f: o.id }), fields: 'id' })) {
      await pb.collection('notas_leitura').update(n.id, { fonte: destinoId })
    }
    for (const h of await pb.collection('fontes').getFullList({ filter: pb.filter('metadados.herdado_de = {:n}', { n: `#${String(o.numero).padStart(4, '0')}` }), fields: 'id,metadados' })) {
      await pb.collection('fontes').update(h.id, { metadados: { ...h.metadados, herdado_de: numeroDestino } })
    }
    await pb.collection('fontes').delete(o.id)
  }
  log.info(`${origens.length} fichas juntadas a «${destino.titulo}» (#${String(destino.numero).padStart(4, '0')}): ${origens.map((o) => '#' + String(o.numero).padStart(4, '0')).join(', ')}`)
  return reorganizar(destinoId)
}

// Tira um ficheiro adicional de uma ficha e dá-lhe uma ficha própria (por rever)
export async function separarFicheiro(id, indice) {
  await garantirSessao()
  const f = await pb.collection('fontes').getOne(id)
  const extra = [...(f.ficheiros_extra || [])]
  const x = extra[indice]
  if (!x) throw new Error('Ficheiro não encontrado nesta ficha.')
  extra.splice(indice, 1)
  const nova = await pb.collection('fontes').create({
    titulo: x.rotulo || path.basename(x.ficheiro),
    tipo: f.tipo,
    estado: 'a_rever',
    ficheiro: x.ficheiro,
    ficheiro_original: x.original || path.basename(x.ficheiro),
    hash: x.hash || (fs.existsSync(path.join(PASTAS.biblioteca, x.ficheiro)) ? await F.hashFicheiro(path.join(PASTAS.biblioteca, x.ficheiro)) : ''),
    ocr_estado: 'nao_aplicavel',
    origem: 'ficheiro',
  })
  await pb.collection('fontes').update(id, { ficheiros_extra: extra })
  log.info(`Ficheiro separado de «${f.titulo}»: nova ficha #${String(nova.numero).padStart(4, '0')} (por rever)`)
  return nova
}

// Um ficheiro repetido pode trazer no nome mais informação do que o original ("17xx Bach Partita la m
// flauta BWV 1013" em vez de "facsimile de partita de bach"): guardar esse nome na fonte que já existe
// e, se ela está por rever, reanalisá-la já com ele
async function aproveitarNomeDoRepetido(existente, nome) {
  const atual = melhorNome([existente.ficheiro_original, ...nomesAlternativos(existente)], catalogoDe)
  if (informacaoDoNome(nome, catalogoDe) <= informacaoDoNome(atual, catalogoDe)) return
  const nomes = [...new Set([...nomesAlternativos(existente), nome])].slice(-5)
  await pb.collection('fontes').update(existente.id, { metadados: { ...(existente.metadados || {}), nomes_alternativos: nomes.join(' | ') } })
  log.info(`O repetido tem um nome mais informativo («${nome}»): guardado em «${existente.titulo}»`)
  if (existente.estado === 'a_rever') await reanalisar(existente.id, { prioritario: true })
}

// Reanalisar uma fonte com ficheiro (aplica as regras e a IA mais recentes)
export async function reanalisar(id, { prioritario = false } = {}) {
  await garantirSessao()
  const f = await pb.collection('fontes').getOne(id)
  if (!f.ficheiro) throw new Error('Esta fonte não tem ficheiro para reanalisar.')
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  if (!fs.existsSync(abs)) throw new Error(`Ficheiro não encontrado: ${f.ficheiro}`)
  // (o estado anterior fica guardado: a regra «ficha completa de catálogo continua completa» precisa dele)
  const alteracoes = { estado: 'processando', candidatos: [], metadados: marcarReanalise(f.estado, f.metadados) }
  if (!f.hash) alteracoes.hash = await F.hashFicheiro(abs)
  await pb.collection('fontes').update(id, alteracoes)
  filaEntrada.juntar(abs, { confirmado: true, prioritario })
  return { ok: true }
}

// Reanalisar todas as fontes por rever que tenham ficheiro
export async function reanalisarPorRever() {
  await garantirSessao()
  const lista = await pb.collection('fontes').getFullList({ filter: "estado = 'a_rever' && ficheiro != ''", fields: 'id' })
  for (const f of lista) {
    try {
      await reanalisar(f.id)
    } catch (e) {
      log.aviso(`Reanálise: ${e.message}`)
    }
  }
  log.info(`Reanálise: ${lista.length} fontes por rever em fila`)
  return { fontes: lista.length }
}

// Voltar a ler os ficheiros que já estão na biblioteca (ex.: depois de reconstruir a base de dados)
export async function relerBiblioteca() {
  const lista = []
  const percorrer = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue
      const p = path.join(dir, d.name)
      if (d.isDirectory()) {
        if (![DUPLICADOS, ORIGINAIS].map((d) => path.join(PASTAS.biblioteca, d)).includes(p)) percorrer(p)
      } else lista.push(p)
    }
  }
  percorrer(PASTAS.biblioteca)
  lista.forEach((p) => filaEntrada.juntar(p, { confirmado: true }))
  log.info(`Releitura da biblioteca: ${lista.length} ficheiros em fila`)
  return { ficheiros: lista.length }
}

export const filaEntrada = criarFila('Entrada', processarFicheiro)

// Ao arrancar: fontes que ficaram "A processar" porque o serviço parou a meio (a fila só existe
// enquanto o serviço corre) voltam para a fila. As da watch folder são retomadas pela própria vigia.
export async function retomarInterrompidas() {
  await garantirSessao()
  const lista = await pb.collection('fontes').getFullList({ filter: "estado = 'processando' && ficheiro != ''", fields: 'id,ficheiro', sort: 'updated' })
  let emFalta = 0
  for (const f of lista) {
    const abs = path.join(PASTAS.biblioteca, f.ficheiro)
    if (fs.existsSync(abs)) filaEntrada.juntar(abs, { confirmado: true })
    else emFalta++
  }
  if (lista.length) log.info(`Retomadas ${lista.length - emFalta} fontes que tinham ficado «A processar»${emFalta ? ` (${emFalta} sem ficheiro na biblioteca)` : ''}`)
}

// ---------------------------------------------------------------------------
// OCR em segundo plano (um documento de cada vez)

let ocrAtivo = false
const INTERROMPIDO = 'interrompido pela intensidade'
export let ocrAtual = null

export async function cicloOcr() {
  if (ocrAtivo) return
  ocrAtivo = true
  try {
    for (;;) {
      await garantirSessao()
      const defs = await definicoes()
      if (defs.ocr_ativo === false) break
      // (em poupança ou pausa o OCR espera: é o trabalho mais pesado e o menos urgente)
      if (emPoupanca() || emPausa()) break
      let f
      try {
        // Só fontes já identificadas (as "por rever" esperam: o OCR não é preciso para as identificar)
        f = await pb.collection('fontes').getFirstListItem("ocr_estado = 'pendente' && estado = 'completo'", { sort: 'created', expand: 'tipo' })
      } catch (_) {
        break
      }
      if (f.expand?.tipo?.nome === 'Partitura') {
        await pb.collection('fontes').update(f.id, { ocr_estado: 'nao_aplicavel' })
        continue
      }
      const abs = f.ficheiro ? path.join(PASTAS.biblioteca, f.ficheiro) : ''
      const categoria = abs ? F.categoriaPorExtensao(abs) : ''
      if (!abs || !fs.existsSync(abs) || !['pdf', 'imagem'].includes(categoria)) {
        await pb.collection('fontes').update(f.id, { ocr_estado: abs && fs.existsSync(abs) ? 'nao_aplicavel' : 'erro' })
        if (!abs || !fs.existsSync(abs)) log.erro(`OCR: ficheiro em falta para «${f.titulo}»`)
        continue
      }
      await pb.collection('fontes').update(f.id, { ocr_estado: 'em_curso' })
      ocrAtual = { id: f.id, titulo: f.titulo, pagina: 0, total: f.paginas || 1 }
      log.info(`OCR iniciado: «${f.titulo}»`)
      try {
        let texto
        if (categoria === 'pdf') {
          const paginas = f.paginas || (await X.pdfInfo(abs)).paginas || 1
          ocrAtual.total = paginas
          texto = await ocrPdf(abs, defs.linguas_ocr, {
            paginas,
            aoProgresso: (p) => {
              ocrAtual.pagina = p
              if (emPoupanca() || emPausa()) throw new Error(INTERROMPIDO)
            },
          })
        } else {
          texto = await ocrImagem(abs, defs.linguas_ocr)
        }
        await guardarTexto(f.id, texto, 'ocr')
        const alteracoes = { ocr_estado: 'feito' }
        if (!f.palavras_chave?.length) {
          const pc = gerarPalavrasChave(texto, f.titulo)
          if (pc.length) {
            alteracoes.palavras_chave = pc
            alteracoes.metadados = { ...(f.metadados || {}), palavras_chave_origem: 'automáticas' }
          }
        }
        await pb.collection('fontes').update(f.id, alteracoes)
        log.info(`OCR concluído: «${f.titulo}» (${texto.length} caracteres)`)
      } catch (e) {
        // (mudou-se para poupança ou pausa a meio: o documento volta para a fila)
        if (e.message === INTERROMPIDO) {
          await pb.collection('fontes').update(f.id, { ocr_estado: 'pendente' })
          log.info(`OCR interrompido (intensidade): «${f.titulo}» volta para a fila`)
          break
        }
        await pb.collection('fontes').update(f.id, { ocr_estado: 'erro' })
        log.erro(`OCR falhou em «${f.titulo}»: ${e.message}`)
      } finally {
        ocrAtual = null
      }
    }
  } finally {
    ocrAtivo = false
  }
}

// ---------------------------------------------------------------------------
// Ações pedidas pela interface

// Renomeia e move o ficheiro segundo os metadados atuais (e opcionalmente muda o estado).
export async function reorganizar(id, { estado } = {}) {
  await garantirSessao()
  const f = await pb.collection('fontes').getOne(id, { expand: 'tipo' })
  const alteracoes = {}
  if (estado) {
    alteracoes.estado = estado
    if (estado === 'completo') alteracoes.candidatos = []
  }
  if (f.ficheiro) {
    const defs = await definicoes()
    const abs = path.join(PASTAS.biblioteca, f.ficheiro)
    if (!fs.existsSync(abs)) throw new Error(`Ficheiro não encontrado: ${f.ficheiro}`)
    const tipoNome = f.expand?.tipo?.nome
    const alvoEstado = estado || f.estado
    const subpasta = alvoEstado === 'completo' ? F.pastaDestino(defs.padrao_pastas, f, tipoNome) : POR_REVER
    const final = await F.mover(abs, path.join(PASTAS.biblioteca, subpasta), nomePrincipal(defs, f, tipoNome, path.extname(abs)))
    alteracoes.ficheiro = relativo(final)
    if (alteracoes.ficheiro !== f.ficheiro) {
      await F.limparPastasVazias(path.dirname(abs), PASTAS.biblioteca)
      log.info(`Reorganizado: ${f.ficheiro} → ${alteracoes.ficheiro}`)
    }
    const extras = await arrumarExtras(f, subpasta, defs, tipoNome)
    if (extras) alteracoes.ficheiros_extra = extras
  }
  return pb.collection('fontes').update(id, alteracoes)
}

// Pesquisa alargada em todas as fontes externas; guarda os candidatos na fonte.
export async function aprofundar(id) {
  await garantirSessao()
  const f = await pb.collection('fontes').getOne(id)
  const defs = await definicoes()
  const interprete = (f.autores || []).find((a) => a.papel === 'intérprete')
  const artista = interprete ? interprete.literal || [interprete.nome, interprete.apelido].filter(Boolean).join(' ') : ''
  const r = await E.aprofundado({ titulo: f.titulo, autor: f.autor_principal, artista, doi: f.doi, isbn: f.isbn }, defs)
  await pb.collection('fontes').update(id, { candidatos: r.candidatos })
  log.info(`Pesquisa aprofundada: «${f.titulo}» — ${r.candidatos.length} resultados`)
  return r
}

// Aplica um candidato escolhido pelo utilizador.
export async function aplicar(id, candidato) {
  await garantirSessao()
  const f = await pb.collection('fontes').getOne(id, { expand: 'tipo' })
  const mudarTipo = !f.expand?.tipo || f.expand.tipo.nome === 'Outro'
  const juntarAutores = ['Audiovisual', 'Instrumento'].includes(f.expand?.tipo?.categoria)
  const d = await dadosDoCandidato(f, candidato, { mudarTipo, juntarAutores })
  return pb.collection('fontes').update(id, d)
}

export async function pedirOcr(id) {
  await garantirSessao()
  await pb.collection('fontes').update(id, { ocr_estado: 'pendente' })
  cicloOcr()
}
