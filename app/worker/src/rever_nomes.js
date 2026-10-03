// Fichas antigas que a regra «o nome do ficheiro primeiro» (Pedro, 1/10/2026) corrige:
//   A) o nome diz o arquivo e a cota ("bguc_mm243", "P-Cug_MM243", "E-TZ 2-3") mas o título é outro;
//   B) fotografias de páginas ou manuscritos «identificados» num catálogo de livros modernos (CrossRef, Open Library…).
// Mostra a lista; com --aplicar (cópia de segurança antes) pede ao serviço a reanálise de cada uma, já com as regras
// novas (que não deixam voltar a identificação recusada nem tiram o arquivo e a cota do título).
// Uso: node src/rever_nomes.js [--aplicar]
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PASTAS, PORTA, segredo } from './config.js'
import { pistasDoNome } from './musica_antiga.js'
import { siglaRism } from './fontes_externas/musicologicas.js'

const aplicar = process.argv.includes('--aplicar')
const MODERNOS = /^(CrossRef|Open Library|OpenAlex|OpenAIRE|DataCite)\b/
const num = (n) => `#${String(n).padStart(4, '0')}`
const servico = async (metodo, acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: metodo, headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}

await garantirSessao()
const defs = await pb.collection('definicoes').getFirstListItem('').catch(() => ({}))
const lista = await pb.collection('fontes').getFullList({ filter: "ficheiro != '' && estado != 'processando'", fields: 'id,numero,titulo,estado,origem,ficheiro,ficheiro_original,metadados', sort: 'numero' })
const confirmadas = new Map()
const confirmar = async (s) => {
  if (!confirmadas.has(s)) confirmadas.set(s, await siglaRism(s, defs.email_contacto).catch(() => null))
  return confirmadas.get(s)
}
const A = []
const B = []
for (const f of lista) {
  if (!fs.existsSync(path.join(PASTAS.biblioteca, f.ficheiro))) continue
  const md = f.metadados || {}
  const origem = String(f.origem || '')
  if (/RISM|DIAMM/.test(origem)) continue
  // (só PDFs e imagens: um .docx de notas sobre o códice não é o códice)
  if (!/\.(pdf|jpe?g|tiff?|png)$/i.test(f.ficheiro)) continue
  const fraca = /^(IA local|ficheiro|capa do PDF)?$/.test(origem.trim())
  // A) arquivo e cota no nome (original ou de um repetido)
  const nomes = [f.ficheiro_original, ...String(md.nomes_alternativos || '').split(' | ')].filter(Boolean)
  let achada = null
  for (const n of nomes) {
    for (const s of pistasDoNome(n).siglas) {
      if (!s.cota) continue
      const sig = await confirmar(s.texto)
      if (sig) {
        achada = { sigla: sig.sigla, cota: s.cota, nome: n }
        break
      }
    }
    if (achada) break
  }
  // (fichas identificadas num catálogo de música — IMSLP, Mendeley… — ficam como estão)
  if (achada && (fraca || MODERNOS.test(origem)) && !String(f.titulo || '').startsWith(`${achada.sigla} ${achada.cota}`)) {
    A.push({ f, motivo: `nome «${achada.nome}» → ${achada.sigla} ${achada.cota}` })
    continue
  }
  // B) fotografada/manuscrito identificada num catálogo moderno
  if ((md.originais || md.forma === 'Manuscrito') && MODERNOS.test(origem)) B.push({ f, motivo: `${md.originais ? 'fotografias' : 'manuscrito'} identificado pelo ${origem.split(' ')[0]}` })
}
const mostrar = (titulo, l) => {
  console.log(`\n===== ${titulo} (${l.length}) =====`)
  for (const { f, motivo } of l) console.log(`${num(f.numero)} ${f.estado.padEnd(9)} ${String(f.origem || '').padEnd(12)} «${String(f.titulo).slice(0, 55)}»  — ${motivo}`)
}
mostrar('A) O NOME DIZ O ARQUIVO E A COTA', A)
mostrar('B) FOTOGRAFIAS/MANUSCRITOS IDENTIFICADOS EM CATÁLOGOS MODERNOS', B)
const todas = [...A, ...B]
if (!aplicar) {
  console.log(`\n${todas.length} fichas a reanalisar (simulação: nada foi alterado; para aplicar: --aplicar)`)
  process.exit(0)
}
const cap = await servico('GET', 'capacidades').catch(() => ({}))
if (!cap.capacidades?.includes('nome-primeiro')) {
  console.log('\nA biblioteca ainda está com a versão anterior: reinicie-a e repita.')
  process.exit(0)
}
console.log(`\nCópia de segurança: ${await copiaDeSeguranca('antes-rever-nomes')}`)
let n = 0
for (const { f } of todas) {
  try {
    await servico('POST', 'reanalisar', { id: f.id })
    n++
  } catch (e) {
    console.log(`${num(f.numero)}: ${e.message}`)
  }
}
console.log(`${n} fichas postas a reanalisar (passam à frente da reanálise longa; acompanhe em «Atividade»).`)
process.exit(0)
