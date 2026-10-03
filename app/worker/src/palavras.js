// Palavras-chave geradas localmente a partir do texto (quando o autor ou um
// repositório não as fornecem). Método simples e gratuito: expressões de 1 a 3
// palavras mais frequentes, sem palavras vazias, com peso extra para as do título.

const VAZIAS = {
  pt: 'a o os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sob sobre entre e ou mas que se não sim como mais menos muito muita muitos muitas já também quando onde qual quais quem cujo seu sua seus suas este esta estes estas esse essa isso isto aquele aquela ao aos à às foi ser são era eram é está estão tem têm ter há sido pode podem deve devem assim ainda apenas cada outro outra outros outras mesmo mesma todo toda todos todas nem então porque pois lhe lhes nós ele ela eles elas eu tu vós meu minha nosso nossa',
  en: 'the a an of and or but in on at to for from by with without about into over under between is are was were be been being have has had do does did not no yes as that this these those it its their them they he she his her we our you your which who whom whose what when where why how than then also such can could may might must shall should will would there here all any each more most other some only own same so too very just',
  fr: 'le la les un une des du de et ou mais dans en sur sous pour par avec sans entre est sont était être avoir a ont que qui quoi dont où ce cet cette ces il elle ils elles nous vous je tu son sa ses leur leurs au aux ne pas plus comme aussi très',
  it: 'il lo la i gli le un uno una di del della dei degli delle da dal dalla in nel nella con su per tra fra e o ma che chi non è sono era essere avere ha hanno si come anche più molto questo questa quello quella al alla ai alle',
  es: 'el la los las un una unos unas de del en y o pero que por para con sin sobre entre es son era ser haber ha han se no como más muy también este esta estos estas ese esa al lo le les su sus',
  de: 'der die das den dem des ein eine einer eines einem einen und oder aber in im auf an am zu zum zur von vom mit ohne für über unter zwischen ist sind war waren sein haben hat hatte nicht auch als wie so sich es er sie wir ihr ich nach aus wird werden wurde wurden daß dass durch bei noch nur schon sehr wenn dann weil dieser diese dieses diesem diesen jener keine kein mehr man seine seiner ihre ihrer uns euch was wer wo hier dort sowie etwa bereits jedoch also denn doch ganz immer wieder gegen seit bis vor',
  la: 'et in est ad cum non ut sed quod qui quae per de ex ab a quam sunt esse enim autem vel aut sic hoc haec ille illa eius',
}
// Palavras frequentes em textos académicos mas pouco informativas
const GENERICAS = new Set(
  ('introdução introduction capítulo chapter página page pp vol volume figura figure fig tabela table exemplo example ' +
    'universidade university departamento department tese thesis dissertação dissertation trabalho work estudo study ' +
    'parte part secção section análise analysis resultados results conclusão conclusion referências references bibliografia ' +
    'bibliography ibid cit op et al etc isbn issn doi http https www org com pdf copyright rights reserved downloaded jstor ' +
    'content terms use press edition ed eds editor editors journal revista artigo article número number ano year ' +
    'professor professora doutor doutora prof dr orientador orientadora agradecimentos acknowledgements júri jury presidente vogal ' +
    'resumo abstract palavras-chave keywords índice contents lista list ' +
    'php html english language books book download downloaded free sign login website online articles library z-lib libgen ' +
    'one two three four five six seven eight nine ten first second third also however thus whether although upon ' +
    'um dois três quatro cinco primeiro segundo terceiro uno due tre deux trois une see seen time times way ways').split(' ')
)
const TODAS = new Set(Object.values(VAZIAS).join(' ').split(/\s+/))

function lingua(palavras) {
  let melhor = 'en'
  let max = -1
  for (const [l, lista] of Object.entries(VAZIAS)) {
    const set = new Set(lista.split(' '))
    const n = palavras.reduce((a, p) => a + (set.has(p) ? 1 : 0), 0)
    if (n > max) (max = n), (melhor = l)
  }
  return melhor
}

export function gerarPalavrasChave(texto, titulo = '', quantas = 6) {
  // Ignorar a lista de referências no fim, se houver
  let corpo = String(texto || '').slice(0, 60000)
  const ref = corpo.search(/\n\s*(refer[êe]ncias bibliogr[áa]ficas|bibliografia|references|bibliography|works cited)\s*\n/i)
  if (ref > 5000) corpo = corpo.slice(0, ref)
  // Saltar as páginas iniciais (capa, júri, agradecimentos) em textos longos
  if (corpo.length > 30000) corpo = corpo.slice(Math.floor(corpo.length * 0.08))
  // Artigos elididos do francês/italiano: "l'ajout" → "ajout", "dell'arte" → "arte"
  const elisao = /^(l|d|qu|j|m|n|s|t|c|dell|dall|nell|sull|all|coll|un|quest|quell)['’]/i
  const brutos = (s) => s.normalize('NFC').split(/[^\p{L}'’-]+/u).map((w) => w.replace(elisao, '').replace(/^['’-]+|['’-]+$/g, '')).filter(Boolean)
  const tokens = (s) => brutos(s).map((w) => w.toLowerCase())
  const originais = brutos(corpo)
  const palavras = originais.map((w) => w.toLowerCase())
  // Nomes próprios (quase sempre com maiúscula no meio do texto): só contam se estiverem no título
  const maiusc = new Map()
  originais.forEach((w, i) => {
    const k = palavras[i]
    const [m, t] = maiusc.get(k) || [0, 0]
    maiusc.set(k, [m + (/^\p{Lu}/u.test(w) ? 1 : 0), t + 1])
  })
  const proprio = (w) => {
    const [m, t] = maiusc.get(w) || [0, 1]
    return t >= 3 && m / t > 0.85
  }
  if (palavras.length < 80) return []
  const vazias = new Set(VAZIAS[lingua(palavras)].split(' '))
  const vazia = (w) => w.length < 3 || vazias.has(w) || TODAS.has(w) || GENERICAS.has(w) || /\d/.test(w)
  const doTitulo = new Set(tokens(titulo).filter((w) => !vazia(w)))
  const excluida = (w) => vazia(w) || (proprio(w) && !doTitulo.has(w))

  const contagem = new Map()
  const soma = (k, peso) => contagem.set(k, (contagem.get(k) || 0) + peso)
  for (let i = 0; i < palavras.length; i++) {
    if (excluida(palavras[i])) continue
    soma(palavras[i], 1)
    // bigramas e trigramas sem palavras vazias nas pontas (ex.: "musica ficta", "basso continuo")
    if (i + 1 < palavras.length && !excluida(palavras[i + 1])) soma(`${palavras[i]} ${palavras[i + 1]}`, 1.6)
    if (i + 2 < palavras.length && !excluida(palavras[i + 2]) && palavras[i + 1].length > 1) {
      if (!excluida(palavras[i + 1]) || ['de', 'of', 'da', 'do', 'des', 'di', 'del'].includes(palavras[i + 1])) soma(`${palavras[i]} ${palavras[i + 1]} ${palavras[i + 2]}`, 1.9)
    }
  }
  const pontuadas = [...contagem.entries()]
    .filter(([k, v]) => v >= (k.includes(' ') ? 3.2 : 3))
    .map(([k, v]) => [k, v * (k.split(' ').some((w) => doTitulo.has(w)) ? 2 : 1)])
    .sort((a, b) => b[1] - a[1])

  // Preferir a expressão composta à palavra solta quando aparece com frequência
  // ("técnica" → "técnica alexander")
  const valor = new Map(pontuadas)
  const preferida = (k) => {
    if (k.includes(' ')) return k
    let melhor = k
    for (const [f, v] of pontuadas) {
      if (f.includes(' ') && f.split(' ').includes(k) && v >= 0.4 * valor.get(k) && v > (valor.get(melhor) || 0) * (melhor === k ? 0 : 1)) melhor = f
    }
    return melhor
  }
  const escolhidas = []
  for (const [k0] of pontuadas) {
    const k = preferida(k0)
    if (escolhidas.length >= quantas) break
    // evitar redundância: "polifonia" se já há "polifonia renascentista", e vice-versa
    if (escolhidas.some((e) => e.includes(k) || k.includes(e))) continue
    escolhidas.push(k)
  }
  // Maiúsculas: nomes próprios mantêm-se ("Técnica Alexander"); resto em minúsculas
  const forma = (w) => (proprio(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
  return escolhidas.map((k) => {
    const f = k.split(' ').map(forma).join(' ')
    return f.charAt(0).toUpperCase() + f.slice(1)
  })
}

// Palavras-chave vindas de fora que não dizem nada sobre o conteúdo
const INUTEIS = /^(article|journal article|book|book section|chapter|thesis|report|review|research article|original article|journal|pdf|english|portuguese|none|n\/a)$/i
export const palavrasUteis = (lista) => [...new Set((lista || []).map((k) => String(k).trim()).filter((k) => k.length > 1 && !INUTEIS.test(k)))]
