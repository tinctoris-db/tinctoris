// Fichas do Finale (.mus, .musx) por rever (Pedro, 17/10/2026): os dados vêm da ficha interna do .musx e do nome do
// ficheiro (ver finale.js). Cada ficha fica «completa» com a etiqueta «Finale — dados do nome», mesmo sem data, se o
// título disser alguma coisa; as de nome sem sentido ficam por rever com nota. As partes cavas da mesma peça juntam-se
// numa ficha (os ficheiros passam a «Ficheiros» dessa ficha, com o nome da parte).
// Mostra a lista; com --aplicar (cópia de segurança antes) grava e pede ao serviço que junte e arrume os ficheiros.
// Uso: node src/finale_nomes.js [--aplicar] [--excluir 617,3386] [--saida ficheiro.txt]
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca, definicoes } from './pb.js'
import { PASTAS, PORTA, segredo, eDoDono } from './config.js'
import { pessoa } from './fontes_externas/util.js'
import { autoresConhecidos } from './lotes_midi.js'
import { fichaFinale, agruparFinale, metadadosMusx, ETIQUETA_FINALE } from './finale.js'

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
const nomeDe = (a) => (a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')) + (a.papel === 'editor' ? ' (editor)' : '')
const linhas = []
const escrever = (s = '') => (linhas.push(s), console.log(s))

await garantirSessao()
const defs = await definicoes()
const primeiroDono = String(defs.nome_dono || '').split(';')[0].trim()
const pessoaDono = primeiroDono ? pessoa(primeiroDono, 'editor') : null
const conhecidos = await autoresConhecidos()

const todas = await pb.collection('fontes').getFullList({
  filter: "estado = 'a_rever' && ficheiro ~ '.mus'",
  fields: 'id,numero,titulo,estado,autores,data,ficheiro,ficheiro_original,ficheiros_extra,metadados,tags,hash',
  sort: 'numero',
})
const lista = todas.filter((f) => /\.musx?$/i.test(f.ficheiro) && !(f.ficheiros_extra || []).length)
const fichas = []
for (const f of lista) {
  const abs = path.join(PASTAS.biblioteca, f.ficheiro)
  if (!fs.existsSync(abs)) continue
  const musx = /\.musx$/i.test(f.ficheiro) ? await metadadosMusx(abs) : {}
  const nome = f.ficheiro_original || path.basename(f.ficheiro)
  fichas.push({ ...fichaFinale({ nome, musx, conhecidos, eDono: eDoDono, pessoaDono }), numero: f.numero, id: f.id, original: nome, ficha: f })
}
const grupos = agruparFinale(fichas).sort((a, b) => a.principal.numero - b.principal.numero)

const completas = grupos.filter((g) => g.completa)
const porRever = grupos.filter((g) => !g.completa)
const mostrar = (titulo, l) => {
  escrever(`\n===== ${titulo} (${l.length}) =====`)
  for (const g of l) {
    const c = g.campos
    const md = c.metadados
    const extra = [md.colecao && `fonte: ${md.colecao}`, md.edicao && `versão: ${md.edicao}`, md.tonalidade, md.instrumentacao].filter(Boolean).join(' · ')
    escrever(`${num(g.principal.numero)} «${c.titulo}» — ${(c.autores || []).map(nomeDe).join('; ') || 'sem compositor'}${c.data ? `, ${c.data}` : ''}${extra ? `  [${extra}]` : ''}${excluir.has(g.principal.numero) ? '  (EXCLUÍDA)' : ''}`)
    if (g.motivo) escrever(`        nota: ${g.motivo}`)
    for (const n of g.notas) escrever(`        nota: ${n}`)
    for (const m of g.membros) escrever(`     ${m === g.principal ? '*' : '+'} ${num(m.numero)} ${m.original}${m.parte ? `  [parte: ${m.parte}]` : ''}  (título: ${m.origem.titulo}${m.origem.compositor ? `; compositor: ${m.origem.compositor}` : ''})`)
  }
}
escrever(`Fichas do Finale por rever: ${fichas.length} (${fichas.filter((f) => f.ext === 'musx').length} .musx, ${fichas.filter((f) => f.ext === 'mus').length} .mus)`)
escrever(`Depois: ${grupos.length} fichas — ${completas.length} completas (etiqueta «${ETIQUETA_FINALE}»), ${porRever.length} por rever; ${fichas.length - grupos.length} juntadas a outra como parte cava/versão`)
mostrar('A) FICAM COMPLETAS', completas)
mostrar('B) FICAM POR REVER (nome pouco informativo)', porRever)

const guardar = (nome) => {
  const destino = opcao('--saida') || path.join(PASTAS.app, 'registos', nome)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, linhas.join('\n') + '\n')
  console.log(`\nLista guardada em ${destino}`)
}
const hoje = new Date().toISOString().slice(0, 10)
if (!aplicar) {
  escrever(`\n(simulação: nada foi alterado; para aplicar: --aplicar)`)
  guardar(`finale-nomes-simulacao-${hoje}.txt`)
  process.exit(0)
}

escrever(`\nCópia de segurança: ${await copiaDeSeguranca('antes-finale-nomes')}`)
let feitas = 0
let saltadas = 0
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
    // (nunca se esvazia um campo: compositor e data só entram se houver)
    const md = { ...(atual.metadados || {}), ...c.metadados }
    const notas = [atual.metadados?.nota_revisao, g.motivo, ...g.notas].filter(Boolean)
    if (notas.length) md.nota_revisao = [...new Set(notas)].join(' ')
    const alt = {
      titulo: c.titulo || atual.titulo,
      ...(c.autores?.length ? { autores: c.autores } : {}),
      ...(c.data ? { data: c.data } : {}),
      metadados: md,
      tags: [...new Set([...(atual.tags || []), ETIQUETA_FINALE])],
      estado: g.completa ? 'completo' : 'a_rever',
      ...(g.completa ? { candidatos: [] } : {}),
    }
    await pb.collection('fontes').update(atual.id, alt)
    if (g.membros.length > 1) {
      await servico('juntar', { id: atual.id, ids: g.membros.slice(1).map((m) => m.id), semCopia: true })
      // (cada ficheiro adicional fica com o nome da parte: «…_Cantus.mus», «…_Flute I.mus»)
      const depois = await pb.collection('fontes').getOne(atual.id)
      const usados = new Map()
      const rotulo = (r) => {
        const n = (usados.get(r) || 0) + 1
        usados.set(r, n)
        return n > 1 ? `${r} (${n})` : r
      }
      const porFicheiro = new Map(g.membros.slice(1).map((m) => [m.ficha.hash || m.original, m]))
      const extras = (depois.ficheiros_extra || []).map((x) => {
        const m = porFicheiro.get(x.hash) || g.membros.find((y) => y.original === x.original)
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
guardar(`finale-nomes-aplicado-${hoje}.txt`)
