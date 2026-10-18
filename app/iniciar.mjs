// Inicia o TINCTORIS em Windows (versão Windows, fase 3 — Pedro, 18/10/2026): o equivalente de
// «Iniciar TINCTORIS.command» + app/iniciar.sh do Mac. Corre-se com duplo clique em «Iniciar TINCTORIS.bat».
// 1. Vê se há uma versão nova publicada no GitHub (release); se houver, pergunta, faz cópia da base e actualiza a
//    partir do .zip da release (sem Git; nunca apaga nada, só substitui os ficheiros do programa).
// 2. Arranca a base de dados (PocketBase), o serviço de fundo e, se estiver instalada, a IA local (Ollama).
// Fechar a janela (ou Ctrl+C) pára tudo. PB_PORTA / SERVICO_PORTA / SEM_ACTUALIZAR servem para ensaios.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline/promises'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.dirname(APP)
const WINDOWS = process.platform === 'win32'
const exe = (n) => (WINDOWS ? `${n}.exe` : n)
const PB_PORTA = Number(process.env.PB_PORTA) || 8090
const SERVICO_PORTA = Number(process.env.SERVICO_PORTA) || 8091
const PB_URL = `http://127.0.0.1:${PB_PORTA}`
const REPOSITORIO = 'tinctoris-db/tinctoris'

Object.assign(process.env, {
  BIBLIOTECA_DIR: process.env.BIBLIOTECA_DIR || path.join(RAIZ, 'biblioteca'),
  WATCH_DIR: process.env.WATCH_DIR || path.join(RAIZ, 'watch_folder'),
  PB_PORTA: String(PB_PORTA),
  PB_URL,
  SERVICO_PORTA: String(SERVICO_PORTA),
  PATH: [path.join(APP, 'node'), path.join(APP, 'ferramentas', 'bin'), process.env.PATH].join(path.delimiter),
})

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const correr = (bin, args, opcoes = {}) =>
  new Promise((ok, falha) => execFile(bin, args, { windowsHide: true, maxBuffer: 64 << 20, ...opcoes }, (e, out, err) => (e ? falha(new Error(String(err || e.message).trim())) : ok(out))))
async function responde(url, ms = 1500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return r.ok
  } catch (_) {
    return false
  }
}
function abrirNavegador(url) {
  if (process.env.SEM_NAVEGADOR) return
  if (WINDOWS) spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}
const versaoLocal = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP, 'worker', 'package.json'), 'utf8')).version
  } catch (_) {
    return ''
  }
}
// «0.11.0-beta» > «0.10.2-beta»; uma versão sem sufixo é mais nova do que a mesma com sufixo
export function maisNova(a, b) {
  const p = (v) => String(v || '').replace(/^v/, '').split('-')
  const [na, sa = ''] = p(a)
  const [nb, sb = ''] = p(b)
  const xa = na.split('.').map(Number)
  const xb = nb.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((xa[i] || 0) !== (xb[i] || 0)) return (xa[i] || 0) > (xb[i] || 0)
  if (!sa && sb) return true
  if (sa && !sb) return false
  return sa > sb
}

// ---------------------------------------------------------------------------
// Actualização pela release

// O que nunca vem do .zip (dados, peças instaladas e segredos deste computador)
const NAO_TOCAR = ['biblioteca', 'watch_folder', 'watch_folder_em_espera', 'nao_processados', 'TINCTORIS - Lixo', 'app/pb_data', 'app/dados', 'app/registos', 'app/node', 'app/modelos', 'app/tessdata', 'app/bin', 'app/cache', 'app/ferramentas', 'app/worker/node_modules', 'app/.segredo', 'app/.servico.json', 'app/.so_local']
const protegido = (rel) => NAO_TOCAR.some((p) => rel === p || rel.startsWith(p + '/'))

async function copiarPrograma(de, para, rel = '') {
  for (const e of await fsp.readdir(de, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (protegido(r)) continue
    const a = path.join(de, e.name)
    const b = path.join(para, e.name)
    if (e.isDirectory()) {
      await fsp.mkdir(b, { recursive: true })
      await copiarPrograma(a, b, r)
    } else if (e.isFile()) await fsp.copyFile(a, b)
  }
}

async function copiaDaBase() {
  const base = path.join(APP, 'pb_data', 'data.db')
  if (!fs.existsSync(base)) return ''
  const { BIN } = await import('./worker/src/config.js')
  const d = new Date()
  const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  const nome = `antes-atualizar-${carimbo}.zip`
  const destino = path.join(APP, 'pb_data', 'backups', nome)
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tinctoris-copia-'))
  try {
    await fsp.mkdir(path.dirname(destino), { recursive: true })
    const ficheiros = ['data.db']
    await correr(BIN.sqlite3, [base, `.backup '${path.join(tmp, 'data.db')}'`])
    const aux = path.join(APP, 'pb_data', 'auxiliary.db')
    if (fs.existsSync(aux)) {
      await correr(BIN.sqlite3, [aux, `.backup '${path.join(tmp, 'auxiliary.db')}'`])
      ficheiros.push('auxiliary.db')
    }
    // (o tar do Windows 10/11 faz .zip com -a)
    await correr(WINDOWS ? 'tar.exe' : 'zip', WINDOWS ? ['-a', '-c', '-f', destino, '-C', tmp, ...ficheiros] : ['-q', '-1', '-j', destino, ...ficheiros.map((f) => path.join(tmp, f))])
    // (o ficheiro .attrs faz a cópia aparecer em Definições, como as cópias do PocketBase)
    const md5 = crypto.createHash('md5').update(await fsp.readFile(destino)).digest('base64')
    await fsp.writeFile(
      destino + '.attrs',
      JSON.stringify({ 'user.cache_control': '', 'user.content_disposition': '', 'user.content_encoding': '', 'user.content_language': '', 'user.content_type': 'application/zip', 'user.metadata': { 'original-filename': nome }, md5 })
    )
    return nome
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

async function actualizar() {
  if (process.env.SEM_ACTUALIZAR) return
  let release
  try {
    const r = await fetch(`https://api.github.com/repos/${REPOSITORIO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TINCTORIS' }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return
    release = await r.json()
  } catch (_) {
    return // (sem internet: continua com a versão actual, sem avisos)
  }
  const local = versaoLocal()
  if (!release?.tag_name || !release.zipball_url || !maisNova(release.tag_name, local)) return
  console.log(`\n  Há uma versão nova do TINCTORIS: ${release.tag_name.replace(/^v/, '')} (esta é a ${local}).`)
  const resumo = String(release.body || '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-') || l.startsWith('*')).slice(0, 12)
  for (const l of resumo) console.log(`   ${l}`)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await rl.question('\n  Actualizar agora? (s = sim, n = não) ')
  rl.close()
  if (!/^[sy]/i.test(resposta.trim())) return console.log('  Continua com a versão actual.\n')
  try {
    console.log('  A fazer uma cópia de segurança da base de dados (pode demorar um minuto)…')
    const copia = await copiaDaBase()
    if (copia) console.log(`  Cópia feita: ${copia}`)
  } catch (e) {
    return console.log(`  Não consegui fazer a cópia de segurança (${e.message}): não actualizo. Continua com a versão actual.\n`)
  }
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tinctoris-versao-'))
  try {
    console.log('  A descarregar a versão nova…')
    const r = await fetch(release.zipball_url, { headers: { 'User-Agent': 'TINCTORIS' }, signal: AbortSignal.timeout(600000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const zip = path.join(tmp, 'versao.zip')
    await fsp.writeFile(zip, Buffer.from(await r.arrayBuffer()))
    const pasta = path.join(tmp, 'x')
    await fsp.mkdir(pasta)
    await correr(WINDOWS ? 'tar.exe' : 'unzip', WINDOWS ? ['-x', '-f', zip, '-C', pasta] : ['-q', zip, '-d', pasta])
    // (o .zip do GitHub tem uma pasta à volta: «tinctoris-db-tinctoris-<commit>/»)
    const [dentro] = await fsp.readdir(pasta)
    const raizNova = path.join(pasta, dentro)
    if (!fs.existsSync(path.join(raizNova, 'app', 'worker', 'package.json'))) throw new Error('o .zip não tem o programa')
    const pacoteAntes = await fsp.readFile(path.join(APP, 'worker', 'package-lock.json'), 'utf8').catch(() => '')
    await copiarPrograma(raizNova, RAIZ)
    const pacoteDepois = await fsp.readFile(path.join(APP, 'worker', 'package-lock.json'), 'utf8').catch(() => '')
    if (pacoteAntes !== pacoteDepois) {
      console.log('  A instalar as peças novas do serviço…')
      await correr(WINDOWS ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: path.join(APP, 'worker'), shell: WINDOWS }).catch((e) => console.log(`  Aviso: a instalação das peças novas falhou (${e.message}).`))
    }
    console.log(`  Programa actualizado para a ${release.tag_name.replace(/^v/, '')}. A arrancar…\n`)
  } catch (e) {
    console.log(`  A actualização falhou (${e.message}): continua com a versão actual.\n`)
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Arranque

function ollamaInstalado() {
  const local = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')
  if (WINDOWS && fs.existsSync(local)) return local
  for (const d of String(process.env.PATH).split(path.delimiter)) if (d && fs.existsSync(path.join(d, exe('ollama')))) return path.join(d, exe('ollama'))
  return ''
}

async function arrancar() {
  if (!fs.existsSync(path.join(APP, '.segredo')) || !fs.existsSync(path.join(APP, 'worker', 'node_modules'))) {
    console.log('O TINCTORIS ainda não está instalado neste computador.')
    console.log(`Corra primeiro a instalação: ${path.join(APP, WINDOWS ? 'instalar.ps1' : 'instalar.sh')}`)
    process.exitCode = 1
    return
  }
  if (await responde(`${PB_URL}/api/health`, 2000)) {
    console.log('O TINCTORIS já está a correr. A abrir no navegador...')
    abrirNavegador(PB_URL)
    return
  }
  for (const p of [process.env.BIBLIOTECA_DIR, process.env.WATCH_DIR, path.join(APP, 'registos')]) fs.mkdirSync(p, { recursive: true })
  // Só neste computador (app/.so_local, criado pelo instalador) ou também noutros aparelhos da mesma rede
  const escuta = fs.existsSync(path.join(APP, '.so_local')) ? '127.0.0.1' : '0.0.0.0'
  process.env.PB_ESCUTA = escuta

  const filhos = []
  const registo = (nome) => fs.createWriteStream(path.join(APP, 'registos', nome), { flags: 'a' })
  const pb = spawn(path.join(APP, 'bin', exe('pocketbase')), ['serve', '--http', `${escuta}:${PB_PORTA}`, '--dir', path.join(APP, 'pb_data'), '--hooksDir', path.join(APP, 'pb_hooks'), '--migrationsDir', path.join(APP, 'pb_migrations'), '--publicDir', path.join(APP, 'pb_public'), '--hooksWatch=false'], { windowsHide: true })
  pb.stdout.pipe(registo('pocketbase.log'))
  pb.stderr.pipe(registo('pocketbase.log'))
  filhos.push(pb)
  const parar = () => {
    for (const f of filhos) if (f && f.exitCode === null) f.kill()
  }
  process.on('SIGINT', () => (parar(), console.log('\nTINCTORIS parado.'), process.exit(0)))
  process.on('SIGHUP', () => (parar(), process.exit(0)))
  process.on('exit', parar)

  for (let i = 0; i < 40 && !(await responde(`${PB_URL}/api/health`, 1000)); i++) await dormir(500)

  // Não adormecer enquanto a base estiver aberta e o computador ligado à corrente (no Mac: caffeinate -s)
  const { manterAcordado } = await import('./worker/src/plataforma.js')
  filhos.push(manterAcordado(pb.pid))

  const ollama = ollamaInstalado()
  if (ollama && !(await responde('http://127.0.0.1:11434/api/version', 1000))) {
    // (em Windows, os modelos ficam na pasta normal do Ollama, a mesma que a aplicação do Ollama usa)
    const env = { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', ...(WINDOWS ? {} : { OLLAMA_MODELS: path.join(APP, 'modelos') }) }
    const ol = spawn(ollama, ['serve'], { windowsHide: true, env })
    ol.stdout.pipe(registo('ollama.log'))
    ol.stderr.pipe(registo('ollama.log'))
    filhos.push(ol)
  }

  const servico = spawn(process.execPath, ['--no-deprecation', 'src/index.js'], { cwd: path.join(APP, 'worker'), windowsHide: true })
  const logServico = registo('servico.log')
  for (const s of [servico.stdout, servico.stderr]) s.on('data', (d) => (process.stdout.write(d), logServico.write(d)))
  filhos.push(servico)

  const enderecos = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
  console.log('')
  console.log('  ┌──────────────────────────────────────────────────────────┐')
  console.log('  │  TINCTORIS a funcionar                                     │')
  console.log('  └──────────────────────────────────────────────────────────┘')
  console.log(`   Neste computador:     ${PB_URL}`)
  if (escuta === '0.0.0.0' && enderecos[0]) console.log(`   Noutros dispositivos: http://${enderecos[0].address}:${PB_PORTA}  (mesma rede Wi-Fi)`)
  console.log(`   Watch folder:         ${process.env.WATCH_DIR}`)
  if (ollama) console.log('   IA local:             ligada')
  console.log('')
  console.log('   Para parar: feche esta janela ou carregue Ctrl+C.')
  console.log('')
  abrirNavegador(PB_URL)
  await new Promise((r) => pb.on('exit', r))
  parar()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await actualizar()
  await arrancar()
}
