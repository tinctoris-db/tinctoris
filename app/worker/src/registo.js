// Registo de atividade (consola + memória, para mostrar na interface).
const MAX = 300
const eventos = []

function juntar(nivel, msg) {
  const e = { quando: new Date().toISOString(), nivel, msg }
  eventos.push(e)
  if (eventos.length > MAX) eventos.shift()
  const hora = e.quando.slice(11, 19)
  ;(nivel === 'erro' ? console.error : console.log)(`[${hora}] ${nivel.toUpperCase()} ${msg}`)
}

export const log = {
  info: (m) => juntar('info', m),
  aviso: (m) => juntar('aviso', m),
  erro: (m) => juntar('erro', m),
}

export const recentes = () => eventos.slice().reverse()
