// Intensidade do trabalho de fundo (pedido do Pedro, 1/10/2026: poupar a bateria do portátil).
//   automatico: ligado ao carregador = máxima; a bateria = poupança
//   maxima:     tudo à velocidade normal (e o Mac não adormece enquanto houver trabalho)
//   poupanca:   OCR parado; uma pausa entre as reanálises; programas em prioridade baixa
//               (no Mac com Apple Silicon correm nos núcleos económicos); a IA lê só a 1.ª página
//   pausa:      nada é processado; as filas ficam guardadas e retomam quando se muda de nível
// A escolha fica em app/dados/intensidade.json (a cópia de teste usa outra pasta).
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS } from './config.js'
import { lerEnergia as energiaDoSistema, comandoEmPoupanca, prioridadeDoServico, manterAcordado } from './plataforma.js'
import { log } from './registo.js'
import { m, erro } from './mensagens.js'

export const NIVEIS = ['automatico', 'maxima', 'poupanca', 'pausa']
export const PAUSA_ENTRE_REANALISES = 30000 // ms, em poupança
const FICHEIRO = path.join(PASTAS.dados, 'intensidade.json')

let escolhido = 'automatico'
try {
  const n = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8')).nivel
  if (NIVEIS.includes(n)) escolhido = n
} catch (_) {}

// Fonte de energia, vista a cada minuto (Mac: pmset; Windows: Win32_Battery): sem bateria (computador de secretária)
// conta como carregador
let energia = { carregador: true, bateria: null }
async function lerEnergia() {
  const lida = await energiaDoSistema()
  if (lida) energia = lida
  return energia
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
  if (!NIVEIS.includes(nivel)) throw erro('Nível desconhecido: {nivel}', { nivel })
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
  return emPoupanca() ? comandoEmPoupanca(bin, args) : [bin, args]
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
  await prioridadeDoServico(baixa)
  if (efetivo === 'maxima' && !acordado) {
    acordado = manterAcordado(process.pid)
    acordado?.on('exit', () => (acordado = null))
  } else if (efetivo !== 'maxima' && acordado) {
    acordado.kill()
    acordado = null
  }
  if (antes !== null) log.info(mensagemIntensidade(efetivo))
}
// (o nível e a fonte de energia vão como mensagens dentro da mensagem, para a interface os traduzir também)
const ROTULO = { maxima: m('máxima'), poupanca: m('poupança'), pausa: m('pausa') }
function mensagemIntensidade(nivel) {
  const nome = ROTULO[nivel]
  if (escolhido !== 'automatico') return m('Intensidade: {nivel}', { nivel: nome })
  const energiaMsg = energia.carregador ? m('ligado ao carregador') : m('a bateria')
  return m('Intensidade: {nivel} (automático: {energia})', { nivel: nome, energia: energiaMsg })
}

export async function iniciarIntensidade() {
  await lerEnergia()
  await aplicar()
  log.info(mensagemIntensidade(nivelEfetivo()))
  setInterval(async () => {
    await lerEnergia()
    await aplicar()
  }, 60000).unref()
}
