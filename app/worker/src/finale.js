// Ficheiros do Finale (.mus e .musx): o que se pode saber deles sem o Finale.
// .musx (Finale 2014 e seguintes): título, compositor e outros dados guardados dentro do ficheiro.
// Um .musx é um arquivo ZIP; os dados da partitura (título, subtítulo, compositor, arranjador, letrista, direitos)
// estão num XML de metadados («NotationMetadata.xml»), em texto simples. A música em si (score.dat) vem cifrada e
// não é lida. Os .mus antigos (até ao Finale 2012) são binários cifrados: só o nome do ficheiro os identifica.
// (Leitor escrito na nuvem a 2/10/2026, PR 10; confirmado a 17/10 nos 78 .musx reais do Pedro.) Se o ficheiro não for um
// ZIP ou não tiver o XML de metadados, devolve {} e fica tudo como antes (identificação pelo nome).
import fs from 'node:fs/promises'
import zlib from 'node:zlib'

// Lista os ficheiros de um ZIP (diretório central) e lê os que `querer(nome)` aceitar → { nome: Buffer }
export function lerZip(buf, querer = () => true) {
  const out = {}
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return out
  // (fim do diretório central: assinatura 0x06054b50 nos últimos 64 KB)
  let fim = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) return out
  const total = buf.readUInt16LE(fim + 10)
  let p = buf.readUInt32LE(fim + 16)
  for (let n = 0; n < total && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const metodo = buf.readUInt16LE(p + 10)
    const comprimido = buf.readUInt32LE(p + 20)
    const lNome = buf.readUInt16LE(p + 28)
    const lExtra = buf.readUInt16LE(p + 30)
    const lComentario = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nome = buf.subarray(p + 46, p + 46 + lNome).toString('utf8')
    p += 46 + lNome + lExtra + lComentario
    if (!querer(nome) || buf.readUInt32LE(local) !== 0x04034b50) continue
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const dados = buf.subarray(inicio, inicio + comprimido)
    try {
      if (metodo === 0) out[nome] = dados
      else if (metodo === 8) out[nome] = zlib.inflateRawSync(dados)
    } catch (_) {}
  }
  return out
}

// Valores por omissão do Finale que não são dados verdadeiros ("Title", "Composer", "Score"…)
const VAZIO = /^(title|t[íi]tulo|titre|titel|subtitle|subt[íi]tulo|composer|compositor|compositeur|komponist|arranger|arranjador|lyricist|letrista|copyright|score|partitura|untitled|sem t[íi]tulo|\[.*\])$/i
const desfazer = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
// (o 1.º elemento com este nome, com ou sem prefixo de espaço de nomes: <title>, <nm:title>)
function campo(xml, ...nomes) {
  for (const n of nomes) {
    const m = new RegExp(`<(?:[\\w-]+:)?${n}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`, 'i').exec(xml)
    const v = m ? desfazer(m[1]) : ''
    if (v && !VAZIO.test(v)) return v
  }
  return ''
}

// Nome de pessoa escrito no Finale: «[Pedro de Cristo]» (atribuição) → «Pedro de Cristo»; «Edvardi Lupi (Duarte Lobo)»
// (nome latino + nome atual) → «Duarte Lobo», o nome por que a biblioteca o conhece
export function nomeDePessoa(v) {
  let s = String(v || '').trim()
  const atribuido = /^\[([^\]]+)\]$/.exec(s)
  if (atribuido) s = atribuido[1].trim()
  // («Stephanus Lopezius [Estevão Lopes Morago]», «D. Petrus C.S. + [Pedro de Cristo]»: o nome entre [ ] é o atual)
  const atual = /^[^()[\]]+[([]([^()[\]]+)[)\]]$/.exec(s)
  if (atual && /\p{L}{2,}\s+\p{L}{2,}/u.test(atual[1])) s = atual[1].trim()
  return VAZIO.test(s) ? '' : s
}
// Titular dos direitos («© 2012 Pedro Sousa Silva») → «Pedro Sousa Silva»
export function titularDosDireitos(v) {
  return String(v || '')
    .replace(/©|\(c\)|copyright|todos os direitos reservados|all rights reserved|\b1[5-9]\d\d\b|\b20\d\d\b|[-–,.;]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// (como campo(), mas sem recusar os valores entre parênteses retos: «[Pedro de Cristo]» é uma atribuição)
function bruto(xml, nome) {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`, 'i').exec(xml)
  return m ? desfazer(m[1]) : ''
}

// XML de metadados de um .musx → { titulo, subtitulo, compositor, arranjador, letrista, direitos }
export function metadadosDoXml(xml) {
  const r = {
    titulo: campo(xml, 'title', 'workTitle'),
    subtitulo: campo(xml, 'subtitle'),
    compositor: nomeDePessoa(bruto(xml, 'composer')),
    arranjador: nomeDePessoa(bruto(xml, 'arranger')),
    letrista: nomeDePessoa(bruto(xml, 'lyricist')),
    direitos: campo(xml, 'copyright'),
  }
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v))
}

export async function metadadosMusx(caminho) {
  try {
    const ficheiros = lerZip(await fs.readFile(caminho), (n) => /metadata[^/]*\.xml$/i.test(n))
    const xml = Object.values(ficheiros).map((b) => b.toString('utf8')).join('\n')
    return xml ? metadadosDoXml(xml) : {}
  } catch (_) {
    return {}
  }
}

// ---------------------------------------------------------------------------
// O nome do ficheiro (Pedro, 17/10/2026: nos .mus é a única pista; nos .musx completa a ficha interna).
// Nomes reais: «51_Cima_a4_Sonata», «io son ferito versao CdM - Bassus», «MORAGO missa pro defunctis 122v-129r b»,
// «BWV1049(II)Vl2», «01. ESC B O Rosa Bella - He Robinet», «Lawes, William Sonata 6 en re mayor Air (Almain)».
// Daqui sai: título (sem a parte, as marcas de versão, os fólios e o lixo), compositor, parte cava, versão
// (play along, claves modernas, transposição…), fonte e fólios, tonalidade e nº de vozes; e uma chave que junta
// as partes cavas da mesma peça.

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const minus = (s) => sem(s).toLowerCase()

// Vozes e instrumentos das partes cavas (e a partitura geral)
const VOZES = 'cantus|altus|tenor|tenore|bassus|basso|bass|baixo|quintus|sextus|septimus|superius|supranus|discantus|contratenor|contra|soprano|contralto|alto|canto|tiple|triplum|dessus|haute-contre|contre|taille|quinte|vox|voz'
const INSTRUMENTOS = 'flute|flutes|flauta|flautas|flauto|traverso|recorder|recorders|rec|oboe|oboes|clarinete|clarinet|clarinetto|fagote|bassoon|vl|vln|violin|violino|violinos|vla|viola|vc|vlc|cello|violoncello|vlne|violone|gamba|laud|lute|liuto|tecla|cembalo|cemb|hps|hpsc|harpsichord|organo|organ|org|orgao|continuo|bc|db|cb|contrabbasso|guitarra|guitar|trp|tromba|trumpet|cornetto|cor|piano'
const PARTE_PALAVRA = new RegExp(`^(${VOZES}|${INSTRUMENTOS}|parte|part|pars|partitura|score|sco)$`, 'i')
const PARTE_NUMERO = /^(i{1,3}|iv|v|vi|1|2|3|4|5|6|1er|1re|2e|2nd|3e|3rd|primo|secondo|terzo|primus|secundus|secunda|tertius|quarta|quinta|sexta|c)$/i
const PARTITURA = /^(partitura|score|sco|full score|grade)$/i
const PALAVRAS_PARTE = (s) => s.split(/\s+/).filter(Boolean)

// Marcas de versão: ficam em «Edição» e fora do título (mas contam para separar versões diferentes da mesma peça)
const VERSOES = [
  [/\bplay[\s-]*along\b/gi, 'play along'],
  [/\bclaves\s+modernas\b/gi, 'claves modernas'],
  [/\bclaves\s+alteradas\b/gi, 'claves alteradas'],
  [/\balla\s+(?:4|quarta)(?:a|ª)?\s+bass+a\b/gi, 'à quarta baixa'],
  [/\balla\s+(?:5|quinta)(?:a|ª)?\s+bass+a\b/gi, 'à quinta baixa'],
  [/\(?\b(?:4|quarta)\s*(?:a|ª|º)?\s*(?:alta|up)\b\)?/gi, 'à quarta alta'],
  [/\b(?:3a|terceira)\s+bassa\b/gi, 'à terceira baixa'],
  [/\balla\s+(?:2|seconda)(?:a|ª)?\s+alta\b/gi, 'à segunda alta'],
  [/\b(?:com\s+|por\s+\w+(?:\s+e\s+\w+)?\s+)?diminui(?:c|ç)(?:oes|ões|ao|ão)\b|\bdiminuido(?:\s+por\s+[\p{L}]+(?:\s+e\s+[\p{L}]+)?)?/giu, 'com diminuições'],
  [/\bglosas\b/gi, 'glosas'],
  [/\bcom\s+transposi(?:c|ç)(?:oes|ões)\b/gi, 'com transposições'],
  [/\b(?:reducao|redução)\b/gi, 'redução'],
  [/\bentabulado\b/gi, 'entabulado'],
  [/\breconstruido\b/gi, 'reconstruído'],
  [/\b(?:VOZ\s*letra|\(letra\)|letra)\b/gi, 'voz com letra'],
  [/\(inst\.?\s*(?=[)A-Z])/g, 'instrumental'],
  [/\btranspo(?:st|rtad)[oa]\b/gi, 'transposta'],
  [/\bvers(?:ao|ão)\s+(Cd\s?M|\d+|nova|[a-z])\b/gi, (m, v) => `versão ${v.replace(/\s/g, '')}`],
  [/\bnova\s+vers(?:ao|ão)\b/gi, 'nova versão'],
  [/\bversao\s+(\d+)\s+flautistas\b/gi, (m, n) => `versão para ${n} flautistas`],
]
// Lixo de nomes de ficheiro (cópias do Finale, «OK», «mus» no fim…)
const LIXO = /\b(copy|copia|cópia|ok|mus|musx|editado|edit|final)\b/gi
// Palavras que não identificam nada sozinhas (um título só com isto, sem compositor, fica por rever)
const SEM_SENTIDO = /^(mvt|mov|movt|movimento|nova|novo|new|teste?|untitled|sem|titulo|doc|ficheiro|file|score|parte|part|versao|versão|play|along|bois|afinacao|afinação|exercicios|exercícios|contrapontos)$/i
// Palavras em maiúsculas que não são apelidos
const MAIUSCULAS_NAO = /^(GLOSAS?|GLOSA|ESC|CSM|BWV|OPUS|SATB|TECLA|OK|VOZ|VOZLETRA|CLAVES|MODERNAS|PLAY|ALONG|MUS|MUSX|SOL|RE|DO|FA|LA|MI|SI|CDM|UP|TOM|TONO|II|III|IV|VI|VII|VIII|IX|XI|XII|SCO|MS|MM|BUXHEIMER|URTEXT|BURTEXT|ORIGIN|LAS|LASCO)$/
const ANONIMO = /^(anon|anonimo|anónimo|anonymous|anonymus|anonyme|incertus(?:\s+aut(?:h)?or)?|incerto)$/i
// Fontes que o Pedro escreve abreviadas no nome
const FONTES_ABREVIADAS = [[/\bESC\s*B\b/, 'E-E IV.a.24 (Cancionero de Escorial B)'], [/\bBUXHEIMER\b/i, 'D-Mbs Mus.ms. 3725 (Buxheimer Orgelbuch)']]
const NOTAS = { DO: 'Dó', RE: 'Ré', MI: 'Mi', FA: 'Fá', SOL: 'Sol', LA: 'Lá', SI: 'Si' }

function apelidoBonito(p) {
  return p
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (/^(de|da|do|dos|das|di|del|von|van|du|le|la|non)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
}

// Um nome de pessoa já conhecido como compositor na biblioteca (mapa de lotes_midi.autoresConhecidos)
export function conhecido(palavra, conhecidos) {
  const k = minus(palavra).replace(/[^a-z' -]/g, '').trim()
  if (k.length < 4) return null
  const e = conhecidos.get(k)
  if (!e) return null
  const papeis = [...(e.papeis?.entries?.() || [])]
  const comp = papeis.filter(([p]) => p === 'compositor').reduce((s, [, n]) => s + n, 0)
  const total = papeis.reduce((s, [, n]) => s + n, 0)
  if (total && comp / total < 0.5) return null
  return e
}
export function pessoaConhecida(e, nomeDado = '', { estrito = false } = {}) {
  const nomes = [...(e.nomes?.entries?.() || [])].sort((a, b) => b[1] - a[1])
  const total = nomes.reduce((s, [, n]) => s + n, 0)
  // (nome próprio: o que veio no nome do ficheiro, se a biblioteca o conhece para este apelido; senão só se for unânime)
  const dado = nomeDado && nomes.find(([n]) => minus(n).split(/\s+/)[0] === minus(nomeDado))
  // (nome dado no ficheiro que a biblioteca não tem para este apelido — «Lawes, William» quando só há Henry —: fica o do ficheiro)
  const nome = dado ? dado[0] : nomeDado && !estrito ? nomeDado : total >= 3 && nomes[0]?.[1] === total ? nomes[0][0] : ''
  return { apelido: e.apelido, ...(nome ? { nome } : {}), papel: 'compositor' }
}

// Palavras que nunca são um compositor, mesmo que alguém com esse apelido exista na biblioteca
const NUNCA_COMPOSITOR = /^(rose|folia|tento|tiento|fantasia|batalha|suite|ayre|canzona|ricercar|sonata|missa|magnificat|alleluia|kyrio|kyrie|entrada|verso|versos|obras|pavana|ballo|aria|cantus|tenor|altus|bassus|baixo|soprano|alto|flauta|flute|recorder|cantiga|origin|nova|ragione|bancheto|estampida|ombres|dances|english|sicut|labia|domine|ave|maria|virgo|tom|tono)$/i

// Nome do ficheiro → { titulo, autores, parte, versoes, fonte, folios, tonalidade, vozes, numero }
export function lerNomeFinale(nomeFicheiro, { conhecidos = new Map(), eDono = () => false } = {}) {
  let s = String(nomeFicheiro || '').normalize('NFC')
  // (extensões repetidas «.MUS.mus», «_musx.musx», «_mus.mus»)
  s = s.replace(/(\.(?:mus|musx|pdf))+$/i, '').replace(/[_\s-]+(?:mus|musx)$/i, '')
  // (letras estragadas pela passagem de disquetes/Mac antigo: «3ß Tom» = «3º Tom»; «5-› tom» = «5º tom»)
  s = s.replace(/(\d)\s*-?\s*[ß›]/g, '$1º').replace(/[‘’]/g, "'").replace(/\s*•\s*/g, ' - ')
  s = s.replace(/\bn[ß›]\s*/g, 'nº ').replace(/_+/g, ' ').replace(/\b([RGF])(I{1,3})\b/g, '$1 $2')
  // (sem espaços: «Cristo-OMagnum-cm» → segmentos)
  if (!/\s/.test(s.trim())) s = s.replace(/([\p{L}])-([\p{L}])/gu, '$1 - $2')
  // (palavras coladas: «LlibreVermell7LosSetGotxs», «PavanaLachrymae», «BWV1049(II)Vl2», «GLOSAS2», «1tom» → palavras)
  s = s.replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').replace(/\b([A-Z])([A-Z][a-zà-ÿ]+)/g, '$1 $2').replace(/([A-Za-zà-ÿ])(\d)/g, '$1 $2').replace(/(\d)([A-Za-zà-ÿ]{3,})/g, '$1 $2')
  // («3º tom-marco», «6º Tom -ines»: o nome do aluno)
  s = s.replace(/\b(tom|tono)\s*-\s*(\p{Ll})/giu, '$1 $2').replace(/,(\S)/g, ', $1')
  s = s.replace(/\(\s*/g, ' (').replace(/\s*\)/g, ') ').replace(/\s+/g, ' ').trim()
  const r = { titulo: '', autores: [], parte: '', versoes: [], fonte: '', folios: '', tonalidade: '', vozes: '', numero: '', ano: '' }
  // (ano entre parênteses: «ALaUnaYoNací(2008)»)
  s = s.replace(/\(\s*((?:19[5-9]|20[0-4])\d)\s*\)/, (m, a) => ((r.ano = a), ' '))

  // Fonte abreviada (ESC B, Buxheimer) e sigla RISM com cota no nome («de P-Cug mm 37»)
  for (const [re, fonte] of FONTES_ABREVIADAS) if (re.test(s)) (r.fonte = fonte), (s = s.replace(re, ' '))
  const sigla = /\b(?:de\s+)?([A-Z]{1,3}-[A-Z][A-Za-z]{0,4})\s+((?:mm|ms|mi|cod|codice)\.?\s*\d+[a-z]?)\b/i.exec(s)
  if (sigla) {
    r.fonte = r.fonte || `${sigla[1]} ${sigla[2].replace(/^([a-z]+)\.?\s*/i, (m, l) => l.toUpperCase() + ' ')}`.trim()
    s = s.replace(sigla[0], ' ')
  }
  // Fólios («fol 43v», «f. 23v-24», «131v», «122v-129r», «fol VII v») e páginas («(pag 28)»)
  // («fol» só com ponto ou espaço a seguir, e romanos só em maiúsculas: «folia» não é um fólio)
  const fol = /\b(?:[Ff]ol\.?\s+|[Ff]ol\.|[Ff]\.\s*)((?:\d+|[IVXLC]+(?![a-z]))\s*[rvRV]?(?:\s*-\s*\d+\s*[rvRV]?)?)|\b(\d{1,3}[rvRV](?:\s*-\s*\d{1,3}[rvRV]?)?)(?=\s|$|\))/.exec(s)
  if (fol) {
    r.folios = `fol. ${(fol[1] || fol[2]).replace(/\s+/g, '')}`
    s = s.replace(fol[0], ' ')
  }
  s = s.replace(/\(\s*pag\.?\s*(\d+)\s*\)/i, (m, p) => ((r.folios = r.folios || `p. ${p}`), ' '))
  // Marcas de versão
  for (const [re, v] of VERSOES) {
    s = s.replace(re, (...m) => {
      const t = typeof v === 'function' ? v(...m) : v
      if (!r.versoes.includes(t)) r.versoes.push(t)
      return ' '
    })
  }
  s = s.replace(LIXO, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim()
  // Tonalidade no fim, em maiúsculas («SOL M», «RE m», «DO M»)
  s = s.replace(/\s+\b(DO|RE|MI|FA|SOL|LA|SI)\b(?:\s+(M|m))?$/, (m, n, modo) => ((r.tonalidade = `${NOTAS[n]}${modo === 'm' ? ' menor' : modo === 'M' ? ' maior' : ''}`), ''))

  // Parte cava: o último segmento depois de « - », ou as últimas palavras («canzona altus», «Rec 1», «Flute II»)
  const segmentos = s.split(/\s+-\s+/)
  const eParte = (seg) => {
    // («- 005 Basso Generale per l'organo»: as partes que o Finale extrai levam um número de 3 algarismos)
    if (/^\d{3}\s+\p{L}/u.test(seg)) return true
    const p = PALAVRAS_PARTE(seg.replace(/^\d{3}\s+/, ''))
    return p.length && p.length <= 5 && p.some((w) => PARTE_PALAVRA.test(w)) && p.every((w) => PARTE_PALAVRA.test(w) || PARTE_NUMERO.test(w) || /^(\+|in|[A-G])$/.test(w))
  }
  if (segmentos.length > 1 && eParte(segmentos.at(-1))) {
    r.parte = segmentos.pop().replace(/^\d{3}\s+/, '')
    s = segmentos.join(' - ')
  } else {
    const p = PALAVRAS_PARTE(s)
    let i = p.length
    // (uma só voz/instrumento, com o número: «Flute II», «Rec 1», «quinta pars»; «Sonata vl cor vlne» é a instrumentação)
    if (i > 1 && PARTE_NUMERO.test(p[i - 1]) && PARTE_PALAVRA.test(p[i - 2] || '')) i -= 2
    else if (i > 1 && PARTE_PALAVRA.test(p[i - 1])) i--
    // («S Vl», «solo flute»: a parte solista)
    if (i < p.length && i > 1 && /^(s|solo)$/i.test(p[i - 1])) i--
    if (i < p.length && i > 0 && PARTE_PALAVRA.test(p[i - 1]) && !/^(pars|parte|part)$/i.test(p[i])) i = p.length
    // (letra solta depois de um número: «Sonate Trio 1 R», «Trio 2 G I» — flauta, guitarra… nos nomes do Boismortier)
    if (i === p.length && p.length > 2 && /^\d+$/.test(p.at(-3) || '') && /^[A-Z]$/.test(p.at(-2)) && /^(I{1,3})$/.test(p.at(-1))) i = p.length - 2
    else if (i === p.length && p.length > 2 && /^\d+$/.test(p.at(-2)) && /^[A-Z]$/.test(p.at(-1))) i = p.length - 1
    if (i < p.length && p.slice(i).some((w) => PARTE_PALAVRA.test(w) || /^[A-Z]$/.test(w))) {
      r.parte = p.slice(i).join(' ')
      s = p.slice(0, i).join(' ')
    }
  }
  if (r.parte) r.parte = PARTITURA.test(r.parte) ? 'partitura' : r.parte.replace(/\b\p{Ll}/u, (c) => c.toUpperCase())
  s = s.replace(/\s+-\s*$/, '').trim()

  // Número de ordem no início («10_Cima…», «111.Plus j'ay…», «01. ESC B…»; «3 Tom» é o tom, não um número)
  s = s.replace(/^(\d{1,3})[a-z]?\s*(?:[.)]\s*|\s+)(?![ºª]|tom\b|tono\b|toni\b)/i, (m, n) => ((r.numero = String(Number(n))), ''))
  // Nº de vozes («a4», «a 5», «(3voces)»)
  s = s.replace(/\b(?:a)\s?(\d)\b(?!\s*(?:alta|bassa))/i, (m, n) => ((r.vozes = `a ${n}`), ' ')).replace(/\(\s*(\d)\s*voces?\s*\)/i, (m, n) => ((r.vozes = `a ${n}`), ' '))

  // Compositor
  const autores = []
  const juntar = (a) => a && !eDono(a) && !autores.some((b) => minus(b.apelido || b.literal) === minus(a.apelido || a.literal)) && autores.push(a)
  // 1) «[ESCOBAR] …», «[Pedro de Cristo] …»
  s = s.replace(/^\[([^\]]+)\]\s*/, (m, n) => (NUNCA_COMPOSITOR.test(n) || !/^[\p{Lu}]/u.test(n) ? m : (juntar(pessoaDoNome(n, conhecidos)), '')))
  // 2) «Lawes, William …», «Dowland, John - …», «Mozart, Concierto…»
  {
    const m = /^([\p{Lu}][\p{L}'-]+),\s*([\p{L}.]+)?(\s*-\s)?\s*/u.exec(s)
    if (m) {
      const [todo, ap, nome = '', traco] = m
      const e = conhecido(ap, conhecidos)
      // (nome próprio só se a biblioteca o conhece como nome de alguém: «William» sim, «Concierto», «Suite» não)
      const eNome = nome && nomesProprios(conhecidos).has(minus(nome))
      // («Desprez, Josquin - …»: o «nome próprio» é o que a biblioteca conhece como apelido)
      const viaNome = !e && nome && traco && conhecido(nome, conhecidos)
      if (viaNome) (juntar(pessoaConhecida(viaNome)), (s = s.slice(todo.length)))
      else if (e) (juntar(pessoaConhecida(e, eNome ? nome : '')), (s = (eNome ? '' : `${nome} `) + s.slice(todo.length)))
      else if (eNome && traco) (juntar({ apelido: apelidoBonito(ap), nome, papel: 'compositor' }), (s = s.slice(todo.length)))
    }
  }
  const tudoMaiusculas = !/\p{Ll}/u.test(s)
  // 3) Palavras em MAIÚSCULAS («MORAGO …», «LOBO Duarte …», «CLEMENS NON PAPA …», «ESC B DUFAY BINCHOIS …»)
  s = s.replace(/(?:^|\s)((?:[\p{Lu}]{3,}[\p{Lu}'-]*)(?:\s+(?:NON|DE|DA|DI)\s+[\p{Lu}]{3,}|\s+[\p{Lu}]{4,})*)(?![\p{Ll}])(?:\s+([\p{Lu}][\p{Ll}]+)\b)?/gu, (m, caps, nome) => {
    const palavras = caps.split(/\s+/)
    // (apelido desconhecido em maiúsculas só no início — «HORTIS dixit…»; a meio é uma versão: «O Rosa Bella MOLINA», «AGUDO»)
    const noInicio = !s.slice(0, s.indexOf(caps)).replace(/[^\p{L}]/gu, '')
    if (!noInicio && !palavras.some((w) => conhecido(w, conhecidos))) return m
    if (tudoMaiusculas) return m
    // (o nome todo em maiúsculas — «CORREDORES DE SOMBRA», «8VERBUM CARO» — é o título, não um compositor)
    if (!s.replace(caps, '').replace(/[^\p{L}]/gu, '') && !palavras.some((w) => conhecido(w, conhecidos))) return m
    if (palavras.every((w) => MAIUSCULAS_NAO.test(w) || /^[IVXLC]+$/.test(w))) return m
    // (título inteiro em maiúsculas: não é um nome)
    if (palavras.length > 3) return m
    if (ANONIMO.test(caps)) return juntar({ literal: 'Anónimo', papel: 'compositor' }), ` ${nome || ''} `
    // (vários apelidos seguidos — «DUFAY BINCHOIS» — são várias pessoas; «CLEMENS NON PAPA» é uma)
    const varios = palavras.length > 1 && !/\s(NON|DE|DA|DI)\s/.test(caps) && palavras.every((w) => conhecido(w, conhecidos))
    const lista = varios ? palavras : [caps]
    for (const p of lista) {
      if (MAIUSCULAS_NAO.test(p)) continue
      const e = conhecido(p, conhecidos)
      const dado = nome && !NUNCA_COMPOSITOR.test(nome) && e && pessoaConhecida(e, nome, { estrito: true }).nome === nome ? nome : ''
      juntar(e ? pessoaConhecida(e, dado) : { apelido: apelidoBonito(p), ...(nome && /^(Duarte|Pedro|Manuel|Filipe|João|António|Estevão|Diogo)$/.test(nome) ? { nome } : {}), papel: 'compositor' })
      if (dado || (nome && /^(Duarte|Pedro|Manuel|Filipe|João|António|Estevão|Diogo)$/.test(nome))) nome = ''
    }
    return ` ${nome || ''} `
  })
  // «Pedro de CRISTO», «Pedro de Criso» (gralha)
  s = s.replace(/\bPedro\s+de\s+Cris(?:t)?o\b/i, () => (juntar({ apelido: 'Cristo', nome: 'Pedro de', papel: 'compositor' }), ' '))
  // 4) « - Dario Castello», « - Mathew Locke», « - Bertali» (segmento final ou do meio com um nome)
  const segs = s.split(/\s+-\s+/)
  if (segs.length > 1) {
    for (let k = segs.length - 1; k >= 0; k--) {
      const seg = segs[k].trim()
      const e = conhecido(seg.split(/\s+/).at(-1), conhecidos)
      // (pessoa desconhecida da biblioteca: só com um nome próprio que ela conhece — «Dario Castello», «Mathew Locke»)
      const pessoaSeg = /^([\p{Lu}][\p{Ll}]+\s+){1,2}[\p{Lu}][\p{Ll}]+(-[\p{Lu}][\p{Ll}]+)?$/u.test(seg) && nomesProprios(conhecidos).has(minus(seg.split(/\s+/)[0])) && !NUNCA_COMPOSITOR.test(seg.split(/\s+/).at(-1))
      if (e && seg.split(/\s+/).length <= 3 && !NUNCA_COMPOSITOR.test(seg.split(/\s+/).at(-1))) {
        const primeiro = seg.split(/\s+/).length > 1 ? seg.split(/\s+/)[0] : ''
        if (primeiro && !nomesProprios(conhecidos).has(minus(primeiro))) continue
        juntar(pessoaConhecida(e, primeiro))
        segs.splice(k, 1)
        break
      }
      if (pessoaSeg && k > 0 && seg.split(/\s+/).length >= 2) {
        juntar({ ...(pessoaDoNome(seg, conhecidos) || {}) })
        segs.splice(k, 1)
        break
      }
    }
    s = segs.join(' - ')
  }
  // 5) Um apelido de compositor já conhecido na biblioteca em qualquer ponto («Cima», «frescobaldi», «Satie», «rognoni»)
  if (!autores.length) {
    const p = s.split(/\s+/)
    for (let k = 0; k < p.length; k++) {
      const w = p[k].replace(/[^\p{L}'-]/gu, '')
      if (NUNCA_COMPOSITOR.test(w) || ANONIMO.test(w)) {
        if (ANONIMO.test(w)) (juntar({ literal: 'Anónimo', papel: 'compositor' }), (p[k] = ''))
        continue
      }
      const e = conhecido(w, conhecidos)
      if (e) {
        // («pedro castro»: o nome próprio antes do apelido, se a biblioteca o conhece para ele)
        const antes = (p[k - 1] || '').replace(/[^\p{L}]/gu, '')
        const comNome = antes && [...(e.nomes?.keys?.() || [])].some((n) => minus(n).split(/\s+/)[0] === minus(antes))
        juntar(pessoaConhecida(e, comNome ? antes : ''))
        if (comNome) p[k - 1] = ''
        p[k] = ''
        // («de Pugnani-Kreisler»: tirar o «de» que fica a mais)
        if (/^de$/i.test(p[k - 1] || '')) p[k - 1] = ''
        break
      }
    }
    s = p.filter(Boolean).join(' ')
  }
  // Nº de catálogo de um só compositor («BWV1049(II)Vl1» é de Bach)
  if (!autores.length) {
    const cat = /\b(BWV|BuxWV|HWV|TWV|RV|KV|K\.)\s?\d/i.exec(s)
    const dono = cat && { bwv: 'Bach', buxwv: 'Buxtehude', hwv: 'Händel', twv: 'Telemann', rv: 'Vivaldi', kv: 'Mozart', 'k.': 'Mozart' }[cat[1].toLowerCase()]
    const e = dono && (conhecido(dono, conhecidos) || { apelido: dono })
    if (e) juntar(e.nomes ? pessoaConhecida(e) : { apelido: dono, papel: 'compositor' })
  }
  r.autores = autores.filter((a) => a.apelido || a.literal)
  // O dono no nome («2º tom pedro silva»): exercícios dele — é o compositor (Pedro, 1/10: «fico como autor»)
  {
    const p = s.split(/\s+/)
    for (let k = 0; k < p.length - 1 && !r.dono; k++) {
      for (const n of [3, 2]) {
        const trecho = p.slice(k, k + n).join(' ')
        if (p.length - k >= n && /^\p{L}/u.test(trecho) && eDono(trecho)) {
          r.dono = true
          p.splice(k, n)
          break
        }
      }
    }
    s = p.join(' ')
  }

  // Título: o que sobra, arrumado
  let t = s.replace(/(\s*-\s*){2,}/g, ' - ').replace(/(\S)-\s+-/g, '$1 -').replace(/^[\s\-–.,;:]+|[\s\-–.,;:]+$/g, '').replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim()
  // (variante «b» solta no fim: «…122v-129r b»)
  t = t.replace(/\s+[a-z]$/, '').replace(/\s+\d$/, (m) => (/\b(tom|n|nº|no|op|opus|sonata|suite|trio|canzon\w*|ballo|prelude|gnossienne|kyrio|kyrie|fantasia|lauro|part)\s+\d$/i.test(t) ? m : m))
  t = t.replace(/^[A-Z]\s+-\s+/, '').replace(/\bBWV\s?(\d+)/gi, 'BWV $1').replace(/\s+/g, ' ').trim()
  if (t && t === t.toLowerCase()) t = t.charAt(0).toUpperCase() + t.slice(1)
  r.titulo = t
  return r
}

// Nomes próprios que a biblioteca conhece (Dario, Mathew, Giovanni…)
const nomesCache = new WeakMap()
function nomesProprios(conhecidos) {
  if (!nomesCache.has(conhecidos)) {
    const set = new Set()
    for (const e of conhecidos.values()) for (const n of e.nomes?.keys?.() || []) set.add(minus(String(n).split(/\s+/)[0]))
    set.delete('')
    nomesCache.set(conhecidos, set)
  }
  return nomesCache.get(conhecidos)
}

// «Dario Castello», «Mathew Locke», «Pedro de Cristo», «Lopes Morago» → pessoa (com a grafia da biblioteca se for conhecida)
export function pessoaDoNome(texto, conhecidos) {
  const s = String(texto || '').trim()
  if (!s) return null
  if (ANONIMO.test(s)) return { literal: 'Anónimo', papel: 'compositor' }
  const palavras = s.split(/\s+/)
  const ultimo = palavras.at(-1)
  const e = conhecido(ultimo, conhecidos)
  if (e) return pessoaConhecida(e, palavras.length > 1 ? palavras[0] : '')
  if (palavras.length === 1) return { apelido: apelidoBonito(s), papel: 'compositor' }
  const particulas = /^(de|da|do|dos|das|di|del|von|van|du|le|la)$/i
  let i = palavras.length - 1
  while (i > 1 && particulas.test(palavras[i - 1])) i--
  return { apelido: palavras.slice(i).map((w) => (w === w.toUpperCase() ? apelidoBonito(w) : w)).join(' '), nome: palavras.slice(0, i).join(' '), papel: 'compositor' }
}

// ---------------------------------------------------------------------------
// A ficha de um ficheiro do Finale: a ficha interna do .musx primeiro, o nome do ficheiro completa o que faltar.
// Fica «completa» mesmo sem data (excepção só para o Finale, Pedro 17/10/2026), com a etiqueta ETIQUETA_FINALE,
// se o título disser alguma coisa: com compositor, ou com 2+ palavras com sentido. Senão fica por rever.
export const ETIQUETA_FINALE = 'Finale — dados do nome'
const FONTE_NO_SUBTITULO = /\b[A-Z]{1,3}-[A-Z][A-Za-z]*\b|\bfol\.?\s*\d|\bf\.\s*\d|\(\d+[rv]/

const palavrasComSentido = (t) => String(t || '').split(/[^\p{L}]+/u).filter((w) => w.length >= 3 && !SEM_SENTIDO.test(w))

// Pessoa escrita na ficha interna do Finale → { apelido, nome } | { literal } (com a grafia da biblioteca)
function compositorDaFicha(texto, conhecidos) {
  const duvida = /\?\s*$/.test(texto)
  const s = String(texto || '').replace(/\?\s*$/, '').trim()
  if (!s) return { pessoa: null, duvida }
  if (ANONIMO.test(s)) return { pessoa: { literal: 'Anónimo', papel: 'compositor' }, duvida }
  return { pessoa: pessoaDoNome(s.replace(/^([A-Z])\.\s*([A-Z])\.\s*/, '$1. $2. '), conhecidos), duvida }
}

export function fichaFinale({ nome, musx = {}, conhecidos = new Map(), eDono = () => false, pessoaDono = null }) {
  const n = lerNomeFinale(nome, { conhecidos, eDono })
  const ext = (/\.(musx?)$/i.exec(String(nome || '')) || [])[1]?.toLowerCase() || 'mus'
  const origem = {}
  const notas = []
  // Título
  let titulo = n.titulo
  origem.titulo = 'nome'
  // (a ficha interna pode ter ficado de outro ficheiro reaproveitado no Finale: «Les Nimphes de La Grenoullere.musx» diz
  //  «Les ombres» lá dentro. Se o nome tem um título próprio sem nada em comum com o da ficha, manda o nome, com nota)
  // (palavras de 4+ letras: «Les» não conta como coisa em comum)
  const fortes = (x) => palavrasComSentido(x).filter((w) => w.length >= 4).map(minus)
  const outroFicheiro = musx.titulo && fortes(n.titulo).length >= 1 && !fortes(n.titulo).some((w) => fortes(musx.titulo).includes(w))
  if (outroFicheiro) notas.push(`A ficha interna do Finale diz «${musx.titulo}»${musx.compositor ? ` (${musx.compositor})` : ''}: talvez seja de outro ficheiro reaproveitado — ficou o título do nome do ficheiro.`)
  else if (musx.titulo) (titulo = musx.titulo), (origem.titulo = 'ficha do Finale')
  // Fonte e fólios: o subtítulo da ficha interna («P-Cug MM 36 fol. 39v») ou o nome
  let colecao = [n.fonte, n.folios].filter(Boolean).join(', ')
  if (outroFicheiro) {
    // (o subtítulo também é do outro ficheiro)
  } else if (musx.subtitulo && FONTE_NO_SUBTITULO.test(musx.subtitulo)) colecao = musx.subtitulo
  else if (musx.subtitulo && palavrasComSentido(musx.subtitulo).length >= 2 && !minus(titulo).includes(minus(musx.subtitulo))) titulo = titulo ? `${titulo}: ${musx.subtitulo}` : musx.subtitulo
  if (!titulo && colecao) titulo = n.titulo
  // Compositor
  let autores = n.dono && pessoaDono ? [...n.autores, { ...pessoaDono, papel: 'compositor' }] : n.autores
  origem.compositor = autores.length ? 'nome' : ''
  if (musx.compositor) {
    const c = compositorDaFicha(musx.compositor, conhecidos)
    if (c.pessoa && !eDono(c.pessoa)) {
      autores = [c.pessoa]
      origem.compositor = 'ficha do Finale'
      if (c.duvida) notas.push(`Atribuição duvidosa na ficha do Finale («${musx.compositor}»).`)
    }
  }
  // O dono nos direitos do .musx («© 2014 Pedro Sousa Silva / Arte Minima») é o editor da transcrição; o ano é a data
  // da edição (Pedro, 17/10/2026). Nos .mus não se sabe quem fez a transcrição: sem editor.
  let data = n.ano
  if (ext === 'musx' && musx.direitos) {
    const ano = (/\b(19[89]\d|20[0-4]\d)\b/.exec(musx.direitos) || [])[1]
    const titular = titularDosDireitos(musx.direitos).split(/\s*\/\s*/)[0]
    if (titular && eDono(titular) && pessoaDono && !autores.some(eDono)) {
      autores = [...autores.filter((a) => !eDono(a)), { ...pessoaDono, papel: 'editor' }]
      if (ano) data = ano
    }
  }
  const metadados = {
    formato: `Finale (.${ext})`,
    ...(n.versoes.length ? { edicao: n.versoes.join('; ') } : {}),
    ...(colecao ? { colecao, conteudo_tipo: 'Peça de uma colecção' } : {}),
    ...(n.tonalidade ? { tonalidade: n.tonalidade } : {}),
    ...(n.vozes ? { instrumentacao: n.vozes } : {}),
  }
  const compositores = autores.filter((a) => a.papel !== 'editor')
  const sentido = palavrasComSentido(titulo).length
  const completa = !!titulo && /[\p{L}\d]/u.test(titulo) && (compositores.length > 0 || sentido >= 2 || origem.titulo === 'ficha do Finale')
  const motivo = completa ? '' : !titulo ? 'O nome do ficheiro não tem título.' : `Nome do ficheiro pouco informativo («${String(nome).replace(/\.(musx?)$/i, '')}»): identificar a peça e o compositor.`
  // Chave para juntar as partes cavas: compositor + título + versão + nº de ordem (sem a parte nem os fólios)
  const chave = [compositores[0]?.apelido || compositores[0]?.literal || '', titulo, n.versoes.join(' '), n.numero, n.vozes, n.tonalidade]
    .map((x) => minus(x).replace(/[^a-z0-9]+/g, ' ').trim())
    .join('|')
  return { campos: { titulo: titulo || n.titulo, autores, ...(data ? { data } : {}), metadados }, parte: n.parte, chave, completa, motivo, notas, origem, ext }
}

// Fichas → grupos de partes cavas da mesma peça (2+ ficheiros com a mesma chave e título com sentido).
// Fica a ficha principal: a partitura (sem parte) e, entre iguais, o .musx e o nº mais baixo.
export function agruparFinale(fichas) {
  const grupos = new Map()
  for (const f of fichas) grupos.set(f.chave, [...(grupos.get(f.chave) || []), f])
  // (por rever: só se juntam as partes cavas de um mesmo jogo — 2+ partes diferentes com a mesma chave; «Fantasia» e
  //  «Fantasia» sem mais nada podem ser peças diferentes)
  for (const [k, lista] of [...grupos]) {
    if (lista[0].completa) continue
    const partes = new Set(lista.map((f) => f.parte).filter((p) => p && p !== 'partitura'))
    if (lista.length > 1 && partes.size >= 2 && k.replace(/\|/g, '').trim()) continue
    grupos.delete(k)
    for (const f of lista) grupos.set(`#${f.numero}`, [f])
  }
  const ordem = (f) => [f.parte && f.parte !== 'partitura' ? 1 : 0, f.ext === 'musx' ? 0 : 1, Number(f.numero) || 0]
  const cmp = (a, b) => {
    const x = ordem(a)
    const y = ordem(b)
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
  }
  return [...grupos.values()].map((lista) => {
    const membros = [...lista].sort(cmp)
    const principal = membros[0]
    // (campos vazios da principal preenchidos pelas outras: compositor, data, fonte)
    const campos = { ...principal.campos, metadados: { ...principal.campos.metadados } }
    for (const o of membros.slice(1)) {
      if (!campos.autores?.length && o.campos.autores?.length) campos.autores = o.campos.autores
      if (!campos.data && o.campos.data) campos.data = o.campos.data
      for (const k of ['colecao', 'conteudo_tipo', 'tonalidade', 'instrumentacao']) if (!campos.metadados[k] && o.campos.metadados[k]) campos.metadados[k] = o.campos.metadados[k]
    }
    if (membros.length > 1) {
      const exts = [...new Set(membros.map((m) => `.${m.ext}`))].join(', ')
      const partes = membros.map((m) => m.parte).filter((p) => p && p !== 'partitura')
      campos.metadados.formato = `Finale (${exts}): ${membros.length} ficheiros`
      if (partes.length) campos.metadados.instrumentacao = [campos.metadados.instrumentacao, `partes: ${[...new Set(partes)].join(', ')}`].filter(Boolean).join('; ')
    }
    return { principal, membros, campos, completa: principal.completa, motivo: principal.motivo, notas: [...new Set(membros.flatMap((m) => m.notas))] }
  })
}
