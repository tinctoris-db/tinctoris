// Testes da Bach-Gesellschaft-Ausgabe (bga.js), sem internet. Correr: cd app/worker && node --test testes/*.js
// Nomes de ficheiros, títulos dos PDFs (pdfinfo) e excertos de OCR são REAIS (fichas da biblioteca, 17/10/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconhecerBga, bandasDoBwv, bandaBate, volumeBga, rodapesBga, rodapeBate, bwvDoNome, catalogoEVolume, tituloDeCabecalho, tituloDoNomeBga, deRomano, paraRomano, BACH } from '../src/bga.js'

// Colecção espanhola de 2004 (pdfinfo: Author «.», Producer «Acrobat Distiller 5.0 (Windows)»)
const ESP = { pdfAutor: '.', produtor: 'Acrobat Distiller 5.0 (Windows)' }

test('tabela dos volumes: anos plausíveis (1851–1899 e 1926) e editores', () => {
  for (let j = 1; j <= 47; j++) {
    const v = volumeBga(j)
    assert.ok(v, `Jahrgang ${j}`)
    assert.ok((v.ano >= 1851 && v.ano <= 1899) || (j === 47 && v.ano === 1926), `ano ${v.ano} do Jahrgang ${j}`)
  }
  assert.equal(volumeBga(1).ano, 1851)
  assert.equal(volumeBga(28).ano, 1881)
  assert.deepEqual(volumeBga(28).editores, ['Rust'])
  assert.equal(volumeBga('5_2').titulo, 'Weihnachts-Oratorium')
  assert.equal(volumeBga('13').anos, '1864–1865')
  assert.equal(volumeBga(46).ano, 1899)
})

test('BWV → volume', () => {
  assert.deepEqual(bandasDoBwv('4'), ['1'])
  assert.deepEqual(bandasDoBwv('33'), ['7']) // cantata nº 33 está no Jahrgang 7 (31–40)
  assert.deepEqual(bandasDoBwv('203'), ['11_2'])
  assert.deepEqual(bandasDoBwv('34a'), ['41'])
  assert.deepEqual(bandasDoBwv('36c'), ['34'])
  assert.deepEqual(bandasDoBwv('870'), ['14'])
  assert.deepEqual(bandasDoBwv('903'), ['36'])
  assert.deepEqual(bandasDoBwv('972'), ['42'])
  assert.deepEqual(bandasDoBwv('588'), ['38'])
  assert.deepEqual(bandasDoBwv('1009'), ['27_1'])
  assert.deepEqual(bandasDoBwv('1051'), ['19'])
  assert.deepEqual(bandasDoBwv('1079'), ['31_2'])
  assert.deepEqual(bandasDoBwv('200'), []) // descoberta em 1924: não está na BGA
  assert.ok(bandaBate('11', ['11_2']))
  assert.ok(bandaBate('20', ['20_1']))
  assert.ok(!bandaBate('1', ['7']))
})

test('números BWV no nome do ficheiro', () => {
  assert.deepEqual(bwvDoNome('Brandemburgo nº 6 en Sib M BWV 1051 copia.pdf').lista, ['1051'])
  assert.deepEqual(bwvDoNome('k. Preludio (fantasia) en do m BWB 921 (dudoso) .pdf').lista, ['921'])
  assert.deepEqual(bwvDoNome('Preludio y fuga n  17 en Lab M BEV 886.pdf').lista, ['886'])
  assert.deepEqual(bwvDoNome('1. Preludio y fuga en La menor bwv 894.pdf').lista, ['894'])
  assert.deepEqual(bwvDoNome('cantata nº 04.pdf').lista, ['4'])
  assert.deepEqual(bwvDoNome('Cantrata nº 212.pdf').lista, ['212'])
  assert.deepEqual(bwvDoNome('Cantata nº 036a y 36c.pdf').lista, ['36a', '36c'])
  assert.deepEqual(bwvDoNome('Cantata nº 106 Actus Tragicus.pdf').lista, ['106'])
  assert.deepEqual(bwvDoNome('za.Organo, Sechs Choräle BWV 645-650').intervalo, [645, 650])
  assert.deepEqual(bwvDoNome('Bach_-_BGA_-_BWV_1045.pdf').lista, ['1045'])
  assert.equal(bwvDoNome('jsbtrsn3.pdf'), null)
})

test('nº de catálogo que é o volume da BGA e rodapés «B. W.»', () => {
  for (const c of ['BWV XXIX', 'B.W. XXXVIII.', 'B. W. XXXVII.', 'B.W.V.XXVI.', 'BWV XV']) assert.ok(catalogoEVolume(c), c)
  assert.ok(!catalogoEVolume('BWV 1051'))
  // OCR real de #7808 (BWV 1006): «B. W. XXVII. (4)», «B.W. XXVIL (D.», «BW. XXVII.»
  assert.deepEqual(rodapesBga('[p. 1] 48  PARTITA III.  Preludio. EL 2 Arey E Ce ri zus  B. W. XXVII. (4)  [p. 5] (1)  BW. XXVII.'), ['XXVII', 'XXVII'])
  assert.deepEqual(rodapesBga('Concerto BWV 1051 in B'), [])
  assert.equal(rodapeBate('XXVII', 27), 'certo')
  assert.equal(rodapeBate('XXVIII', 27), 'certo') // (o ponto final lido como «I»: #7803, BWV 1001)
  assert.equal(rodapeBate('XX', 25), 'parcial') // (#1177, BWV 650: «B.W. XX»)
  assert.equal(rodapeBate('XXX', 27), '')
  assert.equal(deRomano('XXXVIII'), 38)
  assert.equal(paraRomano(44), 'XLIV')
})

test('volumes inteiros pelo nome', () => {
  const v = reconhecerBga({ nome: 'BGA Band 02.pdf', titulo: "Johann Sebastian Bach's Werke" })
  assert.equal(v.tipo, 'volume')
  assert.equal(v.banda, '2')
  assert.equal(v.campos.tipoNome, 'Edição crítica')
  assert.equal(v.campos.data, '1852')
  assert.equal(v.campos.titulo, "Johann Sebastian Bach's Werke, Jahrgang 2: Kirchencantaten, Band 2 (BWV 11–20)")
  assert.equal(v.campos.editora, 'Breitkopf & Härtel')
  assert.equal(v.campos.local, 'Leipzig')
  assert.deepEqual(v.campos.autores, [BACH, { apelido: 'Hauptmann', nome: 'Moritz', papel: 'editor' }])
  assert.ok(v.completa)
  assert.equal(reconhecerBga({ nome: 'BGA Band 05_1.pdf' }).banda, '5_1')
  assert.equal(reconhecerBga({ nome: 'BGA Band 04 paixao segundo s mateus.pdf' }).campos.data, '1854')
  assert.equal(reconhecerBga({ nome: 'BGA Band 45_2.pdf' }).campos.data, '1898')
  const s = reconhecerBga({ nome: 'BGA Supplement.pdf', titulo: 'Bachs "Kunst der Fuge"' })
  assert.equal(s.banda, '47')
  assert.equal(s.campos.data, '1926')
  assert.equal(s.campos.autores[1].apelido, 'Graeser')
  const f = reconhecerBga({ nome: 'BGA Band 44 - manuscritos.pdf' })
  assert.equal(f.campos.tipoNome, 'Edição crítica')
  assert.match(f.notas.join(' '), /fac-símiles/)
  // #1157: «Brandenburg.1-6.pdf», a IA leu «Johann Sebastian Bach's Werke» na folha de rosto → Jahrgang 19
  const b = reconhecerBga({ nome: 'Brandenburg.1-6.pdf', titulo: "Johann Sebastian Bach's Werke" })
  assert.equal(b.banda, '19')
  assert.equal(b.campos.data, '1871')
  assert.equal(reconhecerBga({ nome: 'Brandenburg.1-6.pdf', titulo: 'Brandenburg Concertos' }), null)
})

test('extractos da colecção espanhola com «BGA BAND NN» no título do PDF', () => {
  // #2436: «cantata nº 04.pdf» (RISM tinha dado o manuscrito D-LEb de BWV 1)
  const r = reconhecerBga({ nome: 'cantata nº 04.pdf', pdfTitulo: 'BGA BAND 01.PDF', ...ESP, titulo: 'Christ lag in Todesbanden', catalogo: ['BWV 1'] })
  assert.equal(r.tipo, 'extracto')
  assert.equal(r.banda, '1')
  assert.deepEqual(r.bwv, ['4'])
  assert.equal(r.campos.metadados.catalogo, 'BWV 4')
  assert.equal(r.campos.data, '1851')
  assert.equal(r.campos.tipoNome, 'Partitura')
  assert.equal(r.campos.metadados.colecao, "Johann Sebastian Bach's Werke (Bach-Gesellschaft), Jahrgang 1")
  assert.equal(r.campos.metadados.conteudo_tipo, 'Peça de uma colecção')
  assert.ok(r.completa)
  // «BGA BAND 11» + cantata 203 → Jahrgang 11.2 (1862)
  const c = reconhecerBga({ nome: 'Cantata nº 203.pdf', pdfTitulo: 'BGA BAND 11.PDF', ...ESP })
  assert.equal(c.banda, '11_2')
  assert.equal(c.campos.data, '1862')
  // #2429: «Cantata nº 210a.pdf» no Jahrgang 29, catálogo «BWV XXIX» (o volume)
  const a = reconhecerBga({ nome: 'Cantata nº 210a.pdf', pdfTitulo: 'BGA BAND 29.PDF', ...ESP, catalogo: ['BWV XXIX'] })
  assert.equal(a.campos.metadados.catalogo, 'BWV 210a')
  assert.ok(a.completa)
  // #2451: «Cantata nº 34a.pdf» está no Jahrgang 41
  assert.ok(reconhecerBga({ nome: 'Cantata nº 34a.pdf', pdfTitulo: 'BGA BAND 41.PDF', ...ESP }).completa)
  // #1934: Oster-Oratorium no Jahrgang 21 (Open Library tinha dado uma edição de 1955)
  const o = reconhecerBga({ nome: 'Oster Oratorium BWV 249.pdf', pdfTitulo: 'BGA BAND 21.PDF', ...ESP })
  assert.equal(o.banda, '21_3')
  assert.equal(o.campos.data, '1874')
})

test('BWV que não pertence ao volume do PDF → por rever', () => {
  // (caso construído com o título real «BGA BAND 01.PDF»: cantata 33 é do Jahrgang 7)
  const r = reconhecerBga({ nome: 'cantata nº 33.pdf', pdfTitulo: 'BGA BAND 01.PDF', ...ESP })
  assert.equal(r.completa, false)
  assert.match(r.motivo, /Jahrgang 1.*Jahrgang 7/)
})

test('extractos da colecção espanhola sem banda no título do PDF (pelo BWV)', () => {
  const r = reconhecerBga({ nome: 'Preludio y fuga n 1 en Do M BWV 870.pdf', pdfTitulo: 'el clave bien temperado vol 2.p.PDF', ...ESP })
  assert.equal(r.banda, '14')
  assert.equal(r.campos.data, '1866')
  assert.ok(r.completa)
  const s = reconhecerBga({ nome: 'Suite nº 3 en Do M BWV 1009.pdf', pdfTitulo: 'Suites para violoncello.pdf', ...ESP })
  assert.equal(s.banda, '27_1')
  const t = reconhecerBga({ nome: 'a.concierto nº1 en Re M BWV 972.pdf', pdfTitulo: '16 transcripciones de concierto.PDF', pdfAutor: '.', produtor: 'Acrobat Distiller 7.0.5 (Windows)' })
  assert.equal(t.banda, '42')
  // (sem o «.» e o Distiller não é a colecção: um PDF qualquer com BWV não é da BGA)
  assert.equal(reconhecerBga({ nome: 'Suite nº 3 en Do M BWV 1009.pdf', pdfTitulo: 'Suites para violoncello.pdf', pdfAutor: 'Fernando Paz', produtor: 'Mac OS X 10.5.8 Quartz PDFContext' }), null)
  // intervalo = colecção
  const i = reconhecerBga({ nome: 'za.Organo, Sechs Choräle BWV 645-650.pdf', pdfTitulo: 'za.Organo, Sechs Choräle BWV 645-650', pdfAutor: '.', produtor: 'Acrobat Distiller 5.0 (Windows)' })
  assert.equal(i.campos.metadados.catalogo, 'BWV 645–650')
  assert.equal(i.campos.metadados.conteudo_tipo, 'Colecção')
  assert.equal(i.banda, '25_2')
})

test('atribuições: «(Krebs)», «(M. Hoffmann)», «de WF Bach» → por rever; «(dudoso)» → nota', () => {
  const k = reconhecerBga({ nome: 'k. Preludio en Do M BWV 567 (Krebs).pdf', pdfTitulo: 'Organo,  preludios, fugas, fant.PDF', ...ESP, catalogo: ['B.W. XXXVIII.'] })
  assert.equal(k.completa, false)
  assert.match(k.motivo, /Krebs/)
  const h = reconhecerBga({ nome: 'Cantata nº 53 (M. Hoffmann).pdf', pdfTitulo: 'BGA BAND 12.PDF', ...ESP })
  assert.equal(h.completa, false)
  const d = reconhecerBga({ nome: 'e. Fuga en Re menor BWV 948 (dudoso).pdf', pdfTitulo: 'BGA BAND 36.PDF', ...ESP })
  assert.ok(d.completa)
  assert.match(d.notas.join(' '), /duvidosa/)
})

test('outros extractos: IMSLP «BGA» no nome, C. P. E. Bach, rodapé «B. W.»', () => {
  const i = reconhecerBga({ nome: 'Bach_-_BGA_-_BWV_1045.pdf', titulo: 'Sinfonie-Satz in A dur aus einer unbekannten Kirchen-Cantate' })
  assert.equal(i.banda, '21_1')
  assert.ok(i.completa)
  const o = reconhecerBga({ nome: 'IMSLP02307-Bach_-_BGA_-_BWV_249.pdf', titulo: 'Johann Sebastian Bachs Werke.', programa: 'Acrobat 4.05 Import Plug-in for Windows' })
  assert.equal(o.tipo, 'extracto')
  assert.equal(o.banda, '21_3')
  // #7788: C. P. E. Bach, H 542.5 = BWV 1020, Jahrgang 9; a IA leu o rodapé «B.W. IX.»
  const c = reconhecerBga({ nome: 'BGA_-_C.P.E._Bach_-_H_542.5.pdf', titulo: 'VI. SONATA. (Siehe das Vorwort.)', catalogo: ['B.W. IX.'] })
  assert.equal(c.banda, '9')
  assert.equal(c.campos.autores[0].nome, 'Carl Philipp Emanuel')
  assert.equal(c.campos.metadados.catalogo, 'H 542.5')
  assert.ok(c.completa)
  // #7808: «BWV1006.pdf», OCR com o rodapé do Jahrgang 27
  const r = reconhecerBga({ nome: 'BWV1006.pdf', texto: '[p. 1] 48  PARTITA III.  Preludio.  B. W. XXVII. (4)' })
  assert.equal(r.banda, '27_1')
  assert.ok(r.completa)
  // #1177: rodapé lido só em parte → BGA, mas por rever
  const p = reconhecerBga({ nome: 'coral BWV 650.pdf', texto: 'Kommst du nun, Jesu B.W. XX' })
  assert.equal(p.completa, false)
  // #1182: «jsbtrsn3.pdf», a IA leu «BWV XV» (o rodapé) → BGA 15, sem BWV → por rever
  const s = reconhecerBga({ nome: 'jsbtrsn3.pdf', titulo: 'SONATA III.', catalogo: ['BWV XV'] })
  assert.equal(s.banda, '15')
  assert.equal(s.completa, false)
  // fac-símile do Jahrgang 44 (#9478, título do PDF «(BGA44-043.ppm)»)
  const f = reconhecerBga({ nome: 'Facsimil BWV 1041.pdf', pdfTitulo: '(BGA44-043.ppm)' })
  assert.equal(f.banda, '44')
  assert.equal(f.completa, false)
  // sem indício nenhum: não é da BGA
  assert.equal(reconhecerBga({ nome: 'BWV_1040.pdf', titulo: 'Canon BWV 1040' }), null)
  assert.equal(reconhecerBga({ nome: 'Bach - Sonata in B Minor for Flute and Piano BWV 1030 (Piano).pdf' }), null)
})

test('NBA só pelo nome → por rever', () => {
  const r = reconhecerBga({ nome: 'IMSLP526462-PMLP149635-bachNBAI,34gotteszeitistdieallerbestezeitBWV106 2019-12-16 14_00_26.pdf' })
  assert.equal(r.tipo, 'nba')
  assert.equal(r.completa, false)
  assert.equal(r.campos.metadados.colecao, 'Neue Bach-Ausgabe, Serie I, Band 34')
})

test('títulos: cabeçalhos de página e título pelo nome', () => {
  for (const t of ['V. VARIANTE zu Seite 175. (Siehe das Vorsort.)', 'ANHANG III.', 'XI. Praeludium. C-dur.', 'SONATA III.', 'Johann Sebastian Bachs Werke.', 'Cantata No. 45', '1. Fragment einer Suite. F-moll.'])
    assert.ok(tituloDeCabecalho(t), t)
  for (const t of ['Brandenburg Concerto No.6 in B-flat major, BWV 1051', 'Wie schön leuchtet der Morgenstern, BWV 1', 'Mass in G minor, BWV 235'])
    assert.ok(!tituloDeCabecalho(t), t)
  assert.equal(tituloDoNomeBga('3. Toccata en Re Mayor BWV 912.pdf'), 'Toccata en Re Mayor BWV 912')
  assert.equal(tituloDoNomeBga('Brandemburgo nº 6 en Sib M BWV 1051 copia.pdf'), 'Brandemburgo nº 6 en Sib M BWV 1051')
})

test('outros autores e obras espúrias no nome do ficheiro (nomes reais da colecção espanhola)', () => {
  const k = reconhecerBga({ nome: 'f. Fantasia y fuguetta en Re M BWV 908 (Kirchoff) .pdf', pdfTitulo: 'BGA BAND 42.PDF', ...ESP })
  assert.equal(k.completa, false)
  assert.equal(k.campos.autores[0].apelido, 'Kirchhoff')
  assert.equal(reconhecerBga({ nome: '4. Preludio y fuga en la m (C.H. Dretzel) BWV 897.pdf', pdfTitulo: 'BGA BAND 42.PDF', ...ESP }).completa, false)
  const c = reconhecerBga({ nome: 'Sonata para violin y clave en Sol m (CPE Bach).pdf', pdfTitulo: 'BGA BAND 09.PDF', ...ESP })
  assert.equal(c.campos.autores[0].nome, 'Carl Philipp Emanuel')
  assert.equal(c.completa, false)
  // (o arranjo de Reincken é de Bach: não muda o compositor)
  assert.equal(reconhecerBga({ nome: 'a. Sonata en la m BWV 965 (basada en Reincken).pdf', pdfTitulo: 'BGA BAND 42.PDF', ...ESP }).campos.autores[0], BACH)
})

test('rodapés com erros de OCR (PDFs reais BWV 1002–1005, 1040)', () => {
  assert.deepEqual(rodapesBga('B. W. XXV1. (4)'), ['XXVI'])
  assert.deepEqual(rodapesBga('B. W. XXVIT. (1)'), ['XXVII'])
  assert.deepEqual(rodapesBga('B.W. XXVIL.'), ['XXVII'])
  assert.deepEqual(rodapesBga('B. W. XXYVII. (4)'), ['XXVII'])
  assert.deepEqual(rodapesBga('B.W. XNIX'), ['XXIX'])
  assert.ok(reconhecerBga({ nome: 'BWV1003.pdf', texto: 'B. W. XXVIT. (1)' }).completa)
})

test('partes cavas da Breitkopf («Bachs Werke. Kantate Nr 81», Flöte I) não são a BGA; zeros à esquerda no BWV', () => {
  assert.equal(reconhecerBga({ nome: 'BWV 81 fl1.pdf', texto: 'Kantate am vierten Sonntage nach Epiphanias „Jesus schläft, was soll ich hoffen“, Bachs Werke. Kantate Ne S1. 1 Flote I.' }), null)
  assert.deepEqual(bwvDoNome('BACH_BWV0787_pdf.pdf').lista, ['787'])
  assert.equal(tituloDoNomeBga('ñ. Fuga en mi m BWV 960 (espurio).pdf'), 'Fuga en mi m BWV 960 (espurio)')
})
