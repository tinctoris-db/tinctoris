// Testes sem internet das regras que protegem a identificação na reanálise (grupo A, 2/10/2026).
// Correr: cd app/worker && node --test testes/*.test.js
// ATENÇÃO: os candidatos e as fichas abaixo são EXEMPLOS INVENTADOS que imitam os casos encontrados no teste do Mac
// (#2480, #3719, #83, #67, #152, #12018); não são cópias das fichas nem respostas gravadas dos catálogos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compositoresConhecidos, ajustarCandidatos, trocaAceitavel, contradicaoForma, dataMaisPrecisa, autoresAcademicos, edicaoModernaPara } from '../src/regras_identificacao.js'
import { protegerReanalise } from '../src/processador.js'
import { semelhanca } from '../src/fontes_externas/util.js'
import { escolher } from '../src/fontes_externas/index.js'

const bach = { apelido: 'Bach', nome: 'Johann Sebastian', papel: 'compositor' }

test('A1: registo anónimo e registo de outra obra não ganham a uma obra BWV conhecida (inventado)', () => {
  const conhecidos = compositoresConhecidos({ catalogos: ['BWV 60'], autoresAntigos: [bach] })
  assert.ok(conhecidos.has('bach'))
  const cs = [
    { fonte: 'RISM', confianca: 1, titulo: 'O Ewigkeit du Donnerwort', autores: [{ literal: 'Anonymus', papel: 'compositor' }], metadados: {} },
    { fonte: 'IMSLP', confianca: 1, titulo: 'O Ewigkeit, du Donnerwort, BWV 20', autores: [bach], metadados: {} },
    { fonte: 'IMSLP', confianca: 1, titulo: 'O Ewigkeit, du Donnerwort, BWV 60', autores: [bach], metadados: {} },
  ]
  const r = ajustarCandidatos(cs, { conhecidos, catalogo: 'BWV 60' })
  assert.equal(r.candidatos[0].titulo, 'O Ewigkeit, du Donnerwort, BWV 60')
  assert.equal(escolher(r.candidatos, 0.8).titulo, 'O Ewigkeit, du Donnerwort, BWV 60')
})

test('A1: dois registos diferentes com confiança máxima são um empate (inventado)', () => {
  const cs = [
    { fonte: 'IMSLP', confianca: 1, titulo: 'Obra inventada, BWV 1', data: '', tipo_sugerido: 'Partitura' },
    { fonte: 'IMSLP', confianca: 1, titulo: 'Obra inventada, BWV 2', data: '', tipo_sugerido: 'Partitura' },
  ]
  assert.equal(escolher(cs, 0.8), null)
})

test('A1: a reanálise só troca de registo se for o mesmo compositor e a mesma obra (inventado)', () => {
  const antiga = { origem: 'RISM', titulo: 'Cantata inventada', url: 'https://rism.online/sources/1', autores: [bach], metadados: { catalogo: 'BWV 60', rism: '1' } }
  const anonimo = { fonte: 'RISM', titulo: 'Cantata inventada', url: 'https://rism.online/sources/2', autores: [{ literal: 'Anonymus', papel: 'compositor' }], metadados: { rism: '2' } }
  const outraCopia = { fonte: 'RISM', titulo: 'Cantata inventada, BWV 60', url: 'https://rism.online/sources/3', autores: [bach], metadados: { rism: '3' } }
  assert.equal(trocaAceitavel(antiga, anonimo, { semelhanca }), false)
  assert.equal(trocaAceitavel(antiga, outraCopia, { semelhanca }), true)
  assert.equal(trocaAceitavel({ ...antiga, origem: 'IA local' }, anonimo, { semelhanca }), true)
})

test('A2: registo de manuscrito não identifica uma edição moderna (inventado)', () => {
  const autografo = { fonte: 'RISM', confianca: 1, titulo: 'Coral inventado', data: '1724', tipo_sugerido: 'Manuscrito', autores: [bach], metadados: { suporte: 'Manuscrito autógrafo' } }
  assert.equal(edicaoModernaPara(autografo, { anoLido: '2004' }), true)
  assert.equal(edicaoModernaPara(autografo, { anoLido: '1730' }), false)
  const r = ajustarCandidatos([autografo], { forma: 'impresso' })
  assert.ok(r.candidatos[0].confianca < 0.8)
  // (com sigla + cota no nome do ficheiro, o manuscrito pode ser identificado)
  const r2 = ajustarCandidatos([{ ...autografo, confianca: 1 }], { forma: 'impresso', nomeComCota: true })
  assert.equal(r2.candidatos[0].confianca, 1)
  assert.ok(contradicaoForma({ forma: 'Impresso', suporte: 'Manuscrito autógrafo' }))
  assert.equal(contradicaoForma({ forma: 'Impresso', suporte: 'Papel' }), '')
})

test('A3: num trabalho académico, o compositor do título é o assunto (inventado)', () => {
  const antigos = [{ nome: 'Autora', apelido: 'Inventada', papel: 'intérprete' }]
  const r = autoresAcademicos([{ nome: 'Georg', apelido: 'Muffat', papel: 'compositor' }], { titulo: 'Trabalho inventado sobre arcadas segundo Muffat', antigos })
  assert.deepEqual(r.autores, [{ nome: 'Autora', apelido: 'Inventada', papel: 'autor' }])
  assert.ok(r.notas.length)
})

test('A4: a reanálise mantém a data mais precisa (inventado)', () => {
  assert.equal(dataMaisPrecisa('2019-07-17', '2019'), true)
  const p = protegerReanalise({ origem: 'IA local', titulo: 'Dissertação inventada', data: '2019-07-17', metadados: {} }, { titulo: 'Dissertação inventada', data: '2019', metadados: {} })
  assert.equal(p.dados.data, '2019-07-17')
})

test('A5: ficha completa do Mendeley continua completa na reanálise, e a chave do estado anterior sai (inventado, como #152)', async () => {
  const { marcarReanalise, estadoAntesDaReanalise, continuaCompleta, CHAVE_ESTADO_ANTES } = await import('../src/regras_identificacao.js')
  const autora = { nome: 'Dono', apelido: 'Inventado', papel: 'autor' }
  const ficha = { estado: 'completo', origem: 'Mendeley', titulo: 'Tese inventada', autores: [autora], data: '2020', metadados: { instituicao: 'Escola inventada' } }
  // (reanalisar() põe a ficha «A processar» e guarda o estado anterior nos metadados)
  const naFila = { ...ficha, estado: 'processando', metadados: marcarReanalise(ficha.estado, ficha.metadados) }
  assert.equal(naFila.metadados[CHAVE_ESTADO_ANTES], 'completo')
  // (pedir outra vez a reanálise de uma ficha que já está «A processar» não apaga o estado guardado)
  assert.equal(marcarReanalise('processando', naFila.metadados)[CHAVE_ESTADO_ANTES], 'completo')
  // (a fila lê a ficha: o estado anterior volta e a chave sai da ficha que segue para a proteção)
  const { estado, ficha: limpa } = estadoAntesDaReanalise(naFila)
  assert.equal(estado, 'completo')
  assert.equal(limpa.metadados[CHAVE_ESTADO_ANTES], undefined)
  // (o OpenAIRE sugeria outro registo, recusado por o PDF ser do dono: a leitura nova fica por rever com nota)
  const dados = { estado: 'a_rever', titulo: '', autores: [], data: '', metadados: { nota_revisao: 'OpenAIRE sugeria «Outra tese» (2019): não aceite, o PDF é do dono da biblioteca e o catálogo não o tem como autor.' } }
  const p = protegerReanalise(limpa, dados)
  assert.equal(p.deCatalogo, true)
  assert.equal(p.dados.titulo, 'Tese inventada')
  assert.equal(CHAVE_ESTADO_ANTES in p.dados.metadados, false)
  assert.equal(continuaCompleta({ estadoAntes: estado, protegida: p.deCatalogo, dados: p.dados, dataAntiga: limpa.data }), true)
  // (sem o estado guardado — o defeito de antes — a ficha via «A processar» e nunca continuava completa)
  assert.equal(continuaCompleta({ estadoAntes: naFila.estado, protegida: true, dados: p.dados, dataAntiga: limpa.data }), false)
  // (uma ficha que estava por rever não passa a completa por esta regra)
  assert.equal(continuaCompleta({ estadoAntes: 'a_rever', protegida: true, dados: p.dados, dataAntiga: limpa.data }), false)
  // (sem a limpeza, a proteção copiaria a chave para a ficha nova)
  assert.equal(protegerReanalise(naFila, dados).dados.metadados[CHAVE_ESTADO_ANTES], 'completo')
})

test('A2: a nota de recusa só aparece se o candidato teria mesmo ganho, e diz «impresso» num impresso antigo (inventado, como #16993 e #2152)', () => {
  const senfl = () => ({ fonte: 'RISM', confianca: 0.32, titulo: 'Registo inventado de Senfl', data: '1530', tipo_sugerido: 'Manuscrito', autores: [{ apelido: 'Senfl', papel: 'compositor' }], metadados: {} })
  // (registo fraco, que nunca teria sido escolhido: fica recusado, mas sem nota — a ficha não passa a «por rever»)
  const r = ajustarCandidatos([senfl()], { forma: 'impresso', anoLido: '1556' })
  assert.ok(r.candidatos[0].recusado)
  assert.deepEqual(r.notas, [])
  // (o mesmo com uma edição moderna lida pela IA: também sem nota)
  assert.deepEqual(ajustarCandidatos([senfl()], { forma: 'impresso', anoLido: '1998' }).notas, [])
  // (registo forte que teria ganho num impresso de 1556: nota com «o PDF é um impresso»)
  const forte = ajustarCandidatos([{ ...senfl(), confianca: 0.9 }], { forma: 'impresso', anoLido: '1556' })
  assert.equal(forte.notas.length, 1)
  assert.match(forte.notas[0], /o PDF é um impresso/)
  assert.doesNotMatch(forte.notas[0], /edição moderna/)
  // (sem ano lido, impresso: também «impresso»)
  assert.match(ajustarCandidatos([{ ...senfl(), confianca: 0.9 }], { forma: 'impresso' }).notas[0], /o PDF é um impresso/)
  // (impresso de 1800 em diante, ou ano moderno sem forma: «edição moderna»)
  assert.match(ajustarCandidatos([{ ...senfl(), confianca: 0.9 }], { forma: 'impresso', anoLido: '2004' }).notas[0], /o PDF é uma edição moderna/)
  assert.match(ajustarCandidatos([{ ...senfl(), confianca: 0.9 }], { anoLido: '2004' }).notas[0], /o PDF é uma edição moderna/)
})

test('A6: a reanálise mantém o «Título na fonte» que a ficha já tinha (inventado, como #2152)', () => {
  const antiga = { origem: 'IA local', titulo: 'Prelude and Fugue in B minor, BWV 869', metadados: { titulo_fonte: 'PRAELUDIUM XXIV.', catalogo: 'BWV 869' } }
  const dados = { titulo: 'Prelude and Fugue in B minor, BWV 869', metadados: { titulo_fonte: 'Preludio y fuga nº 24 en si m BWV 869', catalogo: 'BWV 869' } }
  assert.equal(protegerReanalise(antiga, dados).dados.metadados.titulo_fonte, 'PRAELUDIUM XXIV.')
  // (ficha sem «Título na fonte»: fica o novo)
  const semTitulo = { ...antiga, metadados: { catalogo: 'BWV 869' } }
  assert.equal(protegerReanalise(semTitulo, dados).dados.metadados.titulo_fonte, 'Preludio y fuga nº 24 en si m BWV 869')
})
