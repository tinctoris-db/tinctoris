// PEM — Portuguese Early Music Database (pemdatabase.eu): descrição das fontes de música antiga portuguesas
// (sobretudo cantochão). A fonte encontra-se pela lista do Cantus Index (sigla + cota → ligação para a PEM);
// a página da fonte na PEM dá a datação, a origem e proveniência, o conteúdo, a notação, o suporte e as dimensões.
import { obterTexto, candidato } from './util.js'
import { desentidade } from './xml.js'

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
const PARTES = [
  [/first quarter/i, '1.º quartel'],
  [/second quarter/i, '2.º quartel'],
  [/third quarter/i, '3.º quartel'],
  [/(fourth|last) quarter/i, '4.º quartel'],
  [/first half/i, '1.ª metade'],
  [/second half/i, '2.ª metade'],
  [/first third/i, '1.º terço'],
  [/middle/i, 'meados'],
  [/beginning|early/i, 'início'],
  [/\bend\b|\blate\b/i, 'fim'],
]
// "16th century (first quarter)" → "séc. XVI (1.º quartel)"; "1525" fica igual
const QUALIFICADOR = { early: 'início', late: 'fim', mid: 'meados' }
export function dataPem(d) {
  return String(d || '')
    .trim()
    // ("early 18th cent." → "séc. XVIII (início)"; "17th - early 18th cent." → "séc. XVII - séc. XVIII (início)")
    .replace(/\b(early|late|mid)[\s-]+(\d{1,2})(?:st|nd|rd|th)(?:\s+cent(?:ury|\.)?)?/gi, (_, q, n) => `séc. ${ROMANOS[Number(n)] || n} (${QUALIFICADOR[q.toLowerCase()]})`)
    .replace(/(\d{1,2})(?:st|nd|rd|th)(?:\s+cent(?:ury|\.)?)?/gi, (_, n) => `séc. ${ROMANOS[Number(n)] || n}`)
    .replace(/\(([^)]*)\)/g, (m, dentro) => {
      const p = PARTES.find(([re]) => re.test(dentro))
      return p ? `(${p[1]})` : m
    })
}

const limpo = (s) => desentidade(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()

// Campos da descrição (Drupal: "field--name-field-…" com "field__label" e um ou vários "field__item")
export function camposPem(html) {
  const campos = {}
  const partes = String(html).split(/<div[^>]*class="[^"]*\bfield--name-field-/).slice(1)
  for (const p of partes) {
    const rotulo = limpo((/<div class="field__label">([\s\S]*?)<\/div>/.exec(p) || [])[1])
    if (!rotulo || campos[rotulo]) continue
    const itens = [...p.matchAll(/<div class="field__item">([\s\S]*?)<\/div>/g)].map((m) => limpo(m[1])).filter(Boolean)
    if (itens.length) campos[rotulo] = itens.join('; ')
  }
  return campos
}

export async function pemFonte(url, email) {
  const html = await obterTexto(url, { email })
  const c = camposPem(html)
  if (!c.Shelfmark && !c.Siglum) return null
  // "P-BRs (Braga) Arquivo da Sé" → sigla, cidade e arquivo
  const arq = /^([A-Z]{1,3}-[A-Za-z]+)\s*(?:\(([^)]*)\))?\s*(.*)$/.exec(c.Archive || '') || []
  const lugares = [
    c.Origin && `Origem: ${c.Origin}`,
    c['Main place of use'] && `Local de uso: ${c['Main place of use']}`,
    c.Provenance && `Proveniência: ${c.Provenance}`,
  ].filter(Boolean)
  const descricao = [
    [c['Source type'], c['Subcategory of source']].filter(Boolean).join(' — '),
    c.Cursus && `Cursus: ${c.Cursus}`,
    c.Tradition && `Tradição: ${c.Tradition}`,
    c.Completeness && `Completude: ${c.Completeness}`,
    c['Type of script'] && `Escrita: ${c['Type of script']}`,
    c['Foliation/Pagination'] && `Foliação: ${c['Foliation/Pagination']}`,
    c.Bindings && `Encadernação: ${c.Bindings}`,
    c['Condition of document'] && `Estado: ${c['Condition of document']}`,
    c.Remarks,
    c['Description author/s'] && `Descrição na PEM: ${c['Description author/s']}`,
  ].filter(Boolean)
  const manuscrito = !c['Document type'] || /manuscript/i.test(c['Document type'])
  return candidato({
    fonte: 'PEM',
    tipo_sugerido: manuscrito ? 'Manuscrito' : 'Partitura',
    titulo: c.Siglum || [arq[1], c.Shelfmark].filter(Boolean).join(' '),
    autores: c.Composer ? c.Composer.split('; ').map((n) => ({ literal: n, papel: 'compositor' })) : [],
    data: dataPem(c.Date),
    url,
    metadados: {
      forma: manuscrito ? 'Manuscrito' : 'Impresso',
      sigla: arq[1] || '',
      cota: c.Shelfmark || '',
      arquivo: (arq[3] || '').trim(),
      local_arquivo: arq[2] || '',
      descricao_catalogo: descricao.join('. ').replace(/\.\./g, '.'),
      conteudo: c.Contents || '',
      notacao_catalogo: c['Type of notation'] || '',
      suporte: c.Material || '',
      dimensoes: c['Page layout'] || '',
      proveniencia: lugares.join('; '),
      pem: (/\/source\/(\d+)/.exec(url) || [])[1] || '',
    },
  })
}
