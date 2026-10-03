// Transcrições em MIDI (e noutros formatos de notação): lotes de ficheiros numerados de uma coleção
// ("rossi_1608_1.mid", "rossi_1608_2.mid"…) numa só ficha, e identificação pelo compositor e ano do
// nome do ficheiro: primeiro o livro que já está na biblioteca, depois um impresso único no RISM.
import path from 'node:path'
import { pb } from './pb.js'
import * as F from './ficheiros.js'
import { NAO_AUTOR } from './musica_antiga.js'
import { NAO_APELIDO } from './capa.js'
import { pessoa } from './fontes_externas/util.js'
import { rismImpressosDe, rismFonte } from './fontes_externas/musicologicas.js'

export const eMidi = (f) => /\.(mid|midi|kar)$/i.test(String(f || ''))

// Nome do formato, para o título ("— transcrição MIDI", "— transcrição MusicXML"…)
const FORMATOS = { mid: 'MIDI', midi: 'MIDI', kar: 'MIDI', mus: 'Finale', musx: 'Finale', sib: 'Sibelius', mscz: 'MuseScore', mscx: 'MuseScore', musicxml: 'MusicXML', mxl: 'MusicXML', dorico: 'Dorico', ly: 'LilyPond', mei: 'MEI', gp: 'Guitar Pro', gpx: 'Guitar Pro' }
export const formatoDe = (f) => FORMATOS[path.extname(String(f || '')).slice(1).toLowerCase()] || ''

// Nomes de lote que não identificam uma coleção ("track_1", "sonata_2", "01")
const GENERICOS = /^(track|faixa|pista|midi|song|canzone?|piece|pezzo|brano|part|parte|movement|mov|andamento|untitled|sem titulo|file|ficheiro|new|novo|audio|sequence|seq|demo|test|teste|sd anonimo|anonimo|anon|copy|copia)$/i

// Chave do lote: o nome até ao 1.º número de peça (1 a 3 algarismos, com ou sem letras: "9", "01", "2b", "3rec");
// um ano (4 algarismos) faz parte do nome. "rossi_1608_9" → "rossi_1608"; "telemann_trietto_2b_1" e
// "telemann_trietto_3a_rec" → "telemann_trietto". Sem número de peça ou nome genérico → ''
const partes = (nome) => path.basename(String(nome || ''), path.extname(String(nome || ''))).normalize('NFC').toLowerCase().trim().split(/[\s_.,()-]+/).filter(Boolean)
const PECA = /^\d{1,3}[a-z]*$/
export function chaveLote(nome) {
  const t = partes(nome)
  const i = t.findIndex((x, k) => k > 0 && PECA.test(x))
  if (i < 1) return ''
  const chave = t.slice(0, i).join('_')
  const palavras = chave.replace(/_/g, ' ')
  if ((palavras.match(/\p{L}/gu) || []).length < 3 || GENERICOS.test(palavras) || NAO_AUTOR.test(palavras)) return ''
  return chave
}
// Chaves mais curtas a que uma variante pode pertencer ("quantz_duetto_flute" → "quantz_duetto"), com 2+ palavras
export function chavesDoLote(chave) {
  const t = String(chave || '').split('_').filter(Boolean)
  const r = t.length ? [t.join('_')] : []
  // (só se tiram palavras do fim, nunca números nem anos: "bach_bwv_1013" não é uma variante de "bach_bwv")
  for (let n = t.length - 1; n >= 2 && /^\p{L}+$/u.test(t[n]); n--) r.push(t.slice(0, n).join('_'))
  return r
}
// Número da peça (o 1.º número depois do nome: "telemann_trietto_2b_1" → "2")
export function numeroNoLote(nome) {
  const t = partes(nome)
  const x = t.find((y, k) => k > 0 && PECA.test(y))
  return x ? String(Number(/^\d+/.exec(x)[0])) : ''
}

const SUFIXO = /\s+—\s+transcriç(?:ão|ões)\b.*$/i
const TODO_MAIUSCULAS = (s) => s === s.toUpperCase() && /\p{Lu}{3}/u.test(s)

// Título curto do livro: sem notas "[Venezia, …]", até à 1.ª vírgula / "..." / "a tre voci"
export function tituloCurto(t) {
  let s = String(t || '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s*\[(?:!|sic)\]/gi, '').replace(SUFIXO, '').trim()
  s = s.split(/\s*(?:,|\.\.\.|…|;|:)\s*/)[0]
  if (s.length > 70) s = s.slice(0, 70).replace(/\s+\S*$/, '') + '…'
  // (em maiúsculas: só a 1.ª letra e os numerais romanos, "SONATA I" → "Sonata I")
  if (TODO_MAIUSCULAS(s)) s = (s.charAt(0) + s.slice(1).toLowerCase()).replace(/\b[ivxlc]+\b/gi, (r) => (/^(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(r) && !/^(di|li|mi|ci)$/i.test(r) ? r.toUpperCase() : r))
  return s.trim()
}

// "… — transcrição MIDI (n.º 9)" / "… — transcrições MIDI"; sem livro identificado: "Rossi 1608 — transcrições MIDI"
export function tituloTranscricao(base, { formato = 'MIDI', n = 1, numero = '' } = {}) {
  const nome = n > 1 ? `transcrições ${formato}` : `transcrição ${formato}${numero ? ` (n.º ${numero})` : ''}`
  return `${base} — ${nome}`
}
export function tituloGenerico(chave) {
  const s = String(chave || '').replace(/[\s_.-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Metadados de uma ficha de lote (o nº de ficheiros acompanha as junções)
export function metadadosDoLote(md, chave, n, formato = 'MIDI') {
  return { ...(md || {}), lote: chave, formato: `${n} ficheiros ${formato} (um por peça)` }
}

const numeroFicha = (n) => '#' + String(n || '').padStart(4, '0')
const apelidoDe = (a) => F.semAcentos(a?.apelido || a?.literal || '').toLowerCase()

// O livro do compositor nesse ano (ex.: Rossi, 1608 → «Il secondo libro delle sinfonie e gagliarde»)
// Devolve { origem, titulo, autores, data, editora, local, url, metadados, ficha? } ou { candidatos } (vários) ou null
export async function livroDoCompositor({ apelido, ano, chave = '' }, { email, excluirId = '' } = {}) {
  const alvo = F.semAcentos(apelido || '').toLowerCase()
  // (Anónimo / Vários não identificam um livro)
  if (!alvo || /^(anonimo|anon|varios|various)$/.test(alvo) || !/^\d{4}$/.test(String(ano || ''))) return null

  // 1) Já está na biblioteca (o PDF do impresso): mesmo compositor, mesmo ano, e não é outra transcrição
  let lista = []
  try {
    lista = await pb.collection('fontes').getFullList({
      filter: pb.filter("autores ~ {:a} && data ~ {:ano} && ficheiro != '' && id != {:id}", { a: apelido, ano: String(ano), id: excluirId }),
      fields: 'id,numero,titulo,autores,data,editora,local,url,metadados,estado,ficheiro,ficheiro_original',
    })
  } catch (_) {}
  lista = lista.filter(
    (f) => /\.pdf$/i.test(f.ficheiro) && (/(\d{4})/.exec(f.data || '') || [])[1] === String(ano) && apelidoDe((f.autores || [])[0]) === alvo && !formatoDe(f.ficheiro_original) && !f.metadados?.lote
  )
  // (um PDF que é ele próprio uma peça numerada, "cerreto_1601_1.pdf", não é o livro inteiro)
  lista = lista.filter((f) => !chaveLote(f.ficheiro_original))
  // (o PDF com o mesmo nome do lote, "rossi_1608.pdf", é o mais seguro; depois o único, ou o único completo)
  const mesmoNome = chave ? lista.filter((f) => path.basename(f.ficheiro_original || '', path.extname(f.ficheiro_original || '')).toLowerCase() === chave) : []
  const completos = lista.filter((f) => f.estado === 'completo')
  const livro = mesmoNome.length === 1 ? mesmoNome[0] : lista.length === 1 ? lista[0] : completos.length === 1 ? completos[0] : null
  // (só uma ficha já confirmada dá o título; uma por rever pode ter um título mal lido: aí vale o RISM,
  // e a transcrição fica na mesma ligada a esse PDF)
  if (livro && livro.estado === 'completo') {
    const md = livro.metadados || {}
    return {
      origem: 'biblioteca',
      ficha: livro,
      titulo: tituloCurto(livro.titulo),
      autores: livro.autores,
      data: String(ano),
      editora: livro.editora || '',
      local: livro.local || '',
      url: livro.url || '',
      metadados: {
        ...Object.fromEntries(['titulo_fonte', 'titulo_uniforme', 'rism', 'rism_serie', 'exemplares'].filter((k) => md[k]).map((k) => [k, md[k]])),
        ...(md.titulo_fonte ? {} : { titulo_fonte: livro.titulo }),
        fonte_original: `Impresso ${ano}${md.rism_serie ? ` (${md.rism_serie})` : ''}; PDF do livro na ficha ${numeroFicha(livro.numero)}`,
      },
    }
  }

  // 2) RISM: impressos desse compositor nesse ano. Um só: é esse; vários: ficam como sugestões
  const ids = await rismImpressosDe(apelido, ano, email)
  if (!ids.length) return null
  const cands = []
  for (const id of ids.slice(0, 6)) {
    try {
      cands.push(await rismFonte(id, email))
    } catch (_) {}
  }
  if (cands.length !== 1) return cands.length ? { candidatos: cands } : null
  const c = cands[0]
  const m = c.metadados || {}
  const editora = (/\[[^,\]]+,\s*([^\]]+)\]\s*$/.exec(c.titulo) || [])[1] || c.editora || ''
  const pdf = livro ? `; PDF do livro na ficha ${numeroFicha(livro.numero)}` : ''
  return {
    origem: 'RISM',
    ...(livro ? { ficha: livro } : {}),
    titulo: tituloCurto(c.titulo),
    autores: c.autores,
    data: String(ano),
    editora,
    local: c.local || '',
    url: c.url,
    metadados: {
      titulo_fonte: c.titulo.replace(/\s*\[[^\]]*\]\s*$/, ''),
      ...Object.fromEntries(['titulo_uniforme', 'rism', 'rism_serie', 'exemplares'].filter((k) => m[k]).map((k) => [k, m[k]])),
      fonte_original: `Impresso ${ano}${m.rism_serie ? ` (${m.rism_serie})` : ''}${pdf}`,
    },
  }
}

// O PDF da coleção com o mesmo nome do lote ("fluythemel" → fluythemel.pdf; "fischer_divert" →
// fischer_divertissement.pdf; "braun_suite" → braun_suites.pdf): só fichas completas, que não sejam elas
// próprias uma peça numerada ("raverii_10.pdf"). Vários com títulos diferentes: não se escolhe.
export async function livroPeloNome(chave, { excluirId = '' } = {}) {
  if (!chave) return null
  let lista = []
  try {
    lista = await pb.collection('fontes').getFullList({
      filter: pb.filter("estado = 'completo' && ficheiro != '' && ficheiro_original ~ {:c} && id != {:id}", { c: chave.split('_')[0], id: excluirId }),
      fields: 'id,numero,titulo,autores,data,editora,local,url,metadados,estado,ficheiro,ficheiro_original',
      sort: 'numero',
    })
  } catch (_) {}
  const cands = lista
    .filter((f) => /\.pdf$/i.test(f.ficheiro) && !formatoDe(f.ficheiro_original) && !f.metadados?.lote && !chaveLote(f.ficheiro_original))
    .map((f) => ({ f, base: partes(f.ficheiro_original).filter((x) => x !== 'pdf').join('_') }))
    // (o mesmo nome, ou o nome do lote prolongado só com letras: "divert" → "divertissement", "suite" → "suites")
    .filter(({ base }) => base === chave || (base.startsWith(chave) && /^[\p{L}_]+$/u.test(base.slice(chave.length))))
  if (!cands.length) return null
  const exatos = cands.filter((c) => c.base === chave)
  const grupo = exatos.length ? exatos : cands
  const titulos = new Set(grupo.map((c) => tituloCurto(c.f.titulo).toLowerCase()))
  if (titulos.size > 1) return { ambiguo: grupo.map((c) => `#${c.f.numero}`) }
  const livro = grupo[0].f
  const md = livro.metadados || {}
  const ano = (/(\d{4})/.exec(livro.data || '') || [])[1] || ''
  return {
    origem: 'biblioteca',
    ficha: livro,
    // (a ficha do PDF foi quase sempre lida pela IA na 1.ª página: o lote herda tudo mas fica por rever)
    porRever: true,
    titulo: tituloCurto(livro.titulo),
    autores: livro.autores || [],
    data: livro.data || '',
    editora: livro.editora || '',
    local: livro.local || '',
    url: livro.url || '',
    metadados: {
      ...Object.fromEntries(['titulo_fonte', 'titulo_uniforme', 'rism', 'rism_serie', 'exemplares'].filter((k) => md[k]).map((k) => [k, md[k]])),
      ...(md.titulo_fonte ? {} : { titulo_fonte: livro.titulo }),
      fonte_original: `${ano ? `Impresso/edição ${ano}` : 'Coleção'}${md.rism_serie ? ` (${md.rism_serie})` : ''}; PDF na ficha ${numeroFicha(livro.numero)} (mesmo nome de ficheiro)`,
    },
  }
}

// A ficha de um lote já existente: outra ficha cujo ficheiro original tem a mesma chave ("rossi_1608_1.mid")
export async function fichaDoLote(chave, ext, excluirId = '') {
  if (!chave) return null
  const lista = await pb.collection('fontes').getFullList({
    filter: pb.filter('ficheiro_original ~ {:c} && id != {:id}', { c: chave.split('_')[0], id: excluirId }),
    fields: 'id,numero,titulo,estado,ficheiro,ficheiro_original,ficheiros_extra,metadados',
    sort: 'numero',
  })
  const doFormato = lista.filter((f) => f.ficheiro && formatoDe(f.ficheiro_original) === formatoDe(`x${ext}`))
  // (a chave exata primeiro; depois uma mais curta, "quantz_duetto" para "quantz_duetto_flute_6")
  for (const k of chavesDoLote(chave)) {
    const iguais = doFormato.filter((f) => f.metadados?.lote === k || chaveLote(f.ficheiro_original) === k)
    // (a que já tem ficheiros adicionais, senão a mais antiga)
    const f = iguais.find((x) => (x.ficheiros_extra || []).length) || iguais[0]
    if (f) return f
  }
  return null
}

// Campos a gravar numa ficha de transcrição: com o livro identificado (título, compositor, data, editor,
// RISM, ligação ao PDF) ou, sem ele, só o título genérico do lote e as sugestões do RISM
export function camposDaTranscricao({ titulo, metadados }, livro, { formato = 'MIDI', n = 1, chave = '', numero = '' } = {}) {
  const r = {}
  const edicao = `Transcrição digital em ${formato}`
  if (livro?.titulo) {
    r.titulo = tituloTranscricao(livro.titulo, { formato, n, numero: n === 1 ? numero : '' })
    if (livro.autores?.length) r.autores = livro.autores
    if (String(livro.data || '').trim()) r.data = livro.data
    for (const k of ['editora', 'local', 'url']) if (livro[k]) r[k] = livro[k]
    // (só fica completa com autor e data, como as outras)
    const completa = !livro.porRever && livro.autores?.length && String(livro.data || '').trim()
    Object.assign(r, { estado: completa ? 'completo' : 'a_rever', candidatos: [], origem: livro.origem })
    // ("herdado_de": quando a ficha do PDF for corrigida, a regra da base de dados corrige também o lote)
    r.metadados = { ...(metadados || {}), ...livro.metadados, edicao, ...(livro.ficha ? { herdado_de: numeroFicha(livro.ficha.numero) } : {}) }
  } else {
    r.metadados = { ...(metadados || {}) }
    if (n > 1 && chave) r.titulo = tituloTranscricao(SUFIXO.test(titulo || '') ? titulo.replace(SUFIXO, '') : tituloGenerico(chave), { formato, n })
    // (numa ficha de lote, as sugestões antigas eram só da 1.ª peça: ficam só as do livro)
    if (n > 1 && chave) r.candidatos = []
    // Vários impressos possíveis: sugestões já com o título da transcrição (basta escolher uma na ficha)
    if (livro?.candidatos?.length) {
      r.candidatos = livro.candidatos.map((c) => ({
        ...c,
        titulo: tituloTranscricao(tituloCurto(c.titulo), { formato, n, numero: n === 1 ? numero : '' }),
        metadados: { ...(c.metadados || {}), titulo_fonte: String(c.titulo || '').replace(/\s*\[[^\]]*\]\s*$/, ''), edicao },
      }))
    }
  }
  if (n > 1 && chave) r.metadados = metadadosDoLote(r.metadados, chave, n, formato)
  return r
}

// A ficha do livro (PDF) passa a apontar para a das transcrições
export async function ligarAoLivro(numeroLivro, ficha, { n = 1, formato = 'MIDI' } = {}) {
  if (!numeroLivro || !ficha?.numero) return
  const livro = await pb.collection('fontes').getFirstListItem(`numero = ${Number(numeroLivro)}`)
  const chaveMd = formato === 'MIDI' ? 'transcricao_midi' : 'transcricao'
  const valor = `${numeroFicha(ficha.numero)} (${n > 1 ? `${n} ficheiros ${formato}` : `transcrição ${formato}`})`
  const atual = String(livro.metadados?.[chaveMd] || '')
  if (atual.includes(numeroFicha(ficha.numero)) && atual === valor) return
  // (várias transcrições do mesmo livro: ficam todas, separadas por "; ", que o campo de uma linha da ficha aguenta)
  const outras = atual.split(/\s*[;\n]\s*/).filter((l) => l && !l.startsWith(numeroFicha(ficha.numero)))
  await pb.collection('fontes').update(livro.id, { metadados: { ...(livro.metadados || {}), [chaveMd]: [...outras, valor].join('; ') } })
}
export const livroDaFicha = (f) => (/ficha #(\d+)/.exec(f?.metadados?.fonte_original || '') || [])[1] || ''

// ---------------------------------------------------------------------------
// Lotes que já estão na biblioteca (fichas MIDI por rever, uma por peça): simulação e, com --aplicar,
// junção numa ficha por lote (pelo serviço, que move os ficheiros) e identificação do livro.
// Fichas completas ficam de fora (podem ter sido identificadas uma a uma); as que estão a ser
// processadas também (a reanálise pode estar a mexer nelas).
export async function lotesExistentes({ aplicar = false, excluir = [], email = '', servico, doNome } = {}) {
  const todas = await pb.collection('fontes').getFullList({
    filter: "ficheiro != '' && (ficheiro_original ~ '.mid' || ficheiro_original ~ '.kar')",
    fields: 'id,numero,titulo,estado,autores,data,ficheiro,ficheiro_original,ficheiros_extra,metadados',
    sort: 'numero',
  })
  const grupos = new Map()
  for (const f of todas.filter((f) => eMidi(f.ficheiro_original))) {
    const k = f.metadados?.lote || chaveLote(f.ficheiro_original)
    if (!k) continue
    grupos.set(k, [...(grupos.get(k) || []), f])
  }
  // Variantes ("quantz_duetto_flute_6", "quantz_duetto_recorder_6") juntam-se ao lote mais curto ("quantz_duetto")
  for (const k of [...grupos.keys()].sort((a, b) => b.length - a.length)) {
    const alvo = chavesDoLote(k).slice(1).find((c) => grupos.has(c))
    if (alvo) {
      grupos.set(alvo, [...grupos.get(alvo), ...grupos.get(k)])
      grupos.delete(k)
    }
  }
  const ordem = (f) => Number(numeroNoLote(f.ficheiro_original) || 0)
  const porOrdem = (a, b) => ordem(a) - ordem(b) || a.ficheiro_original.localeCompare(b.ficheiro_original, 'pt', { numeric: true })
  const relatorio = []
  for (const [chave, lista] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const principalExistente = lista.find((f) => (f.ficheiros_extra || []).length)
    const soltas = lista.filter((f) => f !== principalExistente && f.estado === 'a_rever' && !(f.ficheiros_extra || []).length).sort(porOrdem)
    const principal = principalExistente || soltas.shift()
    // (um lote já juntado, ainda por rever e com título genérico, também pode agora ser identificado)
    const soIdentificar = principal && !soltas.length && principal.estado === 'a_rever' && /\s—\stranscriç/.test(principal.titulo || '')
    if (!principal || (!soltas.length && !soIdentificar)) continue
    const linha = { chave, principal: principal.numero, juntar: soltas.map((f) => f.numero), total: 1 + (principal.ficheiros_extra || []).length + soltas.length, fora: lista.filter((f) => f !== principal && !soltas.includes(f)).map((f) => `#${f.numero} (${f.estado})`) }
    if (excluir.includes(chave)) {
      relatorio.push({ ...linha, estado: 'excluído' })
      continue
    }
    if ([principal, ...soltas].some((f) => f.estado === 'processando')) {
      relatorio.push({ ...linha, estado: 'a ser processado agora: fica para depois' })
      continue
    }
    const nome = doNome(principal.ficheiro_original)
    const ano = nome.ano || ''
    let livro = null
    let autor = null
    try {
      autor = principal.autores?.length ? null : await autorDoNome(principal.ficheiro_original, { ano: ano || nome.anoAntigo, email, papel: 'compositor' })
    } catch (_) {}
    const apelido = principal.autores?.[0]?.apelido || autor?.apelido || ''
    // 1) o PDF da coleção com o mesmo nome; 2) compositor + ano (biblioteca, RISM)
    try {
      livro = await livroPeloNome(chave, { excluirId: principal.id })
    } catch (_) {}
    if (livro?.ambiguo) {
      linha.aviso = `vários PDFs com este nome e títulos diferentes (${livro.ambiguo.join(', ')}): não se escolhe`
      livro = null
    }
    if (!livro && apelido && /^\d{4}$/.test(ano)) {
      try {
        livro = await livroDoCompositor({ apelido, ano, chave }, { email, excluirId: principal.id })
      } catch (e) {
        linha.aviso = `RISM: ${e.message}`
      }
    }
    const extras = (f) => ({
      ...(autor && !livro?.autores?.length ? { autores: [pessoaDe(autor, 'compositor')] } : {}),
      ...(ano && !f.data && !livro?.titulo ? { data: ano } : {}),
    })
    const campos = { ...camposDaTranscricao(principal, livro, { formato: 'MIDI', n: linha.total, chave }), ...extras(principal) }
    linha.titulo = campos.titulo || principal.titulo
    linha.autor = (campos.autores || principal.autores || []).map((a) => [a.nome, a.apelido].filter(Boolean).join(' ')).join('; ') + (campos.data || principal.data ? `, ${campos.data || principal.data}` : '')
    linha.identificado = livro?.titulo ? (livro.origem === 'biblioteca' ? `livro na biblioteca, ficha #${livro.ficha.numero}` : `RISM ${livro.metadados.rism_serie || livro.url}`) : livro?.candidatos ? `${livro.candidatos.length} impressos possíveis no RISM (ficam como sugestões)` : 'não identificado (título genérico, fica por rever)'
    if (soIdentificar && !livro?.titulo) continue
    if (aplicar) {
      if (soltas.length) await servico('juntar', { id: principal.id, ids: soltas.map((f) => f.id), semCopia: true })
      const atual = await pb.collection('fontes').getOne(principal.id)
      await pb.collection('fontes').update(principal.id, { ...camposDaTranscricao(atual, livro, { formato: 'MIDI', n: 1 + (atual.ficheiros_extra || []).length, chave }), ...extras(atual) })
      const final = await servico('reorganizar', { id: principal.id })
      if (livro?.ficha) await ligarAoLivro(livro.ficha.numero, final, { n: 1 + (final.ficheiros_extra || []).length })
      linha.estado = `feito: ${final.ficheiro}`
    }
    relatorio.push(linha)
  }
  return relatorio
}

// ---------------------------------------------------------------------------
// Autor pelo nome do ficheiro, por indícios (em vez de listas de exceções sem fim):
// a 1.ª palavra ("rossi", "telemann", "boismortier") é aceite como autor se (1) já for autor/compositor
// em pelo menos 2 fichas completas da biblioteca, ou (2) com um ano no nome, o RISM tiver impressos
// com esse apelido nesse ano. Caso contrário fica só a hipótese (não se grava).
let conhecidos = null
let conhecidosQuando = 0
export async function autoresConhecidos() {
  if (conhecidos && Date.now() - conhecidosQuando < 600000) return conhecidos
  const mapa = new Map()
  const lista = await pb.collection('fontes').getFullList({ filter: "estado = 'completo' && autores ~ 'apelido'", fields: 'autores' })
  for (const f of lista) {
    for (const a of (f.autores || []).slice(0, 3)) {
      const k = F.semAcentos(a.apelido || '').toLowerCase().trim()
      if (!k || /\s/.test(k) && k.length > 30) continue
      const e = mapa.get(k) || { n: 0, nomes: new Map(), papeis: new Map(), apelido: a.apelido }
      e.n++
      const nome = String(a.nome || '').trim()
      if (nome) e.nomes.set(nome, (e.nomes.get(nome) || 0) + 1)
      e.papeis.set(a.papel || 'autor', (e.papeis.get(a.papel || 'autor') || 0) + 1)
      // (a grafia mais frequente do apelido: "Rossi", não "ROSSI")
      if (a.apelido && a.apelido !== a.apelido.toUpperCase()) e.apelido = a.apelido
      mapa.set(k, e)
    }
  }
  conhecidos = new Map([...mapa].filter(([, e]) => e.n >= 2))
  conhecidosQuando = Date.now()
  return conhecidos
}
const maisFrequente = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''

export async function autorDoNome(ficheiro, { ano = '', email = '', papel = '' } = {}) {
  const base = path.basename(String(ficheiro || ''), path.extname(String(ficheiro || ''))).normalize('NFC')
  const palavra = base.split(/[_\s.,;()-]+/)[0] || ''
  if (!/^[\p{L}'’]{3,}$/u.test(palavra) || NAO_AUTOR.test(palavra) || NAO_APELIDO.test(palavra) || GENERICOS.test(palavra)) return null
  const k = F.semAcentos(palavra).toLowerCase()
  if (/^(anon|anonimo|anonymous|anonymus|anonyme)$/.test(k)) return { literal: 'Anónimo', papel: papel || 'compositor', conhecido: true }
  const e = (await autoresConhecidos()).get(k)
  if (e) {
    // Nome próprio só quando a biblioteca é unânime (há vários Rossi, Bach, Scarlatti…)
    const nomes = [...e.nomes.entries()]
    const total = nomes.reduce((s, [, n]) => s + n, 0)
    const [nome, n] = nomes.sort((a, b) => b[1] - a[1])[0] || ['', 0]
    const unanime = total >= 3 && n === total
    return { apelido: e.apelido || palavra, ...(unanime ? { nome } : {}), papel: papel || maisFrequente(e.papeis) || 'compositor', conhecido: true }
  }
  if (/^\d{4}$/.test(String(ano || ''))) {
    try {
      if ((await rismImpressosDe(palavra, ano, email)).length) {
        const p = pessoa(palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase(), 'compositor')
        return p ? { ...p, conhecido: false } : null
      }
    } catch (_) {}
  }
  return null
}

// A pessoa a gravar (sem o indicador "conhecido")
export const pessoaDe = (a, papel = '') => (a.literal ? { literal: a.literal, papel: papel || a.papel } : { apelido: a.apelido, ...(a.nome ? { nome: a.nome } : {}), papel: papel || a.papel })
