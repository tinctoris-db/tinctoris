// Ligação à base de dados PocketBase.
import PocketBase from 'pocketbase'
import { PB_URL, credenciais, definirDono } from './config.js'

export const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

export async function entrar() {
  const { email, password } = credenciais()
  await pb.collection('_superusers').authWithPassword(email, password)
}

export async function garantirSessao() {
  if (!pb.authStore.isValid) await entrar()
}

// Espera até o PocketBase estar a responder (útil no arranque).
export async function esperarPocketBase(tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await pb.health.check()
      await entrar()
      return
    } catch (_) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error(`Não consegui ligar ao PocketBase em ${PB_URL}`)
}

export async function definicoes() {
  await garantirSessao()
  const lista = await pb.collection('definicoes').getFullList()
  const defs = Object.fromEntries(lista.map((r) => [r.chave, r.valor]))
  definirDono(defs.nome_dono)
  return defs
}

let cacheTipos = null
let cacheQuando = 0
export async function tipos() {
  if (!cacheTipos || Date.now() - cacheQuando > 30000) {
    await garantirSessao()
    cacheTipos = await pb.collection('tipos_fonte').getFullList({ sort: 'ordem,nome' })
    cacheQuando = Date.now()
  }
  return cacheTipos
}

export async function tipoPorNome(nome) {
  return (await tipos()).find((t) => t.nome === nome)
}

export async function tipoPorId(id) {
  return (await tipos()).find((t) => t.id === id)
}

// Guarda (cria ou substitui) o texto integral de uma fonte.
const TEXTO_MAXIMO = 8_000_000 // caracteres (um livro grande tem ~1–2 milhões)

export async function guardarTexto(fonteId, conteudo, metodo) {
  await garantirSessao()
  conteudo = String(conteudo || '').replace(/\u0000/g, '').slice(0, TEXTO_MAXIMO)
  let existente = null
  try {
    existente = await pb.collection('textos').getFirstListItem(pb.filter('fonte = {:f}', { f: fonteId }))
  } catch (_) {}
  if (existente) return pb.collection('textos').update(existente.id, { conteudo, metodo })
  return pb.collection('textos').create({ fonte: fonteId, conteudo, metodo })
}

// Obtém muitas fontes por id (em blocos, para filtros não ficarem enormes).
export async function fontesPorIds(ids) {
  await garantirSessao()
  const out = []
  for (let i = 0; i < ids.length; i += 80) {
    const bloco = ids.slice(i, i + 80)
    const filtro = bloco.map((_, j) => `id = {:i${j}}`).join(' || ')
    const params = Object.fromEntries(bloco.map((id, j) => [`i${j}`, id]))
    out.push(...(await pb.collection('fontes').getFullList({ filter: pb.filter(filtro, params), expand: 'tipo' })))
  }
  const ordem = new Map(ids.map((id, i) => [id, i]))
  return out.sort((a, b) => ordem.get(a.id) - ordem.get(b.id))
}

// Cópia de segurança da base de dados (fica em app/pb_data/backups), antes de operações grandes
export async function copiaDeSeguranca(motivo) {
  await garantirSessao()
  const d = new Date()
  const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  const nome = `${motivo}-${carimbo}.zip`.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
  await pb.backups.create(nome)
  return nome
}
