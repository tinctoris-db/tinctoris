// Discos fotografados: o que acontece às fotografias e às fichas (10/10/2026). Tudo numa pasta temporária: a watch
// folder, a biblioteca, nao_processados e o «Lixo» de teste (LIXO_DIR); a base de dados é simulada.
// Correr: cd app/worker && node --test testes/*.js
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'discos-ficheiros-'))
const W = path.join(TMP, 'watch_folder')
const B = path.join(TMP, 'biblioteca')
const N = path.join(TMP, 'nao_processados')
const L = path.join(TMP, 'Lixo')
for (const d of [W, B, N, L]) fs.mkdirSync(d, { recursive: true })
// (antes de carregar os módulos: config.js lê as pastas do ambiente)
Object.assign(process.env, { WATCH_DIR: W, BIBLIOTECA_DIR: B, NAO_PROCESSADOS_DIR: N, LIXO_DIR: L, DADOS_DIR: path.join(TMP, 'dados') })
const F = await import('../src/ficheiros.js')
const { resumo } = await import('../src/referencias.js')
const { tratarDisco, tratarGrupos } = await import('../src/referencias_discos.js')
after(() => fs.rmSync(TMP, { recursive: true, force: true }))

const DISCOS = path.join(W, 'Discos')
let n = 0
function foto(rel = `Discos/foto ${++n}.jpg`) {
  const f = path.join(W, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, `fotografia ${rel}`)
  return f
}
const listar = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).sort() : [])

// A base de dados simulada: regista o que se pede (aoCriar: ver onde estão as fotografias no momento de gravar)
function base({ falhaCriar = false, falhaLer = false, fresca = null, aoCriar = () => {} } = {}) {
  const b = { criadas: [], actualizadas: [] }
  b.tipoDisco = async () => ({ id: 'tipo-disco' })
  b.criar = async (dados) => {
    aoCriar(dados)
    if (falhaCriar) throw new Error('PocketBase: 500 ao criar')
    b.criadas.push(dados)
    return { id: 'nova1', numero: 9001, ...dados }
  }
  b.ler = async (id) => {
    if (falhaLer) throw new Error('PocketBase: 404')
    return fresca || { id }
  }
  b.actualizar = async (id, dados) => b.actualizadas.push([id, dados])
  return b
}
const porRever = (ficheiro) => ({ fotografias: [resumo(ficheiro, [], [{ texto: 'Théoria' }])], raiz: DISCOS, nome: '', ean: '', registo: null, capa: { titulo: 'Théoria', interpretes: [], compositores: [] }, incertos: [], iaUsada: true })
const completo = (ficheiro) => ({
  fotografias: [resumo(ficheiro, ['5603559012125'], [])],
  raiz: DISCOS,
  ean: '5603559012125',
  registo: { fonte: 'Apple Music', titulo: 'Theoria Poiesis Praxis', autores: [{ literal: 'Ensemble de Aveiro', papel: 'intérprete' }], data: '2010', editora: 'Numérica', url: 'https://x/1', palavras_chave: [], metadados: { codigo_barras: '5603559012125', publicado: true } },
  viaTexto: false,
  incertos: [],
})

test('A pasta watch_folder/Discos nunca se apaga, mesmo vazia (as subpastas sim)', async () => {
  const f = foto('Discos/O Alaúde/capa.jpg')
  fs.unlinkSync(f)
  await F.limparPastasVazias(path.dirname(f), W)
  assert.ok(!fs.existsSync(path.join(DISCOS, 'O Alaúde')))
  assert.ok(fs.existsSync(DISCOS))
  // (também a partir da própria pasta, com a raiz da watch folder como limite; e com outro nome de maiúsculas)
  await F.limparPastasVazias(DISCOS, W)
  assert.ok(fs.existsSync(DISCOS))
  fs.mkdirSync(path.join(TMP, 'w2', 'discos'), { recursive: true })
  await F.limparPastasVazias(path.join(TMP, 'w2', 'discos'), path.join(TMP, 'w2'), { watch: path.join(TMP, 'w2') })
  assert.ok(fs.existsSync(path.join(TMP, 'w2', 'discos')))
  // (fora da raiz da watch folder, uma pasta «Discos» vazia apaga-se como as outras)
  fs.mkdirSync(path.join(W, 'Livros', 'Discos'), { recursive: true })
  await F.limparPastasVazias(path.join(W, 'Livros', 'Discos'), W)
  assert.ok(!fs.existsSync(path.join(W, 'Livros')))
})

test('Por rever: as fotografias vão para _originais ANTES de gravar a ficha; se a ficha falhar, voltam ao sítio', async () => {
  const f = foto()
  let noMomento = null
  const ok = base({ aoCriar: (d) => (noMomento = { naWatch: fs.existsSync(f), nosOriginais: fs.existsSync(path.join(B, d.metadados.originais, path.basename(f))) }) })
  const r = await tratarDisco(porRever(f), ok)
  assert.deepEqual(noMomento, { naWatch: false, nosOriginais: true })
  assert.equal(r.acao, 'nova')
  assert.equal(r.estado, 'a_rever')
  const originais = ok.criadas[0].metadados.originais
  assert.match(originais, /^_originais\/Disco Théoria$/)
  assert.ok(fs.existsSync(path.join(B, originais, path.basename(f))))
  assert.ok(!fs.existsSync(f))
  assert.ok(fs.existsSync(DISCOS))

  const g = foto()
  const falha = base({ falhaCriar: true })
  await assert.rejects(tratarDisco(porRever(g), falha), /500 ao criar/)
  assert.ok(fs.existsSync(g), 'a fotografia voltou à watch folder')
  assert.ok(!fs.existsSync(path.join(B, '_originais', 'Disco Théoria_2')), 'sem pasta de originais vazia')
})

test('Completa: primeiro a ficha, depois o Lixo; se a ficha falhar, a fotografia fica', async () => {
  const f = foto()
  let naWatch = null
  const r = await tratarDisco(completo(f), base({ aoCriar: () => (naWatch = fs.existsSync(f)) }))
  assert.equal(naWatch, true)
  assert.equal(r.estado, 'completo')
  assert.ok(!fs.existsSync(f))
  assert.ok(listar(L).some((x) => x.endsWith(path.basename(f))))

  const g = foto()
  await assert.rejects(tratarDisco(completo(g), base({ falhaCriar: true })), /500 ao criar/)
  assert.ok(fs.existsSync(g))
})

test('Ficha já existente: completa-se a ficha tal como está agora na base (nunca «Onde está o exemplar físico»)', async () => {
  const f = foto()
  // (o que se leu antes: sem etiquetas, sem nº de catálogo; entretanto o utilizador escreveu onde está o disco e uma etiqueta)
  const antiga = { id: 'e1', numero: 12, titulo: 'Theoria', tags: [], autores: [], data: '', editora: '', url: '', metadados: { exemplar_papel: '' } }
  const fresca = { ...antiga, tags: ['Ouvir'], editora: 'Numérica (à mão)', metadados: { exemplar_papel: 'Estante 3', nota: 'minha' } }
  const b = base({ fresca })
  const r = await tratarDisco({ ...completo(f), existente: antiga }, b)
  assert.equal(r.acao, 'existente')
  assert.equal(b.actualizadas.length, 1)
  const [qual, junta] = b.actualizadas[0]
  assert.equal(qual, 'e1')
  assert.deepEqual(junta.tags, ['Ouvir', 'Exemplar físico'])
  assert.equal(junta.editora, undefined) // (o utilizador já a escreveu)
  assert.equal(junta.metadados.exemplar_papel, 'Estante 3')
  assert.equal(junta.metadados.nota, 'minha')
  assert.equal(junta.metadados.codigo_barras, '5603559012125')
  assert.ok(!fs.existsSync(f)) // (no Lixo)

  // Não se consegue ler a ficha: erro (a fotografia fica, e tratarGrupos põe-na em nao_processados)
  const g = foto()
  await assert.rejects(tratarDisco({ ...completo(g), existente: antiga }, base({ falhaLer: true })), /404/)
  assert.ok(fs.existsSync(g))
})

test('Ficha existente encontrada só pelo título, sem confirmação: as fotografias ficam ligadas a ela, nada no Lixo', async () => {
  const f = foto()
  const existente = { id: 'e2', numero: 13, titulo: 'A Garden of Black Flowers', tags: [], autores: [], data: '', editora: '', url: 'https://x/2', metadados: { originais: '_originais/antigas' } }
  const b = base({ fresca: existente })
  const id = {
    fotografias: [resumo(f, [], [{ texto: 'a garden of black flowers' }])],
    raiz: DISCOS,
    ean: '',
    registo: { fonte: 'Deezer', titulo: 'A Garden of Black Flowers', autores: [{ literal: 'astrophil & stella', papel: 'intérprete' }], data: '2025', editora: 'Albus', url: 'https://x/2', palavras_chave: [], metadados: {} },
    viaTexto: true,
    capa: { titulo: 'A Garden of Black Flowers', interpretes: [], compositores: [] },
    incertos: [],
    existente,
  }
  const r = await tratarDisco(id, b)
  assert.equal(r.fraco, true)
  const [, junta] = b.actualizadas[0]
  assert.deepEqual(Object.keys(junta).sort(), ['metadados', 'tags'])
  const pasta = junta.metadados.originais.split(' | ')
  assert.equal(pasta[0], '_originais/antigas')
  assert.ok(fs.existsSync(path.join(B, pasta[1], path.basename(f))))
  assert.match(junta.metadados.nota_revisao, /só pelo título e intérprete \(Deezer\): confirmar/)
  assert.equal(listar(L).filter((x) => x.endsWith(path.basename(f))).length, 0)
})

test('Um erro num disco não pára os outros; as fotografias desse disco vão para nao_processados', async () => {
  const f1 = foto()
  const f2 = foto()
  const f3 = foto()
  const consultas = {
    porCodigo: async () => null,
    porTexto: async () => null,
    iaDisponivel: async () => false,
    lerCapa: async () => ({}),
    existente: async ({ ean }) => {
      if (ean === '5603559012125') throw new Error('PocketBase: 400')
      return null
    },
  }
  const tratados = []
  const grupos = [
    { fotografias: [resumo(f1, ['5603559012125'], [])], raiz: DISCOS },
    { fotografias: [resumo(f2, ['5425004841285'], [])], raiz: DISCOS },
    { fotografias: [resumo(f3, ['5600384985082'], [])], raiz: DISCOS },
  ]
  const tratar = async (id) => {
    if (id.ean === '5600384985082') throw new Error('inesperado')
    tratados.push(id.ean)
    return { acao: 'por_identificar' }
  }
  await tratarGrupos(grupos, {}, { consultas, tratar, raiz: DISCOS })
  assert.deepEqual(tratados, ['5425004841285'])
  const pi = path.join(N, 'referencias_por_identificar')
  assert.ok(fs.existsSync(path.join(pi, path.basename(f1))), 'erro ao procurar a ficha')
  assert.ok(fs.existsSync(path.join(pi, path.basename(f3))), 'erro ao tratar')
  assert.ok(fs.existsSync(f2)) // (o tratar simulado não mexeu nela)
  assert.ok(fs.existsSync(DISCOS))
})

// As migrações correm no PocketBase; aqui com um «app» simulado
function correrMigracao(nome, tipos) {
  const codigo = fs.readFileSync(fileURLToPath(new URL(`../../pb_migrations/${nome}`, import.meta.url)), 'utf8')
  const gravados = []
  const registo = (t) => ({
    nome: t.nome,
    campos: t.campos,
    getString: (k) => (k === 'campos' ? t.campos : ''),
    set: (k, v) => {
      t.novo = v
      t.campos = JSON.stringify(v)
    },
  })
  const app = {
    findFirstRecordByData: (_c, _k, nome) => {
      const t = tipos.find((x) => x.nome === nome)
      if (!t) throw new Error('não há')
      return registo(t)
    },
    findAllRecords: () => tipos.map(registo),
    save: (r) => gravados.push(r.nome),
  }
  vm.runInNewContext(codigo, { migrate: (up) => up(app) })
  return gravados
}

test('Migrações 1790000053 e 1790000054: campos ilegíveis não são substituídos', () => {
  const ilegivel = () => [{ nome: 'Disco', campos: '{não é JSON' }, { nome: 'Livro', campos: '[{"chave":"isbn"}' }]
  assert.deepEqual(correrMigracao('1790000054_exemplar_fisico.js', ilegivel()), [])
  assert.deepEqual(correrMigracao('1790000053_exemplar_papel.js', ilegivel()), [])
  // (com campos legíveis, continuam a acrescentar)
  const bons = [{ nome: 'Disco', campos: JSON.stringify([{ chave: 'n_catalogo' }, { chave: 'exemplar_papel', rotulo: 'Onde está o exemplar em papel' }]) }]
  assert.deepEqual(correrMigracao('1790000054_exemplar_fisico.js', bons), ['Disco', 'Disco'])
  // (a migração corre noutro contexto: compara-se o texto)
  assert.equal(JSON.stringify(bons[0].novo.map((c) => [c.chave, c.rotulo || ''])), JSON.stringify([['n_catalogo', ''], ['codigo_barras', 'Código de barras (EAN/UPC)'], ['exemplar_papel', 'Onde está o exemplar físico']]))
})
