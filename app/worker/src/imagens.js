// Converter e reduzir imagens (versão Windows, fase 2 — Pedro, 18/10/2026: um só caminho no Mac e em Windows).
// Usa o sharp (libvips), que funciona nos dois sistemas. No Mac, o sips continua de reserva: para HEIC (o sharp não o
// lê), para o que o sharp não conseguir ler e se o sharp faltar (actualização em que o npm install falhou) — o serviço
// arranca sempre. Em Windows não há reserva (HEIC fica por converter).
// Como o sips -Z, o «lado maior» também amplia as imagens mais pequenas.
import { execFile } from 'node:child_process'
import { MAC } from './plataforma.js'
import { erro } from './mensagens.js'

const HEIC = /\.(heic|heif)$/i

// (o sharp só se carrega quando é preciso; no Mac, sem ele, fica o sips)
let sharpPronto = null
async function obterSharp() {
  sharpPronto ||= import('sharp').then(
    (m) => (m.default.cache(false), m.default),
    (e) => {
      if (!MAC) throw e
      return null
    }
  )
  return sharpPronto
}
// (no Mac, uma imagem estragada falha no sharp e vai pelo sips, como antes; em Windows lê-se o que der)
const opcoesSharp = { failOn: MAC ? 'warning' : 'none', limitInputPixels: false, unlimited: true }

const sips = (args, timeout) =>
  new Promise((ok, falha) => execFile('/usr/bin/sips', args, { timeout }, (e, _, msg) => (e ? falha(new Error(String(msg || e.message).trim())) : ok())))
function converterComSips(entrada, saida, formato, ladoMaior, qualidade, timeout) {
  const args = ['-s', 'format', formato]
  if (formato === 'jpeg' && qualidade) args.push('-s', 'formatOptions', String(qualidade))
  if (ladoMaior) args.push('-Z', String(ladoMaior))
  return sips([...args, entrada, '--out', saida], timeout)
}

// Grava `entrada` em `saida` no formato pedido ('png' ou 'jpeg'), com o lado maior = `ladoMaior` (se for dado) e,
// em JPEG, a `qualidade` pedida (por omissão a do sips, ~80)
export async function converter(entrada, saida, { formato = 'png', ladoMaior = 0, qualidade = 0, timeout = 120000 } = {}) {
  if (HEIC.test(entrada) && !MAC) throw erro('Fotografias HEIC ainda não são lidas em Windows: converta-as para JPEG.')
  const sharp = HEIC.test(entrada) ? null : await obterSharp()
  if (!sharp) return converterComSips(entrada, saida, formato, ladoMaior, qualidade, timeout)
  let img = sharp(entrada, opcoesSharp).rotate()
  if (ladoMaior) img = img.resize({ width: ladoMaior, height: ladoMaior, fit: 'inside' })
  img = formato === 'jpeg' ? img.flatten({ background: '#ffffff' }).jpeg({ quality: qualidade || 80, mozjpeg: true }) : img.png()
  try {
    await img.toFile(saida)
  } catch (e) {
    if (!MAC) throw e
    await converterComSips(entrada, saida, formato, ladoMaior, qualidade, timeout)
  }
}

// Largura e altura em pixels (0 quando não se consegue ler)
async function dimensoesComSips(f) {
  const out = await new Promise((ok) => execFile('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f], { timeout: 60000 }, (e, o) => ok(e ? '' : o)))
  return { w: Number((/pixelWidth:\s*(\d+)/.exec(out) || [])[1] || 0), h: Number((/pixelHeight:\s*(\d+)/.exec(out) || [])[1] || 0) }
}
export async function dimensoes(f) {
  const sharp = HEIC.test(f) ? null : await obterSharp()
  if (sharp) {
    try {
      const md = await sharp(f, opcoesSharp).metadata()
      if (md.width && md.height) return { w: md.width, h: md.height }
    } catch (_) {}
  }
  return MAC ? dimensoesComSips(f) : { w: 0, h: 0 }
}
