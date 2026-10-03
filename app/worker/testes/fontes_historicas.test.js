// Testes sem internet das fontes históricas (folha inicial, Gallica/BnF, BSB, Cantus Index, PEM).
// Correr: cd app/worker && node --test testes/*.test.js
// ATENÇÃO: os textos de páginas, os HTML e os nomes de ficheiros abaixo são EXEMPLOS INVENTADOS para o teste
// (imitam o formato dos sites; não são fontes da biblioteca nem respostas gravadas dos catálogos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconhecerExemplar, IDENTIFICADORES } from '../src/fontes_externas/bibliotecas_digitais.js'
import { arkDe, pessoaBnf, origemGallica } from '../src/fontes_externas/gallica.js'
import { bsbIdDe } from '../src/fontes_externas/bsb.js'
import { lerListaFontes, lerSigla, chaveCantus, dataCantus } from '../src/fontes_externas/cantus.js'
import { camposPem, dataPem } from '../src/fontes_externas/pem.js'
import { camposMarc, marc, textos } from '../src/fontes_externas/xml.js'

test('identificadores no nome do ficheiro (inventados)', () => {
  assert.equal(arkDe('btv1b12345678x.pdf'), 'btv1b12345678x')
  assert.equal(arkDe('https://gallica.bnf.fr/ark:/12148/bpt6k1234567.texteImage'), 'bpt6k1234567')
  assert.equal(arkDe('https://catalogue.bnf.fr/ark:/12148/cb12345678x'), '') // notícia do catálogo, não digitalização
  assert.equal(bsbIdDe('bsb00012345_00001.jpg'), 'bsb00012345')
  assert.equal(bsbIdDe('urn:nbn:de:bvb:12-bsb00012345-6'), 'bsb00012345')
  assert.equal(bsbIdDe('xbsb000123456'), '')
})

test('exemplar pelo nome do ficheiro (inventado)', () => {
  const e = reconhecerExemplar({ nome: 'bsb00012345_00001.jpg' })
  assert.equal(e.sigla, 'D-Mbs')
  assert.equal(e.id, 'bsb00012345')
  assert.equal(e.temRegisto, true)
  assert.equal(e.ligacao, 'https://www.digitale-sammlungen.de/view/bsb00012345')
})

test('folha inicial da BSB (texto inventado)', () => {
  const texto = 'Exemplo de título inventado\nBayerische Staatsbibliothek München\n4 Mus.pr. 999\nurn:nbn:de:bvb:12-bsb00012345-6\nDie Nutzungsbedingungen…'
  const e = reconhecerExemplar({ texto })
  assert.equal(e.sigla, 'D-Mbs')
  assert.equal(e.cota, '4 Mus.pr. 999')
  assert.equal(e.identificador, 'urn:nbn:de:bvb:12-bsb00012345-6')
  assert.ok(IDENTIFICADORES.test(texto))
})

test('folha inicial da Gallica (texto inventado)', () => {
  const texto = 'Messe inventée / par X\nSource gallica.bnf.fr / Bibliothèque nationale de France, département Musique, VM1-0000\nhttps://gallica.bnf.fr/ark:/12148/btv1b00000000z'
  const e = reconhecerExemplar({ texto })
  assert.equal(e.sigla, 'F-Pn')
  assert.equal(e.cota, 'VM1-0000')
  assert.equal(e.biblioteca, 'Bibliothèque nationale de France, département Musique')
  assert.equal(e.identificador, 'ark:/12148/btv1b00000000z')
})

test('folha inicial com rótulo de cota (texto inventado)', () => {
  const e = reconhecerExemplar({ texto: 'Biblioteca Nacional de Portugal\nCota: M.M. 999 V.\nhttps://purl.pt/99999' })
  assert.equal(e.sigla, 'P-Ln')
  assert.equal(e.cota, 'M.M. 999 V.')
  assert.equal(e.ligacao, 'https://purl.pt/99999')
})

test('página sem biblioteca nem identificador', () => {
  assert.equal(reconhecerExemplar({ texto: 'Sonata inventada para cravo' }), null)
  assert.equal(IDENTIFICADORES.test('Reproduced by kind permission of the British Library'), false)
})

test('nomes e origens da BnF (exemplos inventados no formato da BnF)', () => {
  assert.deepEqual(pessoaBnf('Silva, João da (1600?-1650). Compositeur'), { apelido: 'Silva', nome: 'João da', papel: 'compositor' })
  assert.equal(pessoaBnf('Fulano, Beltrano (1800-1870). Compositeur de l\'oeuvre adaptée'), null)
  assert.deepEqual(origemGallica('Bibliothèque nationale de France, département Musique, RES X-1'), { biblioteca: 'Bibliothèque nationale de France, département Musique', sigla: 'F-Pn', cota: 'RES X-1' })
})

test('lista de fontes do Cantus Index (HTML inventado)', () => {
  const html = `<table><thead><tr><th>Siglum</th><th>CD</th><th>PEM</th><th>Total</th></tr></thead><tbody>
    <tr class="odd"><td>P-Xx (Cidade) Arquivo Inventado Ms. 007</td><td></td><td style="text-align:right;"><a href="https://pemdatabase.eu/source/1">1,234</a></td><td><strong>1,234</strong></td> </tr>
  </tbody></table>`
  const [l] = lerListaFontes(html)
  assert.equal(l.sigla, 'P-Xx')
  assert.equal(l.cidade, 'Cidade')
  assert.equal(l.bases[0].codigo, 'PEM')
  assert.equal(l.bases[0].canticos, 1234)
  assert.equal(chaveCantus('Ms. 007'), chaveCantus('ms 7'))
  assert.deepEqual(lerSigla('A-Xx 12'), { sigla: 'A-Xx', cidade: '', resto: '12' })
  assert.equal(dataCantus('1300s'), 'séc. XIV')
})

test('página de uma fonte da PEM (HTML inventado)', () => {
  const html = `<div class="field field--name-field-archive field--label-inline"><div class="field__label">Archive</div><div class="field__item"><a href="/node/1">P-Xx (Cidade) Arquivo Inventado</a></div></div>
  <div class="field field--name-field-shelfmark field--label-inline"><div class="field__label">Shelfmark</div><div class="field__item">Ms. 007</div></div>
  <div class="field field--name-field-date field--label-inline"><div class="field__label">Date</div><div class="field__item">16th century (second half)</div></div>`
  const c = camposPem(html)
  assert.equal(c.Archive, 'P-Xx (Cidade) Arquivo Inventado')
  assert.equal(c.Shelfmark, 'Ms. 007')
  assert.equal(dataPem(c.Date), 'séc. XVI (2.ª metade)')
})

test('MARC e Dublin Core (XML inventado)', () => {
  const xml = '<record><datafield tag="561" ind1=" " ind2=" "><subfield code="a">Ex-libris inventado</subfield></datafield><datafield ind2=" " ind1="1" tag="245"><subfield code="a">Título &amp; inventado</subfield></datafield></record>'
  const campos = camposMarc(xml)
  assert.deepEqual(marc(campos, '561', 'a'), ['Ex-libris inventado'])
  assert.deepEqual(marc(campos, '245', 'a'), ['Título & inventado'])
  assert.deepEqual(textos('<oai_dc:dc><dc:title>Um</dc:title><dc:title>Dois</dc:title></oai_dc:dc>', 'title'), ['Um', 'Dois'])
})

test('Bach digital: datas e chave da cota (exemplos inventados no formato do site)', async () => {
  const { dataBach, chaveOrdem } = await import('../src/fontes_externas/bach_digital.js')
  assert.equal(dataBach('2. Hälfte 18. Jh.'), 'séc. XVIII (2.ª metade)')
  assert.equal(dataBach('um 1730'), 'c. 1730')
  assert.equal(chaveOrdem('D-X', 'Mus.ms. 7'), 'dxmusms007')
})

test('BNP: descrição ISBD (exemplo inventado)', async () => {
  const { lerIsbd, purlDe } = await import('../src/fontes_externas/bnp.js')
  const r = lerIsbd('Obra inventada / Autor Fictício. - Lisboa : Officina Imaginária, 1650. - [8], 120 f. ; 4º')
  assert.equal(r.titulo, 'Obra inventada')
  assert.equal(r.local, 'Lisboa')
  assert.equal(r.editora, 'Officina Imaginária')
  assert.equal(r.data, '1650')
  assert.equal(purlDe('https://purl.pt/99999/1/'), '99999')
})

test('Repositório DSpace: tese (registo inventado no formato do DSpace 7)', async () => {
  const { candidatoDspace } = await import('../src/fontes_externas/repositorios.js')
  const c = candidatoDspace({
    handle: '0000/1',
    metadata: {
      'dc.title': [{ value: 'Tese inventada sobre música' }],
      'dc.contributor.author': [{ value: 'Fictício, Autor' }],
      'dc.contributor.advisor': [{ value: 'Imaginário, Orientador' }],
      'dc.date.issued': [{ value: '2020-01-01' }],
      'rcaap.type': [{ value: 'masterThesis' }],
      'thesis.degree.name': [{ value: 'Dissertação apresentada à Escola Inventada de Música como requisito parcial' }],
      'dc.subject': [{ value: 'Exemplo' }],
    },
  }, 'Repositório de teste')
  assert.equal(c.tipo_sugerido, 'Tese / dissertação')
  assert.equal(c.metadados.grau, 'Mestrado')
  assert.equal(c.metadados.instituicao, 'Escola Inventada de Música')
  assert.equal(c.url, 'http://hdl.handle.net/0000/1')
})
