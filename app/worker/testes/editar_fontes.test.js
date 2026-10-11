// Edição em grupo (10/10/2026): só os campos comuns; «só onde está vazio» / «substituir em todas»; etiquetas e
// contextos acrescentar/retirar; nunca se esvazia um campo.
// Correr: cd app/worker && node --test testes/*.test.js
// As fichas abaixo imitam as três feitas a 10/10 pelas fotografias do ISBN (#17310 Livro, #17311 Tese, #17312 Livro).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarAlteracoes, alteracoesDaFicha } from '../src/editar_fontes.js'

const LIVRO = { campos: [{ chave: 'edicao' }, { chave: 'colecao' }, { chave: 'exemplar_papel' }, { chave: 'nota_revisao' }] }
const TESE = { campos: [{ chave: 'grau' }, { chave: 'orientacao' }, { chave: 'exemplar_papel' }] }
const elogio = { id: 'a', numero: 17310, titulo: 'Elogio da Loucura', editora: 'Sporpress', local: 'Mem-Martins', data: '2003', tags: ['Em papel'], contextos: [], metadados: { exemplar_papel: 'Casa, estante da sala', edicao: '1ª edição' }, expand: { tipo: LIVRO } }
const tese = { id: 'b', numero: 17311, titulo: 'The origins…', editora: '', local: 'Utrecht', data: '2019', tags: ['Em papel'], contextos: [], metadados: { grau: 'Doutoramento' }, expand: { tipo: TESE } }

test('Só onde está vazio: o que já está escrito não muda', () => {
  const a = validarAlteracoes([{ campo: 'meta:exemplar_papel', valor: 'Gabinete ESMAE', modo: 'vazio' }])
  assert.equal(alteracoesDaFicha(elogio, a).mudancas.length, 0)
  const t = alteracoesDaFicha(tese, a)
  assert.equal(t.dados.metadados.exemplar_papel, 'Gabinete ESMAE')
  assert.equal(t.dados.metadados.grau, 'Doutoramento') // (os outros metadados ficam)
})

test('Substituir em todas', () => {
  const a = validarAlteracoes([{ campo: 'meta:exemplar_papel', valor: 'Gabinete ESMAE', modo: 'substituir' }])
  assert.equal(alteracoesDaFicha(elogio, a).dados.metadados.exemplar_papel, 'Gabinete ESMAE')
  assert.equal(alteracoesDaFicha(elogio, a).dados.metadados.edicao, '1ª edição')
})

test('Campo do tipo que a ficha não tem: não se acrescenta', () => {
  const a = validarAlteracoes([{ campo: 'meta:colecao', valor: 'Clássicos', modo: 'substituir' }])
  assert.equal(alteracoesDaFicha(tese, a).mudancas.length, 0)
})

test('Campos gerais: editora só onde está vazia', () => {
  const a = validarAlteracoes([{ campo: 'editora', valor: 'Universiteit Utrecht', modo: 'vazio' }])
  assert.equal(alteracoesDaFicha(elogio, a).mudancas.length, 0)
  assert.equal(alteracoesDaFicha(tese, a).dados.editora, 'Universiteit Utrecht')
})

test('Etiquetas e contextos: acrescentar e retirar sem mexer nos outros', () => {
  const mais = alteracoesDaFicha(elogio, validarAlteracoes([{ campo: 'tags', valor: 'Ler para o cap. 3', modo: 'acrescentar' }, { campo: 'contextos', valor: 'Ensino', modo: 'acrescentar' }]))
  assert.deepEqual(mais.dados.tags, ['Em papel', 'Ler para o cap. 3'])
  assert.deepEqual(mais.dados.contextos, ['Ensino'])
  const menos = alteracoesDaFicha(elogio, validarAlteracoes([{ campo: 'tags', valor: 'Em papel', modo: 'retirar' }]))
  assert.deepEqual(menos.dados.tags, [])
  // (acrescentar o que já lá está não é mudança)
  assert.equal(alteracoesDaFicha(elogio, validarAlteracoes([{ campo: 'tags', valor: 'Em papel', modo: 'acrescentar' }])).mudancas.length, 0)
})

test('Recusas: valor vazio, campos internos, modos e naturezas desconhecidos', () => {
  assert.throws(() => validarAlteracoes([]), /nenhuma alteração/)
  assert.throws(() => validarAlteracoes([{ campo: 'editora', valor: '  ', modo: 'substituir' }]), /Falta o valor/)
  assert.throws(() => validarAlteracoes([{ campo: 'meta:nota_revisao', valor: 'x', modo: 'substituir' }]), /não se pode editar/)
  assert.throws(() => validarAlteracoes([{ campo: 'titulo', valor: 'x', modo: 'substituir' }]), /não se pode editar/)
  assert.throws(() => validarAlteracoes([{ campo: 'editora', valor: 'x', modo: 'esvaziar' }]), /Modo desconhecido/)
  assert.throws(() => validarAlteracoes([{ campo: 'natureza', valor: 'terciária', modo: 'substituir' }]), /natureza/)
})
