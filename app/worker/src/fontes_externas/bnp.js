// Biblioteca Nacional de Portugal (BNP): Biblioteca Nacional Digital (purl.pt) e catálogo (PORBASE).
// O endereço "purl.pt/<número>" da folha inicial (ou do nome do ficheiro) dá a página da obra na BND: descrição
// bibliográfica, cota do exemplar digitalizado e ligação para o registo no catálogo.
// (o catálogo PORBASE recusa pesquisas automáticas — "Request forbidden by administrative rules" —: fica só a ligação)
import { obterTexto, pessoa, candidato } from './util.js'
import { desentidade } from './xml.js'

const PURL = 'https://purl.pt'

export const purlDe = (s) => (/purl\.pt\/(\d{2,})/i.exec(String(s || '')) || [])[1] || ''

// "SOTOMAIOR, Caetano José da Silva, ca 1694-1739" → pessoa
function autorBnp(s) {
  const limpo = String(s || '').replace(/,\s*(?:ca\s*)?\d{3,4}\??-?(?:ca\s*)?\d{0,4}\??\s*$/i, '').trim()
  const [apelido, ...resto] = limpo.split(',')
  if (!apelido) return null
  const ap = apelido.trim()
  // (apelidos em maiúsculas no catálogo: "SOTOMAIOR" → "Sotomaior")
  const legivel = ap === ap.toUpperCase() ? ap.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : ap
  return pessoa(resto.length ? `${legivel}, ${resto.join(',').trim()}` : legivel, 'autor')
}

// Descrição ISBD: "Título / responsabilidade. - Lisboa : Editor, 1982. - 28 p. ; 21 cm. - (Coleção ; 13)"
export function lerIsbd(isbd) {
  const zonas = String(isbd || '').split(/\.\s+-\s+/)
  const [titulo] = zonas[0].split(/\s+\/\s+/)
  const imprenta = zonas.find((z, i) => i > 0 && /\d{4}|\[s\.\s*d\.\]/.test(z) && /:/.test(z)) || ''
  const m = /^(.*?)\s*:\s*(.*?)(?:,\s*([^,]*\d{4}[^,]*))?$/.exec(imprenta) || []
  return {
    titulo: (titulo || '').replace(/\s*\[(música|musica|manuscrito|texto impresso)\]\s*/gi, ' ').trim(),
    local: (m[1] || '').replace(/^\[|\]$/g, '').trim(),
    editora: (m[2] || '').trim(),
    data: (/\d{4}/.exec(m[3] || imprenta) || [])[0] || '',
    formato: zonas.find((z, i) => i > 0 && z !== imprenta && /\b(p\.|f\.|fl\.|cm|vol\.)/.test(z)) || '',
    manuscrito: /\[manuscrito\]/i.test(isbd),
  }
}

export async function bnpExemplar(id, email) {
  const html = await obterTexto(`${PURL}/${id}`, { email })
  const bloco = (/<div class="Visualisation">([\s\S]*?)<\/div>/.exec(html) || [])[1] || ''
  if (!bloco) return null
  const linhas = desentidade(bloco.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const iCota = linhas.findIndex((l) => /^cota do exemplar digitalizado/i.test(l))
  const cota = iCota >= 0 ? (linhas[iCota].split(':').slice(1).join(':').trim() || linhas[iCota + 1] || '') : ''
  const descricao = linhas.filter((l, i) => i !== iCota && i !== iCota + 1)
  // (1.ª linha: cabeçalho do autor, quando existe — "APELIDO, Nome, datas"; depois a descrição ISBD)
  const temAutor = descricao.length > 1 && /^[\p{Lu}][\p{Lu}'’ -]+,/u.test(descricao[0])
  const isbd = lerIsbd(temAutor ? descricao.slice(1).join(' ') : descricao.join(' '))
  // (a ligação da BND traz uma pesquisa antiga pendurada: fica só o identificador do registo)
  const ligacaoCat = desentidade((/<div class="ViewPorbase"><a href="([^"]+)"/.exec(html) || [])[1] || '')
  const uri = (/uri=(full=[^&]+)/.exec(ligacaoCat) || [])[1]
  const registo = uri ? `https://catalogo.bnportugal.gov.pt/ipac20/ipac.jsp?profile=bn&uri=${uri}` : ligacaoCat
  const c = candidato({
    fonte: 'BNP (exemplar)',
    confianca: 0.95,
    tipo_sugerido: isbd.manuscrito ? 'Manuscrito' : /\[m[úu]sica\]/i.test(bloco) ? 'Partitura' : 'Livro',
    titulo: isbd.titulo,
    autores: temAutor ? [autorBnp(descricao[0])].filter(Boolean) : [],
    data: isbd.data,
    editora: isbd.manuscrito ? '' : isbd.editora,
    local: isbd.manuscrito ? '' : isbd.local,
    url: `${PURL}/${id}`,
    metadados: { formato: isbd.formato, registo_biblioteca: registo, ...(isbd.manuscrito ? { forma: 'Manuscrito' } : {}) },
  })
  c.pontuado = true
  return {
    candidato: c,
    biblioteca: 'Biblioteca Nacional de Portugal',
    sigla: 'P-Ln',
    cota: cota.trim(),
    identificador: `${PURL}/${id}`,
    ligacao: `${PURL}/${id}`,
    registo,
    proveniencia: '',
  }
}

// Ligação de pesquisa no catálogo da BNP (para a ficha; o catálogo não aceita pesquisas automáticas)
export const ligacaoPesquisaBnp = (termos) => `https://catalogo.bnportugal.gov.pt/ipac20/ipac.jsp?profile=bn&index=.GW&term=${encodeURIComponent(termos)}`
