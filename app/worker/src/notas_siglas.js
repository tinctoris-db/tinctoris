// Nota de revisão nas fichas com as siglas P-Csc e P-Cs (decisão do Pedro a 1/10/2026: seguir o RISM, mas
// assinalar para confirmar — as fotografias dizem «Santa Cruz», o RISM diz outra coisa). Só acrescenta a nota.
// Uso: node src/notas_siglas.js [--aplicar]
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'

const aplicar = process.argv.includes('--aplicar')
const NOTAS = {
  'P-Csc': 'Sigla P-Csc: no RISM é «Santa Casa da Misericórdia, Arquivo» (Coimbra). Confirmar se é esse o arquivo ou o Mosteiro de Santa Cruz (que no RISM não tem sigla).',
  'P-Cs': 'Sigla P-Cs: no RISM é «Arquivo da Sé Nova» (Coimbra). Confirmar se é esse o arquivo (as fotografias dizem «Santa Cruz»).',
}
// A sigla da ficha ou, sem ela, a das fotografias originais / do nome do ficheiro
function siglaDe(f) {
  const md = f.metadados || {}
  if (NOTAS[md.sigla]) return md.sigla
  const texto = `${md.originais || ''} ${f.ficheiro_original || ''}`
  if (/(^|[\s/_])P-Csc(?![a-z])/i.test(texto)) return 'P-Csc'
  if (/(^|[\s/_])P-Cs(?![a-z])/i.test(texto)) return 'P-Cs'
  return ''
}

await garantirSessao()
const lista = (
  await pb.collection('fontes').getFullList({
    filter: "metadados.sigla = 'P-Csc' || metadados.sigla = 'P-Cs' || ficheiro_original ~ 'P-Cs' || metadados.originais ~ 'P-Cs'",
    fields: 'id,numero,titulo,estado,ficheiro_original,metadados',
    sort: 'numero',
  })
).filter((f) => siglaDe(f))
if (aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-notas-siglas')}`)
let n = 0
for (const f of lista) {
  const sigla = siglaDe(f)
  const md = f.metadados || {}
  const cab = `#${String(f.numero).padStart(4, '0')} ${sigla.padEnd(5)} «${String(f.titulo).slice(0, 50)}»`
  if (String(md.nota_revisao || '').includes(NOTAS[sigla])) {
    console.log(`${cab}: já tem a nota`)
    continue
  }
  if (f.estado === 'processando') {
    console.log(`${cab}: SALTADA (está a ser processada)`)
    continue
  }
  console.log(cab)
  if (!aplicar) continue
  await pb.collection('fontes').update(f.id, { metadados: { ...md, nota_revisao: [md.nota_revisao, NOTAS[sigla]].filter(Boolean).join(' ') } })
  n++
}
console.log(aplicar ? `\n${n} notas acrescentadas.` : `\n${lista.length} fichas (simulação: nada foi alterado; para aplicar: --aplicar)`)
process.exit(0)
