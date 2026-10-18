// Chaves das mensagens do serviço e dos hooks que a interface traduz (ver src/mensagens.js), e verificação no en.json.
// Usado por mensagens.test.js. Também se corre à mão: node testes/chaves_mensagens.js [traducoes-extra.json …]
// (mostra as chaves sem tradução e as traduções com {marcadores} diferentes).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const SRC = path.join(AQUI, '..', 'src')
export const HOOKS = path.join(AQUI, '..', '..', 'pb_hooks')
export const EN = path.join(AQUI, '..', '..', 'pb_public', 'idiomas', 'en.json')

function ficheirosJs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? ficheirosJs(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []))
}

// (o texto já vem de um literal do código, sem aspas por escapar: lê-se como o JavaScript o lê)
const desescapar = (s, aspa) => new Function(`return ${aspa}${s}${aspa}`)()

// Ficheiros do serviço que usam m(…) / erro(…) de mensagens.js
export function ficheirosComMensagens() {
  return ficheirosJs(SRC).filter((f) => /from '\.{1,2}\/(?:[\w.]+\/)*mensagens\.js'/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith(path.sep + 'mensagens.js'))
}

// [{ chave, ficheiro, linha }] de todas as chamadas m('…') e erro('…') (o texto entre plicas)
export function chavesDoServico() {
  const out = []
  for (const f of ficheirosComMensagens()) {
    const texto = fs.readFileSync(f, 'utf8')
    const re = /(?<![\w.$])(?:m|erro)\(\s*'((?:[^'\\\n]|\\.)*)'/g
    let x
    while ((x = re.exec(texto))) out.push({ chave: desescapar(x[1], "'"), ficheiro: path.relative(path.join(AQUI, '..'), f), linha: texto.slice(0, x.index).split('\n').length })
  }
  return out
}

// Chamadas m(`…`) / erro(`…`) ou m(variável): a chave tem de ser um texto fixo entre plicas
export function chavesNaoFixas() {
  const out = []
  for (const f of ficheirosComMensagens()) {
    const texto = fs.readFileSync(f, 'utf8')
    const re = /(?<![\w.$])(?:m|erro)\(\s*([^'\s)…])/g
    let x
    while ((x = re.exec(texto))) out.push(`${path.relative(path.join(AQUI, '..'), f)}:${texto.slice(0, x.index).split('\n').length}`)
  }
  return out
}

// Mensagens dos hooks (PocketBase): erro_chave: "…" e new XxxError("…") (a interface traduz o texto da mensagem)
export function chavesDosHooks() {
  const out = []
  for (const f of ficheirosJs(HOOKS)) {
    const texto = fs.readFileSync(f, 'utf8')
    for (const re of [/erro_chave:\s*"((?:[^"\\\n]|\\.)*)"/g, /new (?:BadRequest|Forbidden|NotFound|Unauthorized)Error\(\s*"((?:[^"\\\n]|\\.)*)"\s*\)/g]) {
      let x
      while ((x = re.exec(texto))) out.push({ chave: desescapar(x[1], '"'), ficheiro: path.relative(path.join(AQUI, '..'), f), linha: texto.slice(0, x.index).split('\n').length })
    }
  }
  return out
}

export const marcadores = (s) => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort()

// Problemas: chaves sem tradução e traduções com {marcadores} diferentes da chave
export function problemas(traducoes, chaves = [...chavesDoServico(), ...chavesDosHooks()]) {
  const faltam = []
  const marcas = []
  const vistas = new Set()
  for (const c of chaves) {
    if (vistas.has(c.chave)) continue
    vistas.add(c.chave)
    if (!(c.chave in traducoes)) faltam.push(c)
    else if (marcadores(c.chave).join() !== marcadores(traducoes[c.chave]).join()) marcas.push({ ...c, traducao: traducoes[c.chave] })
  }
  return { faltam, marcas }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const traducoes = JSON.parse(fs.readFileSync(EN, 'utf8'))
  for (const extra of process.argv.slice(2)) Object.assign(traducoes, JSON.parse(fs.readFileSync(extra, 'utf8')))
  const { faltam, marcas } = problemas(traducoes)
  for (const c of faltam) console.log(`SEM TRADUÇÃO  ${c.ficheiro}:${c.linha}  ${JSON.stringify(c.chave)}`)
  for (const c of marcas) console.log(`MARCADORES    ${c.ficheiro}:${c.linha}  ${JSON.stringify(c.chave)} → ${JSON.stringify(c.traducao)}`)
  for (const l of chavesNaoFixas()) console.log(`CHAVE NÃO FIXA  ${l}`)
  console.log(`${faltam.length} sem tradução, ${marcas.length} com marcadores diferentes, ${chavesNaoFixas().length} chaves não fixas.`)
  process.exitCode = faltam.length || marcas.length || chavesNaoFixas().length ? 1 : 0
}
