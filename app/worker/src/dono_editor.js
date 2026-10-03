// Fichas antigas com o Pedro (dono da biblioteca) como autor por causa dos dados internos do PDF (decisão do Pedro,
// 1/10/2026): nas transcrições/edições dele (PDF de um editor de partituras — Finale, Sibelius… — ou ficheiro .mus)
// passa a «editor»; nos PDFs juntados de digitalizações (Pré-visualização, scanner) sai dos autores; nos textos dele
// (Word, Pages…) fica autor. Onde ele é compositor (os exercícios de tons) não se mexe. As fotografias e manuscritos
// já foram tratados à parte. Mostra a lista; com --aplicar (cópia de segurança antes) grava e pede ao serviço que
// reorganize o ficheiro (o nome deixa de começar por SILVA).
// Uso: node src/dono_editor.js [--aplicar] [--excluir 5884,12017]
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca, definicoes } from './pb.js'
import { PASTAS, PORTA, segredo, eDoDono, EDITOR_PARTITURAS, DIGITALIZACAO } from './config.js'
import { pdfInfo } from './extracao.js'

const aplicar = process.argv.includes('--aplicar')
const iEx = process.argv.indexOf('--excluir')
const excluir = new Set(iEx > 0 ? String(process.argv[iEx + 1] || '').split(',').map(Number) : [])
const num = (n) => `#${String(n).padStart(4, '0')}`
const servico = async (acao, corpo) => {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.statusText)
}

await garantirSessao()
await definicoes() // (carrega o nome do dono da biblioteca)
const lista = await pb.collection('fontes').getFullList({ filter: "autores ~ 'ilva'", fields: 'id,numero,titulo,estado,autores,ficheiro,ficheiro_original,metadados', sort: 'numero' })
const editor = []
const sai = []
const fica = []
const depois = []
for (const f of lista) {
  const donos = (f.autores || []).filter(eDoDono)
  if (!donos.length || donos.some((a) => a.papel === 'compositor') || donos.every((a) => a.papel === 'editor')) continue
  if (f.metadados?.originais || f.metadados?.forma === 'Manuscrito') continue
  const abs = f.ficheiro && path.join(PASTAS.biblioteca, f.ficheiro)
  const programa = abs && fs.existsSync(abs) && /\.pdf$/i.test(abs) ? (await pdfInfo(abs)).programa : ''
  const linha = { f, programa }
  if (excluir.has(f.numero)) fica.push({ ...linha, motivo: 'excluída' })
  else if (EDITOR_PARTITURAS.test(programa) || /\.mus[x]?\b/i.test(f.ficheiro_original || '')) (f.estado === 'processando' ? depois : editor).push(linha)
  else if (DIGITALIZACAO.test(programa)) (f.estado === 'processando' ? depois : sai).push(linha)
  else fica.push({ ...linha, motivo: programa ? `texto (${programa})` : 'sem programa no PDF' })
}
const mostrar = (titulo, l) => {
  console.log(`\n===== ${titulo} (${l.length}) =====`)
  for (const { f, programa, motivo } of l) console.log(`${num(f.numero)} ${f.estado.padEnd(11)} ${String(programa || '-').padEnd(16)} «${String(f.titulo).slice(0, 45)}»  ${f.ficheiro_original || ''}${motivo ? `  — ${motivo}` : ''}`)
}
mostrar('A) TRANSCRIÇÕES/EDIÇÕES: o Pedro passa de autor a editor', editor)
mostrar('B) DIGITALIZAÇÕES JUNTADAS: o Pedro sai dos autores', sai)
mostrar('C) A PROCESSAR: a reanálise trata-as com a regra nova (depois do reinício)', depois)
mostrar('D) FICAM COMO ESTÃO', fica)
if (!aplicar) {
  console.log(`\n${editor.length + sai.length} fichas a mudar (simulação: nada foi alterado; para aplicar: --aplicar)`)
  process.exit(0)
}
console.log(`\nCópia de segurança: ${await copiaDeSeguranca('antes-dono-editor')}`)
let n = 0
for (const { f } of [...editor, ...sai]) {
  const atual = await pb.collection('fontes').getOne(f.id)
  if (atual.estado === 'processando') {
    console.log(`${num(f.numero)}: entretanto a processar — saltada`)
    continue
  }
  const paraEditor = editor.some((x) => x.f.id === f.id)
  const autores = paraEditor ? atual.autores.map((a) => (eDoDono(a) && a.papel !== 'compositor' ? { ...a, papel: 'editor' } : a)) : atual.autores.filter((a) => !eDoDono(a))
  await pb.collection('fontes').update(f.id, { autores })
  await servico('reorganizar', { id: f.id }).catch((e) => console.log(`${num(f.numero)}: reorganizar — ${e.message}`))
  n++
}
console.log(`${n} fichas mudadas.`)
process.exit(0)
