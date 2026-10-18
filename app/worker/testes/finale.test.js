// Testes dos ficheiros do Finale (.mus, .musx), sem internet. Correr: cd app/worker && node --test testes/*.js
// Os nomes são de ficheiros reais da biblioteca (17/10/2026). testes/dados/inventado.musx é INVENTADO (feito na nuvem
// a 2/10 com a estrutura de um .musx: ZIP com NotationMetadata.xml); a leitura foi confirmada nos .musx reais do Pedro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { metadadosMusx, metadadosDoXml, nomeDePessoa, titularDosDireitos, lerNomeFinale, fichaFinale, agruparFinale, ETIQUETA_FINALE } from '../src/finale.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))

// Compositores «conhecidos» (o mesmo formato de lotes_midi.autoresConhecidos)
const pessoa = (apelido, nomes = {}, papel = 'compositor') => ({ apelido, n: 5, nomes: new Map(Object.entries(nomes)), papeis: new Map([[papel, 5]]) })
const conhecidos = new Map([
  ['cima', pessoa('Cima')],
  ['frescobaldi', pessoa('Frescobaldi', { 'Girolamo': 3 })],
  ['morago', pessoa('Morago', { 'Estêvão Lopes': 1 })],
  ['lawes', pessoa('Lawes', { Henry: 4 })],
  ['byrd', pessoa('Byrd', { William: 3 })],
  ['mozart', pessoa('Mozart', { 'Wolfgang Amadeus': 5 })],
  ['dowland', pessoa('Dowland', { John: 4 })],
  ['dufay', pessoa('Dufay', { Guillaume: 4 })],
  ['binchois', pessoa('Binchois')],
  ['boismortier', pessoa('Boismortier')],
  ['bach', pessoa('Bach', { 'Johann Sebastian': 9 })],
  ['dunstable', pessoa('Dunstable', { John: 3 })],
  ['castro', pessoa('Castro', { Pedro: 3 })],
  ['locke', pessoa('Locke', { Matthew: 2, Mathew: 1 })],
  ['castello', pessoa('Castello')],
  ['rose', pessoa('Rose', { Bernard: 3 }, 'autor')],
])
const nomes = (r) => r.autores.map((a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' '))
const eDono = (a) => /^(pedro (sousa )?silva)$/i.test(typeof a === 'string' ? a : a.literal || [a.nome, a.apelido].filter(Boolean).join(' '))
const pessoaDono = { apelido: 'Silva', nome: 'Pedro Sousa', papel: 'editor' }

test('Finale (.musx): título, subtítulo e compositor guardados no ficheiro', async () => {
  const m = await metadadosMusx(path.join(aqui, 'dados', 'inventado.musx'))
  assert.equal(m.titulo, 'Missa pro defunctis')
  assert.equal(m.subtitulo, 'Introitus')
  assert.equal(m.compositor, 'Manuel Cardoso')
  assert.equal(m.arranjador, undefined)
})

test('Finale (.musx): valores por omissão, prefixos de espaço de nomes e ficheiros que não são ZIP', async () => {
  assert.deepEqual(metadadosDoXml('<metadata><title>Title</title><composer>Composer</composer></metadata>'), {})
  assert.deepEqual(metadadosDoXml('<nm:metadata><nm:title>Sonata &amp; Fuga</nm:title><nm:composer><![CDATA[J. S. Bach]]></nm:composer></nm:metadata>'), { titulo: 'Sonata & Fuga', compositor: 'J. S. Bach' })
  assert.deepEqual(await metadadosMusx(path.join(aqui, 'finale.test.js')), {})
  assert.deepEqual(await metadadosMusx(path.join(aqui, 'nao-existe.musx')), {})
})

test('Finale (.musx): nomes como o Pedro os escreve na ficha interna', () => {
  assert.equal(nomeDePessoa('[Pedro de Cristo]'), 'Pedro de Cristo')
  assert.equal(nomeDePessoa('Stephanus Lopezius (Estevão Morago)'), 'Estevão Morago')
  assert.equal(nomeDePessoa('Stephanus Lopezius [Estevão Lopes Morago]'), 'Estevão Lopes Morago')
  assert.equal(nomeDePessoa('D. Petrus C.S. + [Pedro de Cristo]'), 'Pedro de Cristo')
  assert.equal(nomeDePessoa('[Composer]'), '')
  assert.equal(titularDosDireitos('© 2012 Pedro Sousa Silva'), 'Pedro Sousa Silva')
  assert.equal(titularDosDireitos('©'), '')
})

test('Nome: compositor conhecido, nº de ordem e nº de vozes («51_Cima_a4_Sonata»)', () => {
  const r = lerNomeFinale('51_Cima_a4_Sonata.mus', { conhecidos })
  assert.equal(r.titulo, 'Sonata')
  assert.deepEqual(nomes(r), ['Cima'])
  assert.equal(r.vozes, 'a 4')
  assert.equal(r.numero, '51')
})

test('Nome: parte cava depois de « - » e no fim («io son ferito versao CdM - Bassus», «canzona altus»)', () => {
  const a = lerNomeFinale('io son ferito versao CdM - Bassus.mus', { conhecidos })
  assert.equal(a.titulo, 'Io son ferito')
  assert.equal(a.parte, 'Bassus')
  assert.deepEqual(a.versoes, ['versão CdM'])
  assert.equal(lerNomeFinale('canzona  altus.mus', { conhecidos }).parte, 'Altus')
  assert.equal(lerNomeFinale('Sonatella I - Bertali - 003 Alto Recorder.mus', { conhecidos }).parte, 'Alto Recorder')
  // («Sonata vl vlne» é a instrumentação, não uma parte)
  assert.equal(lerNomeFinale('48_Cima_a2_Sonata_vl_vlne.mus', { conhecidos }).parte, '')
})

test('Nome: compositor em maiúsculas, fólios, versões e fonte abreviada', () => {
  const a = lerNomeFinale('MORAGO missa pro defunctis 122v-129r com transposicoes.mus', { conhecidos })
  assert.equal(a.titulo, 'Missa pro defunctis')
  assert.deepEqual(nomes(a), ['Morago'])
  assert.equal(a.folios, 'fol. 122v-129r')
  assert.deepEqual(a.versoes, ['com transposições'])
  const b = lerNomeFinale('23. ESC B DUFAY BINCHOIS Mon seul plaisir SOL.mus', { conhecidos })
  assert.equal(b.titulo, 'Mon seul plaisir')
  assert.deepEqual(nomes(b), ['Guillaume Dufay', 'Binchois'])
  assert.match(b.fonte, /Escorial B/)
  assert.equal(b.tonalidade, 'Sol')
  const c = lerNomeFinale('ANON Angelus ad pastores 110v play along.mus', { conhecidos })
  assert.equal(c.titulo, 'Angelus ad pastores')
  assert.deepEqual(nomes(c), ['Anónimo'])
  assert.deepEqual(c.versoes, ['play along'])
  // (título todo em maiúsculas não é um compositor; apelido desconhecido a meio é uma versão, não um compositor)
  assert.deepEqual(nomes(lerNomeFinale('CORREDORES DE SOMBRA.mus', { conhecidos })), [])
  assert.deepEqual(nomes(lerNomeFinale('Dunstable O Rosa Bella MOLINA_mus.mus', { conhecidos })), ['John Dunstable'])
})

test('Nome: «Apelido, Nome», « - Nome Apelido», palavras coladas e catálogo de um só compositor', () => {
  const a = lerNomeFinale('Lawes, William Sonata 6 en re mayor Air (Almain).mus', { conhecidos })
  assert.deepEqual(nomes(a), ['William Lawes'])
  assert.equal(a.titulo, 'Sonata 6 en re mayor Air (Almain)')
  const b = lerNomeFinale('Dowland, John • PavanaLachrymae.mus', { conhecidos })
  assert.equal(b.titulo, 'Pavana Lachrymae')
  assert.deepEqual(nomes(b), ['John Dowland'])
  const c = lerNomeFinale('BWV1049(II)Vl1.MUS', { conhecidos })
  assert.equal(c.titulo, 'BWV 1049 (II)')
  assert.equal(c.parte, 'Vl 1')
  assert.deepEqual(nomes(c), ['Johann Sebastian Bach'])
  // («Concierto» não é um nome próprio; «la rose» não é o Bernard Rose)
  assert.equal(lerNomeFinale('Mozart, Concierto en Re M. flauta. Cadencias.mus', { conhecidos }).titulo.startsWith('Concierto'), true)
  assert.deepEqual(nomes(lerNomeFinale('la rose.mus', { conhecidos })), [])
  assert.deepEqual(nomes(lerNomeFinale('3ß tom-pedro castro.MUS', { conhecidos })), ['Pedro Castro'])
})

test('Ficha: .musx com ficha interna — título, compositor, fonte no subtítulo, o dono como editor e o ano dos direitos', () => {
  const r = fichaFinale({
    nome: 'Velum templi scisum 39v.musx',
    musx: { titulo: 'Velum templi scisum', subtitulo: 'P-Cug MM 36 fol. 39v', compositor: 'Pedro de Cristo', direitos: '© 2014 Pedro Sousa Silva / Arte Minima' },
    conhecidos,
    eDono,
    pessoaDono,
  })
  assert.equal(r.completa, true)
  assert.equal(r.campos.titulo, 'Velum templi scisum')
  assert.equal(r.campos.data, '2014')
  assert.equal(r.campos.metadados.colecao, 'P-Cug MM 36 fol. 39v')
  assert.deepEqual(r.campos.autores.map((a) => a.papel), ['compositor', 'editor'])
  assert.equal(r.campos.autores[1].apelido, 'Silva')
  assert.equal(r.origem.titulo, 'ficha do Finale')
})

test('Ficha: .mus sem editor nem data; nome sem sentido fica por rever; atribuição duvidosa fica em nota', () => {
  const a = fichaFinale({ nome: 'MORAGO de profundis - Altvs.mus', conhecidos, eDono, pessoaDono })
  assert.equal(a.completa, true)
  assert.equal(a.campos.data, undefined)
  assert.equal(a.campos.autores.some((x) => x.papel === 'editor'), false)
  const b = fichaFinale({ nome: 'mvt4.mus', conhecidos, eDono, pessoaDono })
  assert.equal(b.completa, false)
  assert.match(b.motivo, /pouco informativo/)
  assert.equal(fichaFinale({ nome: 'bois2.mus', conhecidos, eDono, pessoaDono }).completa, false)
  const c = fichaFinale({ nome: 'Les ombres.musx', musx: { titulo: 'Les ombres', compositor: 'Dumanoir?' }, conhecidos, eDono, pessoaDono })
  assert.equal(c.completa, true)
  assert.match(c.notas[0], /duvidosa/)
  assert.equal(ETIQUETA_FINALE, 'Finale — dados do nome')
})

test('Agrupar: partes cavas da mesma peça numa ficha (a partitura fica como principal); versões diferentes não', () => {
  const f = (numero, nome) => ({ numero, ...fichaFinale({ nome, conhecidos, eDono, pessoaDono }) })
  const grupos = agruparFinale([
    f(10, 'Capricio frescobaldi - 001 cantus.MUS'),
    f(11, 'Capricio frescobaldi bassus.mus'),
    f(12, 'Capricio frescobaldi.mus'),
    f(13, 'Capricio frescobaldi play along.mus'),
    f(20, 'canzona - 001 Cantus.mus'),
    f(21, 'canzona - 002 Altus.mus'),
    f(30, 'fantasia.mus'),
    f(31, 'fantasia.mus'),
  ])
  const capricio = grupos.find((g) => g.membros.some((m) => m.numero === 10))
  assert.equal(capricio.principal.numero, 12)
  assert.deepEqual(capricio.membros.map((m) => m.numero).sort(), [10, 11, 12])
  assert.match(capricio.campos.metadados.instrumentacao, /partes: Cantus, Bassus/)
  assert.ok(grupos.some((g) => g.principal.numero === 13 && g.membros.length === 1))
  // (por rever: as partes de um jogo juntam-se; duas «Fantasia» sem mais nada não)
  const canzona = grupos.find((g) => g.membros.some((m) => m.numero === 20))
  assert.equal(canzona.membros.length, 2)
  assert.equal(canzona.completa, false)
  assert.equal(grupos.filter((g) => g.membros.some((m) => m.numero >= 30)).length, 2)
})

test('Ficha: ficha interna de outro ficheiro reaproveitado no Finale — manda o título do nome, com nota', () => {
  const r = fichaFinale({ nome: 'Les Nimphes de La Grenoullere.musx', musx: { titulo: 'Les ombres', compositor: 'Dumanoir?' }, conhecidos, eDono, pessoaDono })
  assert.equal(r.campos.titulo, 'Les Nimphes de La Grenoullere')
  assert.match(r.notas.join(' '), /outro ficheiro reaproveitado/)
  const t = fichaFinale({ nome: 'Tenebre facte sunt 40v.musx', musx: { titulo: 'Velum templi scisum', subtitulo: 'P-Cug MM 36 fol. 39v', compositor: 'Pedro de Cristo' }, conhecidos, eDono, pessoaDono })
  assert.equal(t.campos.metadados.colecao, 'fol. 40v')
  // (o mesmo título com mais pormenor no nome não é conflito)
  assert.equal(fichaFinale({ nome: 'alleluia 43v.musx', musx: { titulo: 'Alleluia', subtitulo: 'P-Cug MM 36 fol. 43v' }, conhecidos, eDono, pessoaDono }).origem.titulo, 'ficha do Finale')
})

test('Nome: «folia» não é um fólio; «fol VII v», «fol 10» e «f. 23v-24» são', () => {
  const a = lerNomeFinale('folia arranjo LUS.mus', { conhecidos })
  assert.equal(a.folios, '')
  assert.match(a.titulo, /^folia arranjo/i)
  assert.equal(lerNomeFinale('MAGALHÃES Magnificat Primus tonus fol VII v.mus', { conhecidos }).folios, 'fol. VIIv')
  assert.equal(lerNomeFinale('fol 10 tento por D lasolre.mus', { conhecidos }).folios, 'fol. 10')
  assert.equal(lerNomeFinale('Beata Viscera Marie f. 64v-65.mus', { conhecidos }).folios, 'fol. 64v-65')
})
