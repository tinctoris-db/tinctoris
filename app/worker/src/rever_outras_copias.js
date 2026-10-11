// Ficheiros postos em _duplicados pela regra antiga «Outra cópia de…» (identificados como a mesma obra de outra ficha,
// sem comparar as páginas). Pedido do Pedro, 4/10/2026: comparar cada um com o ficheiro dessa ficha.
//   igual       → é mesmo uma cópia: passa a «seguro» na próxima verificação do ecrã (nada muda aqui)
//   diferente   → não é duplicado: com --aplicar volta à watch folder e ganha ficha própria (a regra nova já não o
//                 põe de parte, porque compara as páginas)
//   parecido / sem comparação → ficam «por ver»: o Pedro compara no ecrã Duplicados → Espaço
// Os ficheiros com outras origens (PDFs antigos substituídos por versões completas, etc.) só aparecem na lista.
// Uso: node src/rever_outras_copias.js [--aplicar]   (lista em app/registos/rever-outras-copias-…)
import fs from 'node:fs'
import path from 'node:path'
import { pb, garantirSessao, copiaDeSeguranca } from './pb.js'
import { PASTAS, PORTA, segredo } from './config.js'
import { compararComFichas } from './espaco_duplicados.js'

const aplicar = process.argv.includes('--aplicar')
const num = (n) => `#${String(n).padStart(4, '0')}`
const mb = (b) => `${(b / 1e6).toFixed(1)} MB`
const hoje = new Date().toISOString().slice(0, 10)
const REGISTOS = process.env.REGISTOS_DIR || path.join(PASTAS.app, 'registos')

async function servico(acao, corpo) {
  const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, corpo ? { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : { headers: { 'X-Segredo': segredo() } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.erro || r.statusText)
  return j
}

if (aplicar) {
  // (com o serviço antigo, um ficheiro devolvido seria posto outra vez de parte pela regra antiga)
  const { capacidades } = await servico('capacidades').catch(() => ({ capacidades: [] }))
  if (!capacidades.includes('comparar-duplicados')) {
    console.error('O serviço ainda não tem a regra nova (reinicie o TINCTORIS primeiro). Nada foi feito.')
    process.exit(1)
  }
}

let resultado
try {
  resultado = JSON.parse(fs.readFileSync(path.join(PASTAS.dados, 'verificacao-duplicados.json'), 'utf8'))
} catch (_) {
  console.error('Ainda não foi feita a verificação de _duplicados (ecrã Duplicados → «Verificar agora»).')
  process.exit(1)
}
const porVer = resultado.por_ver.filter((x) => fs.existsSync(path.join(PASTAS.biblioteca, x.ficheiro)) && !resultado.decididos?.[x.ficheiro])
await garantirSessao()
const fichas = await pb.collection('fontes').getFullList({ fields: 'id,numero,titulo,ficheiro,hash,paginas' })
console.log(`${porVer.length} ficheiros por ver; a comparar as páginas com as fichas…`)
const comparados = await compararComFichas(porVer, fichas, { aoProgresso: (i, n) => i % 25 === 0 && process.stdout.write(`  ${i}/${n}\r`) })

const regra = comparados.filter((x) => x.origem?.motivo === 'mesma_obra')
const outros = comparados.filter((x) => x.origem?.motivo !== 'mesma_obra')
const grupo = (l, r) => l.filter((x) => (x.comparacao?.resultado || 'sem_comparacao') === r)
const linha = (x) => {
  const c = x.comparacao
  const pp = c?.paginas?.length ? `${c.paginas[0]} vs ${c.paginas[1]} p.` : ''
  const dist = c?.baixa !== undefined && Number.isFinite(c.baixa) ? ` dif. ${c.baixa}/${Number.isFinite(c.alta) ? c.alta : '—'}` : ''
  const ficha = x.ficha ? `${num(x.ficha.numero)} «${String(x.ficha.titulo || '').slice(0, 70)}»${x.ficha.pista !== 'registo' ? ` (pista: ${x.ficha.pista})` : ''}` : x.origem?.titulo ? `«${String(x.origem.titulo).slice(0, 70)}» (ficha já não existe)` : 'sem ficha conhecida'
  return `  ${x.ficheiro.replace(/^_duplicados\//, '')}  [${mb(x.tamanho)}${pp ? ', ' + pp : ''}${dist}]\n      → ${ficha}`
}
const secoes = [
  ['A. Regra «Outra cópia de…», páginas IGUAIS: são mesmo cópias → passam a «seguros» na próxima verificação', grupo(regra, 'igual')],
  ['B. Regra «Outra cópia de…», páginas DIFERENTES: não são duplicados → com --aplicar voltam à watch folder (ficha própria)', grupo(regra, 'diferente')],
  ['C. Regra «Outra cópia de…», páginas MUITO PARECIDAS: ficam por ver (comparar no ecrã)', grupo(regra, 'parecido')],
  ['D. Regra «Outra cópia de…», SEM COMPARAÇÃO (não é PDF ou ficha sem ficheiro): ficam por ver', grupo(regra, 'sem_comparacao')],
  ['E. Outras origens, páginas iguais à ficha → seguros na próxima verificação', grupo(outros, 'igual')],
  ['F. Outras origens (PDFs antigos substituídos, cópias exactas de ficheiros que mudaram…): ficam por ver, nada muda', outros.filter((x) => x.comparacao?.resultado !== 'igual')],
]
const soma = (l) => l.reduce((s, x) => s + x.tamanho, 0)
const texto = [
  `Rever ficheiros de _duplicados postos de parte pela regra «Outra cópia de…» — ${aplicar ? 'APLICADO' : 'SIMULAÇÃO'} ${new Date().toLocaleString('pt-PT')}`,
  `${comparados.length} por ver: ${regra.length} da regra «Outra cópia de…», ${outros.length} de outras origens.`,
  '',
  ...secoes.flatMap(([t, l]) => [`${t}: ${l.length} (${mb(soma(l))})`, ...l.map(linha), '']),
]

if (aplicar) {
  console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-rever-outras-copias')}`)
  let devolvidos = 0
  for (const x of grupo(regra, 'diferente')) {
    try {
      await servico('espaco-devolver', { ficheiro: x.ficheiro })
      devolvidos++
    } catch (e) {
      texto.push(`ERRO ao devolver ${x.ficheiro}: ${e.message}`)
    }
  }
  texto.push(`${devolvidos} ficheiros devolvidos à watch folder.`)
  await servico('espaco-verificar', {}).catch(() => {})
}

fs.mkdirSync(REGISTOS, { recursive: true })
const saida = path.join(REGISTOS, `rever-outras-copias-${aplicar ? 'aplicado' : 'simulacao'}-${hoje}.txt`)
fs.writeFileSync(saida, texto.join('\n') + '\n')
console.log(secoes.map(([t, l]) => `${t.slice(0, 2)} ${l.length}`).join(' · '))
console.log(`Lista em ${saida}`)
process.exit(0)
