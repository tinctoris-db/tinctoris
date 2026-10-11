// Testes sem internet da folha do JSTOR, do DOI cortado e da «versão do autor» (5/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// As folhas são as das fichas reais indicadas (#0470, #13984, #17047, #56, #13), copiadas da 1.ª página do PDF.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analisarJstor, lerReferenciaRevista } from '../src/capa.js'
import { encontrarDoi } from '../src/extracao.js'
import { pistasDoNome, versaoDoAutor } from '../src/musica_antiga.js'

const b470 = `FRANCESCO BARSANTI AND THE LURE OF NATIONAL SONG
Author(s): Michael Talbot
Source: Il Saggiatore musicale , 2015, Vol. 22, No. 1 (2015), pp. 33-59
Published by: Casa Editrice Leo S. Olschki s.r.l.
Stable URL: https://www.jstor.org/stable/24642713
JSTOR is a not-for-profit service that helps scholars, researchers, and students discover, use, and build upon a wide`

test('#0470: folha inteira, sem DOI inventado, maiúsculas dos nomes próprios pelo texto', () => {
  const j = analisarJstor(b470, 'Francesco Barsanti (1690-1772) … Barsanti was … the lure of the tune … Barsanti')
  assert.equal(j.titulo, 'Francesco Barsanti and the lure of national song')
  assert.deepEqual(j.autores.map((a) => a.apelido), ['Talbot'])
  assert.deepEqual([j.revista, j.volume, j.numero, j.paginas, j.ano], ['Il Saggiatore musicale', '22', '1', '33-59', '2015'])
  assert.equal(j.editora, 'Casa Editrice Leo S. Olschki s.r.l.')
  assert.equal(j.doi, '')
  assert.equal(j.doiPossivel, '10.2307/24642713')
  assert.equal(j.url, 'https://www.jstor.org/stable/24642713')
  assert.equal(j.recensao, false)
  assert.equal(j.completo, true)
})

test('#13984: recensão = artigo do recenseador, com a obra recenseada à parte', () => {
  const j = analisarJstor(`British Forum for Ethnomusicology

Review: [untitled]
Author(s): Neil Sorrell
Reviewed work(s):
Music of Afghanistan. Professional Musicians in the City of Herat by John Baily
Source: British Journal of Ethnomusicology, Vol. 1 (1992), pp. 147-148
Published by: British Forum for Ethnomusicology
Stable URL: http://www.jstor.org/stable/3060734`)
  assert.equal(j.recensao, true)
  assert.equal(j.titulo, 'Review of: Music of Afghanistan. Professional Musicians in the City of Herat by John Baily')
  assert.deepEqual(j.autores.map((a) => a.apelido), ['Sorrell'])
  assert.deepEqual(j.recensaoDe, ['Music of Afghanistan. Professional Musicians in the City of Herat by John Baily'])
  assert.deepEqual([j.revista, j.volume, j.paginas, j.ano], ['British Journal of Ethnomusicology', '1', '147-148', '1992'])
})

test('#17047 e #56: recensões no formato «Review by:» (sem «Source:» e com linhas partidas)', () => {
  const a = analisarJstor(`Mensuration and Proportion Signs: Origins and Evolution. (Oxford Monographs on Music) by
Anna Maria Busse Berger
Review by: Sally E. Norman
Fontes Artis Musicae, Vol. 41, No. 1 (January-March 1994), pp. 134-136
Published by: International Association of Music Libraries, Archives, and Documentation Centres
(IAML)

Stable URL: http://www.jstor.org/stable/23508322 .`)
  assert.deepEqual(a.autores.map((x) => x.apelido), ['Norman'])
  assert.deepEqual(a.recensaoDe, ['Mensuration and Proportion Signs: Origins and Evolution. (Oxford Monographs on Music) by Anna Maria Busse Berger'])
  assert.deepEqual([a.revista, a.volume, a.numero, a.ano], ['Fontes Artis Musicae', '41', '1', '1994'])
  const b = analisarJstor(`Council for Research in Music Education

Review
Reviewed Work(s): Does Practice Make Perfect?: Current Theory and Research on
Instrumental Music Practice by Harald Jorgensen and Andreas C. Lehmann
Review by: Harold E. Fiske
Source: Bulletin of the Council for Research in Music Education, No. 139 (Winter, 1999),
pp. 78-83
Published by: University of Illinois Press on behalf of the Council for Research in Music
Education
Stable URL: https://www.jstor.org/stable/40318953`)
  assert.deepEqual(b.recensaoDe, ['Does Practice Make Perfect?: Current Theory and Research on Instrumental Music Practice by Harald Jorgensen and Andreas C. Lehmann'])
  assert.deepEqual(b.autores.map((x) => x.apelido), ['Fiske'])
  assert.deepEqual([b.revista, b.numero, b.paginas, b.ano], ['Bulletin of the Council for Research in Music Education', '139', '78-83', '1999'])
  assert.equal(b.editora, 'University of Illinois Press')
})

test('#13: o nome da sociedade por cima do título não entra no título', () => {
  const j = analisarJstor(`Music Teachers National Association

Motivating Through Creative Play: Empowering Young Students To Practice Successfully
Author(s): Pamela D. Pike
Source: American Music Teacher, Vol. 63, No. 5 (April/May 2014), pp. 12-17
Published by: Music Teachers National Association
Stable URL: https://www.jstor.org/stable/43540342`)
  assert.equal(j.titulo, 'Motivating Through Creative Play: Empowering Young Students To Practice Successfully')
})

test('referência da revista: estações e meses não fazem parte do nome', () => {
  assert.equal(lerReferenciaRevista('Journal of the American Musicological Society, Summer, 1997, Vol. 50, No. 2 (Summer, 1997), pp. 1-20').revista, 'Journal of the American Musicological Society')
  assert.equal(lerReferenciaRevista('Revista de Musicología , Julio de 2009, Vol. 32, No. 2 (Julio de 2009), pp. 35-49').revista, 'Revista de Musicología')
})

test('#0488: DOI cortado na mudança de linha fica o completo', () => {
  assert.equal(encontrarDoi('PLoS ONE 11(7): e0158684. doi:10.1371/journal.\nAbstract\nPLOS ONE | DOI:10.1371/journal.pone.0158684 July 6, 2016'), '10.1371/journal.pone.0158684')
  assert.equal(encontrarDoi('DOI: 10.1080/17411910802405636'), '10.1080/17411910802405636')
})

test('#17098: «accepted manuscript» é a versão do autor de um artigo, não um manuscrito', () => {
  assert.equal(pistasDoNome('oup-accepted-manuscript-2019.pdf').forma, '')
  assert.equal(versaoDoAutor('oup-accepted-manuscript-2019.pdf'), true)
  assert.equal(versaoDoAutor('P-Cug_MM243 manuscrito.pdf'), false)
  assert.equal(pistasDoNome('P-Cug_MM243 manuscrito.pdf').forma, 'manuscrito')
})
