// Europeana: agregador das bibliotecas, arquivos e museus europeus. Depois de identificada uma fonte antiga (título,
// autor, ano), lista as OUTRAS digitalizações da mesma edição noutras bibliotecas ("várias versões em diferentes
// coleções"). Só entram as que têm o mesmo ano e um título praticamente igual.
// Chave: a de demonstração pública ("api2demo"), ou a do Pedro em Definições (europeana_api_key), se a criar.
import { obterJson, normalizar } from './util.js'

const API = 'https://api.europeana.eu/record/v2/search.json'

export async function europeanaDigitalizacoes({ titulo, autor, ano }, { email, chave, semelhanca = () => 0, limite = 15 } = {}) {
  const apelido = normalizar(autor || '').split(' ').filter((w) => w.length > 2).pop()
  const anoQ = /^\d{4}$/.test(String(ano || '')) ? String(ano) : ''
  if (!titulo || !anoQ) return []
  const palavras = normalizar(titulo).split(' ').filter((w) => w.length >= 4).slice(0, 4).join(' ')
  const q = [apelido && `who:(${apelido})`, palavras && `title:(${palavras})`].filter(Boolean).join(' AND ')
  if (!q) return []
  const j = await obterJson(`${API}?wskey=${encodeURIComponent(chave || 'api2demo')}&rows=40&profile=standard&query=${encodeURIComponent(q)}&qf=${encodeURIComponent(`YEAR:${anoQ}`)}`, { email })
  const vistos = new Set()
  const linhas = []
  for (const it of j.items || []) {
    const anos = it.year || []
    if (!anos.includes(anoQ)) continue
    const s = Math.max(0, ...(it.title || []).map((t) => semelhanca(titulo, t)))
    if (s < 0.8) continue
    const quem = (it.dataProvider || [])[0] || (it.provider || [])[0] || ''
    // (vários endereços num só campo, separados por espaço codificado: fica o primeiro)
    const ligacao = String((it.edmIsShownAt || [])[0] || it.guid || '').split(/%20|\s/)[0].replace(/\?utm_.*$/, '')
    if (!quem || /imslp/i.test(quem) || vistos.has(ligacao)) continue
    vistos.add(ligacao)
    linhas.push(`${quem} (${anoQ}): ${ligacao}`)
    if (linhas.length >= limite) break
  }
  return linhas
}
