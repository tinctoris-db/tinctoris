// Testes sem internet das variantes de siglas no nome do ficheiro (grupo B, 2/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// ATENÇÃO: as listas de instituições abaixo são EXEMPLOS no formato do RISM (siglas reais, sem outros dados);
// os nomes de ficheiro são os exemplos dados pelo Pedro, não ficheiros da biblioteca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abreviaturasDe } from '../src/fontes_externas/musicologicas.js'
import { pistasDoNome } from '../src/musica_antiga.js'

const braga = ['P-BRic', 'P-BRu', 'P-BRad', 'P-BRac', 'P-BRam', 'P-BRsc', 'P-BRbmvm', 'P-BRp', 'P-BRs'].map((sigla) => ({ sigla }))
const evora = ['P-EVc', 'P-EVp', 'P-EVad', 'P-EVu', 'P-EVm', 'P-EVpc'].map((sigla) => ({ sigla }))

test('P-BRd é a abreviatura de uma só sigla do RISM (P-BRad)', () => {
  assert.deepEqual(abreviaturasDe('P-BRd', braga).map((x) => x.sigla), ['P-BRad'])
})

test('P-Ev pode ser várias siglas de Évora: fica por decidir', () => {
  assert.equal(abreviaturasDe('P-Ev', evora).length, 6)
})

test('nomes de ficheiro com sigla no início', () => {
  assert.deepEqual(pistasDoNome('P-BRd_964_pdf.pdf').siglas, [{ texto: 'P-BRd', cota: '964' }])
  assert.equal(pistasDoNome('P-Ln LC 57.pdf').siglas[0].cota, 'LC 57')
  assert.equal(pistasDoNome('P-Arouca_livro_polifónico.pdf').siglas[0].texto, 'P-Arouca')
})

// B-1 (#15445 «P-BRd_964_pdf»): a IA leu a capa de couro vazia como «impresso»; com a sigla e a cota do NOME do ficheiro,
// a PEM/Cantus são consultados na mesma e, se tiverem a fonte, ela fica manuscrito com os dados de lá.
// ATENÇÃO: as respostas abaixo são INVENTADAS no formato do RISM, do Cantus Index e da PEM (sem internet); só a sigla,
// a cota e o nº de cânticos imitam a fonte real.
const LISTA_CANTUS = `<table><thead><tr><th>Source</th><th>PEM</th><th>Total</th></tr></thead><tbody>
<tr class="odd"><td>P-BRad (Braga) Arquivo Distrital 964</td><td><a href="https://pemdatabase.eu/source/1">311</a></td><td>311</td></tr>
</tbody></table>`
const campo = (nome, rotulo, valor) => `<div class="field field--name-field-${nome}"><div class="field__label">${rotulo}</div><div class="field__item">${valor}</div></div>`
const PAGINA_PEM = `<html><body>${campo('siglum', 'Siglum', 'P-BRad MS 964')}${campo('archive', 'Archive', 'P-BRad (Braga) Arquivo Distrital')}${campo('shelfmark', 'Shelfmark', 'MS 964')}${campo('document-type', 'Document type', 'Manuscript')}${campo('date', 'Date', '17th - early 18th cent.')}</body></html>`
function internetInventada() {
  const pedidos = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    pedidos.push(u)
    const resp = (corpo, json) => new Response(json ? JSON.stringify(corpo) : corpo, { status: 200, headers: { 'content-type': json ? 'application/json' : 'text/html' } })
    if (u.includes('rism.online')) return resp({ items: [] }, true)
    if (u.includes('diamm.ac.uk')) return resp({ results: [] }, true)
    if (u.includes('cantusindex.org/sources')) return resp(LISTA_CANTUS)
    if (u.includes('pemdatabase.eu/source/1')) return resp(PAGINA_PEM)
    if (u.includes('bach-digital')) return resp('<response><result></result></response>')
    return new Response('', { status: 404 })
  }
  return { pedidos, repor: () => (globalThis.fetch = original) }
}

test('B-1: sigla + cota do nome e a IA diz «impresso»: a PEM é consultada e descreve um manuscrito (inventado)', async () => {
  const { pesquisarMusical } = await import('../src/fontes_externas/musicologicas.js')
  const { notaFormaDoCatalogo } = await import('../src/processador.js')
  const net = internetInventada()
  try {
    // (sigla e cota do nome do ficheiro: a PEM entra, mesmo com a leitura «impresso» da IA)
    const r = await pesquisarMusical({ titulo: 'Il secondo libro delle sinfonie', sigla: 'P-BRad', cota: '964', forma: 'impresso', cotaDoNome: true }, '')
    const c = r.candidatos[0]
    assert.equal(c.fonte, 'PEM')
    assert.equal(c.metadados.forma, 'Manuscrito')
    assert.equal(c.tipo_sugerido, 'Manuscrito')
    assert.equal(c.data, 'séc. XVII - séc. XVIII (início)')
    assert.ok(c.confianca >= 0.8)
    assert.ok(r.outros.some((l) => l.includes('311 cânticos')))
    assert.ok(net.pedidos.some((u) => u.includes('cantusindex.org')))
    // (sigla e cota que NÃO vêm do nome — folha inicial —: num impresso o Cantus/PEM continua de fora, como antes)
    net.pedidos.length = 0
    const r2 = await pesquisarMusical({ sigla: 'P-BRad', cota: '964', forma: 'impresso' }, '')
    assert.equal(net.pedidos.some((u) => u.includes('cantusindex.org') || u.includes('pemdatabase.eu')), false)
    assert.equal(r2.candidatos.some((x) => x.fonte === 'PEM'), false)
  } finally {
    net.repor()
  }
  assert.equal(notaFormaDoCatalogo('PEM'), 'A IA leu como impresso; a PEM descreve um manuscrito.')
  assert.equal(notaFormaDoCatalogo('RISM'), 'A IA leu como impresso; o RISM descreve um manuscrito.')
})

// Regra de 2/10 (Pedro): sigla do RISM + cota no nome do ficheiro e a IA a dizer «impresso» sem sinais de impressão
// (sem impressor/editora, local, data de impressão nem fórmula de imprenta) → manuscrito.
// Os nomes são os exemplos dados pelo Pedro; a leitura da IA é INVENTADA (a do #15445 inventou «Il secondo libro…»).
test('regra 2/10: P-BRd + cota no nome e a IA diz «impresso» sem impressor → manuscrito', async () => {
  const { manuscritoPelaCota } = await import('../src/musica_antiga.js')
  const ia = { escrita: 'impresso', tipo: 'Livro', titulo: 'Il secondo libro delle sinfonie', editora: '', local: '', ano: '' }
  for (const ficheiro of ['P-BRd_949_antifonario_pdf.pdf', 'P-BRd_964.pdf']) {
    const nome = pistasDoNome(ficheiro)
    assert.equal(nome.siglas[0].texto, 'P-BRd')
    assert.equal(manuscritoPelaCota({ ia, nome, temCota: true, ficheiro, cota: nome.siglas[0].cota }), true, ficheiro)
  }
})

test('regra 2/10: impresso com cota de biblioteca ou com sinais de impressão → continua impresso', async () => {
  const { manuscritoPelaCota } = await import('../src/musica_antiga.js')
  const ia = { escrita: 'impresso', tipo: 'Partitura', titulo: 'Sonate a violino solo', editora: '', local: '', ano: '' }
  const ms = (outra, ficheiro, cota) => manuscritoPelaCota({ ia: { ...ia, ...outra }, nome: pistasDoNome(ficheiro), temCota: true, ficheiro, cota })
  // (cota e identificadores de impressos: «Mus.pr.», «Res.», bsb/ark/purl)
  assert.equal(ms({}, 'bsb00012345 4 Mus.pr. 96.pdf', '4 Mus.pr. 96'), false)
  assert.equal(ms({}, 'D-Mbs_4_Mus.pr._96.pdf', '4'), false)
  assert.equal(ms({}, 'F-Pn_Res_123.pdf', 'Res 123'), false)
  assert.equal(ms({}, 'F-Pn_ark_12148_btv1b55007136d.pdf', '12148'), false)
  // (a IA leu impressor/editora, local ou data de impressão, ou a página tem fórmula de imprenta)
  assert.equal(ms({ editora: 'Antonio Gardano' }, 'P-BRd_964.pdf', '964'), false)
  assert.equal(ms({ local: 'Venezia' }, 'P-BRd_964.pdf', '964'), false)
  assert.equal(ms({ ano: '1607' }, 'P-BRd_964.pdf', '964'), false)
  assert.equal(ms({ titulo: 'Motecta … Venetiis apud Angelum Gardanum' }, 'P-BRd_964.pdf', '964'), false)
  assert.equal(manuscritoPelaCota({ ia, nome: {}, temCota: true, ficheiro: 'P-BRd_964.pdf', cota: '964', texto: 'In Venetia appresso Giacomo Vincenti' }), false)
  // (sem cota no nome, com a IA a dizer «manuscrito», ou com a ficha que já era manuscrito: a regra não entra)
  assert.equal(manuscritoPelaCota({ ia, nome: {}, temCota: false, ficheiro: 'antifonario.pdf' }), false)
  assert.equal(manuscritoPelaCota({ ia: { ...ia, escrita: 'manuscrito' }, nome: {}, temCota: true, ficheiro: 'P-BRd_964.pdf', cota: '964' }), false)
  assert.equal(manuscritoPelaCota({ ia, nome: {}, temCota: true, antes: 'manuscrito', ficheiro: 'P-BRd_964.pdf', cota: '964' }), false)
})
