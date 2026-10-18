// Testes sem internet dos quatro reparos encontrados ao testar os PRs 6 e 7 no Mac (2/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// ATENÇÃO: as respostas da Gallica abaixo são INVENTADAS no formato do OAI da Gallica (sem internet); só o título, o autor,
// a imprenta e o identificador imitam as fontes reais dadas pelo Pedro. Os nomes de ficheiro são os exemplos dele.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editoraLocal, gallicaExemplar } from '../src/fontes_externas/gallica.js'
import { semNomeLocal, separarImprenta, candidato } from '../src/fontes_externas/util.js'
import { tituloDoNome } from '../src/extracao.js'
import { nomeFicheiro } from '../src/ficheiros.js'
import { pistasDoNome, tituloSiglaCota, notaSiglaDesconhecida } from '../src/musica_antiga.js'
import { protegerReanalise } from '../src/processador.js'

// ---------------- 1. Gallica: a imprenta inteira não fica na «editora»
test('1: Gallica separa a imprenta do Epitome de Jambe de Fer em local e editora, sem a data', () => {
  assert.deepEqual(editoraLocal('À Lyon : par Michel du Bois, M.D.LVI'), { local: 'Lyon', editora: 'Michel du Bois' })
  assert.deepEqual(editoraLocal('A Paris : chez Le Clerc, [1750]'), { local: 'Paris', editora: 'Le Clerc' })
})

test('1: o que hoje está certo fica igual; o que não se separa com segurança fica como está', () => {
  assert.deepEqual(editoraLocal('Valerio et Lodovico Dorico (Roma)'), { editora: 'Valerio et Lodovico Dorico', local: 'Roma' })
  assert.deepEqual(editoraLocal('Michel du Bois'), { editora: 'Michel du Bois', local: '' })
  // (dois «:» — duas cidades ou dois editores —: não se mexe)
  assert.deepEqual(editoraLocal('Paris : Ballard ; Lyon : Du Bois'), { editora: 'Paris : Ballard ; Lyon : Du Bois', local: '' })
  // (o «local» com algarismos ou demasiado longo não é um local)
  assert.equal(separarImprenta('Op. 12 : Sonate'), null)
  assert.equal(separarImprenta('Musique de la chapelle du roi de France : extraits'), null)
})

function gallicaInventada(registos) {
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const ark = (/ark=([0-9a-z]+)/.exec(String(url)) || [])[1]
    if (registos[ark]) return new Response(registos[ark], { status: 200, headers: { 'content-type': 'text/xml' } })
    return new Response('', { status: 404 })
  }
  return () => (globalThis.fetch = original)
}
const oai = ({ titulo, autor, editora, data }) => `<record><metadata><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${titulo}</dc:title><dc:creator>${autor}</dc:creator><dc:publisher>${editora}</dc:publisher><dc:date>${data}</dc:date>
<dc:type>text</dc:type><dc:source>Bibliothèque nationale de France, département Musique, RES-INVENTADA-1</dc:source>
</oai_dc:dc></metadata></record>`

test('1 e 2: registo da Gallica (inventado) — Epitome com local e editora; Agricola 1543 sem «[s.n.]»', async () => {
  const repor = gallicaInventada({
    btv1b0000000001: oai({ titulo: 'Epitome musical des tons, sons et accordz', autor: 'Jambe de Fer, Philibert (1515?-1566?). Auteur du texte', editora: 'À Lyon : par Michel du Bois, M.D.LVI', data: '1556' }),
    bpt6k1167977w: oai({ titulo: 'Musica instrumentalis deudsch', autor: 'Agricola, Martin (1486?-1556). Auteur du texte', editora: '[s.n.]', data: '1543' }),
  })
  try {
    const epitome = (await gallicaExemplar('btv1b0000000001')).candidato
    assert.equal(epitome.local, 'Lyon')
    assert.equal(epitome.editora, 'Michel du Bois')
    assert.equal(epitome.data, '1556')
    const agricola = (await gallicaExemplar('bpt6k1167977w')).candidato
    assert.equal(agricola.editora, '')
    assert.equal(agricola.local, '')
  } finally {
    repor()
  }
})

// ---------------- 2. «[s.n.]» e «[S.l.]» ficam vazios, em todas as fontes externas
test('2: sine nomine e sine loco ficam vazios; editoras verdadeiras ficam', () => {
  for (const s of ['[s.n.]', '[S.l.]', 's.n.', 'S.l.', '[S.l.] : [s.n.]', '[S.l.] : [s.n.], 1543', '[s.l.n.d.]', '[sn]', 'sine nomine', 'sine loco']) assert.equal(semNomeLocal(s), '', s)
  for (const s of ['Michel du Bois', 'Snow', 'Sn', 'S. Lindner', 'Ballard']) assert.equal(semNomeLocal(s), s)
})

test('2: qualquer fonte externa (candidato) perde o «[s.n.]» e o «[S.l.]»', () => {
  const c = candidato({ fonte: 'Catálogo inventado', titulo: 'Obra inventada', editora: '[s.n.]', local: '[S.l.]' })
  assert.equal(c.editora, '')
  assert.equal(c.local, '')
})

test('2 e 1: na reanálise, o «[s.n.]» e a imprenta inteira antigos não voltam', () => {
  const sn = protegerReanalise({ origem: 'Gallica (exemplar)', titulo: 'Musica instrumentalis deudsch', editora: '[s.n.]', local: '[S.l.]', metadados: {} }, { titulo: 'Musica instrumentalis deudsch', editora: '', local: '', metadados: {} })
  assert.equal(sn.dados.editora, '')
  assert.equal(sn.dados.local, '')
  const imp = protegerReanalise({ origem: 'Gallica (exemplar)', titulo: 'Epitome musical', editora: 'À Lyon : par Michel du Bois, M.D.LVI', local: '', metadados: {} }, { titulo: 'Epitome musical', editora: 'Michel du Bois', local: 'Lyon', metadados: {} })
  assert.equal(imp.dados.editora, 'Michel du Bois')
  assert.equal(imp.dados.local, 'Lyon')
  // (outra editora de catálogo, que não é a mesma imprenta, continua protegida como antes)
  const outra = protegerReanalise({ origem: 'RISM', titulo: 'Epitome musical', editora: 'Ballard', metadados: {} }, { titulo: 'Epitome musical', editora: 'Michel du Bois', metadados: {} })
  assert.equal(outra.dados.editora, 'Ballard')
})

// ---------------- 3. O «pdf» do nome do ficheiro não fica no título nem no nome organizado
const NOMES = ['P-Arouca_livro_polifónico_pdf.pdf', 'P-BRd_949_antifonario_pdf.pdf', 'P-EVc_cm10_pdf.pdf', 'P-Ev_alegria_cod_1_CARDOSO_pdf.pdf']

test('3: título feito do nome do ficheiro, sem «pdf»', () => {
  assert.deepEqual(NOMES.map(tituloDoNome), ['P-Arouca livro polifónico', 'P-BRd 949 antifonario', 'P-EVc cm10', 'P-Ev alegria cod 1 CARDOSO'])
  // (um nome que é só «pdf» continua a ter título)
  assert.equal(tituloDoNome('pdf.pdf'), 'pdf')
})

test('3: título no formato «SIGLA COTA — resto do nome», como os outros', () => {
  // (P-Arouca: variante aceite de P-AR, sem cota válida — «livro» não é cota)
  assert.equal(tituloSiglaCota(NOMES[0], 'P-AR', ''), 'P-AR — livro polifónico')
  assert.equal(tituloSiglaCota(NOMES[1], 'P-BRad', '949'), 'P-BRad 949 — antifonario')
  assert.equal(tituloSiglaCota(NOMES[2], 'P-EVc', pistasDoNome(NOMES[2]).siglas[0].cota), 'P-EVc cm10')
  assert.equal(tituloSiglaCota(NOMES[3], 'P-Ev', pistasDoNome(NOMES[3]).siglas[0].cota), 'P-Ev — alegria cod 1 CARDOSO')
})

test('3: o nome do ficheiro organizado não leva «pdf»', () => {
  assert.equal(nomeFicheiro('{data}_{AUTOR}_{Titulo}', { titulo: 'P-Arouca livro polifónico pdf' }, 'Manuscrito', '.pdf'), 'SD_ANONIMO_P-Arouca-livro-polifonico.pdf')
  assert.equal(nomeFicheiro('{data}_{AUTOR}_{Titulo}', { titulo: 'P-EVc cm10' }, 'Manuscrito', '.pdf'), 'SD_ANONIMO_P-EVc-cm10.pdf')
})

test('3: na reanálise, o título antigo com «pdf» não ganha ao novo', () => {
  const p = protegerReanalise({ origem: 'IA local', titulo: 'P-Arouca livro polifónico pdf', metadados: {} }, { titulo: 'P-AR — livro polifónico', metadados: {} })
  assert.equal(p.dados.titulo, 'P-AR — livro polifónico')
  const q = protegerReanalise({ origem: 'ficheiro', titulo: 'P-Ev alegria cod 1 CARDOSO pdf', metadados: {} }, { titulo: 'P-Ev alegria cod 1 CARDOSO', metadados: {} })
  assert.equal(q.dados.titulo, 'P-Ev alegria cod 1 CARDOSO')
})

// ---------------- 4. Sigla não reconhecida no RISM: a nota só fala de cota quando há cota
test('4: «P-Ev_alegria_cod_1_CARDOSO_pdf»: sem cota válida no nome, a nota não diz que a cota foi gravada', () => {
  const p = pistasDoNome(NOMES[3]).siglas[0]
  assert.deepEqual(p, { texto: 'P-Ev', cota: '' })
  const nota = notaSiglaDesconhecida({ texto: 'P-Ev', cota: p.cota, possiveis: ['P-EVc', 'P-EVp'] })
  assert.match(nota, /tratada como manuscrito, sem cota/)
  assert.doesNotMatch(nota, /com a cota do nome/)
})

test('4: com cota válida no nome, a nota diz qual é (e é essa que fica gravada)', () => {
  const nota = notaSiglaDesconhecida({ texto: 'P-Xyz', cota: 'MS 12', possiveis: [] })
  assert.equal(nota, 'Sigla «P-Xyz» não reconhecida no RISM: tratada como manuscrito com a cota do nome do ficheiro (MS 12).')
})

// ---------------- Correção das fichas antigas (./biblioteca corrigir-fichas), com fichas INVENTADAS
import { correcoesDaFicha, notaTituloPdf } from '../src/corrigir_fichas.js'

test('fichas antigas: «[s.n.]» e «[S.l.]» ficam vazios', () => {
  const r = correcoesDaFicha({ titulo: 'Musica instrumentalis deudsch', editora: '[s.n.]', local: '[S.l.]', estado: 'completo', origem: 'Gallica (exemplar)', metadados: {} })
  assert.deepEqual(r.mudar, { editora: '', local: '' })
  assert.equal(r.perguntas.length, 0)
})

test('fichas antigas: imprenta inteira da Gallica separada; noutras origens ou com outro local, não se mexe', () => {
  const g = correcoesDaFicha({ titulo: 'Epitome musical', editora: 'À Lyon : par Michel du Bois, M.D.LVI', local: '', estado: 'completo', origem: 'Gallica (exemplar)', metadados: {} })
  assert.deepEqual(g.mudar, { editora: 'Michel du Bois', local: 'Lyon' })
  const outra = correcoesDaFicha({ titulo: 'Obra inventada', editora: 'Paris : Ballard, 1599', local: '', estado: 'completo', origem: 'RISM', metadados: {} })
  assert.deepEqual(outra.mudar, {})
  const conflito = correcoesDaFicha({ titulo: 'Epitome musical', editora: 'À Lyon : par Michel du Bois, M.D.LVI', local: 'Paris', estado: 'completo', origem: 'Gallica (exemplar)', metadados: {} })
  assert.deepEqual(conflito.mudar, {})
  assert.equal(conflito.conflitos.length, 1)
})

test('fichas antigas: título com «pdf» não muda; fica por rever com uma nota que pergunta', () => {
  const r = correcoesDaFicha({ titulo: 'P-Arouca livro polifónico pdf', editora: '', local: '', estado: 'completo', origem: 'IA local', metadados: { nota_revisao: 'Nota antiga.' } })
  assert.equal('titulo' in r.mudar, false)
  assert.equal(r.mudar.estado, 'a_rever')
  assert.equal(r.mudar.metadados.nota_revisao, `Nota antiga. ${notaTituloPdf('P-Arouca livro polifónico')}`)
  assert.match(r.mudar.metadados.nota_revisao, /Tirar o «pdf» e ficar «P-Arouca livro polifónico»\?/)
  // (já com a nota: não se repete)
  const outra = correcoesDaFicha({ titulo: 'P-Arouca livro polifónico pdf', estado: 'a_rever', metadados: { nota_revisao: notaTituloPdf('P-Arouca livro polifónico') } })
  assert.deepEqual(outra.mudar, {})
  // (títulos que só contêm «pdf» no meio, ou que são só «pdf», ficam)
  assert.deepEqual(correcoesDaFicha({ titulo: 'Guia do PDF/A para arquivos', metadados: {} }).mudar, {})
  assert.deepEqual(correcoesDaFicha({ titulo: 'pdf', metadados: {} }).mudar, {})
})
