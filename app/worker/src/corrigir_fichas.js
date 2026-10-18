// Correção das fichas antigas com os defeitos reparados a 2/10/2026 (PR 8):
// - «[s.n.]» e «[S.l.]» na editora ou no local: ficam vazios;
// - imprenta inteira da Gallica na editora ("À Lyon : par Michel du Bois, M.D.LVI"): local «Lyon», editora «Michel du Bois»
//   (só nas fichas da Gallica, só quando se separa com segurança e o local da ficha não diz outra coisa);
// - título terminado em «pdf» (vem do nome do ficheiro): NÃO se muda sozinho — a ficha fica por rever, com uma nota que
//   pergunta ao Pedro se tira o «pdf» e mostra o título proposto (decisão do Pedro, 2/10/2026).
// Uso: ./biblioteca corrigir-fichas [--aplicar]
import { pb } from './pb.js'
import { semNomeLocal, separarImprenta } from './fontes_externas/util.js'

const TITULO_PDF = /(?:[\s._-]+pdf)+$/i
export const notaTituloPdf = (proposto) => `Rever o título: termina em «pdf», que vem do nome do ficheiro. Tirar o «pdf» e ficar «${proposto}»?`

// O que há a corrigir numa ficha → { mudar: campos a gravar, feito: [descrições], perguntas: [descrições], conflitos: [...] }
export function correcoesDaFicha(f) {
  const mudar = {}
  const feito = []
  const perguntas = []
  const conflitos = []
  const md = f.metadados || {}
  let editora = String(f.editora || '')
  let local = String(f.local || '')
  // 1. «[s.n.]» / «[S.l.]»
  if (editora && !semNomeLocal(editora)) feito.push(`editora «${editora}» → vazia`), (editora = '')
  if (local && !semNomeLocal(local)) feito.push(`local «${local}» → vazio`), (local = '')
  // 2. imprenta inteira da Gallica
  const daGallica = /gallica/i.test(`${f.origem || ''} ${f.url || ''}`)
  const imp = daGallica && editora ? separarImprenta(editora) : null
  if (imp && imp.editora !== editora) {
    if (local && imp.local && local.toLowerCase() !== imp.local.toLowerCase()) conflitos.push(`editora «${editora}»: o local da ficha («${local}») não é o da imprenta («${imp.local}»); fica como está`)
    else {
      feito.push(`editora «${editora}» → editora «${imp.editora}»${imp.local && !local ? `, local «${imp.local}»` : ''}`)
      editora = imp.editora
      if (!local) local = imp.local
    }
  }
  if (editora !== String(f.editora || '')) mudar.editora = editora
  if (local !== String(f.local || '')) mudar.local = local
  // 3. título terminado em «pdf»: pergunta na nota, ficha por rever
  const titulo = String(f.titulo || '')
  const proposto = titulo.replace(TITULO_PDF, '').trim()
  if (proposto && proposto !== titulo) {
    const nota = notaTituloPdf(proposto)
    if (!String(md.nota_revisao || '').includes(nota)) {
      perguntas.push(`título «${titulo}» → nota a perguntar se fica «${proposto}»; ficha por rever`)
      mudar.metadados = { ...md, nota_revisao: [md.nota_revisao, nota].filter(Boolean).join(' ') }
      if (f.estado !== 'a_rever') mudar.estado = 'a_rever'
    }
  }
  return { mudar, feito, perguntas, conflitos }
}

export async function corrigirFichas({ aplicar = false, servico } = {}) {
  const lista = await pb.collection('fontes').getFullList({
    filter: "editora ~ 's.n' || editora ~ 's.l' || editora ~ 'sine' || local ~ 's.l' || local ~ 's.n' || local ~ 'sine' || editora ~ ' : ' || titulo ~ 'pdf'",
    fields: 'id,numero,titulo,editora,local,estado,origem,url,metadados',
    sort: 'numero',
  })
  const fichas = lista.map((f) => ({ ...f, ...correcoesDaFicha(f) })).filter((f) => Object.keys(f.mudar).length || f.conflitos.length)
  let feitas = 0
  let saltadas = 0
  if (aplicar) {
    for (const f of fichas) {
      if (!Object.keys(f.mudar).length) continue
      // (a reanálise pode ter mexido nela entretanto: reler, e não tocar nas que mudaram ou estão a ser processadas)
      const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,titulo,editora,local,estado' })
      if (atual.estado === 'processando' || atual.titulo !== f.titulo || atual.editora !== f.editora || atual.local !== f.local) {
        f.saltada = true
        saltadas++
        continue
      }
      await pb.collection('fontes').update(f.id, f.mudar)
      // (a editora pode fazer parte do nome ou da pasta do ficheiro organizado)
      if ('editora' in f.mudar && servico) {
        try {
          await servico('reorganizar', { id: f.id })
        } catch (e) {
          f.aviso = e.message
        }
      }
      feitas++
    }
  }
  return { fichas, feitas, saltadas }
}
