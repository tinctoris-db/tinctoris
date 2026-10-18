// Tudo o que depende do sistema operativo (Mac ou Windows) num só sítio (versão Windows, fase 1 — Pedro, 18/10/2026).
// No Mac cada função faz exactamente o que o serviço já fazia; em Windows faz o equivalente. As funções que leem a
// saída de um programa têm a leitura separada (lerPmset, lerMount, lerBateriaWindows, lerVolumesWindows), para se
// poderem testar em qualquer sistema.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, execFileSync, spawn } from 'node:child_process'

export const MAC = process.platform === 'darwin'
export const WINDOWS = process.platform === 'win32'

const correr = (bin, args, timeout = 15000) =>
  new Promise((ok) => execFile(bin, args, { encoding: 'utf8', timeout, windowsHide: true }, (e, out) => ok(e ? null : out)))
const powershell = (comando, timeout = 15000) => correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], timeout)

// ---------------------------------------------------------------------------
// Versão do sistema (página Acerca e comentários enviados)
export function versaoDoSistema() {
  try {
    if (MAC) return { nome: 'macOS', versao: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() }
  } catch (_) {
    return { nome: 'macOS', versao: '' }
  }
  if (WINDOWS) return { nome: 'Windows', versao: os.release() }
  return { nome: os.type(), versao: os.release() }
}

// ---------------------------------------------------------------------------
// Abrir um ficheiro ou uma pasta no programa do sistema, ou mostrá-lo na pasta (Finder / Explorador)
export function abrir(abs, { naPasta = false } = {}) {
  let bin, args
  // (Windows: o explorer só entende «/select,"caminho com espaços"» tal e qual, sem as aspas que o Node acrescenta)
  if (WINDOWS && naPasta) return spawn('explorer.exe', [`/select,"${abs}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref()
  if (WINDOWS) (bin = 'explorer.exe'), (args = [abs])
  else if (MAC) (bin = '/usr/bin/open'), (args = naPasta ? ['-R', abs] : [abs])
  else (bin = 'xdg-open'), (args = [naPasta ? path.dirname(abs) : abs])
  spawn(bin, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

// ---------------------------------------------------------------------------
// Lixo: pasta para onde se movem os ficheiros postos de parte (no Mac, mover para lá é instantâneo e o
// utilizador vê-os no Lixo). LIXO_DIR (a cópia de teste) passa à frente em qualquer sistema.
export function lixoDoSistema(pastaBiblioteca) {
  if (process.env.LIXO_DIR) return process.env.LIXO_DIR
  if (MAC) {
    const volume = (/^(\/Volumes\/[^/]+)/.exec(pastaBiblioteca) || [])[1]
    // (no disco externo, o Lixo do Mac para esse disco é .Trashes/<uid>)
    return volume ? path.join(volume, '.Trashes', String(os.userInfo().uid)) : path.join(os.homedir(), '.Trash')
  }
  // (Windows: a Reciclagem não é uma pasta para onde se possam mover ficheiros; o que no Mac vai para o Lixo vai para
  // uma pasta visível na raiz do mesmo disco — instantâneo, reversível, esvazia-se à mão)
  const lixo = path.join(path.parse(path.resolve(pastaBiblioteca)).root, 'TINCTORIS - Lixo')
  fs.mkdirSync(lixo, { recursive: true })
  return lixo
}

// ---------------------------------------------------------------------------
// Energia: ligado ao carregador ou a bateria (e a percentagem). Sem bateria (computador de secretária) = carregador.
export function lerPmset(out) {
  const pct = /(\d+)%/.exec(out)
  return { carregador: !/Battery Power/.test(out), bateria: pct ? Number(pct[1]) : null }
}
// (Win32_Battery: BatteryStatus 2 = ligado à corrente; 1 = a descarregar; 3–9 = a carregar ou cheia)
export function lerBateriaWindows(json) {
  let b
  try {
    b = JSON.parse(json || 'null')
  } catch (_) {
    return null
  }
  if (Array.isArray(b)) b = b[0]
  if (!b) return { carregador: true, bateria: null }
  return { carregador: Number(b.BatteryStatus) !== 1, bateria: b.EstimatedChargeRemaining == null ? null : Number(b.EstimatedChargeRemaining) }
}
// Devolve null quando não se consegue saber (fica o valor anterior)
export async function lerEnergia() {
  if (MAC) {
    const out = await correr('/usr/bin/pmset', ['-g', 'batt'], 10000)
    return out === null ? null : lerPmset(out)
  }
  if (WINDOWS) return lerBateriaWindows(await powershell('Get-CimInstance Win32_Battery | Select-Object BatteryStatus,EstimatedChargeRemaining | ConvertTo-Json -Compress'))
  return { carregador: true, bateria: null }
}

// ---------------------------------------------------------------------------
// Prioridade baixa
// Um programa externo (pdftoppm, tesseract…) em prioridade baixa: no Mac com o taskpolicy (núcleos económicos);
// em Windows os programas herdam a prioridade do serviço (ver prioridadeDoServico), por isso correm tal e qual.
export function comandoEmPoupanca(bin, args) {
  return MAC ? ['/usr/sbin/taskpolicy', ['-b', bin, ...args]] : [bin, args]
}
// O próprio serviço em prioridade baixa ou normal
export async function prioridadeDoServico(baixa) {
  if (MAC) {
    await correr('/usr/sbin/taskpolicy', [baixa ? '-b' : '-B', '-p', String(process.pid)])
    return
  }
  try {
    os.setPriority(process.pid, baixa ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL)
  } catch (_) {}
}
// Um comando «gentil» (nice -n 15), para trabalhos longos que não devem atrasar o resto
export function comandoGentil(args) {
  return WINDOWS ? [args[0], args.slice(1)] : ['nice', ['-n', '15', ...args]]
}

// ---------------------------------------------------------------------------
// Não deixar o computador adormecer enquanto o serviço (pid) corre. Devolve o processo (para o parar com .kill())
// ou null. No Mac, o caffeinate; em Windows, um PowerShell que pede ao sistema para não adormecer até o serviço acabar.
export function manterAcordado(pid = process.pid) {
  if (MAC) return spawn('/usr/bin/caffeinate', ['-i', '-w', String(pid)], { stdio: 'ignore' })
  if (WINDOWS) {
    const script = [
      "Add-Type -Namespace T -Name P -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'",
      `while (Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue) { [void][T.P]::SetThreadExecutionState([uint32]2147483649); Start-Sleep -Seconds 30 }`,
    ].join('; ')
    return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true })
  }
  return null
}

// ---------------------------------------------------------------------------
// Discos montados: [{ ponto, sistema (exfat, apfs, ntfs…), oculto }]. No Mac, pela lista do `mount`; em Windows,
// pelas letras de unidade (Get-Volume).
export function lerMount(saida) {
  const out = []
  for (const l of String(saida || '').split('\n')) {
    const m = l.match(/^.+? on (.+) \(([^)]*)\)\s*$/)
    if (!m) continue
    const o = m[2].split(',').map((x) => x.trim().toLowerCase())
    out.push({ ponto: m[1], sistema: o[0], oculto: o.includes('nobrowse') || o[0] === 'autofs' })
  }
  return out
}
export function lerVolumesWindows(json) {
  let v
  try {
    v = JSON.parse(json || '[]')
  } catch (_) {
    return []
  }
  if (!Array.isArray(v)) v = [v]
  return v
    .filter((x) => x && x.DriveLetter)
    .map((x) => ({ ponto: `${String(x.DriveLetter).toUpperCase()}:\\`, sistema: String(x.FileSystem || '').toLowerCase(), oculto: false, nome: x.FileSystemLabel || '' }))
}
export async function discosMontados() {
  if (MAC) return lerMount(await correr('/sbin/mount', []))
  if (WINDOWS) return lerVolumesWindows(await powershell('Get-Volume | Select-Object DriveLetter,FileSystem,FileSystemLabel | ConvertTo-Json -Compress'))
  return lerMount(await correr('mount', []))
}
// Discos externos que podem receber cópias (no Mac, os que estão em /Volumes; em Windows, as letras de unidade)
export async function discosExternos() {
  const todos = await discosMontados()
  if (MAC) return todos.filter((d) => d.ponto.startsWith('/Volumes/') && !d.oculto)
  return todos.filter((d) => !d.oculto)
}

// ---------------------------------------------------------------------------
// Cópia instantânea no mesmo disco (clone APFS, `cp -c`); fora do Mac, cópia normal
export function clonarFicheiro(de, para) {
  if (!MAC) return fs.promises.copyFile(de, para, fs.constants.COPYFILE_EXCL)
  return new Promise((ok, falha) => execFile('/bin/cp', ['-c', de, para], (e, _, msg) => (e ? falha(new Error(String(msg || e.message).trim())) : ok())))
}

// ---------------------------------------------------------------------------
// Onde procurar os programas externos (pdftoppm, tesseract, ffprobe…)
export function pastasDeProgramas(app) {
  if (WINDOWS) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    // (o instalador regista em app/ferramentas/caminhos.txt as pastas onde o winget pôs cada programa)
    let registadas = []
    try {
      registadas = fs.readFileSync(path.join(app, 'ferramentas', 'caminhos.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    } catch (_) {}
    return [...registadas, path.join(app, 'ferramentas', 'bin'), path.join(pf, 'Tesseract-OCR'), path.join(pf, 'poppler', 'Library', 'bin'), path.join(local, 'Microsoft', 'WinGet', 'Links')]
  }
  return ['/opt/homebrew/bin', '/usr/local/bin']
}
export const nomeDePrograma = (nome) => (WINDOWS ? `${nome}.exe` : nome)
