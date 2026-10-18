// Espaço ocupado por biblioteca/_duplicados: alerta, verificação e Lixo (pedido do Pedro, 1/10/2026).
//
// - medir(): tamanho de _duplicados e das fontes (o resto da pasta biblioteca); alerta acima de 10 %
//   (definição "limite_duplicados", em %, se existir).
// - verificar(): cada ficheiro de _duplicados tem equivalente na biblioteca?
//     seguro  = cópia exatamente igual (sha256) numa ficha (principal ou ficheiro adicional) ou em
//               _originais, ou PDF quase igual retirado pelo ecrã/comando Duplicados (duplicados_retirados),
//               ou repetido dentro do próprio _duplicados (fica a 1.ª cópia);
//     por ver = sem equivalente: o Pedro decide um a um, os maiores primeiro.
//   Resultado em app/dados/verificacao-duplicados.json; hashes em app/cache/hashes-ficheiros.json.
// - porNoLixo(): move para o Lixo do Mac (no disco Rocinante: /Volumes/Rocinante/.Trashes/<uid>), numa
//   pasta "Duplicados AAAA-MM-DD HHhMM" com as mesmas subpastas. Recuperável até o Pedro esvaziar o Lixo.
//   Nada é apagado aqui. Antes de mover um "seguro", confirma-se outra vez que o equivalente existe.
// - devolver(): um "por ver" volta à watch folder e passa a ter ficha própria.
// - Comparar (pedido do Pedro, 4/10): cada "por ver" leva a origem (porque foi posto de parte e com que ficha se
//   confundiu: registo app/dados/duplicados-origem.jsonl e, para os antigos, o registo do serviço) e a comparação
//   das páginas com o ficheiro dessa ficha. Páginas iguais → seguro; o ecrã mostra as duas páginas lado a lado.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { PASTAS, DUPLICADOS, ORIGINAIS, BIN } from './config.js'
import { pb, garantirSessao, definicoes } from './pb.js'
import { log } from './registo.js'
import { m, erro, traduzivel } from './mensagens.js'
import { compararFicheiros, maisParecidaPelaCapa, guardarImpressoes } from './duplicados.js'

const RAIZ_DUP = path.join(PASTAS.biblioteca, DUPLICADOS)
const RESULTADO = path.join(PASTAS.dados, 'verificacao-duplicados.json')
const CACHE = path.join(PASTAS.app, 'cache', 'hashes-ficheiros.json')
const ORIGENS = path.join(PASTAS.dados, 'duplicados-origem.jsonl')
// (o registo do serviço escrito pelo iniciar.sh; a cópia de teste aponta para outro com REGISTO_SERVICO)
const REGISTO_SERVICO = process.env.REGISTO_SERVICO || path.join(PASTAS.app, 'registos', 'servico.log')
const LIMITE_OMISSAO = 10 // % do espaço das fontes

// ---------------------------------------------------------------------------
// Origem: porque está cada ficheiro em _duplicados

// Chamado por quem põe um ficheiro (ou pasta) em _duplicados: { motivo, numero, titulo }
export function registarOrigem(destino, info) {
  try {
    fs.mkdirSync(path.dirname(ORIGENS), { recursive: true })
    fs.appendFileSync(ORIGENS, JSON.stringify({ ficheiro: rel(destino), quando: new Date().toISOString(), ...info }) + '\n')
  } catch (e) {
    log.aviso(m('Origem do duplicado não registada: {erro}', { erro: traduzivel(e) }))
  }
}

// Linhas do registo do serviço (antes de 4/10 a origem só ficava lá)
const LINHAS_DO_REGISTO = [
  [/Outra cópia de «(.*)» \(#(\d+)\): movida para (_duplicados\/.+)$/, 'mesma_obra'],
  [/As mesmas fotografias de «(.*)» \(#(\d+)\): movidas para (_duplicados\/.+)$/, 'mesmas_fotografias'],
  [/Duplicado de um ficheiro de «(.*)»: movido para (_duplicados\/.+)$/, 'copia_exata_extra'],
  [/Duplicado de «(.*)»: movido para (_duplicados\/.+)$/, 'copia_exata'],
  [/Duplicado #\d+ retirado a favor de #(\d+) «(.*)»: ficheiro em (_duplicados\/.+)$/, 'quase_igual', true],
  [/Originais repetidos: .* → (_duplicados\/.+)$/, 'originais_repetidos'],
]

function lerOrigens() {
  const origens = new Map()
  try {
    for (const l of fs.readFileSync(REGISTO_SERVICO, 'utf8').split('\n')) {
      if (!l.includes('_duplicados/')) continue
      for (const [re, motivo, numeroPrimeiro] of LINHAS_DO_REGISTO) {
        const m = re.exec(l.trim())
        if (!m) continue
        const g = m.slice(1)
        const ficheiro = g.pop()
        const [titulo, numero] = numeroPrimeiro ? [g[1], g[0]] : g
        origens.set(ficheiro, { motivo, titulo, numero: numero ? Number(numero) : undefined })
        break
      }
    }
  } catch (_) {}
  try {
    for (const l of fs.readFileSync(ORIGENS, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try {
        const o = JSON.parse(l)
        origens.set(o.ficheiro, o)
      } catch (_) {}
    }
  } catch (_) {}
  return origens
}

// Origem de um ficheiro de _duplicados (ou da pasta onde está: "X - originais/página.jpg")
function origemDe(origens, relativo) {
  for (let p = relativo; p.includes('/'); p = p.slice(0, p.lastIndexOf('/'))) if (origens.has(p)) return origens.get(p)
  return null
}

// Página p de um ficheiro (PDF ou imagem) em PNG pequeno, como endereço data: para o ecrã
async function imagemPagina(abs, p = 1) {
  const executar = (cmd, args) =>
    new Promise((ok) => {
      const pr = spawn(cmd, args)
      const partes = []
      const t = setTimeout(() => pr.kill('SIGKILL'), 60000)
      pr.stdout.on('data', (d) => partes.push(d))
      pr.on('error', () => (clearTimeout(t), ok(null)))
      pr.on('close', (c) => (clearTimeout(t), ok(c === 0 ? Buffer.concat(partes) : null)))
    })
  if (/\.pdf$/i.test(abs)) {
    const png = await executar(BIN.pdftoppm, ['-png', '-scale-to', '700', '-f', String(p), '-l', String(p), abs])
    return png?.length ? 'data:image/png;base64,' + png.toString('base64') : null
  }
  if (/\.(jpe?g|png|tiff?|gif|heic|webp|bmp)$/i.test(abs)) {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'pagina-'))
    try {
      const saida = path.join(tmp, 'p.jpg')
      await executar('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '700', abs, '--out', saida])
      return fs.existsSync(saida) ? 'data:image/jpeg;base64,' + (await fsp.readFile(saida)).toString('base64') : null
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true })
    }
  }
  return null
}

const rel = (p) => path.relative(PASTAS.biblioteca, p).split(path.sep).join('/')
const dentroDe = (p, dir) => path.resolve(p).startsWith(path.resolve(dir) + path.sep)

function* todos(dir) {
  let entradas = []
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_) {
    return
  }
  for (const e of entradas) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* todos(p)
    else if (e.isFile()) yield p
  }
}

// ---------------------------------------------------------------------------
// Medir

let ultimaMedicao = null

export async function medir() {
  let dup = 0
  let total = 0
  let n = 0
  for (const p of todos(PASTAS.biblioteca)) {
    const t = fs.statSync(p).size
    total += t
    if (dentroDe(p, RAIZ_DUP)) (dup += t), n++
  }
  const fontes = total - dup
  let limite = LIMITE_OMISSAO
  try {
    limite = Number((await definicoes()).limite_duplicados) || LIMITE_OMISSAO
  } catch (_) {}
  const percentagem = fontes ? Math.round((1000 * dup) / fontes) / 10 : 0
  ultimaMedicao = { medido_em: new Date().toISOString(), duplicados_bytes: dup, duplicados_ficheiros: n, fontes_bytes: fontes, percentagem, limite, acima: percentagem > limite }
  return ultimaMedicao
}

// (para o aviso no topo da página: medição com no máximo 1 hora)
export async function estado() {
  if (!ultimaMedicao || Date.now() - Date.parse(ultimaMedicao.medido_em) > 3600e3) await medir()
  return { ...ultimaMedicao, verificacao: resumo(), a_verificar: emCurso }
}

// ---------------------------------------------------------------------------
// Verificar

let cache = null
function lerCache() {
  if (!cache) {
    try {
      // (um ficheiro com «null» — gravado sem a cache carregada, até 4/10 — fazia falhar todos os hashes em silêncio)
      cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) || {}
    } catch (_) {
      cache = {}
    }
  }
  return cache
}
async function gravarCache() {
  if (!cache) return
  await fsp.mkdir(path.dirname(CACHE), { recursive: true })
  await fsp.writeFile(CACHE + '.tmp', JSON.stringify(cache))
  await fsp.rename(CACHE + '.tmp', CACHE)
}

// sha256, com prioridade baixa (o disco é partilhado com o resto da biblioteca)
async function hash(p) {
  const st = fs.statSync(p)
  const chave = `${p}|${st.size}|${Math.floor(st.mtimeMs / 1000)}`
  const c = lerCache()
  if (c[chave]) return c[chave]
  const h = crypto.createHash('sha256')
  await new Promise((ok, falha) => fs.createReadStream(p, { highWaterMark: 4 << 20 }).on('data', (d) => h.update(d)).on('end', ok).on('error', falha))
  return (c[chave] = h.digest('hex'))
}

let emCurso = null

// A fase em curso: o texto português (fase) e a mensagem traduzível (fase_t)
function porFase(t) {
  emCurso.fase = t.msg
  emCurso.fase_t = t
}

function lerResultado() {
  try {
    return JSON.parse(fs.readFileSync(RESULTADO, 'utf8'))
  } catch (_) {
    return null
  }
}

function resumo() {
  const r = lerResultado()
  if (!r) return null
  const soma = (l) => l.reduce((s, x) => s + x.tamanho, 0)
  return { feita_em: r.feita_em, seguros: r.seguros.length, seguros_bytes: soma(r.seguros), por_ver: r.por_ver.length, por_ver_bytes: soma(r.por_ver) }
}

// Corre em segundo plano; o estado (fase, n de total) fica em `emCurso` até acabar
export function verificar() {
  if (emCurso) return emCurso
  emCurso = { fase: 'A começar', fase_t: m('A começar'), feitos: 0, total: 0 }
  executarVerificacao()
    .catch((e) => log.erro(m('Verificação de _duplicados: {erro}', { erro: traduzivel(e) })))
    .finally(() => (emCurso = null))
  return emCurso
}

async function executarVerificacao() {
  await garantirSessao()
  // Fichas: hash do ficheiro principal e dos adicionais; PDFs quase iguais retirados; nomes conhecidos
  const fichas = await pb.collection('fontes').getFullList({ fields: 'id,numero,titulo,ficheiro,hash,paginas,ficheiros_extra,ficheiro_original,metadados' })
  const porHash = new Map()
  const retirados = new Map()
  const porNome = new Map()
  const nomeNorm = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/(_\d+)+$/, '').replace(/[^a-z0-9]+/g, '')
  const juntar = (m, k, v) => k && m.set(k, [...(m.get(k) || []), v])
  for (const f of fichas) {
    if (f.ficheiro && f.hash) juntar(porHash, f.hash, { numero: f.numero, ficheiro: f.ficheiro })
    for (const x of f.ficheiros_extra || []) if (x.ficheiro && x.hash) juntar(porHash, x.hash, { numero: f.numero, ficheiro: x.ficheiro })
    for (const r of f.metadados?.duplicados_retirados || []) if (r.guardado_em) retirados.set(r.guardado_em, { numero: f.numero, ficheiro: f.ficheiro })
    for (const n of [f.ficheiro_original, ...String(f.metadados?.nomes_alternativos || '').split(' | '), f.ficheiro && path.basename(f.ficheiro)]) {
      const k = nomeNorm(n)
      if (k.length >= 6) juntar(porNome, k, f.numero)
    }
  }

  const dup = [...todos(RAIZ_DUP)]
  const ori = [...todos(path.join(PASTAS.biblioteca, ORIGINAIS))]
  emCurso.total = dup.length + ori.length
  porFase(m('A comparar o conteúdo dos ficheiros (a 1.ª vez demora; depois é rápido)'))
  const hd = new Map()
  const ho = new Map()
  let i = 0
  for (const [lista, mapa] of [[dup, hd], [ori, ho]]) {
    for (const p of lista) {
      try {
        mapa.set(p, await hash(p))
      } catch (_) {}
      emCurso.feitos = ++i
      if (i % 500 === 0) await gravarCache()
    }
  }
  await gravarCache()

  const oriPorHash = new Map()
  for (const [p, h] of ho) juntar(oriPorHash, h, p)
  const dupPorHash = new Map()
  for (const p of dup) if (hd.has(p)) juntar(dupPorHash, hd.get(p), p)

  porFase(m('A confirmar as cópias na biblioteca'))
  const confirmados = new Map()
  async function naBiblioteca(h) {
    for (const x of porHash.get(h) || []) {
      const abs = path.join(PASTAS.biblioteca, x.ficheiro)
      if (!fs.existsSync(abs)) continue
      if (!confirmados.has(abs)) confirmados.set(abs, await hash(abs).catch(() => ''))
      if (confirmados.get(abs) === h) return { equivalente: x.ficheiro, numero: x.numero }
    }
    for (const p of oriPorHash.get(h) || []) return { equivalente: rel(p) }
    return null
  }

  const seguros = []
  const porVer = []
  for (const p of dup) {
    const tamanho = fs.statSync(p).size
    const h = hd.get(p)
    const base = { ficheiro: rel(p), tamanho, hash: h }
    const eq = h && (await naBiblioteca(h))
    if (eq) {
      seguros.push({ ...base, motivo: 'cópia exacta', ...eq })
      continue
    }
    const r = retirados.get(rel(p))
    if (r?.ficheiro && fs.existsSync(path.join(PASTAS.biblioteca, r.ficheiro))) {
      seguros.push({ ...base, motivo: 'quase igual (páginas comparadas)', equivalente: r.ficheiro, numero: r.numero })
      continue
    }
    const iguais = h ? dupPorHash.get(h) || [] : []
    if (iguais.length > 1 && iguais[0] !== p) {
      seguros.push({ ...base, motivo: 'repetido dentro de _duplicados', equivalente: rel(iguais[0]) })
      continue
    }
    // (pista para o Pedro: uma ficha com um nome de ficheiro parecido)
    const talvez = [...new Set(porNome.get(nomeNorm(path.basename(p))) || [])].slice(0, 3)
    porVer.push({ ...base, talvez })
  }
  await gravarCache()

  // Porque está aqui e com que ficha se confundiu; páginas iguais às dessa ficha → seguro
  porFase(m('A comparar as páginas com as fichas'))
  emCurso.feitos = 0
  emCurso.total = porVer.length
  const comparados = await compararComFichas(porVer, fichas, { aoProgresso: (n) => (emCurso.feitos = n) })
  const iguais = comparados.filter((x) => x.comparacao?.resultado === 'igual')
  for (const x of iguais) seguros.push({ ficheiro: x.ficheiro, tamanho: x.tamanho, hash: x.hash, motivo: 'páginas iguais', equivalente: x.ficha.ficheiro, numero: x.ficha.numero })
  porVer.length = 0
  porVer.push(...comparados.filter((x) => x.comparacao?.resultado !== 'igual'))
  porVer.sort((a, b) => b.tamanho - a.tamanho) // os maiores primeiro
  await fsp.mkdir(path.dirname(RESULTADO), { recursive: true })
  await fsp.writeFile(RESULTADO + '.tmp', JSON.stringify({ feita_em: new Date().toISOString(), seguros, por_ver: porVer, decididos: lerResultado()?.decididos || {} }))
  await fsp.rename(RESULTADO + '.tmp', RESULTADO)
  await medir()
  log.info(m('Verificação de _duplicados: {seguros} seguros, {por_ver} por ver', { seguros: seguros.length, por_ver: porVer.length }))
}

// Para cada "por ver": origem (registo), a ficha com que se confundiu e a comparação das páginas com o ficheiro dela.
// Sem ficha conhecida: a ficha com o mesmo título (se só houver uma) ou, num PDF, a de 1.ª página mais parecida.
// Só lê (serve à verificação e à simulação do comando rever_outras_copias.js).
export async function compararComFichas(porVer, fichas, { aoProgresso = () => {} } = {}) {
  const origens = lerOrigens()
  const porNumero = new Map(fichas.map((f) => [f.numero, f]))
  const tituloNorm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const porTitulo = new Map()
  for (const f of fichas) if (f.ficheiro) porTitulo.set(tituloNorm(f.titulo), [...(porTitulo.get(tituloNorm(f.titulo)) || []), f])
  const chaveDe = (abs, h) => {
    try {
      return h ? `${h}:${fs.statSync(abs).size}` : undefined
    } catch (_) {
      return undefined
    }
  }
  let porChave = null // (só se for preciso: hash:tamanho → numero, para a pista pela capa)
  const saida = []
  let i = 0
  for (const x of porVer) {
    aoProgresso(++i, porVer.length)
    const abs = path.join(PASTAS.biblioteca, x.ficheiro)
    const origem = origemDe(origens, x.ficheiro)
    let ficha = origem?.numero ? porNumero.get(origem.numero) : null
    let pista = ficha ? 'registo' : ''
    if (!ficha && origem?.titulo) {
      const mesmos = porTitulo.get(tituloNorm(origem.titulo)) || []
      if (mesmos.length === 1) (ficha = mesmos[0]), (pista = 'título')
    }
    if (!ficha && /\.pdf$/i.test(x.ficheiro)) {
      if (!porChave) {
        porChave = new Map()
        for (const f of fichas) {
          if (!f.ficheiro || !f.hash || !/\.pdf$/i.test(f.ficheiro)) continue
          const k = chaveDe(path.join(PASTAS.biblioteca, f.ficheiro), f.hash)
          if (k) porChave.set(k, f.numero)
        }
      }
      const parecida = await maisParecidaPelaCapa({ abs, chave: chaveDe(abs, x.hash) }, porChave).catch(() => null)
      if (parecida) (ficha = porNumero.get(parecida.numero)), (pista = '1.ª página parecida')
    }
    if (!ficha && x.talvez?.length) (ficha = porNumero.get(x.talvez[0])), (pista = 'nome do ficheiro parecido')
    const absFicha = ficha?.ficheiro ? path.join(PASTAS.biblioteca, ficha.ficheiro) : ''
    let comparacao = null
    if (absFicha && fs.existsSync(absFicha) && fs.existsSync(abs)) {
      comparacao = await compararFicheiros({ abs, chave: chaveDe(abs, x.hash) }, { abs: absFicha, chave: chaveDe(absFicha, ficha.hash) }).catch(() => null)
    }
    saida.push({
      ...x,
      origem: origem ? { motivo: origem.motivo, titulo: origem.titulo, numero: origem.numero } : null,
      ficha: ficha ? { id: ficha.id, numero: ficha.numero, titulo: ficha.titulo, ficheiro: ficha.ficheiro, pista } : null,
      comparacao,
    })
  }
  await guardarImpressoes()
  return saida
}

// Duas páginas lado a lado (a página p do ficheiro de _duplicados e a mesma da ficha com que se confundiu)
export async function compararPagina({ ficheiro, numero, p = 1 }) {
  const abs = path.join(PASTAS.biblioteca, String(ficheiro || ''))
  if (!dentroDe(abs, RAIZ_DUP) || !fs.existsSync(abs)) throw erro('Ficheiro não encontrado em _duplicados.')
  const pg = Math.max(1, Number(p) || 1)
  const res = { duplicado: await imagemPagina(abs, pg) }
  if (numero) {
    await garantirSessao()
    const f = await pb.collection('fontes').getFirstListItem(pb.filter('numero = {:n}', { n: Number(numero) }), { fields: 'id,numero,titulo,ficheiro' })
    const absFicha = f.ficheiro ? path.join(PASTAS.biblioteca, f.ficheiro) : ''
    if (absFicha && dentroDe(absFicha, PASTAS.biblioteca) && fs.existsSync(absFicha)) res.ficha = await imagemPagina(absFicha, pg)
  }
  return res
}

// Lista "por ver" para o ecrã (os maiores primeiro), sem os que o Pedro mandou manter
export function porVer({ desde = 0, quantos = 50 } = {}) {
  const r = lerResultado()
  if (!r) return { lista: [], total: 0 }
  const lista = r.por_ver.filter((x) => fs.existsSync(path.join(PASTAS.biblioteca, x.ficheiro)) && !r.decididos?.[x.ficheiro])
  return { lista: lista.slice(desde, desde + quantos), total: lista.length }
}

// ---------------------------------------------------------------------------
// Lixo e devolução

// (nome: «Duplicados» ou «Fontes apagadas»; cada vez uma pasta nova com a data e a hora)
export function pastaDoLixo(nome = 'Duplicados') {
  const uid = os.userInfo().uid
  const volume = (/^(\/Volumes\/[^/]+)/.exec(PASTAS.biblioteca) || [])[1]
  // (no disco externo, o Lixo do Mac para esse disco é .Trashes/<uid>; mover para lá é instantâneo)
  // (a cópia de teste usa LIXO_DIR, para não pôr nada no Lixo verdadeiro do Pedro)
  const lixo = process.env.LIXO_DIR || (volume ? path.join(volume, '.Trashes', String(uid)) : path.join(os.homedir(), '.Trash'))
  if (!fs.existsSync(lixo)) throw erro('Não encontrei o Lixo do Mac em {lixo}.', { lixo })
  const d = new Date()
  const carimbo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
  return path.join(lixo, `${nome} ${carimbo}`)
}

async function moverPara(abs, destinoDir, relativo) {
  const alvo = path.join(destinoDir, relativo)
  await fsp.mkdir(path.dirname(alvo), { recursive: true })
  await fsp.rename(abs, alvo)
}

async function limparVazias(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = path.join(dir, e.name)
    await limparVazias(p)
    const resto = fs.readdirSync(p).filter((n) => n !== '.DS_Store')
    if (!resto.length) await fsp.rm(p, { recursive: true }).catch(() => {})
  }
}

// Pôr no Lixo: todos os "seguros" (ficheiros omitido) ou os "por ver" indicados pelo Pedro, um a um
export async function porNoLixo({ ficheiros } = {}) {
  const r = lerResultado()
  if (!r) throw erro('Faça primeiro a verificação.')
  const lixo = pastaDoLixo()
  const escolhidos = ficheiros ? r.por_ver.filter((x) => ficheiros.includes(x.ficheiro)) : r.seguros
  let movidos = 0
  let bytes = 0
  const saltados = []
  for (const x of escolhidos) {
    const abs = path.join(PASTAS.biblioteca, x.ficheiro)
    if (!dentroDe(abs, RAIZ_DUP) || !fs.existsSync(abs)) continue
    // Seguro: confirmar de novo (o ficheiro não mudou e o equivalente ainda existe)
    if (!ficheiros) {
      const eq = x.equivalente && path.join(PASTAS.biblioteca, x.equivalente)
      const igual = (await hash(abs).catch(() => '')) === x.hash
      if (!igual || !eq || !fs.existsSync(eq)) {
        saltados.push(x.ficheiro)
        continue
      }
    }
    await moverPara(abs, lixo, path.relative(RAIZ_DUP, abs))
    movidos++
    bytes += x.tamanho
  }
  await limparVazias(RAIZ_DUP)
  await gravarCache()
  // (o resultado deixa de ter os que foram para o Lixo)
  const fora = new Set(escolhidos.map((x) => x.ficheiro).filter((f) => !saltados.includes(f)))
  r.seguros = r.seguros.filter((x) => !fora.has(x.ficheiro))
  r.por_ver = r.por_ver.filter((x) => !fora.has(x.ficheiro))
  await fsp.writeFile(RESULTADO, JSON.stringify(r))
  log.info(
    m('{movidos} duplicados postos no Lixo do Mac ({gb} GB) em {lixo}{resto}', {
      movidos,
      gb: (bytes / 1e9).toFixed(1),
      lixo,
      resto: saltados.length ? m('; {n} saltados (mudaram desde a verificação)', { n: saltados.length }) : '',
    })
  )
  await medir()
  return { movidos, bytes, saltados: saltados.length, lixo: path.basename(lixo) }
}

// Um "por ver" que afinal é uma fonte: volta à watch folder (fica com ficha própria)
export async function devolver({ ficheiro }) {
  const abs = path.join(PASTAS.biblioteca, String(ficheiro || ''))
  if (!dentroDe(abs, RAIZ_DUP) || !fs.existsSync(abs)) throw erro('Ficheiro não encontrado em _duplicados.')
  let alvo = path.join(PASTAS.watch, path.basename(abs))
  for (let i = 2; fs.existsSync(alvo); i++) alvo = path.join(PASTAS.watch, path.basename(abs).replace(/(\.[^.]+)?$/, `_${i}$1`))
  await fsp.rename(abs, alvo).catch(async (e) => {
    if (e.code !== 'EXDEV') throw e
    await fsp.copyFile(abs, alvo)
    await fsp.unlink(abs)
  })
  log.info(m('Devolvido à watch folder: {ficheiro}', { ficheiro }))
  return { ok: true }
}

// "Manter em _duplicados" (não volta a aparecer na lista por ver)
export async function manter({ ficheiro }) {
  const r = lerResultado()
  if (!r) throw erro('Faça primeiro a verificação.')
  r.decididos = { ...(r.decididos || {}), [ficheiro]: 'manter' }
  await fsp.writeFile(RESULTADO, JSON.stringify(r))
  return { ok: true }
}

// Abrir no Mac (Pré-visualização) ou mostrar no Finder — só funciona no próprio Mac da biblioteca
export async function abrir({ ficheiro, finder }) {
  const abs = path.join(PASTAS.biblioteca, String(ficheiro || ''))
  if (!dentroDe(abs, PASTAS.biblioteca) || !fs.existsSync(abs)) throw erro('Ficheiro não encontrado.')
  spawn('open', finder ? ['-R', abs] : [abs], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true }
}
