// Discos (CD, LP…) a partir de fotografias da capa, contracapa ou livrete (pedido do Pedro, 10/10/2026).
// Como os livros em papel (referencias.js), mas para discos:
// - na raiz da watch folder, uma fotografia solta cujo código de barras é um EAN/UPC que não é ISBN é um disco;
// - na pasta watch_folder/Discos/, TODAS as imagens são discos, com ou sem código de barras: cada fotografia solta é
//   identificada à parte e as que forem o mesmo disco (mesmo EAN, mesmo registo do catálogo, ou mesmo título e
//   intérprete) juntam-se numa ficha; uma subpasta Discos/<nome>/ é sempre UM disco (capa, contracapa, livrete).
// A ficha é feita sem ficheiro, do tipo «Disco», com a etiqueta «Exemplar físico»:
// - um catálogo encontrou o disco pelo código de barras e dá título, intérprete e data → completa; as fotografias vão
//   para o Lixo do Mac («Fotografias de discos AAAA-MM-DD HHhMM»);
// - encontrado só pelo título e intérprete: completa (e Lixo) só se a fotografia confirmar a edição por um dado
//   independente (ano ℗/©, nº de catálogo ou editora) e nada a contradisser; senão por rever, com os dados do
//   catálogo e uma nota a dizer o que confirmar;
// - senão → por rever, com nota, e as fotografias ficam ligadas à ficha (_originais/Disco …) para conferir;
// - já há uma ficha com esse código de barras (ou com o mesmo registo do catálogo) → não se faz outra: ganha a
//   etiqueta e os campos que lhe faltam (se foi encontrada só pelo título, sem confirmação: só a etiqueta, as
//   fotografias ligadas e uma nota);
// - sem título nenhum, ou um erro inesperado → nao_processados/referencias_por_identificar/.
// A IA local (capa do disco) só é usada quando nenhum catálogo encontrou o disco. O campo «Onde está o exemplar
// físico» (metadados.exemplar_papel) é só do utilizador: o programa nunca o preenche.
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS, ORIGINAIS } from './config.js'
import * as F from './ficheiros.js'
import { pb, garantirSessao, definicoes, tipoPorNome } from './pb.js'
import { pessoa, eInstituicao, normalizar } from './fontes_externas/util.js'
import { iaDisponivel, lerCapaDisco } from './ia.js'
import { lerFotografias, eanValido, eanDeDisco, semMaiusculas, paraOLixo, arrumar, numeroDe, vazio } from './referencias.js'
import { log } from './registo.js'
import { esperarVez } from './intensidade.js'

export const ETIQUETA = 'Exemplar físico'
export const NOME_PASTA = 'Discos'
export const PASTA_DISCOS = path.join(PASTAS.watch, NOME_PASTA)
// («Outro», dito pela IA, não conta: sem indício, é um CD)
const SUPORTES = ['CD', 'LP', '78 rpm', 'Cassete', 'Digital']
const LIXO = { nome: 'Fotografias de discos', reserva: 'fotografias_discos_tratadas' }
const POR_IDENTIFICAR = 'referencias_por_identificar'

// ---------------------------------------------------------------------------
// A pasta Discos

// Onde fica uma imagem dentro de watch_folder/Discos: null (fora), { solto: true } (directamente em Discos) ou
// { solto: false, nome } (numa subpasta: Discos/<nome>/…, também mais abaixo, é um só disco)
export function pastaDoDisco(ficheiro, watch = PASTAS.watch) {
  const partes = path.relative(watch, ficheiro).split(path.sep)
  if (partes.length < 2 || partes[0] === '..' || partes[0].normalize('NFC').toLowerCase() !== NOME_PASTA.toLowerCase()) return null
  const raiz = path.join(watch, partes[0])
  if (partes.length === 2) return { pasta: raiz, raiz, solto: true, nome: '' }
  return { pasta: path.join(raiz, partes[1]), raiz, solto: false, nome: partes[1].normalize('NFC') }
}

// ---------------------------------------------------------------------------
// O que se lê na fotografia (regras, sem IA)

// Códigos de barras só no texto (o leitor não descodificou as barras), só nas formas em que se imprimem por baixo
// das barras e sempre dentro de UMA linha: 13 algarismos seguidos; 1+6+6 («5 603559 012125»); o UPC 0+5+5+1
// («0 75678 16412 5»); ou 12 algarismos sem o 1.º, impresso à esquerda das barras («417513 105223») → reconstruído
// pelo dígito de controlo (só um algarismo serve). Nunca se juntam linhas diferentes nem grupos soltos de algarismos
// (listas de faixas «1\n2\n…», telefones «Tel 351 22 123 4567», códigos LC). Qualquer código lido no texto só se usa
// se um catálogo o encontrar E o registo bater com a fotografia (confirmaCodigoIncerto).
const ESPACO = '[ \\t]+'
const FORMAS_EAN = [
  ['(\\d{13})', 'ean'],
  [`(\\d)${ESPACO}(\\d{6})${ESPACO}(\\d{6})`, 'ean'],
  [`(\\d)${ESPACO}(\\d{5})${ESPACO}(\\d{5})${ESPACO}(\\d)`, 'upc'],
  ['(\\d{12})', 'falta'],
  [`(\\d{6})${ESPACO}(\\d{6})`, 'falta'],
  // (nem colado a letras ou a outros algarismos: «FIABA2300048», «1 2 3 …»)
].map(([corpo, forma]) => [new RegExp(`(?<![\\p{L}\\d])(?<!\\d[ \\t]*)${corpo}(?![ \\t]*\\d)(?!\\p{L})`, 'gu'), forma])

export function eansDoTexto(texto) {
  const out = []
  const juntar = (ean, reconstruido, algarismos) => {
    if (ean && !out.some((x) => x.ean === ean)) out.push({ ean, reconstruido, algarismos })
  }
  for (const linha of String(texto || '').split('\n')) {
    for (const [re, forma] of FORMAS_EAN) {
      for (const m of linha.matchAll(re)) {
        const s = m.slice(1).join('')
        if (forma === 'ean') juntar(eanDeDisco(s), false, m[0])
        else if (forma === 'upc') juntar(eanDeDisco(`0${s}`), false, m[0])
        else {
          // (12 algarismos: um UPC completo é o caso «0»; os outros são o EAN-13 sem o 1.º algarismo)
          for (let d = 0; d <= 9; d++) {
            const e = eanDeDisco(`${d}${s}`)
            if (e) juntar(e, d !== 0, m[0])
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.reconstruido - b.reconstruido)
}

// Nº de catálogo da editora discográfica numa linha sozinha: «NUM 1212», «ABCD 522», «PAS 1028», «HMC 902100»
// (fora: códigos ISRC, LC, BWV…, e «DDD»/«CD» e afins)
const NAO_CATALOGO = new Set(['ISBN', 'ISSN', 'ISMN', 'ISRC', 'EAN', 'UPC', 'LC', 'DDD', 'ADD', 'AAD', 'DAD', 'CD', 'CDS', 'DVD', 'LP', 'SACD', 'TEL', 'FAX', 'BWV', 'HWV', 'RV', 'KV', 'OP', 'NO', 'NR', 'TWV', 'WQ', 'HOB', 'SWV', 'BUXWV', 'ZWV', 'WOO', 'MS', 'MSS', 'AD', 'BC', 'DL', 'TRACK', 'CH', 'VOL'])
export function nCatalogoDoTexto(texto) {
  for (const linha of String(texto || '').split('\n')) {
    const l = linha.trim().replace(/^(cat(alogue|álogo)?\.?\s*(n[oº°r]?\.?|number|nr\.?)?\s*[:.]?\s+)/i, '')
    const m = /^([A-Z]{2,6})[ .-]?(\d{2,7}(?:[-/]\d{1,3})?)$/.exec(l)
    if (m && !NAO_CATALOGO.has(m[1])) return `${m[1]} ${m[2]}`
  }
  return ''
}

// Ano da linha ℗ / © («P&C all rights reserved 2010», «℗ 1998»)
export function anoDaCapa(texto) {
  const m = /(℗|Ⓟ|\(p\)|\bp\s*(?:&|and|\+)\s*c\b|©|\(c\))[^\d]{0,40}?\b((?:19|20)\d{2})\b/i.exec(String(texto || ''))
  return m ? m[2] : ''
}

// «COMPACT disc DIGITAL AUDIO» → CD (o resto: sem indício)
export function suporteDoTexto(texto) {
  const t = String(texto || '')
  if (/(compact|mpact)\s+disc/i.test(t)) return 'CD'
  if (/\b(33\s*1\/3\s*rpm|long\s*play(ing)?|vinyl|vinil)\b/i.test(t)) return 'LP'
  if (/\b78\s*rpm\b/i.test(t)) return '78 rpm'
  if (/\b(cassette|musicassette)\b/i.test(t)) return 'Cassete'
  return ''
}

// A editora lida pela IA: nunca um código ISRC («FIABA2300048-…» → «FIABA», disco_12) nem um nº de catálogo
const ISRC = /[A-Z]{2}[A-Z0-9]{3}\d{7}/g
export function editoraValida(editora, texto = '', nCatalogo = '') {
  const e = String(editora || '').trim()
  const junto = e.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!junto || /^[A-Z]{2}[A-Z0-9]{3}\d{7}/.test(junto) || /^[A-Z]{2,6}[ .-]?\d{2,7}([-/]\d{1,3})?$/.test(e)) return ''
  if (nCatalogo && junto === String(nCatalogo).toUpperCase().replace(/[^A-Z0-9]/g, '')) return ''
  // (o princípio de um ISRC impresso na fotografia: país + registante)
  const isrcs = String(texto || '').toUpperCase().match(ISRC) || []
  if (junto.length <= 5 && isrcs.some((c) => c.startsWith(junto))) return ''
  return e
}

// Título que é só o princípio de uma linha cortada pela borda da fotografia: a linha toca a borda e há outras linhas
// cortadas na mesma borda («EARLY IT», «VIRPI RÄI!», «TAITO HO»… no disco_12)
const BORDA = 0.01
const bordas = (l) => [l.x <= BORDA && 'esq', l.x + l.w >= 1 - BORDA && 'dir', l.y <= BORDA && 'cima', l.y + l.h >= 1 - BORDA && 'baixo'].filter(Boolean)
export function tituloCortado(titulo, fotos) {
  const t = normalizar(titulo)
  if (!t) return false
  for (const f of fotos || []) {
    const linhas = (f.linhas || []).filter((l) => l.w && l.h)
    const l = linhas.find((x) => normalizar(x.texto) === t)
    if (l && bordas(l).some((b) => linhas.filter((x) => x !== l && bordas(x).includes(b)).length >= 2)) return true
  }
  return false
}

// Sem intérpretes lidos pela IA: as outras linhas curtas da capa (até 6 palavras; nem o título, nem linhas legais, de
// editora, de suporte ou com números) servem de pistas para o catálogo («SEGREIS DE LISBOA», «Manuel Morais»)
const LINHA_LEGAL = /(℗|©|ⓟ|\([pc]\)|rights|reserved|direitos|made in|printed|fabricad|manufactur|distribu|compact|\bdisc\b|digital|audio|stereo|mono|\b(ddd|add|aad|lc|isrc|ean|upc|cd|lp|sacd)\b|www|https?:|\.(com|pt|org|net|de|fr|es)\b|booklet|livrete|total time|dura[çc][ãa]o|unauthori[sz]ed|copying|broadcast|\btel\b|\bfax\b|e-?mail|recorded|gravad|produ[cç]|engineer|design|photo|foto)/i
export function pistasDoTexto(fotos, titulo, capa = {}) {
  const t = normalizar(titulo)
  // (as fotografias onde se lê o título são a capa: só essas, se houver)
  const comTitulo = (fotos || []).filter((f) => t && ` ${normalizar(f.texto)} `.includes(` ${t} `))
  const out = []
  for (const f of comTitulo.length ? comTitulo : fotos || []) {
    for (const linha of String(f.texto || '').split('\n').map((x) => x.trim())) {
      const n = normalizar(linha)
      if (!n || n.split(' ').length > 6 || !/\p{L}{3}/u.test(linha) || /\d/.test(linha)) continue
      if (n === t || ` ${t} `.includes(` ${n} `) || ` ${n} `.includes(` ${t} `)) continue
      if (LINHA_LEGAL.test(linha) || nCatalogoDoTexto(linha) || VARIOS.test(linha.trim())) continue
      if (capa.editora && normalizar(capa.editora) === n) continue
      if (!out.some((x) => normalizar(x) === n)) out.push(semMaiusculas(linha))
    }
  }
  return out
}

// Nome de uma subpasta como título de reserva (quando nada mais o diz); «IMG_1234», «Disco 3» não servem
export function tituloDaPasta(nome) {
  const t = String(nome || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/\p{L}{4,}/u.test(t) || /^(img|dsc|dscn|pxl|foto|fotos|photo|imagem|imagens|scan|novo|nova|nova pasta|untitled folder|disco|discos|cd|lp)[\s-]*\d*$/i.test(t)) return ''
  return t
}

// ---------------------------------------------------------------------------
// Ler e juntar

// Autores a partir do que a IA leu na capa: o agrupamento, os intérpretes (e o maestro), os compositores
// («Various Artists», «Vários» não é um intérprete)
const VARIOS = /^(various( artists)?|v[áa]rios( artistas| int[ée]rpretes)?|artistes divers|verschiedene( interpreten)?|aa\.?\s?vv\.?)$/i
export function autoresDaCapa(capa) {
  const out = []
  const chave = (a) => normalizar(a.literal || `${a.nome} ${a.apelido}`)
  const por = (a) => {
    if (a && chave(a) && !VARIOS.test((a.literal || `${a.nome} ${a.apelido}`).trim()) && !out.some((b) => chave(b) === chave(a))) out.push(a)
  }
  if (capa?.ensemble) por({ literal: semMaiusculas(capa.ensemble), papel: 'intérprete' })
  for (const i of capa?.interpretes || []) {
    const nome = semMaiusculas(i.nome)
    por(eInstituicao(nome) ? { literal: nome, papel: 'intérprete' } : pessoa(nome, i.papel === 'maestro' ? 'maestro' : 'intérprete'))
  }
  for (const c of capa?.compositores || []) por(pessoa(semMaiusculas(c), 'compositor'))
  return out
}

// Junta o que a IA leu em várias fotografias do mesmo disco: o primeiro que tem cada campo; listas sem repetidos
export function juntarCapas(...lista) {
  const out = { titulo: '', interpretes: [], ensemble: '', compositores: [], editora: '', n_catalogo: '', ano: '', suporte: '' }
  for (const c of lista.filter(Boolean)) {
    for (const k of Object.keys(out)) {
      if (k === 'interpretes') for (const i of c.interpretes || []) !out.interpretes.some((x) => normalizar(x.nome) === normalizar(i.nome)) && out.interpretes.push(i)
      else if (k === 'compositores') for (const n of c.compositores || []) !out.compositores.some((x) => normalizar(x) === normalizar(n)) && out.compositores.push(n)
      else if (!out[k] && c[k] && !(k === 'suporte' && !SUPORTES.includes(c[k]))) out[k] = c[k]
    }
  }
  return out
}

// Fotografias soltas: as que têm o mesmo código de barras são do mesmo disco; as outras ficam cada uma à parte
export function agruparPorEan(lidas) {
  const grupos = []
  for (const l of lidas) {
    const g = l.ean && grupos.find((x) => x.fotografias.some((f) => f.ean === l.ean))
    if (g) g.fotografias.push(l)
    else grupos.push({ fotografias: [l] })
  }
  return grupos
}

// Um código lido no texto (completo ou reconstruído): o catálogo encontrou-o, mas só serve se o registo bater com o
// que está escrito na fotografia (o mesmo nº de catálogo, um nome de intérprete, ou duas palavras do título; palavras
// genéricas como «Ensemble» ou «Orchestra» não contam como nome)
const NOMES_GENERICOS = new Set('ensemble orchestra orquestra orchestre choir coro chorus quartet quarteto consort various artists varios music musica musique baroque barroca antiga early with from'.split(' '))
export function confirmaCodigoIncerto(registo, texto, nCatalogo = '') {
  if (!registo) return false
  const junto = (s) => normalizar(s).replace(/\s+/g, '')
  if (nCatalogo && registo.metadados?.n_catalogo && junto(nCatalogo) === junto(registo.metadados.n_catalogo)) return true
  const t = ` ${normalizar(texto)} `
  const tem = (w) => t.includes(` ${w} `)
  const nomes = (registo.autores || []).flatMap((a) => [a.apelido, a.nome, a.literal]).flatMap((s) => normalizar(s).split(' ')).filter((w) => w.length >= 4 && !NOMES_GENERICOS.has(w))
  if (nomes.some(tem)) return true
  return normalizar(registo.titulo).split(' ').filter((w) => w.length >= 4 && tem(w)).length >= 2
}

const INTERPRETES = ['intérprete', 'maestro']
const autoresDe = (id) => (id.registo?.autores?.length ? id.registo.autores : autoresDaCapa(id.capa))
const artistaDe = (id) => {
  const a = autoresDe(id).find((x) => INTERPRETES.includes(x.papel))
  return a ? a.literal || a.apelido : ''
}

// Fotografias soltas já identificadas cada uma à parte: as que são o mesmo disco juntam-se numa só — pelo mesmo
// código de barras, o mesmo registo do catálogo ou a mesma ficha já existente; pelo mesmo título + intérprete só
// quando no máximo um dos lados tem código de barras ou registo. Nunca se juntam dois grupos com códigos de barras,
// registos ou fichas diferentes (duas edições das «Goldberg Variations» de Glenn Gould são dois discos).
export function juntarIdentificados(ids) {
  const sinais = (id) => {
    const titulo = id.registo?.titulo || id.capa?.titulo
    const artista = artistaDe(id)
    return {
      ids: [id],
      codigos: new Set([id.ean, eanValido(id.registo?.metadados?.codigo_barras)].filter(Boolean)),
      registos: new Set([id.registo?.url].filter(Boolean)),
      fichas: new Set([id.existente?.id].filter(Boolean)),
      ta: new Set(titulo && artista ? [`${normalizar(titulo)}|${normalizar(artista)}`] : []),
    }
  }
  const CAMPOS = ['codigos', 'registos', 'fichas']
  const comum = (a, b) => [...a].some((x) => b.has(x))
  const choca = (a, b) => CAMPOS.some((k) => a[k].size && b[k].size && !comum(a[k], b[k]))
  const identificado = (g) => g.codigos.size > 0 || g.registos.size > 0
  const forte = (a, b) => CAMPOS.some((k) => comum(a[k], b[k]))
  const fraco = (a, b) => comum(a.ta, b.ta) && !(identificado(a) && identificado(b))
  const unir = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, k === 'ids' ? [...a.ids, ...b.ids] : new Set([...a[k], ...b[k]])]))
  const grupos = []
  for (const id of ids) {
    let novo = sinais(id)
    const juntar = (g) => {
      novo = unir(novo, g)
      grupos.splice(grupos.indexOf(g), 1)
    }
    for (const g of [...grupos]) if (!choca(novo, g) && forte(novo, g)) juntar(g)
    // (só pelo título + intérprete: se servir a mais de um disco, não se junta a nenhum)
    const fracos = grupos.filter((g) => !choca(novo, g) && fraco(novo, g))
    if (fracos.length === 1) juntar(fracos[0])
    grupos.push(novo)
  }
  return grupos.map((g) => juntarDois(g.ids))
}

// O registo melhor: o encontrado pelo código de barras primeiro, depois o de maior confiança
const melhorRegisto = (lista) => lista.filter((i) => i.registo).sort((a, b) => a.viaTexto - b.viaTexto || (b.registo.confianca || 0) - (a.registo.confianca || 0))[0]
function juntarDois(ids) {
  if (ids.length === 1) return ids[0]
  const ordem = [...ids].sort((a, b) => !!b.registo - !!a.registo)
  const melhor = melhorRegisto(ids)
  const primeiro = (k) => ordem.map((i) => i[k]).find((v) => !vazio(v)) || ''
  return {
    fotografias: ids.flatMap((i) => i.fotografias),
    nome: primeiro('nome'),
    raiz: primeiro('raiz'),
    ean: (melhor && melhor.ean) || primeiro('ean'),
    registo: melhor?.registo || null,
    viaTexto: melhor ? melhor.viaTexto : false,
    tituloCortado: primeiro('tituloCortado'),
    incertos: ids.flatMap((i) => i.incertos || []).filter((x, n, a) => a.findIndex((y) => y.ean === x.ean) === n),
    capa: ids.some((i) => i.capa) ? juntarCapas(...ids.map((i) => i.capa)) : null,
    n_catalogo: primeiro('n_catalogo'),
    ano: primeiro('ano'),
    suporte: primeiro('suporte'),
    existente: ordem.map((i) => i.existente).find(Boolean) || null,
    iaUsada: ids.some((i) => i.iaUsada),
    iaEmFalta: ids.some((i) => i.iaEmFalta),
  }
}

// Fotografias para a IA (no máximo 3): a capa primeiro (pelo nome), depois as sem código de barras, depois as com
// mais texto
const CAPA = /(capa|frente|front|cover|recto)/i
export function escolherParaIA(fotos) {
  const peso = (f) => (CAPA.test(path.basename(f.ficheiro)) && !/contra|back|verso/i.test(path.basename(f.ficheiro)) ? 0 : f.ean ? 2 : 1)
  return [...fotos].sort((a, b) => peso(a) - peso(b) || b.texto.length - a.texto.length).slice(0, 3)
}

// ---------------------------------------------------------------------------
// Identificar: catálogo pelo código de barras → ficha existente → IA na capa → catálogo pelo título

// (só para os catálogos e a IA, que podem faltar; um erro da base de dados não é «não encontrado»: rebenta, e o grupo
// vai para nao_processados/referencias_por_identificar/)
const tentar = async (f) => {
  try {
    return (await f()) || null
  } catch (_) {
    return null
  }
}

// grupo: { fotografias: [lidas], nome (subpasta), raiz }; c: as consultas (catálogos, base de dados, IA)
export async function identificar(grupo, defs, c) {
  const fotos = grupo.fotografias
  const texto = fotos.map((f) => f.texto).join('\n')
  const id = {
    fotografias: fotos,
    nome: grupo.nome || '',
    raiz: grupo.raiz || '',
    ean: '',
    registo: null,
    viaTexto: false,
    tituloCortado: '',
    incertos: [],
    capa: null,
    n_catalogo: nCatalogoDoTexto(texto),
    ano: anoDaCapa(texto),
    suporte: suporteDoTexto(texto),
    existente: null,
    iaUsada: false,
    iaEmFalta: false,
  }
  // 1) O código de barras descodificado
  const barras = [...new Set(fotos.map((f) => f.ean).filter(Boolean))]
  id.ean = barras[0] || ''
  for (const e of barras) {
    const r = await tentar(() => c.porCodigo(e, defs))
    if (r) {
      id.registo = r
      id.ean = e
      break
    }
  }
  // 2) Sem barras descodificadas: os algarismos do texto (completos ou reconstruídos, o registo tem de bater com a
  //    fotografia); na nota fica só o melhor dos que nenhum catálogo confirmou
  if (!barras.length) {
    for (const x of eansDoTexto(texto)) {
      const r = await tentar(() => c.porCodigo(x.ean, defs))
      if (r && confirmaCodigoIncerto(r, texto, id.n_catalogo)) {
        id.registo = r
        id.ean = x.ean
        id.incertos = []
        break
      }
      if (!id.incertos.length) id.incertos.push(x)
    }
  }
  id.existente = (await c.existente({ ean: id.ean || eanValido(id.registo?.metadados?.codigo_barras), url: id.registo?.url })) || null
  if (id.registo || id.existente) return id

  // 3) A IA local na capa / contracapa
  if (await tentar(() => c.iaDisponivel(defs))) {
    const lidas = []
    for (const f of escolherParaIA(fotos)) {
      try {
        lidas.push(await c.lerCapa(f.ficheiro, defs, f.texto))
      } catch (e) {
        log.aviso(`IA local na capa do disco ${path.basename(f.ficheiro)}: ${e.message}`)
      }
    }
    if (lidas.length) {
      id.capa = juntarCapas(...lidas)
      id.iaUsada = true
      id.capa.editora = editoraValida(id.capa.editora, texto, id.n_catalogo || id.capa.n_catalogo)
      // (um título cortado pela borda da fotografia não serve: «EARLY IT»)
      if (tituloCortado(id.capa.titulo, fotos)) {
        id.tituloCortado = id.capa.titulo
        id.capa.titulo = ''
      }
    }
  } else id.iaEmFalta = true

  // 4) O catálogo pelo título e intérprete (da capa, ou do nome da subpasta)
  const capa = id.capa || {}
  const titulo = capa.titulo || tituloDaPasta(id.nome)
  if (titulo) {
    // (o agrupamento e os intérpretes, separados por vírgulas: o catálogo confere pelo menos um deles; sem eles, as
    // outras linhas curtas da capa — juntas, depois uma a uma, no máximo 3 pesquisas)
    const lidos = [capa.ensemble, ...(capa.interpretes || []).map((i) => i.nome)].filter((n) => n && !VARIOS.test(n.trim()))
    const pistas = lidos.length ? [] : pistasDoTexto(fotos, titulo, capa)
    const artistas = lidos.length ? [lidos.slice(0, 4).join(', ')] : pistas.length > 1 ? [pistas.slice(0, 4).join(', '), pistas[0], pistas[1]] : pistas.length ? pistas : ['']
    for (const artista of artistas) {
      const r = await tentar(() => c.porTexto({ titulo, artista, editora: capa.editora || '', n_catalogo: id.n_catalogo || capa.n_catalogo || '' }, defs))
      if (!r) continue
      id.registo = r
      id.viaTexto = true
      id.existente = (await c.existente({ ean: eanValido(r.metadados?.codigo_barras), url: r.url })) || null
      break
    }
  }
  return id
}

// Um disco encontrado só pelo título e intérprete pode ser outra edição (outra gravação com o mesmo nome, a edição
// digital, uma reedição): a fotografia tem de confirmar pelo menos um dado independente que mostre — o ano ℗/©
// (±1), o nº de catálogo ou a editora — e nada pode contradizer, nem o código de barras da fotografia
export function conferirPeloTexto(id) {
  const r = id.registo
  const capa = id.capa || {}
  const bate = []
  const contra = []
  const anoFoto = id.ano || capa.ano
  const anoReg = ano4(r?.data)
  if (anoFoto && /^\d{4}$/.test(anoReg)) (Math.abs(Number(anoFoto) - Number(anoReg)) <= 1 ? bate : contra).push(`o ano (a fotografia diz ${anoFoto}, o catálogo ${anoReg})`)
  const cat = id.n_catalogo || capa.n_catalogo
  const catReg = r?.metadados?.n_catalogo
  const junto = (x) => normalizar(x).replace(/ /g, '')
  if (cat && catReg) (junto(cat) === junto(catReg) ? bate : contra).push(`o nº de catálogo (a fotografia diz ${cat}, o catálogo ${catReg})`)
  const ed = normalizar(capa.editora)
  const edReg = normalizar(r?.editora)
  // (uma edição de autor — a «editora» é o próprio agrupamento ou intérprete, «Segréis de Lisboa» — não confirma nada)
  const interpretes = [...(r?.autores || []), ...autoresDaCapa(capa)].filter((a) => INTERPRETES.includes(a.papel)).map((a) => normalizar(a.literal || `${a.nome || ''} ${a.apelido || ''}`))
  if (ed && edReg && !interpretes.includes(ed) && !interpretes.includes(edReg)) (` ${ed} `.includes(` ${edReg} `) || ` ${edReg} `.includes(` ${ed} `) ? bate : contra).push(`a editora (a fotografia diz ${capa.editora}, o catálogo ${r.editora})`)
  // (o código de barras lido nas barras, que nenhum catálogo conhecia, e o da edição encontrada pelo título)
  const outroCodigo = id.ean && eanValido(r?.metadados?.codigo_barras) && eanValido(r.metadados.codigo_barras) !== id.ean ? eanValido(r.metadados.codigo_barras) : ''
  if (outroCodigo) contra.push(`o código de barras (a fotografia tem ${id.ean}, a edição encontrada ${outroCodigo})`)
  return { confirmado: bate.length > 0 && !contra.length, bate, contra, outroCodigo }
}

// ---------------------------------------------------------------------------
// Decidir (sem tocar em nada): ficha nova, ficha existente ou por identificar

const faixasEmTexto = (v) =>
  Array.isArray(v)
    ? v
        .map((t, i) => (typeof t === 'string' ? t : [t.numero || i + 1, t.titulo, t.duracao && `(${t.duracao})`].filter(Boolean).join(' ')))
        .filter(Boolean)
        .join('\n')
    : String(v || '')

const ano4 = (v) => String(v || '').slice(0, 4)

export function dadosDoDisco(id) {
  const r = id.registo
  const capa = id.capa || {}
  const tituloPasta = tituloDaPasta(id.nome)
  const titulo = r?.titulo || capa.titulo || tituloPasta
  const autores = r?.autores?.length ? [...r.autores] : autoresDaCapa(capa)
  const anoFoto = id.ano || capa.ano
  // (a data da edição: a do catálogo; se a fotografia tem o ano ℗/© e um dos catálogos dá uma data desse ano, essa)
  const data = (anoFoto && r?.data && ano4(r.data) !== anoFoto && (r.datas || []).find((d) => ano4(d) === anoFoto)) || r?.data || anoFoto
  const editora = r?.editora || capa.editora || ''
  const codigo = id.ean || eanValido(r?.metadados?.codigo_barras)
  // (a capa completa o catálogo: o nº de catálogo e o suporte, nunca o título nem os intérpretes)
  const n_catalogo = r?.metadados?.n_catalogo || id.n_catalogo || capa.n_catalogo || ''
  // (o suporte: o do catálogo, o que o texto diz explicitamente, o da IA; «Outro» não conta → CD)
  const suporte = [r?.metadados?.suporte, id.suporte, capa.suporte].find((s) => SUPORTES.includes(s)) || 'CD'
  const interprete = autores.some((a) => INTERPRETES.includes(a.papel))
  // Encontrado só pelo título: a fotografia tem de confirmar a edição (conferirPeloTexto)
  const conf = r && id.viaTexto ? conferirPeloTexto(id) : null
  // (completa só com título, intérprete e data dados pelo catálogo; o ano da contracapa preenche, mas não confirma)
  const estado = r && titulo && interprete && r.data && (!conf || conf.confirmado) ? 'completo' : 'a_rever'
  const notas = []
  if (r && !conf && anoFoto && r.data && ano4(data) !== anoFoto) notas.push(`A fotografia diz ${anoFoto}; ${r.fonte} diz ${r.data}.`)
  if (!r) {
    notas.push(`Dados lidos na fotografia${id.iaUsada ? ' (com a IA local)' : ''}; nenhum catálogo encontrou o disco${codigo ? ` (código de barras ${codigo})` : ''}: conferir com as fotografias originais.`)
    if (!capa.titulo && tituloPasta) notas.push(`O título é o nome da pasta «${id.nome}».`)
  } else {
    if (conf && !conf.confirmado) {
      const onde = `${r.fonte}${r.url ? ` (${r.url})` : ''}`
      notas.push(
        conf.contra.length
          ? `${onde} encontrou um disco com este título e intérprete, mas não bate com a fotografia: ${conf.contra.join('; ')}. Confirmar se é esta edição.`
          : `${onde} encontrou um disco com este título e intérprete, mas a fotografia não mostra o ano ℗/©, o nº de catálogo nem a editora para confirmar que é esta edição: confirmar (por exemplo, com a contracapa).`,
      )
      if (conf.outroCodigo) notas.push(`O código de barras da fotografia (${id.ean}) fica; o da edição encontrada é ${conf.outroCodigo}.`)
    }
    if (!interprete || !r.data) notas.push(`${r.fonte} encontrou o disco, mas não diz ${[!interprete && 'o intérprete', !r.data && `a data${anoFoto ? ` (a fotografia diz ${anoFoto})` : ''}`].filter(Boolean).join(' nem ')}.`)
  }
  for (const x of (id.incertos || []).filter((x) => x.ean !== codigo).slice(0, 1)) notas.push(`Na fotografia lê-se «${x.algarismos}» (código de barras ${x.ean}?), que nenhum catálogo confirmou.`)
  if (id.tituloCortado) notas.push(`Na fotografia lê-se «${id.tituloCortado}», mas parece cortado na borda: ${titulo ? 'o título pode estar incompleto' : 'não serviu de título'}.`)
  const md = { ...(r?.metadados || {}) }
  delete md.exemplar_papel // (só do utilizador)
  const metadados = Object.fromEntries(
    Object.entries({
      ...md,
      codigo_barras: codigo,
      n_catalogo,
      faixas: faixasEmTexto(md.faixas),
      // (com código de barras, nº de catálogo ou editora, é uma edição comercial)
      publicado: r ? md.publicado !== false : codigo || n_catalogo || editora ? true : undefined,
      suporte,
      fotografias_disco: id.fotografias.map((f) => path.basename(f.ficheiro)).join(', '),
      nota_revisao: notas.join(' '),
    }).filter(([, v]) => !vazio(v)),
  )
  return {
    titulo,
    autores,
    data,
    editora,
    url: r?.url || '',
    palavras_chave: r?.palavras_chave || [],
    tags: [ETIQUETA],
    estado,
    origem: r ? r.fonte : 'fotografia do disco',
    ocr_estado: 'nao_aplicavel',
    metadados,
  }
}

// Ficha que já existe: a etiqueta e só os campos vazios (nunca «Onde está o exemplar físico»). Feito sobre a ficha
// tal como está na base no momento de gravar (tratarDisco lê-a outra vez antes)
const METADADOS_A_COMPLETAR = ['codigo_barras', 'n_catalogo', 'faixas', 'suporte', 'publicado']
export function camposEmFalta(existente, novos) {
  const junta = {}
  if (!(existente.tags || []).includes(ETIQUETA)) junta.tags = [...(existente.tags || []), ETIQUETA]
  for (const k of ['autores', 'data', 'editora', 'url']) if (vazio(existente[k]) && !vazio(novos[k])) junta[k] = novos[k]
  const md = {}
  for (const k of METADADOS_A_COMPLETAR) if (vazio(existente.metadados?.[k]) && !vazio(novos.metadados?.[k])) md[k] = novos.metadados[k]
  if (Object.keys(md).length) junta.metadados = { ...(existente.metadados || {}), ...md }
  return junta
}

// Ficha que já existe, encontrada só pelo título sem confirmação: não se completa nada; ganha a etiqueta, as
// fotografias ficam ligadas a ela (originais) e uma nota pede para confirmar
export function ligacaoFraca(existente, novos, originais) {
  const junta = {}
  if (!(existente.tags || []).includes(ETIQUETA)) junta.tags = [...(existente.tags || []), ETIQUETA]
  const antes = existente.metadados || {}
  const nota = `Fotografias de um disco (${novos.metadados?.fotografias_disco || ''}) associadas a esta ficha só pelo título e intérprete (${novos.origem}): confirmar se são desta edição${originais ? ` (fotografias em ${originais})` : ''}.`
  junta.metadados = {
    ...antes,
    ...(originais ? { originais: [...new Set([...String(antes.originais || '').split(' | '), originais].filter(Boolean))].join(' | ') } : {}),
    nota_revisao: [antes.nota_revisao, nota].filter(Boolean).join(' '),
  }
  return junta
}

const pastaDosOriginais = (dados) => F.seguro(`Disco ${dados.metadados.codigo_barras || dados.titulo || ''}`).slice(0, 120).trim() || 'Disco'

export function decidirDisco(id) {
  const dados = dadosDoDisco(id)
  if (id.existente) {
    // (encontrada pelo título sem a fotografia o confirmar: as fotografias não vão para o Lixo)
    const fraco = id.viaTexto && !conferirPeloTexto(id).confirmado
    return { acao: 'existente', fraco, dados, junta: fraco ? ligacaoFraca(id.existente, dados, '') : camposEmFalta(id.existente, dados), pastaOriginais: pastaDosOriginais(dados) }
  }
  if (!dados.titulo) return { acao: 'por_identificar' }
  return { acao: 'nova', dados, destino: dados.estado === 'completo' ? 'lixo' : 'originais', pastaOriginais: pastaDosOriginais(dados) }
}

// ---------------------------------------------------------------------------
// Fazer

// O módulo dos catálogos de discos só é carregado quando é preciso (se faltar ou falhar, nada se encontra)
let modulo = null
async function catalogos() {
  modulo ||= import('./fontes_externas/discos.js').catch((e) => {
    modulo = null
    log.aviso(`Catálogos de discos indisponíveis (${e.message})`)
    return null
  })
  return modulo
}

async function fichaExistente({ ean, url }) {
  const partes = []
  const params = {}
  // (um UPC pode estar guardado com ou sem o 0 à frente)
  ;[...new Set([ean, ean && ean.replace(/^0/, '')].filter(Boolean))].forEach((f, k) => {
    partes.push(`metadados.codigo_barras = {:c${k}}`)
    params[`c${k}`] = f
  })
  if (url) {
    partes.push('url = {:u}')
    params.u = url
  }
  if (!partes.length) return null
  try {
    const r = await pb.collection('fontes').getList(1, 1, { filter: pb.filter(partes.join(' || '), params), sort: 'created' })
    return r.items[0] || null
  } catch (e) {
    // (não é «não há»: sem saber se a ficha existe, não se faz outra)
    log.erro(`Disco: não consegui procurar a ficha existente (${[ean, url].filter(Boolean).join(', ')}): ${e.message}`)
    throw e
  }
}

const CONSULTAS = {
  porCodigo: async (ean, defs) => (await catalogos())?.discoPorCodigo(ean, defs) ?? null,
  porTexto: async (q, defs) => (await catalogos())?.discoPorTexto(q, defs) ?? null,
  existente: fichaExistente,
  iaDisponivel,
  lerCapa: lerCapaDisco,
}

// O que se grava na base (os testes trocam-no)
const FICHAS = {
  tipoDisco: () => tipoPorNome('Disco'),
  criar: (dados) => pb.collection('fontes').create(dados),
  ler: (id) => pb.collection('fontes').getOne(id),
  actualizar: (id, dados) => pb.collection('fontes').update(id, dados),
}

// Uma pasta nova em _originais («Disco 5603559012125», «…_2» se já existir)
function pastaNovaDeOriginais(base) {
  let nomePasta = base || 'Disco'
  for (let n = 2; fs.existsSync(path.join(PASTAS.biblioteca, ORIGINAIS, nomePasta)); n++) nomePasta = `${base}_${n}`
  return `${ORIGINAIS}/${nomePasta}`
}

// Move as fotografias para biblioteca/_originais/… ANTES de gravar a ficha; se algo falhar, voltam ao sítio
async function guardarOriginais(caminhos, originais) {
  const destino = path.join(PASTAS.biblioteca, originais)
  const movidas = []
  try {
    for (const f of caminhos) movidas.push([f, await F.mover(f, destino, path.basename(f))])
  } catch (e) {
    await devolver(movidas, originais)
    throw e
  }
  return movidas
}
async function devolver(movidas, originais) {
  for (const [de, para] of [...movidas].reverse()) {
    await F.mover(para, path.dirname(de), path.basename(de)).catch((e) => log.erro(`Disco: não consegui devolver ${path.basename(para)} a ${path.dirname(de)} (está em ${para}): ${e.message}`))
  }
  if (originais) await F.limparPastasVazias(path.join(PASTAS.biblioteca, originais), PASTAS.biblioteca).catch(() => {})
}

export async function tratarDisco(id, fichas = FICHAS) {
  const caminhos = id.fotografias.map((f) => f.ficheiro).filter((f) => fs.existsSync(f))
  if (!caminhos.length) return null
  const nomes = caminhos.map((f) => path.basename(f)).join(', ')
  const raiz = id.raiz || PASTAS.watch
  const dec = decidirDisco(id)
  const codigo = id.ean ? `EAN ${id.ean}` : ''

  if (dec.acao === 'existente') {
    const e = id.existente
    // Encontrada só pelo título, sem confirmação: as fotografias ficam ligadas à ficha (antes de a gravar)
    const originais = dec.fraco ? pastaNovaDeOriginais(dec.pastaOriginais) : ''
    const movidas = originais ? await guardarOriginais(caminhos, originais) : []
    let junta
    try {
      // (a ficha como está agora na base: o utilizador pode tê-la mudado entretanto)
      const fresca = await fichas.ler(e.id)
      junta = dec.fraco ? ligacaoFraca(fresca, dec.dados, originais) : camposEmFalta(fresca, dec.dados)
      if (Object.keys(junta).length) await fichas.actualizar(e.id, junta)
    } catch (err) {
      await devolver(movidas, originais)
      throw err
    }
    const campos = Object.keys(junta).filter((k) => k !== 'tags' && !(dec.fraco && k === 'metadados'))
    const qual = `«${e.titulo}» (${[numeroDe(e), codigo].filter(Boolean).join(', ')})${junta.tags ? `: etiqueta «${ETIQUETA}»` : ''}${campos.length ? ` e ${campos.join(', ')}` : ''}`
    if (dec.fraco) {
      await arrumar(caminhos, raiz)
      log.info(`Disco: parece ser ${qual}, encontrada só pelo título; fotografias em ${originais}, para confirmar`)
      return { acao: 'existente', id: e.id, fraco: true }
    }
    const lixo = await paraOLixo(caminhos, LIXO).catch((err) => (log.aviso(`Disco ${qual}: as fotografias não foram para o Lixo (${err.message})`), ''))
    await arrumar(caminhos, raiz)
    if (lixo) log.info(`Disco: já existia ${qual}; fotografias (${nomes}) no Lixo (${path.basename(lixo)})`)
    return { acao: 'existente', id: e.id }
  }

  if (dec.acao === 'por_identificar') {
    await paraPorIdentificar(caminhos, raiz)
    log.aviso(`Disco${codigo ? ` (${codigo})` : ''} em ${nomes}: nenhum catálogo o encontrou e não consegui ler o título${id.tituloCortado ? ` (na fotografia lê-se «${id.tituloCortado}», cortado na borda)` : ''}${id.iaEmFalta ? ' (a IA local não está disponível)' : ''}: fotografias em nao_processados/${POR_IDENTIFICAR}/ (fotografe também a capa, ponha as fotografias numa subpasta de Discos com o nome do disco, ou faça a ficha à mão)`)
    return { acao: 'por_identificar' }
  }

  const { dados } = dec
  // Por rever: as fotografias ficam ligadas à ficha, para conferir — movidas ANTES de gravar a ficha (se a ficha
  // não se gravar, voltam ao sítio)
  let originais = ''
  let movidas = []
  if (dec.destino === 'originais') {
    originais = pastaNovaDeOriginais(dec.pastaOriginais)
    movidas = await guardarOriginais(caminhos, originais)
    dados.metadados.originais = originais
    dados.metadados.fotografias_disco = movidas.map(([, para]) => path.basename(para)).join(', ')
  }
  let ficha
  try {
    const tipo = await fichas.tipoDisco()
    ficha = await fichas.criar({ tipo: tipo?.id, ...dados })
  } catch (e) {
    await devolver(movidas, originais)
    throw e
  }
  const quem = [numeroDe(ficha), codigo, id.registo?.fonte].filter(Boolean).join(', ')
  if (originais) {
    await arrumar(caminhos, raiz)
    log.info(`Disco: «${dados.titulo}» (${quem}) por rever; fotografias em ${originais}`)
  } else {
    // (completa: a ficha já está gravada; se o Lixo falhar, as fotografias ficam e da próxima vez já há ficha)
    const lixo = await paraOLixo(caminhos, LIXO).catch((e) => (log.aviso(`Disco «${dados.titulo}» (${quem}): as fotografias (${nomes}) não foram para o Lixo (${e.message})`), ''))
    await arrumar(caminhos, raiz)
    if (lixo) log.info(`Disco: «${dados.titulo}» (${quem}); fotografias (${nomes}) no Lixo (${path.basename(lixo)})`)
  }
  return { acao: 'nova', id: ficha.id, estado: dados.estado }
}

async function paraPorIdentificar(caminhos, raiz) {
  const destino = path.join(PASTAS.naoProcessados, POR_IDENTIFICAR)
  for (const f of caminhos.filter((x) => fs.existsSync(x))) await F.mover(f, destino, path.basename(f))
  await arrumar(caminhos, raiz)
}

// Um erro inesperado num disco não deita fora os outros; as fotografias desse disco vão para
// nao_processados/referencias_por_identificar/ (senão seriam tratadas outra vez a cada arranque, sempre com o mesmo erro)
async function falhou(fotografias, raiz, e) {
  const caminhos = fotografias.map((f) => f.ficheiro || f)
  log.erro(`Disco (${caminhos.map((f) => path.basename(f)).join(', ')}): ${e.message}; fotografias em nao_processados/${POR_IDENTIFICAR}/`)
  await paraPorIdentificar(caminhos, raiz).catch((x) => log.erro(`Disco: não consegui mover as fotografias para nao_processados/${POR_IDENTIFICAR}/ (${x.message}); ficam onde estão`))
}

// Identifica e trata os grupos, cada um à parte (um erro num grupo não pára os outros)
export async function tratarGrupos(grupos, defs, { umDisco = false, raiz = PASTAS.watch, consultas = CONSULTAS, tratar = tratarDisco } = {}) {
  const ids = []
  for (const g of grupos) {
    await esperarVez()
    try {
      ids.push(await identificar(g, defs, consultas))
    } catch (e) {
      await falhou(g.fotografias, g.raiz || raiz, e)
    }
  }
  const discos = []
  for (const id of umDisco ? ids : juntarIdentificados(ids)) {
    try {
      discos.push(await tratar(id))
    } catch (e) {
      await falhou(id.fotografias, id.raiz || raiz, e)
    }
  }
  return discos
}

// pedido: { lidas } (fotografias soltas da raiz, já lidas, com código de barras de disco) ou
// { ficheiros, raiz, umDisco, nome } (da pasta Discos: soltas, ou uma subpasta = um disco)
async function tratarPedido({ lidas, ficheiros = [], raiz = PASTAS.watch, umDisco = false, nome = '' }) {
  await esperarVez()
  await garantirSessao()
  const defs = await definicoes()
  if (!lidas) {
    const existentes = ficheiros.filter((f) => fs.existsSync(f))
    try {
      lidas = await lerFotografias(existentes)
    } catch (e) {
      return falhou(existentes, raiz, e)
    }
  }
  lidas = lidas.filter(Boolean)
  if (!lidas.length) return
  const grupos = umDisco ? [{ fotografias: lidas, nome, raiz }] : agruparPorEan(lidas).map((g) => ({ ...g, raiz }))
  await tratarGrupos(grupos, defs, { umDisco, raiz })
}

// Um pedido de cada vez (os catálogos e a IA não gostam de pedidos em paralelo)
let cadeia = Promise.resolve()
export function tratarDiscos(pedido) {
  const quais = (pedido.lidas || []).map((l) => l.ficheiro).concat(pedido.ficheiros || [])
  cadeia = cadeia.then(() => tratarPedido(pedido)).catch((e) => log.erro(`Disco (${quais.map((f) => path.basename(f)).join(', ')}): ${e.message}`))
  return cadeia
}
