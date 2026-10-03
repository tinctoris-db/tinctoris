// Revisão dos números de catálogo que vieram da IA local (ou de pesquisas a partir deles).
// A IA inventa números quando não os vê ("BWV 1047" em partituras de Telemann ou em minuetes).
// Para cada ficha:
//   1. o nome do ficheiro dá o número ("Cantata nº 093.pdf" de Bach → BWV 93): fica esse;
//   2. o número está escrito no nome do ficheiro, no título impresso ou no texto: fica;
//   3. outro número está escrito no nome do ficheiro ou no título impresso: passa a ser esse;
//   4. senão, fica só se a obra do IMSLP bater com o título impresso;
//   5. senão, passa a "Nº de catálogo sugerido pela IA (não confirmado)".
// Títulos normalizados do IMSLP que vinham de um número errado (ou que as regras novas recusam) voltam ao
// título impresso; com o número corrigido, procura-se de novo o título normalizado.
import { pb } from './pb.js'
import { catalogoDe, catalogoConfirmado, catalogoPeloNome, numeroNoNome, eIntervalo, obraPorCatalogo, obraCompativel, obraPlausivel, aplicarObra, compositorDe } from './fontes_externas/obras.js'
import { normalizar } from './fontes_externas/util.js'

const mesmo = (a, b) => {
  const x = catalogoDe(a)
  const y = catalogoDe(b)
  return !!x && !!y && normalizar(x.codigo.replace(/\s+No\.\d+$/, '')) === normalizar(y.codigo.replace(/\s+No\.\d+$/, ''))
}

// Título impresso (antes do título normalizado do IMSLP)
const impressoDe = (f) => f.metadados?.titulo_fonte || f.titulo

// Volta ao título impresso e retira o que veio da obra do IMSLP
function semObra(f, md) {
  const alt = { titulo: impressoDe(f) }
  delete md.titulo_fonte
  delete md.imslp
  delete md.data_composicao
  return alt
}

async function textosDe(ids) {
  const mapa = new Map()
  for (let i = 0; i < ids.length; i += 80) {
    const bloco = ids.slice(i, i + 80)
    const r = await pb.collection('textos').getFullList({ filter: bloco.map((id) => `fonte = '${id}'`).join(' || '), fields: 'fonte,conteudo' })
    r.forEach((t) => mapa.set(t.fonte, String(t.conteudo || '').slice(0, 60000)))
  }
  return mapa
}

// Decide o que fazer a uma ficha. Devolve { acao, motivo, alteracoes } (alteracoes = null: nada a mudar)
export async function decidir(f, texto, email) {
  const md = { ...(f.metadados || {}) }
  const impresso = impressoDe(f)
  const comp = compositorDe(f.autores)
  // (sem compositor na ficha, um número BWV já diz que é Bach; o catálogo indica o compositor ao IMSLP)
  const apelido = comp ? comp.apelido : /^\s*BWV/i.test(md.catalogo) ? 'Bach' : ''
  const nome = f.ficheiro_original || ''
  const obraDe = async (cat) => (cat ? obraPorCatalogo(cat, apelido, email, comp?.nome) : null)

  let novo = null
  let motivo = ''
  const doNome = catalogoPeloNome(nome, apelido)
  if (doNome && !mesmo(doNome.codigo, md.catalogo)) (novo = doNome.codigo), (motivo = 'número dado pelo nome do ficheiro')
  else if (doNome || catalogoConfirmado(md.catalogo, [nome, md.nomes_alternativos, impresso, texto]) || numeroNoNome(md.catalogo, nome)) motivo = 'confirmado'
  else {
    // (o título também foi lido pela IA: só conta se o número for de outro catálogo, ex. "Op.1 No.1" em vez de "BWV 1047")
    const familia = (c) => ((/^[A-Za-z]+/.exec(c || '') || [''])[0]).toLowerCase()
    const doTitulo = catalogoDe(impresso)
    const escrito = (!eIntervalo(nome) && catalogoDe(nome)) || (doTitulo && familia(doTitulo.codigo) !== familia(catalogoDe(md.catalogo)?.codigo) ? doTitulo : null)
    if (escrito && !mesmo(escrito.codigo, md.catalogo)) (novo = escrito.codigo), (motivo = 'outro número escrito no nome do ficheiro ou no título')
  }

  // 3. Número corrigido: título impresso de volta e novo título normalizado, se a obra bater
  if (novo) {
    const alt = md.imslp ? semObra(f, md) : {}
    md.catalogo = novo
    delete md.catalogo_ia
    const cat = catalogoDe(novo)
    const obra = await obraDe(cat)
    const base = { ...f, ...alt, metadados: md }
    if (obra && obraCompativel(base.titulo, obra, cat)) return { acao: 'corrigido', motivo, antes: f.metadados.catalogo, depois: novo, alteracoes: aplicarObra(base, obra, cat) }
    return { acao: 'corrigido', motivo, antes: f.metadados.catalogo, depois: novo, alteracoes: { ...alt, metadados: md } }
  }

  // Conjunto de números ("BWV 772–786"): é uma coleção, não uma obra
  if (eIntervalo(md.catalogo)) {
    if (!md.imslp) return { acao: 'mantido', motivo: 'coleção' }
    return { acao: 'titulo-reposto', motivo: 'coleção', alteracoes: { ...semObra(f, md), metadados: md } }
  }

  // 4. Número só da IA: fica se a obra do IMSLP bater com o título impresso
  const cat = catalogoDe(md.catalogo)
  const obra = await obraDe(cat)
  if (!motivo) {
    if (obra && obraPlausivel(impresso, obra, cat)) motivo = 'a obra do IMSLP bate com o título'
    else {
      // 5. Sem confirmação: passa a sugestão
      md.catalogo_ia = md.catalogo
      delete md.catalogo
      const alt = md.imslp ? semObra(f, md) : {}
      return { acao: 'retirado', motivo: 'sem confirmação', antes: md.catalogo_ia, alteracoes: { ...alt, metadados: md } }
    }
  }
  // Número certo, mas o título normalizado já não passa nas regras (coleção ≠ peça, outro compositor…)
  if (md.imslp && (!obra || !obraCompativel(impresso, obra, cat) || normalizar(obra.titulo) !== normalizar(f.titulo))) {
    const alt = semObra(f, md)
    const base = { ...f, ...alt, metadados: md }
    if (obra && obraCompativel(base.titulo, obra, cat)) return { acao: 'titulo-corrigido', motivo, alteracoes: aplicarObra(base, obra, cat) }
    return { acao: 'titulo-reposto', motivo: 'o título normalizado não passa nas regras novas', alteracoes: { ...alt, metadados: md } }
  }
  // (sugestão da IA igual ao número confirmado: repetição a limpar)
  if (md.catalogo_ia && mesmo(md.catalogo_ia, md.catalogo)) {
    delete md.catalogo_ia
    return { acao: 'mantido', motivo: `${motivo} (sugestão repetida retirada)`, alteracoes: { metadados: md } }
  }
  return { acao: 'mantido', motivo }
}

export async function reverCatalogos({ aplicar = false, limite = 0, email = '', escrever = console.log } = {}) {
  let lista = await pb.collection('fontes').getFullList({ filter: "metadados.catalogo != '' && metadados.catalogo != null && (origem = 'IA local' || origem = 'IMSLP')", fields: 'id,numero,titulo,autores,metadados,ficheiro_original,estado' })
  lista = lista.filter((f) => catalogoDe(f.metadados?.catalogo))
  if (limite) lista = lista.slice(0, limite)
  const textos = await textosDe(lista.map((f) => f.id))
  const contagem = {}
  let saltadas = 0
  for (const f of lista) {
    let d
    try {
      d = await decidir(f, textos.get(f.id) || '', email)
    } catch (e) {
      escrever(`#${String(f.numero).padStart(5, '0')}: IMSLP falhou (${e.message})`)
      continue
    }
    contagem[d.acao] = (contagem[d.acao] || 0) + 1
    if (!d.alteracoes) continue
    const n = `#${String(f.numero).padStart(5, '0')}`
    const tit = d.alteracoes.titulo && d.alteracoes.titulo !== f.titulo ? `\n        título: ${f.titulo}\n             → ${d.alteracoes.titulo}` : ''
    if (d.acao === 'corrigido') escrever(`${n}  ${d.antes} → ${d.depois}  (${d.motivo}) | ${impressoDe(f).slice(0, 70)} | ${f.ficheiro_original}${tit}`)
    else if (d.acao === 'retirado') escrever(`${n}  ${d.antes} → sugestão da IA  | ${impressoDe(f).slice(0, 70)} | ${f.ficheiro_original}${tit}`)
    else escrever(`${n}  ${f.metadados.catalogo}: ${d.motivo}${tit}`)
    if (aplicar) {
      // A reanálise pode ter mexido na ficha entretanto: não tocar nas que estão a ser processadas ou mudaram
      const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,titulo,estado,metadados' })
      if (atual.estado === 'processando' || atual.titulo !== f.titulo || atual.metadados?.catalogo !== f.metadados.catalogo) {
        saltadas++
        continue
      }
      await pb.collection('fontes').update(f.id, d.alteracoes)
    }
  }
  return { vistas: lista.length, contagem, saltadas }
}
