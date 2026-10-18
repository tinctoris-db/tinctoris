// Mensagens do serviço para a interface em vários idiomas (11/10/2026): o texto português continua a ir pronto
// (msg / erro, para o terminal e versões antigas) e a chave + vars deixam a interface traduzir com tr().
// Correr: cd app/worker && node --test testes/*.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { m, erro, traduzivel, corpoErro, textoDe, preencher } from '../src/mensagens.js'
import { log, recentes } from '../src/registo.js'
import { chavesDoServico, chavesDosHooks, chavesNaoFixas, problemas, marcadores, EN } from './chaves_mensagens.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const EN_JSON = JSON.parse(fs.readFileSync(EN, 'utf8'))

// A função trMsg da interface (app/pb_public/app.js), com um tr() de teste que usa o en.json
function trMsgDaInterface(traducoes) {
  const app = fs.readFileSync(path.join(AQUI, '..', '..', 'pb_public', 'app.js'), 'utf8')
  const fonte = (nome) => {
    const i = app.indexOf(`function ${nome}(`)
    assert.ok(i >= 0, `${nome} não encontrada em app.js`)
    return app.slice(i, app.indexOf('\n}\n', i) + 2)
  }
  const tr = (texto, vars) => {
    let s = String(texto)
    if (traducoes[s]) s = traducoes[s]
    if (vars) s = s.replace(/\{(\w+)\}/g, (t, k) => (k in vars ? String(vars[k]) : t))
    return s
  }
  return new Function('tr', `${fonte('trMsg')}\n${fonte('trCampo')}\nreturn { trMsg, trCampo }`)(tr)
}

test('m(): texto português pronto, chave e valores', () => {
  const x = m('Cópia de segurança criada: {copia}', { copia: 'antes-importacao-1.zip' })
  assert.deepEqual(x, { msg: 'Cópia de segurança criada: antes-importacao-1.zip', chave: 'Cópia de segurança criada: {copia}', vars: { copia: 'antes-importacao-1.zip' } })
  // sem valores: sem vars
  assert.deepEqual(m('Acção desconhecida.'), { msg: 'Acção desconhecida.', chave: 'Acção desconhecida.' })
  // números ficam números; null/undefined ficam vazios; marcador sem valor fica como está
  assert.deepEqual(m('{n} fontes{x}', { n: 3, x: undefined }).vars, { n: 3, x: '' })
  assert.equal(preencher('{a} e {b}', { a: 1 }), '1 e {b}')
})

test('m(): uma mensagem dentro de outra (o erro de dentro também se traduz)', () => {
  const dentro = erro('Fonte {n} não encontrada.', { n: '#0012' })
  const x = m('Reanálise: {erro}', { erro: traduzivel(dentro) })
  assert.equal(x.msg, 'Reanálise: Fonte #0012 não encontrada.')
  assert.deepEqual(x.vars.erro, { msg: 'Fonte #0012 não encontrada.', chave: 'Fonte {n} não encontrada.', vars: { n: '#0012' } })
  // erro de fora do programa (sistema, catálogos): fica o texto, sem chave
  assert.equal(traduzivel(new Error('ENOENT: no such file')), 'ENOENT: no such file')
  assert.equal(m('Reanálise: {erro}', { erro: traduzivel(new Error('x')) }).vars.erro, 'x')
  // uma m(…) directamente como valor também serve
  assert.equal(m('A{resto}', { resto: m('; {n} saltadas', { n: 2 }) }).msg, 'A; 2 saltadas')
})

test('erro(): Error normal em português, com chave, vars e propriedades extra', () => {
  const e = erro('Esta actualização apaga {n} ficheiros.', { n: 12 }, { codigo: 'confirmar-apagar' })
  assert.ok(e instanceof Error)
  assert.equal(e.message, 'Esta actualização apaga 12 ficheiros.')
  assert.equal(e.chave, 'Esta actualização apaga {n} ficheiros.')
  assert.deepEqual(e.vars, { n: 12 })
  assert.equal(e.codigo, 'confirmar-apagar')
  assert.equal(erro('Acesso negado.').vars, undefined)
})

test('corpoErro(): { erro } como antes; { erro_chave, vars } só quando há chave', () => {
  assert.deepEqual(corpoErro(erro('Nenhuma fonte seleccionada.')), { erro: 'Nenhuma fonte seleccionada.', erro_chave: 'Nenhuma fonte seleccionada.' })
  assert.deepEqual(corpoErro(erro('Fonte {n} não encontrada.', { n: 5 })), { erro: 'Fonte 5 não encontrada.', erro_chave: 'Fonte {n} não encontrada.', vars: { n: 5 } })
  // erro sem chave (biblioteca, sistema): só o texto, como nas versões antigas
  assert.deepEqual(corpoErro(new Error('socket hang up')), { erro: 'socket hang up' })
  assert.equal(textoDe(null), '')
})

test('Registo da página Actividade: texto simples (sem chave) e mensagens com chave', () => {
  const consola = console.log
  console.log = () => {}
  try {
    log.info('Texto antigo, sem chave')
    log.aviso(m('Duplicado de «{titulo}»: movido para {destino}', { titulo: 'Missa', destino: '_duplicados/x.pdf' }))
  } finally {
    console.log = consola
  }
  const [com, sem] = recentes()
  assert.deepEqual(Object.keys(sem).sort(), ['msg', 'nivel', 'quando'])
  assert.equal(sem.msg, 'Texto antigo, sem chave')
  assert.equal(com.nivel, 'aviso')
  assert.equal(com.msg, 'Duplicado de «Missa»: movido para _duplicados/x.pdf')
  assert.equal(com.chave, 'Duplicado de «{titulo}»: movido para {destino}')
  assert.deepEqual(com.vars, { titulo: 'Missa', destino: '_duplicados/x.pdf' })
})

test('Interface (trMsg/trCampo): traduz pela chave; sem chave mostra o msg', () => {
  const { trMsg, trCampo } = trMsgDaInterface({ 'Reanálise: {erro}': 'Reanalysis: {erro}', 'Fonte {n} não encontrada.': 'Source {n} not found.', 'A comparar': 'Comparing' })
  const dentro = erro('Fonte {n} não encontrada.', { n: '#0012' })
  assert.equal(trMsg(m('Reanálise: {erro}', { erro: traduzivel(dentro) })), 'Reanalysis: Source #0012 not found.')
  assert.equal(trMsg({ msg: 'Evento de uma versão antiga' }), 'Evento de uma versão antiga')
  assert.equal(trMsg('texto solto'), 'texto solto')
  assert.equal(trMsg(null), '')
  // chave sem tradução: o português, com os valores
  assert.equal(trMsg(m('Sem tradução {n}', { n: 2 })), 'Sem tradução 2')
  assert.equal(trCampo({ fase: 'A comparar', fase_t: m('A comparar') }, 'fase'), 'Comparing')
  assert.equal(trCampo({ fase: 'A comparar' }, 'fase'), 'A comparar')
  assert.deepEqual(trCampo({ avisos: ['a'], avisos_t: [m('A comparar')] }, 'avisos'), ['Comparing'])
  assert.equal(trCampo(undefined, 'mensagem'), undefined)
})

test('Todas as chaves do serviço e dos hooks estão no en.json, com os mesmos {marcadores}', () => {
  const chaves = [...chavesDoServico(), ...chavesDosHooks()]
  assert.ok(chaves.length > 50, `só ${chaves.length} chaves encontradas`)
  const { faltam, marcas } = problemas(EN_JSON, chaves)
  assert.deepEqual(faltam.map((c) => `${c.ficheiro}:${c.linha} ${c.chave}`), [])
  assert.deepEqual(marcas.map((c) => `${c.ficheiro}:${c.linha} ${c.chave} → ${c.traducao}`), [])
})

test('As chaves são textos fixos (m(`…`) ou m(variável) não se conseguem traduzir)', () => {
  assert.deepEqual(chavesNaoFixas(), [])
})

test('A verificação apanha chaves em falta e marcadores trocados', () => {
  const chaves = [{ chave: 'A {n}', ficheiro: 'x', linha: 1 }, { chave: 'B {t}', ficheiro: 'x', linha: 2 }]
  const r = problemas({ 'B {t}': 'B {titulo}' }, chaves)
  assert.deepEqual(r.faltam.map((c) => c.chave), ['A {n}'])
  assert.deepEqual(r.marcas.map((c) => c.chave), ['B {t}'])
  assert.deepEqual(marcadores('{b} {a} {b}'), ['{a}', '{b}'])
})
