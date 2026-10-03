// Serviço de fundo da Biblioteca: vigia a watch folder, faz OCR e responde à interface.
import fsp from 'node:fs/promises'
import chokidar from 'chokidar'
import { PASTAS } from './config.js'
import { pb, esperarPocketBase, definicoes } from './pb.js'
import { ignorar, categoriaPorExtensao } from './ficheiros.js'
import { agendarImagem } from './juntar.js'
import { filaEntrada, cicloOcr, eFonte, porDeLado, retomarInterrompidas } from './processador.js'
import { iniciarServidor } from './servidor.js'
import { log } from './registo.js'
import { iniciarIntensidade } from './intensidade.js'

// Nunca parar em silêncio: registar erros inesperados
process.on('uncaughtException', (e) => log.erro(`Erro inesperado: ${e.stack || e.message}`))
process.on('unhandledRejection', (e) => log.erro(`Erro inesperado: ${e?.stack || e}`))

await fsp.mkdir(PASTAS.biblioteca, { recursive: true })
await fsp.mkdir(PASTAS.watch, { recursive: true })

log.info('A ligar à base de dados...')
await esperarPocketBase()
await definicoes() // (carrega o nome do dono da biblioteca)
await iniciarIntensidade()

// OCR interrompido numa sessão anterior volta à fila.
for (const f of await pb.collection('fontes').getFullList({ filter: "ocr_estado = 'em_curso'" })) {
  await pb.collection('fontes').update(f.id, { ocr_estado: 'pendente' })
}

iniciarServidor()

const vigia = chokidar.watch(PASTAS.watch, {
  ignoreInitial: false,
  ignored: (p) => p !== PASTAS.watch && ignorar(p),
  awaitWriteFinish: { stabilityThreshold: 2500, pollInterval: 500 },
  usePolling: process.env.WATCH_POLLING === '1',
  interval: 2000,
})
// Documentos vão para a fila; o resto (páginas web, ícones…) é posto de lado logo à entrada
let cadeiaLado = Promise.resolve()
vigia.on('add', (p) => {
  // Imagens de páginas soltas: esperar pelas irmãs da mesma pasta e juntá-las num só PDF
  if (eFonte(p) && categoriaPorExtensao(p) === 'imagem') agendarImagem(p, (f) => filaEntrada.juntar(f))
  else if (eFonte(p)) filaEntrada.juntar(p)
  else cadeiaLado = cadeiaLado.then(() => porDeLado(p)).catch((e) => log.erro(`Pôr de lado ${p}: ${e.message}`))
})
vigia.on('error', (e) => log.erro(`Watch folder: ${e.message}`))
vigia.on('ready', () => {
  log.info(`A vigiar ${PASTAS.watch}`)
  retomarInterrompidas().catch((e) => log.erro(`Retomar fontes «A processar»: ${e.message}`))
})

cicloOcr()
setInterval(cicloOcr, 60000)

const sair = async () => {
  await vigia.close()
  process.exit(0)
}
process.on('SIGINT', sair)
process.on('SIGTERM', sair)
