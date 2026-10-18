// Editar várias fontes de uma vez, a partir da lista (pedido do Pedro, 10/10/2026): só os campos que todas as
// fichas seleccionadas têm (ex.: «Onde está o exemplar em papel» dos livros fotografados pelo ISBN).
// Cada alteração diz o campo, o valor e o modo:
// - texto (editora, local, data, natureza e os campos do tipo, «meta:<chave>»): «vazio» = só nas fichas onde o campo
//   está vazio (o que já está escrito não muda); «substituir» = em todas. Nunca se esvazia um campo (decisão dele).
// - etiquetas («tags») e contextos: «acrescentar» ou «retirar» um valor, sem mexer nos outros.
// Antes, uma cópia de segurança da base; as fichas «A processar» são saltadas; o nome do ficheiro é actualizado quando
// muda um campo que entra nele; a lista do que mudou fica em app/registos/editar-fontes-AAAA-MM-DD.txt.
import fs from 'node:fs'
import path from 'node:path'
import { PASTAS } from './config.js'
import { pb, garantirSessao, fontesPorIds, copiaDeSeguranca } from './pb.js'
import { reorganizar } from './processador.js'
import { log } from './registo.js'
import { m, erro } from './mensagens.js'

const GERAIS = ['editora', 'local', 'data', 'natureza']
const NATUREZAS = ['primária', 'secundária']
// (campos que entram no nome do ficheiro ou na pasta: ver padrao_nome / padrao_pastas nas Definições)
const NO_NOME = new Set(['data', 'editora', 'natureza', 'contextos'])
// (campos do tipo que o programa usa por dentro: não se editam em grupo)
export const INTERNOS = new Set(['nota_revisao', 'herdado_de', 'lote', 'transcricao_midi', 'catalogo_ia'])

const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
const mostrar = (v) => (vazio(v) ? '(vazio)' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v))

// Valida a lista que vem da interface; devolve-a limpa ou lança um erro claro
export function validarAlteracoes(alteracoes) {
  if (!Array.isArray(alteracoes) || !alteracoes.length) throw erro('Não escolheu nenhuma alteração.')
  return alteracoes.map((a) => {
    const campo = String(a?.campo || '')
    const modo = String(a?.modo || '')
    let valor = a?.valor
    if (typeof valor === 'string') valor = valor.trim()
    if (vazio(valor)) throw erro('Falta o valor para «{campo}».', { campo })
    if (campo === 'tags' || campo === 'contextos') {
      if (!['acrescentar', 'retirar'].includes(modo)) throw erro('Modo desconhecido para «{campo}».', { campo })
      return { campo, modo, valor: String(valor) }
    }
    if (!['vazio', 'substituir'].includes(modo)) throw erro('Modo desconhecido para «{campo}».', { campo })
    if (GERAIS.includes(campo)) {
      if (campo === 'natureza' && !NATUREZAS.includes(valor)) throw erro('A natureza tem de ser «primária» ou «secundária».')
      return { campo, modo, valor: String(valor) }
    }
    const chave = /^meta:([a-z0-9_]+)$/.exec(campo)?.[1]
    if (!chave || INTERNOS.has(chave)) throw erro('Campo que não se pode editar em grupo: «{campo}».', { campo })
    if (!['string', 'number', 'boolean'].includes(typeof valor)) throw erro('Valor inválido para «{campo}».', { campo })
    return { campo, chave, modo, valor }
  })
}

// O que muda numa ficha: { dados (para gravar), mudancas: [[rótulo, antes, depois]] }
export function alteracoesDaFicha(f, alteracoes) {
  const dados = {}
  const mudancas = []
  const chavesDoTipo = new Set((f.expand?.tipo?.campos || []).map((c) => c.chave))
  for (const a of alteracoes) {
    if (a.campo === 'tags' || a.campo === 'contextos') {
      const antes = dados[a.campo] || f[a.campo] || []
      const tem = antes.includes(a.valor)
      const depois = a.modo === 'acrescentar' ? (tem ? antes : [...antes, a.valor]) : antes.filter((x) => x !== a.valor)
      if (depois.length !== antes.length) (dados[a.campo] = depois), mudancas.push([a.campo === 'tags' ? 'etiquetas' : 'contextos', antes, depois])
      continue
    }
    if (a.chave) {
      // (só nos tipos que têm este campo)
      if (!chavesDoTipo.has(a.chave)) continue
      const md = dados.metadados || { ...(f.metadados || {}) }
      const antes = md[a.chave]
      if ((a.modo === 'vazio' && !vazio(antes)) || antes === a.valor) continue
      md[a.chave] = a.valor
      dados.metadados = md
      mudancas.push([a.chave, antes, a.valor])
      continue
    }
    const antes = f[a.campo]
    if ((a.modo === 'vazio' && !vazio(antes)) || antes === a.valor) continue
    dados[a.campo] = a.valor
    mudancas.push([a.campo, antes, a.valor])
  }
  return { dados, mudancas }
}

export async function editarFontes({ ids, alteracoes, semCopia } = {}) {
  ids = Array.isArray(ids) ? [...new Set(ids.map(String))] : []
  if (!ids.length) throw erro('Nenhuma fonte seleccionada.')
  if (ids.length > 200) throw erro('No máximo 200 fontes de cada vez.')
  const lista = validarAlteracoes(alteracoes)
  await garantirSessao()
  const copia = semCopia ? null : await copiaDeSeguranca('antes-editar-fontes')
  if (copia) log.info(m('Cópia de segurança criada: {copia}', { copia }))

  const linhas = []
  const saltadas = []
  let mudadas = 0
  let iguais = 0
  for (const f of await fontesPorIds(ids)) {
    const nome = `#${f.numero} ${f.titulo || '(sem título)'}`
    if (f.estado === 'processando') {
      saltadas.push({ id: f.id, numero: f.numero, motivo: 'a processar' })
      linhas.push(`SALTADA (a processar)  ${nome}`)
      continue
    }
    const { dados, mudancas } = alteracoesDaFicha(f, lista)
    if (!mudancas.length) {
      iguais++
      linhas.push(`SEM MUDANÇA  ${nome}`)
      continue
    }
    try {
      await pb.collection('fontes').update(f.id, dados)
    } catch (e) {
      saltadas.push({ id: f.id, numero: f.numero, motivo: e.message })
      linhas.push(`ERRO  ${nome}: ${e.message}`)
      continue
    }
    mudadas++
    linhas.push(`MUDADA  ${nome}`)
    mudancas.forEach(([k, antes, depois]) => linhas.push(`    ${k}: ${mostrar(antes)} → ${mostrar(depois)}`))
    // (o nome do ficheiro e a pasta podem depender do que mudou)
    if (f.ficheiro && mudancas.some(([k]) => NO_NOME.has(k))) {
      try {
        const r = await reorganizar(f.id)
        if (r.ficheiro !== f.ficheiro) linhas.push(`    ficheiro: ${f.ficheiro} → ${r.ficheiro}`)
      } catch (e) {
        linhas.push(`    (ficheiro não renomeado: ${e.message})`)
      }
    }
  }

  const d = new Date()
  const pastaRegistos = path.resolve(PASTAS.dados, '..', 'registos')
  const registo = path.join(pastaRegistos, `editar-fontes-${d.toISOString().slice(0, 10)}.txt`)
  fs.mkdirSync(pastaRegistos, { recursive: true })
  const pedido = lista.map((a) => `${a.chave || a.campo} = «${mostrar(a.valor)}» (${a.modo})`).join('; ')
  fs.appendFileSync(registo, `\n== ${d.toLocaleString('pt-PT')} · ${pedido} · ${mudadas} mudadas, ${iguais} sem mudança, ${saltadas.length} saltadas${copia ? ` · cópia ${copia}` : ''}\n${linhas.join('\n')}\n`)
  log.info(
    m('Edição em grupo ({pedido}): {mudadas} fichas mudadas, {iguais} sem mudança{resto}', {
      pedido,
      mudadas,
      iguais,
      resto: saltadas.length ? m(', {n} saltadas', { n: saltadas.length }) : '',
    })
  )
  return { mudadas, iguais, saltadas, copia, registo }
}
