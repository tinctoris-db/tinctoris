// Livros em papel a partir de fotografias do ISBN / ficha técnica (10/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// As linhas abaixo são o que o leitor da Apple (ferramentas/ler_imagem.swift) leu em três fotografias REAIS enviadas
// pelo Pedro: a página de direitos de uma tese de Utrecht (2019), a ficha técnica do «Elogio da Loucura» (Sporpress,
// 2003) e o código de barras de uma edição de Shakespeare (Parragon, 1993).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encontrarIsbn, todosOsIsbn, isbn13, isbn10, isbnDoCodigo } from '../src/extracao.js'
import { dadosDaFichaTecnica, agruparPorLivro, protegerGrupos, limparEditora, semMaiusculas, pareceNome } from '../src/referencias.js'

const FOTOS = [{"codigos": [], "linhas": [{"texto": "Proefs", "x": 0.717, "y": 0.001, "w": 0.016, "h": 0.032}, {"texto": "© copyright Dina Maria de Oliveira Titan, Utrecht 2019", "x": 0.43, "y": 0.413, "w": 0.03, "h": 0.294}, {"texto": "Printing: ProefschriftMaken || www.proefschriftmaken.nl", "x": 0.389, "y": 0.408, "w": 0.027, "h": 0.298}, {"texto": "ISBN 978-94-6380-234-5", "x": 0.351, "y": 0.571, "w": 0.021, "h": 0.137}, {"texto": "All rights reserved. No part of this publication may be reproduced, stored in a retrieval system", "x": 0.294, "y": 0.229, "w": 0.035, "h": 0.479}, {"texto": "or transmitted, in any form or by any means, electronic, mechanical, photocopying, recording", "x": 0.272, "y": 0.229, "w": 0.034, "h": 0.48}, {"texto": "or otherwise, without prior permission of the author or the copyright-owning journals for", "x": 0.251, "y": 0.229, "w": 0.034, "h": 0.48}, {"texto": "previous published chapters.", "x": 0.24, "y": 0.562, "w": 0.024, "h": 0.147}]}, {"codigos": [], "linhas": [{"texto": "Título em inglês", "x": 0.19, "y": 0.589, "w": 0.145, "h": 0.018}, {"texto": "Título em português", "x": 0.157, "y": 0.563, "w": 0.179, "h": 0.02}, {"texto": "Autor", "x": 0.283, "y": 0.545, "w": 0.052, "h": 0.015}, {"texto": "Tradução e Notas", "x": 0.178, "y": 0.519, "w": 0.157, "h": 0.018}, {"texto": "Editor", "x": 0.275, "y": 0.498, "w": 0.058, "h": 0.015}, {"texto": "E-mail", "x": 0.266, "y": 0.403, "w": 0.064, "h": 0.015}, {"texto": "Concepção de capa", "x": 0.155, "y": 0.376, "w": 0.173, "h": 0.019}, {"texto": "Fotolito", "x": 0.254, "y": 0.353, "w": 0.074, "h": 0.017}, {"texto": "Impressão", "x": 0.23, "y": 0.326, "w": 0.096, "h": 0.022}, {"texto": "e acabamento", "x": 0.199, "y": 0.303, "w": 0.126, "h": 0.02}, {"texto": "Depósito Legal", "x": 0.185, "y": 0.275, "w": 0.14, "h": 0.026}, {"texto": "ISBN", "x": 0.267, "y": 0.256, "w": 0.056, "h": 0.017}, {"texto": "1ª edição", "x": 0.234, "y": 0.224, "w": 0.09, "h": 0.028}, {"texto": "Praise of Folly", "x": 0.37, "y": 0.59, "w": 0.142, "h": 0.018}, {"texto": "Elogio da Loucura", "x": 0.37, "y": 0.565, "w": 0.176, "h": 0.018}, {"texto": "Erasmo de Roterdão", "x": 0.37, "y": 0.545, "w": 0.19, "h": 0.015}, {"texto": "Fernando Dias Antunes", "x": 0.368, "y": 0.522, "w": 0.223, "h": 0.015}, {"texto": "SPORPRESS - Soc. Editorial e Distribuidora, Lda.", "x": 0.368, "y": 0.491, "w": 0.481, "h": 0.02}, {"texto": "Rua António Silva, 2-B", "x": 0.366, "y": 0.469, "w": 0.225, "h": 0.019}, {"texto": "2725-171 MEM-MARTINS - PORTUGAL", "x": 0.364, "y": 0.445, "w": 0.413, "h": 0.021}, {"texto": "Tel. 21 920 88 12 / FAX: 21 920 88 12", "x": 0.364, "y": 0.422, "w": 0.376, "h": 0.019}, {"texto": "sporpress@iol.pt", "x": 0.362, "y": 0.397, "w": 0.165, "h": 0.019}, {"texto": "Gabinete gráfico da SPORPRESS", "x": 0.362, "y": 0.372, "w": 0.333, "h": 0.02}, {"texto": "CA - Artes Gráficas, Lda.", "x": 0.362, "y": 0.343, "w": 0.255, "h": 0.025}, {"texto": "SIG - Soc. Industrial Gráfica, Lda.", "x": 0.36, "y": 0.293, "w": 0.344, "h": 0.025}, {"texto": "197999/03", "x": 0.36, "y": 0.275, "w": 0.107, "h": 0.018}, {"texto": "972-8696-08-6", "x": 0.358, "y": 0.248, "w": 0.146, "h": 0.02}, {"texto": "Agosto-2003", "x": 0.359, "y": 0.224, "w": 0.124, "h": 0.019}]}, {"codigos": ["9781858131047"], "linhas": [{"texto": "he greatest tower ass prose", "x": 0.958, "y": 0.458, "w": 0.048, "h": 0.543}, {"texto": "se which has ever been known.", "x": 0.916, "y": 0.549, "w": 0.05, "h": 0.451}, {"texto": "lustration courtesy Bridgeman Art Library", "x": 0.609, "y": 0.594, "w": 0.039, "h": 0.406}, {"texto": "ISBN 1-85813-104-9", "x": 0.578, "y": 0.433, "w": 0.023, "h": 0.218}, {"texto": "781858 131047>", "x": 0.322, "y": 0.411, "w": 0.037, "h": 0.233}]}]
const [TESE, ELOGIO, SHAKESPEARE] = FOTOS
const texto = (f) => f.linhas.map((l) => l.texto).join('\n')

test('ISBN: «ISBN» e o número em linhas diferentes (ficha técnica em duas colunas)', () => {
  assert.equal(encontrarIsbn(texto(ELOGIO)), '')
  assert.equal(encontrarIsbn(texto(ELOGIO), { solto: true }), '9728696086')
  assert.deepEqual(todosOsIsbn(texto(ELOGIO)), ['9789728696085'])
  assert.deepEqual(todosOsIsbn(texto(TESE)), ['9789463802345'])
  // (um número com hífenes sem a palavra ISBN no texto não conta)
  assert.deepEqual(todosOsIsbn('Depósito Legal\n972-8696-08-6'), [])
})

test('ISBN: código de barras, ISBN-10 ↔ 13', () => {
  assert.equal(isbnDoCodigo(SHAKESPEARE.codigos[0]), '9781858131047')
  assert.equal(isbnDoCodigo('5601234567890'), '') // EAN de um produto, não de um livro
  assert.equal(isbn13('1-85813-104-9'), '9781858131047')
  assert.equal(isbn10('9781858131047'), '1858131049')
  assert.equal(isbn10('9789728696085'), '9728696086')
  assert.equal(isbn13('1-85813-104-8'), '') // dígito de controlo errado
})

test('Ficha técnica com rótulos (Elogio da Loucura)', () => {
  const d = dadosDaFichaTecnica(ELOGIO.linhas)
  assert.equal(d.titulo, 'Elogio da Loucura')
  assert.equal(d.titulo_original, 'Praise of Folly')
  assert.deepEqual(d.autores.map((a) => [a.nome, a.apelido, a.papel]), [
    ['Erasmo', 'de Roterdão', 'autor'],
    ['Fernando Dias', 'Antunes', 'tradutor'],
  ])
  assert.equal(d.editora, 'Sporpress')
  assert.equal(d.local, 'Mem-Martins')
  assert.equal(d.ano, '2003')
  assert.equal(d.edicao, '1ª edição')
})

test('Página de direitos de uma tese, fotografada de lado (© Nome, Cidade Ano)', () => {
  const d = dadosDaFichaTecnica(TESE.linhas)
  assert.equal(d.titulo, '')
  assert.deepEqual(d.autores.map((a) => [a.nome, a.apelido]), [['Dina Maria de Oliveira', 'Titan']])
  assert.equal(d.local, 'Utrecht')
  assert.equal(d.ano, '2019')
})

test('Contracapa só com o código de barras: nada para além do ISBN', () => {
  const d = dadosDaFichaTecnica(SHAKESPEARE.linhas)
  assert.equal(d.titulo, '')
  assert.equal(d.autores.length, 0)
})

test('Fotografias do mesmo livro (algum ISBN em comum) fazem uma só ficha; o do código de barras vem primeiro', () => {
  const f = (ficheiro, isbns, codigo = '') => ({ ficheiro, isbns, codigo })
  const livros = agruparPorLivro([f('a.jpg', ['9780198162919', '9780198162926']), f('b.jpg', ['9789728696085']), f('c.jpg', ['9780198162926'], '9780198162926')])
  assert.equal(livros.length, 2)
  const um = livros.find((l) => l.fotografias.length === 2)
  assert.equal(um.isbns[0], '9780198162926')
})

test('Livro fotografado página a página: a ficha técnica não sai do grupo', () => {
  const paginas = Array.from({ length: 12 }, (_, i) => `/w/livro ${i + 1}.jpg`)
  assert.equal(protegerGrupos(paginas, ['/w/livro 2.jpg']).size, 0)
  // (fotografias de ISBN de vários livros, todas com nomes da câmara: saem)
  const img = Array.from({ length: 6 }, (_, i) => `/w/IMG_${1000 + i}.jpg`)
  assert.equal(protegerGrupos(img, img).size, 6)
  assert.equal(protegerGrupos(['/w/IMG_1.jpg', '/w/IMG_2.jpg'], ['/w/IMG_2.jpg']).size, 1)
})

test('Limpezas: editora, maiúsculas, nomes', () => {
  assert.equal(limparEditora('SPORPRESS - Soc. Editorial e Distribuidora, Lda.'), 'Sporpress')
  assert.equal(limparEditora('Edições Afrontamento, Lda.'), 'Edições Afrontamento')
  assert.equal(semMaiusculas('MEM-MARTINS'), 'Mem-Martins')
  assert.equal(semMaiusculas('LISBOA DA SILVA'), 'Lisboa da Silva')
  assert.equal(semMaiusculas('Utrecht'), 'Utrecht')
  assert.ok(pareceNome('Dina Maria de Oliveira Titan'))
  assert.ok(!pareceNome('Oxford University Press'))
  assert.ok(!pareceNome('Sporpress'))
})
