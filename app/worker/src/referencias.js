// Livros (e outras fontes impressas) em papel a partir de fotografias do código de barras / ISBN ou da ficha técnica
// (pedido do Pedro, 10/10/2026). As fotografias soltas da watch folder (fora de subpastas) são lidas pelo leitor da
// Apple (ferramentas/ler_imagem.swift: códigos de barras e texto; nada sai do Mac). Uma fotografia com ISBN é uma
// «referência»: a ficha é feita sem ficheiro, com o registo do catálogo pelo ISBN (Open Library → Google Books →
// K10plus) e o que a ficha técnica diz, e leva a etiqueta «Em papel».
// - Um catálogo confirmou o livro → as fotografias vão para o Lixo do Mac («Fotografias de ISBN AAAA-MM-DD HHhMM»).
// - Só a fotografia deu os dados → ficha por rever, com as fotografias ligadas (_originais/ISBN …) para conferir.
// - Já há uma ficha com esse ISBN → não se faz outra: ganha a etiqueta «Em papel» e os campos que lhe faltam.
// - ISBN sem título (nem catálogo nem fotografia) → nao_processados/referencias_por_identificar/.
// O campo «Onde está o exemplar físico» (metadados.exemplar_papel) é só do utilizador: o programa nunca o preenche.
// Fotografias soltas com o código de barras de um disco (EAN/UPC que não é ISBN) saem também daqui, para
// referencias_discos.js (CD/LP: etiqueta «Exemplar físico»).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { PASTAS, ORIGINAIS, BIN } from './config.js'
import { correr, todosOsIsbn, isbnDoCodigo, isbn13, isbn10 } from './extracao.js'
import * as F from './ficheiros.js'
import { pb, garantirSessao, definicoes, tipoPorNome } from './pb.js'
import { porIsbn } from './fontes_externas/index.js'
import { pessoa, eInstituicao, normalizar } from './fontes_externas/util.js'
import { iaDisponivel, lerFichaTecnica } from './ia.js'
import { pastaDoLixo } from './espaco_duplicados.js'
import { nomeBase } from './juntar.js'
import { log } from './registo.js'
import { m, traduzivel } from './mensagens.js'
import { esperarVez } from './intensidade.js'

export const ETIQUETA = 'Em papel'

// ---------------------------------------------------------------------------
// Leitura das fotografias

const FONTE_LEITOR = path.join(PASTAS.app, 'worker', 'ferramentas', 'ler_imagem.swift')
const LEITOR = path.join(PASTAS.app, 'cache', 'ler-imagem')
let leitorPronto = null
// O leitor da Apple é compilado uma vez (Command Line Tools, que o Homebrew já instala); sem ele, fica o Tesseract
function leitor() {
  leitorPronto ||= (async () => {
    try {
      if (!fs.existsSync(LEITOR) || fs.statSync(LEITOR).mtimeMs < fs.statSync(FONTE_LEITOR).mtimeMs) {
        await fsp.mkdir(path.dirname(LEITOR), { recursive: true })
        const swiftc = fs.existsSync('/usr/bin/swiftc') ? '/usr/bin/swiftc' : 'swiftc'
        await correr(swiftc, ['-O', FONTE_LEITOR, '-o', LEITOR], { timeout: 300000 })
      }
      return LEITOR
    } catch (e) {
      log.aviso(m('Leitor de códigos de barras indisponível ({erro}): as fotografias de ISBN são lidas só com o Tesseract', { erro: String(e.message).split('\n')[0].slice(0, 200) }))
      return ''
    }
  })()
  return leitorPronto
}

// EAN-13 / UPC-A válido (dígito de controlo certo); o UPC de 12 algarismos passa a EAN-13 com um 0 à frente
export function eanValido(c) {
  let d = String(c || '').replace(/\s/g, '')
  if (/^\d{12}$/.test(d)) d = '0' + d
  if (!/^\d{13}$/.test(d)) return ''
  let s = 0
  for (let i = 0; i < 13; i++) s += Number(d[i]) * (i % 2 ? 3 : 1)
  return s % 10 === 0 ? d : ''
}
// Código de barras de um disco: um EAN/UPC que não é de um livro (978/979), de uma revista (977), de uso interno
// das lojas (20–29) nem de vales (98/99)
export function eanDeDisco(c) {
  const d = eanValido(c)
  return d && !isbnDoCodigo(d) && !/^(2|97[789]|98|99)/.test(d) ? d : ''
}

// { ficheiro, codigos, linhas: [{texto, x, y, w, h}], texto, isbns (ISBN-13; o do código de barras primeiro), codigo,
//   ean (código de barras de um disco, ou '') }
export function resumo(ficheiro, codigos, linhas) {
  const texto = linhas.map((l) => l.texto).join('\n')
  const codigo = codigos.map(isbnDoCodigo).find(Boolean) || ''
  return { ficheiro, codigos, linhas, texto, codigo, ean: codigos.map(eanDeDisco).find(Boolean) || '', isbns: [...new Set([codigo, ...todosOsIsbn(texto)].filter(Boolean))] }
}

export async function lerFotografias(ficheiros) {
  const out = new Map()
  const bin = await leitor()
  if (bin) {
    // (em blocos, para a linha de comandos não ficar comprida demais)
    for (let i = 0; i < ficheiros.length; i += 50) {
      const bloco = ficheiros.slice(i, i + 50)
      let saida = ''
      try {
        saida = await correr(bin, bloco, { timeout: 60000 + 15000 * bloco.length })
      } catch (e) {
        // (uma fotografia que o leitor não consegue ler não deita fora as outras: uma a uma; as que falharem
        // ficam para o Tesseract, abaixo)
        log.aviso(m('Leitor de códigos de barras: {erro}; a ler as fotografias uma a uma', { erro: String(e.message).split('\n')[0].slice(0, 200) }))
        for (const f of bloco) saida += (await correr(bin, [f], { timeout: 75000 }).catch(() => '')) + '\n'
      }
      for (const l of saida.split('\n').filter(Boolean)) {
        try {
          const j = JSON.parse(l)
          if (!j.erro) out.set(j.ficheiro, resumo(j.ficheiro, j.codigos || [], j.linhas || []))
        } catch (_) {}
      }
    }
  }
  for (const f of ficheiros.filter((x) => !out.has(x))) {
    try {
      const t = await correr(BIN.tesseract, [f, 'stdout', '--tessdata-dir', PASTAS.tessdata, '-l', 'por+eng'], { timeout: 120000 })
      out.set(f, resumo(f, [], t.split('\n').map((s) => s.trim()).filter(Boolean).map((texto) => ({ texto }))))
    } catch (_) {
      out.set(f, resumo(f, [], []))
    }
  }
  return ficheiros.map((f) => out.get(f))
}

// ---------------------------------------------------------------------------
// Separar as referências das outras imagens soltas (antes de as juntar num PDF: ver juntar.js)

// Junta as fotografias do mesmo livro (com algum ISBN em comum: código de barras + ficha técnica)
export function agruparPorLivro(lidas) {
  const livros = []
  for (const l of lidas) {
    const juntos = livros.filter((r) => r.isbns.some((i) => l.isbns.includes(i)))
    const novo = { fotografias: [l], isbns: [...l.isbns] }
    for (const j of juntos) {
      novo.fotografias.push(...j.fotografias)
      novo.isbns.push(...j.isbns)
      livros.splice(livros.indexOf(j), 1)
    }
    novo.isbns = [...new Set(novo.isbns)]
    livros.push(novo)
  }
  // (o ISBN do código de barras é o do exemplar que se tem na mão: vem primeiro)
  for (const r of livros) {
    const cod = r.fotografias.map((f) => f.codigo).filter(Boolean)
    r.isbns.sort((a, b) => cod.includes(b) - cod.includes(a))
  }
  return livros
}

// Num grupo grande de fotografias com o mesmo nome em que só algumas têm ISBN (um livro fotografado página a página,
// e uma das páginas é a ficha técnica), nada sai do grupo: é juntado num PDF como antes.
export function protegerGrupos(ficheiros, comIsbn) {
  const grupos = new Map()
  for (const f of ficheiros) grupos.set(nomeBase(f), [...(grupos.get(nomeBase(f)) || []), f])
  const fica = new Set(comIsbn)
  for (const g of grupos.values()) {
    const n = g.filter((f) => fica.has(f)).length
    if (g.length >= 6 && n && n < g.length / 3) g.forEach((f) => fica.delete(f))
  }
  return fica
}

// discos: com true, as fotografias com o código de barras de um disco (e sem ISBN) saem também, já lidas
export async function separarReferencias(ficheiros, { discos = false } = {}) {
  if (!ficheiros.length) return { livros: [], discos: [], resto: ficheiros }
  let lidas
  try {
    lidas = await lerFotografias(ficheiros)
  } catch (e) {
    log.aviso(m('Não consegui procurar o ISBN nas fotografias ({erro}); seguem o caminho normal', { erro: traduzivel(e) }))
    return { livros: [], discos: [], resto: ficheiros }
  }
  return classificarFotografias(ficheiros, lidas, { discos })
}

// Livros (com ISBN), discos (com o código de barras de um disco e sem ISBN) e o resto (caminho normal).
// A protecção dos livros fotografados página a página conta só as fotografias com ISBN (como antes dos discos): os
// códigos de barras de discos nunca fazem um livro perder a página da ficha técnica; e num grupo protegido também
// não sai nenhum «disco».
export function classificarFotografias(ficheiros, lidas, { discos = false } = {}) {
  const eDisco = (l) => discos && !l.isbns.length && !!l.ean
  const comIsbn = lidas.filter((l) => l.isbns.length).map((l) => l.ficheiro)
  const ficaLivros = protegerGrupos(ficheiros, comIsbn)
  const presos = new Set(comIsbn.filter((f) => !ficaLivros.has(f)).map(nomeBase))
  const ficaDiscos = protegerGrupos(ficheiros, lidas.filter(eDisco).map((l) => l.ficheiro))
  const livros = lidas.filter((l) => ficaLivros.has(l.ficheiro) && l.isbns.length)
  const deDiscos = lidas.filter((l) => eDisco(l) && ficaDiscos.has(l.ficheiro) && !presos.has(nomeBase(l.ficheiro)))
  const saem = new Set([...livros, ...deDiscos].map((l) => l.ficheiro))
  return {
    livros: agruparPorLivro(livros),
    discos: deDiscos,
    resto: ficheiros.filter((f) => !saem.has(f)),
  }
}

// ---------------------------------------------------------------------------
// O que a ficha técnica diz (regras, sem IA): «Título | Elogio da Loucura», «Autor | …», «© copyright Nome, Cidade 2019»

const ROTULOS = [
  ['titulo', /^(t[íi]tulo( em portugu[êe]s| da obra| desta edi[çc][ãa]o)?|title|titre|titolo|titel)$/i],
  ['titulo_original', /^(t[íi]tulo (original|em [a-zà-ú]+)|original title|titre original|titolo originale|originaltitel|t[íi]tulo del original)$/i],
  ['autor', /^(autor(es|a|as)?|authors?|auteurs?|autori?|verfasser|texto|textos)$/i],
  ['tradutor', /^(tradu[çc][ãa]o( e notas| e pref[áa]cio| e introdu[çc][ãa]o)?|traduzido por|translat(ion|ed by)|traducci[óo]n|traduction|traduzione|[üu]bersetzung|vertaling)$/i],
  ['organizador', /^(organiza[çc][ãa]o|coordena[çc][ãa]o|edited by|edi[çc][ãa]o cr[íi]tica|herausgegeben von|a cura di|[ée]dition critique)$/i],
  ['editora', /^(editor|editora|editores|edi[çc][ãa]o de|publisher|published by|[ée]diteur|editore|verlag|uitgever(ij)?|edita|editorial)$/i],
  ['edicao', /^(\d+\s*[.ªaº]*\s*edi[çc][ãa]o|edi[çc][ãa]o|\d+(st|nd|rd|th) edition|edition|first published|primeira edi[çc][ãa]o)$/i],
  ['colecao', /^(cole[çc][ãa]o|s[ée]rie|series|collection|collana|reihe)$/i],
  ['ignorar', /^(isbn|dep[óo]sito legal|e-?mail|tel\.?|telefone|fax|site|internet|capa|concep[çc][ãa]o( de capa)?|design( da capa)?|fotolito|impress[ãa]o|e acabamento|acabamento|pagina[çc][ãa]o|revis[ãa]o|tiragem|composi[çc][ãa]o|printing|printed by|cover( design)?|typeset(ting)?|ilustra[çc](ão|ões)|fotografias?|copyright|distribui[çc][ãa]o|morada|endere[çc]o)$/i],
]
const rotuloDe = (t) => {
  const s = String(t || '').trim().replace(/\s*:\s*$/, '')
  return (ROTULOS.find(([, re]) => re.test(s)) || [])[0] || ''
}
const ANO = /\b(1[5-9]\d{2}|20\d{2})\b/
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'van', 'von', 'der', 'den', 'di', 'du', 'le', 'la', 'del', 'des'])
// «MEM-MARTINS» → «Mem-Martins»; «SPORPRESS» → «Sporpress» (só o que está todo em maiúsculas)
export function semMaiusculas(s) {
  const t = String(s || '').trim()
  if (!t || t !== t.toUpperCase() || !/[A-ZÀ-Ú]{3}/.test(t)) return t
  return t.toLowerCase().replace(/(^|[\s-])(\p{L})(\p{L}*)/gu, (m, a, b, c, i) => (i > 0 && PARTICULAS.has(b + c) ? a + b + c : a + b.toUpperCase() + c))
}
// «SPORPRESS - Soc. Editorial e Distribuidora, Lda.» → «Sporpress»
export function limparEditora(s) {
  let t = String(s || '').trim()
  const antes = t.split(/\s+[-–]\s+/)[0]
  if (antes.length >= 3 && antes !== t) t = antes
  t = t.replace(/,?\s*\b(Lda|Ltda|Ltd|Limited|Inc|S\.?\s?A|GmbH|B\.?V|S\.?L|S\.?r\.?l)\.?\s*$/i, '').trim()
  return semMaiusculas(t)
}
// «© copyright Dina Maria de Oliveira Titan»: um nome de pessoa (2–6 palavras com maiúscula, sem nomes de empresa)
const EMPRESA = /\b(lda|ltd|inc|press|verlag|editora|edi[çc](ões|ao|ão)|editions?|publish\w*|books|university|universidade|universit\w*|gmbh|soc\.|sociedade|company|group|grupo|media|instituto|institute|museum|museu|biblioteca|library)\b/i
export function pareceNome(s) {
  const p = String(s || '').trim().split(/\s+/)
  if (p.length < 2 || p.length > 6 || EMPRESA.test(s) || eInstituicao(s)) return false
  return p.every((w) => PARTICULAS.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'.-]*$/u.test(w))
}

function geometria(linhas) {
  const comCaixa = linhas.filter((l) => l.w && l.h)
  const longas = comCaixa.filter((l) => l.texto.length >= 8)
  // (fotografia de lado: as linhas são mais altas do que largas e as «filas» correm na vertical)
  const vertical = longas.length > 0 && longas.filter((l) => l.h > l.w).length > longas.length / 2
  return {
    vertical,
    linhas: linhas.map((l) => (l.w && l.h ? (vertical ? { ...l, fila: l.x + l.w / 2, col: l.y + l.h / 2, alt: l.w } : { ...l, fila: l.y + l.h / 2, col: l.x + l.w / 2, alt: l.h }) : { ...l })),
  }
}

export function dadosDaFichaTecnica(linhasLidas) {
  const { vertical, linhas } = geometria((linhasLidas || []).filter((l) => String(l.texto || '').trim()))
  const valores = {}
  const por = (k, v) => {
    v = String(v || '').trim()
    if (v && !valores[k]) valores[k] = v
  }
  for (const l of linhas) l.rotulo = rotuloDe(l.texto)
  for (const l of linhas) {
    // «Rótulo: valor» na mesma linha
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(l.texto)
    if (m && rotuloDe(m[1])) {
      por(rotuloDe(m[1]), m[2])
      continue
    }
    const t = /^(translated by|traduzido por|tradu[çc][ãa]o de|traducido por|traduit par|edited by|herausgegeben von|organiza[çc][ãa]o de)\s+(.+)$/i.exec(l.texto)
    if (t) por(/edit|herausg|organiz/i.test(t[1]) ? 'organizador' : 'tradutor', t[2])
    if (!l.rotulo || l.fila === undefined) continue
    // «Rótulo | valor» em duas colunas: a linha da mesma fila, do lado do valor
    const tol = Math.max(l.alt * 0.7, 0.008)
    const valor = linhas
      .filter((o) => o !== l && !o.rotulo && o.fila !== undefined && Math.abs(o.fila - l.fila) <= tol && (vertical || o.col > l.col))
      .sort((a, b) => Math.abs(a.col - l.col) - Math.abs(b.col - l.col))[0]
    if (!valor) continue
    valor.usada = true
    if (l.rotulo === 'edicao') {
      por('edicao', /^\d/.test(l.texto) ? l.texto.replace(/\s*:\s*$/, '') : valor.texto.replace(ANO, '').replace(/[-–,\s]+$/, ''))
      por('ano', (ANO.exec(valor.texto) || [])[1])
    } else por(l.rotulo, valor.texto)
  }
  const texto = linhas.map((l) => l.texto).join('\n')
  // © copyright Nome, Cidade 2019
  for (const l of linhas) {
    const m = /^\s*(©|\(c\)|copyright)\s*(copyright\s*)?(.*)$/i.exec(l.texto)
    if (!m) continue
    por('ano', (ANO.exec(m[3]) || [])[1])
    const partes = m[3].replace(/(all rights reserved|todos os direitos reservados|alle rechte vorbehalten).*$/i, '').replace(new RegExp(ANO.source, 'g'), '').split(',').map((s) => s.trim().replace(/[.\s]+$/, '')).filter(Boolean)
    if (pareceNome(partes[0])) por('titular', partes[0])
    if (partes[1] && /^\p{Lu}[\p{L} '-]{2,30}$/u.test(partes[1])) por('local', partes[1])
  }
  // Morada da editora com código postal português: «2725-171 MEM-MARTINS - PORTUGAL» → Mem-Martins
  const cp = /\b\d{4}-\d{3}\s+([\p{L}][\p{L} '-]*?)(\s+-\s+portugal)?\s*$/imu.exec(texto)
  if (cp) por('local', semMaiusculas(cp[1].trim()))
  const autores = []
  const juntar = (nomes, papel) => {
    for (const n of String(nomes || '').split(/\s*(?:;|\s+e\s+|\s+and\s+|\s+und\s+|\s+et\s+|&)\s*/)) {
      const p = n.trim() && (eInstituicao(n) ? { literal: n.trim(), papel } : pessoa(semMaiusculas(n.trim()), papel))
      if (p && !autores.some((a) => normalizar(a.apelido || a.literal) === normalizar(p.apelido || p.literal))) autores.push(p)
    }
  }
  juntar(valores.autor, 'autor')
  if (!autores.length && valores.titular) juntar(valores.titular, 'autor')
  juntar(valores.organizador, 'editor')
  juntar(valores.tradutor, 'tradutor')
  return {
    titulo: semMaiusculas(valores.titulo || ''),
    titulo_original: valores.titulo_original || '',
    autores,
    editora: limparEditora(valores.editora),
    local: semMaiusculas(valores.local || ''),
    ano: valores.ano || (ANO.exec(valores.edicao || '') || [])[1] || '',
    edicao: valores.edicao || '',
    colecao: valores.colecao || '',
    tese: /\b(proefschrift|dissertation|doctoral thesis|phd thesis|tese de doutoramento|tese de mestrado|disserta[çc][ãa]o de mestrado|th[èe]se de doctorat)\b/i.test(texto),
  }
}

// O primeiro que tem cada campo; autores: juntam-se os que faltam (pelo apelido)
export function juntarDados(...lista) {
  const out = { titulo: '', titulo_original: '', autores: [], editora: '', local: '', ano: '', edicao: '', colecao: '', tese: false, instituicao: '' }
  for (const d of lista.filter(Boolean)) {
    for (const k of Object.keys(out)) {
      if (k === 'autores') {
        for (const a of d.autores || []) {
          const chave = normalizar(a.apelido || a.literal)
          if (chave && !out.autores.some((b) => normalizar(b.apelido || b.literal) === chave)) out.autores.push(a)
        }
      } else if (k === 'tese') out.tese ||= !!d.tese
      else if (!out[k] && d[k]) out[k] = d[k]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// A ficha

async function fichaComIsbn(isbns) {
  const formas = [...new Set(isbns.flatMap((i) => [isbn13(i), isbn10(i)]).filter(Boolean))]
  if (!formas.length) return null
  const filtro = formas.map((_, k) => `isbn = {:i${k}}`).join(' || ')
  const r = await pb.collection('fontes').getList(1, 1, { filter: pb.filter(filtro, Object.fromEntries(formas.map((f, k) => [`i${k}`, f]))), sort: 'created' })
  return r.items[0] || null
}

// Destino das fotografias já usadas: uma pasta do Lixo do Mac por cada 10 minutos de trabalho
// (nome: «Fotografias de ISBN» ou «Fotografias de discos»; reserva: a pasta em nao_processados sem Lixo do Mac)
const lixos = new Map()
export async function paraOLixo(ficheiros, { nome = 'Fotografias de ISBN', reserva = 'fotografias_isbn_tratadas' } = {}) {
  let l = lixos.get(nome)
  if (!l || Date.now() - l.usadoEm > 10 * 60000) {
    l = { pasta: '', usadoEm: 0 }
    try {
      l.pasta = pastaDoLixo(nome)
    } catch (e) {
      // (sem Lixo do Mac encontrado: ficam à parte, nunca se apagam)
      l.pasta = path.join(PASTAS.naoProcessados, reserva)
      const fotografias = nome === 'Fotografias de ISBN' ? m('fotografias de ISBN') : nome === 'Fotografias de discos' ? m('fotografias de discos') : nome.replace(/^F/, 'f')
      log.aviso(m('{motivo} As {fotografias} já usadas ficam em nao_processados/{reserva}/', { motivo: traduzivel(e), fotografias, reserva }))
    }
    lixos.set(nome, l)
  }
  l.usadoEm = Date.now()
  for (const f of ficheiros) if (fs.existsSync(f)) await F.mover(f, l.pasta, path.basename(f))
  return l.pasta
}

// (raiz: até onde se apagam as pastas que ficaram vazias)
export async function arrumar(fotos, raiz = PASTAS.watch) {
  for (const d of new Set(fotos.map((f) => path.dirname(f)))) await F.limparPastasVazias(d, raiz).catch(() => {})
}

export const numeroDe = (f) => `#${String(f.numero || '').padStart(4, '0')}`
export const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)

export async function tratarReferencia(livro) {
  await esperarVez()
  await garantirSessao()
  const defs = await definicoes()
  const fotos = livro.fotografias.filter((f) => fs.existsSync(f.ficheiro))
  if (!fotos.length) return null
  const caminhos = fotos.map((f) => f.ficheiro)
  const nomes = caminhos.map((f) => path.basename(f)).join(', ')

  // O catálogo, pelo ISBN do exemplar (o do código de barras primeiro)
  let registo = null
  let isbn = livro.isbns[0]
  for (const i of livro.isbns) {
    try {
      registo = await porIsbn(i, defs)
    } catch (_) {}
    if (registo) {
      isbn = i
      break
    }
  }
  // A ficha técnica: as regras, e a IA local quando nenhum catálogo encontrou o livro
  const regras = juntarDados(...fotos.map((f) => dadosDaFichaTecnica(f.linhas)))
  const existente = await fichaComIsbn(livro.isbns)
  let ia = null
  if (!registo && !existente) {
    const ficha = [...fotos].sort((a, b) => b.texto.length - a.texto.length)[0]
    if (ficha.texto.length >= 40 && (await iaDisponivel(defs))) {
      try {
        ia = await lerFichaTecnica(ficha.ficheiro, defs, ficha.texto)
      } catch (e) {
        log.aviso(m('IA local na ficha técnica de {ficheiro}: {erro}', { ficheiro: path.basename(ficha.ficheiro), erro: traduzivel(e) }))
      }
    }
  }
  const foto = juntarDados(regras, ia)

  // Já existe uma ficha com este ISBN: etiqueta «Em papel» e só os campos que lhe faltam
  if (existente) {
    const junta = {}
    if (!(existente.tags || []).includes(ETIQUETA)) junta.tags = [...(existente.tags || []), ETIQUETA]
    const novos = { autores: registo?.autores?.length ? registo.autores : foto.autores, data: registo?.data || foto.ano, editora: registo?.editora || foto.editora, local: registo?.local || foto.local }
    for (const [k, v] of Object.entries(novos)) if (vazio(existente[k]) && !vazio(v)) junta[k] = v
    if (Object.keys(junta).length) await pb.collection('fontes').update(existente.id, junta)
    const lixo = await paraOLixo(caminhos)
    await arrumar(caminhos)
    const camposJuntos = Object.keys(junta).filter((k) => k !== 'tags')
    log.info(
      m('Livro em papel: já existia «{titulo}» ({numero}, ISBN {isbn}){etiqueta}{campos}; fotografias ({nomes}) no Lixo ({lixo})', {
        titulo: existente.titulo,
        numero: numeroDe(existente),
        isbn,
        etiqueta: junta.tags ? m(': etiqueta «{etiqueta}»', { etiqueta: ETIQUETA }) : '',
        campos: camposJuntos.length ? m(' e {campos}', { campos: camposJuntos.join(', ') }) : '',
        nomes,
        lixo: path.basename(lixo),
      })
    )
    return { acao: 'existente', id: existente.id }
  }

  const titulo = registo?.titulo || foto.titulo
  if (!titulo) {
    const destino = path.join(PASTAS.naoProcessados, 'referencias_por_identificar')
    for (const f of caminhos) await F.mover(f, destino, path.basename(f))
    await arrumar(caminhos)
    log.aviso(m('ISBN {isbn} lido em {nomes}, mas nenhum catálogo o encontrou e a fotografia não diz o título: fotografias em nao_processados/referencias_por_identificar/ (fotografe também a página de rosto ou a ficha técnica, ou faça a ficha à mão)', { isbn, nomes }))
    return { acao: 'por_identificar' }
  }

  // Autores: os do catálogo, e da fotografia o tradutor/organizador que o catálogo não tem
  const autores = registo?.autores?.length ? [...registo.autores] : [...foto.autores]
  if (registo) {
    for (const a of foto.autores.filter((x) => x.papel !== 'autor')) {
      const chave = normalizar(a.apelido || a.literal)
      if (!autores.some((b) => normalizar(b.apelido || b.literal) === chave)) autores.push(a)
    }
  }
  const tese = registo ? registo.tipo_sugerido === 'Tese / dissertação' : foto.tese
  const tipo = await tipoPorNome(tese ? 'Tese / dissertação' : registo?.tipo_sugerido === 'Partitura' ? 'Partitura' : 'Livro')
  const data = registo?.data || foto.ano
  const notas = []
  if (registo && foto.ano && registo.data && String(registo.data).slice(0, 4) !== foto.ano) notas.push(`A fotografia diz ${foto.ano}; ${registo.fonte} diz ${registo.data}.`)
  const metadados = Object.fromEntries(
    Object.entries({
      ...(registo?.metadados || {}),
      edicao: registo?.metadados?.edicao || foto.edicao,
      colecao: registo?.metadados?.colecao || foto.colecao,
      titulo_original: foto.titulo_original,
      instituicao: registo?.metadados?.instituicao || foto.instituicao,
      fotografias_isbn: nomes,
    }).filter(([, v]) => !vazio(v)),
  )
  let estado = registo && autores.length && data ? 'completo' : 'a_rever'
  if (!registo) notas.push(`Dados lidos na fotografia${ia ? ' (com a IA local)' : ''}; nenhum catálogo encontrou o ISBN ${isbn}: conferir com as fotografias originais.`)
  else if (estado !== 'completo') notas.push(`${registo.fonte} encontrou o ISBN ${isbn}, mas falta ${[!autores.length && 'o autor', !data && 'a data'].filter(Boolean).join(' e ')}.`)
  if (notas.length) metadados.nota_revisao = notas.join(' ')

  // Sem catálogo: as fotografias ficam ligadas à ficha, para conferir
  let originais = ''
  if (!registo) {
    const base = F.seguro(`ISBN ${isbn}`)
    let nomePasta = base
    for (let n = 2; fs.existsSync(path.join(PASTAS.biblioteca, ORIGINAIS, nomePasta)); n++) nomePasta = `${base}_${n}`
    originais = `${ORIGINAIS}/${nomePasta}`
    metadados.originais = originais
  }
  const ficha = await pb.collection('fontes').create({
    tipo: tipo?.id,
    titulo,
    autores,
    data,
    editora: registo?.editora || foto.editora,
    local: registo?.local || foto.local,
    isbn,
    url: registo?.url || '',
    palavras_chave: registo?.palavras_chave || [],
    tags: [ETIQUETA],
    estado,
    origem: registo ? registo.fonte : 'fotografia do ISBN',
    ocr_estado: 'nao_aplicavel',
    metadados,
  })
  if (originais) {
    for (const f of caminhos) await F.mover(f, path.join(PASTAS.biblioteca, originais), path.basename(f))
    await arrumar(caminhos)
    log.info(m('Livro em papel: «{titulo}» ({numero}, ISBN {isbn}) feito com os dados da fotografia, por rever; fotografias em {originais}', { titulo, numero: numeroDe(ficha), isbn, originais }))
  } else {
    const lixo = await paraOLixo(caminhos)
    await arrumar(caminhos)
    const vars = { titulo, numero: numeroDe(ficha), isbn, fonte: registo.fonte, nomes, lixo: path.basename(lixo) }
    log.info(estado === 'completo' ? m('Livro em papel: «{titulo}» ({numero}, ISBN {isbn}, {fonte}); fotografias ({nomes}) no Lixo ({lixo})', vars) : m('Livro em papel: «{titulo}» ({numero}, ISBN {isbn}, {fonte}), por rever; fotografias ({nomes}) no Lixo ({lixo})', vars))
  }
  return { acao: 'nova', id: ficha.id, estado }
}

// Uma referência de cada vez (o catálogo e a IA não gostam de pedidos em paralelo)
let cadeia = Promise.resolve()
export function tratarReferencias(livros) {
  for (const l of livros) {
    cadeia = cadeia.then(() => tratarReferencia(l)).catch((e) => log.erro(m('Livro em papel ({ficheiros}): {erro}', { ficheiros: l.fotografias.map((f) => path.basename(f.ficheiro)).join(', '), erro: traduzivel(e) })))
  }
  return cadeia
}
