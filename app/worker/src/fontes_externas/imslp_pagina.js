// Página da obra no IMSLP (não só o título): obra ou coleção, edições (impressor, local, ano) com os nomes
// dos ficheiros, e o registo RISM da 1.ª edição. As páginas do IMSLP chamam-se "Título (Apelido, Nome)", mas
// nas coleções o nome entre parênteses é às vezes o do impressor ou compilador ("Der Gooden Fluyt-Hemel
// (Matthysz, Paulus)"): quando é o mesmo nome do impressor de uma edição, não é o compositor.
import { obterJson, normalizar, semelhanca, contido, tituloCompacto } from './util.js'

const campo = (t, k) => ((new RegExp(`\\|\\s*${k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[ \\t]*=[ \\t]*([^\\n]*)`)).exec(t) || [])[1]?.trim() || ''
const semLigacoes = (s) =>
  String(s || '')
    .replace(/\{\{LinkName\|([^|}]*)\|([^|}]*)[^}]*\}\}/g, '$1 $2')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// {{P|Impressor|Nome completo|Cidade|Data|Ano|…}}
function edicaoDe(pub) {
  const m = /\{\{P\|([^}]*)\}\}/.exec(pub || '')
  if (!m) return null
  const [a, b, cidade, data, ano] = m[1].split('|').map((x) => semLigacoes(x))
  const limpa = (x) => String(x || '').replace(/[\s.,;]+$/, '').trim()
  const impressor = limpa(a || b)
  if (!impressor) return null
  const anoN = (/\b(1[4-9]\d{2}|20\d{2})\b/.exec(`${ano || ''} ${data || ''}`) || [])[1] || ''
  return { impressor, nomeCompleto: limpa(b || a), local: limpa(cidade), ano: anoN }
}

export async function imslpPagina(url, email) {
  const titulo = decodeURIComponent(String(url || '').replace(/^.*\/wiki\//, '')).replace(/_/g, ' ')
  if (!titulo) return null
  const j = await obterJson(`https://imslp.org/api.php?action=query&prop=revisions&rvprop=content&format=json&redirects=1&titles=${encodeURIComponent(titulo)}`, { email })
  const p = Object.values(j.query?.pages || {})[0]
  const t = p?.revisions?.[0]?.['*']
  if (!t) return null
  const m = /^(.*)\s+\(([^()]+)\)\s*$/.exec(p.title || titulo)
  const nomePagina = m ? m[2] : '' // "Matthysz, Paulus"
  // Edições: cada bloco de ficheiros tem os nomes dos ficheiros e a informação do impressor
  const edicoes = []
  for (const bloco of t.split('{{#fte:imslpfile').slice(1)) {
    const fim = bloco.indexOf('\n}}')
    const b = fim > 0 ? bloco.slice(0, fim) : bloco
    const ficheiros = [...b.matchAll(/\|File Name \d+\s*=\s*([^\n]+)/g)].map((x) => x[1].trim())
    const ed = edicaoDe(campo(b, 'Publisher Information'))
    edicoes.push({ ficheiros, ...(ed || {}), editor: semLigacoes(campo(b, 'Editor')) })
  }
  const tipoPagina = campo(t, 'Page Type')
  const primeiraEd = campo(t, 'Year of First Publication')
  return {
    titulo: semLigacoes(campo(t, 'Work Title')) || (m ? m[1] : titulo),
    alternativo: semLigacoes(campo(t, 'Alternative Title')),
    colecao: /collection/i.test(tipoPagina),
    pecas: semLigacoes(campo(t, 'Movements Header') || campo(t, 'Number of Movements/Sections')).replace(/:$/, ''),
    nomePagina,
    edicoes,
    anoPrimeiraEdicao: (/\b(1[4-9]\d{2}|20\d{2})\b/.exec(primeiraEd) || [])[1] || '',
    rismPrimeiraEdicao: (/\{\{RISMc?\|(\d+)/i.exec(primeiraEd) || [])[1] || '',
    instrumentacao: semLigacoes(campo(t, 'Instrumentation')),
  }
}

// O nome entre parênteses é o de um impressor/editor de uma edição? ("Matthysz, Paulus" = "Paulus Matthysz")
export function nomeEImpressor(pagina) {
  if (!pagina?.nomePagina) return false
  const partes = pagina.nomePagina.split(/\s*,\s*/)
  const nome = normalizar(partes.length === 2 ? `${partes[1]} ${partes[0]}` : pagina.nomePagina)
  const apelido = normalizar(partes[0])
  return pagina.edicoes.some((e) => [e.impressor, e.nomeCompleto].filter(Boolean).some((x) => {
    const n = normalizar(x)
    return n === nome || (apelido.length >= 4 && n.split(' ').includes(apelido) && n.split(' ').length <= 4)
  }))
}

// A edição que corresponde ao ficheiro da ficha (pelo nome do ficheiro do IMSLP); senão a única, se só houver uma
export function edicaoDoFicheiro(pagina, ficheiroOriginal) {
  const nome = normalizar(String(ficheiroOriginal || '').replace(/\.pdf$/i, ''))
  const certa = nome && pagina.edicoes.find((e) => e.ficheiros.some((f) => {
    const n = normalizar(f.replace(/\.pdf$/i, ''))
    return n === nome || n.replace(/^pmlp\d+ /, '') === nome || n.endsWith(nome)
  }))
  if (certa) return { ...certa, certeza: 'ficheiro' }
  const comImpressor = pagina.edicoes.filter((e) => e.impressor)
  return comImpressor.length === 1 ? { ...comImpressor[0], certeza: 'única edição' } : null
}

// Títulos de uma peça ("Sonata IV", "Concerto I in G", "Suite 2", "Canzon Decima")
export const PECA = new RegExp(
  '^(?:(?:sonat[ae]|sonatina|concerto|suite|partita|trio|duetto|duo|canzon[ae]?|fantasia|toccata|ricercar[e]?|aria|air|ouverture|overture|sinfonia|cantata|lesson|solo)\\b.{0,25}\\b(?:[ivxl]+|\\d{1,2}|prim[ao]|second[ao]|terz[ao]|quart[ao]|quint[ao]|sest[ao]|settim[ao]|ottav[ao]|non[ao]|decim[ao]|premi[eè]re?|seconde?|first|second|third)\\b' +
    // (o número antes: "Première Suite", "Prima Sonata", "First Lesson", "I. Sonata")
    '|(?:premi[eè]re?|seconde?|troisi[eè]me|prim[ao]|second[ao]|terz[ao]|first|second|third|[ivx]+\\.|\\d{1,2}\\.?)\\s+(?:sonat[ae]|suite|concerto|partita|canzon[ae]?|fantasia|lesson|sinfonia|ouverture|trio|duo))',
  'i'
)

// O que muda numa ficha com a página do IMSLP (só se preenche o que falta; o impressor sai dos autores
// quando lá estava como compositor). Devolve { alt, notas } — alt vazio: nada a mudar.
// conhecido(apelido): compositor já conhecido na biblioteca (Praetorius, Marais publicaram a própria música:
// continuam compositores, e ficam também como impressores)
export function correcoesImslp(ficha, pagina, { conhecido = () => false } = {}) {
  const alt = {}
  const notas = []
  const md = { ...(ficha.metadados || {}) }
  const mdAntes = JSON.stringify(md)
  // Página de uma coleção mas a ficha tem o título de uma peça ("Sonata IV" em "6 Sonatas, Op.1"): ou o PDF é só
  // essa peça, ou é a coleção com o título da 1.ª peça — fica "Peça de uma coleção", com o nome da coleção
  // (o título da ficha é o da coleção, ou o seu início: "Sonate a 1, 2, 3" em "Sonate a 1 2. 3. per il violin…")
  const pareceColecao = [pagina.titulo, pagina.alternativo].filter(Boolean).some((t) => semelhanca(ficha.titulo, t) >= 0.5 || contido(ficha.titulo, t) >= 0.8 || (tituloCompacto(ficha.titulo).length >= 8 && tituloCompacto(t).startsWith(tituloCompacto(ficha.titulo))))
  const peca = pagina.colecao && !pareceColecao && PECA.test(String(ficha.titulo || ''))
  if (!md.conteudo_tipo) md.conteudo_tipo = peca ? 'Peça de uma coleção' : pagina.colecao ? 'Coleção' : 'Obra'
  if (peca) {
    if (!md.colecao) md.colecao = pagina.titulo
    notas.push(`página do IMSLP da coleção «${pagina.titulo}»: confirmar se o PDF é só esta peça`)
  }
  if (pagina.colecao && !peca && pagina.pecas && !md.formato) md.formato = pagina.pecas
  // Impressor tomado por compositor ("Matthysz, Paulus")
  let autores = ficha.autores || []
  const ed = edicaoDoFicheiro(pagina, ficha.ficheiro_original)
  const apelidoPagina = normalizar(pagina.nomePagina.split(/\s*,\s*/)[0] || '')
  if (nomeEImpressor(pagina) && pagina.colecao && !conhecido(apelidoPagina)) {
    const apelido = apelidoPagina
    const fica = autores.filter((a) => normalizar(a.apelido || a.literal || '') !== apelido)
    if (fica.length !== autores.length) {
      autores = fica
      alt.autores = fica
      notas.push(`${pagina.nomePagina} é o impressor, não o compositor`)
      const impressor = pagina.edicoes.find((e) => normalizar(e.nomeCompleto || e.impressor).includes(apelido)) || ed
      if (!ficha.editora && impressor?.impressor) alt.editora = impressor.nomeCompleto || impressor.impressor
      // (sem compositor conhecido: fica por rever)
      if (!fica.some((a) => a.papel === 'compositor' || a.literal) && ficha.estado === 'completo') {
        alt.estado = 'a_rever'
        notas.push('sem compositor: fica por rever')
      }
    }
  }
  if (ed?.impressor) {
    if (!ficha.editora && !alt.editora) alt.editora = ed.nomeCompleto || ed.impressor
    if (!ficha.local && ed.local) alt.local = ed.local
    if (!String(ficha.data || '').trim() && ed.ano) alt.data = ed.ano
    const texto = [ed.nomeCompleto || ed.impressor, ed.local, ed.ano].filter(Boolean).join(', ') + (ed.certeza === 'ficheiro' ? ' (o mesmo ficheiro no IMSLP)' : ' (única edição no IMSLP)')
    if (!md.edicao_imslp) md.edicao_imslp = texto
  }
  if (pagina.rismPrimeiraEdicao && !md.rism && !md.rism_primeira_edicao) md.rism_primeira_edicao = pagina.rismPrimeiraEdicao
  if (JSON.stringify(md) !== mdAntes) alt.metadados = md
  return { alt, notas }
}
