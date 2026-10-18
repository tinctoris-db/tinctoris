// PDFs por rever feitos num editor de partituras (Finale, Sibelius, MuseScore, LilyPond…) — Pedro, 17/10/2026.
// São impressões de transcrições, muitas vezes partes cavas da mesma obra, que a IA leu mal (compositor «Superius»,
// «Tom», «Vc», «[Composer]»…). Este comando:
//  A) junta o PDF que é a impressão de um ficheiro do Finale que já tem ficha (etiqueta «Finale — dados do nome») a essa
//     ficha, como ficheiro adicional («PDF», «PDF Tenor»); a ficha separada do PDF desaparece;
//  B/C) nos outros, refaz a ficha «como o Finale»: dados pelo nome do ficheiro e pelo texto da 1.ª página (ver
//     transcricao_pdf.js); partes cavas da mesma peça numa ficha; «completa» mesmo sem data, com a etiqueta
//     «Transcrição — dados do ficheiro», se o título disser alguma coisa (senão por rever, com nota);
//  D) deixa de fora as fichas com origem de catálogo (RISM, IMSLP, DIAMM, PEM…) e lista as correspondências ambíguas.
// Nunca esvazia um campo (o compositor que a IA leu sem confirmação sai, mas fica escrito na nota e em
// metadados.compositor_ia); nunca mexe em fichas completas nem «a processar».
// Mostra a lista; com --aplicar (cópia de segurança antes) grava e pede ao serviço que junte e arrume os ficheiros.
// Uso: node src/transcricoes_pdf.js [--aplicar] [--excluir 617,3386] [--saida ficheiro.txt]
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca, definicoes } from './pb.js'
import { PASTAS, PORTA, segredo, eDoDono } from './config.js'
import { pessoa } from './fontes_externas/util.js'
import { autoresConhecidos } from './lotes_midi.js'
import { pdfInfo, pdfTexto } from './extracao.js'
import { ETIQUETA_FINALE } from './finale.js'
import { fichaTranscricaoPdf, agruparTranscricoes, chavesDoNome, chaveComSentido, ePdfDeEditorDePartituras, ETIQUETA_TRANSCRICAO } from './transcricao_pdf.js'

const aplicar = process.argv.includes('--aplicar')
const opcao = (nome) => {
  const i = process.argv.indexOf(nome)
  return i > 0 ? String(process.argv[i + 1] || '') : ''
}
const excluir = new Set(opcao('--excluir').split(',').filter(Boolean).map(Number))
const num = (n) => `#${String(n).padStart(4, '0')}`
const servico = async (acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}
const nomeDe = (a) => (a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')) + (a.papel && a.papel !== 'compositor' ? ` (${a.papel})` : '')
const linhas = []
const escrever = (s = '') => (linhas.push(s), console.log(s))
// Origens fracas (leitura do próprio ficheiro): as outras são catálogos e ficam de fora
const ORIGEM_FRACA = /^(IA local|ficheiro|capa|)$/

await garantirSessao()
const defs = await definicoes()
const primeiroDono = String(defs.nome_dono || '').split(';')[0].trim()
const pessoaDono = primeiroDono ? pessoa(primeiroDono, 'editor') : null
const conhecidos = await autoresConhecidos()

// Fichas por rever de partituras/manuscritos/edições críticas/outro com um PDF
const tipos = await pb.collection('tipos_fonte').getFullList({ fields: 'id,nome' })
const idsTipo = tipos.filter((t) => ['Partitura', 'Outro', 'Edição crítica', 'Manuscrito'].includes(t.nome)).map((t) => t.id)
const candidatas = (
  await pb.collection('fontes').getFullList({
    filter: "estado = 'a_rever' && ficheiro ~ '.pdf'",
    fields: 'id,numero,titulo,estado,tipo,origem,autores,data,editora,ficheiro,ficheiro_original,ficheiros_extra,metadados,tags,hash',
    sort: 'numero',
  })
).filter((f) => idsTipo.includes(f.tipo) && /\.pdf$/i.test(f.ficheiro))
const pdfs = []
let lidas = 0
for (const f of candidatas) {
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  if (!fs.existsSync(abs)) continue
  const info = await pdfInfo(abs)
  if (++lidas % 500 === 0) console.error(`… ${lidas} PDFs vistos`)
  if (!ePdfDeEditorDePartituras(info.programa)) continue
  const texto = await pdfTexto(abs, 1, 1, true)
  pdfs.push({ ficha: f, programa: info.programa, texto, nome: f.ficheiro_original || path.basename(f.ficheiro) })
}

// Ficheiros do Finale que já têm ficha: índice pelo nome normalizado (completo e sem a parte)
const fichasFinale = await pb.collection('fontes').getFullList({ filter: pb.filter('tags ~ {:t}', { t: ETIQUETA_FINALE }), fields: 'id,numero,estado,titulo,autores,data,editora,metadados,ficheiro,ficheiro_original,ficheiros_extra' })
const porNumero = new Map(fichasFinale.map((f) => [f.numero, f]))
const idxCompleta = new Map()
const idxBase = new Map()
const indexar = (m, k, n) => k && m.set(k, new Set([...(m.get(k) || []), n]))
for (const f of fichasFinale) {
  for (const nome of [f.ficheiro_original || path.basename(f.ficheiro || ''), ...(f.ficheiros_extra || []).map((x) => x.original || path.basename(x.ficheiro || ''))].filter(Boolean)) {
    const c = chavesDoNome(nome)
    indexar(idxCompleta, c.completa, f.numero)
    indexar(idxBase, c.base, f.numero)
  }
}

// Ficha do Finale por rever com dados fracos («1 tom»): a 1.ª página do PDF impresso completa-a (Pedro, 17/10/2026). Só se
// preenche o que falta; o título só muda se a ficha tinha a nota de nome pouco informativo ou não tinha título.
// Devolve as alterações (com estado «completo» se a página chegar) ou null.
function completarPeloPdf(alvo, lista) {
  if (alvo.estado !== 'a_rever') return null
  const p = lista.find((x) => !x.parte) || lista[0]
  const r = fichaTranscricaoPdf({ nome: p.nome, texto: p.texto, programa: p.programa, conhecidos, eDono: eDoDono, pessoaDono, atual: p.ficha })
  const c = r.campos
  const md = { ...(alvo.metadados || {}) }
  const alt = {}
  const fraco = /pouco informativo|não tem título/.test(md.nota_revisao || '') || !String(alvo.titulo || '').trim()
  if (fraco && c.titulo) alt.titulo = c.titulo
  const compositores = (alvo.autores || []).filter((a) => a.papel !== 'editor')
  const novos = (c.autores || []).filter((a) => a.papel !== 'editor')
  if (!compositores.length && novos.length) alt.autores = [...novos, ...(alvo.autores || []).filter((a) => a.papel === 'editor')]
  for (const k of ['data', 'editora']) if (!alvo[k] && c[k]) alt[k] = c[k]
  for (const [k, v] of Object.entries(c.metadados || {})) if (v && !md[k] && !['nota_revisao', 'formato'].includes(k)) md[k] = v
  const completa = r.completa && (alt.titulo || !fraco)
  if (completa) {
    md.nota_revisao = String(md.nota_revisao || '').replace(/\s*Nome do ficheiro pouco informativo \(«[^»]*»\): identificar a peça e o compositor\.|\s*O nome do ficheiro não tem título\./g, '').trim()
    if (!md.nota_revisao) delete md.nota_revisao
    Object.assign(alt, { estado: 'completo', candidatos: [] })
  }
  if (!Object.keys(alt).length && JSON.stringify(md) === JSON.stringify(alvo.metadados || {})) return null
  return { ...alt, metadados: md }
}

const juntarA = new Map() // nº da ficha do Finale → [pdf]
const fora = []
const ambiguos = []
const resto = []
for (const p of pdfs) {
  const f = p.ficha
  if (!ORIGEM_FRACA.test(f.origem || '')) {
    fora.push({ p, motivo: `origem ${f.origem}` })
    continue
  }
  const c = chavesDoNome(p.nome)
  let alvo = chaveComSentido(c.completa) ? idxCompleta.get(c.completa) : null
  let via = 'nome igual'
  if (!alvo && chaveComSentido(c.base)) (alvo = idxBase.get(c.base)), (via = 'nome sem a parte')
  if (alvo?.size === 1) {
    const n = [...alvo][0]
    juntarA.set(n, [...(juntarA.get(n) || []), { ...p, parte: c.parte, via }])
    continue
  }
  if (alvo?.size > 1) {
    const nota = `O nome do ficheiro corresponde a vários ficheiros do Finale com ficha (${[...alvo].map(num).join(', ')}): não foi juntado a nenhum.`
    ambiguos.push({ p, alvos: [...alvo], nota })
    p.notaExtra = nota
  }
  resto.push(p)
}

// B/C: fichas pelo nome e pela 1.ª página; partes cavas juntas
const fichas = resto.map((p) => ({
  ...fichaTranscricaoPdf({ nome: p.nome, texto: p.texto, programa: p.programa, conhecidos, eDono: eDoDono, pessoaDono, atual: p.ficha }),
  numero: p.ficha.numero,
  id: p.ficha.id,
  original: p.nome,
  ficha: p.ficha,
  notaExtra: p.notaExtra,
}))
for (const f of fichas) if (f.notaExtra) f.notas.push(f.notaExtra)
const grupos = agruparTranscricoes(fichas).sort((a, b) => a.principal.numero - b.principal.numero)
const completas = grupos.filter((g) => g.completa)
const porRever = grupos.filter((g) => !g.completa)

// Lista
const mostrarGrupo = (g) => {
  const c = g.campos
  const md = c.metadados
  const extra = [md.colecao && `fonte: ${md.colecao}`, md.edicao && `versão: ${md.edicao}`, md.catalogo, md.tonalidade, md.instrumentacao].filter(Boolean).join(' · ')
  escrever(`${num(g.principal.numero)} «${c.titulo || g.principal.ficha.titulo}» — ${(c.autores || []).map(nomeDe).join('; ') || 'sem compositor'}${c.data ? `, ${c.data}` : ''}${c.editora ? ` (ed. ${c.editora})` : ''}${extra ? `  [${extra}]` : ''}${excluir.has(g.principal.numero) ? '  (EXCLUÍDA)' : ''}`)
  if (g.motivo) escrever(`        nota: ${g.motivo}`)
  for (const n of g.notas) escrever(`        nota: ${n}`)
  for (const m of g.membros) {
    const ia = `${m.ficha.titulo}${(m.ficha.autores || []).length ? ` / ${m.ficha.autores.map(nomeDe).join('; ')}` : ''}`
    escrever(`     ${m === g.principal ? '*' : '+'} ${num(m.numero)} ${m.original}${m.parte ? `  [parte: ${m.parte}]` : ''}  (antes: ${ia}; título por ${m.origem.titulo || '—'}, compositor por ${m.origem.compositor || '—'})`)
  }
}
const nA = [...juntarA.values()].reduce((s, l) => s + l.length, 0)
escrever(`PDFs por rever feitos num editor de partituras: ${pdfs.length} (de ${candidatas.length} PDFs por rever de partituras, manuscritos, edições críticas e «Outro»)`)
escrever(`A) ${nA} juntados a ${juntarA.size} fichas do Finale · B) ${completas.length} fichas completas · C) ${porRever.length} por rever · D) ${fora.length} fora (catálogo) + ${ambiguos.length} ambíguos (tratados em B/C)`)
escrever(`   (B+C: ${resto.length} PDFs em ${grupos.length} fichas; ${resto.length - grupos.length} juntados a outra como parte cava)`)

escrever(`\n===== A) JUNTADOS À FICHA DO FICHEIRO DO FINALE (${nA} PDFs, ${juntarA.size} fichas) =====`)
for (const [n, l] of [...juntarA].sort((a, b) => a[0] - b[0])) {
  const f = porNumero.get(n)
  escrever(`${num(n)} «${f.titulo}» (${f.estado === 'completo' ? 'completa' : f.estado === 'a_rever' ? 'por rever' : f.estado}) ← ${l.length} PDF${l.length > 1 ? 's' : ''}${excluir.has(n) ? '  (EXCLUÍDA)' : ''}`)
  for (const p of l) escrever(`     + ${num(p.ficha.numero)} ${p.nome}  → rótulo «PDF${p.parte ? ` ${p.parte}` : ''}» (${p.via}; antes: ${p.ficha.titulo})`)
  const comp = completarPeloPdf(f, l)
  if (comp) escrever(`     completada pelo PDF: ${comp.titulo ? `«${comp.titulo}» ` : ''}${comp.autores ? `— ${comp.autores.map(nomeDe).join('; ')} ` : ''}${comp.data ? `, ${comp.data} ` : ''}${comp.estado === 'completo' ? '→ COMPLETA' : '(continua por rever)'}`)
}
escrever(`\n===== B) FICAM COMPLETAS, etiqueta «${ETIQUETA_TRANSCRICAO}» (${completas.length}) =====`)
completas.forEach(mostrarGrupo)
escrever(`\n===== C) FICAM POR REVER (${porRever.length}) =====`)
porRever.forEach(mostrarGrupo)
escrever(`\n===== D) FORA =====`)
escrever(`-- origem de catálogo (não se mexe) (${fora.length}):`)
for (const { p, motivo } of fora) escrever(`${num(p.ficha.numero)} ${p.nome} — «${p.ficha.titulo}» (${motivo})`)
escrever(`-- correspondência ambígua com fichas do Finale (não juntados; tratados em B/C com nota) (${ambiguos.length}):`)
for (const { p, alvos } of ambiguos) escrever(`${num(p.ficha.numero)} ${p.nome} → ${alvos.map((n) => `${num(n)} «${porNumero.get(n)?.titulo}»`).join(', ')}`)

const guardar = (nome) => {
  const destino = opcao('--saida') || path.join(PASTAS.app, 'registos', nome)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, linhas.join('\n') + '\n')
  console.log(`\nLista guardada em ${destino}`)
}
const hoje = new Date().toISOString().slice(0, 10)
if (!aplicar) {
  escrever(`\n(simulação: nada foi alterado; para aplicar: --aplicar)`)
  guardar(`transcricoes-pdf-simulacao-${hoje}.txt`)
  process.exit(0)
}

escrever(`\nCópia de segurança: ${await copiaDeSeguranca('antes-transcricoes-pdf')}`)
let feitas = 0
let saltadas = 0
const rotulador = (existentes) => {
  const usados = new Map()
  for (const x of existentes) if (x.rotulo) usados.set(x.rotulo, (usados.get(x.rotulo) || 0) + 1)
  return (r) => {
    const n = (usados.get(r) || 0) + 1
    usados.set(r, n)
    return n > 1 ? `${r} (${n})` : r
  }
}

// A) juntar à ficha do Finale
for (const [n, l] of [...juntarA].sort((a, b) => a[0] - b[0])) {
  if (excluir.has(n)) continue
  try {
    const alvo = await pb.collection('fontes').getOne(porNumero.get(n).id)
    if (alvo.estado === 'processando') throw new Error('a ficha do Finale está a ser processada')
    const atuais = []
    for (const p of l) {
      const f = await pb.collection('fontes').getOne(p.ficha.id).catch(() => null)
      if (!f || f.estado !== 'a_rever' || excluir.has(f.numero)) {
        escrever(`${num(p.ficha.numero)}: entretanto mudou (a processar, revista ou apagada) — saltada`)
        saltadas++
        continue
      }
      atuais.push({ p, f })
    }
    if (!atuais.length) continue
    const antes = new Set((alvo.ficheiros_extra || []).map((x) => x.ficheiro))
    await servico('juntar', { id: alvo.id, ids: atuais.map((x) => x.f.id), semCopia: true })
    const depois = await pb.collection('fontes').getOne(alvo.id)
    const rotulo = rotulador((depois.ficheiros_extra || []).filter((x) => antes.has(x.ficheiro)))
    const porHash = new Map(atuais.map((x) => [x.f.hash, x]))
    const extras = (depois.ficheiros_extra || []).map((x) => {
      if (antes.has(x.ficheiro)) return x
      const m = porHash.get(x.hash) || atuais.find((y) => y.f.ficheiro_original === x.original)
      return m ? { ...x, rotulo: rotulo(`PDF${m.p.parte ? ` ${m.p.parte}` : ''}`) } : x
    })
    const comp = completarPeloPdf(alvo, atuais.map((x) => x.p))
    await pb.collection('fontes').update(alvo.id, { ficheiros_extra: extras, ...(comp ? { ...comp, metadados: { ...(depois.metadados || {}), ...comp.metadados } } : {}) })
    const final = await servico('reorganizar', { id: alvo.id })
    escrever(`${num(n)} +${atuais.length} PDF: ${final.ficheiro} (${atuais.map((x) => num(x.f.numero)).join(', ')})`)
    feitas++
  } catch (e) {
    escrever(`${num(n)}: ERRO ${e.message}`)
    saltadas++
  }
}

// B/C) refazer a ficha
const chavePessoa = (a) => {
  const k = String(a.apelido || a.literal || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return /^an[oó]n|^anom|^anonym/.test(k) ? 'anonimo' : k.split(/\s+/).at(-1)
}
const mesmaPessoa = (a, b) => chavePessoa(a) === chavePessoa(b)
for (const g of grupos) {
  if (excluir.has(g.principal.numero)) continue
  try {
    const atuais = await Promise.all(g.membros.map((m) => pb.collection('fontes').getOne(m.id)))
    if (atuais.some((f) => f.estado !== 'a_rever' || (f.ficheiros_extra || []).length)) {
      escrever(`${num(g.principal.numero)}: entretanto mudou (a processar ou já revista) — saltada`)
      saltadas++
      continue
    }
    const atual = atuais[0]
    const c = g.campos
    const md = { ...(atual.metadados || {}) }
    // (o que já estava escrito em catálogo, formato, instrumentação e tonalidade fica; o resto vem do nome/da página)
    for (const [k, v] of Object.entries(c.metadados || {})) if (v && !(['catalogo', 'formato', 'instrumentacao', 'tonalidade'].includes(k) && md[k])) md[k] = v
    const ia = atual.autores || []
    // (o compositor que a IA leu e não foi confirmado sai; fica escrito)
    const retirados = ia.filter((a) => a.papel !== 'editor' && a.papel !== 'arranjador' && !(c.autores || []).some((b) => mesmaPessoa(a, b)))
    if (retirados.length) md.compositor_ia = [md.compositor_ia, ...retirados.map(nomeDe)].filter(Boolean).join('; ')
    const notas = [atual.metadados?.nota_revisao, g.motivo, ...g.notas].filter(Boolean)
    if (notas.length) md.nota_revisao = [...new Set(notas)].join(' ')
    // (editores que a ficha já tinha — o dono num PDF de editor de partituras é «editor» — ficam)
    let autores = [...(c.autores || [])]
    // (menos o titular dos direitos, que já fica como editora: «Margaret Greentree» não arranjou os corais de Bach)
    const editora = String(c.editora || atual.editora || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const a of ia) if ((a.papel === 'editor' || a.papel === 'arranjador') && !autores.some((b) => mesmaPessoa(a, b)) && !(chavePessoa(a).length >= 3 && editora.includes(chavePessoa(a)))) autores.push(a)
    const alt = {
      titulo: c.titulo || atual.titulo,
      ...(autores.length || ia.length ? { autores } : {}),
      ...(c.data ? { data: c.data } : {}),
      ...(c.editora && !atual.editora ? { editora: c.editora } : {}),
      metadados: md,
      tags: [...new Set([...(atual.tags || []), ETIQUETA_TRANSCRICAO])],
      estado: g.completa ? 'completo' : 'a_rever',
      ...(g.completa ? { candidatos: [] } : {}),
    }
    await pb.collection('fontes').update(atual.id, alt)
    if (g.membros.length > 1) {
      await servico('juntar', { id: atual.id, ids: g.membros.slice(1).map((m) => m.id), semCopia: true })
      const depois = await pb.collection('fontes').getOne(atual.id)
      const rotulo = rotulador([])
      const porHash = new Map(g.membros.slice(1).map((m) => [m.ficha.hash || m.original, m]))
      const extras = (depois.ficheiros_extra || []).map((x) => {
        const m = porHash.get(x.hash) || g.membros.find((y) => y.original === x.original)
        return m?.parte ? { ...x, rotulo: rotulo(m.parte) } : x
      })
      await pb.collection('fontes').update(atual.id, { ficheiros_extra: extras })
    }
    const final = await servico('reorganizar', { id: atual.id })
    escrever(`${num(g.principal.numero)} ${g.completa ? 'completa' : 'por rever'}: ${final.ficheiro}${g.membros.length > 1 ? ` (+${g.membros.length - 1} ficheiros)` : ''}`)
    feitas++
  } catch (e) {
    escrever(`${num(g.principal.numero)}: ERRO ${e.message}`)
    saltadas++
  }
}
escrever(`\n${feitas} fichas tratadas, ${saltadas} saltadas.`)
guardar(`transcricoes-pdf-aplicado-${hoje}.txt`)
