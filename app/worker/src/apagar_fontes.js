// Apagar várias fontes de uma vez, a partir da lista (pedido do Pedro, 5/10/2026).
// A ficha sai da base (as notas de leitura e o texto integral vão com ela) e os ficheiros vão para o
// Lixo do Mac, numa pasta «Fontes apagadas AAAA-MM-DD HHhMM» com as mesmas subpastas da biblioteca:
// recuperáveis até o Pedro esvaziar o Lixo. Antes, uma cópia de segurança da base.
// - fichas «A processar» são saltadas (o serviço pode estar a trabalhar nelas);
// - um ficheiro ou pasta de originais que outra ficha também usa fica onde está;
// - a lista do que foi feito fica em app/registos/apagar-fontes-AAAA-MM-DD.txt.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { PASTAS } from './config.js'
import { pb, garantirSessao, fontesPorIds, copiaDeSeguranca } from './pb.js'
import { pastaDoLixo } from './espaco_duplicados.js'
import { pastasOriginais } from './juntar.js'
import { log } from './registo.js'

// (a interface manda as fichas em blocos: os blocos seguidos vão para a mesma pasta do Lixo)
let lixoAtual = null
let lixoUsadoEm = 0

function dentroDaBiblioteca(relativo) {
  const abs = path.resolve(PASTAS.biblioteca, relativo)
  return abs.startsWith(PASTAS.biblioteca + path.sep) ? abs : null
}

// Outra ficha (fora das que se estão a apagar) que usa este ficheiro ou esta pasta de originais
async function usadoPorOutra(relativo, ids) {
  const fora = ids.map((_, i) => `id != {:x${i}}`).join(' && ')
  const params = { v: relativo, ...Object.fromEntries(ids.map((id, i) => [`x${i}`, id])) }
  const r = await pb.collection('fontes').getList(1, 50, {
    filter: pb.filter(`(ficheiro = {:v} || ficheiros_extra ~ {:v} || metadados ~ {:v}) && ${fora}`, params),
    fields: 'id,numero,ficheiro,ficheiros_extra,metadados',
  })
  // (a pesquisa é aproximada: confirmar o caminho exacto)
  return r.items.find((o) => o.ficheiro === relativo || (o.ficheiros_extra || []).some((x) => x.ficheiro === relativo) || pastasOriginais(o.metadados).includes(relativo)) || null
}

async function paraOLixo(relativo, lixo) {
  const abs = dentroDaBiblioteca(relativo)
  if (!abs || !fs.existsSync(abs)) return false
  let alvo = path.join(lixo, relativo)
  for (let n = 2; fs.existsSync(alvo); n++) alvo = path.join(lixo, `${relativo} (${n})`)
  await fsp.mkdir(path.dirname(alvo), { recursive: true })
  await fsp.rename(abs, alvo)
  return true
}

export async function apagarFontes({ ids, semCopia } = {}) {
  ids = Array.isArray(ids) ? [...new Set(ids.map(String))] : []
  if (!ids.length) throw new Error('Nenhuma fonte seleccionada.')
  if (ids.length > 200) throw new Error('No máximo 200 fontes de cada vez.')
  await garantirSessao()
  const copia = semCopia ? null : await copiaDeSeguranca('antes-apagar-fontes')
  if (copia) log.info(`Cópia de segurança criada: ${copia}`)
  if (!lixoAtual || Date.now() - lixoUsadoEm > 10 * 60000) lixoAtual = pastaDoLixo('Fontes apagadas')
  lixoUsadoEm = Date.now()
  const lixo = lixoAtual

  const fontes = await fontesPorIds(ids)
  const linhas = []
  const saltadas = []
  let apagadas = 0
  let movidos = 0
  for (const f of fontes) {
    const nome = `#${f.numero} ${f.titulo || '(sem título)'}`
    if (f.estado === 'processando') {
      saltadas.push({ id: f.id, numero: f.numero, motivo: 'a processar' })
      linhas.push(`SALTADA (a processar)  ${nome}`)
      continue
    }
    const ficheiros = [f.ficheiro, ...(f.ficheiros_extra || []).map((x) => x.ficheiro)].filter(Boolean)
    const originais = pastasOriginais(f.metadados)
    // (o que outra ficha também usa não vai para o Lixo)
    const ficam = []
    for (const rel of [...ficheiros, ...originais]) {
      const outra = await usadoPorOutra(rel, ids)
      if (outra) ficam.push([rel, outra.numero])
    }
    try {
      await pb.collection('fontes').delete(f.id)
    } catch (e) {
      saltadas.push({ id: f.id, numero: f.numero, motivo: e.message })
      linhas.push(`ERRO ao apagar  ${nome}: ${e.message}`)
      continue
    }
    apagadas++
    const foram = []
    const faltam = []
    for (const rel of [...ficheiros, ...originais]) {
      if (ficam.some(([x]) => x === rel)) continue
      try {
        if (await paraOLixo(rel, lixo)) (foram.push(rel), movidos++)
        else faltam.push(rel)
      } catch (e) {
        faltam.push(`${rel} (${e.message})`)
      }
    }
    linhas.push(`APAGADA  ${nome}`)
    foram.forEach((x) => linhas.push(`    → Lixo: ${x}`))
    ficam.forEach(([x, n]) => linhas.push(`    fica (também na ficha #${n}): ${x}`))
    faltam.forEach((x) => linhas.push(`    não encontrado no disco: ${x}`))
    if (!ficheiros.length) linhas.push('    (sem ficheiro)')
  }

  const d = new Date()
  const hoje = d.toISOString().slice(0, 10)
  const pastaRegistos = path.resolve(PASTAS.dados, '..', 'registos')
  const registo = path.join(pastaRegistos, `apagar-fontes-${hoje}.txt`)
  fs.mkdirSync(pastaRegistos, { recursive: true })
  fs.appendFileSync(
    registo,
    `\n== ${d.toLocaleString('pt-PT')} · ${apagadas} apagadas, ${saltadas.length} saltadas, ${movidos} ficheiros/pastas para o Lixo (${lixo})${copia ? ` · cópia ${copia}` : ''}\n${linhas.join('\n')}\n`
  )
  log.info(`${apagadas} fontes apagadas; ${movidos} ficheiros/pastas no Lixo do Mac em ${lixo}${saltadas.length ? `; ${saltadas.length} saltadas` : ''}`)
  return { apagadas, saltadas, movidos, lixo, copia, registo }
}
