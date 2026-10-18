// Registo de atividade (consola + memória, para mostrar na interface).
// Cada evento: { quando, nivel, msg } e, quando a mensagem vem de m(…) (mensagens.js), também { chave, vars },
// para a interface a mostrar no idioma escolhido. A consola mostra sempre o português.
import { textoDe } from './mensagens.js'

const MAX = 300
const eventos = []

function juntar(nivel, x) {
  const e = { quando: new Date().toISOString(), nivel, msg: textoDe(x) }
  if (x && typeof x === 'object' && x.chave) {
    e.chave = x.chave
    if (x.vars) e.vars = x.vars
  }
  eventos.push(e)
  if (eventos.length > MAX) eventos.shift()
  const hora = e.quando.slice(11, 19)
  ;(nivel === 'erro' ? console.error : console.log)(`[${hora}] ${nivel.toUpperCase()} ${e.msg}`)
}

export const log = {
  info: (m) => juntar('info', m),
  aviso: (m) => juntar('aviso', m),
  erro: (m) => juntar('erro', m),
}

export const recentes = () => eventos.slice().reverse()
