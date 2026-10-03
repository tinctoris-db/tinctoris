// Bibliotecas digitais: reconhecer o exemplar digitalizado pela folha inicial do PDF (ou pelo nome do ficheiro)
// e, quando a biblioteca tem um catálogo aberto, ir buscar o registo exato desse exemplar.
//
// Muitas bibliotecas põem à frente do PDF uma página própria com o título, a cota do exemplar e um identificador
// permanente (URN, ark, purl, DOI). Uma mesma edição sobrevive em vários exemplares, em várias coleções: esta página
// diz qual é o exemplar que o Pedro tem — biblioteca, cota, ligação — e o catálogo dessa biblioteca pode dizer mais
// (proveniência, antigos possuidores, outros exemplares).
//
// Para acrescentar uma biblioteca: uma linha nova em BIBLIOTECAS_DIGITAIS (sigla RISM, nome, sinal que a reconhece
// no texto da página e, se houver, o identificador e a ligação para a digitalização).
import { arkDe, gallicaExemplar, origemGallica, lerNoticiaGallica, gallicaPorDescricao } from './gallica.js'
import { bsbIdDe, bsbExemplar, bsbIdPelaCota, COTA_BSB } from './bsb.js'
import { purlDe, bnpExemplar } from './bnp.js'

const URN = /urn:nbn:[a-z]{2}:[\w.:-]+/i

export const BIBLIOTECAS_DIGITAIS = [
  {
    sigla: 'D-Mbs',
    nome: 'Bayerische Staatsbibliothek',
    // ("Bayerischen Staatsbibliothek" na nota de direitos dos PDFs antigos)
    sinal: /bayerischen?\s*staats|digitalisierungs\s*zentrum|digitale-sammlungen\.de|bvb:12-bsb/i,
    id: bsbIdDe,
    cota: COTA_BSB,
    ligacao: (id) => `https://www.digitale-sammlungen.de/view/${id}`,
    registo: bsbExemplar,
  },
  {
    sigla: 'F-Pn',
    nome: 'Bibliothèque nationale de France',
    sinal: /biblioth[èe]que\s*nationale\s*de\s*france|gallica\.bnf\.fr/i,
    id: arkDe,
    ligacao: (id) => `https://gallica.bnf.fr/ark:/12148/${id}`,
    registo: gallicaExemplar,
  },
  { sigla: 'A-Wn', nome: 'Österreichische Nationalbibliothek', sinal: /[öo]sterreichische\s*national\s*bibliothek|digital\.onb\.ac\.at|onb\.digital/i },
  { sigla: 'D-B', nome: 'Staatsbibliothek zu Berlin', sinal: /staatsbibliothek\s*zu\s*berlin|digital\.staatsbibliothek-berlin\.de|kobv:b4-/i },
  { sigla: 'D-Dl', nome: 'Sächsische Landesbibliothek – Staats- und Universitätsbibliothek Dresden', sinal: /s[äa]chsische\s*landesbibliothek|digital\.slub-dresden\.de|bsz:14-db/i },
  { sigla: 'D-W', nome: 'Herzog August Bibliothek', sinal: /herzog\s*august\s*bibliothek|diglib\.hab\.de/i },
  { sigla: 'D-Gs', nome: 'Niedersächsische Staats- und Universitätsbibliothek Göttingen', sinal: /universit[äa]tsbibliothek\s*g[öo]ttingen|gdz\.sub\.uni-goettingen\.de/i },
  {
    sigla: 'V-CVbav',
    nome: 'Biblioteca Apostolica Vaticana',
    sinal: /biblioteca\s*apostolica\s*vaticana|digi\.vatlib\.it/i,
    id: (s) => (/digi\.vatlib\.it\/view\/(MSS_[\w.-]+)/i.exec(s) || [])[1] || '',
    ligacao: (id) => `https://digi.vatlib.it/view/${id}`,
    // ("MSS_Vat.lat.123" → cota "Vat.lat.123")
    cotaDoId: (id) => id.replace(/^MSS_/, ''),
  },
  { sigla: 'GB-Lbl', nome: 'British Library', sinal: /british\s*library|bl\.uk\/manuscripts/i },
  { sigla: 'GB-Ob', nome: 'Bodleian Library', sinal: /bodleian\s*librar|digital\.bodleian\.ox\.ac\.uk/i },
  { sigla: 'US-Wc', nome: 'Library of Congress', sinal: /library\s*of\s*congress|www\.loc\.gov/i },
  {
    sigla: 'E-Mn',
    nome: 'Biblioteca Nacional de España',
    sinal: /biblioteca\s*nacional\s*de\s*espa[ñn]a|biblioteca\s*digital\s*hisp[áa]nica|bdh(?:-rd)?\.bne\.es/i,
    id: (s) => (/bdh-?rd\.bne\.es\/viewer\.vm\?id=(\d{6,})/i.exec(s) || /\bbdh(\d{10})\b/i.exec(s) || [])[1] || '',
    ligacao: (id) => `https://bdh-rd.bne.es/viewer.vm?id=${id}`,
  },
  {
    sigla: 'P-Ln',
    nome: 'Biblioteca Nacional de Portugal',
    sinal: /biblioteca\s*nacional\s*(de\s*portugal|digital)|purl\.pt\/\d|bnportugal\.gov\.pt/i,
    id: purlDe,
    ligacao: (id) => `https://purl.pt/${id}`,
    registo: bnpExemplar,
  },
  { sigla: 'P-Pm', nome: 'Biblioteca Pública Municipal do Porto', sinal: /biblioteca\s*p[úu]blica\s*municipal\s*do\s*porto|\bBPMP\b/i },
  { sigla: 'P-Cug', nome: 'Biblioteca Geral da Universidade de Coimbra', sinal: /biblioteca\s*geral\s*da\s*universidade\s*de\s*coimbra|digitalis\.uc\.pt|almamater\.sib\.uc\.pt/i },
  { sigla: 'P-EVp', nome: 'Biblioteca Pública de Évora', sinal: /biblioteca\s*p[úu]blica\s*de\s*[ée]vora/i },
  { sigla: 'I-MOe', nome: 'Biblioteca Estense Universitaria', sinal: /biblioteca\s*estense/i },
  { sigla: 'I-Bc', nome: 'Museo internazionale e biblioteca della musica di Bologna', sinal: /museo\s*internazionale\s*e\s*biblioteca\s*della\s*musica|bibliotecamusica\.it/i },
  { sigla: 'NL-DHk', nome: 'Koninklijke Bibliotheek', sinal: /koninklijke\s*bibliotheek|delpher\.nl/i },
  { sigla: 'DK-Kk', nome: 'Det Kongelige Bibliotek', sinal: /det\s*kongelige\s*bibliotek|royal\s*danish\s*library/i },
  { sigla: 'PL-Wn', nome: 'Biblioteka Narodowa', sinal: /biblioteka\s*narodowa|polona\.pl/i },
  // Plataformas comuns a várias bibliotecas: a biblioteca vem do próprio texto (sem sigla)
  {
    sigla: '',
    nome: 'e-rara',
    sinal: /e-rara/i,
    id: (s) => (/10\.3931\/e-rara-\d+/i.exec(s) || [])[0] || '',
    ligacao: (id) => `https://doi.org/${id}`,
  },
  {
    sigla: '',
    nome: 'e-codices',
    sinal: /e-codices/i,
    id: (s) => ((/e-codices\.(?:unifr\.)?ch\/(?:\w{2}\/)?(?:list|thumbs|description|\w+)\/(?:one\/)?([a-z]+\/[\w-]+)/i.exec(s) || [])[1] || ''),
    ligacao: (id) => `https://www.e-codices.unifr.ch/en/list/one/${id}`,
  },
]

// A cota escrita na página ("Signatur: 4 Mus.pr. 56", "Shelfmark: …", "Cote : …", "Cota: …")
const ROTULO_COTA = /^(?:signatur|shelf\s*-?mark|call\s*number|cote|cota|segnatura|signatura|sygnatura)\s*[:.]?\s*(.{2,60})$/i
function cotaDoTexto(linhas, identificador, formaDaCota) {
  for (const l of linhas) {
    const m = ROTULO_COTA.exec(l)
    if (m) return m[1].trim()
  }
  // (cota sem rótulo, na forma própria da biblioteca: "4 Mus.pr. 109#Beibd.3" nos PDFs antigos da BSB)
  const propria = formaDaCota && linhas.map((l) => formaDaCota.exec(l)).find(Boolean)
  if (propria) return propria[1].replace(/\s*#\s*/, '#').trim()
  // Sem rótulo: a linha curta (com algarismos) logo antes do URN, como nas páginas da BSB
  const i = identificador ? linhas.findIndex((l) => l.includes(identificador)) : -1
  const antes = i > 0 ? linhas[i - 1] : ''
  return antes && antes.length <= 40 && /\d/.test(antes) && !/copyright|staats|bibliothek|urn:|http/i.test(antes) ? antes : ''
}

// Reconhecer o exemplar (sem internet): { sigla, biblioteca, cota, identificador, urn, ligacao, id, registo? }
// - nome: nome do ficheiro (ou das imagens), que pode trazer o identificador ("bsb00016944_00001.jpg", "btv1b….pdf")
// - texto: texto da folha inicial (camada de texto do PDF ou OCR)
export function reconhecerExemplar({ nome = '', texto = '' } = {}) {
  const t = String(texto || '')
  const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean)
  // 1) identificador no nome do ficheiro (exato, mesmo sem folha inicial)
  let bib = BIBLIOTECAS_DIGITAIS.find((b) => b.id && b.registo && b.id(nome))
  let id = bib ? bib.id(nome) : ''
  // 2) biblioteca reconhecida no texto da folha inicial
  if (!bib) {
    bib = BIBLIOTECAS_DIGITAIS.find((b) => b.sinal.test(t))
    id = bib?.id ? bib.id(t) : ''
  }
  const urn = (URN.exec(t) || [])[0] || ''
  if (!bib && !urn) return null
  // (o identificador da BSB está dentro do URN; o da Gallica é o ark)
  const identificador = bib?.sigla === 'F-Pn' && id ? `ark:/12148/${id}` : urn || id
  let cota = cotaDoTexto(linhas, urn || id, bib?.cota)
  let biblioteca = bib?.nome || ''
  // Gallica: "Source gallica.bnf.fr / Bibliothèque nationale de France, département Musique, VM12-13184"
  const fonteGallica = /source\s*gallica\.bnf\.fr\s*\/\s*(.+)/i.exec(t)
  if (bib?.sigla === 'F-Pn' && fonteGallica) {
    const o = origemGallica(fonteGallica[1].trim())
    cota = cota || o.cota
    biblioteca = o.biblioteca || biblioteca
  }
  if (!cota && id && bib?.cotaDoId) cota = bib.cotaDoId(id)
  return {
    sigla: bib?.sigla || '',
    biblioteca,
    cota,
    urn: identificador,
    identificador,
    ligacao: (id && bib?.ligacao?.(id)) || (urn ? `https://nbn-resolving.org/${urn}` : ''),
    id,
    temRegisto: !!(id && bib?.registo),
  }
}

// O registo do exemplar no catálogo da biblioteca (Gallica/BnF, BSB): junta-se ao que a folha inicial disse
// opcoes: { texto (1.ª e 2.ª páginas), titulos (do PDF), europeana (chave) } — para os PDFs sem identificador:
// - Gallica: o ark encontra-se pela pesquisa (título, autor e ano da notícia; só um resultado claro);
// - BSB (PDFs antigos): o identificador bsb… encontra-se pela cota exata (na Europeana)
export async function completarExemplar(ex, email, opcoes = {}) {
  if (ex && !ex.temRegisto && !ex.id) {
    let achado = ''
    if (ex.sigla === 'F-Pn' && opcoes.texto) achado = await gallicaPorDescricao(lerNoticiaGallica(opcoes.texto, opcoes.titulos || []), email)
    else if (ex.sigla === 'D-Mbs' && ex.cota) achado = await bsbIdPelaCota(ex.cota, { email, chave: opcoes.europeana })
    if (achado) {
      const bib = BIBLIOTECAS_DIGITAIS.find((b) => b.sigla === ex.sigla && b.registo)
      ex = { ...ex, id: achado, temRegisto: true, ligacao: bib.ligacao(achado), pelaPesquisa: true }
    }
  }
  if (!ex?.temRegisto) return ex
  const bib = BIBLIOTECAS_DIGITAIS.find((b) => b.sigla === ex.sigla && b.registo)
  if (!bib) return ex
  const r = await bib.registo(ex.id, email)
  if (!r) return ex
  return {
    ...ex,
    biblioteca: r.biblioteca || ex.biblioteca,
    cota: r.cota || ex.cota,
    identificador: r.identificador || ex.identificador,
    urn: r.identificador || ex.urn,
    ligacao: r.ligacao || ex.ligacao,
    registo: r.registo || '',
    proveniencia: r.proveniencia || '',
    // (encontrado pela pesquisa e não escrito no PDF: um pouco menos certo)
    candidato: r.candidato ? (ex.pelaPesquisa ? { ...r.candidato, confianca: Math.min(r.candidato.confianca, 0.9) } : r.candidato) : null,
  }
}

// Identificadores de exemplares digitalizados no texto de uma página (URN, ark da Gallica, purl da BNP, BSB, Vaticana…)
// (e a cota da BSB nos PDFs antigos, que não trazem URN: "4 Mus.pr. 109#Beibd.3")
export const IDENTIFICADORES = /urn:nbn:|ark:\/12148\/(?:btv1b|bpt6k|bd6t)|purl\.pt\/\d|digi\.vatlib\.it\/view|10\.3931\/e-rara|e-codices|\bbsb\d{8}\b|bdh-?rd\.bne\.es|gallica\.bnf\.fr|\bMus\.\s?(?:pr|ms|th)\.\s?\d/i
