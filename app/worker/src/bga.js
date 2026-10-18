// Bach-Gesellschaft-Ausgabe (BGA): «Johann Sebastian Bach's Werke», Breitkopf & Härtel, Leipzig, 1851–1899
// (+ suplemento de 1926). Decisão do Pedro (17/10/2026): todas as fichas da BGA — volumes inteiros e extractos
// (peças tiradas de um volume) — ficam com a edição certa: Breitkopf & Härtel, Leipzig, ano do volume, editor do
// volume e colecção «Jahrgang NN»; o que outra identificação deixou de errado (Open Library, RISM, CrossRef…) sai,
// com uma frase na nota para rever.
//
// FONTES DAS TABELAS (consultadas a 17/10/2026):
// - Volumes (ano, editor, conteúdo): Wikipedia, «Bach-Gesellschaft-Ausgabe»
//   (https://en.wikipedia.org/wiki/Bach-Gesellschaft-Ausgabe); títulos alemães dos volumes: IMSLP,
//   «Bach-Gesellschaft Ausgabe (Bach, Johann Sebastian)» (https://imslp.org/wiki/Bach-Gesellschaft_Ausgabe_(Bach,_Johann_Sebastian)).
//   Diferença entre as duas: o 13.2 (Clavierwerke 2) tem editor Franz Espagne na Wikipedia e Wilhelm Rust no IMSLP
//   (fica o da Wikipedia); o 5.2 é «1855–56» no IMSLP (fica 1856).
// - BWV → volume: os intervalos da tabela dos volumes (Wikipedia) e, para os volumes de peças avulsas (36, 38, 40, 42,
//   43.2, 45.1…), a coluna «BG» das listas de obras de Bach da Wikipedia (List of keyboard and lute compositions…,
//   List of organ compositions…, List of chamber music works…, etc.).
//
// Função para o processador (ficheiros novos): reconhecerBga({ nome, pdfTitulo, pdfAutor, programa, produtor,
// texto, titulo, catalogo }) → { tipo: 'volume' | 'extracto' | 'nba', banda, bwv, campos, completa, motivo, notas, pistas } | null
import { normalizar } from './fontes_externas/util.js'
import { obraPorCatalogo } from './fontes_externas/obras.js'

export const ETIQUETA_BGA = 'BGA'
export const EDITORA_BGA = 'Breitkopf & Härtel'
export const LOCAL_BGA = 'Leipzig'
export const BACH = { apelido: 'Bach', nome: 'Johann Sebastian', papel: 'compositor' }
export const CPE_BACH = { apelido: 'Bach', nome: 'Carl Philipp Emanuel', papel: 'compositor' }

// Editores (nome completo)
const ED = {
  Hauptmann: ['Moritz', 'Hauptmann'],
  Becker: ['Carl Ferdinand', 'Becker'],
  Rietz: ['Julius', 'Rietz'],
  Rust: ['Wilhelm', 'Rust'],
  Espagne: ['Franz', 'Espagne'],
  Kroll: ['Franz', 'Kroll'],
  Dörffel: ['Alfred', 'Dörffel'],
  Waldersee: ['Paul von', 'Waldersee'],
  Naumann: ['Ernst', 'Naumann'],
  Wüllner: ['Franz', 'Wüllner'],
  Kretzschmar: ['Hermann', 'Kretzschmar'],
  Graeser: ['Wolfgang', 'Graeser'],
}

// Volumes: chave «28», «5_1» (Jahrgang 5, 1.º volume), «47» = suplemento de 1926 (Die Kunst der Fuge, Graeser).
// [ano, editor, título do volume (IMSLP), BWV]
const VOLUMES = {
  1: [1851, 'Hauptmann', 'Kirchencantaten, Band 1', 'BWV 1–10'],
  2: [1852, 'Hauptmann', 'Kirchencantaten, Band 2', 'BWV 11–20'],
  3: [1853, 'Becker', 'Clavierwerke, Band 1', ''],
  4: [1854, 'Rietz', 'Passionsmusik nach dem Evangelisten Matthäus', 'BWV 244'],
  '5_1': [1855, 'Rust', 'Kirchencantaten, Band 3', 'BWV 21–30'],
  '5_2': [1856, 'Rust', 'Weihnachts-Oratorium', 'BWV 248'],
  6: [1856, 'Rietz', 'Messe in H-moll', 'BWV 232'],
  7: [1857, 'Rust', 'Kirchencantaten, Band 4', 'BWV 31–40'],
  8: [1858, 'Hauptmann', 'Messen', 'BWV 233–236'],
  9: [1860, 'Rust', 'Kammermusik, Band 1', ''],
  10: [1860, 'Rust', 'Kirchencantaten, Band 5', 'BWV 41–50'],
  '11_1': [1862, 'Rust', 'Magnificat in D dur und vier Sanctus', 'BWV 237–240, 243'],
  '11_2': [1862, 'Rust', 'Kammermusik für Gesang, Band 1', 'BWV 201–205'],
  '12_1': [1863, 'Rust', 'Passionsmusik nach dem Evangelisten Johannes', 'BWV 245'],
  '12_2': [1863, 'Rust', 'Kirchencantaten, Band 6', 'BWV 51–60'],
  '13_1': [1864, 'Rust', 'Trauungs-Cantaten', ''],
  '13_2': [1865, 'Espagne', 'Clavierwerke, Band 2', 'BWV 806–817'],
  '13_3': [1865, 'Rust', 'Trauer-Ode', 'BWV 198'],
  14: [1866, 'Kroll', 'Clavierwerke, Band 3 (Das wohltemperirte Clavier)', 'BWV 846–893'],
  15: [1867, 'Rust', 'Orgelwerke, Band 1', ''],
  16: [1868, 'Rust', 'Kirchencantaten, Band 7', 'BWV 61–70'],
  17: [1869, 'Rust', 'Kammermusik, Band 2', ''],
  18: [1870, 'Rust', 'Kirchencantaten, Band 8', 'BWV 71–80'],
  19: [1871, 'Rust', 'Kammermusik, Band 3 (Brandenburgische Concerte)', 'BWV 1046–1051'],
  '20_1': [1872, 'Rust', 'Kirchencantaten, Band 9', 'BWV 81–90'],
  '20_2': [1873, 'Rust', 'Kammermusik für Gesang, Band 2', 'BWV 206–207'],
  '21_1': [1874, 'Rust', 'Kammermusik, Band 4', 'BWV 1041–1043, 1045'],
  '21_2': [1874, 'Rust', 'Kammermusik, Band 5', 'BWV 1060–1062'],
  '21_3': [1874, 'Rust', 'Oster-Oratorium', 'BWV 249'],
  22: [1875, 'Rust', 'Kirchencantaten, Band 10', 'BWV 91–100'],
  23: [1876, 'Rust', 'Kirchencantaten, Band 11', 'BWV 101–110'],
  24: [1876, 'Dörffel', 'Kirchencantaten, Band 12', 'BWV 111–120'],
  '25_1': [1878, 'Rust', 'Die Kunst der Fuge', 'BWV 1080'],
  '25_2': [1878, 'Rust', 'Orgelwerke, Band 2', 'BWV 599–668'],
  26: [1878, 'Dörffel', 'Kirchencantaten, Band 13', 'BWV 121–130'],
  '27_1': [1879, 'Dörffel', 'Kammermusik, Band 6', 'BWV 1001–1012'],
  '27_2': [1879, 'Dörffel', 'Thematisches Verzeichniss der Kirchencantaten', ''],
  28: [1881, 'Rust', 'Kirchencantaten, Band 14', 'BWV 131–140'],
  29: [1881, 'Waldersee', 'Kammermusik für Gesang, Band 3', ''],
  30: [1884, 'Waldersee', 'Kirchencantaten, Band 15', 'BWV 141–150'],
  '31_1': [1885, 'Dörffel', 'Orchesterwerke', 'BWV 1066–1069'],
  '31_2': [1885, 'Dörffel', 'Musikalisches Opfer', 'BWV 1079'],
  '31_3': [1885, 'Waldersee', 'Kammermusik, Band 7', 'BWV 1063–1064'],
  32: [1886, 'Naumann', 'Kirchencantaten, Band 16', 'BWV 151–160'],
  33: [1887, 'Wüllner', 'Kirchencantaten, Band 17', 'BWV 161–170'],
  34: [1887, 'Waldersee', 'Kammermusik für Gesang, Band 4', ''],
  35: [1888, 'Dörffel', 'Kirchencantaten, Band 18', 'BWV 171–180'],
  36: [1890, 'Naumann', 'Clavierwerke, Band 4', ''],
  37: [1891, 'Dörffel', 'Kirchencantaten, Band 19', 'BWV 181–190'],
  38: [1891, 'Naumann', 'Orgelwerke, Band 3', ''],
  39: [1892, 'Wüllner', 'Motetten, Choräle und Lieder', ''],
  40: [1893, 'Naumann', 'Orgelwerke, Band 4', 'BWV 690–771'],
  41: [1894, 'Dörffel', 'Kirchenmusikwerke (Ergänzungsband)', ''],
  42: [1894, 'Naumann', 'Clavierwerke, Band 5', ''],
  '43_1': [1894, 'Waldersee', 'Kammermusik, Band 8', ''],
  '43_2': [1894, 'Waldersee', 'Musikstücke in den Notenbüchern der Anna Magdalena Bach', ''],
  44: [1895, 'Kretzschmar', 'Handschrift in zeitlich geordneten Nachbildungen (fac-símiles)', ''],
  '45_1': [1897, 'Dörffel', 'Instrumentalwerke (Ergänzungsband)', ''],
  '45_2': [1898, 'Dörffel', 'Passionsmusik nach dem Evangelisten Lucas', 'BWV 246'],
  46: [1899, 'Kretzschmar', 'Bericht und Verzeichnisse', ''],
  47: [1926, 'Graeser', 'Die Kunst der Fuge (Supplement)', 'BWV 1080'],
}

const pessoaEditor = (apelido) => ({ apelido: ED[apelido][1], nome: ED[apelido][0], papel: 'editor' })
const nomeEditor = (apelido) => ED[apelido].join(' ')
const jahrgangDe = (chave) => String(chave).split('_')[0]
const rotuloBanda = (chave) => (Number(chave) === 47 ? 'Supplement (1926)' : String(chave).replace('_', '.'))

// Dados de um volume ou de um Jahrgang inteiro («13» = 13.1 + 13.2 + 13.3 num só PDF)
export function volumeBga(chave) {
  chave = String(chave).replace(/^0+(?=\d)/, '').replace('.', '_')
  if (VOLUMES[chave]) {
    const [ano, ed, titulo, bwv] = VOLUMES[chave]
    return { chave, jahrgang: jahrgangDe(chave), ano, anos: String(ano), editores: [ed], titulo, bwv }
  }
  const partes = Object.keys(VOLUMES).filter((k) => k.startsWith(chave + '_')).sort()
  if (!partes.length) return null
  const v = partes.map((k) => VOLUMES[k])
  const anos = [...new Set(v.map((x) => x[0]))]
  return {
    chave,
    jahrgang: chave,
    ano: Math.min(...anos),
    anos: anos.length > 1 ? `${Math.min(...anos)}–${Math.max(...anos)}` : String(anos[0]),
    editores: [...new Set(v.map((x) => x[1]))],
    titulo: v.map((x) => x[2]).join(' / '),
    bwv: '',
    partes,
  }
}

// ---- BWV → volume -------------------------------------------------------------------------------------------
// Intervalos da tabela dos volumes (Wikipedia): [de, até, volume]
const INTERVALOS = [
  [1, 10, '1'], [11, 20, '2'], [21, 30, '5_1'], [31, 40, '7'], [41, 50, '10'], [51, 60, '12_2'], [61, 70, '16'],
  [71, 80, '18'], [81, 90, '20_1'], [91, 100, '22'], [101, 110, '23'], [111, 120, '24'], [121, 130, '26'],
  [131, 140, '28'], [141, 150, '30'], [151, 160, '32'], [161, 170, '33'], [171, 180, '35'], [181, 190, '37'],
  [191, 193, '41'], [194, 194, '29'], [195, 197, '13_1'], [198, 198, '13_3'], [201, 205, '11_2'], [206, 207, '20_2'],
  [208, 212, '29'], [213, 215, '34'], [217, 220, '41'], [225, 231, '39'], [232, 232, '6'], [233, 236, '8'],
  [237, 240, '11_1'], [241, 242, '41'], [243, 243, '11_1'], [244, 244, '4'], [245, 245, '12_1'], [246, 246, '45_2'],
  [248, 248, '5_2'], [249, 249, '21_3'], [250, 252, '13_1'], [253, 518, '39'], [525, 539, '15'], [540, 548, '15'],
  [549, 551, '38'], [552, 552, '3'], [553, 563, '38'], [564, 566, '15'], [567, 580, '38'], [582, 582, '15'],
  [583, 583, '38'], [585, 585, '38'], [587, 595, '38'], [598, 598, '38'], [599, 668, '25_2'], [669, 689, '3'],
  [690, 771, '40'], [772, 805, '3'], [806, 817, '13_2'], [818, 820, '36'], [825, 831, '3'], [846, 893, '14'],
  [910, 911, '3'], [944, 944, '3'], [971, 971, '3'], [988, 988, '3'], [1001, 1012, '27_1'], [1014, 1019, '9'],
  [1020, 1020, '9'], [1023, 1023, '43_1'], [1025, 1025, '9'], [1026, 1026, '43_1'], [1027, 1032, '9'],
  [1033, 1035, '43_1'], [1037, 1039, '9'], [1041, 1043, '21_1'], [1044, 1044, '17'], [1045, 1045, '21_1'],
  [1046, 1051, '19'], [1052, 1059, '17'], [1060, 1062, '21_2'], [1063, 1064, '31_3'], [1065, 1065, '43_1'],
  [1066, 1069, '31_1'], [1079, 1079, '31_2'], [1080, 1080, '25_1'], [1080, 1080, '47'],
]
// Coluna «BG» das listas da Wikipedia (só o que os intervalos não dizem: volumes de peças avulsas e versões «a/b»)
const AVULSAS = {
  '3': '772a',
  '14': '872a',
  '17': '1059',
  '25_2': '620a 631a 651a 653a 655a 655b 655c 656a 658a 659a 660a 660b 661a 663a 664a 665a',
  '20_2': '207a',
  '29': '134a 210a',
  '34': '30a 36a 36b 36c 173a 207a',
  '31_1': '1046a',
  '36': '813a 815a 818a 819a 823 841 842 843 870a 872a 875a 894 895 896 899 900 901 902 903 903a 904 906 912 912a 913 914 915 916 917 918 921 922 924 924a 925 926 927 928 929 930 931 932 933 934 935 936 937 938 939 940 941 942 943 946 947 948 949 950 951 951a 952 953 961 963 989 992 993 994 999',
  '38': '574a',
  '40': '653b 695a 713a 722a 729a 732a 734a 735a 738a',
  '41': '34a 120a 197a 233a',
  '42': '592a 821 822 832 923 954 955 955a 957 959 964 965 966 968 972 973 974 975 976 977 978 979 980 981 982 983 984 985 986 987 1006a',
  '43_2': '508 509 510 511 512 513 514 515 515a 516 517 518 728 991',
  '45_1': '806 807 808 809 810 811 814a 836 837 846a 855a 967 996 997 998',
}
const MAPA_AVULSAS = new Map()
for (const [banda, lista] of Object.entries(AVULSAS)) for (const b of lista.split(' ')) MAPA_AVULSAS.set(b, [...(MAPA_AVULSAS.get(b) || []), banda])

// Volumes em que um BWV está publicado (o 1.º é o principal); [] = não está na tabela
export function bandasDoBwv(bwv) {
  const s = String(bwv || '').toLowerCase().replace(/\s+/g, '')
  const m = /^(\d{1,4})([a-z]?)$/.exec(s)
  if (!m) return []
  const n = Number(m[1])
  const out = [...(MAPA_AVULSAS.get(s) || [])]
  // (uma versão «a» sem entrada própria fica com o volume do número)
  if (!m[2] || !out.length) for (const [de, ate, banda] of INTERVALOS) if (n >= de && n <= ate && !out.includes(banda)) out.push(banda)
  if (m[2] && !out.length) return []
  return out
}

// O volume do PDF («28», «11», «5_1») e o volume do BWV («11_2») batem certo?
export function bandaBate(bandaPdf, bandasBwv) {
  const p = String(bandaPdf)
  return bandasBwv.some((b) => b === p || (!p.includes('_') && jahrgangDe(b) === p) || (p.includes('_') && b === p))
}

// ---- Leitura dos indícios ------------------------------------------------------------------------------------
const ROMANOS = { I: 1, V: 5, X: 10, L: 50 }
export function deRomano(r) {
  const s = String(r || '').toUpperCase().replace(/1/g, 'I')
  if (!/^[IVXL]+$/.test(s)) return 0
  let t = 0
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]]
    const w = ROMANOS[s[i + 1]] || 0
    t += v < w ? -v : v
  }
  return t
}
export function paraRomano(n) {
  let s = ''
  for (const [v, r] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) (s += r), (n -= v)
  return s
}

// Rodapé da BGA: «B. W. XXVIII.» (assinatura de cada caderno). O OCR lê o ponto final como «I» («XXVIII» por «XXVII.»)
// e corta letras («B.W. XX» por XXV). rodapeBate → 'certo' (igual, ou com um «I» a mais no fim), 'parcial' (a leitura é
// o começo do número certo, mín. 2 letras: é da BGA, mas fica por rever) ou ''.
export function rodapesBga(texto) {
  const out = []
  // (erros de OCR vistos nos PDFs reais: «XXV1», «XXVIT», «XXVIL.», «XXYVII», «XXVO», «XNIX» = XXIX)
  for (const m of String(texto || '').matchAll(/\b(?:B\s?\.\s?W\s?\.?|BW\s?\.)\s?(?:V\s?\.\s?)?([XVIL1TYNO]{1,8})\b/g)) {
    const r = m[1].toUpperCase().replace(/[1T]/g, 'I').replace(/N/g, 'X').replace(/[YO]/g, '').replace(/([IV])L$/, '$1I')
    if (r && deRomano(r)) out.push(r)
  }
  return out
}
export function rodapeBate(romano, jahrgang) {
  const certo = paraRomano(Number(jahrgang))
  if (!certo || !romano) return ''
  if (romano === certo || romano === certo + 'I') return 'certo'
  if (romano.length >= 2 && certo.startsWith(romano)) return 'parcial'
  return ''
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// Números BWV escritos num nome ou título: «BWV 1051», «bwv 894», «BWB 921», «BEV 886», «BWV 531-536»,
// «Cantata nº 036a y 36c» (= BWV 36a e 36c; a numeração das cantatas da BGA é a do BWV)
export function bwvDoNome(texto) {
  const s = semAcento(texto).replace(/_/g, ' ')
  const m = /\bB\s?[WE]\s?[VB]\s?\.?\s?(\d{1,4}[a-z]?)\b(?:\s?[-–]\s?(\d{1,4})\b)?/i.exec(s)
  if (m) {
    const de = m[1].toLowerCase().replace(/^0+(?=\d)/, '')
    const ate = m[2] && Number(m[2]) > Number.parseInt(de, 10) && Number(m[2]) - Number.parseInt(de, 10) < 200 ? m[2] : ''
    return ate ? { lista: [], intervalo: [Number.parseInt(de, 10), Number(ate)] } : { lista: [de], intervalo: null }
  }
  const c = /\bcant\w*\s*(?:n\s*[ro.º°]*|nr\.?|no\.?)?\s*0*(\d{1,3}[a-z]?)\b(?:\s*(?:y|e|und|and|,)\s*0*(\d{1,3}[a-z]?)\b)?/i.exec(s)
  if (c) {
    const n = Number.parseInt(c[1], 10)
    if (n >= 1 && n <= 224) return { lista: [c[1], c[2]].filter(Boolean).map((x) => x.toLowerCase()), intervalo: null }
  }
  return null
}

// O nº de catálogo de uma ficha é o volume da BGA («BWV XXIX», «B.W. XXXVIII.», «B.W.V.XXVI.») e não um BWV?
export const catalogoEVolume = (cat) => /^\s*B\.?\s?W\.?\s?V?\.?\s?[XVIL]+\.?\s*$/i.test(String(cat || ''))

// Obras conhecidas pelo nome: volume inteiro sem «BGA Band» no nome («Brandenburg.1-6.pdf» = Jahrgang 19) e extractos da
// colecção espanhola sem BWV no nome («variaciones goldberg (Klavierubung IV).pdf» = BWV 988)
const OBRAS_PELO_NOME = [
  [/brandenburg|brandemburgo/i, '19', '1046-1051'],
  [/matth[aä]us|mateus|mateo|matthew/i, '4', '244'],
  [/johannes-?passion|joao|juan/i, '12_1', '245'],
  [/weihnachts|christmas|navidad|natal/i, '5_2', '248'],
  [/h-?moll-?messe|messe in h|mass in b minor|missa em si/i, '6', '232'],
  [/kunst der fuge|art of (the )?fugue|arte de la fuga|arte da fuga/i, '25_1', '1080'],
  [/musikalisches opfer|musical offering|ofrenda musical/i, '31_2', '1079'],
  [/oster-?oratorium|easter oratorio/i, '21_3', '249'],
  [/goldberg/i, '', '988'],
  [/concierto italiano|italienisches concert|italian concerto/i, '', '971'],
  [/obertura francesa|franz[oö]sische ouverture|french overture/i, '', '831'],
]

// Obras que a BGA deu a J. S. Bach e hoje têm outro autor (BWV → autor actual): ficam por rever, com nota
const ATRIBUICOES = {
  15: 'Johann Ludwig Bach', 53: 'Melchior Hoffmann', 141: 'Georg Philipp Telemann', 160: 'Georg Philipp Telemann',
  189: 'Melchior Hoffmann', 218: 'Georg Philipp Telemann', 219: 'Georg Philipp Telemann', 222: 'Johann Ernst Bach',
  567: 'Johann Ludwig Krebs',
}
// C. P. E. Bach na BGA: H 542.5 = BWV 1020 (Jahrgang 9)
const CPE = { '542.5': '1020' }
// (título ao estilo do IMSLP, que não tem página própria para esta sonata)
const TITULOS_CPE = { '542.5': 'Sonata in G minor for Violin and Harpsichord, H 542.5 (BWV 1020)' }

// Nome do ficheiro com outro autor: «(Krebs)», «(M. Hoffmann)», «(posible GP Telemann)», «(CPE Bach)», «de WF Bach»;
// «(dudoso)» = duvidosa (fica completa, com nota)
const OUTROS = [
  [/Krebs/i, 'Krebs', 'Johann Ludwig'],
  [/Hoffmann?/i, 'Hoffmann', 'Melchior'],
  [/Telemann/i, 'Telemann', 'Georg Philipp'],
  [/C\.?\s?P\.?\s?E\.?\s?Bach/i, 'Bach', 'Carl Philipp Emanuel'],
  [/W\.?\s?F\.?\s?Bach/i, 'Bach', 'Wilhelm Friedemann'],
  [/J\.?\s?L\.?\s?Bach/i, 'Bach', 'Johann Ludwig'],
  [/J\.?\s?E\.?\s?Bach/i, 'Bach', 'Johann Ernst'],
  [/Kirch+h?off/i, 'Kirchhoff', 'Gottfried'],
  [/Dretzel/i, 'Dretzel', 'Cornelius Heinrich'],
  [/Kuhnau/i, 'Kuhnau', 'Johann'],
  [/Kellner/i, 'Kellner', 'Johann Peter'],
  [/Pachelbel/i, 'Pachelbel', 'Johann'],
  [/Albrechtsberger/i, 'Albrechtsberger', 'Johann Georg'],
  [/Goldberg/i, 'Goldberg', 'Johann Gottlieb'],
]
const outroAutorNoNome = (nome) => {
  const s = semAcento(nome)
  for (const m of s.matchAll(/\(([^)]*)\)|\bde\s+((?:[A-Z]\.?\s?){1,3}Bach)/g)) {
    const o = OUTROS.find(([re]) => re.test(m[1] || m[2] || ''))
    if (o) return { apelido: o[1], nome: o[2], papel: 'compositor' }
  }
  return null
}
const pessoaDe = (texto) => {
  const p = String(texto).trim().split(/\s+/)
  return { apelido: p.pop(), nome: p.join(' '), papel: 'compositor' }
}

// ---- Reconhecimento -------------------------------------------------------------------------------------------
// nome: nome original do ficheiro; pdfTitulo/pdfAutor/programa (Creator)/produtor (Producer);
// texto: texto/OCR das primeiras páginas; titulo: título que a ficha já tem (ou o lido pela IA); catalogo: nº de
// catálogo (ou catalogo_ia) que a ficha já tem.
export function reconhecerBga({ nome = '', pdfTitulo = '', pdfAutor = '', programa = '', produtor = '', texto = '', titulo = '', catalogo = '' } = {}) {
  const nomeS = semAcento(nome).replace(/_/g, ' ')
  const catalogos = [].concat(catalogo || []).map(String).filter(Boolean)
  const pistas = []

  // NBA (Neue Bach-Ausgabe): só pelo nome («NBA I/34», «bachNBAI,34»); sem dados para confirmar → por rever
  const nba = /NBA\s?([IVX]{1,4})\s?[/,.-]\s?(\d{1,2})/.exec(nomeS)
  if (nba && !/\bBGA\b/i.test(nomeS)) {
    const b = bwvDoNome(nomeS)
    return {
      tipo: 'nba', banda: '', bwv: b?.lista || [], completa: false, pistas: ['nome: NBA'],
      motivo: `Neue Bach-Ausgabe, Serie ${nba[1]}, Band ${nba[2]} (pelo nome do ficheiro): confirmar a edição e o ano do volume.`,
      notas: [],
      campos: { metadados: { colecao: `Neue Bach-Ausgabe, Serie ${nba[1]}, Band ${nba[2]}`, ...(b?.lista?.length === 1 ? { catalogo: `BWV ${b.lista[0]}` } : {}) } },
    }
  }

  // Volume inteiro: «BGA Band 05_1.pdf», «BGA Band 04 paixao segundo s mateus.pdf», «BGA Supplement.pdf»
  const vol = /\bBGA[\s_]?Band[\s_]?0*(\d{1,2})(?:[_.](\d))?(?!\d)/i.exec(semAcento(nome))
  const supl = /\bBGA[\s_]?Supplement/i.test(nomeS)
  const tituloWerke = /Bach'?s?\s+Werke/i.test(titulo) || /Bach'?s?\s+Werke/i.test(pdfTitulo)
  let chaveVolume = vol ? `${Number(vol[1])}${vol[2] ? '_' + vol[2] : ''}` : supl ? '47' : ''
  if (!chaveVolume && tituloWerke && !bwvDoNome(nomeS)) {
    const o = OBRAS_PELO_NOME.find(([re]) => re.test(nomeS))
    if (o?.[1]) (chaveVolume = o[1]), pistas.push('título «Bach\'s Werke» + obra no nome')
  }
  if (chaveVolume) {
    const v = volumeBga(chaveVolume)
    if (v) return fichaVolume(v, [...pistas, vol ? 'nome: BGA Band' : supl ? 'nome: BGA Supplement' : ''].filter(Boolean))
  }

  // Extracto: volume pelo título do PDF (colecção espanhola, «BGA BAND 28.PDF»), fac-símile «(BGA44-043.ppm)»
  const tPdf = /\bBGA\s?BAND\s?0*(\d{1,2})(?:[_ ](\d))?/i.exec(pdfTitulo)
  const fac = /\bBGA\s?(\d{1,2})-\d+\.ppm/i.exec(pdfTitulo)
  const tSupl = /\bBGA\s?SUPPLEMENT/i.test(pdfTitulo)
  let bandaPdf = tPdf ? `${Number(tPdf[1])}${tPdf[2] ? '_' + tPdf[2] : ''}` : fac ? String(Number(fac[1])) : tSupl ? '47' : ''
  if (tPdf || tSupl) pistas.push(`título do PDF: ${pdfTitulo.trim()}`)
  if (fac) pistas.push(`título do PDF: ${pdfTitulo.trim()} (fac-símile)`)
  const nomeBga = /\bBGA\b|Bach-?Gesellschaft/i.test(nomeS)
  if (nomeBga) pistas.push('nome: BGA')
  // («Bachs Werke. Kantate Nr 81» também está nas partes cavas da Breitkopf, que não são a BGA: não conta)
  const textoBga = /Mitglieder\s+der\s+Bach-?\s?Gesellschaft|Bach-?Gesellschaft\s+zu\s+Leipzig/i.test(texto)
  if (textoBga) pistas.push('texto: Bach-Gesellschaft')
  // Colecção espanhola de 2004 (Author «.», Acrobat Distiller): os PDFs sem «BGA BAND» no título são da mesma colecção
  const espanhola = String(pdfAutor).trim() === '.' && /Acrobat Distiller/i.test(`${produtor} ${programa}`)

  // C. P. E. Bach (BGA 9: H 542.5 = BWV 1020)
  const cpe = /C\.?\s?P\.?\s?E\.?\s?Bach.*?\bH\s?(\d{3}(?:\.\d)?)/i.exec(nomeS)
  let bwv = bwvDoNome(nomeS)
  let deOnde = bwv ? 'nome' : ''
  if (!bwv && cpe && CPE[cpe[1]]) (bwv = { lista: [CPE[cpe[1]]], intervalo: null }), (deOnde = `nome (C. P. E. Bach, H ${cpe[1]})`)
  if (!bwv) {
    const o = OBRAS_PELO_NOME.find(([re]) => re.test(nomeS))
    if (o) (bwv = bwvDoNome(`BWV ${o[2]}`)), (deOnde = 'nome')
  }
  if (!bwv) {
    const t = bwvDoNome(titulo) || catalogos.filter((c) => !catalogoEVolume(c)).map(bwvDoNome).find(Boolean)
    if (t) (bwv = t), (deOnde = 'ficha')
  }

  // Rodapés «B. W. XXVIII.» no texto e no nº de catálogo que a IA leu («BWV XXIX» = rodapé do Jahrgang 29)
  const rodapes = [...rodapesBga(texto), ...catalogos.filter(catalogoEVolume).flatMap((c) => rodapesBga(c.replace(/^\s*B\.?\s?W\.?\s?V\.?\s?/i, 'B.W. ')))]

  const bwvs = bwv?.lista || []
  const numeros = bwv?.intervalo ? Array.from({ length: bwv.intervalo[1] - bwv.intervalo[0] + 1 }, (_, i) => String(bwv.intervalo[0] + i)) : bwvs
  const bandasPorBwv = numeros.map((b) => bandasDoBwv(b))
  const conhecidas = bandasPorBwv.filter((l) => l.length)
  // Volume que o BWV indica (o mesmo para todos os números)
  const comuns = conhecidas.length ? conhecidas.reduce((a, l) => a.filter((x) => l.some((y) => jahrgangDe(y) === jahrgangDe(x)))) : []
  const bandaBwv = comuns[0] || ''

  const leitura = bandaBwv ? rodapes.find((r) => rodapeBate(r, jahrgangDe(bandaBwv)) === 'certo') || rodapes.find((r) => rodapeBate(r, jahrgangDe(bandaBwv))) : ''
  const rodapeOk = leitura ? rodapeBate(leitura, jahrgangDe(bandaBwv)) : ''
  if (rodapeOk) pistas.push(`rodapé: B. W. ${leitura}${rodapeOk === 'parcial' ? ' (lido em parte)' : ''}`)

  // É da BGA?
  // (rodapé sem nº BWV: é da BGA, mas fica por rever)
  const rodapeSemBwv = rodapes.length && !numeros.length && rodapes.some((r) => VOLUMES[deRomano(r)] || volumeBga(deRomano(r)))
  if (rodapeSemBwv) pistas.push(`rodapé: B. W. ${rodapes[0]} (sem nº BWV)`)
  const daBga = !!bandaPdf || nomeBga || textoBga || rodapeOk || espanhola || rodapeSemBwv
  if (!daBga) return null
  if (!bandaPdf && rodapeSemBwv) bandaPdf = String(deRomano(rodapes[0]))
  if (espanhola && !bandaPdf) pistas.push(`colecção espanhola (PDF «${String(pdfTitulo).trim() || 'sem título'}», Author «.», Distiller)`)

  const notas = []
  let completa = true
  let motivo = ''
  // Volume do extracto: o do PDF; senão o do BWV
  let banda = bandaPdf || bandaBwv
  if (bandaPdf && bandaBwv && !bandaPdf.includes('_') && bandaBate(bandaPdf, [bandaBwv])) banda = bandaBwv // «11» + BWV 203 → 11.2
  else if (bandaPdf && !bandaPdf.includes('_') && !VOLUMES[bandaPdf] && conhecidas.length) {
    const sub = comuns.find((b) => jahrgangDe(b) === bandaPdf)
    if (sub) banda = sub
  }
  if (!numeros.length) {
    completa = false
    motivo = `Peça da BGA${banda ? `, Jahrgang ${rotuloBanda(banda)}` : ''}: falta o nº BWV (não está no nome do ficheiro).`
  } else if (bandaPdf && conhecidas.length && !bandaBate(bandaPdf, conhecidas.flat())) {
    completa = false
    motivo = `O PDF diz BGA Jahrgang ${rotuloBanda(bandaPdf)}, mas BWV ${bwvs.join(', ') || numeros[0] + '–' + numeros.at(-1)} está no Jahrgang ${rotuloBanda(bandaBwv || conhecidas[0][0])}: confirmar o número BWV.`
  } else if (!bandaPdf && !bandaBwv) {
    completa = false
    motivo = `Peça da BGA, mas BWV ${bwvs.join(', ')} não está na tabela dos volumes: confirmar o Jahrgang.`
  } else if (bandaPdf && !conhecidas.length) {
    notas.push(`(BWV ${bwvs.join(', ')} não está na tabela; Jahrgang pelo título do PDF.)`)
  }
  if (deOnde === 'ficha' && completa) {
    // (o nº que a ficha tinha só conta se o volume do PDF o confirmar)
    if (!bandaPdf || !bandaBate(bandaPdf, conhecidas.flat())) {
      completa = false
      motivo = `Peça da BGA: BWV ${bwvs.join(', ')} veio da ficha (não do nome do ficheiro) e o volume não o confirma.`
    }
  }
  if (completa && rodapeOk === 'parcial' && !bandaPdf && !nomeBga && !textoBga && !espanhola) {
    completa = false
    motivo = `Rodapé da BGA lido só em parte («B. W. ${leitura}…»; BWV ${bwvs.join(', ')} é do Jahrgang ${rotuloBanda(bandaBwv)}): confirmar que é a BGA.`
  }
  if (banda && Number(jahrgangDe(banda)) === 44) {
    completa = false
    motivo = `Fac-símile da BGA (Jahrgang 44, «Handschrift in zeitlich geordneten Nachbildungen», 1895): confirmar a obra.`
  }
  // Atribuição: «(dudoso)» no nome = obra duvidosa (fica completa, com nota); outro autor → por rever
  const doNome = cpe ? null : outroAutorNoNome(nome)
  const atribuida = bwvs.length === 1 ? ATRIBUICOES[Number.parseInt(bwvs[0], 10)] || '' : ''
  const outro = doNome ? `${doNome.nome} ${doNome.apelido}` : atribuida
  if (outro && !cpe) {
    completa = false
    motivo = [motivo, `A BGA publicou ${bwvs.length ? `BWV ${bwvs.join(', ')}` : 'a peça'} como de J. S. Bach; ${doNome ? 'o nome do ficheiro diz' : 'hoje é atribuída a'} ${outro}: confirmar o compositor.`].filter(Boolean).join(' ')
  } else if (/\besp[uú]ri[oa]s?\b|\bspurious\b|\bunecht\b/i.test(nomeS)) {
    completa = false
    motivo = [motivo, `O nome do ficheiro diz que a obra é espúria («espurio»): a BGA publicou-a como de J. S. Bach; confirmar o compositor.`].filter(Boolean).join(' ')
  } else if (/\bdudos[oa]\b|\bdoubtful\b|\bzweifelhaft\b/i.test(nomeS)) notas.push('Atribuição a J. S. Bach duvidosa (nome do ficheiro: «dudoso»).')

  const v = banda ? volumeBga(banda) : null
  const catalogoNovo = bwv?.intervalo ? `BWV ${bwv.intervalo[0]}–${bwv.intervalo[1]}` : bwvs.length ? `BWV ${bwvs.join(', ')}` : ''
  const metadados = {
    ...(catalogoNovo ? { catalogo: catalogoNovo } : {}),
    ...(cpe ? { catalogo: `H ${cpe[1]}`, outros_catalogos: `BWV ${bwvs[0]}` } : {}),
    conteudo_tipo: bwv?.intervalo || bwvs.length > 1 ? 'Colecção' : 'Peça de uma colecção',
    forma: 'Impresso',
    ...(v ? { colecao: `Johann Sebastian Bach's Werke (Bach-Gesellschaft), Jahrgang ${rotuloBanda(v.chave)}`, edicao: `Bach-Gesellschaft-Ausgabe, ed. ${v.editores.map(nomeEditor).join(', ')} (${v.anos})` } : {}),
  }
  return {
    tipo: 'extracto',
    outroAutor: doNome || (atribuida ? pessoaDe(atribuida) : null),
    banda,
    bandaPdf,
    bwv: numeros.length && bwv?.intervalo ? [`${bwv.intervalo[0]}–${bwv.intervalo[1]}`] : bwvs,
    completa: completa && !!v,
    motivo: motivo || (!v ? 'Peça da BGA sem volume identificado.' : ''),
    notas,
    pistas,
    campos: {
      tipoNome: 'Partitura',
      ...(cpe && TITULOS_CPE[cpe[1]] ? { titulo: TITULOS_CPE[cpe[1]] } : {}),
      // (outro autor no nome do ficheiro: fica esse, por rever; só pela tabela das atribuições fica J. S. Bach, como na BGA)
      autores: [cpe ? CPE_BACH : doNome || BACH],
      editora: EDITORA_BGA,
      local: LOCAL_BGA,
      ...(v ? { data: String(v.ano) } : {}),
      metadados,
    },
  }
}

function fichaVolume(v, pistas) {
  const supl = v.chave === '47'
  const notas = []
  if (Number(v.jahrgang) === 44) notas.push('Volume de fac-símiles de manuscritos de Bach (BGA 44, 1895).')
  const titulo = `Johann Sebastian Bach's Werke, ${supl ? 'Supplement' : `Jahrgang ${rotuloBanda(v.chave)}`}: ${v.titulo.replace(/ \(Supplement\)$/, '')}${v.bwv ? ` (${v.bwv})` : ''}`
  return {
    tipo: 'volume',
    banda: v.chave,
    bwv: [],
    completa: true,
    motivo: '',
    notas,
    pistas,
    campos: {
      tipoNome: 'Edição crítica',
      titulo,
      autores: [BACH, ...v.editores.map(pessoaEditor)],
      editora: EDITORA_BGA,
      local: LOCAL_BGA,
      data: String(v.ano),
      metadados: {
        colecao: 'Bach-Gesellschaft-Ausgabe',
        volume: supl ? 'Supplement (1926)' : `Jahrgang ${rotuloBanda(v.chave)}${v.partes ? ` (${v.partes.map((p) => rotuloBanda(p)).join(', ')})` : ''}`,
        edicao: `ed. ${v.editores.map(nomeEditor).join(', ')}${v.anos !== String(v.ano) ? ` (${v.anos})` : ''}`,
        conteudo_tipo: 'Colecção',
        ...(v.bwv ? { catalogo: v.bwv } : {}),
      },
    },
  }
}

// ---- Título do extracto -----------------------------------------------------------------------------------
// Cabeçalho de página ou título que não diz a obra: «V. VARIANTE zu Seite 175.», «ANHANG III.», «XI. Praeludium. C-dur.»,
// «SONATA III.», «Johann Sebastian Bachs Werke.», «Cantata No. 45»
export function tituloDeCabecalho(t) {
  const s = String(t || '').trim()
  if (!s) return true
  return /^(?:[IVXL]+|\d+|[a-z])\s?\.\s|^\(?ANHANG\b|VARIANTE|Siehe\s|\bSeite\s\d|Bach'?s?\s+Werke|^Cantata\s+No\.?\s*\d+[a-z]?$/i.test(s) ||
    (/^[^a-zà-ÿ]{3,}$/.test(s) && !/BWV/.test(s))
}

// Título do extracto: o que a ficha tem, se já diz a obra (com o BWV) e não veio de uma identificação errada;
// senão o título normalizado do IMSLP pelo BWV; senão o título que a ficha tem (ou o nome do ficheiro) + BWV.
export async function tituloBga(rec, { tituloAtual = '', origemErrada = false, nome = '', email = '' } = {}) {
  const cat = rec.campos.metadados.catalogo || ''
  if (rec.campos.titulo) return { titulo: rec.campos.titulo, de: 'tabela' }
  const temBwv = (t) => rec.bwv.length && rec.bwv.every((b) => new RegExp(`BWV\\s?${String(b).replace(/[–-]/, '[-–]')}(?![-–0-9a-z])`, 'i').test(t))
  // (título que é só o nome do ficheiro, «a.concierto nº1 en Re M BWV 972», não conta como título da obra)
  const eNome = normalizar(tituloAtual) === normalizar(String(nome).replace(/\.[a-z0-9]{2,4}$/i, '')) || normalizar(tituloAtual) === normalizar(tituloDoNomeBga(nome))
  if (!origemErrada && !eNome && !tituloDeCabecalho(tituloAtual) && temBwv(tituloAtual)) return { titulo: tituloAtual, de: 'ficha' }
  if (rec.bwv.length === 1 && !/[–-]/.test(rec.bwv[0]) && (rec.campos.autores[0] === BACH || rec.campos.autores[0] === CPE_BACH)) {
    try {
      const obra = await obraPorCatalogo(`BWV ${rec.bwv[0]}`, 'Bach', email, rec.campos.autores[0].nome)
      // (a página do IMSLP tem de ser a da obra, com o mesmo BWV — não «Cantatas, BWV 141-150»)
      if (obra?.titulo && temBwv(obra.titulo)) return { titulo: obra.titulo, de: 'IMSLP', obra }
    } catch (_) {}
  }
  // (colecção «BWV 531–536»: o título da 1.ª peça não serve; fica o do nome do ficheiro, que diz o intervalo)
  const intervalo = rec.bwv.some((b) => /[–-]/.test(b))
  let base = !origemErrada && !eNome && !intervalo && !tituloDeCabecalho(tituloAtual) ? tituloAtual : tituloDoNomeBga(nome)
  base = base.replace(/\bBGA\b\s*-?\s*/g, '').replace(/^[-\s]+/, '').replace(/\s+/g, ' ').trim()
  if (cat && !temBwv(base) && !base.includes(cat)) base = `${base.replace(/[.,;:\s]+$/, '')}, ${cat}`
  return { titulo: base, de: 'nome' }
}

// «2. Toccata en Re Mayor BWV 912.pdf» → «Toccata en Re Mayor BWV 912»
export function tituloDoNomeBga(nome) {
  return String(nome || '')
    .replace(/\.(pdf|tif|tiff)$/i, '')
    .replace(/_/g, ' ')
    .replace(/^IMSLP\d+-/, '')
    .replace(/^(?:\d{1,2}|[a-zñ]{1,2})\s?[.-]\s?/i, '')
    .replace(/\bcopia\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Origens de identificações que, numa ficha da BGA, estão sempre erradas (outra edição, um manuscrito, um artigo)
export const ORIGENS_ERRADAS = /Open Library|RISM|CrossRef|OpenAIRE|OpenAlex|JSTOR|Google Books|Semantic Scholar|DataCite|K10plus|Gallica|DIAMM|BSB|Mendeley/i
export const semAcentoNorm = (t) => normalizar(t)
