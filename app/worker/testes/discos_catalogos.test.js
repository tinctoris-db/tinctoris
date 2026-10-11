// Testes sem internet de discos (CD/LP): código de barras e texto da capa (Apple Music, Deezer, MusicBrainz).
// Correr: cd app/worker && node --test testes/*.js
// As respostas em testes/fixtures/discos/ são RESPOSTAS REAIS dos catálogos, gravadas a 10/10/2026 com os discos
// fotografados pelo Pedro (cada ficheiro: url, estado e corpo). Um pedido sem ficheiro faz o teste falhar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { discoPorCodigo, discoPorTexto, separarArtistas, editoraDoCopyright, tituloIgual, artistaCoincide, dataCurta, interprete } from '../src/fontes_externas/discos.js'

const PASTA = fileURLToPath(new URL('./fixtures/discos/', import.meta.url))
const GRAVADAS = new Map(
  readdirSync(PASTA).filter((f) => f.endsWith('.json')).map((f) => {
    const j = JSON.parse(readFileSync(PASTA + f, 'utf8'))
    return [j.url, j]
  })
)

const SEM_DADOS_DEEZER = { error: { type: 'DataException', message: 'no data', code: 800 } }

// Serve as respostas gravadas. Opções: o que fingir que o catálogo não sabe (para experimentar cada caminho à parte).
async function comInternet(opcoes, corpo) {
  const original = globalThis.fetch
  const pedidos = []
  const faltam = []
  globalThis.fetch = async (url, op) => {
    const u = String(url)
    const { host, pathname } = new URL(u)
    pedidos.push({ url: u, cabecalhos: op?.headers || {} })
    const json = (c) => new Response(JSON.stringify(c), { status: 200, headers: { 'content-type': 'application/json' } })
    if (host === 'api.deezer.com') {
      if (opcoes.semDeezer && pathname.startsWith('/album/')) return json(SEM_DADOS_DEEZER)
      if (opcoes.semBuscaDeezer && pathname.startsWith('/search/')) return json({ data: [], total: 0 })
    }
    if (host === 'itunes.apple.com' && opcoes.semBuscaApple && pathname === '/search') return json({ resultCount: 0, results: [] })
    if (host === 'musicbrainz.org' && opcoes.semMusicBrainz) return json({ created: '2026-10-10T18:00:00.000Z', count: 0, offset: 0, releases: [] })
    const g = GRAVADAS.get(u)
    if (!g) {
      faltam.push(u)
      return new Response('', { status: 404 })
    }
    // (mudar uma resposta gravada, para experimentar um caso: opcoes.mudar(host, corpo) → corpo)
    if (opcoes.mudar) return json(opcoes.mudar(host, typeof g.corpo === 'string' ? JSON.parse(g.corpo) : structuredClone(g.corpo)))
    return new Response(typeof g.corpo === 'string' ? g.corpo : JSON.stringify(g.corpo), { status: g.status })
  }
  try {
    const r = await corpo(pedidos)
    assert.deepEqual(faltam, [], 'pedidos sem resposta gravada')
    return r
  } finally {
    globalThis.fetch = original
  }
}

const pessoas = (c, papel) => c.autores.filter((a) => a.papel === papel)
const nomes = (c) => c.autores.map((a) => a.literal || `${a.apelido}|${a.nome}`)

test('código de barras: Pullois (Passacaille) — Apple, Deezer e MusicBrainz juntam-se na mesma edição', async () => {
  const c = await comInternet({}, () => discoPorCodigo('5425004841285', {}))
  assert.equal(c.fonte, 'Apple Music + Deezer + MusicBrainz')
  assert.equal(c.confianca, 1)
  assert.equal(c.tipo_sugerido, 'Disco')
  assert.equal(c.titulo, 'Ni Dufay, NI Binchois - The Works of Johannes Pullois')
  assert.equal(c.data, '2025-04-11')
  assert.equal(c.editora, 'Passacaille')
  assert.match(c.url, /^https:\/\/music\.apple\.com\/.*\/1807330875$/)
  // (Danilevskaia é pessoa, o Sollazzo Ensemble fica literal, Pullois vem do MusicBrainz como compositor)
  assert.deepEqual(c.autores, [
    { apelido: 'Danilevskaia', nome: 'Anna', papel: 'intérprete' },
    { literal: 'Sollazzo Ensemble', papel: 'intérprete' },
    { apelido: 'Pullois', nome: 'Johannes', papel: 'compositor' },
  ])
  assert.equal(c.metadados.codigo_barras, '5425004841285')
  assert.equal(c.metadados.n_catalogo, 'PAS 1128')
  assert.equal(c.metadados.publicado, true)
  const faixas = c.metadados.faixas.split('\n')
  assert.equal(faixas.length, 15)
  assert.equal(faixas[0], '1. Flos de spina (4:39)')
  assert.equal(faixas[14], '15. Amen (Je ne puis) (1:48)')
  assert.equal(c.suporte, undefined)
  assert.ok(!('suporte' in c.metadados))
})

test('código de barras: Vórtice (Artway) — sem MusicBrainz, sem chaves vazias em metadados', async () => {
  const c = await comInternet({}, () => discoPorCodigo('5600384985082', {}))
  assert.equal(c.fonte, 'Apple Music + Deezer')
  assert.equal(c.titulo, 'Vórtice "Para o fim de um tempo"')
  assert.deepEqual(c.autores, [{ literal: 'Caleidoscópio Coletivo', papel: 'intérprete' }])
  assert.equal(c.data, '2025-10-17')
  assert.equal(c.editora, 'Artway')
  assert.equal(c.metadados.faixas.split('\n').length, 12)
  assert.deepEqual(Object.keys(c.metadados).sort(), ['codigo_barras', 'faixas', 'publicado'])
})

test('código de barras: os cinco discos que nenhum catálogo conhece dão null (sem inventar)', async () => {
  for (const ean of ['8447025954123', '5603559012125', '5600269839554', '8435383694201', '6417513105223']) {
    assert.equal(await comInternet({}, () => discoPorCodigo(ean, {})), null, ean)
  }
})

test('código de barras: lixo não faz pedidos; MusicBrainz leva o agente de utilizador com o email', async () => {
  const sem = await comInternet({}, async (pedidos) => {
    for (const x of ['', 'abc', '12345', '5425004841285x', null]) assert.equal(await discoPorCodigo(x, {}), null)
    return pedidos.length
  })
  assert.equal(sem, 0)
  const mb = await comInternet({}, async (pedidos) => {
    await discoPorCodigo('5425004841285', { email_contacto: 'pedro@exemplo.pt' })
    return pedidos.filter((p) => p.url.includes('musicbrainz.org'))
  })
  assert.equal(mb.length, 1)
  assert.match(mb[0].cabecalhos['User-Agent'], /mailto:pedro@exemplo\.pt/)
})

test('código de barras: só o Apple Music (Deezer e MusicBrainz sem dados) — editora do ℗ e separação pessoa / agrupamento', async () => {
  const c = await comInternet({ semDeezer: true, semMusicBrainz: true }, () => discoPorCodigo('5425004841285', {}))
  assert.equal(c.fonte, 'Apple Music')
  assert.equal(c.editora, 'Passacaille') // «℗ 2025 Passacaille»
  assert.deepEqual(c.autores, [
    { apelido: 'Danilevskaia', nome: 'Anna', papel: 'intérprete' },
    { literal: 'Sollazzo Ensemble', papel: 'intérprete' },
  ])
  assert.equal(c.metadados.faixas.split('\n').length, 15)
  assert.ok(!('n_catalogo' in c.metadados))
})

test('texto da capa: «A Garden of Black Flowers» (astrophil & stella) — Deezer + Apple da mesma edição', async () => {
  const c = await comInternet({}, () => discoPorTexto({ titulo: 'a garden of black flowers', artista: 'astrophil & stella', editora: 'albus fair editions' }, {}))
  assert.equal(c.fonte, 'Apple Music + Deezer')
  assert.equal(c.confianca, 0.9)
  assert.equal(c.titulo, 'A Garden of Black Flowers')
  assert.equal(c.data, '2025-04-04')
  assert.equal(c.editora, 'Albus Fair Editions')
  assert.deepEqual(nomes(c), ['astrophil & stella', 'Bartz|Johanna', 'Danilevskaia|Anna', 'Baviera|Giovanna', 'Piganiol|Claire'])
  assert.equal(pessoas(c, 'intérprete').length, 5)
  assert.equal(c.metadados.faixas.split('\n').length, 14)
  // (o código de barras do Deezer — o Apple Music conhece-o com o mesmo título, não o contradiz; pode ser o da edição
  // digital: referencias_discos.js confere-o com o da fotografia)
  assert.equal(c.metadados.codigo_barras, '0199199174446')
})

test('texto da capa: «O Alaúde na Península Ibérica» (Segréis de Lisboa, Manuel Morais)', async () => {
  const c = await comInternet({}, () => discoPorTexto({ titulo: 'O Alaúde na Península Ibérica (séc. XV-XXI)', artista: 'Segréis de Lisboa, Manuel Morais' }, {}))
  assert.equal(c.fonte, 'Apple Music + Deezer')
  assert.equal(c.titulo, 'O Alaúde na Península Ibérica (Séc. XV-XXI)')
  assert.equal(c.data, '2023-01-31')
  assert.equal(c.autores.length, 2)
  // (os Segréis de Lisboa são um agrupamento, não uma pessoa «Lisboa, Segréis de»)
  assert.deepEqual(c.autores[0], { literal: 'Segréis de Lisboa', papel: 'intérprete' })
  assert.deepEqual(c.autores[1], { apelido: 'Morais', nome: 'Manuel', papel: 'intérprete' })
  assert.equal(c.metadados.faixas.split('\n').length, 23)
  assert.equal(c.metadados.codigo_barras, '0198015608608')
})

test('texto da capa: o código de barras do Deezer contradito pelo Apple Music (outro título) não se grava', async () => {
  const mudar = (host, corpo) => {
    if (host === 'itunes.apple.com' && corpo.results) for (const r of corpo.results) if (r.wrapperType === 'collection') r.collectionName = 'Outro disco qualquer'
    return corpo
  }
  const c = await comInternet({ mudar }, () => discoPorTexto({ titulo: 'O Alaúde na Península Ibérica (séc. XV-XXI)', artista: 'Segréis de Lisboa, Manuel Morais' }, {}))
  assert.equal(c.fonte, 'Deezer')
  assert.ok(!('codigo_barras' in c.metadados))
})

test('datas: a do MusicBrainz (a edição com este código de barras) antes da do Apple; «0000-00-00» é sem data', async () => {
  const comData = (data) => (host, corpo) => {
    if (host === 'musicbrainz.org') for (const r of corpo.releases || []) r.date = data
    return corpo
  }
  const outra = await comInternet({ mudar: comData('2024-11-08') }, () => discoPorCodigo('5425004841285', {}))
  assert.equal(outra.data, '2024-11-08')
  assert.deepEqual(outra.datas, ['2024-11-08', '2025-04-11'])
  // (o mesmo ano, menos preciso: fica a data mais precisa)
  assert.equal((await comInternet({ mudar: comData('2025') }, () => discoPorCodigo('5425004841285', {}))).data, '2025-04-11')
  assert.equal(dataCurta('0000-00-00'), '')
  assert.equal(dataCurta('2025-04-11T07:00:00Z'), '2025-04-11')
  assert.equal(dataCurta('2019-05'), '2019')
})

test('intérpretes: agrupamentos ficam literais; «Various Artists» não é intérprete', () => {
  for (const g of ['Segréis de Lisboa', 'Coro Gulbenkian', 'Capela Real', 'Collegium Vocale Gent', 'Cappella Mediterranea']) assert.deepEqual(interprete(g), { literal: g, papel: 'intérprete' }, g)
  assert.deepEqual(interprete('Manuel Morais'), { apelido: 'Morais', nome: 'Manuel', papel: 'intérprete' })
  for (const v of ['Various Artists', 'Vários', 'Varios Artistas', 'vários intérpretes']) assert.equal(interprete(v), null, v)
})

test('texto da capa: o mesmo título com outro intérprete NÃO identifica (Hilliard Ensemble) e sem intérprete também não', async () => {
  const a = await comInternet({}, () => discoPorTexto({ titulo: 'a garden of black flowers', artista: 'Hilliard Ensemble' }, {}))
  assert.equal(a, null)
  const b = await comInternet({}, async (pedidos) => {
    const r = await discoPorTexto({ titulo: 'a garden of black flowers', artista: '' }, {})
    return { r, n: pedidos.length }
  })
  assert.equal(b.r, null)
  assert.equal(b.n, 0)
  assert.equal(await discoPorTexto({ titulo: '', artista: 'astrophil & stella' }, {}), null)
})

test('texto da capa: só o Apple Music — agrupamentos, pessoas e editora do ℗', async () => {
  const opcoes = { semBuscaDeezer: true }
  const g = await comInternet(opcoes, () => discoPorTexto({ titulo: 'a garden of black flowers', artista: 'astrophil & stella' }, {}))
  assert.equal(g.fonte, 'Apple Music')
  assert.equal(g.editora, 'Albus Fair Editions') // «℗ 2025 Albus Fair Editions»
  assert.deepEqual(nomes(g), ['astrophil & stella', 'Bartz|Johanna', 'Danilevskaia|Anna', 'Baviera|Giovanna', 'Piganiol|Claire'])
  assert.equal(g.metadados.faixas.split('\n').length, 14)
  const a = await comInternet(opcoes, () => discoPorTexto({ titulo: 'O Alaúde na Península Ibérica (séc. XV-XXI)', artista: 'Segréis de Lisboa, Manuel Morais' }, {}))
  assert.equal(a.fonte, 'Apple Music')
  assert.equal(a.editora, 'Manuel Morais')
  assert.equal(a.data, '2023-01-31')
  assert.equal(a.autores.length, 2)
  assert.equal(a.autores[1].apelido, 'Morais')
})

test('texto da capa: só o MusicBrainz — pelo intérprete e pelo nº de catálogo', async () => {
  const opcoes = { semBuscaDeezer: true, semBuscaApple: true }
  const porArtista = await comInternet(opcoes, () => discoPorTexto({ titulo: 'Ni Dufay, Ni Binchois: The Works of Johannes Pullois', artista: 'Sollazzo Ensemble' }, {}))
  assert.equal(porArtista.fonte, 'MusicBrainz')
  assert.equal(porArtista.editora, 'Passacaille')
  assert.equal(porArtista.metadados.n_catalogo, 'PAS 1128')
  assert.equal(porArtista.metadados.codigo_barras, '5425004841285')
  assert.match(porArtista.url, /^https:\/\/musicbrainz\.org\/release\//)
  assert.deepEqual(pessoas(porArtista, 'compositor'), [{ apelido: 'Pullois', nome: 'Johannes', papel: 'compositor' }])
  // (sem intérprete na capa mas com o nº de catálogo da edição; o título da capa tem outra pontuação)
  const porCatalogo = await comInternet(opcoes, () => discoPorTexto({ titulo: 'Ni Dufay, Ni Binchois - The Works of Johannes Pullois', artista: '', n_catalogo: 'PAS 1128' }, {}))
  assert.equal(porCatalogo.fonte, 'MusicBrainz')
  assert.equal(porCatalogo.metadados.n_catalogo, 'PAS 1128')
})

test('regras de aceitação: título e intérprete', () => {
  // títulos: iguais, ou o da capa é o início do completo; uma só palavra tem de ser igual
  assert.ok(tituloIgual('O Alaúde na Península Ibérica (séc. XV-XXI)', 'O Alaúde na Península Ibérica (Séc. XV-XXI)'))
  assert.ok(tituloIgual('Ni Dufay, Ni Binchois', 'Ni Dufay, NI Binchois - The Works of Johannes Pullois'))
  assert.ok(tituloIgual('a garden of black flowers', 'A Garden of Black Flowers (Deluxe)'))
  assert.ok(!tituloIgual('Vórtice', 'Vórtice "Para o fim de um tempo"'))
  assert.ok(!tituloIgual('Garden', 'The Secret Garden of Black Flowers'))
  assert.ok(!tituloIgual('a garden of black flowers', 'Astrophil & Stella'))
  // intérpretes: «Ensemble» sozinho não chega; com duas palavras do nome, uma só não chega
  assert.ok(artistaCoincide('Sollazzo Ensemble', ['Anna Danilevskaia', 'Sollazzo Ensemble']))
  assert.ok(!artistaCoincide('Hilliard Ensemble', ['Anna Danilevskaia', 'Sollazzo Ensemble']))
  assert.ok(!artistaCoincide('Anna Netrebko', ['Anna Danilevskaia', 'Sollazzo Ensemble']))
  assert.ok(artistaCoincide('Segréis de Lisboa, Manuel Morais', ['Segréis de Lisboa', 'Manuel Morais']))
  assert.ok(artistaCoincide('Savall', ['Jordi Savall', 'Hespèrion XXI']))
  assert.ok(!artistaCoincide('The Ensemble', ['Sollazzo Ensemble']))
})

test('auxiliares: separar artistas e editora do ℗', () => {
  assert.deepEqual(separarArtistas('Anna Danilevskaia & Sollazzo Ensemble'), ['Anna Danilevskaia', 'Sollazzo Ensemble'])
  assert.deepEqual(separarArtistas('astrophil & stella, Johanna Bartz, Anna Danilevskaia, Giovanna Baviera & Claire Piganiol', ['astrophil & stella']), [
    'astrophil & stella', 'Johanna Bartz', 'Anna Danilevskaia', 'Giovanna Baviera', 'Claire Piganiol',
  ])
  assert.deepEqual(separarArtistas('Segréis de Lisboa & Manuel Morais'), ['Segréis de Lisboa', 'Manuel Morais'])
  assert.deepEqual(separarArtistas('Maria João e Mário Laginha'), ['Maria João', 'Mário Laginha'])
  assert.equal(editoraDoCopyright('℗ 2025 Passacaille'), 'Passacaille')
  assert.equal(editoraDoCopyright('℗ 2025 Albus Fair Editions'), 'Albus Fair Editions')
  assert.equal(editoraDoCopyright('℗ & © 2019-2020 Artway. All rights reserved.'), 'Artway')
  assert.equal(editoraDoCopyright('Sony Music'), 'Sony Music')
  assert.equal(editoraDoCopyright(''), '')
})
