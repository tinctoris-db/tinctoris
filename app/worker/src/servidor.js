// Servidor interno (só em 127.0.0.1). A interface chega aqui através do PocketBase
// (/api/bib/servico/...), que valida a sessão e junta o segredo partilhado.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { PORTA, PASTAS, segredo } from './config.js'
import { pb, garantirSessao, fontesPorIds, copiaDeSeguranca } from './pb.js'
import { listarEstilos, exportar, exportarNotas } from './exportacao.js'
import { filaEntrada, reorganizar, aprofundar, aplicar, pedirOcr, relerBiblioteca, reanalisar, reanalisarPorRever } from './processador.js'
import { iaDisponivel } from './ia.js'
import { definicoes } from './pb.js'
import * as proc from './processador.js'
import * as imp from './importacao.js'
import * as dup from './duplicados.js'
import * as espaco from './espaco_duplicados.js'
import { recentes, log } from './registo.js'
import { pastasOriginais } from './juntar.js'
import { categoriaPorExtensao } from './ficheiros.js'
import { estadoIntensidade, mudarNivel } from './intensidade.js'

async function notasDe(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 80) {
    const bloco = ids.slice(i, i + 80)
    const filtro = bloco.map((_, j) => `fonte = {:i${j}}`).join(' || ')
    const params = Object.fromEntries(bloco.map((id, j) => [`i${j}`, id]))
    out.push(...(await pb.collection('notas_leitura').getFullList({ filter: pb.filter(filtro, params), sort: 'ordem,created' })))
  }
  return out
}

let copiaDuplicados = 0

const FICHEIRO_SO_LOCAL = path.join(PASTAS.app, '.so_local')

let sistemaCache = null
function sistema() {
  if (!sistemaCache) {
    let macos = ''
    try {
      macos = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
    } catch (_) {}
    let versao = ''
    try {
      versao = JSON.parse(fs.readFileSync(path.join(PASTAS.app, 'worker', 'package.json'), 'utf8')).version
    } catch (_) {}
    sistemaCache = { versao, macos, arquitetura: os.arch() }
  }
  return sistemaCache
}

const ROTAS = {
  'GET estado': async () => {
    await garantirSessao()
    const pendentes = await pb.collection('fontes').getList(1, 1, { filter: "ocr_estado = 'pendente'" })
    const rever = await pb.collection('fontes').getList(1, 1, { filter: "estado = 'a_rever'" })
    return {
      entrada: filaEntrada.estado(),
      intensidade: estadoIntensidade(),
      ocr: proc.ocrAtual,
      ocr_pendentes: pendentes.totalItems,
      ia: { disponivel: await iaDisponivel(await definicoes()), modelo: (await definicoes()).ia_modelo || '' },
      por_rever: rever.totalItems,
      // (escuta só em 127.0.0.1 desde o arranque: os endereços da rede não funcionam)
      so_local: process.env.PB_ESCUTA === '127.0.0.1',
      pastas: { biblioteca: PASTAS.biblioteca, watch_folder: PASTAS.watch },
      enderecos: Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => `http://${i.address}:${process.env.PB_PORTA || 8090}`),
      eventos: recentes().slice(0, 150),
    }
  },
  'GET estilos': async () => listarEstilos(),
  // (os comandos de terminal confirmam que o serviço já tem o código de que precisam)
  'GET capacidades': async () => ({ capacidades: ['lotes-midi', 'autor-pelo-nome', 'duplicados', 'colecoes-impressores', 'originais', 'intensidade', 'nome-primeiro', 'espaco-duplicados', 'rede', 'sistema'] }),
  // Versão do programa e do macOS (para os comentários dos testers)
  'GET sistema': async () => sistema(),
  // Acesso só neste Mac ou também noutros aparelhos da mesma rede (aplica-se ao reiniciar o TINCTORIS)
  'GET rede': async () => ({ so_local: fs.existsSync(FICHEIRO_SO_LOCAL), atual: process.env.PB_ESCUTA || '' }),
  'POST rede': async (b) => {
    if (b.so_local) fs.writeFileSync(FICHEIRO_SO_LOCAL, 'Criado em Definições: o TINCTORIS só abre neste Mac.\n')
    else fs.rmSync(FICHEIRO_SO_LOCAL, { force: true })
    log.info(b.so_local ? 'Acesso: só neste Mac (ao reiniciar).' : 'Acesso: também noutros aparelhos da rede (ao reiniciar).')
    return { so_local: !!b.so_local }
  },
  'GET intensidade': async () => estadoIntensidade(),
  'POST intensidade': async (b) => {
    const r = await mudarNivel(b.nivel)
    proc.cicloOcr() // (de volta à máxima: o OCR recomeça já)
    return r
  },
  // Imagens originais de uma fonte fotografada página a página (a ficha tem o PDF de visualização)
  'POST originais': async (b) => {
    await garantirSessao()
    const f = await pb.collection('fontes').getOne(b.id, { fields: 'id,metadados' })
    return {
      pastas: pastasOriginais(f.metadados).map((pasta) => {
        const abs = path.join(PASTAS.biblioteca, pasta)
        const ficheiros = fs.existsSync(abs)
          ? fs.readdirSync(abs).filter((n) => !n.startsWith('.') && categoriaPorExtensao(n) === 'imagem').sort((x, y) => x.localeCompare(y, 'pt', { numeric: true, sensitivity: 'base' }))
          : []
        const tamanho = ficheiros.reduce((t, n) => t + fs.statSync(path.join(abs, n)).size, 0)
        return { pasta, existe: fs.existsSync(abs), ficheiros, tamanho }
      }),
    }
  },
  // Abre a pasta dos originais no Finder (no Mac onde a biblioteca corre)
  'POST mostrar-originais': async (b) => {
    await garantirSessao()
    const f = await pb.collection('fontes').getOne(b.id, { fields: 'id,metadados' })
    const pasta = pastasOriginais(f.metadados).find((p) => p === b.pasta) || pastasOriginais(f.metadados)[0]
    const abs = pasta && path.join(PASTAS.biblioteca, pasta)
    if (!abs || !fs.existsSync(abs)) throw new Error('A pasta dos originais não foi encontrada.')
    spawn('/usr/bin/open', [abs], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true }
  },
  // Ecrã "Duplicados": pares de PDFs quase iguais por decidir (a lista é feita por ./biblioteca duplicados)
  'GET duplicados': async () => dup.paraRever(),
  'POST duplicados-decidir': async (b) => {
    // (uma cópia de segurança por sessão de revisão, não uma por cada clique)
    if (b.decisao === 'manter' && Date.now() - copiaDuplicados > 30 * 60000) {
      log.info(`Cópia de segurança criada: ${await copiaDeSeguranca('antes-juntar-duplicados')}`)
      copiaDuplicados = Date.now()
    }
    return dup.decidir(b)
  },
  // Espaço ocupado por _duplicados (alerta acima de 10 %), verificação e Lixo do Mac
  'GET espaco-duplicados': async () => espaco.estado(),
  'POST espaco-verificar': async () => espaco.verificar(),
  'GET espaco-por-ver': async () => espaco.porVer({ quantos: 500 }),
  'POST espaco-lixo': async (b) => espaco.porNoLixo({ ficheiros: Array.isArray(b.ficheiros) ? b.ficheiros : undefined }),
  'POST espaco-devolver': async (b) => espaco.devolver(b),
  'POST espaco-manter': async (b) => espaco.manter(b),
  'POST espaco-abrir': async (b) => espaco.abrir(b),
  'POST exportar': async (b) => {
    const ids = Array.isArray(b.ids) ? b.ids : []
    if (!ids.length) throw new Error('Nenhuma fonte selecionada.')
    const fontes = await fontesPorIds(ids)
    if (b.formato === 'notas-md') return exportarNotas(fontes, await notasDe(ids), b)
    return exportar(fontes, b)
  },
  'POST aprofundar': async (b) => aprofundar(b.id),
  'POST aplicar': async (b) => aplicar(b.id, b.candidato),
  'POST confirmar': async (b) => reorganizar(b.id, { estado: 'completo' }),
  'POST reorganizar': async (b) => reorganizar(b.id),
  // Vários ficheiros por fonte: juntar outras fichas a esta (os ficheiros delas passam para aqui)
  'POST juntar': async (b) => {
    // (semCopia: o comando que chama já fez uma cópia antes de juntar vários lotes seguidos)
    if (!b.semCopia) log.info(`Cópia de segurança criada: ${await copiaDeSeguranca('antes-juntar-fichas')}`)
    return proc.juntarFichas(b.id, Array.isArray(b.ids) ? b.ids : [])
  },
  'POST separar': async (b) => proc.separarFicheiro(b.id, Number(b.indice)),
  'POST importar-analisar': async (b) => imp.analisar(String(b.texto || ''), b.nome),
  'POST importar': async (b) => {
    const copia = await copiaDeSeguranca('antes-importacao')
    log.info(`Cópia de segurança criada: ${copia}`)
    return imp.importar(b.id, b.opcoes)
  },
  'POST reler-biblioteca': async () => {
    const copia = await copiaDeSeguranca('antes-releitura')
    log.info(`Cópia de segurança criada: ${copia}`)
    return relerBiblioteca()
  },
  // (pedida à mão numa ficha: passa à frente de reanálises longas em curso)
  'POST reanalisar': async (b) => reanalisar(b.id, { prioritario: true }),
  'POST reanalisar-por-rever': async () => {
    const copia = await copiaDeSeguranca('antes-reanalise')
    log.info(`Cópia de segurança criada: ${copia}`)
    return reanalisarPorRever()
  },
  'POST fila-retomar': async () => {
    filaEntrada.retomar()
    return { ok: true }
  },
  'POST fila-cancelar': async () => ({ canceladas: filaEntrada.cancelar() }),
  'GET importacao': async () => imp.importacaoAtual,
  'POST ocr': async (b) => {
    await pedirOcr(b.id)
    return { ok: true }
  },
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let d = ''
    req.on('data', (c) => {
      d += c
      if (d.length > 64e6) req.destroy()
    })
    req.on('end', () => {
      try {
        ok(d ? JSON.parse(d) : {})
      } catch (e) {
        falha(e)
      }
    })
    req.on('error', falha)
  })
}

export function iniciarServidor() {
  const chave = segredo()
  const srv = http.createServer(async (req, res) => {
    const responder = (codigo, obj) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(obj))
    }
    if (req.headers['x-segredo'] !== chave) return responder(403, { erro: 'Acesso negado.' })
    const rota = ROTAS[`${req.method} ${new URL(req.url, 'http://x').pathname.slice(1)}`]
    if (!rota) return responder(404, { erro: 'Ação desconhecida.' })
    try {
      responder(200, await rota(req.method === 'POST' ? await lerCorpo(req) : {}))
    } catch (e) {
      log.erro(`${req.url}: ${e.message}`)
      responder(400, { erro: e.message })
    }
  })
  srv.listen(PORTA, '127.0.0.1', () => log.info(`Serviço à escuta em 127.0.0.1:${PORTA}`))
  return srv
}
