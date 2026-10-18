// PDFs de transcrições feitos num editor de partituras (Finale, Sibelius, MuseScore, LilyPond…): o que se sabe deles
// sem a IA (Pedro, 17/10/2026). A IA lê mal estas impressões (dá «Superius», «Tom», «Vc», «[Composer]» como
// compositor): os dados vêm do NOME do ficheiro (como nos ficheiros do Finale, ver finale.js) e do TEXTO da 1.ª página
// (`pdftotext -l 1 -layout`): título centrado no topo, compositor à direita, a parte cava no canto esquerdo
// («Tenor», «Violin», «bassus»), «© 2007 L'Universo Sommerso», a fonte («Cancionero Escorial IV.a.24 / fol. 55 v - 56»).
// O compositor só fica se for confirmado (nome do ficheiro, texto da página ou compositor já conhecido na biblioteca).
// A ficha fica «completa» mesmo sem data, com a etiqueta ETIQUETA_TRANSCRICAO, se o título disser alguma coisa.
// Funções puras (sem base de dados nem disco): o comando transcricoes_pdf.js e o processador usam-nas.
import { lerNomeFinale, nomeDePessoa, pessoaDoNome, conhecido, pessoaConhecida } from './finale.js'

export const ETIQUETA_TRANSCRICAO = 'Transcrição — dados do ficheiro'
// Programas de edição de partituras (campo «Creator» do PDF)
export const PROGRAMAS_PARTITURA = /Finale|Sibelius|MuseScore|Dorico|LilyPond|Encore|capella|Overture|Logic|Notion/i
export const ePdfDeEditorDePartituras = (programa) => PROGRAMAS_PARTITURA.test(String(programa || ''))

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const minus = (s) => sem(s).toLowerCase()
const chaveTexto = (s) => minus(s).replace(/[^a-z0-9]+/g, ' ').trim()

// Vozes e instrumentos que aparecem como nome de parte (no nome do ficheiro e no canto da página)
const PARTES =
  'cantus|cantvs|altus|tenor|tenore|bassus|basso|bass|bajo|baixo|quintus|sextus|septimus|superius|supranus|discantus|descantus|contratenor|contretenor|countertenor|counter-tenor|contra|soprano|contralto|alto|canto|tiple|triplum|dessus|haute-contre|haute|contre|taille|quinte|treble|vox|voz|' +
  'flute|flutes|flauta|flautas|flauto|traverso|recorder|recorders|rec|blfl|oboe|oboes|hautbois|clarinete|clarinet|fagote|bassoon|fagotto|horn|horns|corno|trumpet|trumpets|tromba|trombone|timpani|sax|' +
  'vl|vln|violin|violino|violini|violinos|viola|vla|vc|vlc|cello|violoncello|vlne|violone|gamba|laud|lute|liuto|tecla|cembalo|cemb|hpsi|harpsichord|organo|organ|orgao|continuo|bc|b\\.c\\.|guitarra|guitar|cornetto|' +
  'parte|part|pars|partitura|score|sco|generale'
const PARTE_PALAVRA = new RegExp(`^(${PARTES})\\.?$`, 'i')
const PARTE_AUXILIAR = /^(i{1,3}|iv|v|vi|[1-6]|[1-6]º|1er|1ere|1re|2e|2eme|2ème|2nd|3e|3rd|primo|secondo|terzo|prima|seconda|primus|secundus|tertius|quarta|quinta|sexta|e|and|&|\+|in|solo|dolce|alto|tenor|bass|basso|grande|basset|sopranino|a\.|[a-g]|bb|eb|1,2)$/i
// Uma célula que é só o nome de uma parte («Alto Recorder 2», «[Superius I]», «(Haute C)», «II Dessus», «Flauto Iº»)
export function eNomeDeParte(texto) {
  const s = String(texto || '').replace(/^[[(]\s*|\s*[\])]$/g, '').trim()
  const p = s.split(/\s+/).filter(Boolean)
  if (!p.length || p.length > 4) return false
  return p.some((w) => PARTE_PALAVRA.test(w)) && p.every((w) => PARTE_PALAVRA.test(w) || PARTE_AUXILIAR.test(w))
}

// Palavras que nunca são compositor (andamentos, géneros, vozes, marcas da página)
const NAO_PESSOA =
  /^(allegro|largo|adagio|andante|grave|presto|vivace|vivo|moderato|lento|lentement|dolce|cantabile|staccato|maestoso|preludio|prelude|praeludium|fuga|fugue|sonata|sonate|suite|concerto|sinfonia|symphony|score|fantasia|fantazie|fantasie|air|ayre|aria|pavan|pavana|pavin|almain|almaine|allemande|courante|coranto|corant|sarabande|zarabanda|gigue|jig|menuet|minuet|gavotte|chaconne|ciaccona|passacaglia|ballata|motete|motet|romance|canzona|canzon|ricercar|recercada|tiento|tento|toccata|verso|versos|entrada|obra|tom|tono|kyrie|kyrio|missa|gloria|credo|magnificat|amen|responsorium|ballo|danza|dance|dances|catch|catches|fine|sonatina|estudio|etude|study|studie|exercicio|exercício|ricercare|partita|cantata|motetto|madrigal|chanson|villancico|estampida|ductia|saltarello|galliard|gagliarda|ballet|overture|ouverture|march|marcha|rondo|rondeau|variations|variaciones|diferencias|differencias|glosa|glosas|hymn|hymnus|psalm|salmo|antiphon|responsorio|lamentatio|lectio|introitus|offertorium|communio|sanctus|agnus|benedictus|deum|cancionero|codex|ms|fol|harmonized|edited|arranged|copyright|title|composer|untitled|duet|duett|trio|quartet|quartetto|quintet|op|opus|bwv|no|nº|ii|iii|iv|vi|vii|viii|ix|x)$/i
const ANONIMO = /^(an[oó]n(?:imo|ymous|ymus|yme|\.)?|an[oó]m\.?|anón-?|anonim\.?|incertus|incerto)(\s|$|[.,(-])/i
// Títulos que não identificam nada (exemplos reais: «[Title]», papel pautado sem música)
const TITULO_VAZIO = /^\[?(title|untitled|sem t[ií]tulo|score|partitura|papel pautado|papel de m[uú]sica|staff paper)\]?$/i
// Palavras sem sentido para um título (como em finale.js)
const SEM_SENTIDO = /^(mvt|mov|movt|movimento|nova|novo|new|teste?|untitled|sem|titulo|title|doc|ficheiro|file|score|parte|part|versao|versão|play|along|pdf|papel|pautado|copy|mus|musx|afinacao|afinação|exercicios|exercícios)$/i
const palavrasComSentido = (t) => String(t || '').split(/[^\p{L}]+/u).filter((w) => w.length >= 3 && !SEM_SENTIDO.test(w))
// Títulos de andamento/género sozinhos («Largo», «Fantazie», «Sonata I»): o nome do ficheiro pode dizer mais
const GENERICO = /^(allegro|largo|adagio|andante|grave|presto|vivace|vivo|preludio|prelude|praeludium|fuga|fugue|sonata|sonate|sonatina|suite|partita|concerto|cantata|fantasia|fantazie|toccata|ricercar|ricercare|canzona|canzon|air|ayre|aria|pavan|pavana|canon|menuet|minuet|minuetto|musette|gavotte|bourr[ée]e|allemande|courante|sarabande|gigue|chaconne|duetto|trio|score|[ivxlc]+|\d+|n[ºo]\.?|op\.?)$/i

// ---------------------------------------------------------------------------
// Texto da 1.ª página

// (glifos das fontes de música: Maestro/Petrucci do Finale, Opus do Sibelius, privados do LilyPond)
const GLIFOS = /[œŒ˙∑„ÛÚÿ‰⋲ÇÈÏ̇§îöú-]/gu
const eGlifoLetra = (w) => /^[wWbnBVcCJjUuÓÔ#&?]+$/.test(w)
function eTexto(c) {
  const glifos = (c.match(GLIFOS) || []).length
  if (glifos > 1 && glifos / c.length > 0.12) return false
  const palavras = c.replace(GLIFOS, ' ').split(/[^\p{L}]+/u).filter((w) => w.length >= 3 && !eGlifoLetra(w))
  if (!palavras.length) return false
  // (forma da peça: «ABAAABAB», «ABBAA»)
  if (/^[AB]{4,}$/.test(c.trim())) return false
  return true
}
// (sílabas da letra por baixo da pauta: «Ver - bum ca - ro», «cla - ma-vi»)
const eLetra = (c) => /^\p{Ll}{1,5}\s+-\s+\p{Ll}{1,5}\b/u.test(c.trim()) || eLetra2(c)
const eLetra2 = (c) => (c.match(/\s-\s|\s-$|^-\s|\p{L}-\s|\s-\p{L}|\p{L}-\p{L}/gu) || []).length >= 2 || /^\p{Ll}{1,4}$/u.test(c.trim())
// (linha com uma clave e compasso: «&c», «Vb C», «?b c», «& 42», «Bc»)
const ePauta = (l) => /(^|\s)[&V?B]\s?[b#n]{0,6}\s?(c|C|¢|\d{1,2})(\s|$)/.test(l) && (l.match(GLIFOS) || []).length + (l.match(/(^|\s)[wW˙](\s|$)/g) || []).length >= 1

// Linhas do topo da página → células de texto com a posição (início, fim, centro) na largura da página
function celulas(texto) {
  const linhas = String(texto || '').replace(/\f/g, '\n').split('\n').slice(0, 70)
  // (margens: a zona ocupada pelas pautas — o título está centrado nela, o compositor encostado à direita)
  const comMusica = linhas.filter((l) => (l.match(GLIFOS) || []).length >= 3)
  const esq = comMusica.length ? Math.min(...comMusica.map((l) => l.search(/\S/))) : 0
  const dir = Math.max(60, ...linhas.map((l) => l.replace(/\s+$/, '').length))
  const largura = Math.max(40, dir - esq)
  const out = []
  let pauta = -1
  linhas.forEach((l, i) => {
    if (pauta < 0 && ePauta(l)) pauta = i
    for (const m of l.matchAll(/\S+(?: \S+)*/g)) {
      if (!eTexto(m[0].trim())) continue
      // (glifos soltos colados ao texto: «treble \uF026»)
      const t = m[0].replace(/(^|\s)[œŒ˙∑„ÛÚÿ‰⋲\uE000-\uF8FF]+(?=\s|$)/gu, ' ').replace(/\s+/g, ' ').trim()
      const ini = Math.max(0, m.index - esq)
      const fim = Math.max(ini + 1, m.index + m[0].length - esq)
      out.push({ t, linha: i, ini, fim, centro: (ini + fim) / 2 / largura, largura })
    }
  })
  return { celulas: out, pauta, largura }
}

const ANO = /\b(1[4-9]\d\d|20[0-4]\d)\b/
// Linha de direitos: «© 2007 L'Universo Sommerso», «PDF © 2004 Margaret Greentree», «Copyright © 2005 by Anders Stenberg
// (under CPDL lisence)», «© Copyright Ernesto Schmied», «©2006 Eric Haas», «© W. Long, 2006.» → { titular, ano }
export function lerDireitos(linha) {
  const s = String(linha || '')
  const i = s.search(/©|\(c\)\s*\d|copyright/i)
  if (i < 0) return null
  let resto = s.slice(i).split(/\s{3,}/)[0]
  // (rodapé do Mutopia: «Copyright © 2007. Reference: Mutopia-2007/05/14-978» → a editora é o Mutopia Project)
  const mutopia = /mutopia/i.test(resto)
  resto = resto.replace(/\breference:.*$/i, '')
  const anos = [...resto.matchAll(/\b(1[89]\d\d|20[0-4]\d)\b/g)].map((m) => m[1])
  const titular = resto
    .replace(/©|\(c\)|copyright|todos os direitos reservados|all rights reserved|licensed under.*$/gi, ' ')
    .replace(/\((?:under|bajo|sob)[^)]*\)?/gi, ' ')
    .replace(/\b(1[89]\d\d|20[0-4]\d)\b(\s*[-–]\s*\b(1[89]\d\d|20[0-4]\d)\b)?/g, ' ')
    .replace(/\s+[-–]\s+(www\.|https?:).*$/i, ' ')
    .replace(/^\s*(by|por|de)\s+/i, ' ')
    .replace(/\s+(by|por)\s+/gi, ' ')
    .replace(/[^\p{L}\d)]+$/gu, '')
    .replace(/^[\s,.;:–-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { titular: mutopia && !titular ? 'Mutopia Project' : titular, ano: anos.at(-1) || '', linha: resto.trim() }
}

// Fonte da peça escrita na página
const FONTE =
  /\b(fol\.?\s*\d|fol\.?\s*$|ff?\.\s*\d|fl\.\s*\d|pp?\.\s*\d|cancionero|cancioneiro|chansonnier|codex|c[oó]dice|cod\.?\s*\d|mus\.?\s*ms|liedbuch|orgelbuch|organ book|libro de|livre de|livro de|biblioteca|bibliot|library|samling|collection|fondo|nos\.\s*\d|orpheus britannicus|h[äa]ndelgesellschaft|musique de joye|the catch club|univ\.|universidade|universit[àa]|odhecaton|harmonice musices|ms\.?\s+\p{L}+\s+\d+)\b|\([\p{L} .]+,\s*[\p{L} .]+,\s*(?:ca\.\s*)?1[4-8]\d\d\)|\b[A-Z]{1,3}-[A-Z][A-Za-z]{0,4}\s+(?:cod\.?\s*|ms\.?\s*|mm\s*)?\d/iu
// Pessoas que editaram, arranjaram ou transcreveram («arr. Lucía Martínez», «Edited by Frideric Chrysander»)
const EDITOR = /^(?:arr\.?|arreg(?:l)?\.?|arranged by|arranjo(?: de)?|transcr\.?(?: by)?|transcribed by|transcri[çc][ãa]o(?: de)?|edited by|ed\.|edição(?: de)?|edici[óo]n(?: de)?|continuo realization by|realiza[çc][ãa]o(?: de)?)\s+(.+)$/i
// Marcas de compositor («Harmonized by J.S. Bach», «del Señor Scarlatti», «By Anonymous»)
const MARCA_COMPOSITOR = /^(?:harmonized by|harmonised by|composed by|by|del se[ñn]or|von|de)\s+(.+)$/i
// (época sem nome: «s.XIV italiano», «s.XIII español»)
const EPOCA = /^s\.\s*[XVI]+\b/i
// (datas de vida: «(1690-1772)», «(fl ca 1450)», «(*1966)», «(s. XV)», «1659-1695»; um ano sozinho — «(1686)» — não é)
const DATAS_VIDA = /\(\s*(?:c\.|ca\.?|fl\.?\s*(?:ca\.?)?|\*|†|n\.)\s*[\d?]{3,4}|\(\s*(?:ca?\.\s*)?[\d?]{3,4}\??\s*[-–]|\(\s*s\.?\s*[XVI]+|\b1[4-9]\d\d\s*[-–]\s*1[4-9]\d\d\b/i

// «Mr. Richard Cobb 1)», «Francesco Barsanti (1690-1772)», «Horlay (fl ca 145» (cortado), «Henry Purcell 1659-1695»
function limparNome(s) {
  return String(s || '')
    .replace(/\s*\((?:[^)]*\d[^)]*|\s*s\.?\s*[XVI]+[^)]*)\)?\s*$/i, '')
    .replace(/\s*\(\s*$/, '')
    .replace(/\s+\b1[4-9]\d\d\s*[-–]\s*1[4-9]\d\d\b.*$/, '')
    .replace(/\s+\d\)\s*$/, '')
    .replace(/^(?:mr|mrs|capt|sr|dr|don|d)\.\s+/i, '')
    .replace(/\s*\(\s*\)\s*/g, ' ')
    .replace(/[\s,;:]+$/, '')
    .trim()
}
// Parece o nome de uma pessoa? («Joh.Seb. Bach», «Stephanus Lopezius [Estevão Lopes Morago]», «J. C. Schickhardt»)
// Só maiúsculas iniciais, iniciais e partículas («Canción estrófica italiana», «All of me» não são pessoas)
function pareceNome(s) {
  const t = nomeDePessoa(limparNome(s)) || limparNome(s)
  if (!t || /\d|[{}=:;!?]/.test(t) || t.length > 60) return false
  // (dedicatórias: «A María José León», «To Mr. …», «Pour …»)
  if (/^(A|À|To|Para|Pour|Für|Al|Alla|Dedicated)\s/u.test(t)) return false
  if (ANONIMO.test(t)) return true
  const p = t.replace(/\.(?=\S)/g, '. ').split(/\s+/).filter(Boolean)
  if (p.length > 6) return false
  let fortes = 0
  for (const w of p) {
    const x = w.replace(/[.,'’]+$/g, '')
    if (NAO_PESSOA.test(x) || PARTE_PALAVRA.test(x)) return false
    if (/^(de|da|do|dos|das|di|del|della|des|von|van|du|le|la|y|non|der|den)$/i.test(x)) continue
    if (/^\p{Lu}\.?$/u.test(x) || /^\p{Lu}\p{Ll}{0,3}\.$/u.test(w)) continue
    if (/^(\p{Lu}'|l')?\p{Lu}[\p{Ll}'’]+(-\p{Lu}?[\p{Ll}'’]+)*$/u.test(x) || /^\p{Lu}{2,}(-\p{Lu}{2,})*$/u.test(x)) {
      fortes++
      continue
    }
    return false
  }
  return fortes >= 1
}

// Indicações de execução, não títulos («simile hasta», «Moderato {q = c 108}», «D.C. al fine», «[forte]»)
const DIRECCAO_RE = /^\[?(simile|cresc|dim|rit|rall|a tempo|d\.\s?c\.|da capo|fine|staccato|legato|tutti|forte|piano|sub|frull|missing part)\b|[{}=]/i
const DIRECCAO = { test: (t) => DIRECCAO_RE.test(t) || /^\p{Ll}/u.test(t) }
// (o título não pode ser só o nome de partes misturado com glifos: «Alto & 2 w .»)
const temSentidoForaDePartes = (t) => palavrasComSentido(t).some((w) => !PARTE_PALAVRA.test(w) && !eGlifoLetra(w))

// Texto da 1.ª página → { titulo, subtitulo, outros, compositores, editores, parte, partes, direitos, fonte, catalogo,
// anoComposicao, epoca }. `nomes`: apelidos (em minúsculas) vindos do nome do ficheiro, que ajudam a reconhecer o compositor.
export function lerPaginaPdf(texto, { conhecidos = new Map(), nomes = [] } = {}) {
  const { celulas: cel, pauta } = celulas(texto)
  const r = { titulo: '', subtitulo: '', outros: [], compositores: [], editores: [], parte: '', partes: [], direitos: null, fonte: [], catalogo: '', anoComposicao: '', epoca: '', anonimo: false }
  // Direitos: em qualquer ponto da página (muitas vezes no fundo)
  for (const l of String(texto || '').split('\n')) {
    const d = /©|copyright|\(c\)\s*\d/i.test(l) && lerDireitos(l)
    if (d && d.titular && !r.direitos) r.direitos = d
  }
  // Partes: etiquetas das pautas em toda a página (a partitura geral tem várias; uma parte cava só uma, à esquerda ou no
  // canto de cima). «Prima pars» é uma secção, não uma parte.
  const partes = []
  for (const c of cel) {
    if (!eNomeDeParte(c.t) || /\b(prima|secunda|seconda|tertia|terza)\s+pars\b/i.test(c.t)) continue
    const esquerda = c.ini / c.largura < 0.16 || (c.linha <= 3 && c.centro < 0.35)
    partes.push({ t: c.t.replace(/^[[(]\s*|\s*[\])]$/g, '').replace(/\s*[&.]$/, '').trim(), esquerda })
  }
  const distintas = [...new Map(partes.map((p) => [chaveTexto(p.t), p])).values()]
  r.partes = distintas.map((p) => p.t)
  if (distintas.length === 1 && distintas[0].esquerda) r.parte = distintas[0].t
  // Cabeçalho: o que está acima da 1.ª pauta (o compositor pode estar até 2 linhas abaixo, alinhado com ela)
  const limite = pauta >= 0 ? pauta : 14
  const topo = cel.filter((c) => c.linha <= limite + 2 && !eLetra(c.t) && !/©|copyright|www\.|https?:|\.(net|com|org|de)\b/i.test(c.t) && !eNomeDeParte(c.t))
  const conhecidaNoNome = (t) => limparNome(t).split(/[\s.]+/).some((w) => w.length >= 3 && nomes.includes(minus(w)))
  const livres = []
  for (const c of topo) {
    const t = c.t.replace(/[“”"«»]/g, '').replace(/\[(\p{L})\](?=\p{L})/gu, '$1').trim()
    if (!t) continue
    if (EPOCA.test(t)) {
      r.epoca = t
      continue
    }
    const ed = EDITOR.exec(t)
    if (ed) {
      if (pareceNome(ed[1])) r.editores.push({ nome: limparNome(ed[1]), papel: /^arr/i.test(t) ? 'arranjador' : 'editor' })
      continue
    }
    // («anon ms. londres 29987», «anónimo, c. 1480», «Anónimo Huelgas (s. XIV)»: anónimo, e a fonte se vier)
    const anon = /^(an[oó][nm]\S*)[\s,]+(.+)$/i.exec(t)
    if (anon && ANONIMO.test(anon[1] + ' ')) {
      r.compositores.push('Anónimo')
      if (FONTE.test(anon[2])) r.fonte.push(anon[2])
      continue
    }
    if (FONTE.test(t) && !(c === topo[0] && /^\d+\.\s*\p{L}/u.test(t))) {
      r.fonte.push(t)
      continue
    }
    const mc = MARCA_COMPOSITOR.exec(t)
    if (mc && (pareceNome(mc[1]) || ANONIMO.test(mc[1]))) {
      r.compositores.push(mc[1])
      continue
    }
    livres.push({ ...c, t })
  }
  // Compositor: um nome com datas de vida ou «Mr.», um apelido que a biblioteca conhece (ou que vem no nome do ficheiro),
  // ou um nome de 2+ palavras encostado à direita
  const eCompositor = (c) => {
    if (ANONIMO.test(c.t)) return true
    if (!pareceNome(c.t)) return false
    const palavras = limparNome(c.t).split(/[\s.]+/).filter(Boolean)
    const conhecida = palavras.some((w) => w.length >= 3 && conhecido(w, conhecidos)) || conhecidaNoNome(c.t)
    if (palavras.length === 1 && !conhecida && !DATAS_VIDA.test(c.t)) return false
    if (DATAS_VIDA.test(c.t) || /^(mr|capt)\./i.test(c.t) || /\s[([]\p{L}/u.test(c.t) || conhecida) return true
    return palavras.length >= 2 && c.ini / c.largura > 0.5 && c.fim / c.largura > 0.8
  }
  const centrado = (c) => Math.abs(c.centro - 0.5) < 0.22
  // («recercada ottava», «digitación flauta soprano»: em minúsculas só acima da 1.ª pauta — por baixo é letra ou indicação)
  const podeSerTitulo = (c) =>
    c.linha <= limite && !eCompositor(c) && !DIRECCAO_RE.test(c.t) && (!/^\p{Ll}/u.test(c.t) || (pauta >= 0 && c.linha < pauta && palavrasComSentido(c.t).length >= 2) || (c.linha <= 1 && GENERICO.test(c.t))) && temSentidoForaDePartes(c.t)
  // Título: a 1.ª célula livre ao centro (fora de parênteses retos); senão a entre parênteses retos; senão a 1.ª livre
  let ti = livres.findIndex((c) => centrado(c) && podeSerTitulo(c) && !/^[[(]/.test(c.t))
  if (ti < 0) ti = livres.findIndex((c) => centrado(c) && podeSerTitulo(c))
  if (ti < 0) ti = livres.findIndex((c) => podeSerTitulo(c) && c.ini / c.largura < 0.6)
  const usados = new Set()
  if (ti >= 0) {
    r.titulo = livres[ti].t
    usados.add(ti)
  }
  livres.forEach((c, i) => {
    if (usados.has(i) || !eCompositor(c)) return
    r.compositores.push(c.t)
    usados.add(i)
  })
  // Subtítulo logo por baixo do título, ao centro («Fuga a 4 voci», «Hodie nobis caelorum»)
  if (ti >= 0) {
    const t0 = livres[ti]
    const sub = livres.findIndex((c, i) => i > ti && !usados.has(i) && centrado(c) && c.linha > t0.linha && c.linha <= t0.linha + 2 && podeSerTitulo(c) && !/^[[(]/.test(c.t))
    if (sub >= 0 && palavrasComSentido(livres[sub].t).length >= 2 && livres[sub].t.length <= 60 && !pareceNome(livres[sub].t) && !/^\p{Ll}/u.test(livres[sub].t)) {
      r.subtitulo = livres[sub].t
      usados.add(sub)
    }
  }
  r.outros = livres.filter((c, i) => !usados.has(i) && !DIRECCAO.test(c.t) && c.linha <= limite).map((c) => c.t)
  // Título entre parênteses retos («[Suite in C]», «[Te Deum]»): é o título editorial
  r.titulo = r.titulo.replace(/^\[([^\]]{2,60})\]$/, '$1')
  // Ano no título («"BLOCKSUITE" (1996)», «Sinfonia á 3 [1690?]», «Le Canal de Versailles (1686)»): data de composição
  r.titulo = r.titulo.replace(/\s*[([]\s*((?:1[4-9]|20)\d\d)\??\s*[)\]]\s*/, (m, a) => ((r.anoComposicao = a), ' ')).replace(/\s+/g, ' ').trim()
  // Nº de catálogo na página («BWV 875», «BWV 19.7»)
  const cat = /\b(BWV|BuxWV|HWV|TWV|RV|KV)\s?(\d+[a-z]?)/.exec(String(texto || '').slice(0, 4000))
  if (cat) r.catalogo = `${cat[1]} ${cat[2]}`
  r.anonimo = r.compositores.some((c) => ANONIMO.test(c))
  return r
}

// ---------------------------------------------------------------------------
// Pessoas

const iniciais = (s) => minus(s).split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('')
// Nome escrito na página → pessoa com a grafia da biblioteca («Joh.Seb. Bach» → Johann Sebastian Bach;
// «Diego Ortiz Tolledano» → Diego Ortiz; «Stephanus Lopezi (Estevão Morago)» → Estêvão Lopes Morago)
export function pessoaDaPagina(texto, conhecidos = new Map()) {
  let s = limparNome(String(texto || '').replace(/^[“”"«»]+|[“”"«»]+$/g, ''))
  if (!s) return null
  if (ANONIMO.test(s)) return { literal: 'Anónimo', papel: 'compositor' }
  s = nomeDePessoa(s) || s
  // («JOH.SEB.BACH», «G.F.Händel»: separar as iniciais; maiúsculas → grafia normal)
  s = s.replace(/\.(?=\p{L})/gu, '. ').replace(/\s+/g, ' ').trim()
  if (!/\p{Ll}/u.test(s)) s = s.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  const palavras = s.split(/\s+/)
  // (um apelido conhecido que não é a última palavra: «Diego Ortiz Tolledano», «Salomone Rossi Hebreo»)
  let k = palavras.length - 1
  if (!conhecido(palavras[k], conhecidos)) {
    const j = palavras.findIndex((w, i) => i > 0 && i < palavras.length - 1 && /^\p{Lu}/u.test(w) && conhecido(w, conhecidos))
    if (j > 0) k = j
  }
  let e = conhecido(palavras[k], conhecidos)
  if (!e) return pessoaDoNome(s, conhecidos)
  const dado = palavras.slice(0, k).join(' ').replace(/(\s+(?:de|da|do|di|del|von|van|du|le|la))+$/i, '').trim()
  // (apelido que a biblioteca só tem em maiúsculas — «JOHNSTONE» — fica com a grafia normal da página)
  if (!/\p{Ll}/u.test(e.apelido || '')) e = { ...e, apelido: palavras[k] }
  if (!dado) return pessoaConhecida(e, '')
  const nomes = [...(e.nomes?.entries?.() || [])].sort((a, b) => b[1] - a[1])
  // (iniciais «J. S.» que batem com o nome que a biblioteca conhece → esse nome)
  if (/^(\p{L}{1,4}\.\s*)+$/u.test(dado)) {
    const igual = nomes.find(([n]) => iniciais(n) === iniciais(dado))
    return { apelido: e.apelido, ...(igual ? { nome: igual[0] } : { nome: dado }), papel: 'compositor' }
  }
  // (nome próprio que a biblioteca tem para este apelido → a grafia dela; senão fica o da página, completo:
  //  «Johann Christian Bach» não é o «Johann Sebastian» que a biblioteca conhece)
  const um = dado.split(/\s+/).length === 1
  const igual = nomes.find(([n]) => minus(n) === minus(dado) || (um && minus(n).split(/\s+/)[0] === minus(dado)))
  return { apelido: e.apelido, nome: igual ? igual[0] : dado, papel: 'compositor' }
}

const apelidoDe = (a) => minus(a?.apelido || a?.literal || '').trim()
const ultimoApelido = (a) => apelidoDe(a).split(/\s+/).at(-1) || ''
const mesmaPessoa = (a, b) => !!ultimoApelido(a) && ultimoApelido(a) === ultimoApelido(b)
// Um compositor que a IA pôs: fica se for confirmado (nome do ficheiro, texto da página, compositor conhecido)
function confirmado(a, { nome, texto, conhecidos }) {
  const ap = apelidoDe(a)
  if (!ap) return false
  if (a.literal && ANONIMO.test(a.literal)) return /\ban[oó]n|anonym|incert/i.test(`${nome} ${texto}`)
  if (ap.length < 3 || /\d/.test(ap) || /[[\]]/.test(a.apelido || a.literal || '')) return false
  const ultimo = ap.split(/\s+/).at(-1).replace(/[^a-z' -]/g, '')
  if (ultimo.length < 3 || PARTE_PALAVRA.test(ultimo) || NAO_PESSOA.test(ultimo) || /^(composer|title|tom|tono|sexto|quinto|primeiro|terceiro|segundo|quarto)$/i.test(ultimo)) return false
  const re = new RegExp(`(^|[^a-z])${ultimo}([^a-z]|$)`)
  if (re.test(minus(nome)) || re.test(minus(texto))) return true
  return !!conhecido(ultimo, conhecidos)
}

// Maiúsculas → grafia de título («GIULIO CESARE» → «Giulio Cesare», «CONCERTO VI» → «Concerto VI»)
function grafiaDeTitulo(t) {
  if (/\p{Ll}/u.test(t)) return t
  return t
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^[ivxlc]+[.,]?$/i.test(w) && w.length <= 5 && i > 0) return w.toUpperCase()
      if (i > 0 && /^(de|da|do|di|del|la|le|les|el|et|e|y|a|of|the|and|in|en|al|sur|pour)$/.test(w)) return w
      return w.replace(/^(\P{L}*)(\p{L})/u, (m, a, b) => a + b.toUpperCase())
    })
    .join('')
}
// Nome de ficheiro de PDF → forma que o leitor de nomes do Finale entende («Barsanti.DOM.Largo.pdf» → «Barsanti DOM Largo»;
// «estampida_39_mus_pdf.pdf» → «estampida 39»; «Corelli CM largo pdf.pdf» → «Corelli CM largo»)
export function nomeParaLer(nome) {
  return String(nome || '')
    .normalize('NFC')
    .replace(/\.pdf$/i, '')
    .replace(/[_\s.-]+pdf$/i, '')
    .replace(/[_\s]+mus$/i, '.mus')
    .replace(/(\p{L}{2,})\.(?=\p{L}{2,})/gu, '$1 ')
    .trim()
}

// ---------------------------------------------------------------------------
// A ficha de um PDF de transcrição: nome do ficheiro + texto da 1.ª página (+ o que a ficha já tem, para confirmar
// o que a IA leu). → { campos, parte, chave, completa, motivo, notas, origem }
// `campos` só traz o que se sabe: o comando nunca esvazia um campo (autores e data só entram se houver).
export function fichaTranscricaoPdf({ nome, texto = '', programa = '', conhecidos = new Map(), eDono = () => false, pessoaDono = null, atual = {} }) {
  // («folia», «folies»: o leitor de nomes do Finale toma o «fol» por fólios — «fol. i»; protege-se a palavra)
  const protegidas = []
  const nomeLido = nomeParaLer(nome).replace(/\bfol(?=[iíe]\p{L})\p{L}*/giu, (m) => (protegidas.push(m), `qq${protegidas.length - 1}qq`))
  const repor = (x) => String(x || '').replace(/qq(\d+)qq/g, (m, i) => protegidas[i])
  const n = lerNomeFinale(nomeLido, { conhecidos, eDono })
  n.titulo = repor(n.titulo)
  // («ESC B» = Cancionero de Escorial B = E-E IV.a.24; finale.js ainda escreve a cota antiga)
  n.fonte = String(n.fonte || '').replace(/E-E V\.III\.24/, 'E-E IV.a.24')
  // (apelidos do nome do ficheiro e os que a IA leu — se estiverem escritos na página, são o compositor; um «compositor»
  //  da IA igual ao título — «Ave Regina Caelorum» — não conta)
  const iaNomes = (atual.autores || []).filter((a) => !(atual.titulo && minus(atual.titulo).includes(apelidoDe(a))) && pareceNome(a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')))
  const pg = lerPaginaPdf(texto, { conhecidos, nomes: [...n.autores, ...iaNomes].map((a) => ultimoApelido(a)).filter((w) => w.length >= 3) })
  const notas = []
  const origem = {}
  const fortes = (x) => palavrasComSentido(x).filter((w) => w.length >= 4).map(minus)
  const tituloVazio = (t) => !t || TITULO_VAZIO.test(String(t).trim()) || !palavrasComSentido(t).length
  const textoNome = minus(`${nome} ${texto}`)

  // O título que a ficha já tem (lido pela IA), se a página ou o nome o confirmam: pelo nº de catálogo
  // («Es erhub sich ein Streit, BWV 19» ↔ «BWV 19.7» na página) ou por metade das palavras
  let atualConfirmado = false
  // (um título que é só o nome do ficheiro — «5 .BWV1051», «papel de música pdf» — não conta)
  const comoNome = (t) => chaveTexto(t).replace(/\b(pdf|mus|musx)\b/g, '').trim() === chaveTexto(nomeParaLer(nome)).replace(/\b(pdf|mus|musx)\b/g, '').trim()
  if (atual.titulo && !tituloVazio(atual.titulo) && !comoNome(atual.titulo) && palavrasComSentido(atual.titulo.replace(/\b(BWV|HWV|TWV|RV|KV)\b/gi, '')).length) {
    const ft = fortes(atual.titulo)
    const cat = /\b(BWV|HWV|TWV|RV|KV)\s?(\d+)/i.exec(atual.titulo)
    const porCatalogo = cat && new RegExp(`\\b${cat[1]}\\s?0*${cat[2]}(?:[a-z]|\\.\\d+)?\\b`, 'i').test(`${texto} ${nome}`)
    atualConfirmado = !!porCatalogo || (ft.length > 0 && ft.filter((w) => textoNome.includes(w)).length * 2 >= ft.length)
  }
  // Título: (a) o da página; (b) só de andamento («Largo», «Praeludium VI») → o da ficha se confirmado e com essas
  // palavras, ou o do nome se as contiver e disser mais; (c) sem título na página → o do nome se informativo, senão o
  // da ficha se confirmado, senão o do nome
  let titulo = ''
  // (palavras de nomes de pessoas não contam para o título do nome do ficheiro dizer mais: «Bach, Johann Sebastian - Air»)
  const nomesDePessoas = new Set([...n.autores, ...(atual.autores || [])].flatMap((a) => minus([a.nome, a.apelido, a.literal].filter(Boolean).join(' ')).split(/[^a-z]+/)))
  const tituloPagina = pg.titulo && !tituloVazio(pg.titulo) ? grafiaDeTitulo(pg.titulo) : ''
  const nomeInformativo = palavrasComSentido(n.titulo).length >= 2 && !tituloVazio(n.titulo)
  const soGenerico = (t) => t.split(/[\s.,;:]+/).filter(Boolean).every((w) => GENERICO.test(w))
  const contem = (maior, menor) => fortes(menor).every((w) => fortes(maior).includes(w))
  if (tituloPagina && !soGenerico(tituloPagina)) {
    titulo = tituloPagina
    origem.titulo = 'página'
  } else if (tituloPagina) {
    if (atualConfirmado && (contem(atual.titulo, tituloPagina) || /\b(BWV|HWV|TWV|RV|KV)\s?\d/i.test(atual.titulo))) (titulo = grafiaDeTitulo(atual.titulo)), (origem.titulo = 'ficha (confirmado)')
    else if (nomeInformativo && contem(n.titulo, tituloPagina) && fortes(n.titulo).filter((w) => !nomesDePessoas.has(w)).length > fortes(tituloPagina).length) (titulo = n.titulo), (origem.titulo = 'nome')
    else (titulo = tituloPagina), (origem.titulo = 'página')
  } else if (nomeInformativo) {
    titulo = n.titulo
    origem.titulo = 'nome'
  } else if (atualConfirmado) {
    titulo = grafiaDeTitulo(atual.titulo)
    origem.titulo = 'ficha (confirmado)'
  } else if (!tituloVazio(n.titulo)) {
    titulo = n.titulo
    origem.titulo = 'nome'
  }
  // («George Frideric Händel, Trio Sonata, Op. V no. 6»: o compositor no início do título)
  {
    const m = /^([^,]{4,40}),\s+(.{4,})$/.exec(titulo)
    if (m && pareceNome(m[1]) && m[1].split(/\s+/).some((w) => conhecido(w, conhecidos))) {
      pg.compositores.unshift(m[1])
      titulo = m[2]
    }
  }
  // (subtítulo da página logo por baixo do título: «Contrapunctus I: Fuga a 4 voci»)
  if (origem.titulo === 'página' && pg.subtitulo && !minus(titulo).includes(minus(pg.subtitulo))) titulo = `${titulo}: ${grafiaDeTitulo(pg.subtitulo)}`
  titulo = titulo.replace(/[“”"«»]/g, '').replace(/^\d{1,3}\.\s*(?=\p{L})/u, '').replace(/\s+/g, ' ').trim()

  // Compositor: o do nome do ficheiro (com o nome completo da página, se for a mesma pessoa); senão o da página;
  // senão o da IA, se confirmado
  const daPagina = []
  for (const c of pg.compositores.flatMap((x) => x.split(/\s+\/\s+|\s+&\s+/))) {
    const p = pessoaDaPagina(c.replace(/\b(BWV|op\.?|n[ºo])\s*[\d.]+.*$/i, '').trim(), conhecidos)
    if (p && (p.apelido || p.literal) && !eDono(p) && !daPagina.some((a) => mesmaPessoa(a, p))) daPagina.push(p)
  }
  let autores = n.autores.filter((a) => !eDono(a)).map((a) => {
    // (o nome próprio escrito na página manda: «jc_bach…» com «Johann Christian Bach (1735-1782)» na página)
    const p = daPagina.find((b) => mesmaPessoa(a, b) && b.nome && !/\./.test(b.nome))
    return p ? { ...a, nome: p.nome } : a
  })
  origem.compositor = autores.length ? 'nome' : ''
  if (!autores.length && daPagina.length) (autores = daPagina), (origem.compositor = 'página')
  // (a IA às vezes põe como compositor o titular dos direitos — «Ernesto Schmied», «Margaret Greentree»: é a editora)
  const titularDireitos = minus(pg.direitos?.titular || '')
  const ia = (atual.autores || []).filter((a) => a.papel !== 'editor' && !eDono(a) && !(ultimoApelido(a).length >= 3 && titularDireitos.includes(ultimoApelido(a))))
  if (!autores.length && ia.length) {
    // (a IA às vezes põe o título como compositor — «Ave Regina Caelorum», «Responsorium Quartum»: não é uma pessoa)
    const doTitulo = new Set([...palavrasComSentido(titulo), ...palavrasComSentido(atual.titulo)].map(minus))
    const nomeIa = (a) => a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')
    const pessoaIa = (a) =>
      (a.literal && ANONIMO.test(a.literal)) || (pareceNome(nomeIa(a)) && !minus(nomeIa(a)).split(/[^a-z]+/).filter((w) => w.length >= 3).every((w) => doTitulo.has(w)))
    const bons = ia.filter((a) => pessoaIa(a) && confirmado(a, { nome, texto, conhecidos }))
    // (com a grafia da biblioteca: «Joh. Seb. Bach» → Johann Sebastian Bach; «anóm. s. XVI» → Anónimo)
    // (só se normalizam os nomes por extenso numa só linha ou com iniciais; «Jorge García del Valle» + «Méndez» fica como está)
    const normal = (a) => (a.literal ? pessoaDaPagina(a.literal, conhecidos) : a.nome && !/\./.test(a.nome) && /\p{Ll}/u.test(a.nome + a.apelido) ? a : pessoaDaPagina([a.nome, a.apelido].filter(Boolean).join(' '), conhecidos)) || a
    if (bons.length) (autores = bons.map((a) => ({ ...normal(a), papel: /^(arranjador|editor)$/.test(a.papel) ? a.papel : 'compositor' }))), (origem.compositor = 'ficha (confirmado)')
  }
  const retirados = ia.filter((a) => !autores.some((b) => mesmaPessoa(a, b)) && !(a.literal && ANONIMO.test(a.literal) && autores.some((b) => b.literal === 'Anónimo')))
  if (retirados.length) notas.push(`Compositor lido pela IA sem confirmação no nome do ficheiro nem na página: ${retirados.map((a) => `«${a.literal || [a.nome, a.apelido].filter(Boolean).join(' ')}»`).join(', ')} (retirado).`)
  // (exercícios do dono: «1º tom pedro silva» — o dono é o compositor, como no Finale)
  if (n.dono && pessoaDono) autores.push({ ...pessoaDono, papel: 'compositor' })
  // Editores e arranjadores escritos na página («arr. Lucía Martínez», «Edited by Frideric Chrysander»)
  for (const e of pg.editores) {
    const p = pessoaDaPagina(e.nome, new Map())
    if (p && !eDono(p) && !autores.some((a) => mesmaPessoa(a, p))) autores.push({ ...p, papel: e.papel })
  }

  // Direitos: «© <dono>» → o dono é editor e o ano é a data; «© <outro>» → editora e data da edição
  let data = n.ano || ''
  let editora = ''
  const d = pg.direitos
  if (d && d.titular) {
    const primeiro = d.titular.split(/\s*\/\s*/)[0].trim()
    if (eDono(primeiro) || eDono(d.titular)) {
      if (pessoaDono && !autores.some(eDono)) autores.push({ ...pessoaDono, papel: 'editor' })
      if (d.ano) data = d.ano
    } else if (/\p{L}{2,}/u.test(d.titular)) {
      editora = d.titular
      if (d.ano) data = d.ano
    }
  }
  if (atual.data && !data && /^1[4-8]\d\d/.test(String(atual.data))) notas.push(`Data «${atual.data}» lida pela IA: num PDF feito num editor de partituras é provavelmente do compositor ou da fonte antiga, não desta edição — confirmar.`)

  // Fonte (colecção), edição, tonalidade, partes
  const fontePagina = pg.fonte.map((f) => f.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const colecao = fontePagina.length ? [...new Set(fontePagina)].join(', ') : [n.fonte, n.folios].filter(Boolean).join(', ')
  // (parte: a do nome; senão a da página; senão a última palavra do nome, se for uma parte — «…_violini»)
  const ultimaDoNome = nomeParaLer(nome).split(/[\s_.-]+/).filter(Boolean).at(-1) || ''
  // (a partitura geral mostra 3+ partes na 1.ª página: «… per fl tr 2 vl vla e vc» não é a parte «Vc»; «Contre» do nome
  //  é a «Haute Contre» da página)
  const maisLonga = n.parte && pg.partes.find((p) => minus(p).length > minus(n.parte).length && minus(p).endsWith(` ${minus(n.parte)}`))
  const parteNome = pg.partes.length >= 3 && !/\s-\s/.test(nome) ? '' : maisLonga || n.parte
  const parte = parteNome || (pg.partes.length >= 3 ? '' : pg.parte) || (pg.partes.length === 2 && eNomeDeParte(ultimaDoNome) && !/^(score|partitura|sco)$/i.test(ultimaDoNome) ? ultimaDoNome.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : '')
  const tituloFonte = [pg.titulo, pg.subtitulo, ...pg.outros, pg.epoca].filter(Boolean).join(' / ')
  const catalogo = pg.catalogo || (/\b(BWV|BuxWV|HWV|TWV|RV|KV)\s?(\d+)/i.exec(nome) || []).slice(1).join(' ')
  // (título só de andamento/género com o nº de catálogo: «Concerto VI, BWV 1051», «Praeludium VI, BWV 875»)
  if (catalogo && titulo && soGenerico(titulo) && !/\b(BWV|BuxWV|HWV|TWV|RV|KV)\b/i.test(titulo)) titulo = `${titulo}, ${catalogo}`
  const metadados = {
    ...(n.versoes.length ? { edicao: n.versoes.join('; ') } : {}),
    ...(colecao ? { colecao, conteudo_tipo: 'Peça de uma colecção' } : {}),
    ...(n.tonalidade ? { tonalidade: n.tonalidade } : {}),
    ...(n.vozes || pg.partes.length > 1 ? { instrumentacao: [n.vozes, pg.partes.length > 1 ? pg.partes.join(', ') : ''].filter(Boolean).join('; ') } : {}),
    ...(catalogo ? { catalogo } : {}),
    ...(pg.anoComposicao ? { data_composicao: pg.anoComposicao } : {}),
    ...(tituloFonte && minus(tituloFonte) !== minus(titulo) ? { titulo_fonte: tituloFonte.slice(0, 300) } : {}),
    ...(programa ? { formato: `PDF (${String(programa).split(/[:[]/)[0].trim()})` } : {}),
  }
  const compositores = autores.filter((a) => a.papel === 'compositor' || !a.papel)
  const sentido = palavrasComSentido(titulo).length
  const dataSuspeita = notas.some((x) => x.startsWith('Data «'))
  const completa = !!titulo && !tituloVazio(titulo) && (compositores.length > 0 || sentido >= 2) && !dataSuspeita
  const motivo = completa
    ? ''
    : !titulo || tituloVazio(titulo)
      ? 'Nem o nome do ficheiro nem a 1.ª página dizem o título: identificar a peça e o compositor.'
      : dataSuspeita
        ? 'Confirmar a data.'
        : `Título pouco informativo («${titulo}») e sem compositor confirmado: identificar a peça e o compositor.`
  // Chave para juntar as partes cavas: compositor + título + versão + nº de ordem + tonalidade (sem a parte)
  const chave = [ultimoApelido(compositores[0]), titulo, n.versoes.join(' '), n.numero, n.tonalidade].map((x) => chaveTexto(x)).join('|')
  return { campos: { titulo, autores, ...(data ? { data } : {}), ...(editora ? { editora } : {}), metadados }, parte, chave, completa, motivo, notas, origem, pagina: pg }
}


// Fichas de PDFs → grupos de partes cavas da mesma peça. Só se juntam ficheiros com a mesma chave quando cada um é uma
// parte diferente (no máximo uma partitura geral): dois PDFs com o mesmo título e a mesma parte (ou ambos sem parte)
// podem ser versões diferentes («Largo» em Dó e em Ré) e ficam separados.
export function agruparTranscricoes(fichas) {
  const porChave = new Map()
  for (const f of fichas) porChave.set(f.chave, [...(porChave.get(f.chave) || []), f])
  const grupos = []
  for (const [k, lista] of porChave) {
    // («parte 2» de uma suite é uma secção, não uma parte cava)
    const parteDe = (f) => (f.parte && !/^(partitura|score|sco)$/i.test(f.parte) && !/^(parte?|pars|part)\s*\d+$/i.test(f.parte) ? chaveTexto(f.parte) : '')
    const partes = lista.map(parteDe)
    const unicas = new Set(partes).size === partes.length
    const comParte = partes.filter(Boolean).length
    if (lista.length > 1 && unicas && comParte >= 1 && k.split('|')[1] && palavrasComSentido(lista[0].campos.titulo).length) {
      grupos.push(lista)
    } else for (const f of lista) grupos.push([f])
  }
  const ordem = (f) => [f.parte && !/^(partitura|score)$/i.test(f.parte) ? 1 : 0, Number(f.numero) || 0]
  return grupos.map((lista) => {
    const membros = [...lista].sort((a, b) => ordem(a)[0] - ordem(b)[0] || ordem(a)[1] - ordem(b)[1])
    const principal = membros[0]
    const campos = { ...principal.campos, autores: [...(principal.campos.autores || [])], metadados: { ...principal.campos.metadados } }
    for (const o of membros.slice(1)) {
      if (!campos.autores.length && o.campos.autores?.length) campos.autores = o.campos.autores
      if (!campos.data && o.campos.data) campos.data = o.campos.data
      if (!campos.editora && o.campos.editora) campos.editora = o.campos.editora
      for (const k of ['colecao', 'conteudo_tipo', 'catalogo', 'data_composicao']) if (!campos.metadados[k] && o.campos.metadados[k]) campos.metadados[k] = o.campos.metadados[k]
    }
    if (membros.length > 1) {
      const partes = membros.map((m) => m.parte).filter((p) => p && !/^(partitura|score)$/i.test(p))
      if (partes.length) campos.metadados.instrumentacao = [principal.campos.metadados.instrumentacao, `partes: ${[...new Set(partes)].join(', ')}`].filter(Boolean).join('; ')
    }
    return { principal, membros, campos, completa: principal.completa, motivo: principal.motivo, notas: [...new Set(membros.flatMap((m) => m.notas))] }
  })
}

// ---------------------------------------------------------------------------
// PDF ↔ ficheiro do Finale: chaves do nome («MORAGO de profundis.mus.pdf» ↔ «MORAGO de profundis.mus»;
// «MORAGO de profundis claves modernas.mus - Tenor.pdf» ↔ a parte Tenor dessa peça) → { completa, base, parte }
export function chavesDoNome(nome) {
  let s = String(nome || '').normalize('NFC')
  s = s.replace(/(\.(?:pdf|mus|musx))+$/i, '').replace(/\.(?:mus|musx)\b/gi, ' ').replace(/[_\s-]+(?:mus|musx)?[_\s-]*pdf$/i, '').replace(/[_\s-]+(?:mus|musx)$/i, '')
  s = s.replace(/\b(copy|copia|cópia)(\s+\d+)?\b/gi, ' ')
  const completa = chaveTexto(s)
  const parte = lerNomeFinale(String(nome || '').replace(/\.pdf$/i, ''), {}).parte || ''
  let base = completa
  if (parte) {
    const kp = chaveTexto(parte)
    const re = new RegExp(`(?:\\s+\\d{3})?\\s+${kp.replace(/\s+/g, '\\s+')}$`)
    if (re.test(completa)) base = completa.replace(re, '').trim()
  }
  return { completa, base, parte }
}
// (a chave diz alguma coisa além do nome de uma parte: «tenor» sozinho não chega para ligar a um ficheiro do Finale)
export const chaveComSentido = (k) => String(k || '').split(/\s+/).some((w) => /[a-z]{3,}/.test(w) && !PARTE_PALAVRA.test(w) && !SEM_SENTIDO.test(w))
