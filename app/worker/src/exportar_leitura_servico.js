// «Cópia de leitura (disco externo)» nas Definições (pedido do Pedro, 5/10/2026).
// O exportador (exportar_leitura.js) usa ~1,3 GB de memória com a biblioteca inteira: corre num processo à parte
// (node … --json, um objecto por linha) e este módulo só guarda o estado para a interface ir lendo.
//   estados: parado | a_simular | simulado | a_copiar | feito | erro | parado_pelo_utilizador
// Um trabalho de cada vez. «Actualizar» só depois de uma simulação da mesma pasta; o exportador volta a planear e,
// se agora apagasse mais ficheiros do que a simulação mostrou (--max-apagar), recusa antes de mexer em nada — salvo se os
// ficheiros a mais forem de fichas que mudaram de nome entretanto (a fila de reanálise renomeia ficheiros).
// Quando o plano apaga muito (ver FORMATO.md §5), só avança com o número de ficheiros a apagar escrito pelo utilizador.
// «Parar» interrompe com cuidado (acaba o ficheiro em curso e guarda a marca); a próxima actualização continua daí.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PASTAS } from './config.js'
import { discosExternos } from './plataforma.js'
import { foraDasProtegidas } from './exportar_leitura.js'
import { comPrioridade } from './intensidade.js'
import { log } from './registo.js'
import { m, erro, traduzivel } from './mensagens.js'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exportar_leitura.js')
const FICHEIRO = path.join(PASTAS.dados, 'exportar-leitura.json')
const MARCA = '.tinctoris-leitura.json'
const PASTA_NO_DISCO = 'TINCTORIS'

let trabalho = { estado: 'parado' }
let filho = null
let pedidoParar = false

const ocupado = () => trabalho.estado === 'a_simular' || trabalho.estado === 'a_copiar'
const real = (p) => {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

// Caminho completo, com a pasta onde ficaria já existente, fora do TINCTORIS (e sem o conter).
// (a comparação ignora maiúsculas e formas Unicode, como o disco do Mac: foraDasProtegidas em exportar_leitura.js)
export function validarDestino(destino) {
  let d = String(destino || '').trim()
  if (!d || d.includes('\0') || !path.isAbsolute(d)) throw erro('Escolha um disco da lista ou escreva o caminho completo da pasta (começa por /).')
  d = path.resolve(d)
  const pai = path.dirname(d)
  if (!fs.existsSync(pai)) throw erro('A pasta onde ficaria a cópia não existe (o disco está ligado?): {pai}', { pai })
  if (!foraDasProtegidas(d)) throw erro('A cópia não pode ficar dentro da pasta do TINCTORIS (nem a pasta do TINCTORIS dentro da cópia).')
  return d
}

// ---------------------------------------------------------------------------
// Discos externos ligados (pela lista de volumes montados do Mac)

async function exportadoEm(pasta) {
  try {
    return JSON.parse(await fsp.readFile(path.join(pasta, MARCA), 'utf8')).exportado_em || 'sim'
  } catch {
    return null
  }
}

async function lerDiscos() {
  let dispositivoBiblioteca = null
  try {
    dispositivoBiblioteca = fs.statSync(PASTAS.raiz).dev
  } catch {}
  const out = []
  // (no Mac, os discos em /Volumes que aparecem no Finder; em Windows, as letras de unidade)
  for (const disco of await discosExternos()) {
    const { ponto, sistema } = disco
    if (real(ponto) === '/') continue
    try {
      // (o disco onde a biblioteca vive não serve de destino: a cópia seria no mesmo disco)
      if (fs.statSync(ponto).dev === dispositivoBiblioteca) continue
      const sf = await fsp.statfs(ponto)
      const destino = path.join(ponto, PASTA_NO_DISCO)
      out.push({ nome: disco.nome || path.basename(ponto) || ponto, ponto, destino, sistema, exfat: sistema === 'exfat', livre: sf.bavail * sf.bsize, total: sf.blocks * sf.bsize, copia: await exportadoEm(destino) })
    } catch {}
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
}

let discosCache = { quando: 0, discos: [] }
async function discos() {
  if (Date.now() - discosCache.quando > 4000) discosCache = { quando: Date.now(), discos: await lerDiscos() }
  return discosCache.discos
}

function ultimoDestino() {
  try {
    return JSON.parse(fs.readFileSync(FICHEIRO, 'utf8')).destino || ''
  } catch {
    return ''
  }
}
function lembrarDestino(destino) {
  try {
    fs.mkdirSync(path.dirname(FICHEIRO), { recursive: true })
    fs.writeFileSync(FICHEIRO, JSON.stringify({ destino }, null, 2))
  } catch (e) {
    log.aviso(m('Cópia de leitura: destino não guardado ({erro})', { erro: traduzivel(e) }))
  }
}

// ---------------------------------------------------------------------------
// O processo do exportador

function tratar(o) {
  if (o.tipo === 'progresso') trabalho.progresso = o
  else if (o.tipo === 'plano') trabalho.plano = { ...o, quando: Date.now() }
  else if (o.tipo === 'fim') {
    if (o.simulacao) trabalho.estado = 'simulado'
    else {
      trabalho.estado = 'feito'
      trabalho.resultado = o
    }
  } else if (o.tipo === 'erro') {
    // (mensagem_t: a mesma mensagem com a chave traduzível, quando o exportador a mandou)
    trabalho.erro = { mensagem: o.mensagem, mensagem_t: { msg: o.mensagem, ...(o.chave ? { chave: o.chave, ...(o.vars ? { vars: o.vars } : {}) } : {}) }, codigo: o.codigo || '' }
    trabalho.estado = o.codigo === 'interrompido' ? 'parado_pelo_utilizador' : 'erro'
  }
}

function lancar(destino, aplicar, confirmarApagar) {
  const args = ['--no-deprecation', SCRIPT, '--destino', destino, '--base', path.join(PASTAS.pbDados, 'data.db'), '--origem', PASTAS.biblioteca, '--json', '--vigiar-stdin']
  if (aplicar) {
    const pl = trabalho.plano
    args.push('--aplicar', '--max-apagar', String(pl.nApagar), '--max-apagar-outros', String(pl.nApagar - (pl.nApagarRenomeados || 0)))
    if (confirmarApagar != null) args.push('--confirmar-apagar', String(confirmarApagar))
  }
  // (em «Poupança» o processo corre nos núcleos económicos, como o resto do trabalho de fundo)
  const [bin, a] = comPrioridade(process.execPath, args)
  pedidoParar = false
  const f = spawn(bin, a, { cwd: path.dirname(SCRIPT), stdio: ['pipe', 'pipe', 'pipe'] })
  filho = f
  let resto = ''
  let erros = ''
  f.stdout.setEncoding('utf8')
  f.stdout.on('data', (d) => {
    resto += d
    const linhas = resto.split('\n')
    resto = linhas.pop()
    for (const l of linhas) {
      try {
        tratar(JSON.parse(l))
      } catch {}
    }
  })
  f.stderr.setEncoding('utf8')
  f.stderr.on('data', (d) => (erros = (erros + d).slice(-2000)))
  f.stdin.on('error', () => {})
  f.on('error', (e) => {
    const x = m('Não foi possível lançar o exportador: {erro}', { erro: traduzivel(e) })
    trabalho.erro = { mensagem: x.msg, mensagem_t: x, codigo: '' }
    trabalho.estado = 'erro'
  })
  f.on('close', (codigo, sinal) => {
    if (filho === f) filho = null
    if (resto.trim())
      try {
        tratar(JSON.parse(resto))
      } catch {}
    if (ocupado()) {
      // (acabou sem dizer «fim» nem «erro»: parado de fora ou rebentou)
      if (pedidoParar) trabalho.estado = 'parado_pelo_utilizador'
      else {
        trabalho.estado = 'erro'
        const x = m('O exportador terminou sem acabar ({causa}).{detalhe}', {
          causa: sinal || m('código {codigo}', { codigo }),
          detalhe: erros.trim() ? ' ' + erros.trim().split('\n').pop() : '',
        })
        trabalho.erro = { mensagem: x.msg, mensagem_t: x, codigo: '' }
      }
    }
    trabalho.fim = Date.now()
    if (trabalho.estado === 'feito') log.info(m('Cópia de leitura em {destino}: {copiados} copiados, {apagados} apagados, {n} erros ({segundos} s).', { destino, copiados: trabalho.resultado.copiados, apagados: trabalho.resultado.apagados, n: trabalho.resultado.nErros, segundos: trabalho.resultado.segundos }))
    else if (trabalho.estado === 'erro') log.erro(m('Cópia de leitura em {destino}: {erro}', { destino, erro: trabalho.erro?.mensagem_t || trabalho.erro?.mensagem }))
    else if (trabalho.estado === 'parado_pelo_utilizador') log.info(m('Cópia de leitura em {destino}: parada pelo utilizador.', { destino }))
  })
}

// ---------------------------------------------------------------------------
// Para o servidor

export async function estado() {
  return { ...trabalho, ultimoDestino: ultimoDestino(), discos: await discos(), agora: Date.now() }
}

export async function simular({ destino } = {}) {
  if (ocupado()) throw erro('Já há uma cópia de leitura a decorrer.')
  const d = validarDestino(destino)
  lembrarDestino(d)
  trabalho = { estado: 'a_simular', destino: d, progresso: { tipo: 'progresso', fase: 'planear', feitos: 0, total: 0 }, inicio: Date.now() }
  lancar(d, false)
  return estado()
}

export async function aplicar({ destino, confirmarApagar } = {}) {
  if (ocupado()) throw erro('Já há uma cópia de leitura a decorrer.')
  const d = validarDestino(destino)
  if (trabalho.estado !== 'simulado' || trabalho.destino !== d || !trabalho.plano) throw erro('Veja primeiro o que vai mudar nesta pasta («Ver o que vai mudar»).')
  const pl = trabalho.plano
  if (pl.amostraSobreCompleta) throw erro('Esta pasta tem uma cópia completa: uma amostra não a pode actualizar.')
  const confirmado = confirmarApagar != null && String(confirmarApagar).trim() !== '' ? Number(confirmarApagar) : null
  if (pl.precisaConfirmacaoForte && confirmado !== pl.nApagar)
    throw erro('Esta actualização apaga {n} ficheiros do disco: para confirmar, escreva o número {numero}. Nada foi alterado.', { n: pl.nApagar.toLocaleString('pt-PT'), numero: pl.nApagar })
  trabalho = { estado: 'a_copiar', destino: d, plano: pl, progresso: { tipo: 'progresso', fase: 'planear', feitos: 0, total: 0 }, inicio: Date.now() }
  log.info(m('Cópia de leitura: a actualizar {destino}…', { destino: d }))
  lancar(d, true, pl.precisaConfirmacaoForte ? confirmado : null)
  return estado()
}

export async function parar() {
  const f = filho
  if (!f || !ocupado()) return estado()
  pedidoParar = true
  trabalho.a_parar = true
  f.kill('SIGTERM')
  // (acaba o ficheiro em curso; se demorar demais, corta-se: a cópia retoma na mesma)
  setTimeout(() => filho === f && f.kill('SIGKILL'), 30000).unref()
  return estado()
}
