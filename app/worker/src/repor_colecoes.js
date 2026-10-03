// Repor os campos que a reanálise de 1/10/2026 esvaziou nas coleções (plano em
// app/registos/repor-campos-colecoes-simulacao-2026-10-01.json; aprovado pelo Pedro a 1/10).
// Uso: node src/repor_colecoes.js [--aplicar]   (sem --aplicar só mostra o que faria)
// Os «nº de catálogo» antigos que não são números de catálogo (cotas, nºs de edição, nome da coleção) não voltam
// ao campo do catálogo: o nome da coleção vai para «colecao», o resto fica como sugestão (catalogo_ia).
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PASTAS, PORTA, segredo } from './config.js'

const PLANO = path.join(PASTAS.app, 'registos/repor-campos-colecoes-simulacao-2026-10-01.json')
const aplicar = process.argv.includes('--aplicar')
// Destino de cada «catálogo» antigo (decidido ficha a ficha)
const CATALOGO = {
  1057: { colecao: 'Concertos in 7 Parts. Opera Terza (London [1726])' },
  3643: { catalogo_ia: '(Roma 1712)' },
  7045: { catalogo_ia: 'Universal Edition No. 17 517 a' },
  7051: { catalogo_ia: 'HM 271' },
  12153: { catalogo: 'Op. X, No. 1' },
  13356: { colecao: 'XII Solos for a Flute with a Thorough Bass for the Harpsichord or Bass Violin' },
  13581: { colecao: 'Canzoni per sonare con ogni sorte di strumenti a quattro, cinque e otto (Venice 1608)' },
  13693: { colecao: 'Essercizii musici (Hamburg [1740])' },
}
// Fichas que voltam ao título do IMSLP: a nota «coleção sem frontispício» deixa de se aplicar, e o que a IA
// acrescentou contra o catálogo sai (Corelli Op. 1 é impresso; o IMSLP diz que o Zelenka é uma obra)
const DO_IMSLP = { 4657: { apagar: ['forma'] }, 7051: { conteudo_tipo: 'Obra' } }
const FRONTISPICIO = /O PDF tem \d+ páginas e começa pela peça «[^»]*»: provavelmente uma coleção sem frontispício \(o título é o da 1\.ª peça\)\.\s*/
const vazio = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
const nomes = (a) => (a || []).map((x) => x.apelido || x.literal).join(', ')

await garantirSessao()
const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'))
if (aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-repor-colecoes')}`)
let feitas = 0
for (const p of plano) {
  const f = await pb.collection('fontes').getOne(p.id)
  const cab = `#${String(p.numero).padStart(4, '0')} «${f.titulo}»`
  if (f.estado === 'processando') {
    console.log(`${cab}: SALTADA (está a ser reanalisada)`)
    continue
  }
  if (f.titulo !== p.titulo_atual) {
    console.log(`${cab}: SALTADA (o título mudou desde o plano; era «${p.titulo_atual}»)`)
    continue
  }
  const alt = {}
  const linhas = []
  for (const [k, v] of Object.entries(p.alt)) {
    if (k === 'data' && !vazio(f.data)) {
      linhas.push(`data: fica ${f.data} (o plano dizia ${v})`)
      continue
    }
    alt[k] = v
    linhas.push(k === 'autores' ? `autores: «${nomes(f.autores)}» → «${nomes(v)}»` : `${k}: «${f[k] || ''}» → «${v}»`)
  }
  const md = { ...(f.metadados || {}) }
  let mdMudou = false
  for (const [k, v] of Object.entries(p.mdalt)) {
    if (k === 'palavras_chave_origem' || k === 'catalogo') continue
    if (vazio(md[k])) {
      md[k] = v
      mdMudou = true
      linhas.push(`${k}: → «${v}»`)
    }
  }
  for (const [k, v] of Object.entries(CATALOGO[p.numero] || {})) {
    if (vazio(md[k])) {
      md[k] = v
      mdMudou = true
      linhas.push(`${k === 'catalogo' ? 'nº de catálogo' : k === 'colecao' ? 'coleção' : 'sugestão de catálogo'}: → «${v}»`)
    }
  }
  if (p.mdalt.catalogo && !CATALOGO[p.numero]) linhas.push(`(«${p.mdalt.catalogo}» continua como sugestão de catálogo: não é um nº de catálogo)`)
  const imslp = DO_IMSLP[p.numero]
  if (imslp) {
    for (const k of imslp.apagar || []) if (k in md) (delete md[k], (mdMudou = true), linhas.push(`${k}: «${f.metadados[k]}» → (sai)`))
    if (imslp.conteudo_tipo && md.conteudo_tipo !== imslp.conteudo_tipo) (linhas.push(`conteudo_tipo: «${md.conteudo_tipo || ''}» → «${imslp.conteudo_tipo}»`), (md.conteudo_tipo = imslp.conteudo_tipo), (mdMudou = true))
    if (FRONTISPICIO.test(md.nota_revisao || '')) {
      md.nota_revisao = md.nota_revisao.replace(FRONTISPICIO, '').trim()
      if (!md.nota_revisao) delete md.nota_revisao
      mdMudou = true
      linhas.push('nota «coleção sem frontispício»: sai (o título volta a ser o do IMSLP)')
    }
  }
  // Datas trocadas pela reanálise: só se assinalam
  for (const n of p.notas || []) {
    const m = /data (\S+) → (\S+)/.exec(n)
    if (!m) continue
    const nota = `Antes da reanálise de 1/10/2026 a data era ${m[1]}; a reanálise pôs ${m[2]}. Confirmar qual está certa.`
    if (!String(md.nota_revisao || '').includes(nota)) {
      md.nota_revisao = [md.nota_revisao, nota].filter(Boolean).join(' ')
      mdMudou = true
      linhas.push(`nota de revisão: data ${m[1]} → ${m[2]} (só assinalada)`)
    }
  }
  if (mdMudou) alt.metadados = md
  if (!Object.keys(alt).length) {
    console.log(`${cab}: nada a repor`)
    continue
  }
  console.log(`${cab}:\n   ${linhas.join('\n   ')}`)
  if (!aplicar) continue
  await pb.collection('fontes').update(p.id, alt)
  feitas++
  // Título, autor ou data mudaram: o nome do ficheiro acompanha (pelo serviço, que é quem mexe nos ficheiros)
  if (['titulo', 'autores', 'data'].some((k) => k in alt)) {
    const r = await fetch(`http://127.0.0.1:${PORTA}/reorganizar`, { method: 'POST', headers: { 'x-segredo': segredo(), 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    const j = await r.json()
    console.log(`   ficheiro: ${r.ok ? j.ficheiro : `ERRO ${j.erro}`}`)
  }
}
console.log(aplicar ? `\n${feitas} fichas repostas.` : '\n(simulação: nada foi alterado; para aplicar: --aplicar)')
process.exit(0)
