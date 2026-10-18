// Discos (CD/LP) a partir de fotografias da capa / contracapa (10/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// As linhas abaixo são o que o leitor da Apple (ferramentas/ler_imagem.swift) leu em nove fotografias REAIS enviadas
// pelo Pedro (disco_5 … disco_13): contracapas com código de barras (Numérica / Univ. de Aveiro «NUM 1212», Passacaille…),
// a contracapa do «A Garden of Black Flowers» (sem código), a do «ABCD 522» (barras não descodificadas: só os algarismos
// «417513 105223» no texto) e a capa de «O Alaúde na Península Ibérica» (Segréis de Lisboa, sem código).
// Os catálogos e a IA são simulados (nada sai para a internet).
import { test } from 'node:test'
import path from 'node:path'
import assert from 'node:assert/strict'
import { isbnDoCodigo } from '../src/extracao.js'
import { resumo, eanValido, eanDeDisco, classificarFotografias } from '../src/referencias.js'
import {
  ETIQUETA, pastaDoDisco, eansDoTexto, nCatalogoDoTexto, anoDaCapa, suporteDoTexto, tituloDaPasta, autoresDaCapa,
  agruparPorEan, juntarIdentificados, confirmaCodigoIncerto, identificar, decidirDisco, escolherParaIA,
  editoraValida, tituloCortado, pistasDoTexto, conferirPeloTexto, camposEmFalta,
} from '../src/referencias_discos.js'

const FOTOS = [{"ficheiro": "/w/disco_5.jpg", "codigos": ["8447025954123"], "linhas": [{"texto": "447025 954123 >", "x": 0.235, "y": 0.43, "w": 0.043, "h": 0.248}]}, {"ficheiro": "/w/disco_6.jpg", "codigos": ["5603559012125"], "linhas": [{"texto": "DeCA", "x": 0.607, "y": 0.863, "w": 0.029, "h": 0.056}, {"texto": "o de Comunicação e Arte da universidade de aveiro", "x": 0.582, "y": 0.711, "w": 0.022, "h": 0.289}, {"texto": "de de aveiro", "x": 0.504, "y": 0.919, "w": 0.017, "h": 0.081}, {"texto": "theoria polesis praxis", "x": 0.506, "y": 0.711, "w": 0.019, "h": 0.128}, {"texto": "mérica", "x": 0.278, "y": 0.831, "w": 0.059, "h": 0.169}, {"texto": "ra Discográfica", "x": 0.251, "y": 0.833, "w": 0.028, "h": 0.168}, {"texto": "NUM 1212", "x": 0.419, "y": 0.709, "w": 0.019, "h": 0.064}, {"texto": "P&C all rights", "x": 0.397, "y": 0.699, "w": 0.021, "h": 0.086}, {"texto": "reserved", "x": 0.38, "y": 0.713, "w": 0.018, "h": 0.056}, {"texto": "2010", "x": 0.362, "y": 0.725, "w": 0.017, "h": 0.032}, {"texto": "S.P.A.", "x": 0.345, "y": 0.724, "w": 0.019, "h": 0.036}, {"texto": "MPACT", "x": 0.314, "y": 0.705, "w": 0.014, "h": 0.032}, {"texto": "disc", "x": 0.277, "y": 0.699, "w": 0.047, "h": 0.076}, {"texto": "DIGITAL AULAO", "x": 0.262, "y": 0.701, "w": 0.016, "h": 0.071}, {"texto": "5 603559", "x": 0.288, "y": 0.507, "w": 0.043, "h": 0.159}, {"texto": "012125", "x": 0.295, "y": 0.371, "w": 0.035, "h": 0.128}]}, {"ficheiro": "/w/disco_7.jpg", "codigos": ["5425004841285"], "linhas": [{"texto": "LIOK LEDONO", "x": 0.969, "y": 0.266, "w": 0.029, "h": 0.246}, {"texto": "Flanders.", "x": 0.773, "y": 0.156, "w": 0.064, "h": 0.231}, {"texto": "State", "x": 0.711, "y": 0.3, "w": 0.044, "h": 0.092}, {"texto": "passacaille", "x": 0.374, "y": 0.001, "w": 0.101, "h": 0.224}, {"texto": "5 425004 841285\"", "x": 0.346, "y": 0.323, "w": 0.034, "h": 0.242}]}, {"ficheiro": "/w/disco_8.jpg", "codigos": [], "linhas": [{"texto": "albus | fair editions", "x": 0.89, "y": 0.173, "w": 0.019, "h": 0.145}, {"texto": "a garden of black flowers", "x": 0.835, "y": 0.42, "w": 0.05, "h": 0.429}, {"texto": "A Garden of Black Flowers - love and melancholy in late 16th century diminutions, motets", "x": 0.741, "y": 0.193, "w": 0.034, "h": 0.67}, {"texto": "and madrigals by Palestrina, Bovicelli, Bassano et al.", "x": 0.714, "y": 0.472, "w": 0.031, "h": 0.391}, {"texto": "The image of the garden as a place of retreat runs throughout the centuries: In the Song of", "x": 0.658, "y": 0.193, "w": 0.032, "h": 0.672}, {"texto": "Songs, it is a symbol of the beauty of the beloved and the union of two lovers; in the New", "x": 0.632, "y": 0.195, "w": 0.029, "h": 0.67}, {"texto": "Testament, Jesus retreats to the Garden of Gethsemane in dark foreboding before his im-", "x": 0.603, "y": 0.193, "w": 0.03, "h": 0.672}, {"texto": "prisonment; in medieval and Renaissance mythology, Mary is often compared to a hortus", "x": 0.575, "y": 0.193, "w": 0.031, "h": 0.672}, {"texto": "conclusus, a closed garden. Ultimately it stands for the memory of the Garden of Eden and", "x": 0.549, "y": 0.195, "w": 0.027, "h": 0.67}, {"texto": "the lost paradise. The idealized image of a secluded garden stands for the last refuge of", "x": 0.52, "y": 0.193, "w": 0.031, "h": 0.673}, {"texto": "genuine expression of feeling - real longing, the bliss of true love or heartfelt pain over its", "x": 0.491, "y": 0.195, "w": 0.031, "h": 0.672}, {"texto": "loss could not simply be expressed, or even lived out in the strict social order of the time, but", "x": 0.465, "y": 0.193, "w": 0.03, "h": 0.675}, {"texto": "were hidden behind the veil of melancholy. Harp, two violas da gamba and Renaissance", "x": 0.433, "y": 0.195, "w": 0.038, "h": 0.672}, {"texto": "traverso unfold a virtuosic, yet intimate and colourful sound picture of a late Renaissance", "x": 0.41, "y": 0.195, "w": 0.029, "h": 0.672}, {"texto": "musical garden.", "x": 0.386, "y": 0.744, "w": 0.023, "h": 0.122}, {"texto": "astrophil & stella", "x": 0.248, "y": 0.431, "w": 0.046, "h": 0.202}, {"texto": "Johanna Bartz", "x": 0.196, "y": 0.589, "w": 0.021, "h": 0.125}, {"texto": "Giovanna Baviera", "x": 0.161, "y": 0.578, "w": 0.021, "h": 0.148}, {"texto": "Anna Danilevskaia", "x": 0.124, "y": 0.576, "w": 0.021, "h": 0.154}, {"texto": "Claire Piganiol", "x": 0.085, "y": 0.59, "w": 0.025, "h": 0.124}, {"texto": "Renaissance traverso & direction", "x": 0.191, "y": 0.27, "w": 0.024, "h": 0.272}, {"texto": "Renaissance viol & voice", "x": 0.157, "y": 0.339, "w": 0.021, "h": 0.203}, {"texto": "Renaissance viol", "x": 0.12, "y": 0.402, "w": 0.023, "h": 0.141}, {"texto": "Triple harp", "x": 0.081, "y": 0.453, "w": 0.027, "h": 0.091}]}, {"ficheiro": "/w/disco_9.jpg", "codigos": ["5600384985082"], "linhas": [{"texto": "5600384985082", "x": 0.452, "y": 0.25, "w": 0.047, "h": 0.551}]}, {"ficheiro": "/w/disco_10.jpg", "codigos": ["5600269839554"], "linhas": [{"texto": "600269", "x": 0.442, "y": 0.529, "w": 0.054, "h": 0.176}, {"texto": "839554", "x": 0.448, "y": 0.304, "w": 0.048, "h": 0.173}, {"texto": "01.", "x": -0.007, "y": 0.263, "w": 0.169, "h": 0.072}, {"texto": "02.", "x": -0.0, "y": 0.363, "w": 0.155, "h": 0.061}, {"texto": "03.", "x": -0.0, "y": 0.456, "w": 0.155, "h": 0.063}, {"texto": "04.", "x": -0.0, "y": 0.551, "w": 0.155, "h": 0.061}, {"texto": "05.", "x": -0.0, "y": 0.642, "w": 0.155, "h": 0.063}, {"texto": "06.", "x": -0.0, "y": 0.735, "w": 0.153, "h": 0.061}, {"texto": "07.1", "x": -0.002, "y": 0.826, "w": 0.158, "h": 0.065}, {"texto": "08.", "x": -0.003, "y": 0.919, "w": 0.156, "h": 0.065}]}, {"ficheiro": "/w/disco_11.jpg", "codigos": ["8435383694201"], "linhas": [{"texto": "rt\"", "x": -0.0, "y": 0.897, "w": 0.11, "h": 0.06}, {"texto": "lite N° 6", "x": -0.0, "y": 0.823, "w": 0.268, "h": 0.053}, {"texto": "1597)", "x": 0.0, "y": 0.427, "w": 0.167, "h": 0.045}, {"texto": "rt", "x": -0.0, "y": 0.305, "w": 0.06, "h": 0.038}, {"texto": "435383 694201", "x": 0.622, "y": 0.292, "w": 0.056, "h": 0.421}]}, {"ficheiro": "/w/disco_12.jpg", "codigos": [], "linhas": [{"texto": "FIABA2300048-FIABA2300061", "x": 0.539, "y": 0.402, "w": 0.035, "h": 0.361}, {"texto": "ABCD 522", "x": 0.502, "y": 0.642, "w": 0.027, "h": 0.122}, {"texto": "417513 105223", "x": 0.364, "y": 0.613, "w": 0.023, "h": 0.141}, {"texto": "EARLY IT", "x": -0.0, "y": 0.083, "w": 0.195, "h": 0.039}, {"texto": "VIRPI RÄI!", "x": -0.001, "y": 0.154, "w": 0.193, "h": 0.036}, {"texto": "TAITO HO", "x": -0.0, "y": 0.21, "w": 0.193, "h": 0.026}, {"texto": "(Ontrei M", "x": -0.0, "y": 0.244, "w": 0.193, "h": 0.032}, {"texto": "PAULIINA", "x": -0.0, "y": 0.293, "w": 0.19, "h": 0.027}, {"texto": "KIRSI OJA", "x": -0.0, "y": 0.341, "w": 0.188, "h": 0.027}, {"texto": "ANTHONY", "x": -0.0, "y": 0.391, "w": 0.19, "h": 0.026}, {"texto": "ALINA JÄI", "x": -0.0, "y": 0.435, "w": 0.188, "h": 0.031}, {"texto": "LOUNA HI", "x": 0.0, "y": 0.49, "w": 0.188, "h": 0.025}, {"texto": "ILKKA HEl", "x": -0.0, "y": 0.54, "w": 0.19, "h": 0.023}, {"texto": "PAULIINA", "x": -0.0, "y": 0.587, "w": 0.186, "h": 0.025}, {"texto": "Malinen n", "x": -0.0, "y": 0.623, "w": 0.185, "h": 0.025}, {"texto": "20-string", "x": -0.0, "y": 0.657, "w": 0.186, "h": 0.028}, {"texto": "EERO PAL", "x": 0.0, "y": 0.705, "w": 0.184, "h": 0.023}, {"texto": "PETTERI I", "x": -0.0, "y": 0.756, "w": 0.182, "h": 0.022}]}, {"ficheiro": "/w/disco_13.jpg", "codigos": [], "linhas": [{"texto": "O Alaúde na Península Ibérica (séc. XV-XXI)", "x": 0.272, "y": 0.384, "w": 0.026, "h": 0.308}, {"texto": "SEGREIS DE LISBOA", "x": 0.25, "y": 0.493, "w": 0.015, "h": 0.097}, {"texto": "Manuel Morais", "x": 0.236, "y": 0.507, "w": 0.012, "h": 0.068}]}]
const lida = (f) => resumo(f.ficheiro, f.codigos, f.linhas)
const [D5, D6, D7, D8, D9, D10, D11, D12, D13] = FOTOS.map(lida)
// (a contracapa do livro de Shakespeare dos testes dos livros: código de barras ISBN)
const LIVRO = resumo('/w/shakespeare.jpg', ['9781858131047'], [{ texto: 'ISBN 1-85813-104-9' }])

// Consultas simuladas: catálogos pelo código e pelo texto, fichas existentes, IA
function consultas({ codigos = {}, texto = null, existentes = [], ia = null } = {}) {
  const c = { chamadas: { codigo: [], texto: [], ia: [] } }
  c.porCodigo = async (ean) => (c.chamadas.codigo.push(ean), codigos[ean] || null)
  c.porTexto = async (q) => (c.chamadas.texto.push(q), typeof texto === 'function' ? texto(q) : texto)
  c.existente = async ({ ean, url }) => existentes.find((e) => (ean && e.metadados?.codigo_barras === ean) || (url && e.url === url)) || null
  c.iaDisponivel = async () => !!ia
  c.lerCapa = async (f) => (c.chamadas.ia.push(f), ia[f.split('/').pop()] || ia['*'] || {})
  return c
}
const registo = (x) => ({ fonte: 'Apple Music', confianca: 1, tipo_sugerido: 'Disco', palavras_chave: [], ...x, metadados: { publicado: true, ...(x.metadados || {}) } })
const NUMERICA = registo({
  titulo: 'Theoria Poiesis Praxis',
  autores: [{ apelido: 'Ensemble de Aveiro', literal: 'Ensemble de Aveiro', papel: 'intérprete' }],
  data: '2010',
  editora: 'Numérica',
  url: 'https://music.apple.com/pt/album/1',
  metadados: { codigo_barras: '5603559012125', faixas: [{ titulo: 'Abertura', duracao: '3:12' }, 'Final'], exemplar_papel: 'não pode vir do catálogo' },
})

test('Código de barras de disco ou de livro', () => {
  assert.deepEqual([D5, D6, D7, D9, D10, D11].map((d) => d.ean), ['8447025954123', '5603559012125', '5425004841285', '5600384985082', '5600269839554', '8435383694201'])
  for (const d of [D5, D6, D7, D9, D10, D11]) {
    assert.equal(isbnDoCodigo(d.ean), '')
    assert.deepEqual(d.isbns, [])
  }
  assert.deepEqual([D8, D12, D13].map((d) => d.ean), ['', '', ''])
  assert.equal(LIVRO.ean, '')
  assert.deepEqual(LIVRO.isbns, ['9781858131047'])
  assert.equal(eanDeDisco('9771234567003'), '') // ISSN (revista)
  assert.equal(eanDeDisco('2000000000015'), '') // código interno de uma loja
  assert.equal(eanDeDisco('5603559012126'), '') // dígito de controlo errado
  assert.equal(eanValido('075678164125'), '0075678164125') // UPC-A → EAN-13
})

test('Na raiz: discos saem para os discos, livros para os livros, o resto segue o caminho normal', () => {
  const outra = resumo('/w/paisagem.jpg', [], [{ texto: 'Porto 2024' }])
  const lidas = [D6, D7, LIVRO, D8, outra]
  const ficheiros = lidas.map((l) => l.ficheiro)
  const r = classificarFotografias(ficheiros, lidas, { discos: true })
  assert.deepEqual(r.discos.map((d) => d.ficheiro), ['/w/disco_6.jpg', '/w/disco_7.jpg'])
  assert.equal(r.livros.length, 1)
  assert.deepEqual(r.livros[0].isbns, ['9781858131047'])
  // (na raiz, sem código de barras descodificado não é disco: disco_8 segue o caminho normal)
  assert.deepEqual(r.resto, ['/w/disco_8.jpg', '/w/paisagem.jpg'])
  // Sem tratamento de discos (chamada antiga): os discos ficam no caminho normal
  assert.deepEqual(classificarFotografias(ficheiros, lidas).resto, ['/w/disco_6.jpg', '/w/disco_7.jpg', '/w/disco_8.jpg', '/w/paisagem.jpg'])
  // Um livro fotografado página a página em que uma página tem um código de barras: nada sai do grupo
  const paginas = Array.from({ length: 12 }, (_, i) => resumo(`/w/livro ${i + 1}.jpg`, i === 11 ? ['5603559012125'] : [], []))
  const p = classificarFotografias(paginas.map((l) => l.ficheiro), paginas, { discos: true })
  assert.equal(p.discos.length, 0)
  assert.equal(p.resto.length, 12)
})

test('Pasta Discos: soltas, subpasta (um disco), fora dela', () => {
  // (os caminhos devolvidos usam o separador do sistema: «\\» em Windows)
  const j = (...p) => path.join(...p)
  assert.deepEqual(pastaDoDisco('/w/Discos/IMG_1.jpg', '/w'), { pasta: j('/w', 'Discos'), raiz: j('/w', 'Discos'), solto: true, nome: '' })
  assert.deepEqual(pastaDoDisco('/w/Discos/Segréis de Lisboa/capa.jpg', '/w'), { pasta: j('/w', 'Discos', 'Segréis de Lisboa'), raiz: j('/w', 'Discos'), solto: false, nome: 'Segréis de Lisboa' })
  assert.equal(pastaDoDisco('/w/Discos/Alba/livrete/p1.jpg', '/w').pasta, j('/w', 'Discos', 'Alba'))
  assert.equal(pastaDoDisco('/w/discos/x.jpg', '/w').solto, true)
  assert.equal(pastaDoDisco('/w/x.jpg', '/w'), null)
  assert.equal(pastaDoDisco('/w/Livros/Discos/x.jpg', '/w'), null)
  assert.equal(pastaDoDisco('/outra/Discos/x.jpg', '/w'), null)
  assert.equal(tituloDaPasta('O Alaúde na Península Ibérica'), 'O Alaúde na Península Ibérica')
  assert.equal(tituloDaPasta('IMG_2041'), '')
  assert.equal(tituloDaPasta('Disco 3'), '')
})

test('Algarismos do código de barras só no texto: reconstruir o EAN-13 (disco_12)', () => {
  assert.deepEqual(eansDoTexto(D12.texto), [{ ean: '6417513105223', reconstruido: true, algarismos: '417513 105223' }])
  // (os outros: o código completo do texto, ou o reconstruído, é o mesmo das barras)
  assert.equal(eansDoTexto(D5.texto)[0].ean, D5.ean)
  assert.equal(eansDoTexto(D7.texto)[0].ean, D7.ean)
  assert.equal(eansDoTexto(D7.texto)[0].reconstruido, false)
  assert.equal(eansDoTexto(D9.texto)[0].ean, D9.ean)
  assert.equal(eansDoTexto(D11.texto)[0].ean, D11.ean)
  assert.deepEqual(eansDoTexto(D13.texto), [])
  // (no disco_6 e no disco_10 o leitor partiu os algarismos em duas linhas: não se juntam — as barras deram o código)
  assert.deepEqual(eansDoTexto(D6.texto), [])
  assert.deepEqual(eansDoTexto(D10.texto), [])
  // Só as formas impressas, numa linha: 13 seguidos, 1+6+6, UPC 0+5+5+1, 12 sem o 1.º algarismo
  assert.deepEqual(eansDoTexto('5 603559 012125').map((x) => [x.ean, x.reconstruido]), [['5603559012125', false]])
  assert.deepEqual(eansDoTexto('0 75678 16412 5').map((x) => [x.ean, x.reconstruido]), [['0075678164125', false]])
  assert.deepEqual(eansDoTexto('603559012125').map((x) => [x.ean, x.reconstruido]), [['5603559012125', true]])
  // Nunca: listas de faixas, telefones, códigos LC, ISRC, linhas diferentes, grupos soltos
  const lista = Array.from({ length: 13 }, (_, i) => String(i + 1)).join('\n')
  for (const t of [lista, '1 2 3 4 5 6 7 8 9 0 1 2 5', 'Tel 351 22 123 4567', 'Tel. +351 225 123 456 / 912 345 678', 'LC 05537', 'FIABA2300048-FIABA2300061', '5 603559\n012125', '603559\n012125', '12 603559 012125', '5603559 012125', 'Ref 5603559012125X']) {
    assert.deepEqual(eansDoTexto(t), [], t)
  }
})

test('Código lido no texto (mesmo completo): só se o registo bater com a fotografia; uma só nota', async () => {
  // (13 algarismos seguidos no texto, sem barras descodificadas; o catálogo conhece o código, mas é outro disco)
  const so = resumo('/w/Discos/verso.jpg', [], [{ texto: 'Theoria Poiesis Praxis' }, { texto: '5603559012125' }, { texto: '5600384985082' }])
  const pires = registo({ titulo: 'Piano Sonatas', autores: [{ nome: 'Maria', apelido: 'Pires', papel: 'intérprete' }], data: '1990' })
  const id = await identificar({ fotografias: [so] }, {}, consultas({ codigos: { '5603559012125': pires, '5600384985082': pires } }))
  assert.equal(id.registo, null)
  assert.equal(id.ean, '')
  assert.equal(id.incertos.length, 1)
  const d = decidirDisco({ ...id, capa: { titulo: 'Theoria Poiesis Praxis', interpretes: [], compositores: [] } })
  assert.equal((d.dados.metadados.nota_revisao.match(/que nenhum catálogo confirmou/g) || []).length, 1)
  // (o mesmo código, com um registo que bate com o título da fotografia: aceite)
  const id2 = await identificar({ fotografias: [so] }, {}, consultas({ codigos: { '5603559012125': NUMERICA } }))
  assert.equal(id2.registo, NUMERICA)
  assert.equal(id2.ean, '5603559012125')
  assert.deepEqual(id2.incertos, [])
})

test('Nº de catálogo, ano e suporte no texto da contracapa', () => {
  assert.equal(nCatalogoDoTexto(D6.texto), 'NUM 1212')
  assert.equal(nCatalogoDoTexto(D12.texto), 'ABCD 522')
  for (const d of [D5, D7, D8, D9, D10, D11, D13]) assert.equal(nCatalogoDoTexto(d.texto), '', d.ficheiro)
  assert.equal(nCatalogoDoTexto('BWV 1047\nLC 05537\nDDD'), '')
  assert.equal(nCatalogoDoTexto('Cat. No.: PAS 1028'), 'PAS 1028')
  assert.equal(anoDaCapa(D6.texto), '2010')
  assert.equal(anoDaCapa('℗ & © 1998 Alba Records'), '1998')
  assert.equal(anoDaCapa(D12.texto), '')
  assert.equal(suporteDoTexto(D6.texto), 'CD')
  assert.equal(suporteDoTexto(D13.texto), '')
})

test('Código reconstruído: só com um catálogo que bate com a fotografia', async () => {
  const alba = registo({ titulo: 'Early Italian Harp', autores: [{ nome: 'Virpi', apelido: 'Räisänen', papel: 'intérprete' }], data: '2023', editora: 'Alba', url: 'https://alba/522', metadados: { n_catalogo: 'ABCD 522' } })
  assert.ok(confirmaCodigoIncerto(alba, D12.texto, 'ABCD 522'))
  assert.ok(confirmaCodigoIncerto({ ...alba, metadados: {} }, D12.texto, '')) // (o nome «Virpi» está na fotografia)
  assert.ok(!confirmaCodigoIncerto(registo({ titulo: 'Piano Sonatas', autores: [{ nome: 'Maria', apelido: 'Pires', papel: 'intérprete' }] }), D12.texto, 'ABCD 522'))

  const c = consultas({ codigos: { '6417513105223': alba } })
  const id = await identificar({ fotografias: [D12], raiz: '/w/Discos' }, {}, c)
  assert.equal(id.ean, '6417513105223')
  assert.equal(id.registo, alba)
  const d = decidirDisco(id)
  assert.equal(d.acao, 'nova')
  assert.equal(d.dados.estado, 'completo')
  assert.equal(d.dados.metadados.codigo_barras, '6417513105223')

  // O catálogo encontrou outro disco com esse código: não se usa (e a nota diz o que se leu)
  const outro = registo({ titulo: 'Piano Sonatas', autores: [{ nome: 'Maria', apelido: 'Pires', papel: 'intérprete' }], data: '1990' })
  const id2 = await identificar({ fotografias: [D12] }, {}, consultas({ codigos: { '6417513105223': outro } }))
  assert.equal(id2.registo, null)
  assert.equal(id2.ean, '')
  const d2 = decidirDisco(id2)
  assert.equal(d2.acao, 'por_identificar') // (sem IA nem título)
  const d3 = decidirDisco({ ...id2, capa: { titulo: 'Early Italian Harp Music', interpretes: [], compositores: [] } })
  assert.equal(d3.dados.estado, 'a_rever')
  assert.match(d3.dados.metadados.nota_revisao, /«417513 105223» \(código de barras 6417513105223\?\), que nenhum catálogo confirmou/)
  assert.equal(d3.dados.metadados.codigo_barras, undefined)
})

test('Catálogo pelo código: ficha completa, a capa só completa (nº de catálogo); sem IA', async () => {
  const c = consultas({ codigos: { '5603559012125': NUMERICA }, ia: { '*': { titulo: 'NÃO USAR' } } })
  const id = await identificar({ fotografias: [D6] }, {}, c)
  assert.equal(c.chamadas.ia.length, 0)
  const d = decidirDisco(id)
  assert.equal(d.acao, 'nova')
  assert.equal(d.destino, 'lixo')
  const f = d.dados
  assert.equal(f.titulo, 'Theoria Poiesis Praxis')
  assert.equal(f.estado, 'completo')
  assert.deepEqual(f.tags, [ETIQUETA])
  assert.equal(f.ocr_estado, 'nao_aplicavel')
  assert.equal(f.origem, 'Apple Music')
  assert.equal(f.metadados.codigo_barras, '5603559012125')
  assert.equal(f.metadados.n_catalogo, 'NUM 1212')
  assert.equal(f.metadados.suporte, 'CD')
  assert.equal(f.metadados.publicado, true)
  assert.equal(f.metadados.faixas, '1 Abertura (3:12)\nFinal')
  assert.equal(f.metadados.fotografias_disco, 'disco_6.jpg')
  assert.equal(f.metadados.exemplar_papel, undefined)
  assert.equal(f.metadados.nota_revisao, undefined)
})

test('Catálogo sem a data: por rever, fotografias ligadas à ficha', async () => {
  const semData = registo({ ...NUMERICA, data: '', metadados: { codigo_barras: '5603559012125' } })
  const id = await identificar({ fotografias: [D6] }, {}, consultas({ codigos: { '5603559012125': semData } }))
  const d = decidirDisco(id)
  assert.equal(d.dados.estado, 'a_rever')
  assert.equal(d.destino, 'originais')
  assert.equal(d.pastaOriginais, 'Disco 5603559012125')
  // (a data da linha ℗/© da contracapa preenche, mas a ficha continua por rever: o catálogo não a confirmou)
  assert.equal(d.dados.data, '2010')
  assert.match(d.dados.metadados.nota_revisao, /Apple Music encontrou o disco, mas não diz a data \(a fotografia diz 2010\)/)
})

test('Capa sem código e sem catálogo (disco_13): IA, por rever, intérpretes da capa', async () => {
  const ia = { 'disco_13.jpg': { titulo: 'O Alaúde na Península Ibérica (séc. XV-XXI)', ensemble: 'SEGREIS DE LISBOA', interpretes: [{ nome: 'Manuel Morais', papel: 'maestro' }], compositores: [], editora: '', n_catalogo: '', ano: '', suporte: 'CD' } }
  const c = consultas({ ia })
  const id = await identificar({ fotografias: [D13], raiz: '/w/Discos' }, {}, c)
  assert.equal(c.chamadas.ia.length, 1)
  assert.equal(c.chamadas.texto[0].titulo, 'O Alaúde na Península Ibérica (séc. XV-XXI)')
  assert.equal(c.chamadas.texto[0].artista, 'SEGREIS DE LISBOA, Manuel Morais')
  const d = decidirDisco(id)
  assert.equal(d.acao, 'nova')
  assert.equal(d.destino, 'originais')
  assert.equal(d.dados.estado, 'a_rever')
  assert.equal(d.dados.origem, 'fotografia do disco')
  assert.deepEqual(d.dados.autores, [{ literal: 'Segreis de Lisboa', papel: 'intérprete' }, { nome: 'Manuel', apelido: 'Morais', papel: 'maestro' }])
  assert.match(d.dados.metadados.nota_revisao, /com a IA local/)
  assert.equal(d.pastaOriginais, 'Disco O Alaúde na Península Ibérica (séc. XV-XXI)')
})

// O registo real do Apple Music + Deezer para o disco_13 (testes/fixtures/discos: deezer-5f0831f309, apple-eac4b2f33c)
const ALAUDE = registo({
  fonte: 'Apple Music + Deezer',
  confianca: 0.9,
  titulo: 'O Alaúde na Península Ibérica (Séc. XV-XXI)',
  autores: [{ literal: 'Segréis de Lisboa', papel: 'intérprete' }, { apelido: 'Morais', nome: 'Manuel', papel: 'intérprete' }],
  data: '2023-01-31',
  editora: 'Segréis de Lisboa',
  url: 'https://music.apple.com/pt/album/o-alaude/1671463427',
  metadados: { codigo_barras: '0198015608608', faixas: '1. Fantasia (2:10)' },
})

test('Pelo título: completo só se a fotografia confirmar a edição (editora, ano ℗/© ou nº de catálogo)', async () => {
  const ia = { '*': { titulo: 'A Garden of Black Flowers', ensemble: 'astrophil & stella', interpretes: [{ nome: 'Johanna Bartz', papel: 'maestro' }], compositores: ['Palestrina', 'Bovicelli', 'Bassano'], editora: 'Albus Fair Editions' } }
  const bom = registo({ titulo: 'A Garden of Black Flowers', autores: [{ literal: 'Astrophil & Stella', papel: 'intérprete' }], confianca: 0.9, url: 'https://x/2', data: '2025-04-04', editora: 'Albus' })
  const id = await identificar({ fotografias: [D8] }, {}, consultas({ ia, texto: bom }))
  assert.equal(id.viaTexto, true)
  assert.deepEqual(conferirPeloTexto(id).bate.length, 1) // (a editora «albus | fair editions» da contracapa)
  const d = decidirDisco(id)
  assert.equal(d.dados.estado, 'completo')
  assert.equal(d.destino, 'lixo')
  // (os intérpretes do catálogo; nunca os da IA)
  assert.deepEqual(d.dados.autores, bom.autores)

  // Nada independente na fotografia: os dados do catálogo, mas por rever e com as fotografias guardadas
  const semEditora = { '*': { ...ia['*'], editora: '' } }
  const d2 = decidirDisco(await identificar({ fotografias: [D8] }, {}, consultas({ ia: semEditora, texto: bom })))
  assert.equal(d2.dados.estado, 'a_rever')
  assert.equal(d2.destino, 'originais')
  assert.equal(d2.dados.titulo, 'A Garden of Black Flowers')
  assert.equal(d2.dados.url, 'https://x/2')
  assert.match(d2.dados.metadados.nota_revisao, /Apple Music \(https:\/\/x\/2\) encontrou um disco com este título e intérprete, mas a fotografia não mostra o ano ℗\/©, o nº de catálogo nem a editora/)

  // A fotografia contradiz (℗ 2010 contra 2025): por rever, com o que não bate
  const com2010 = { ...D8, texto: D8.texto + '\n℗ 2010 Albus Fair Editions' }
  const d3 = decidirDisco(await identificar({ fotografias: [com2010] }, {}, consultas({ ia, texto: bom })))
  assert.equal(d3.dados.estado, 'a_rever')
  assert.match(d3.dados.metadados.nota_revisao, /não bate com a fotografia: o ano \(a fotografia diz 2010, o catálogo 2025\)/)
  // (±1 ano conta como certo: ℗ 2024 de uma edição de 2025)
  const com2024 = { ...D8, texto: D8.texto + '\n℗ 2024' }
  assert.equal(decidirDisco(await identificar({ fotografias: [com2024] }, {}, consultas({ ia: semEditora, texto: bom }))).dados.estado, 'completo')
})

test('Pelo título: o código de barras da fotografia (que os catálogos não conhecem) contra o da edição encontrada', async () => {
  const ia = { '*': { titulo: 'A Garden of Black Flowers', ensemble: 'astrophil & stella', interpretes: [], compositores: [], editora: 'Albus Fair Editions' } }
  const outraEdicao = registo({ titulo: 'A Garden of Black Flowers', autores: [{ literal: 'astrophil & stella', papel: 'intérprete' }], url: 'https://www.deezer.com/album/731753931', data: '2025-04-04', editora: 'Albus Fair Editions', metadados: { codigo_barras: '0199199174446' } })
  const verso = { ...D8, codigos: ['5425004841285'], ean: '5425004841285' }
  const id = await identificar({ fotografias: [verso] }, {}, consultas({ ia, texto: outraEdicao }))
  assert.equal(id.ean, '5425004841285')
  const d = decidirDisco(id)
  assert.equal(d.dados.estado, 'a_rever')
  assert.equal(d.destino, 'originais')
  assert.equal(d.dados.metadados.codigo_barras, '5425004841285')
  assert.match(d.dados.metadados.nota_revisao, /a fotografia tem 5425004841285, a edição encontrada 0199199174446/)
  assert.match(d.dados.metadados.nota_revisao, /O código de barras da fotografia \(5425004841285\) fica; o da edição encontrada é 0199199174446/)
})

test('Pelo título, ficha já existente pelo registo: sem confirmação, não se completa nada nem vai para o Lixo', async () => {
  const ia = { '*': { titulo: 'A Garden of Black Flowers', ensemble: 'astrophil & stella', interpretes: [], compositores: [], editora: '' } }
  const bom = registo({ titulo: 'A Garden of Black Flowers', autores: [{ literal: 'astrophil & stella', papel: 'intérprete' }], url: 'https://x/2', data: '2025', editora: 'Albus' })
  const existente = { id: 'g1', numero: 77, titulo: 'A Garden of Black Flowers', tags: [], data: '', editora: '', url: 'https://x/2', autores: [], metadados: { exemplar_papel: 'Estante 2', nota_revisao: 'Antiga.' } }
  const id = await identificar({ fotografias: [D8] }, {}, consultas({ ia, texto: bom, existentes: [existente] }))
  assert.equal(id.existente, existente)
  const d = decidirDisco(id)
  assert.equal(d.acao, 'existente')
  assert.equal(d.fraco, true)
  assert.deepEqual(Object.keys(d.junta).sort(), ['metadados', 'tags'])
  assert.deepEqual(d.junta.tags, [ETIQUETA])
  assert.equal(d.junta.metadados.exemplar_papel, 'Estante 2')
  assert.match(d.junta.metadados.nota_revisao, /^Antiga\. Fotografias de um disco \(disco_8\.jpg\) associadas a esta ficha só pelo título/)
  // (com a editora da fotografia a confirmar: ficha existente normal)
  const id2 = await identificar({ fotografias: [D8] }, {}, consultas({ ia: { '*': { ...ia['*'], editora: 'Albus Fair Editions' } }, texto: bom, existentes: [existente] }))
  const d2 = decidirDisco(id2)
  assert.equal(d2.fraco, false)
  assert.equal(d2.junta.editora, 'Albus')
})

test('disco_13 (O Alaúde): a IA dá o título sem intérpretes → as outras linhas da capa servem de pistas', async () => {
  assert.deepEqual(pistasDoTexto([D13], 'O Alaúde na Península Ibérica (séc. XV-XXI)'), ['Segreis de Lisboa', 'Manuel Morais'])
  const ia = { 'disco_13.jpg': { titulo: 'O Alaúde na Península Ibérica (séc. XV-XXI)', ensemble: '', interpretes: [], compositores: [], editora: '', n_catalogo: '', ano: '', suporte: 'Outro' } }
  const c = consultas({ ia, texto: (q) => (q.artista === 'Segreis de Lisboa, Manuel Morais' ? ALAUDE : null) })
  const id = await identificar({ fotografias: [D13], raiz: '/w/Discos', nome: 'O Alaúde' }, {}, c)
  assert.deepEqual(c.chamadas.texto.map((q) => q.artista), ['Segreis de Lisboa, Manuel Morais'])
  assert.equal(id.registo, ALAUDE)
  const d = decidirDisco(id)
  assert.equal(d.acao, 'nova')
  // (a capa não tem ℗, editora nem nº de catálogo: por rever, com os dados do catálogo e a fotografia guardada)
  assert.equal(d.dados.estado, 'a_rever')
  assert.equal(d.destino, 'originais')
  assert.equal(d.dados.titulo, 'O Alaúde na Península Ibérica (Séc. XV-XXI)')
  assert.equal(d.dados.data, '2023-01-31')
  assert.deepEqual(d.dados.autores, ALAUDE.autores)
  assert.equal(d.dados.metadados.codigo_barras, '0198015608608')
  assert.equal(d.dados.metadados.suporte, 'CD') // (a IA disse «Outro»)
  assert.match(d.dados.metadados.nota_revisao, /Apple Music \+ Deezer \(https:\/\/music\.apple\.com\/pt\/album\/o-alaude\/1671463427\) encontrou um disco com este título/)
  // (se a IA disser que a editora é «Segréis de Lisboa» — o próprio agrupamento, a «editora» do Deezer — não confirma)
  const ia2 = { 'disco_13.jpg': { ...ia['disco_13.jpg'], editora: 'Segréis de Lisboa' } }
  const d2 = decidirDisco(await identificar({ fotografias: [D13] }, {}, consultas({ ia: ia2, texto: () => ALAUDE })))
  assert.equal(d2.dados.estado, 'a_rever')
  // Juntas não deram: uma a uma, no máximo 3 pesquisas
  const c2 = consultas({ ia, texto: () => null })
  await identificar({ fotografias: [D13] }, {}, c2)
  assert.deepEqual(c2.chamadas.texto.map((q) => q.artista), ['Segreis de Lisboa, Manuel Morais', 'Segreis de Lisboa', 'Manuel Morais'])
  // (linhas legais, de suporte, com números ou muito compridas não são pistas)
  const contra = resumo('/w/x.jpg', [], ['O Alaúde', 'Segréis de Lisboa', '℗ 2023 Manuel Morais', 'COMPACT DISC DIGITAL AUDIO', 'LC 05537', '01. Fantasia de Luys Milan', 'Gravado na Igreja de São Roque em Lisboa em 2022', 'NUM 1212', 'Various Artists'].map((texto) => ({ texto })))
  assert.deepEqual(pistasDoTexto([contra], 'O Alaúde'), ['Segréis de Lisboa'])
})

test('disco_12 (Alba): editora tirada de um ISRC e título cortado na borda da fotografia', async () => {
  assert.equal(editoraValida('FIABA', D12.texto), '')
  assert.equal(editoraValida('FIABA2300048', ''), '')
  assert.equal(editoraValida('ABCD 522', D12.texto, 'ABCD 522'), '')
  assert.equal(editoraValida('Alba Records', D12.texto), 'Alba Records')
  assert.equal(editoraValida('Passacaille', ''), 'Passacaille')
  assert.ok(tituloCortado('EARLY IT', [D12]))
  assert.ok(!tituloCortado('O Alaúde na Península Ibérica (séc. XV-XXI)', [D13]))
  assert.ok(!tituloCortado('A Garden of Black Flowers', [D8]))
  const ia = { '*': { titulo: 'EARLY IT', ensemble: '', interpretes: [], compositores: [], editora: 'FIABA', n_catalogo: 'ABCD 522', ano: '', suporte: 'CD' } }
  const c = consultas({ ia })
  const id = await identificar({ fotografias: [D12], raiz: '/w/Discos' }, {}, c)
  assert.equal(id.capa.editora, '')
  assert.equal(id.capa.titulo, '')
  assert.equal(id.tituloCortado, 'EARLY IT')
  assert.equal(c.chamadas.texto.length, 0)
  assert.equal(decidirDisco(id).acao, 'por_identificar')
  // (numa subpasta com nome, o título é o da pasta e a nota diz o que se leu)
  const d = decidirDisco(await identificar({ fotografias: [D12], nome: 'Early Italian Harp' }, {}, consultas({ ia })))
  assert.equal(d.dados.titulo, 'Early Italian Harp')
  assert.equal(d.dados.editora, '')
  assert.match(d.dados.metadados.nota_revisao, /lê-se «EARLY IT», mas parece cortado na borda: o título pode estar incompleto/)
})

test('Suporte: «Outro» da IA não conta (CD), salvo o texto dizer LP / vinil / cassete', async () => {
  const ia = (suporte) => ({ '*': { titulo: 'Theoria Poiesis Praxis', ensemble: 'Ensemble de Aveiro', interpretes: [], compositores: [], suporte } })
  const frente = resumo('/w/Discos/frente.jpg', [], [{ texto: 'Theoria Poiesis Praxis' }])
  const vinil = resumo('/w/Discos/frente.jpg', [], [{ texto: 'Theoria Poiesis Praxis' }, { texto: 'Stereo · Vinyl' }])
  assert.equal(decidirDisco(await identificar({ fotografias: [frente] }, {}, consultas({ ia: ia('Outro') }))).dados.metadados.suporte, 'CD')
  assert.equal(decidirDisco(await identificar({ fotografias: [vinil] }, {}, consultas({ ia: ia('Outro') }))).dados.metadados.suporte, 'LP')
  assert.equal(decidirDisco(await identificar({ fotografias: [frente] }, {}, consultas({ ia: ia('Cassete') }))).dados.metadados.suporte, 'Cassete')
})

test('Data: a que bate com o ano ℗/© da fotografia, entre as datas dos catálogos', async () => {
  const r = registo({ ...NUMERICA, data: '2023-05-01', datas: ['2023-05-01', '2010'] })
  const d = decidirDisco(await identificar({ fotografias: [D6] }, {}, consultas({ codigos: { '5603559012125': r } })))
  assert.equal(d.dados.data, '2010')
  assert.equal(d.dados.metadados.nota_revisao, undefined)
  // (sem nenhuma data desse ano: a do catálogo, com nota)
  const r2 = registo({ ...NUMERICA, data: '2023-05-01' })
  const d2 = decidirDisco(await identificar({ fotografias: [D6] }, {}, consultas({ codigos: { '5603559012125': r2 } })))
  assert.equal(d2.dados.data, '2023-05-01')
  assert.match(d2.dados.metadados.nota_revisao, /A fotografia diz 2010; Apple Music diz 2023-05-01/)
})

test('Ficha existente: um erro da base de dados não é «não há ficha»', async () => {
  const c = consultas({ codigos: { '5603559012125': NUMERICA } })
  c.existente = async () => {
    throw new Error('PocketBase: 400 filtro inválido')
  }
  await assert.rejects(identificar({ fotografias: [D6] }, {}, c), /PocketBase/)
})

test('Já existe uma ficha com este código: só etiqueta e campos vazios (nunca «Onde está o exemplar físico»)', async () => {
  const existente = { id: 'abc', numero: 812, titulo: 'Theoria', tags: ['Ouvir'], data: '', autores: [{ apelido: 'X', papel: 'intérprete' }], editora: '', url: '', metadados: { codigo_barras: '5603559012125', exemplar_papel: 'Estante 3', n_catalogo: '' } }
  const c = consultas({ codigos: { '5603559012125': NUMERICA }, existentes: [existente] })
  const id = await identificar({ fotografias: [D6] }, {}, c)
  const d = decidirDisco(id)
  assert.equal(d.acao, 'existente')
  assert.deepEqual(d.junta.tags, ['Ouvir', ETIQUETA])
  assert.equal(d.junta.data, '2010')
  assert.equal(d.junta.editora, 'Numérica')
  assert.equal(d.junta.autores, undefined)
  assert.equal(d.junta.metadados.exemplar_papel, 'Estante 3')
  assert.equal(d.junta.metadados.n_catalogo, 'NUM 1212')
  assert.equal(d.junta.metadados.codigo_barras, '5603559012125')
  // (com tudo preenchido e a etiqueta, nada a mudar)
  const cheio = { ...existente, tags: [ETIQUETA], data: '2010', editora: 'N', url: 'u', metadados: { codigo_barras: '5603559012125', n_catalogo: 'NUM 1212', faixas: 'x', suporte: 'CD', publicado: true } }
  assert.deepEqual(decidirDisco({ ...id, existente: cheio }).junta, {})
})

test('Na raiz: código não encontrado, sem IA → por identificar', async () => {
  const id = await identificar({ fotografias: [D5] }, {}, consultas())
  assert.equal(id.ean, '8447025954123')
  assert.equal(id.iaEmFalta, true)
  assert.equal(decidirDisco(id).acao, 'por_identificar')
  // (numa subpasta com nome informativo, o nome da pasta serve de título, por rever)
  const id2 = await identificar({ fotografias: [D5], nome: 'Bach Suites Savall' }, {}, consultas())
  const d2 = decidirDisco(id2)
  assert.equal(d2.dados.titulo, 'Bach Suites Savall')
  assert.equal(d2.dados.estado, 'a_rever')
  assert.equal(d2.dados.metadados.codigo_barras, '8447025954123')
  assert.match(d2.dados.metadados.nota_revisao, /nome da pasta/)
})

test('Fotografias soltas do mesmo disco: mesmo EAN, mesmo registo ou mesmo título + intérprete', async () => {
  const frente = resumo('/w/Discos/frente.jpg', [], [{ texto: 'Theoria Poiesis Praxis' }])
  const verso = { ...D6, ficheiro: '/w/Discos/verso.jpg' }
  const repetida = { ...D6, ficheiro: '/w/Discos/verso2.jpg' }
  assert.deepEqual(agruparPorEan([frente, verso, repetida, D7]).map((g) => g.fotografias.length), [1, 2, 1])
  const c = consultas({
    codigos: { '5603559012125': NUMERICA },
    ia: { 'frente.jpg': { titulo: 'Theoria Poiesis Praxis', ensemble: 'Ensemble de Aveiro', interpretes: [], compositores: [] }, '*': {} },
    texto: (q) => (q.titulo === 'Theoria Poiesis Praxis' ? { ...NUMERICA, confianca: 0.9 } : null),
  })
  const ids = []
  for (const g of agruparPorEan([frente, verso, repetida, D7])) ids.push(await identificar(g, {}, c))
  const discos = juntarIdentificados(ids)
  assert.equal(discos.length, 2)
  const um = discos.find((d) => d.fotografias.length === 3)
  assert.equal(um.ean, '5603559012125')
  assert.equal(um.viaTexto, false) // (o registo pelo código ganha)
  assert.deepEqual(um.fotografias.map((f) => f.ficheiro.split('/').pop()).sort(), ['frente.jpg', 'verso.jpg', 'verso2.jpg'])
  // Só título + intérprete em comum (sem catálogo): também se juntam
  const a = { fotografias: [D13], capa: { titulo: 'O Alaúde', ensemble: 'Segréis de Lisboa', interpretes: [], compositores: [] }, incertos: [] }
  const b = { fotografias: [{ ...D13, ficheiro: '/w/Discos/b.jpg' }], capa: { titulo: 'O ALAÚDE', ensemble: 'SEGREIS DE LISBOA', interpretes: [{ nome: 'Manuel Morais', papel: 'maestro' }], compositores: [] }, incertos: [] }
  const j = juntarIdentificados([a, b])
  assert.equal(j.length, 1)
  assert.equal(j[0].capa.interpretes.length, 1)
})

test('Duas edições diferentes com o mesmo título e intérprete não se juntam (Glenn Gould, Goldberg Variations)', () => {
  const gould = (ean, url) => ({
    fotografias: [resumo(`/w/Discos/${ean}.jpg`, [], [])],
    ean,
    registo: registo({ titulo: 'Bach: The Goldberg Variations', autores: [{ nome: 'Glenn', apelido: 'Gould', papel: 'intérprete' }], url, data: '1982', metadados: { codigo_barras: ean } }),
    viaTexto: false,
    incertos: [],
  })
  const a = gould('0074646014921', 'https://music.apple.com/album/1981')
  const b = gould('0074643730121', 'https://music.apple.com/album/1955')
  assert.equal(juntarIdentificados([a, b]).length, 2)
  // (o mesmo código: um só disco; uma capa sem código nem registo, com o mesmo título e intérprete, serve aos dois:
  // não se junta a nenhum; com um só, junta-se)
  const capa = { fotografias: [resumo('/w/Discos/capa.jpg', [], [])], capa: { titulo: 'Bach: The Goldberg Variations', interpretes: [{ nome: 'Glenn Gould', papel: 'intérprete' }], compositores: [] }, incertos: [] }
  const j = juntarIdentificados([a, b, { ...a, fotografias: [resumo('/w/Discos/outra.jpg', [], [])] }, capa])
  assert.deepEqual(j.map((x) => x.fotografias.length).sort(), [1, 1, 2])
  assert.deepEqual(juntarIdentificados([a, capa]).map((x) => x.fotografias.length), [2])
  // (registos diferentes sem código de barras também não)
  const semCodigo = (url) => ({ ...gould('', url), ean: '', registo: { ...gould('', url).registo, metadados: {} } })
  assert.equal(juntarIdentificados([semCodigo('https://x/1'), semCodigo('https://x/2')]).length, 2)
})

test('«Various Artists» / «Vários» não é intérprete', () => {
  assert.deepEqual(autoresDaCapa({ ensemble: 'Various Artists', interpretes: [{ nome: 'Vários', papel: 'intérprete' }, { nome: 'Maria João Pires', papel: 'intérprete' }], compositores: [] }), [{ apelido: 'Pires', nome: 'Maria João', papel: 'intérprete' }])
})

test('Livro fotografado página a página com códigos de barras de discos: a ficha técnica (ISBN) não sai do grupo', () => {
  // (como antes dos discos: só as páginas com ISBN contam para a protecção do livro)
  const paginas = Array.from({ length: 12 }, (_, i) => resumo(`/w/livro ${i + 1}.jpg`, i >= 8 ? [['5603559012125', '5425004841285', '5600384985082', '8447025954123'][i - 8]] : [], i === 2 ? [{ texto: 'ISBN 1-85813-104-9' }] : []))
  const p = classificarFotografias(paginas.map((l) => l.ficheiro), paginas, { discos: true })
  assert.equal(p.livros.length, 0)
  assert.equal(p.discos.length, 0)
  assert.equal(p.resto.length, 12)
})

test('IA: a capa primeiro, no máximo 3 fotografias', () => {
  const f = (n, ean = '', texto = '') => ({ ficheiro: `/w/Discos/x/${n}`, ean, texto })
  const escolha = escolherParaIA([f('verso.jpg', '5603559012125', 'muito texto aqui'), f('livrete 2.jpg', '', 'abc'), f('capa.jpg'), f('livrete 1.jpg', '', 'abcdef'), f('contracapa.jpg', '', 'x')])
  assert.deepEqual(escolha.map((x) => x.ficheiro.split('/').pop()), ['capa.jpg', 'livrete 1.jpg', 'livrete 2.jpg'])
  assert.deepEqual(autoresDaCapa({ interpretes: [{ nome: 'Orquestra Gulbenkian', papel: 'intérprete' }], compositores: [] }), [{ literal: 'Orquestra Gulbenkian', papel: 'intérprete' }])
})
