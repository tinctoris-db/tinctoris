// Testes dos PDFs de transcrições feitos num editor de partituras (transcricao_pdf.js), sem internet nem base de dados.
// Correr: cd app/worker && node --test testes/*.js
// Tudo REAL (17/10/2026): os nomes dos ficheiros, o que a IA tinha posto nas fichas e o texto da 1.ª página
// (`pdftotext -l 1 -layout`) das fichas indicadas, guardado em testes/dados/transcricoes/<nº>.txt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerPaginaPdf, lerDireitos, fichaTranscricaoPdf, agruparTranscricoes, chavesDoNome, chaveComSentido, eNomeDeParte, ePdfDeEditorDePartituras, pessoaDaPagina, ETIQUETA_TRANSCRICAO } from '../src/transcricao_pdf.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const pagina = (n) => fs.readFileSync(path.join(aqui, 'dados', 'transcricoes', `${n}.txt`), 'utf8')
// Compositores «conhecidos» (o mesmo formato de lotes_midi.autoresConhecidos)
const pessoa = (apelido, nomes = {}, papel = 'compositor') => ({ apelido, n: 5, nomes: new Map(Object.entries(nomes)), papeis: new Map([[papel, 5]]) })
const conhecidos = new Map([
  ['bach', pessoa('Bach', { 'Johann Sebastian': 9 })],
  ['handel', pessoa('Händel', { 'George Frideric': 5 })],
  ['morago', pessoa('Morago', { 'Estêvão Lopes': 3 })],
  ['scheidt', pessoa('Scheidt', { Samuel: 3 })],
  // (os alunos dos exercícios de tons estão registados como compositores na biblioteca — diário de 30/9)
  ['paulo', pessoa('Paulo')],
])
const eDono = (a) => /^pedro (sousa )?silva$/i.test((typeof a === 'string' ? a : a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')).trim())
const pessoaDono = { apelido: 'Silva', nome: 'Pedro Sousa', papel: 'editor' }
const nomes = (r) => r.campos.autores.map((a) => (a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')) + (a.papel && a.papel !== 'compositor' ? ` (${a.papel})` : ''))
const ficha = (n, nome, atual = {}, programa = 'Finale 2005') => fichaTranscricaoPdf({ nome, texto: pagina(n), programa, conhecidos, eDono, pessoaDono, atual })

test('Programas de edição de partituras (campo Creator do PDF)', () => {
  assert.ok(ePdfDeEditorDePartituras('Finale 2005'))
  assert.ok(ePdfDeEditorDePartituras('LilyPond 2.10.23'))
  assert.ok(ePdfDeEditorDePartituras('Sibelius 4'))
  assert.ok(ePdfDeEditorDePartituras('capella - [bwv__cap]'))
  assert.ok(!ePdfDeEditorDePartituras('Preview'))
  assert.ok(!ePdfDeEditorDePartituras(''))
})

test('Linha de direitos: titular e ano', () => {
  assert.deepEqual(lerDireitos('© 2007 L\'Universo Sommerso').titular, "L'Universo Sommerso")
  assert.equal(lerDireitos('                 PDF © 2004 Margaret Greentree').titular, 'Margaret Greentree')
  assert.equal(lerDireitos('PDF © 2004 Margaret Greentree').ano, '2004')
  assert.equal(lerDireitos('© Copyright Ernesto Schmied').titular, 'Ernesto Schmied')
  assert.equal(lerDireitos('©2006 Eric Haas').titular, 'Eric Haas')
  assert.equal(lerDireitos('© pedro sousa silva 2003').titular, 'pedro sousa silva')
  assert.equal(lerDireitos('Copyright © 2005 by Anders Stenberg (under CPDL lisence)').titular, 'Anders Stenberg')
  assert.equal(lerDireitos('Copyright © 2001-2008 Nicolas Sceaux .').ano, '2008')
  // (rodapé do Mutopia)
  assert.equal(lerDireitos('Typeset using www. LilyPond .org by JD Erickson . Copyright © 2007. Reference: Mutopia-2007/05/14-978').titular, 'Mutopia Project')
})

test('Nomes de partes cavas', () => {
  for (const p of ['Tenor', 'bassus', 'treble', 'Alto Recorder 2', '[Superius I]', 'II Dessus', 'Haute Contre', 'Violino 1', 'Flauto dolce tenore']) assert.ok(eNomeDeParte(p), p)
  for (const p of ['La Folia', 'Samuel Scheidt', 'Suite in C', 'Prima pars de']) assert.ok(!eNomeDeParte(p), p)
})

test('Página: Cancionero de Escorial (título ao centro, compositor cortado à direita, fonte à esquerda)', () => {
  const r = lerPaginaPdf(pagina(8423))
  assert.equal(r.titulo, '47. Je ne puis avoir ung seul bien')
  assert.deepEqual(r.compositores, ['Horlay (fl ca 1450)'])
  assert.ok(r.fonte.includes('Cancionero Escorial IV.a.24'))
  assert.equal(r.direitos.titular, 'Ernesto Schmied')
})

test('Página: parte cava no canto («bassus», «Violin») e título editorial entre parênteses retos', () => {
  const b = lerPaginaPdf(pagina(8284))
  assert.equal(b.parte, 'bassus')
  assert.equal(b.titulo, 'Suite in C')
  assert.deepEqual(b.compositores, ['Mr. Richard Cobb'])
  assert.equal(b.direitos.titular, 'Eric Haas')
  // (a partitura geral mostra as duas partes: não é uma parte cava)
  const s = lerPaginaPdf(pagina(8287))
  assert.equal(s.parte, '')
  assert.deepEqual(s.partes, ['treble', 'bassus'])
  const v = lerPaginaPdf(pagina(7657))
  assert.equal(v.parte, 'Violin')
  assert.equal(v.titulo, 'La Folia')
})

test('Ficha: «Superius», «Altus», «Bassus» (IA) não são compositores; título e subtítulo da página', () => {
  const r = ficha(4905, '8 Verbum caro.pdf', { titulo: 'Verbum caro', autores: [{ apelido: 'Superius', papel: 'compositor' }, { apelido: 'Altus', papel: 'compositor' }, { apelido: 'Bassus', papel: 'compositor' }] })
  assert.deepEqual(r.campos.autores, [])
  assert.equal(r.campos.titulo, 'Verbum caro')
  assert.ok(r.completa)
  assert.match(r.notas.join(' '), /«Superius», «Altus», «Bassus» \(retirado\)/)
})

test('Ficha: «[Composer]» e «Paulo Vc» (IA) saem; o aluno no nome do ficheiro fica (como no Finale)', () => {
  const k = ficha(848, 'Kyrio do 7ß tom 58-5.MUS.pdf', { titulo: 'Kyrio do 7º tom 58:5', autores: [{ apelido: '[Composer]', papel: 'compositor' }] })
  assert.deepEqual(k.campos.autores, [])
  assert.equal(k.campos.titulo, 'Kyrio do 7º tom 58:5')
  assert.ok(k.completa)
  const p = ficha(919, '3 tom-paulo.MUS.pdf', { titulo: '2', autores: [{ apelido: 'Vc', nome: 'Paulo', papel: 'autor' }] })
  assert.equal(p.campos.titulo, 'Terceiro Tom')
  assert.deepEqual(nomes(p), ['Paulo'])
  assert.match(p.notas.join(' '), /«Paulo Vc» \(retirado\)/)
})

test('Ficha: Escorial com «ESC B» no nome — compositor do nome, fonte da página, editora pelos direitos', () => {
  const r = ficha(8423, '47. ESC B HORLAY Je ne puis avoir ung seul bien DO.pdf', { titulo: 'Je ne puis avoir ung seul bien', autores: [{ apelido: 'VbÓ', nome: 'ÈI', papel: 'autor' }] })
  assert.equal(r.campos.titulo, 'Je ne puis avoir ung seul bien')
  assert.deepEqual(nomes(r), ['Horlay'])
  assert.equal(r.campos.editora, 'Ernesto Schmied')
  assert.equal(r.campos.metadados.colecao, 'Cancionero Escorial IV.a.24')
  assert.equal(r.campos.metadados.tonalidade, 'Dó')
  assert.ok(r.completa)
})

test('Ficha: «© <dono>» → o dono é editor e o ano é a data; parte do nome do ficheiro', () => {
  const r = ficha(6278, 'MORAGO de profundis claves modernas.mus - Tenor.pdf', { titulo: 'De profundis', autores: [] })
  assert.equal(r.campos.titulo, 'De profundis')
  assert.deepEqual(nomes(r), ['Estêvão Lopes Morago', 'Pedro Sousa Silva (editor)'])
  assert.equal(r.campos.data, '2010')
  assert.equal(r.parte, 'Tenor')
  assert.equal(r.campos.metadados.edicao, 'claves modernas')
})

test('Ficha: «© <outro>» → editora e data da edição; compositor da página com a grafia da biblioteca', () => {
  const r = ficha(7657, 'folia arranjo LUS.mus - Violin.pdf', { titulo: 'La Folia', autores: [{ apelido: 'Schickhardt', nome: 'J. C.', papel: 'compositor' }] })
  assert.equal(r.campos.titulo, 'La Folia')
  assert.equal(r.campos.editora, "L'Universo Sommerso")
  assert.equal(r.campos.data, '2007')
  assert.equal(r.parte, 'Violin')
  // («folia»: o «fol» não é tomado por fólios)
  assert.equal(r.campos.metadados.colecao, undefined)
})

test('Ficha: título que a ficha já tinha, confirmado pelo nº de catálogo da página («BWV 19.7»)', () => {
  const r = ficha(3672, '001907.pdf', { titulo: 'Es erhub sich ein Streit, BWV 19', autores: [{ apelido: 'Bach', nome: 'J.S.', papel: 'compositor' }, { apelido: 'Greentree', nome: 'Margaret', papel: 'arranjador' }] }, 'Finale 2003')
  assert.equal(r.campos.titulo, 'Es erhub sich ein Streit, BWV 19')
  assert.deepEqual(nomes(r), ['Johann Sebastian Bach'])
  assert.equal(r.campos.editora, 'Margaret Greentree')
  assert.equal(r.campos.data, '2004')
})

test('Ficha: nome próprio da página manda («jc_bach» = Johann Christian, não Johann Sebastian)', () => {
  const r = ficha(9630, 'jc_bach_quartetto_op_18_score.pdf', { titulo: 'Quartetto Op. 18 [in do maggiore]', autores: [] })
  assert.deepEqual(nomes(r), ['Johann Christian Bach'])
  assert.equal(r.campos.titulo, 'Quartetto Op. 18 [in do maggiore]')
  assert.deepEqual(pessoaDaPagina('Joh.Seb.Bach', conhecidos), { apelido: 'Bach', nome: 'Johann Sebastian', papel: 'compositor' })
})

test('Ficha: ano entre parênteses no título é a data de composição, não a data', () => {
  const r = ficha(7962, 'Blocksuite.pdf', { titulo: '"BLOCKSUITE" (1996)', autores: [{ apelido: 'Méndez', nome: 'Jorge García del Valle', papel: 'compositor' }], data: '1996' })
  assert.equal(r.campos.titulo, 'Blocksuite')
  assert.equal(r.campos.metadados.data_composicao, '1996')
  assert.equal(r.campos.data, undefined)
})

test('Partes cavas da mesma peça numa ficha (partitura primeiro); duas «Sonata I» sem parte ficam separadas', () => {
  const mk = (n, nome) => ({ ...ficha(n, nome, {}), numero: n })
  const cobb = agruparTranscricoes([mk(8284, 'Cobb-Suite_in_C-bassus.pdf'), mk(8286, 'Cobb-Suite_in_C-treble.pdf'), mk(8287, 'Cobb-Suite_in_C.pdf')])
  assert.equal(cobb.length, 1)
  assert.equal(cobb[0].principal.numero, 8287)
  assert.match(cobb[0].campos.metadados.instrumentacao, /partes: bassus, treble/)
  const atual = { titulo: 'Sonata I', autores: [{ apelido: 'Händel', nome: 'G.F.', papel: 'compositor' }] }
  const handel = agruparTranscricoes([{ ...ficha(6628, 'Händel.Gm.pdf', atual), numero: 6628 }, { ...ficha(7486, 'Händel.adagio.GM.pdf', atual), numero: 7486 }])
  assert.equal(handel.length, 2)
  // (Scheidt: três partes com o nome «altus.pdf»… só a página diz a obra)
  const s = ficha(628, 'altus.pdf', {})
  assert.equal(s.campos.titulo, 'Fantasia Super Io Son Ferito Lasso')
  assert.deepEqual(nomes(s), ['Samuel Scheidt'])
  assert.equal(s.parte, 'Alto')
})

test('Chaves do nome para ligar o PDF ao ficheiro do Finale', () => {
  assert.equal(chavesDoNome('MORAGO de profundis.mus.pdf').completa, chavesDoNome('MORAGO de profundis.mus').completa)
  const t = chavesDoNome('MORAGO de profundis claves modernas.mus - Tenor.pdf')
  assert.equal(t.parte, 'Tenor')
  assert.equal(t.base, chavesDoNome('MORAGO de profundis claves modernas.mus').completa)
  assert.equal(chavesDoNome('tiento - Alto.mus.pdf').completa, chavesDoNome('tiento - Alto.mus').completa)
  assert.equal(chavesDoNome('estampida_39_mus_pdf.pdf').completa, 'estampida 39')
  assert.equal(chavesDoNome('ragione - 001 Cantus copy.mus').base, 'ragione')
  // («tenor.pdf» sozinho não liga a nada)
  assert.ok(!chaveComSentido(chavesDoNome('tenor.pdf').completa))
  assert.ok(chaveComSentido(chavesDoNome('1 tom.mus.pdf').completa))
  assert.equal(ETIQUETA_TRANSCRICAO, 'Transcrição — dados do ficheiro')
})
