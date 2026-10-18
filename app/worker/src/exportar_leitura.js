// Cópia de leitura do TINCTORIS num disco externo (pedido do Pedro, 5/10/2026).
// Contrato com a página: app/leitura/FORMATO.md. Abre-se com duplo clique em qualquer computador, sem servidor.
// - a base lê-se com `sqlite3 -readonly` (um só instantâneo); a pasta biblioteca/ só se lê;
// - no destino só se escreve em biblioteca/, dados/, leitura/ e nos 3 ficheiros da raiz;
// - cada ficheiro copia-se para «….parcial» (criado de novo, sem seguir ligações) e só depois recebe o nome final (NFC);
// - a sincronização compara com .tinctoris-leitura.json: só copia o que mudou e apaga o que já não pertence a nenhuma ficha;
// - guardas antes de apagar: amostra sobre cópia completa recusada, confirmação escrita quando apaga muito (§5 do FORMATO.md),
//   um exportador de cada vez por disco (.tinctoris-leitura.bloqueio).
// Uso: planear(opcoes) → plano (simulação); aplicar(plano, { aoProgresso, maxApagar, confirmarApagar }) → faz.
// Linha de comandos: node src/exportar_leitura.js --destino DIR [--base F] [--origem D] [--amostra N | --numeros 22,578] [--aplicar [--confirmar-apagar N]]
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { PASTAS, DUPLICADOS, BIN, padroesDono } from './config.js'
import { discosMontados, clonarFicheiro } from './plataforma.js'
import { m, erro, traduzivel } from './mensagens.js'

const FORMATO = 1
const MARCA = '.tinctoris-leitura.json'
const BLOQUEIO = '.tinctoris-leitura.bloqueio'
// (um bloqueio mais velho do que isto, ou de um processo que já não existe neste Mac, pode ser tomado)
const BLOQUEIO_VELHO = 6 * 3600 * 1000
const PAGINA = 'Abrir TINCTORIS.html'
const LEIAME = 'LEIA-ME.txt'
const SQLITE = BIN.sqlite3
// Metadados que podem sair: lista fechada (FORMATO.md §4). Só saem se também estiverem nos campos do tipo da ficha;
// um campo novo num tipo não sai sem ser acrescentado aqui. Ficam de fora, entre outros: nota_revisao, herdado_de, lote,
// transcricao_midi, catalogo_ia, exemplar_papel (onde o dono guarda o livro) e, do «Registo de ensaio», notas_processo e participantes.
const METADADOS_PERMITIDOS = new Set(
  ('afinacao album arquivo cantus catalogo colecao colecao_museu compositores conservacao conteudo conteudo_tipo copista cota ' +
    'data_acesso data_composicao data_fotografias data_gravacao descricao_catalogo diamm digitalizacao dimensoes duracao edicao ' +
    'edicao_imslp evento exemplar exemplares faixas folios fontes_base fontes_conhecidas forma formato fundo grau hornbostel_sachs ' +
    'imslp instituicao instrumentacao interpretes licenca linguagem livro local_arquivo local_construcao local_ensaio local_escrita ' +
    'local_evento local_gravacao materiais modelo n_catalogo n_chapa n_inventario n_paginas n_serie n_volumes notacao ' +
    'notacao_catalogo numero obra_trabalhada obras obras_analisadas orientacao outras_digitalizacoes outros_catalogos ' +
    'outros_exemplares paginas pem periodo plataforma programa proveniencia publicacao publicado publicado_em recensao_de ' +
    'registo_biblioteca restauros revista rism rism_primeira_edicao rism_serie serie sigla suporte titulo_fonte titulo_uniforme ' +
    'tonalidade urn vd versao volume').split(' ')
)
// Fotografias originais: só imagens
const IMAGEM = /\.(jpe?g|tiff?|png|gif|bmp|webp|heic|heif)$/i
// Limites da confirmação escrita (apagar mais de 10 % do que está no disco, e mais de 20 ficheiros)
const PROPORCAO_FORTE = 0.1
const MINIMO_FORTE = 20
const FONTES_INTER = ['InterVariable.woff2', 'InterVariable-Italic.woff2', 'Inter-OFL.txt']
const LIMITE_WINDOWS = 240
// (lixo que o Mac deixa nas pastas: sai sem entrar na lista)
// (e as sobras «….parcial» de uma cópia interrompida: o exportador refaz-las)
const eLixoDoSistema = (nome) => nome === '.DS_Store' || nome.startsWith('._') || nome.endsWith('.parcial')
const nfc = (s) => String(s).normalize('NFC')
// (como em config.js: sem acentos, minúsculas, espaços simples — para comparar com padroesDono)
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const colecao = new Intl.Collator('pt', { numeric: true, sensitivity: 'base' })

// ---------- base de dados (só leitura) ----------

function sqlite(base, sql, modo = '-json') {
  return new Promise((ok, falha) =>
    execFile(SQLITE, ['-readonly', modo, base, sql], { maxBuffer: 1024 ** 3, encoding: 'utf8' }, (e, saida, erro) =>
      e ? falha(new Error(`sqlite3: ${String(erro || e.message).trim()}`)) : ok(saida)
    )
  )
}

// A saída -json põe uma linha por registo («[{…},» … «{…}]»); várias consultas seguidas dão várias listas.
// (com -list e json_object(…) sai um objecto por linha, que se lê da mesma maneira)
function registos(saida) {
  const out = []
  for (let l of saida.split('\n')) {
    if (l.startsWith('[')) l = l.slice(1)
    if (l.endsWith(',') || l.endsWith(']')) l = l.slice(0, -1)
    if (l) out.push(JSON.parse(l))
  }
  return out
}

const json = (v) => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}
const lista = (v) => {
  const x = json(v)
  return Array.isArray(x) ? x : []
}
const texto = (v) => (v == null ? '' : String(v).trim())
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Tudo o que sai, num só instantâneo (BEGIN … COMMIT). Os campos privados nem se lêem.
async function lerBase(base) {
  const sql = `BEGIN;
SELECT 'f' AS _t, id, numero, titulo, autores, data, ano, tipo, estado, natureza, editora, local, doi, isbn, url, paginas, palavras_chave, metadados, ficheiro, ficheiros_extra, created FROM fontes ORDER BY numero, id;
SELECT 'p' AS _t, id, nome, ordem, campos FROM tipos_fonte ORDER BY ordem, nome;
SELECT 'n' AS _t, id, fonte, localizacao, tipo_nota, texto, ordem, created FROM notas_leitura ORDER BY fonte, ordem, created;
SELECT 't' AS _t, fonte FROM textos WHERE conteudo != '';
COMMIT;`
  const r = { f: [], p: [], n: [], t: [] }
  for (const x of registos(await sqlite(base, sql))) r[x._t].push(x)
  // O nome do dono (Definições → «O seu nome»): só para o tirar das palavras-chave da cópia; nunca sai
  r.dono = ''
  if ((await sqlite(base, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'definicoes';", '-list')).trim())
    r.dono = registos(await sqlite(base, "SELECT valor FROM definicoes WHERE chave = 'nome_dono';"))
      .map((x) => {
        const v = json(x.valor)
        return typeof v === 'string' ? v : texto(x.valor)
      })
      .join(';')
  return r
}

export const blocoDe = (n) => (n > 0 ? Math.ceil(n / 100) : 0)
export const nomeDoBloco = (n) => `bloco-${String(n).padStart(4, '0')}.js`
// JSON dentro de um <script>: «<» e os separadores de linha antigos ficam escapados
const seguro = (s) => s.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

// Conteúdo de um bloco de texto integral (só as fichas indicadas, pela ordem do número)
// («numero > 0» deixa usar o índice do número: sem ele o SQLite lia a tabela dos textos inteira em cada bloco;
// json_object em vez de -json: o modo -json do sqlite3 leva ~1,5 s por bloco com textos grandes, json_object ~0,02 s)
async function conteudoDoBloco(base, n, ids) {
  const linhas = registos(
    await sqlite(base, `SELECT json_object('id', f.id, 'c', t.conteudo) FROM fontes f JOIN textos t ON t.fonte = f.id WHERE f.numero > 0 AND f.numero > ${(n - 1) * 100} AND f.numero <= ${n * 100} AND t.conteudo != '' ORDER BY f.numero, f.id;`, '-list')
  )
  const textos = {}
  for (const x of linhas) if (ids.has(x.id)) textos[x.id] = String(x.c)
  const quantos = Object.keys(textos).length
  return quantos ? { conteudo: `TINCTORIS_TEXTO(${n}, ${seguro(JSON.stringify(textos))})\n`, quantos } : null
}

// ---------- ficheiros da biblioteca (origem, só leitura) ----------

// Caminho relativo seguro: dentro da biblioteca e fora de _duplicados/
function relativoValido(rel) {
  rel = String(rel || '').replace(/\\/g, '/')
  if (!rel || rel.startsWith('/') || rel.split('/').some((s) => s === '..' || s === '.' || s === '')) return null
  if (rel === DUPLICADOS || rel.startsWith(DUPLICADOS + '/')) return null
  return rel
}

// Encontra o ficheiro na origem: o caminho da base, as duas formas Unicode, ou pasta a pasta comparando em NFC
async function localizar(origem, rel) {
  for (const r of new Set([rel, rel.normalize('NFC'), rel.normalize('NFD')])) {
    try {
      return { abs: path.join(origem, r), st: await fsp.stat(path.join(origem, r)) }
    } catch {}
  }
  let atual = origem
  for (const parte of rel.split('/')) {
    let nomes
    try {
      nomes = await fsp.readdir(atual)
    } catch {
      return null
    }
    const achado = nomes.find((n) => nfc(n) === nfc(parte))
    if (!achado) return null
    atual = path.join(atual, achado)
  }
  try {
    return { abs: atual, st: await fsp.stat(atual) }
  } catch {
    return null
  }
}

const pastasOriginais = (md) => String(md?.originais || '').split(' | ').filter(Boolean)

async function imagensDaPasta(abs) {
  let entradas
  try {
    entradas = await fsp.readdir(abs, { withFileTypes: true })
  } catch {
    return null
  }
  const out = []
  for (const e of entradas) {
    if (e.name.startsWith('.')) continue
    let st
    try {
      st = await fsp.stat(path.join(abs, e.name))
    } catch {
      continue
    }
    if (st.isFile() && IMAGEM.test(e.name)) out.push({ nome: e.name, st })
  }
  return out.sort((a, b) => colecao.compare(nfc(a.nome), nfc(b.nome)))
}

// ---------- destino ----------

async function lstat(p) {
  try {
    return await fsp.lstat(p)
  } catch {
    return null
  }
}

// Entradas de uma pasta, com o nome que de facto as encontra (sem seguir ligações simbólicas).
// (o exFAT do Mac 26 devolve os nomes em NFD e encontra-os assim, mas só apaga os «._…» pelo nome guardado, em NFC:
// tenta-se primeiro NFC, que é como o exportador escreve; «bruto» é o nome tal como a pasta o devolveu)
async function entradas(dir) {
  let nomes
  try {
    nomes = await fsp.readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const nome of nomes)
    for (const n of new Set([nfc(nome), nome])) {
      const st = await lstat(path.join(dir, n))
      if (st) {
        out.push({ nome: n, bruto: nome, abs: path.join(dir, n), st })
        break
      }
    }
  return out
}

async function percorrer(raiz, rel = '', out = { ficheiros: [], pastas: [] }) {
  for (const e of await entradas(path.join(raiz, rel))) {
    const r = rel ? `${rel}/${e.nome}` : e.nome
    if (e.st.isDirectory()) (out.pastas.push(r), await percorrer(raiz, r, out))
    else
      out.ficheiros.push({
        rel: r,
        bruto: rel ? `${rel}/${e.bruto}` : e.bruto,
        ligacao: e.st.isSymbolicLink(),
        tamanho: e.st.isFile() ? e.st.size : 0,
        modificado: e.st.mtimeMs,
        nome: e.nome,
        ino: e.st.ino,
        dev: e.st.dev,
      })
  }
  return out
}

async function lerMarca(destino) {
  // (uma marca que não é um ficheiro normal — por exemplo uma ligação simbólica — não se lê: verificarDestino recusa)
  if (!(await lstat(path.join(destino, MARCA)))?.isFile()) return null
  try {
    const m = JSON.parse(await fsp.readFile(path.join(destino, MARCA), 'utf8'))
    return { formato: m.formato || FORMATO, exportado_em: m.exportado_em || null, amostra: m.amostra === true ? true : m.amostra === false ? false : null, ficheiros: m.ficheiros || {}, blocos: m.blocos || {} }
  } catch {
    return null
  }
}

// Caminho para comparar pastas: o antepassado mais fundo que existe, resolvido pelo sistema (ligações simbólicas e as
// maiúsculas que o disco guardou), mais o resto; em NFC e minúsculas — o APFS do Mac e o exFAT não distinguem
// maiúsculas nem as formas Unicode («/volumes/rocinante/BIBLIOTECA» é a mesma pasta que «/Volumes/Rocinante/Biblioteca»)
export function caminhoComparavel(p) {
  let atual = path.resolve(String(p))
  const resto = []
  for (;;) {
    try {
      atual = fs.realpathSync.native(atual)
      break
    } catch {
      const pai = path.dirname(atual)
      if (pai === atual) break
      resto.unshift(path.basename(atual))
      atual = pai
    }
  }
  return nfc(path.join(atual, ...resto)).toLowerCase()
}
const dentroDe = (a, b) => a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep)

// Pastas do TINCTORIS onde a cópia nunca pode ficar (nem as conter): a raiz inteira (watch_folder, app, pb_data,
// biblioteca, nao_processados…) e as que o ambiente de teste aponta para outro lado
export const pastasProtegidas = () => [PASTAS.raiz, PASTAS.app, PASTAS.biblioteca, PASTAS.pbDados, PASTAS.watch, PASTAS.naoProcessados, PASTAS.dados]

// Verdadeiro se o destino fica fora de todas as protegidas e não contém nenhuma
export function foraDasProtegidas(destino, protegidas = pastasProtegidas()) {
  const d = caminhoComparavel(destino)
  return protegidas.filter(Boolean).every((p) => {
    const q = caminhoComparavel(p)
    return !dentroDe(d, q) && !dentroDe(q, d)
  })
}

// A pasta escolhida: tem de ser uma cópia de leitura, estar vazia (ignorando ficheiros escondidos do sistema) ou ainda não existir
async function verificarDestino(destino, origem, base) {
  if (!destino) throw erro('Falta a pasta de destino.')
  destino = path.resolve(destino)
  const pai = path.dirname(destino)
  // (primeiro a protecção: em Windows, um caminho com outra forma Unicode dos acentos pode não «existir», mas é recusado
  // pelo que é — dentro da biblioteca — e não por faltar a pasta)
  if (!foraDasProtegidas(destino, [origem, base, ...pastasProtegidas()]))
    throw erro('O destino não pode ficar dentro da biblioteca nem da pasta do TINCTORIS (nem conter a biblioteca).')
  if (!fs.existsSync(pai)) throw erro('A pasta onde ficaria a cópia não existe (o disco está ligado?): {pai}', { pai })
  const st = await lstat(destino)
  if (!st) return { destino, existe: false, marca: null }
  if (!st.isDirectory()) throw erro('O destino não é uma pasta: {destino}', { destino })
  const stMarca = await lstat(path.join(destino, MARCA))
  if (stMarca && !stMarca.isFile()) throw erro('No destino, {marca} não é um ficheiro normal (ligação ou pasta): recusado.', { marca: MARCA })
  const marca = await lerMarca(destino)
  if (!marca) {
    const visiveis = (await fsp.readdir(destino)).filter((n) => !n.startsWith('.'))
    if (visiveis.length || stMarca)
      throw erro('A pasta de destino não está vazia e não é uma cópia de leitura do TINCTORIS (falta {marca}): {destino}', { marca: MARCA, destino })
  }
  for (const p of ['biblioteca', 'dados', 'dados/texto', 'leitura']) {
    const s = await lstat(path.join(destino, p))
    if (s && !s.isDirectory()) throw erro('No destino, «{pasta}» não é uma pasta normal (ligação ou ficheiro): recusado.', { pasta: p })
  }
  return { destino, existe: true, marca }
}

// Sistema de ficheiros do disco de destino (pela lista de discos montados): só para avisar
async function sistemaDeFicheiros(p) {
  let melhor = { ponto: '', tipo: '' }
  for (const d of await discosMontados()) {
    const raiz = /[/\\]$/.test(d.ponto) ? d.ponto : d.ponto + path.sep
    if ((p === d.ponto || p.startsWith(raiz)) && d.ponto.length > melhor.ponto.length) melhor = { ponto: d.ponto, tipo: d.sistema }
  }
  return melhor.tipo
}

const INVALIDO_WINDOWS = /[<>:"\\|?*\u0000-\u001f]|[. ]$/
// Nomes reservados do Windows (com ou sem extensão, em qualquer pasta do caminho): o ficheiro não se abriria lá
const RESERVADO_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
export const nomeReservado = (caminho) => String(caminho).split('/').some((s) => RESERVADO_WINDOWS.test(s))

// ---------- plano ----------

// opcoes: destino (obrigatório), base, origem, amostra (N fichas espalhadas pela numeração) ou numeros ([22, 578…]),
// pagina (pasta da página, por omissão app/leitura), fontesInter (pasta das letras Inter), clonar (false = nunca clonar)
export async function planear(opcoes = {}) {
  const inicio = Date.now()
  const base = path.resolve(opcoes.base || path.join(PASTAS.app, 'pb_data', 'data.db'))
  const origem = path.resolve(opcoes.origem || PASTAS.biblioteca)
  if (!fs.existsSync(base)) throw erro('Base de dados não encontrada: {base}', { base })
  if (!fs.existsSync(origem)) throw erro('Pasta da biblioteca não encontrada: {origem}', { origem })
  const { destino, existe, marca } = await verificarDestino(opcoes.destino, origem, base)
  const avisos = []
  const avisosT = []
  // (cada aviso fica em português em `avisos` e como mensagem traduzível, na mesma ordem, em `avisos_t`)
  const avisar = (x) => (avisos.push(x.msg), avisosT.push(x))
  // (amostra = só algumas fichas: nunca pode substituir uma cópia completa, senão apagava o resto do disco)
  const amostra = !!(opcoes.numeros?.length || opcoes.amostra > 0)
  const amostraSobreCompleta = amostra && !!marca && marca.amostra !== true
  // (a pasta da biblioteca tem de se conseguir ler e não estar vazia: senão todas as fichas ficavam sem ficheiro)
  let origemAcessivel
  try {
    origemAcessivel = (await fsp.readdir(origem)).some((n) => !n.startsWith('.'))
  } catch {
    origemAcessivel = false
  }

  const r = await lerBase(base)
  const donos = padroesDono(r.dono)
  let palavrasDoDono = 0
  let linhas = r.f
  if (opcoes.numeros?.length) {
    const q = new Set(opcoes.numeros.map(Number))
    linhas = linhas.filter((f) => q.has(numero(f.numero)))
  } else if (opcoes.amostra > 0 && opcoes.amostra < linhas.length) {
    const n = Math.floor(opcoes.amostra)
    linhas = Array.from({ length: n }, (_, i) => linhas[Math.floor((i * linhas.length) / n)])
  }

  // Tipos: só os campos que podem sair
  const permitidos = new Map()
  const tipos = r.p.map((t) => {
    const campos = lista(t.campos)
      .filter((c) => c && c.chave && METADADOS_PERMITIDOS.has(c.chave))
      .map((c) => ({ chave: String(c.chave), rotulo: texto(c.rotulo), tipo: texto(c.tipo) || 'texto' }))
    permitidos.set(t.id, new Set(campos.map((c) => c.chave)))
    return { id: t.id, nome: texto(t.nome), campos }
  })

  const comTexto = new Set(r.t.map((x) => x.fonte))
  const necessarios = new Map() // caminho NFC (em biblioteca/) → { origem, tamanho, modificado, ficha (id da 1.ª ficha a que pertence) }
  const emFalta = []
  const fichasEmFalta = new Set()
  const fichasComFicheiro = new Set()
  const fora = []
  const reservados = []
  const imagensOriginais = new Set()
  const precisar = (rel, achado, ficha) => {
    const caminho = nfc(rel)
    if (!necessarios.has(caminho)) necessarios.set(caminho, { origem: achado.abs, tamanho: achado.st.size, modificado: Math.round(achado.st.mtimeMs), ficha })
    return caminho
  }

  const fichas = []
  const idsPorBloco = new Map()
  let semNumeroComTexto = 0
  for (const f of linhas) {
    const md = json(f.metadados) || {}
    const n = numero(f.numero)
    const ficha = {
      id: f.id,
      numero: n,
      titulo: texto(f.titulo),
      autores: lista(f.autores)
        .filter((a) => a && typeof a === 'object')
        .map((a) => {
          const o = { nome: texto(a.nome), apelido: texto(a.apelido) }
          if (texto(a.literal)) o.literal = texto(a.literal)
          if (texto(a.papel)) o.papel = texto(a.papel)
          return o
        })
        .filter((a) => a.nome || a.apelido || a.literal),
      data: texto(f.data),
      ano: numero(f.ano),
      tipo: texto(f.tipo),
      estado: f.estado === 'completo' ? 'completo' : 'rever',
      natureza: texto(f.natureza),
      editora: texto(f.editora),
      local: texto(f.local),
      doi: texto(f.doi),
      isbn: texto(f.isbn),
      url: texto(f.url),
      paginas: numero(f.paginas),
      // (sem o nome do dono: na biblioteca fica, na cópia emprestada não)
      palavras_chave: lista(f.palavras_chave)
        .map(texto)
        .filter(Boolean)
        .filter((p) => !donos.some((d) => d.test(semAcentos(p))) || (palavrasDoDono++, false)),
      metadados: {},
      ficheiros: [],
      originais: [],
      bloco_texto: 0,
      criado: texto(f.created),
    }
    const chaves = permitidos.get(ficha.tipo) || new Set()
    if (md && typeof md === 'object' && !Array.isArray(md))
      for (const [k, v] of Object.entries(md)) {
        if (!chaves.has(k)) continue
        if (typeof v === 'string' && v.trim()) ficha.metadados[k] = v.trim()
        else if (typeof v === 'number' && Number.isFinite(v)) ficha.metadados[k] = v
        else if (typeof v === 'boolean') ficha.metadados[k] = v ? 'sim' : 'não'
      }

    // Ficheiros: o principal primeiro, depois os extra
    const lista_ = [{ ficheiro: f.ficheiro, rotulo: '' }, ...lista(f.ficheiros_extra).map((x) => ({ ficheiro: x?.ficheiro, rotulo: texto(x?.rotulo) }))]
    for (const x of lista_) {
      if (!texto(x.ficheiro)) continue
      fichasComFicheiro.add(f.id)
      const rel = relativoValido(x.ficheiro)
      if (!rel) {
        fora.push({ numero: n, caminho: String(x.ficheiro) })
        continue
      }
      const achado = await localizar(origem, rel)
      if (!achado || !achado.st.isFile()) {
        emFalta.push({ numero: n, caminho: nfc(rel) })
        fichasEmFalta.add(f.id)
        continue
      }
      if (nomeReservado(nfc(rel))) {
        reservados.push({ numero: n, caminho: nfc(rel) })
        continue
      }
      ficha.ficheiros.push({ caminho: precisar(rel, achado, f.id), rotulo: x.rotulo })
    }
    // Fotografias originais
    for (const p of pastasOriginais(md)) {
      fichasComFicheiro.add(f.id)
      const rel = relativoValido(p)
      const achado = rel && (await localizar(origem, rel))
      let imagens = achado?.st.isDirectory() ? await imagensDaPasta(achado.abs) : null
      if (!imagens) {
        if (rel) (emFalta.push({ numero: n, caminho: nfc(rel) + '/' }), fichasEmFalta.add(f.id))
        else fora.push({ numero: n, caminho: p })
        continue
      }
      const pasta = nfc(rel)
      if (nomeReservado(pasta)) {
        reservados.push({ numero: n, caminho: pasta + '/' })
        continue
      }
      for (const im of imagens.filter((im) => nomeReservado(im.nome))) reservados.push({ numero: n, caminho: `${pasta}/${nfc(im.nome)}` })
      imagens = imagens.filter((im) => !nomeReservado(im.nome))
      if (!imagens.length) continue
      for (const im of imagens) imagensOriginais.add(precisar(`${rel}/${im.nome}`, { abs: path.join(achado.abs, im.nome), st: im.st }, f.id))
      ficha.originais.push({ pasta, imagens: imagens.map((im) => nfc(im.nome)), tamanho: imagens.reduce((s, im) => s + im.st.size, 0) })
    }
    if (comTexto.has(f.id)) {
      const b = blocoDe(n)
      if (!b) semNumeroComTexto++
      else {
        ficha.bloco_texto = b
        if (!idsPorBloco.has(b)) idsPorBloco.set(b, new Set())
        idsPorBloco.get(b).add(f.id)
      }
    }
    fichas.push(ficha)
  }
  const idsFichas = new Set(fichas.map((f) => f.id))
  const notas = r.n
    .filter((x) => idsFichas.has(x.fonte))
    .map((x) => ({ id: x.id, fonte: x.fonte, localizacao: texto(x.localizacao), tipo_nota: texto(x.tipo_nota), texto: String(x.texto ?? ''), ordem: numero(x.ordem), criado: texto(x.created) }))

  // O que já está no destino
  const marcaAntiga = marca || { ficheiros: {}, blocos: {} }
  const noDestino = existe ? await percorrer(path.join(destino, 'biblioteca')) : { ficheiros: [], pastas: [] }
  const presentes = new Map()
  const apagar = []
  const lixo = []
  for (const x of noDestino.ficheiros) {
    const chave = nfc(x.rel)
    if (necessarios.has(chave) && !x.ligacao && !eLixoDoSistema(x.nome)) {
      const guardado = presentes.get(chave)
      if (!guardado) {
        presentes.set(chave, x)
        continue
      }
      // Duas entradas com o mesmo nome em NFC (no exFAT podem coexistir as duas formas Unicode): fica a que já tem o
      // nome NFC; a outra apaga-se pelo nome que a pasta devolveu — e nunca se for o mesmo ficheiro que fica
      const [fica, sai] = x.rel === chave && guardado.rel !== chave ? [x, guardado] : [guardado, x]
      presentes.set(chave, fica)
      const mesmo = sai.bruto === fica.bruto || sai.bruto === fica.rel || (sai.ino === fica.ino && sai.dev === fica.dev)
      if (!mesmo) apagar.push({ ...sai, rel: sai.bruto })
    } else if (eLixoDoSistema(x.nome) || x.ligacao) lixo.push(`biblioteca/${x.bruto}`)
    else apagar.push(x)
  }
  // Sobras «.parcial» e ligações simbólicas na raiz, em dados/ e em leitura/: apagam-se (as próprias, sem as seguir)
  if (existe) {
    for (const e of await entradas(destino)) if (!e.st.isDirectory() && (e.st.isSymbolicLink() || e.nome.endsWith('.parcial'))) lixo.push(e.bruto)
    for (const p of ['dados', 'leitura'])
      for (const x of (await percorrer(path.join(destino, p))).ficheiros)
        if ((x.ligacao || eLixoDoSistema(x.nome)) && !(p === 'dados' && x.rel.startsWith('texto/'))) lixo.push(`${p}/${x.bruto}`)
  }
  const copiar = []
  const emDia = []
  for (const [caminho, x] of necessarios) {
    const d = presentes.get(caminho)
    const m = marcaAntiga.ficheiros[caminho]
    const igual = d && d.tamanho === x.tamanho && ((m && m.tamanho === x.tamanho && m.modificado === x.modificado) || Math.abs(d.modificado - x.modificado) < 2000)
    if (igual) emDia.push({ caminho, ...x })
    else copiar.push({ caminho, ...x, substitui: d ? d.tamanho : 0 })
  }
  // Ficheiro a apagar que pertencia (pela marca) a uma ficha que continua na cópia com um ficheiro a copiar: mudou de nome
  const aCopiar = new Set(copiar.map((x) => x.caminho))
  const fichasACopiar = new Set()
  for (const f of fichas) if (f.ficheiros.some((x) => aCopiar.has(x.caminho)) || f.originais.some((o) => o.imagens.some((im) => aCopiar.has(`${o.pasta}/${im}`)))) fichasACopiar.add(f.id)
  for (const x of apagar) {
    const id = marcaAntiga.ficheiros[nfc(x.rel)]?.ficha
    x.renomeado = !!id && fichasACopiar.has(id)
  }

  // Texto integral, bloco a bloco (só se guarda a impressão digital; o conteúdo volta a ler-se ao aplicar)
  const blocosNoDestino = existe ? (await percorrer(path.join(destino, 'dados', 'texto'))).ficheiros.filter((x) => (!eLixoDoSistema(x.nome) && !x.ligacao) || (lixo.push(`dados/texto/${x.bruto}`), false)) : []
  const blocos = []
  for (const n of [...idsPorBloco.keys()].sort((a, b) => a - b)) {
    const c = await conteudoDoBloco(base, n, idsPorBloco.get(n))
    if (!c) continue
    const nome = nomeDoBloco(n)
    const h = sha(c.conteudo)
    const la = blocosNoDestino.some((x) => x.rel === nome && !x.ligacao)
    blocos.push({ n, nome, sha: h, textos: c.quantos, tamanho: Buffer.byteLength(c.conteudo), estado: !la || !marcaAntiga.blocos[nome] ? 'novo' : marcaAntiga.blocos[nome] === h ? 'igual' : 'alterado' })
  }
  const nomesBlocos = new Set(blocos.map((b) => b.nome))
  const blocosApagar = blocosNoDestino.filter((x) => !nomesBlocos.has(x.rel)).map((x) => ({ rel: x.rel, tamanho: x.tamanho }))
  // (só blocos com fichas que têm de facto texto)
  const comBloco = new Set(blocos.map((b) => b.n))
  for (const f of fichas) if (f.bloco_texto && !comBloco.has(f.bloco_texto)) f.bloco_texto = 0

  // Página (app/leitura) e letras
  const pagina = []
  const dirPagina = path.resolve(opcoes.pagina || path.join(PASTAS.app, 'leitura'))
  const dirInter = path.resolve(opcoes.fontesInter || path.join(PASTAS.app, 'pb_public', 'fontes'))
  const daPagina = (await percorrer(dirPagina)).ficheiros.filter((x) => !x.ligacao && !x.rel.split('/').some((s) => s.startsWith('.')) && x.rel !== 'FORMATO.md')
  for (const x of daPagina) pagina.push({ de: path.join(dirPagina, x.rel), para: x.rel === 'index.html' ? PAGINA : `leitura/${x.rel}` })
  if (!daPagina.some((x) => x.rel === 'index.html')) avisar(m('A página ainda não existe (falta {ficheiro}): a cópia fica sem «{pagina}».', { ficheiro: path.join(dirPagina, 'index.html'), pagina: PAGINA }))
  for (const f of FONTES_INTER)
    if (!daPagina.some((x) => x.rel === `fontes/${f}`) && fs.existsSync(path.join(dirInter, f))) pagina.push({ de: path.join(dirInter, f), para: `leitura/fontes/${f}` })

  // Disco de destino
  const existente = existe ? destino : path.dirname(destino)
  const sistema = await sistemaDeFicheiros(fs.realpathSync(existente))
  const sf = await fsp.statfs(existente)
  const livre = sf.bavail * sf.bsize
  const mesmoDisco = (await fsp.stat(existente)).dev === (await fsp.stat(origem)).dev
  // (no mesmo disco APFS a cópia é um clone: instantânea e sem ocupar espaço)
  const clonar = opcoes.clonar !== false && mesmoDisco && sistema === 'apfs'
  const bytesCopiar = copiar.reduce((s, x) => s + x.tamanho, 0)
  const bytesLibertados = apagar.reduce((s, x) => s + x.tamanho, 0) + copiar.reduce((s, x) => s + x.substitui, 0)
  const necessario = clonar ? 0 : Math.max(0, bytesCopiar - bytesLibertados)
  if (sistema && sistema !== 'exfat') avisar(m('O disco de destino não é exFAT (é {sistema}): pode não abrir em Windows. Para emprestar a quem usa Windows, formatar o disco em exFAT.', { sistema }))
  if (necessario > livre) avisar(m('Espaço insuficiente no destino: faltam {falta} (precisa de {precisa}, livre {livre}).', { falta: tamanho(necessario - livre), precisa: tamanho(necessario), livre: tamanho(livre) }))

  // Nomes que o Windows (e o exFAT) recusam ou confunde
  const raizWin = `${path.basename(destino)}/biblioteca/`
  const longos = [...necessarios.keys()].filter((c) => (raizWin + c).length > LIMITE_WINDOWS)
  const invalidos = [...necessarios.keys()].filter((c) => c.split('/').some((s) => INVALIDO_WINDOWS.test(s)))
  const porMinusculas = new Map()
  for (const c of necessarios.keys()) porMinusculas.set(c.toLowerCase(), [...(porMinusculas.get(c.toLowerCase()) || []), c])
  const maiusculas = [...porMinusculas.values()].filter((l) => l.length > 1)
  if (longos.length) avisar(m('{n} caminhos com mais de {limite} caracteres: em Windows podem não abrir (ver a lista).', { n: longos.length, limite: LIMITE_WINDOWS }))
  if (invalidos.length) avisar(m('{n} nomes com caracteres que o exFAT/Windows não aceitam (: * ? " < > | \\ ou ponto/espaço no fim): a cópia desses pode falhar (ver a lista).', { n: invalidos.length }))
  if (maiusculas.length) avisar(m('{n} grupos de ficheiros que só diferem em maiúsculas/minúsculas: no exFAT/Windows ficaria só um (ver a lista).', { n: maiusculas.length }))
  if (fora.length) avisar(m('{n} ficheiros fora da biblioteca ou em {duplicados}/ (não saem).', { n: fora.length, duplicados: DUPLICADOS }))
  if (semNumeroComTexto) avisar(m('{n} fichas sem número permanente têm texto integral: o texto não sai.', { n: semNumeroComTexto }))
  if (reservados.length) avisar(m('{n} ficheiros/pastas com nomes que o Windows reserva (CON, PRN, AUX, NUL, COM1…, LPT1…): não saem (ver a lista).', { n: reservados.length }))
  if (amostraSobreCompleta)
    avisar(m('Esta pasta tem uma cópia completa (ou de uma versão antiga do exportador): uma amostra não a pode substituir, porque apagaria o resto. Use outra pasta para a amostra.'))

  // Confirmação escrita: apagar muito do disco, a biblioteca inacessível ou muitos ficheiros em falta (FORMATO.md §5)
  // (as mudanças de nome não contam: o ficheiro volta a ser copiado com o nome novo, nada se perde)
  const nApagar = apagar.length + blocosApagar.length
  const nRenomeados = apagar.filter((x) => x.renomeado).length
  const nApagarOutros = nApagar - nRenomeados
  const nNoDisco = noDestino.ficheiros.filter((x) => !x.ligacao && !eLixoDoSistema(x.nome)).length + blocosNoDestino.length
  const motivosConfirmacao = []
  const motivosConfirmacaoT = []
  const motivar = (x) => (motivosConfirmacao.push(x.msg), motivosConfirmacaoT.push(x))
  if (nApagarOutros > MINIMO_FORTE && nApagarOutros > PROPORCAO_FORTE * nNoDisco)
    motivar(
      nRenomeados
        ? m('Vai apagar do disco {n} dos {total} ficheiros que lá estão (mais de 10 %, sem contar os que só mudaram de nome).', { n: nApagarOutros.toLocaleString('pt-PT'), total: nNoDisco.toLocaleString('pt-PT') })
        : m('Vai apagar do disco {n} dos {total} ficheiros que lá estão (mais de 10 %).', { n: nApagarOutros.toLocaleString('pt-PT'), total: nNoDisco.toLocaleString('pt-PT') })
    )
  if (!origemAcessivel) motivar(m('A pasta da biblioteca não se consegue ler ou está vazia ({origem}): as fontes ficariam sem ficheiros.', { origem }))
  if (fichasEmFalta.size > MINIMO_FORTE && fichasEmFalta.size > PROPORCAO_FORTE * fichasComFicheiro.size)
    motivar(m('{n} das {total} fontes com ficheiro têm o ficheiro em falta na biblioteca (mais de 10 %): o disco está bem ligado?', { n: fichasEmFalta.size.toLocaleString('pt-PT'), total: fichasComFicheiro.size.toLocaleString('pt-PT') }))
  const precisaConfirmacaoForte = motivosConfirmacao.length > 0 && nApagarOutros > 0
  for (const x of motivosConfirmacaoT) avisar(x)

  return {
    formato: FORMATO,
    destino,
    base,
    origem,
    existe,
    exportadoAntes: marca?.exportado_em || null,
    amostra,
    amostraSobreCompleta,
    precisaConfirmacaoForte,
    motivosConfirmacao,
    motivosConfirmacao_t: motivosConfirmacaoT,
    sistema,
    livre,
    mesmoDisco,
    clonar,
    programa: programa(),
    dados: { tipos, fichas, notas },
    necessarios: [...necessarios].map(([caminho, x]) => ({ caminho, ...x })),
    copiar,
    emDia,
    apagar: apagar.map((x) => ({ rel: `biblioteca/${x.rel}`, tamanho: x.tamanho, renomeado: x.renomeado })),
    lixo,
    blocos,
    blocosApagar: blocosApagar.map((x) => ({ rel: `dados/texto/${x.rel}`, tamanho: x.tamanho })),
    pagina,
    emFalta,
    fora,
    reservados,
    longos,
    invalidos,
    maiusculas,
    avisos,
    avisos_t: avisosT,
    contagens: {
      fichas: fichas.length,
      notas: notas.length,
      fichasComTexto: fichas.filter((f) => f.bloco_texto).length,
      fichasSemFicheiro: fichas.filter((f) => !f.ficheiros.length && !f.originais.length).length,
      fichasEmFalta: fichasEmFalta.size,
      ficheirosEmFalta: emFalta.length,
      ficheiros: necessarios.size,
      bytes: [...necessarios.values()].reduce((s, x) => s + x.tamanho, 0),
      pastasOriginais: new Set(fichas.flatMap((f) => f.originais.map((o) => o.pasta))).size,
      imagens: imagensOriginais.size,
      copiar: copiar.length,
      bytesCopiar,
      emDia: emDia.length,
      apagar: apagar.length,
      apagarRenomeados: nRenomeados,
      nApagar,
      noDisco: nNoDisco,
      palavrasDoDono,
      bytesApagar: apagar.reduce((s, x) => s + x.tamanho, 0),
      blocos: blocos.length,
      blocosNovos: blocos.filter((b) => b.estado === 'novo').length,
      blocosAlterados: blocos.filter((b) => b.estado === 'alterado').length,
      blocosApagar: blocosApagar.length,
      necessario,
      segundos: Math.round((Date.now() - inicio) / 100) / 10,
    },
  }
}

function programa() {
  try {
    return `TINCTORIS ${JSON.parse(fs.readFileSync(path.join(PASTAS.app, 'worker', 'package.json'), 'utf8')).version}`
  } catch {
    return 'TINCTORIS'
  }
}

// Hora local sem fuso («2026-10-05T15:20:00»)
function horaLocal(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

export function tamanho(b) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1000 && i < u.length - 1) (b /= 1000), i++
  return `${b.toLocaleString('pt-PT', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`
}

// ---------- aplicar ----------

// Os motivos de confirmação numa só mensagem («motivo1 motivo2»), com o mesmo texto de plano.motivosConfirmacao.join(' ')
function juntarMotivos(plano) {
  const lista = plano.motivosConfirmacao_t
  if (!Array.isArray(lista) || lista.length !== plano.motivosConfirmacao.length || !lista.length) return plano.motivosConfirmacao.join(' ')
  return lista.reduce((a, b) => m('{a} {b}', { a, b }))
}


// Cria as pastas por baixo da raiz, recusando ligações simbólicas pelo caminho
async function pastaSegura(raiz, rel, feitas) {
  let atual = raiz
  for (const parte of rel.split('/').filter((p) => p && p !== '.')) {
    atual = path.join(atual, parte)
    if (feitas.has(atual)) continue
    const st = await lstat(atual)
    if (st?.isSymbolicLink() || (st && !st.isDirectory())) throw erro('No destino, {caminho} não é uma pasta normal.', { caminho: atual })
    if (!st) await fsp.mkdir(atual)
    feitas.add(atual)
  }
  return atual
}

// O nome final tem de ser um ficheiro normal ou ainda não existir (nunca uma ligação simbólica nem uma pasta)
async function alvoNormal(alvo) {
  const st = await lstat(alvo)
  if (st && !st.isFile()) throw erro('No destino, {caminho} não é um ficheiro normal (ligação ou pasta): recusado.', { caminho: alvo })
}

// Escreve «….parcial» de novo (uma sobra com esse nome — ou uma ligação simbólica plantada — apaga-se sem a seguir;
// 'wx' recusa se voltar a aparecer entretanto) e só depois lhe dá o nome final
async function escreverAtomico(destino, rel, conteudo, feitas) {
  const pasta = await pastaSegura(destino, path.posix.dirname(rel), feitas)
  const alvo = path.join(pasta, path.posix.basename(rel))
  await alvoNormal(alvo)
  const tmp = alvo + '.parcial'
  await fsp.rm(tmp, { force: true })
  await fsp.writeFile(tmp, conteudo, { flag: 'wx' })
  await fsp.rename(tmp, alvo)
}

async function copiarFicheiro(de, alvo, modificado, clonar) {
  await alvoNormal(alvo)
  const tmp = alvo + '.parcial'
  await fsp.rm(tmp, { force: true })
  // No mesmo disco APFS: clone instantâneo com `cp -c` (o COPYFILE_FICLONE do Node 22.5 não clona no Mac: copia
  // tudo, e o FICLONE_FORCE dá ENOSYS). Noutro disco: cópia simples dos dados (o copyfile do Mac levaria os
  // atributos estendidos, que no exFAT viram ficheiros «._…» e podem trazer a origem das descargas).
  if (clonar) await clonarFicheiro(de, tmp)
  else await pipeline(fs.createReadStream(de, { highWaterMark: 1 << 20 }), fs.createWriteStream(tmp, { flags: 'wx' }))
  if (!(await lstat(tmp))?.isFile()) throw erro('No destino, {caminho} não é um ficheiro normal: recusado.', { caminho: tmp })
  const t = new Date(modificado)
  await fsp.utimes(tmp, t, t)
  await fsp.rename(tmp, alvo)
}

// No exFAT (e noutros discos que não são do Mac) os atributos estendidos ficam em ficheiros «._nome» ao lado — por
// exemplo o com.apple.provenance que o sistema põe em tudo o que se cria: no Windows aparecem e não fazem falta.
// Só se apagam os que acompanham um ficheiro ou pasta que existe; na raiz, só os do que o exportador escreve.
async function limparAppleDouble(destino) {
  let n = 0
  const limpar = async (dir, recursivo, so) => {
    const lista_ = await entradas(dir)
    const nomes = new Set(lista_.map((e) => nfc(e.nome)))
    for (const e of lista_) {
      const par = nfc(e.nome.slice(2))
      if (e.nome.startsWith('._') && e.st.isFile() && nomes.has(par) && (!so || so.includes(par))) {
        await fsp.rm(e.abs, { force: true })
        n++
      } else if (recursivo && e.st.isDirectory()) await limpar(e.abs, true)
    }
  }
  await limpar(destino, false, [MARCA, BLOQUEIO, PAGINA, LEIAME, 'biblioteca', 'dados', 'leitura'])
  for (const p of ['biblioteca', 'dados', 'leitura']) await limpar(path.join(destino, p), true)
  return n
}

async function apagarVazias(dir, raiz = true) {
  for (const e of await entradas(dir)) if (e.st.isDirectory()) await apagarVazias(e.abs, false)
  if (!raiz && !(await entradas(dir)).length) await fsp.rmdir(dir).catch(() => {})
}

// Todas as pastas entre o destino e o ficheiro são pastas normais (nenhuma ligação simbólica pelo caminho)
async function semLigacoesAte(destino, rel, vistas) {
  let atual = destino
  for (const parte of rel.split('/').slice(0, -1)) {
    atual = path.join(atual, parte)
    if (vistas.has(atual)) continue
    if (!(await lstat(atual))?.isDirectory()) return false
    vistas.add(atual)
  }
  return true
}


const processoVivo = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

// Um exportador de cada vez por disco: .tinctoris-leitura.bloqueio, criado com 'wx' (pid, hora, máquina).
// Um bloqueio com mais de 6 h, ou de um processo deste Mac que já não existe, pode ser tomado. Devolve a função que o solta.
export async function tomarBloqueio(destino) {
  const f = path.join(destino, BLOQUEIO)
  const meu = { pid: process.pid, inicio: Date.now(), maquina: os.hostname() }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await fsp.writeFile(f, JSON.stringify(meu), { flag: 'wx' })
      // (solta-se só se ainda for o nosso)
      return async () => {
        try {
          const o = (await lstat(f))?.isFile() ? JSON.parse(await fsp.readFile(f, 'utf8')) : null
          if (o?.pid === meu.pid && o.inicio === meu.inicio) await fsp.rm(f, { force: true })
        } catch {}
      }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
    const st = await lstat(f)
    let outro = null
    if (st?.isFile())
      try {
        outro = JSON.parse(await fsp.readFile(f, 'utf8'))
      } catch {}
    // (um bloqueio ilegível acabado de criar pode estar a ser escrito: espera-se um minuto antes de o tomar)
    const velho = outro
      ? Date.now() - Number(outro.inicio || 0) > BLOQUEIO_VELHO || (outro.maquina === os.hostname() && !processoVivo(Number(outro.pid)))
      : !st?.isFile() || Date.now() - st.mtimeMs > 60000
    if (!velho) {
      const desde = outro?.inicio ? new Date(outro.inicio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : 'há instantes'
      throw outro?.maquina && outro.maquina !== os.hostname()
        ? erro('Já está a ser feita outra cópia neste disco (desde {desde}, no computador {maquina}). Espere que acabe e tente outra vez.', { desde, maquina: outro.maquina }, { codigo: 'bloqueado' })
        : erro('Já está a ser feita outra cópia neste disco (desde {desde}). Espere que acabe e tente outra vez.', { desde }, { codigo: 'bloqueado' })
    }
    await fsp.rm(f, { force: true })
  }
  throw erro('Já está a ser feita outra cópia neste disco. Espere que acabe e tente outra vez.', undefined, { codigo: 'bloqueado' })
}

// opcoes: aoProgresso({ fase, feitos, total, bytes, bytesTotal }), sinal (AbortSignal), registos (pasta das listas),
// maxApagar (o que a simulação mostrou: recusa, antes de escrever fosse o que fosse, se agora apagar mais — salvo se os
// ficheiros a mais forem de fichas que mudaram de nome; maxApagarOutros = quantos dos mostrados não eram mudanças de nome),
// confirmarApagar (o número escrito pelo utilizador, quando o plano precisa de confirmação forte)
export async function aplicar(plano, opcoes = {}) {
  const aviso = opcoes.aoProgresso || (() => {})
  const parar = () => {
    if (opcoes.sinal?.aborted) throw erro('Exportação interrompida.')
  }
  const inicio = Date.now()
  // (o destino pode ter mudado desde o plano)
  const { destino, marca: marcaAtual } = await verificarDestino(plano.destino, plano.origem, plano.base)
  // Guardas: nenhuma escreve nada; se uma falhar, o disco fica como estava
  if (plano.amostra && marcaAtual && marcaAtual.amostra !== true)
    throw erro('Esta pasta tem uma cópia completa: uma amostra não a pode actualizar (apagaria o resto). Nada foi alterado: use outra pasta para a amostra.', undefined, { codigo: 'amostra-sobre-completa' })
  const nApagar = plano.apagar.length + plano.blocosApagar.length
  if (opcoes.maxApagar != null && nApagar > opcoes.maxApagar) {
    // (a mais só se tolera o que é mudança de nome: um ficheiro de uma ficha que continua na cópia com outro ficheiro a copiar)
    const outros = nApagar - plano.apagar.filter((x) => x.renomeado).length
    const limite = opcoes.maxApagarOutros != null ? opcoes.maxApagarOutros : opcoes.maxApagar
    if (outros > limite)
      throw erro('O plano apaga agora {n} ficheiros do disco, mais do que os {maximo} que a simulação mostrou. Nada foi alterado: veja outra vez o que vai mudar.', { n: nApagar, maximo: opcoes.maxApagar }, { codigo: 'mais-apagar' })
  }
  if (plano.precisaConfirmacaoForte && !(opcoes.confirmarApagar != null && [nApagar, opcoes.maxApagar].includes(Number(opcoes.confirmarApagar))))
    throw erro('Esta actualização apaga {n} ficheiros do disco e precisa de confirmação: {motivos} Nada foi alterado.', { n: nApagar, motivos: juntarMotivos(plano) }, { codigo: 'confirmar-apagar' })
  // (a biblioteca tem de continuar ali e legível antes de se apagar o que quer que seja)
  try {
    await fsp.access(plano.origem, fs.constants.R_OK)
    await fsp.readdir(plano.origem)
  } catch {
    throw erro('A pasta da biblioteca não se consegue ler ({origem}). Nada foi alterado.', { origem: plano.origem }, { codigo: 'origem-inacessivel' })
  }
  if (!plano.clonar) {
    const sf = await fsp.statfs(fs.existsSync(destino) ? destino : path.dirname(destino))
    if (plano.contagens.necessario > sf.bavail * sf.bsize) throw erro('Espaço insuficiente no destino: precisa de {precisa}, livre {livre}.', { precisa: tamanho(plano.contagens.necessario), livre: tamanho(sf.bavail * sf.bsize) })
  }
  if (!fs.existsSync(destino)) await fsp.mkdir(destino)
  const soltar = await tomarBloqueio(destino)
  try {
    return await aplicarComBloqueio(plano, opcoes, destino, marcaAtual, aviso, parar, inicio)
  } finally {
    await soltar()
  }
}

async function aplicarComBloqueio(plano, opcoes, destino, marcaAtual, aviso, parar, inicio) {
  const feitas = new Set()
  const exportado_em = horaLocal()
  // A marca entra logo no início: uma exportação interrompida continua a ser reconhecida e retomada
  // («amostra» diz se é uma cópia só de algumas fichas: uma completa nunca é substituída por uma amostra)
  const marca = marcaAtual || { formato: FORMATO, exportado_em: null, ficheiros: {}, blocos: {} }
  marca.amostra = !!plano.amostra
  const guardarMarca = () => escreverAtomico(destino, MARCA, JSON.stringify(marca, null, 1), feitas)
  await guardarMarca()
  const erros = []
  const errosT = []
  const linhas = []
  const falhou = (x) => (erros.push(x.msg), errosT.push(x))

  // 1. Apagar o que já não pertence a nenhuma ficha (só em biblioteca/ e dados/texto/) e o lixo (sem o seguir)
  const aApagar = [...plano.apagar, ...plano.blocosApagar]
  const vistas = new Set()
  let apagados = 0
  for (const [i, x] of [...aApagar, ...plano.lixo.map((rel) => ({ rel, lixo: true }))].entries()) {
    parar()
    const partes = x.rel.split('/')
    if (partes.some((p) => !p || p === '.' || p === '..')) continue
    if (x.lixo ? !(partes.length === 1 || /^(biblioteca|dados|leitura)$/.test(partes[0])) : !/^(biblioteca|dados\/texto)\//.test(x.rel)) continue
    try {
      // (nenhuma pasta do caminho pode ser uma ligação simbólica: o apagar ficaria fora do destino)
      if (!(await semLigacoesAte(destino, x.rel, vistas))) continue
      const abs = path.join(destino, x.rel)
      if (x.lixo) {
        const st = await lstat(abs)
        if (!st || !(st.isSymbolicLink() || (st.isFile() && eLixoDoSistema(path.basename(abs))))) continue
      }
      await fsp.rm(abs, { force: true })
      if (!x.lixo) (apagados++, linhas.push(`APAGADO  ${x.rel}${x.renomeado ? '  (mudou de nome)' : ''}`))
      delete marca.ficheiros[nfc(x.rel.replace(/^biblioteca\//, ''))]
      delete marca.blocos[x.rel.replace(/^dados\/texto\//, '')]
    } catch (e) {
      falhou(m('apagar {rel}: {erro}', { rel: x.rel, erro: traduzivel(e) }))
    }
    if (!x.lixo) aviso({ fase: 'apagar', feitos: i + 1, total: aApagar.length })
  }
  await apagarVazias(path.join(destino, 'biblioteca'))
  await guardarMarca()

  // 2. Copiar os ficheiros novos ou mudados
  const falhados = new Set()
  const bytesTotal = plano.contagens.bytesCopiar
  let bytes = 0
  let copiados = 0
  let ultimaMarca = Date.now()
  for (const x of plano.emDia) marca.ficheiros[x.caminho] = { tamanho: x.tamanho, modificado: x.modificado, ficha: x.ficha }
  for (const [i, x] of plano.copiar.entries()) {
    // (interrompida: a marca fica em dia, para a próxima vez continuar daqui)
    if (opcoes.sinal?.aborted) await guardarMarca()
    parar()
    try {
      const pasta = await pastaSegura(destino, path.posix.dirname(`biblioteca/${x.caminho}`), feitas)
      await copiarFicheiro(x.origem, path.join(pasta, path.posix.basename(x.caminho)), x.modificado, plano.clonar)
      marca.ficheiros[x.caminho] = { tamanho: x.tamanho, modificado: x.modificado, ficha: x.ficha }
      copiados++
      bytes += x.tamanho
      linhas.push(`COPIADO  ${x.caminho}  (${tamanho(x.tamanho)})`)
    } catch (e) {
      falhados.add(x.caminho)
      delete marca.ficheiros[x.caminho]
      falhou(m('copiar {caminho}: {erro}', { caminho: x.caminho, erro: traduzivel(e) }))
      linhas.push(`ERRO  ${x.caminho}: ${e.message}`)
    }
    aviso({ fase: 'copiar', feitos: i + 1, total: plano.copiar.length, bytes, bytesTotal })
    // (de 30 em 30 segundos a marca fica em dia: se parar a meio, a próxima vez não volta a copiar tudo)
    if (Date.now() - ultimaMarca > 30000) (await guardarMarca(), (ultimaMarca = Date.now()))
  }
  await guardarMarca()

  // 3. Texto integral: só os blocos novos ou alterados
  let blocosEscritos = 0
  const blocosFeitos = new Set()
  const idsPorBloco = new Map()
  for (const f of plano.dados.fichas) if (f.bloco_texto) idsPorBloco.set(f.bloco_texto, (idsPorBloco.get(f.bloco_texto) || new Set()).add(f.id))
  for (const [i, b] of plano.blocos.entries()) {
    parar()
    aviso({ fase: 'texto', feitos: i, total: plano.blocos.length })
    const existe = fs.existsSync(path.join(destino, 'dados', 'texto', b.nome))
    if (b.estado === 'igual' && existe && marca.blocos[b.nome] === b.sha) {
      blocosFeitos.add(b.n)
      continue
    }
    try {
      const c = await conteudoDoBloco(plano.base, b.n, idsPorBloco.get(b.n) || new Set())
      if (!c) continue
      const h = sha(c.conteudo)
      if (!existe || marca.blocos[b.nome] !== h) {
        await escreverAtomico(destino, `dados/texto/${b.nome}`, c.conteudo, feitas)
        blocosEscritos++
        linhas.push(`TEXTO  dados/texto/${b.nome}  (${c.quantos} textos, ${tamanho(Buffer.byteLength(c.conteudo))})`)
      }
      marca.blocos[b.nome] = h
      blocosFeitos.add(b.n)
    } catch (e) {
      falhou(m('texto {nome}: {erro}', { nome: b.nome, erro: traduzivel(e) }))
    }
  }

  // 4. Fichas (sem os ficheiros que não foi possível copiar)
  aviso({ fase: 'fichas', feitos: 0, total: 1 })
  const tamanhos = new Map(plano.necessarios.map((x) => [x.caminho, x.tamanho]))
  const fichas = plano.dados.fichas.map((f) => ({
    ...f,
    ficheiros: f.ficheiros.filter((x) => !falhados.has(x.caminho)),
    originais: f.originais
      .map((o) => {
        const imagens = o.imagens.filter((im) => !falhados.has(`${o.pasta}/${im}`))
        return imagens.length === o.imagens.length ? o : { ...o, imagens, tamanho: imagens.reduce((s, im) => s + (tamanhos.get(`${o.pasta}/${im}`) || 0), 0) }
      })
      .filter((o) => o.imagens.length),
    bloco_texto: blocosFeitos.has(f.bloco_texto) ? f.bloco_texto : 0,
  }))
  const dados = { formato: FORMATO, exportado_em, programa: plano.programa, tipos: plano.dados.tipos, fichas, notas: plano.dados.notas }
  await escreverAtomico(destino, 'dados/fichas.js', `window.TINCTORIS_DADOS = ${seguro(JSON.stringify(dados))}\n`, feitas)

  // 5. Página, letras e LEIA-ME (só se reescreve o que mudou)
  aviso({ fase: 'pagina', feitos: 0, total: plano.pagina.length })
  for (const p of plano.pagina) {
    try {
      const novo = await fsp.readFile(p.de)
      const antigo = await fsp.readFile(path.join(destino, p.para)).catch(() => null)
      if (!antigo || !antigo.equals(novo)) await escreverAtomico(destino, p.para, novo, feitas)
    } catch (e) {
      falhou(m('página {pagina}: {erro}', { pagina: p.para, erro: traduzivel(e) }))
    }
  }
  const d = new Date()
  await escreverAtomico(
    destino,
    LEIAME,
    [
      'TINCTORIS — cópia só de leitura de uma biblioteca de fontes (fichas, notas de leitura e ficheiros).',
      `Para abrir: duplo clique em «${PAGINA}» (abre no navegador, sem internet, em Mac ou Windows).`,
      'Não mude o nome nem o lugar das pastas «biblioteca», «dados» e «leitura»: a página deixaria de encontrar os ficheiros.',
      'Esta pasta é substituída na próxima exportação: as alterações fazem-se no TINCTORIS de origem.',
      `Exportada a ${d.toLocaleDateString('pt-PT')} às ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · ${fichas.length} fontes · ${plano.programa}.`,
      '',
    ].join('\r\n'),
    feitas
  )

  // 6. A marca por último
  for (const c of Object.keys(marca.ficheiros)) if (!tamanhos.has(c) || falhados.has(c)) delete marca.ficheiros[c]
  const nomesBlocos = new Set(plano.blocos.map((b) => b.nome))
  for (const b of Object.keys(marca.blocos)) if (!nomesBlocos.has(b)) delete marca.blocos[b]
  marca.formato = FORMATO
  marca.exportado_em = exportado_em
  await guardarMarca()
  if (plano.sistema && !['apfs', 'hfs'].includes(plano.sistema)) await limparAppleDouble(destino)

  const resultado = {
    destino,
    copiados,
    bytes,
    apagados,
    blocosEscritos,
    erros,
    erros_t: errosT,
    segundos: Math.round((Date.now() - inicio) / 100) / 10,
  }
  resultado.registo = escreverRegisto(plano, { ...resultado, linhas }, opcoes.registos)
  aviso({ fase: 'pronto', feitos: 1, total: 1, bytes, bytesTotal })
  return resultado
}

// ---------- listas (app/registos) ----------

export function resumo(plano) {
  const c = plano.contagens
  const l = [
    `Destino: ${plano.destino} (${plano.existe ? (plano.exportadoAntes ? `cópia de leitura de ${plano.exportadoAntes.replace('T', ' ')}` : 'cópia de leitura') : 'pasta nova'})`,
    `Disco de destino: ${plano.sistema || 'desconhecido'} · livre ${tamanho(plano.livre)}${plano.clonar ? ' · mesmo disco APFS da biblioteca (cópias instantâneas, sem ocupar espaço)' : ''}`,
    `Fichas: ${c.fichas} (sem ficheiro: ${c.fichasSemFicheiro}; com ficheiro em falta na biblioteca: ${c.fichasEmFalta}, ${c.ficheirosEmFalta} ficheiros/pastas) · notas de leitura: ${c.notas}`,
    `Ficheiros: ${c.ficheiros} (${tamanho(c.bytes)}), dos quais ${c.imagens} fotografias originais em ${c.pastasOriginais} pastas`,
    `A copiar: ${c.copiar} (${tamanho(c.bytesCopiar)}) · já em dia: ${c.emDia} · a apagar: ${c.apagar} (${tamanho(c.bytesApagar)}${c.apagarRenomeados ? `; ${c.apagarRenomeados} mudaram de nome` : ''})`,
    `Texto integral: ${c.fichasComTexto} fichas em ${c.blocos} blocos (${c.blocosNovos} novos, ${c.blocosAlterados} alterados, ${c.blocosApagar} a apagar)`,
  ]
  if (c.palavrasDoDono) l.push(`Palavras-chave com o nome do dono retiradas da cópia: ${c.palavrasDoDono}`)
  if (plano.precisaConfirmacaoForte) l.push(`PRECISA DE CONFIRMAÇÃO: para aplicar, escrever o número de ficheiros a apagar (${c.nApagar}); na linha de comandos, --confirmar-apagar ${c.nApagar}`)
  for (const a of plano.avisos) l.push(`AVISO: ${a}`)
  return l
}

export function escreverRegisto(plano, resultado, pasta) {
  const pastaRegistos = path.resolve(pasta || path.join(PASTAS.dados, '..', 'registos'))
  fs.mkdirSync(pastaRegistos, { recursive: true })
  const d = new Date()
  const hoje = horaLocal(d).slice(0, 10)
  const ficheiro = path.join(pastaRegistos, resultado ? `exportar-leitura-${hoje}.txt` : `exportar-leitura-simulacao-${hoje}.txt`)
  const secao = (titulo, l) => (l.length ? ['', `${titulo}: ${l.length}`, ...l.map((x) => `  ${x}`)] : [])
  const t = [
    `== Cópia de leitura do TINCTORIS — ${resultado ? 'APLICADO' : 'SIMULAÇÃO'} ${d.toLocaleString('pt-PT')}`,
    `Base: ${plano.base} · biblioteca: ${plano.origem}`,
    ...resumo(plano),
  ]
  if (resultado) {
    t.push(`Feito em ${resultado.segundos} s: ${resultado.copiados} copiados (${tamanho(resultado.bytes)}), ${resultado.apagados} apagados, ${resultado.blocosEscritos} blocos de texto escritos, ${resultado.erros.length} erros.`)
    t.push(...secao('Erros', resultado.erros), ...secao('Feito', resultado.linhas))
  } else {
    t.push(
      ...secao('A copiar', plano.copiar.map((x) => `${x.caminho}  (${tamanho(x.tamanho)})${x.substitui ? ' [substitui]' : ''}`)),
      ...secao('A apagar', plano.apagar.concat(plano.blocosApagar).map((x) => `${x.rel}${x.renomeado ? '  (mudou de nome)' : ''}`)),
      ...secao('Blocos de texto a escrever', plano.blocos.filter((b) => b.estado !== 'igual').map((b) => `${b.nome}  (${b.estado}, ${b.textos} textos, ${tamanho(b.tamanho)})`))
    )
  }
  t.push(
    ...secao('Ficheiros em falta na biblioteca (a ficha sai sem eles)', plano.emFalta.map((x) => `#${x.numero}  ${x.caminho}`)),
    ...secao('Ficheiros que não saem (fora da biblioteca ou em _duplicados)', plano.fora.map((x) => `#${x.numero}  ${x.caminho}`)),
    ...secao('Ficheiros que não saem (nome reservado no Windows)', plano.reservados.map((x) => `#${x.numero}  ${x.caminho}`)),
    ...secao(`Caminhos com mais de ${LIMITE_WINDOWS} caracteres (Windows)`, plano.longos),
    ...secao('Nomes com caracteres que o exFAT/Windows não aceitam', plano.invalidos),
    ...secao('Só diferem em maiúsculas/minúsculas', plano.maiusculas.map((l) => l.join('  ≈  '))),
    ''
  )
  if (resultado) fs.appendFileSync(ficheiro, '\n' + t.join('\n'))
  else fs.writeFileSync(ficheiro, t.join('\n'))
  return ficheiro
}

// ---------- linha de comandos ----------

// Uso pelo serviço (botão das Definições): --json escreve um objecto JSON por linha no stdout
//   {tipo:'progresso', fase, feitos, total, bytes, bytesTotal} · {tipo:'plano', resumo, contagens, avisos, apagar (os 100 primeiros), nApagar…}
//   {tipo:'fim', …} · {tipo:'erro', mensagem, chave, vars, codigo}
// SIGTERM interrompe com cuidado (acaba o ficheiro que está a copiar e guarda a marca: a próxima vez continua);
// --vigiar-stdin faz o mesmo quando quem o lançou desaparece (o serviço fecha o tubo).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const valor = (nome) => {
    const i = args.indexOf(nome)
    return i >= 0 ? args[i + 1] : undefined
  }
  const opcoes = {
    destino: valor('--destino'),
    base: valor('--base'),
    origem: valor('--origem'),
    amostra: Number(valor('--amostra')) || 0,
    numeros: valor('--numeros') ? valor('--numeros').split(/[,\s]+/).map((n) => Number(n.replace(/^#/, ''))).filter((n) => n > 0) : null,
    registos: valor('--registos'),
  }
  const aplicarJa = args.includes('--aplicar')
  const modoJson = args.includes('--json')
  const numeroDe = (nome) => (valor(nome) != null && valor(nome) !== '' && Number.isFinite(Number(valor(nome))) ? Number(valor(nome)) : null)
  const maxApagar = numeroDe('--max-apagar')
  const maxApagarOutros = numeroDe('--max-apagar-outros')
  const confirmarApagar = numeroDe('--confirmar-apagar')
  if (!opcoes.destino) {
    console.log('Uso: node src/exportar_leitura.js --destino PASTA [--base data.db] [--origem biblioteca] [--amostra N | --numeros 22,578] [--aplicar [--confirmar-apagar N] [--max-apagar N [--max-apagar-outros M]]] [--json]')
    process.exit(1)
  }
  // (o stdout de um tubo no Mac pode ser assíncrono: os últimos avisos esperam pela escrita antes de sair)
  const emitir = (o) => new Promise((ok) => process.stdout.write(JSON.stringify(o) + '\n', ok))
  const ctl = new AbortController()
  let aAplicar = false
  if (modoJson) {
    // (antes de escrever no destino não há nada a guardar: sai logo)
    process.on('SIGTERM', () => (aAplicar ? ctl.abort() : process.exit(143)))
    if (args.includes('--vigiar-stdin')) {
      process.stdin.on('end', () => (aAplicar ? ctl.abort() : process.exit(143)))
      process.stdin.on('error', () => {})
      process.stdin.resume()
    }
  }
  try {
    if (modoJson) emitir({ tipo: 'progresso', fase: 'planear', feitos: 0, total: 0 })
    const plano = await planear(opcoes)
    if (modoJson) {
      const aApagar = plano.apagar.concat(plano.blocosApagar)
      emitir({
        tipo: 'plano',
        destino: plano.destino,
        existe: plano.existe,
        exportadoAntes: plano.exportadoAntes,
        sistema: plano.sistema,
        livre: plano.livre,
        clonar: plano.clonar,
        resumo: resumo(plano),
        avisos: plano.avisos,
        avisos_t: plano.avisos_t,
        contagens: plano.contagens,
        apagar: aApagar.slice(0, 100).map((x) => x.rel),
        nApagar: aApagar.length,
        nApagarRenomeados: plano.contagens.apagarRenomeados,
        amostra: plano.amostra,
        amostraSobreCompleta: plano.amostraSobreCompleta,
        precisaConfirmacaoForte: plano.precisaConfirmacaoForte,
        motivosConfirmacao: plano.motivosConfirmacao,
        motivosConfirmacao_t: plano.motivosConfirmacao_t,
        registo: aplicarJa ? null : escreverRegisto(plano, null, opcoes.registos),
      })
      if (!aplicarJa) {
        await emitir({ tipo: 'fim', simulacao: true })
        process.exit(0)
      }
      aAplicar = true
      let ultimo = { fase: '', t: 0 }
      const r = await aplicar(plano, {
        registos: opcoes.registos,
        maxApagar,
        maxApagarOutros,
        confirmarApagar,
        sinal: ctl.signal,
        aoProgresso: (p) => {
          if (p.fase === ultimo.fase && Date.now() - ultimo.t < 400) return
          ultimo = { fase: p.fase, t: Date.now() }
          emitir({ tipo: 'progresso', ...p })
        },
      })
      await emitir({ tipo: 'fim', copiados: r.copiados, bytes: r.bytes, apagados: r.apagados, blocosEscritos: r.blocosEscritos, nErros: r.erros.length, erros: r.erros.slice(0, 20), erros_t: r.erros_t.slice(0, 20), segundos: r.segundos, registo: r.registo })
      process.exit(0)
    }
    console.log(`Cópia de leitura do TINCTORIS — ${aplicarJa ? 'A APLICAR' : 'SIMULAÇÃO (nada foi escrito no destino)'}`)
    for (const l of resumo(plano)) console.log(l)
    console.log(`Plano feito em ${plano.contagens.segundos} s.`)
    if (!aplicarJa) {
      console.log(`Lista completa: ${escreverRegisto(plano, null, opcoes.registos)}`)
      console.log('Para fazer a cópia: acrescentar --aplicar')
    } else {
      let ultimo = 0
      const r = await aplicar(plano, {
        registos: opcoes.registos,
        maxApagar,
        maxApagarOutros,
        confirmarApagar,
        aoProgresso: (p) => {
          if (p.fase === 'copiar' && Date.now() - ultimo > 5000) {
            ultimo = Date.now()
            console.log(`  a copiar ${p.feitos}/${p.total} (${tamanho(p.bytes)} de ${tamanho(p.bytesTotal)})`)
          }
        },
      })
      console.log(`Feito em ${r.segundos} s: ${r.copiados} copiados (${tamanho(r.bytes)}), ${r.apagados} apagados, ${r.blocosEscritos} blocos de texto escritos, ${r.erros.length} erros.`)
      for (const e of r.erros.slice(0, 20)) console.log(`  ERRO: ${e}`)
      console.log(`Lista: ${r.registo}`)
    }
  } catch (e) {
    if (modoJson) {
      await emitir({ tipo: 'erro', mensagem: e.message, ...(e.chave ? { chave: e.chave, vars: e.vars } : {}), codigo: e.codigo || (ctl.signal.aborted ? 'interrompido' : '') })
      process.exit(1)
    } else {
      console.error(`Erro: ${e.message}`)
      process.exit(1)
    }
  }
}
