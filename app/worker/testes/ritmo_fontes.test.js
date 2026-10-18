// Testes sem internet do ritmo e das pausas das fontes externas (17/10/2026): Google Books recusava pedidos («429»)
// e cada ficha durante a pausa deixava um aviso vermelho na Actividade.
// Correr: cd app/worker && node --test testes/*.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obterJson, anotarErro, servicoDe } from '../src/fontes_externas/util.js'

const resposta = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'retry-after': '1' } })
function simular(fn) {
  const pedidos = []
  globalThis.fetch = async (url) => (pedidos.push(String(url)), fn(String(url)))
  return pedidos
}

test('Google Books e YouTube são serviços diferentes no mesmo servidor', () => {
  assert.equal(servicoDe('https://www.googleapis.com/books/v1/volumes?q=x'), 'www.googleapis.com/books')
  assert.equal(servicoDe('https://www.googleapis.com/youtube/v3/search?q=x'), 'www.googleapis.com/youtube')
  assert.equal(servicoDe('https://api.crossref.org/works'), 'api.crossref.org')
})

test('Recusa repetida: pausa sem avisos repetidos, pausa mais longa se voltar a recusar, YouTube continua', async () => {
  const livros = 'https://www.googleapis.com/books/v1/volumes?q=teste'
  let pedidos = simular(() => resposta(429))
  const e1 = await obterJson(livros).catch((e) => e)
  assert.equal(e1.emPausa, true)
  assert.match(e1.message, /^Google Books em pausa até \d\d:\d\d/)
  assert.equal(pedidos.length, 2)
  // durante a pausa: nenhum pedido e nenhum aviso
  const e2 = await obterJson(livros).catch((e) => e)
  assert.equal(e2.emPausa, true)
  assert.equal(pedidos.length, 2)
  const erros = []
  anotarErro(erros, 'googlebooks', e2)
  anotarErro(erros, 'crossref', new Error('HTTP 500 em api.crossref.org'))
  assert.deepEqual(erros, ['crossref: HTTP 500 em api.crossref.org'])
  // o YouTube (mesmo servidor, outra quota) não fica em pausa
  pedidos = simular(() => resposta(200, { items: [] }))
  assert.deepEqual(await obterJson('https://www.googleapis.com/youtube/v3/search?q=x'), { items: [] })
  // passados 10 minutos volta a recusar: a pausa seguinte é de 1 hora
  const agora = Date.now
  try {
    Date.now = () => agora() + 11 * 60 * 1000
    simular(() => resposta(429))
    const e3 = await obterJson(livros).catch((e) => e)
    assert.equal(e3.emPausa, true)
    Date.now = () => agora() + 11 * 60 * 1000 + 59 * 60 * 1000
    pedidos = simular(() => resposta(200, {}))
    assert.equal((await obterJson(livros).catch((e) => e)).emPausa, true)
    assert.equal(pedidos.length, 0)
    // depois da hora responde bem: volta ao início
    Date.now = () => agora() + 11 * 60 * 1000 + 61 * 60 * 1000
    assert.deepEqual(await obterJson(livros), {})
  } finally {
    Date.now = agora
  }
})

test('Semantic Scholar: no máximo um pedido por segundo', async () => {
  const quando = []
  simular(() => (quando.push(Date.now()), resposta(200, { data: [] })))
  for (let i = 0; i < 3; i++) await obterJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${i}`)
  assert.ok(quando[1] - quando[0] >= 1000 && quando[2] - quando[1] >= 1000, JSON.stringify(quando))
})
