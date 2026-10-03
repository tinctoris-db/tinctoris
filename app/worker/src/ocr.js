// OCR aproximado (Tesseract) de PDFs digitalizados e imagens.
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BIN, PASTAS } from './config.js'
import { correr } from './extracao.js'

async function ocrImagemFicheiro(img, linguas) {
  const out = await correr(BIN.tesseract, [img, 'stdout', '--tessdata-dir', PASTAS.tessdata, '-l', linguas || 'por+eng'], { timeout: 300000 })
  return out.trim()
}

export async function ocrImagem(p, linguas) {
  // Formatos que o Tesseract não lê diretamente são convertidos pelo macOS (sips).
  const ext = path.extname(p).toLowerCase()
  if (['.heic', '.webp', '.gif'].includes(ext)) {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ocr-'))
    try {
      const png = path.join(tmp, 'img.png')
      await correr('/usr/bin/sips', ['-s', 'format', 'png', p, '--out', png])
      return await ocrImagemFicheiro(png, linguas)
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true })
    }
  }
  return ocrImagemFicheiro(p, linguas)
}

// OCR página a página. aoProgresso(pagina, total) é chamado após cada página.
export async function ocrPdf(p, linguas, { primeira = 1, ultima = 0, paginas = 0, aoProgresso } = {}) {
  const total = ultima || paginas || 1
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ocr-'))
  const partes = []
  try {
    for (let pg = primeira; pg <= total; pg++) {
      const base = path.join(tmp, 'pg')
      await correr(BIN.pdftoppm, ['-r', '300', '-gray', '-png', '-singlefile', '-f', String(pg), '-l', String(pg), p, base], { timeout: 300000 })
      let texto = ''
      try {
        texto = await ocrImagemFicheiro(base + '.png', linguas)
      } catch (_) {}
      partes.push(`[p. ${pg}]\n${texto}`)
      await fsp.rm(base + '.png', { force: true })
      if (aoProgresso) await aoProgresso(pg, total)
    }
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
  return partes.join('\n\n')
}
