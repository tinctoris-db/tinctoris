// K10plus (catálogo comum das bibliotecas do norte e do sudoeste da Alemanha: Berlim, Göttingen, Wolfenbüttel,
// Halle, Dresden, Stuttgart, Heidelberg…), pela interface SRU em MARC21. Inclui as bibliografias nacionais dos
// impressos alemães dos séculos XVI–XVIII (VD16, VD17, VD18): o número VD e as cotas dos exemplares nessas bibliotecas.
// Usado nos impressos antigos que o RISM, o DIAMM e a Gallica não identificaram.
import { obterTexto, pessoa, candidato, normalizar } from './util.js'
import { camposMarc, marc, registosSru } from './xml.js'

const SRU = 'https://sru.k10plus.de/opac-de-627'

// Bibliotecas mais frequentes nos impressos antigos (código ISIL → nome); as outras ficam com o código
const ISIL = {
  'DE-1': 'Staatsbibliothek zu Berlin',
  'DE-1a': 'Staatsbibliothek zu Berlin',
  'DE-3': 'Universitäts- und Landesbibliothek Sachsen-Anhalt, Halle',
  'DE-7': 'Niedersächsische Staats- und Universitätsbibliothek Göttingen',
  'DE-14': 'SLUB Dresden',
  'DE-16': 'Universitätsbibliothek Heidelberg',
  'DE-18': 'Staats- und Universitätsbibliothek Hamburg',
  'DE-21': 'Universitätsbibliothek Tübingen',
  'DE-23': 'Herzog August Bibliothek Wolfenbüttel',
  'DE-24': 'Württembergische Landesbibliothek Stuttgart',
}

const PAPEIS = { cmp: 'compositor', aut: 'autor', edt: 'editor', arr: 'arranjador', lyr: 'autor' }

function candidatoMarc(xml) {
  const campos = camposMarc(xml)
  if (!campos.length) return null
  const titulo = marc(campos, '245', 'ab', ' : ')[0] || ''
  const [local, editora, data] = ['a', 'b', 'c'].map((k) => (marc(campos, '264', k)[0] || marc(campos, '260', k)[0] || '').replace(/[[\]]/g, '').trim())
  const pessoas = ['100', '700']
    .flatMap((t) => campos.filter((c) => c.tag === t))
    .map((c) => ({ nome: (c.sub.find(([k]) => k === 'a') || [])[1] || '', papel: PAPEIS[(c.sub.find(([k]) => k === '4') || [])[1]] }))
    .filter((p) => p.nome && p.papel)
  const vd = campos.filter((c) => c.tag === '024' && c.sub.some(([k, v]) => k === '2' && /^vd1[678]$/i.test(v))).map((c) => (c.sub.find(([k]) => k === 'a') || [])[1]).filter(Boolean)
  const copias = campos
    .filter((c) => c.tag === '924')
    .map((c) => Object.fromEntries(c.sub.filter(([k]) => 'bg'.includes(k))))
    .filter((x) => x.b && x.g)
    .map((x) => `${ISIL[x.b] ? `${ISIL[x.b]} [${x.b}]` : `ISIL ${x.b}`}, ${x.g}`)
  const ppn = (marc(campos, '035', 'a').find((x) => /^\(DE-627\)/.test(x)) || '').replace(/^\(DE-627\)/, '')
  const digital = marc(campos, '856', 'u').find((u) => /resolving|diglib|digital/.test(u)) || ''
  const musica = /Noten|notated music/i.test(marc(campos, '336', 'a').join(' '))
  return candidato({
    fonte: 'K10plus',
    tipo_sugerido: musica ? 'Partitura' : 'Livro',
    titulo: titulo.replace(/\s*\/\s*$/, ''),
    autores: pessoas.map((p) => pessoa(p.nome.replace(/,\s*$/, ''), musica && p.papel === 'autor' ? 'compositor' : p.papel)).filter(Boolean),
    data: (/\d{4}/.exec(data) || [])[0] || data,
    editora,
    local,
    url: ppn ? `https://opac.k10plus.de/DB=2.1/PPNSET?PPN=${ppn}` : '',
    metadados: {
      forma: 'Impresso',
      vd: vd.join('; '),
      formato: marc(campos, '300', 'ac', ' ; ')[0] || '',
      outros_exemplares: copias.slice(0, 30).join('\n'),
      outras_digitalizacoes: digital ? `${copias[0] ? copias[0].split(',')[0] : 'K10plus'}: ${digital}` : '',
    },
  })
}

// q: { titulo, autor, ano } — impressos (com o ano, a pesquisa é exata no ano)
export async function k10plusPesquisar({ titulo, autor, ano }, email, { palavras = (t) => t } = {}) {
  const partes = []
  const apelido = normalizar(autor || '').split(' ').filter((w) => w.length > 2).pop()
  if (apelido) partes.push(`pica.per="${apelido}"`)
  const p = String(palavras(titulo || '')).replace(/["\\]/g, ' ').trim()
  if (p) partes.push(`pica.tit="${p}"`)
  if (!partes.length) return []
  if (/^\d{4}$/.test(String(ano || ''))) partes.push(`pica.jhr=${ano}`)
  const xml = await obterTexto(`${SRU}?version=1.1&operation=searchRetrieve&maximumRecords=8&recordSchema=marcxml&query=${encodeURIComponent(partes.join(' and '))}`, { email })
  return registosSru(xml).map(candidatoMarc).filter(Boolean)
}
