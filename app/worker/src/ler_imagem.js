// Lê numa fotografia os códigos de barras (EAN: ISBN dos livros, discos) e o texto, sem as ferramentas da Apple
// (versão Windows, fase 2 — Pedro, 18/10/2026: no Mac continua o leitor da Apple, ferramentas/ler_imagem.swift, que
// lê melhor; este é o de Windows e a reserva do Mac). Códigos: zxing (WebAssembly, local); texto: Tesseract, com a
// caixa de cada linha. Devolve o mesmo que o leitor da Apple:
// { ficheiro, codigos: ['9781858131047'], linhas: [{ texto, x, y, w, h }], erro }
// (x, y, w, h: caixa da linha, de 0 a 1, com a origem no canto inferior esquerdo da imagem). Nada sai do computador.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { BIN, PASTAS } from './config.js'
import { correr } from './extracao.js'
import { MAC } from './plataforma.js'

// (as peças só se carregam quando este leitor é usado: em Windows, ou no Mac sem o leitor da Apple)
const obterSharp = async () => (await import('sharp')).default

// (o .wasm vem do próprio pacote: sem isto, o zxing iria buscá-lo à internet)
let zxingPronto = null
function zxing() {
  zxingPronto ||= (async () => {
    const z = await import('zxing-wasm/reader')
    const wasm = createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm')
    await z.prepareZXingModule({ overrides: { wasmBinary: (await fsp.readFile(wasm)).buffer }, fireImmediately: true })
    return z
  })()
  return zxingPronto
}

const LADO_CODIGOS = 3000
export async function lerCodigos(f) {
  const { readBarcodes } = await zxing()
  const sharp = await obterSharp()
  const png = await sharp(f, { failOn: 'none', limitInputPixels: false, unlimited: true })
    .rotate()
    .resize({ width: LADO_CODIGOS, height: LADO_CODIGOS, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  const r = await readBarcodes(new Uint8Array(png), { formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 8 })
  return [...new Set(r.filter((x) => x.isValid && x.text).map((x) => x.text))]
}

// Saída TSV do Tesseract → linhas com caixa (as palavras de cada linha juntas; nível 5 = palavra, 1 = página)
export function linhasDoTsv(tsv) {
  let W = 0
  let H = 0
  const porLinha = new Map()
  for (const l of String(tsv || '').split('\n').slice(1)) {
    const c = l.split('\t')
    if (c.length < 12) continue
    const [nivel, , bloco, par, linha, , left, top, width, height, conf] = c.slice(0, 11).map(Number)
    const texto = c.slice(11).join('\t').trim()
    if (nivel === 1) (W = width), (H = height)
    if (nivel !== 5 || !texto || conf < 0) continue
    const k = `${bloco}.${par}.${linha}`
    const g = porLinha.get(k) || { palavras: [], x0: Infinity, y0: Infinity, x1: 0, y1: 0 }
    g.palavras.push(texto)
    g.x0 = Math.min(g.x0, left)
    g.y0 = Math.min(g.y0, top)
    g.x1 = Math.max(g.x1, left + width)
    g.y1 = Math.max(g.y1, top + height)
    porLinha.set(k, g)
  }
  if (!W || !H) return [...porLinha.values()].map((g) => ({ texto: g.palavras.join(' ') }))
  const r = (n) => Math.round(n * 1e4) / 1e4
  return [...porLinha.values()].map((g) => ({ texto: g.palavras.join(' '), x: r(g.x0 / W), y: r(1 - g.y1 / H), w: r((g.x1 - g.x0) / W), h: r((g.y1 - g.y0) / H) }))
}

// (no Mac, como o Tesseract de reserva de antes: português e inglês, sobre o ficheiro original)
const LINGUAS = MAC ? ['por', 'eng'] : ['por', 'eng', 'spa', 'fra', 'ita', 'deu']
export async function lerTexto(f) {
  const disponiveis = LINGUAS.filter((l) => fs.existsSync(path.join(PASTAS.tessdata, `${l}.traineddata`)))
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ler-imagem-'))
  try {
    // (o Tesseract lê JPEG e PNG directamente; os outros formatos passam por um PNG, já rodado pela orientação EXIF)
    let imagem = f
    if (!/\.(jpe?g|png)$/i.test(f)) {
      imagem = path.join(tmp, 'f.png')
      const sharp = await obterSharp()
      await sharp(f, { failOn: 'none', limitInputPixels: false, unlimited: true }).rotate().png().toFile(imagem)
    }
    const tsv = await correr(BIN.tesseract, [imagem, 'stdout', '--tessdata-dir', PASTAS.tessdata, '-l', (disponiveis.length ? disponiveis : ['eng']).join('+'), '-c', 'tessedit_create_tsv=1'], { timeout: 180000 })
    return linhasDoTsv(tsv)
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

export async function lerImagem(f) {
  const saida = { ficheiro: f, codigos: [], linhas: [], erro: '' }
  try {
    saida.codigos = await lerCodigos(f)
  } catch (e) {
    saida.erro = `códigos: ${String(e.message).slice(0, 200)}`
  }
  try {
    saida.linhas = await lerTexto(f)
    if (saida.erro && saida.linhas.length) saida.erro = ''
  } catch (e) {
    saida.erro ||= `texto: ${String(e.message).slice(0, 200)}`
  }
  return saida
}
