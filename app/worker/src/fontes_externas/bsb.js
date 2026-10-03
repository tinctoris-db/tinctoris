// Bayerische Staatsbibliothek (BSB) / Münchener DigitalisierungsZentrum (MDZ).
// O identificador "bsb00016944" (no URN da folha inicial, no nome do ficheiro ou das imagens) dá o registo exato do
// exemplar digitalizado: cota, título, autores, imprenta e, no catálogo (MARC21), a proveniência.
// (a pesquisa por título do MDZ não tem uma interface pública estável: os impressos da BSB chegam pelo RISM)
import { obterJson, obterTexto, pessoa, candidato } from './util.js'
import { camposMarc, marc } from './xml.js'

const API = 'https://api.digitale-sammlungen.de/iiif/presentation/v2'

export const bsbIdDe = (s) => ((/(?:^|[^0-9a-z])(bsb\d{8})(?!\d)/i.exec(String(s || '')) || [])[1] || '').toLowerCase()

// Valor em inglês de um rótulo IIIF v2 ("label": [{"@language":"en","@value":"Title"}, …])
const emIngles = (v) => (Array.isArray(v) ? (v.find((x) => x['@language'] === 'en') || v[0])?.['@value'] : v?.['@value'] ?? v) || ''
const semHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').trim()

// "Muffat, Gottlieb, 1690-1770 -- (GND: …)" → pessoa
function pessoaGnd(s, papel) {
  const nome = semHtml(s).replace(/\s*--.*$/, '').replace(/,\s*\d{3,4}\??-?\d{0,4}\??\s*$/, '').trim()
  return nome ? pessoa(nome, papel) : null
}

// Papéis MARC ($4) → papéis da biblioteca
const PAPEIS = { cmp: 'compositor', aut: 'autor', lyr: 'autor', edt: 'editor', arr: 'arranjador' }

export async function bsbExemplar(id, email) {
  const j = await obterJson(`${API}/${id}/manifest`, { email })
  const md = {}
  for (const m of j.metadata || []) {
    const k = emIngles(m.label)
    const v = (Array.isArray(m.value) ? m.value.map((x) => (typeof x === 'string' ? x : emIngles([x]))) : [m.value]).map(semHtml).filter(Boolean)
    md[k] = [...(md[k] || []), ...v]
  }
  const [lugar, editora] = String((md.Published || [])[0] || '').split(/\s*:\s*/)
  const autores = [...(md.Creator || []).map((s) => pessoaGnd(s, 'autor')), ...(md.Contributor || []).map((s) => pessoaGnd(s, 'editor'))].filter(Boolean)
  const cota = (md['Call number'] || [])[0] || ''
  const urn = (/urn:nbn:[\w:.-]+/i.exec((md.URN || []).join(' ')) || [])[0] || ''
  const bv = (md.Identifier || []).find((x) => /^BV\d+$/.test(x)) || ''
  const registo = bv ? `https://opacplus.bsb-muenchen.de/title/${bv}` : ''
  const c = candidato({
    fonte: 'BSB (exemplar)',
    confianca: 0.95,
    tipo_sugerido: /Partitur|Stimme|Noten/i.test((md.Extent || []).join(' ')) ? 'Partitura' : /manuscript|handschrift/i.test((md['Media type'] || []).join(' ')) ? 'Manuscrito' : 'Livro',
    titulo: (md.Title || [])[0] || emIngles(j.label) || '',
    autores,
    data: (md.Date || [])[0] || '',
    editora: (editora || '').trim(),
    local: (editora ? lugar : '').trim(),
    url: `https://www.digitale-sammlungen.de/view/${id}`,
    metadados: { formato: (md.Extent || [])[0] || '', registo_biblioteca: registo },
  })
  c.pontuado = true
  // Catálogo (MARC21): papéis dos autores, proveniência (561, antigos possuidores) e forma (manuscrito/impresso)
  if (bv) {
    try {
      const campos = camposMarc(await obterTexto(`${registo}?format=marc`, { email }))
      const pessoas = ['100', '700']
        .flatMap((t) => campos.filter((x) => x.tag === t))
        .map((x) => ({ nome: x.sub.filter(([k]) => k === 'a').map(([, v]) => v).join(' ').replace(/,\s*$/, ''), papel: (x.sub.find(([k]) => k === '4') || [])[1] || '', funcao: (x.sub.find(([k]) => k === 'e') || [])[1] || '' }))
      const possuidores = pessoas.filter((p) => p.papel === 'fmo' || /fr[üu]herer? (eigent|besitz)|provenien/i.test(p.funcao)).map((p) => p.nome)
      const comPapel = pessoas.filter((p) => PAPEIS[p.papel]).map((p) => pessoa(p.nome, PAPEIS[p.papel]))
      if (comPapel.length) c.autores = comPapel
      const proveniencia = [...marc(campos, '561', 'a'), ...possuidores.map((p) => `Antigo possuidor: ${p}`)].join('; ')
      if (proveniencia) c.metadados.proveniencia = proveniencia
      if (campos.some((x) => x.tag === '245' && /\[?manuscript|handschrift/i.test(x.sub.map(([, v]) => v).join(' ')))) c.tipo_sugerido = 'Manuscrito'
    } catch (_) {}
  }
  if (c.tipo_sugerido === 'Manuscrito') c.metadados.forma = 'Manuscrito'
  return {
    candidato: c,
    biblioteca: 'Bayerische Staatsbibliothek',
    sigla: 'D-Mbs',
    cota,
    identificador: urn || id,
    ligacao: `https://www.digitale-sammlungen.de/view/${id}`,
    registo,
    proveniencia: c.metadados.proveniencia || '',
  }
}

// PDFs antigos da BSB: a folha inicial traz a cota em texto legível ("4 Mus.pr. 109#Beibd.3") mas não o URN.
// A Europeana guarda, para cada digitalização da BSB, a cota e o URN: pela cota exata chega-se ao identificador bsb…
// (só se aceita um resultado único da Bayerische Staatsbibliothek)
export async function bsbIdPelaCota(cota, { email, chave } = {}) {
  const c = String(cota || '').replace(/"/g, '').trim()
  if (!c) return ''
  const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(chave || 'api2demo')}&rows=5&profile=standard&query=${encodeURIComponent(`proxy_dc_identifier:"${c}"`)}&qf=${encodeURIComponent('DATA_PROVIDER:"Bavarian State Library"')}`
  const j = await obterJson(url, { email })
  const ids = [...new Set((j.items || []).map((it) => bsbIdDe((it.edmIsShownAt || []).join(' '))).filter(Boolean))]
  return ids.length === 1 ? ids[0] : ''
}

// Cotas da BSB escritas na folha inicial: "4 Mus.pr. 109#Beibd.3", "2 Mus.pr. 16-1/2", "Mus.ms. 34", "Res/4 Mus.th. 12"
export const COTA_BSB = /^((?:Res\/)?(?:\d\s*)?Mus\.\s?(?:pr|ms|th|coll|liturg)\.\s?[\w./-]+(?:\s*#\s*Beibd\.\s*\d+)?)$/i
