// Leitura simples das respostas em XML dos catálogos de bibliotecas (SRU, OAI-PMH, MARC21/UNIMARC).
// (sem dependências: só os elementos e subcampos de que a biblioteca precisa)

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function desentidade(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
}

const semEtiquetas = (s) => desentidade(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

// Blocos <prefixo:nome …>…</prefixo:nome> (com ou sem prefixo), como texto XML
export function blocos(xml, nome) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`, 'g')
  return [...String(xml || '').matchAll(re)].map((m) => m[1])
}

// Textos de todos os elementos com esse nome ("dc:title" → ["…", "…"])
export const textos = (xml, nome) => blocos(xml, nome).map(semEtiquetas).filter(Boolean)
export const texto = (xml, nome) => textos(xml, nome)[0] || ''

// Registos MARC (MARCXML, UNIMARC "mxc:", "marc:"): lista de { tag, ind1, ind2, sub: [[código, valor]…] }
export function camposMarc(xml) {
  const re = /<(?:[\w-]+:)?datafield\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?datafield>/g
  const lista = []
  for (const [, atrs, corpo] of String(xml || '').matchAll(re)) {
    const atr = (n) => (new RegExp(`${n}="([^"]*)"`).exec(atrs) || [])[1] || ''
    const sub = [...corpo.matchAll(/<(?:[\w-]+:)?subfield\b[^>]*code="([^"]*)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?subfield>/g)].map(([, c, v]) => [c, semEtiquetas(v)])
    lista.push({ tag: atr('tag'), ind1: atr('ind1'), ind2: atr('ind2'), sub })
  }
  return lista
}

// Subcampos de um campo MARC: marc(campos, '245', 'ab') → ["Título : subtítulo", …] (um texto por campo)
export function marc(campos, tag, codigos = 'a', separador = ' ') {
  return campos
    .filter((c) => c.tag === tag)
    .map((c) => c.sub.filter(([k]) => codigos.includes(k)).map(([, v]) => v).join(separador).trim())
    .filter(Boolean)
}

// Registos de uma resposta SRU (o conteúdo de cada <recordData>)
export const registosSru = (xml) => blocos(xml, 'recordData')
export const totalSru = (xml) => Number(texto(xml, 'numberOfRecords')) || 0
