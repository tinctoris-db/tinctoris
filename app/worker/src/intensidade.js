// Intensidade do trabalho de fundo (pedido do Pedro, 1/10/2026: poupar a bateria do portátil).
//   automatico: ligado ao carregador = máxima; a bateria = poupança
//   maxima:     tudo à velocidade normal (e o Mac não adormece enquanto houver trabalho)
//   poupanca:   OCR parado; uma pausa entre as reanálises; programas em prioridade baixa
//               (no Mac com Apple Silicon correm nos núcleos económicos); a IA lê só a 1.ª página
//   pausa:      nada é processado; as filas ficam guardadas e retomam quando se muda de nível
// A escolha fica em app/dados/intensidade.json (a cópia de teste usa outra pasta).
import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { PASTAS } from './config.js'
import { log } from './registo.js'

export const NIVEIS = ['automatico', 'maxima', 'poupanca', 'pausa']
export const PAUSA_ENTRE_REANALISES = 30000 // ms, em poupança
const FICHEIRO = path.join(PASTAS.dados, 'intensidade.json')

let escolhido = 'automatico'
try {
  const n = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8')).nivel
  if (NIVEIS.includes(n)) escolhido = n
} catch (_) {}

// Fonte de energia, vista a cada minuto (pmset): sem bateria (Mac de secretária) conta como carregador
let energia = { carregador: true, bateria: null }
function lerEnergia() {
  return new Promise((ok) =>
    execFile('/usr/bin/pmset', ['-g', 'batt'], { timeout: 10000 }, (err, out) => {
      if (!err) {
        const pct = /(\d+)%/.exec(out)
        energia = { carregador: !/Battery Power/.test(out), bateria: pct ? Number(pct[1]) : null }
      }
      ok(energia)
    })
  )
}

export const nivelEscolhido = () => escolhido
export function nivelEfetivo() {
  if (escolhido !== 'automatico') return escolhido
  return energia.carregador ? 'maxima' : 'poupanca'
}
export const emPoupanca = () => nivelEfetivo() === 'poupanca'
export const emPausa = () => nivelEfetivo() === 'pausa'

export function estadoIntensidade() {
  return { nivel: escolhido, efetivo: nivelEfetivo(), carregador: energia.carregador, bateria: energia.bateria }
}

export async function mudarNivel(nivel) {
  if (!NIVEIS.includes(nivel)) throw new Error(`Nível desconhecido: ${nivel}`)
  escolhido = nivel
  fs.mkdirSync(path.dirname(FICHEIRO), { recursive: true })
  fs.writeFileSync(FICHEIRO, JSON.stringify({ nivel }, null, 2))
  await aplicar()
  return estadoIntensidade()
}

// Espera enquanto o nível for «pausa» (as filas ficam paradas, sem gastar nada)
export async function esperarVez() {
  while (emPausa()) await new Promise((r) => setTimeout(r, 3000))
}
// Pausa curta entre reanálises em poupança (interrompida se se mudar de nível)
// (acaba logo se chegar um ficheiro novo: novoChegou())
export async function folgaEntreReanalises(novoChegou = () => false) {
  const fim = Date.now() + PAUSA_ENTRE_REANALISES
  while (emPoupanca() && Date.now() < fim && !novoChegou()) await new Promise((r) => setTimeout(r, 2000))
}

// Programas externos (pdftoppm, tesseract, sips…) em prioridade baixa quando em poupança
export function comPrioridade(bin, args) {
  return emPoupanca() ? ['/usr/sbin/taskpolicy', ['-b', bin, ...args]] : [bin, args]
}

// O próprio serviço em prioridade baixa (ou normal) e, só em «máxima», o Mac sem adormecer enquanto o
// serviço corre (fora disso, a bateria o Mac adormece normalmente quando não está a ser usado)
let aplicado = null
let acordado = null
async function aplicar() {
  const efetivo = nivelEfetivo()
  if (efetivo === aplicado) return
  const antes = aplicado
  aplicado = efetivo
  const baixa = efetivo !== 'maxima'
  await new Promise((ok) => execFile('/usr/sbin/taskpolicy', [baixa ? '-b' : '-B', '-p', String(process.pid)], () => ok()))
  if (efetivo === 'maxima' && !acordado) {
    acordado = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' })
    acordado.on('exit', () => (acordado = null))
  } else if (efetivo !== 'maxima' && acordado) {
    acordado.kill()
    acordado = null
  }
  if (antes !== null) log.info(`Intensidade: ${ROTULO[efetivo]}${escolhido === 'automatico' ? ` (automático: ${energia.carregador ? 'ligado ao carregador' : 'a bateria'})` : ''}`)
}
const ROTULO = { maxima: 'máxima', poupanca: 'poupança', pausa: 'pausa' }

export async function iniciarIntensidade() {
  await lerEnergia()
  await aplicar()
  log.info(`Intensidade: ${ROTULO[nivelEfetivo()]}${escolhido === 'automatico' ? ` (automático: ${energia.carregador ? 'ligado ao carregador' : 'a bateria'})` : ''}`)
  setInterval(async () => {
    await lerEnergia()
    await aplicar()
  }, 60000).unref()
}
