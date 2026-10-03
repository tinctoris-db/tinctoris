// Fichas «Completo» identificadas só pela IA local (origem «IA local»): confirmar no IMSLP e no RISM (proposta g),
// aprovada pelo Pedro a 1/10/2026 — primeiro uma simulação com uma amostra). Não usa a IA, só a internet.
//   confirmada     — um catálogo tem a obra com o mesmo compositor (pelo nº de catálogo ou pelo título)
//   diverge        — um catálogo tem a obra com título quase igual mas OUTRO compositor
//   não encontrada — nenhum catálogo a encontra (obra rara, título mal lido, coleção sem título…)
// Com --aplicar (aprovado pelo Pedro a 1/10/2026, «sim, avança»; cópia de segurança antes) — nunca muda título,
// autores nem data, e nada se apaga:
//   confirmada     → fica «Completo», com a ligação ao catálogo em metadados.verificacao
//   diverge / sem compositor → «Por rever», com o que o catálogo diz na nota para rever
//   não encontrada → fica «Completo» com a etiqueta «por confirmar» (filtro «Etiqueta» na lista; tirá-la ao confirmar)
// As fichas já verificadas (metadados.verificacao) saltam-se: o comando pode ser interrompido e retomado.
// Uso: node src/verificar_completas.js [--amostra 200]          (simulação com uma amostra)
//      node src/verificar_completas.js --aplicar [--limite N] [--fichas 6814,2499]   (todas, as primeiras N, ou só estas)
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PORTA, segredo } from './config.js'
import { catalogoDe, obraPorCatalogo, obraCompativel, compositorDe } from './fontes_externas/obras.js'
import { imslpPesquisar, rismPesquisar } from './fontes_externas/academicas.js'
import { semelhanca, contido, normalizar, obterJson } from './fontes_externas/util.js'

// Pesquisa no TEXTO das páginas do IMSLP: uma peça de uma coleção ("13. Sir John Souch his Galiard") não tem página
// própria, mas está na lista de peças da coleção ("Lachrimae, or Seven Tears (Dowland, John)")
async function imslpNoTexto(titulo, apelido) {
  const palavras = nucleo(titulo).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w)).slice(0, 6).join(' ')
  if (!palavras) return []
  const j = await obterJson(`https://imslp.org/api.php?${new URLSearchParams({ action: 'query', list: 'search', srwhat: 'text', srsearch: `${palavras} ${apelido}`.trim(), srlimit: '5', srnamespace: '0', format: 'json' })}`, { email })
  return (j.query?.search || []).map((r) => r.title)
}
const aplicar = process.argv.includes('--aplicar')
const iA = process.argv.indexOf('--amostra')
const amostra = iA > 0 ? Number(process.argv[iA + 1]) || 200 : 200
const iL = process.argv.indexOf('--limite')
const limite = iL > 0 ? Number(process.argv[iL + 1]) || 0 : 0
const iF = process.argv.indexOf('--fichas')
const fichas = iF > 0 ? new Set(String(process.argv[iF + 1] || '').split(',').map(Number)) : null
const ETIQUETA = 'por confirmar'
const hoje = new Date().toISOString().slice(0, 10)
const num = (n) => `#${String(n).padStart(4, '0')}`
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const apelidoDe = (a) => normalizar(a?.apelido || a?.literal || '').split(' ').filter((w) => w.length > 2).pop() || ''
// (grafias diferentes do mesmo apelido: «des Pres»/«des Prez», «Créquillon»/«Crecquillon», «Korsakoff»/«Korsakov»)
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
// («Lasso»/«Lassus»: até 2 letras de diferença quando o apelido é longo e começa da mesma maneira)
const parecido = (w, ap) => w.length > 3 && (distancia(w, ap) <= Math.max(1, Math.floor(ap.length / 4)) || (ap.length >= 5 && w.slice(0, 3) === ap.slice(0, 3) && distancia(w, ap) <= 2))
const mesmoApelido = (nomes, ap) => !!ap && (nomes.includes(ap) || nomes.split(' ').some((w) => parecido(w, ap)))
const nomesDe = (c) => normalizar((c.autores || []).map((a) => [a.literal, a.nome, a.apelido].filter(Boolean).join(' ')).join(' '))
// (título sem o número de catálogo nem a instrumentação entre parênteses, para comparar)
const nucleo = (t) => normalizar(String(t || '').replace(/\([^)]*\)/g, ' ').replace(/\b(BWV|HWV|RV|TWV|QV|K|KV|Op|Wq|H|Hob|BuxWV|SWV|Z)\.?\s*[\d:.]+[a-z]?/gi, ' '))

await garantirSessao()
const defs = await pb.collection('definicoes').getFirstListItem('').catch(() => ({}))
const email = defs.email_contacto
const servico = async (metodo, acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: metodo, headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.statusText)
  return r.json()
}
const todas = await pb.collection('fontes').getFullList({ filter: "estado = 'completo' && origem = 'IA local'", fields: 'id,numero,titulo,autores,data,metadados,expand', sort: 'numero', expand: 'tipo' })
let lista
if (aplicar) {
  lista = todas.filter((f) => !f.metadados?.verificacao && (!fichas || fichas.has(f.numero)))
  if (limite) lista = lista.slice(0, limite)
  console.log(`${todas.length} fichas «Completo» só pela IA; ${lista.length} por verificar agora`)
  console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-verificar-completas')}\n`)
} else {
  // (amostra espalhada por toda a biblioteca: uma em cada N, pela ordem dos números)
  const passo = Math.max(1, Math.floor(todas.length / amostra))
  lista = todas.filter((_, i) => i % passo === 0).slice(0, amostra)
  console.log(`${todas.length} fichas «Completo» só pela IA; amostra de ${lista.length} (uma em cada ${passo})\n`)
}

async function verificar(f, comp, ap) {
  const cat = catalogoDe(f.metadados?.catalogo || '') || catalogoDe(f.titulo)
  let r = { estado: 'não encontrada', como: '', url: '' }
  // 1) Pelo nº de catálogo (o mais seguro)
  if (cat && ap) {
    const obra = await obraPorCatalogo(cat, comp.apelido, email, comp.nome)
    if (obra && obraCompativel(f.titulo, obra, cat)) return { estado: 'confirmada', como: `IMSLP ${cat.codigo}: «${obra.titulo}»`, url: obra.url || '' }
  }
  // 2) Pelo título (e compositor) no IMSLP e no RISM
  const q = { titulo: f.titulo, autor: comp ? [comp.nome, comp.apelido].filter(Boolean).join(' ') : '' }
  const cands = [...(await imslpPesquisar(q, email).catch(() => [])), ...(await rismPesquisar(q, email).catch(() => []))]
  const semAutor = await (ap ? [] : imslpPesquisar({ titulo: f.titulo }, email).catch(() => []))
  for (const c of [...cands, ...semAutor]) {
    const tit = Math.max(semelhanca(nucleo(f.titulo), nucleo(c.titulo)), contido(nucleo(f.titulo), nucleo(c.titulo)))
    if (tit < 0.8) continue
    if (mesmoApelido(nomesDe(c), ap)) return { estado: 'confirmada', como: `${c.fonte}: «${c.titulo}» (${nomesDe(c)})`, url: c.url || '' }
    // (ficha sem compositor: o catálogo dá uma sugestão, não uma divergência)
    if (nomesDe(c) && r.estado === 'não encontrada') r = { estado: ap ? 'diverge' : 'sem compositor', como: `${c.fonte}: «${c.titulo}» de ${nomesDe(c) || '?'}`, url: c.url || '' }
  }
  // 3) No texto das páginas do IMSLP (peças de coleções): a página tem de ser do mesmo compositor
  if (ap) {
    for (const t of await imslpNoTexto(f.titulo, ap)) {
      const m = /\(([^()]+)\)\s*$/.exec(t)
      const lista = /^List of works by (.+)$/i.exec(t)
      const dono = normalizar(m ? m[1] : lista ? lista[1] : '')
      if (mesmoApelido(dono, ap)) return { estado: 'confirmada', como: `IMSLP (no texto): «${t}»`, url: `https://imslp.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` }
    }
  }
  return r
}

// O resultado na ficha (lida outra vez: pode ter mudado entretanto — reanálise, correção à mão)
async function gravar(f, r, compTexto) {
  const atual = await pb.collection('fontes').getOne(f.id)
  if (atual.estado !== 'completo' || atual.origem !== 'IA local') return 'saltada (mudou entretanto)'
  const md = { ...(atual.metadados || {}), verificacao: { resultado: r.estado, catalogo: r.como, url: r.url, data: hoje } }
  const alt = { metadados: md }
  if (r.estado === 'diverge' || r.estado === 'sem compositor') {
    const nota = r.estado === 'diverge' ? `Verificação no catálogo (${hoje}): ${r.como}; a ficha diz ${compTexto}. Confirmar o compositor.` : `Verificação no catálogo (${hoje}): ${r.como}. A ficha não tem compositor.`
    md.nota_revisao = [md.nota_revisao, nota].filter(Boolean).join('\n')
    alt.estado = 'a_rever'
  }
  if (r.estado === 'não encontrada') alt.tags = [...new Set([...(atual.tags || []), ETIQUETA])]
  await pb.collection('fontes').update(f.id, alt)
  // (por rever: o ficheiro passa para _por_rever, como as outras)
  if (alt.estado) await servico('POST', 'reorganizar', { id: f.id }).catch(() => {})
  return ''
}

const res = { confirmada: [], diverge: [], 'sem compositor': [], 'não encontrada': [], erro: [] }
let feitas = 0
for (const f of lista) {
  // (intensidade «Pausa» na página Atividade: espera)
  if (aplicar) while ((await servico('GET', 'intensidade').catch(() => ({})))?.efetivo === 'pausa') await espera(60000)
  const comp = compositorDe(f.autores)
  const ap = apelidoDe(comp)
  const tipo = f.expand?.tipo?.nome || ''
  const compTexto = comp ? [comp.nome, comp.apelido].filter(Boolean).join(' ') : '(sem compositor)'
  let r
  try {
    r = await verificar(f, comp, ap)
    if (aplicar) {
      const salto = await gravar(f, r, compTexto)
      if (salto) r = { ...r, como: `${r.como} — ${salto}` }
    }
  } catch (e) {
    r = { estado: 'erro', como: e.message }
  }
  res[r.estado].push({ f, tipo, comp: compTexto, ...r })
  process.stdout.write(r.estado === 'confirmada' ? '+' : r.estado === 'diverge' ? '!' : r.estado === 'sem compositor' ? '?' : r.estado === 'erro' ? 'E' : '.')
  if (++feitas % 100 === 0) process.stdout.write(` ${feitas}\n`)
  await espera(800)
}
console.log('\n')
for (const [k, l] of Object.entries(res)) {
  console.log(`===== ${k.toUpperCase()}: ${l.length} (${Math.round((100 * l.length) / Math.max(1, lista.length))}%) =====`)
  for (const x of l) console.log(`${num(x.f.numero)} ${x.tipo.padEnd(10).slice(0, 10)} ${String(x.f.data || '').padEnd(10)} «${String(x.f.titulo).slice(0, 50)}» — ${x.comp}${x.como ? `  → ${x.como}` : ''}`)
  console.log('')
}
if (!aplicar) {
  const p = (k) => Math.round((res[k].length / lista.length) * todas.length)
  console.log(`Estimativa para as ${todas.length}: ~${p('confirmada')} confirmadas, ~${p('diverge')} divergentes, ~${p('sem compositor')} sem compositor, ~${p('não encontrada')} não encontradas.`)
} else console.log(`Gravado: confirmadas com ligação; divergentes e sem compositor → por rever com nota; não encontradas → etiqueta «${ETIQUETA}».`)
process.exit(0)
