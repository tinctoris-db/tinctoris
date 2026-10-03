// Caminhos e configuração do serviço de fundo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const RAIZ = process.env.BIBLIOTECA_RAIZ || path.resolve(APP, '..')

export const PASTAS = {
  app: APP,
  raiz: RAIZ,
  biblioteca: process.env.BIBLIOTECA_DIR || path.join(RAIZ, 'biblioteca'),
  watch: process.env.WATCH_DIR || path.join(RAIZ, 'watch_folder'),
  naoProcessados: process.env.NAO_PROCESSADOS_DIR || path.join(RAIZ, 'nao_processados'),
  // (listas de trabalho do serviço, ex.: duplicados por decidir; a cópia de teste usa outra pasta)
  dados: process.env.DADOS_DIR || path.join(APP, 'dados'),
  estilos: path.join(APP, 'estilos'),
  tessdata: path.join(APP, 'tessdata'),
}

// Subpastas especiais dentro de "biblioteca"
export const POR_REVER = '_por_rever'
export const DUPLICADOS = '_duplicados'
// Imagens originais das fontes fotografadas página a página (a ficha tem o PDF para ver; nunca são renomeadas)
export const ORIGINAIS = '_originais'

// O dono da biblioteca: o nome dele nos dados internos de um PDF que digitalizou não faz dele autor da fonte
// (P-Va Cod 1, P-EVc cm10…). Nas transcrições e trabalhos dele continua a contar.
// O nome vem das Definições («nome_dono»; vários nomes separados por «;») e é atualizado sempre que o serviço as lê
// (pb.js → definicoes()). «Pedro Sousa Silva» aceita «Pedro Silva», «Pedro Sousa Silva», «Silva, Pedro» e
// «Silva, Pedro Sousa», sem distinguir maiúsculas nem acentos.
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function padroesDono(texto) {
  const out = []
  for (const nome of String(texto || '').split(/[;\n]/).map(semAcentos).filter(Boolean)) {
    const p = nome.split(' ').map(escapar)
    if (p.length === 1) {
      out.push(new RegExp(`^${p[0]}$`))
      continue
    }
    const [primeiro, ultimo, meio] = [p[0], p[p.length - 1], p.slice(1, -1).join('\\s+')]
    out.push(new RegExp(`^${primeiro}\\s+${meio ? `(${meio}\\s+)?` : ''}${ultimo}$`))
    out.push(new RegExp(`^${ultimo},\\s*${primeiro}${meio ? `(\\s+${meio})?` : ''}$`))
  }
  return out
}
let nomesDoDono = []
export const definirDono = (texto) => (nomesDoDono = padroesDono(texto))
export const eDoDono = (a) => {
  const t = semAcentos(a?.literal || [a?.nome, a?.apelido].filter(Boolean).join(' ') || (typeof a === 'string' ? a : ''))
  return !!t && nomesDoDono.some((r) => r.test(t))
}

// Programas que fazem PDFs: editores de partituras (transcrições) e programas de juntar digitalizações
export const EDITOR_PARTITURAS = /\b(Finale|Sibelius|Dorico|MuseScore|LilyPond|Encore|Overture|capella)\b/i
export const DIGITALIZACAO = /^(Preview|Pr[ée]-?visualiza[çc][ãa]o|Aper[çc]u|Vorschau)\b|Paper Capture|ScanSnap|Image Capture|Captura de Imagem|Scanner|VueScan|ABBYY|ClearScan|Epson Scan|Canon|HP Scan/i
export const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
export const PORTA = Number(process.env.SERVICO_PORTA) || 8091

export const segredo = () => fs.readFileSync(path.join(APP, '.segredo'), 'utf8').trim()
export const credenciais = () => JSON.parse(fs.readFileSync(path.join(APP, '.servico.json'), 'utf8'))

// Programas externos (Homebrew instala em /opt/homebrew/bin)
function binario(nome) {
  for (const d of ['/opt/homebrew/bin', '/usr/local/bin']) {
    const p = path.join(d, nome)
    if (fs.existsSync(p)) return p
  }
  return nome
}
export const BIN = {
  pdfinfo: binario('pdfinfo'),
  pdftotext: binario('pdftotext'),
  pdftoppm: binario('pdftoppm'),
  tesseract: binario('tesseract'),
  ffprobe: binario('ffprobe'),
}
