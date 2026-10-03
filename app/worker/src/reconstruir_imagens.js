// Fontes fotografadas página a página que a versão antiga partiu (antes da regra "uma fonte por pasta"):
// - imagens tratadas uma a uma (uma ficha por página);
// - pastas juntadas num PDF com os originais à parte, em nao_processados/imagens_juntadas/;
// - páginas postas em _duplicados só por terem um título parecido com outra ("Outra cópia de «Sanctus»");
// - o resto da mesma pasta ainda em watch_folder_em_espera/.
//
// Plano por fonte (pasta de origem):
// - LIGAR: um PDF antigo completo (ou já revisto): a ficha fica como está e os originais passam de
//   nao_processados para biblioteca/_originais/<pasta>, ligados à ficha (metadados.originais);
// - RECONSTRUIR: as imagens voltam a juntar-se, com o nome original, em watch_folder_em_espera/<pasta>/
//   (as fichas de página e os PDFs parciais por rever deixam de existir; os PDFs parciais vão para
//   _duplicados). Quando a pasta voltar à watch folder, dá uma só ficha (PDF de visualização + originais).
// Nenhuma imagem é apagada. Fichas com notas de leitura nunca são retiradas (ficam de fora, na lista).
import fs from 'node:fs'
import path from 'node:path'
import { pb } from './pb.js'
import { PASTAS, ORIGINAIS, DUPLICADOS } from './config.js'
import * as F from './ficheiros.js'
import * as X from './extracao.js'
import { conjuntoDe, juntarOriginais } from './juntar.js'

export const EM_ESPERA = process.env.EM_ESPERA_DIR || path.join(PASTAS.raiz, 'watch_folder_em_espera')
const JUNTADAS = path.join(PASTAS.naoProcessados, 'imagens_juntadas')
const IMG = /\.(jpe?g|tiff?|png|heic|gif|webp)$/i
const NF = (s) => String(s || '').normalize('NFC')
const numero = (n) => `#${String(n).padStart(4, '0')}`

// Nome sem a parte final de página/fólio: "bsb00016889_00034" → "bsb00016889"; "Ms967  p.111v" → "ms967";
// "011 001r" → "" (só números)
export function familia(nome) {
  let b = NF(nome).replace(/\.[^.]+$/, '').toLowerCase().replace(/^(sd|\d{4}(-\d{2}){0,2})_[a-z0-9-]+_/, '')
  let antes
  do {
    antes = b
    b = b.replace(/(?:[\s_\-.()]+(?:ff?\.?|p\.?|fol\.?|f[oó]lio)?\s*\d+|(?<![\d])\d+(?=\s*[rvab]?(?:\s*-\s*\d+\s*[rvab]?)?\s*$)(?<=^\d+|\D\d{1,5}))\s*[rvab]?(\s*-\s*\d+\s*[rvab]?)?\s*$/i, '')
    b = b.replace(/[\s_\-.()]+(r|v|recto|verso|[a-d]|capa|portada|guarda|contracapa|copy|c[oó]pia)\s*$/i, '')
  } while (b !== antes && b)
  return b.replace(/[\s_\-.]+$/, '').trim()
}
// Forma do nome ("011 001r.jpg" → "9 9#.jpg"): distingue pastas de nomes só com números
export const forma = (nome) => NF(nome).toLowerCase().replace(/\d+/g, '9').replace(/9[rvab]\b/g, '9#').replace(/\.(jpe?g)$/, '.jpg').replace(/\.(tiff?)$/, '.tif')

const lerDir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((n) => !n.startsWith('.')).map(NF) : [])
function pastasComImagens(raiz) {
  const out = new Map()
  if (!fs.existsSync(raiz)) return out
  ;(function andar(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) andar(p)
      else if (IMG.test(e.name)) {
        const rel = path.relative(raiz, d)
        out.set(rel, [...(out.get(rel) || []), p])
      }
    }
  })(raiz)
  return out
}

// Nome original de uma página (o que tinha antes de a biblioteca a renomear)
function nomeOriginal(f) {
  const nomes = [f.ficheiro_original, ...String(f.metadados?.nomes_alternativos || '').split(' | ')].map(NF).filter(Boolean)
  return nomes.find((n) => !/^(SD|\d{4}(-\d{2}){0,2})_[A-Z0-9-]+_/.test(n)) || nomes[0] || path.basename(f.ficheiro)
}

export async function planoImagens() {
  // 1. Fichas que são uma só imagem, pela ordem em que entraram
  const soltas = (await pb.collection('fontes').getFullList({ filter: "ficheiro != ''", fields: 'id,numero,titulo,estado,origem,ficheiro,ficheiro_original,created,tags,metadados', sort: 'created,numero' }))
    .filter((f) => IMG.test(f.ficheiro))
  const comNotas = new Set((await pb.collection('notas_leitura').getFullList({ fields: 'fonte' })).map((n) => n.fonte))

  // 2. PDFs antigos feitos de imagens ("… (43 páginas).pdf"): a pasta dos originais em nao_processados
  const juntadosFichas = (await pb.collection('fontes').getFullList({ filter: "ficheiro ~ '.pdf' && (ficheiro_original ~ 'páginas).pdf' || metadados.nomes_alternativos ~ 'páginas).pdf')", fields: 'id,numero,titulo,estado,origem,ficheiro,ficheiro_original,paginas,tags,metadados' }))
    .filter((f) => !f.metadados?.originais)
  const indice = new Map()
  for (const [rel, ps] of pastasComImagens(JUNTADAS)) for (const p of ps) indice.set(NF(path.basename(p)), [...(indice.get(NF(path.basename(p))) || []), p])
  const usados = new Set()
  const juntados = []
  const semPasta = []
  const nomeBaseAntigo = (f) => path.basename(f, path.extname(f)).normalize('NFC').replace(/[\s_\-.(]*(\d+|[ivxlc]{1,4})?[)\s]*$/i, '').trim().toLowerCase()
  for (const f of juntadosFichas) {
    const abs = path.join(PASTAS.biblioteca, f.ficheiro)
    if (!fs.existsSync(abs)) continue
    const assunto = (await X.pdfInfo(abs)).assunto
    if (!/^Páginas juntadas de:/.test(assunto)) continue
    let nomes = assunto.replace(/^Páginas juntadas de:\s*/, '').split(', ').map(NF)
    const completo = nomes.length === f.paginas
    if (!completo) nomes = nomes.slice(0, -1)
    let escolha = null
    for (const dir of new Set((indice.get(nomes[0]) || []).map((p) => path.dirname(p)))) {
      const noDir = lerDir(dir)
      const grupo = completo ? nomes.filter((n) => noDir.includes(n)) : noDir.filter((n) => nomeBaseAntigo(n) === nomeBaseAntigo(nomes[0]))
      if ((!completo && !nomes.every((n) => grupo.includes(n))) || grupo.length !== f.paginas) continue
      const ps = grupo.map((n) => path.join(dir, n))
      if (ps.some((p) => usados.has(p))) continue
      escolha = ps
      break
    }
    if (!escolha) {
      semPasta.push(f)
      continue
    }
    escolha.forEach((p) => usados.add(p))
    juntados.push({ ficha: f, pasta: path.relative(JUNTADAS, path.dirname(escolha[0])), ficheiros: escolha })
  }

  // 3. Pastas à espera (watch_folder_em_espera)
  const espera = pastasComImagens(EM_ESPERA)

  // 4. Páginas soltas em sequência (mesma família de nome, entradas seguidas) = uma pasta de origem
  const sequencias = []
  for (const f of soltas) {
    const nome = nomeOriginal(f)
    const x = { ficha: f, nome, fam: familia(nome), forma: forma(nome) }
    const s = sequencias[sequencias.length - 1]
    const ultimo = s?.itens[s.itens.length - 1]
    const minutos = s ? (new Date(f.created.replace(' ', 'T')) - new Date(ultimo.ficha.created.replace(' ', 'T'))) / 60000 : Infinity
    if (s && minutos < 30 && s.fam === x.fam && (x.fam || path.extname(s.itens[0].nome).toLowerCase() === path.extname(nome).toLowerCase())) s.itens.push(x)
    else sequencias.push({ fam: x.fam, itens: [x] })
  }
  // ("309 154r Ribera Gloria" no meio de "308 153v", "310 154v": a mesma pasta)
  for (let i = 1; i < sequencias.length - 1; i++) {
    const [a, b, c] = [sequencias[i - 1], sequencias[i], sequencias[i + 1]]
    if (b.itens.length <= 2 && a.itens.length > 1 && a.fam === c.fam && (a.fam || a.itens[0].forma === c.itens[0].forma)) {
      a.itens.push(...b.itens, ...c.itens)
      sequencias.splice(i, 2)
      i--
    }
  }

  // 5. Uma chave (pasta de origem) por sequência: a pasta em espera ou em nao_processados com a mesma
  // família (ou, para nomes só com números, a mesma forma de nome); senão, uma pasta nova
  const conhecidas = new Map() // chave → { fams, formas }
  const registar = (chave, nomes) => {
    const k = conhecidas.get(chave) || { fams: new Set(), formas: new Set() }
    for (const n of nomes) {
      k.fams.add(familia(n))
      k.formas.add(forma(n))
    }
    conhecidas.set(chave, k)
  }
  for (const [rel, ps] of espera) registar(rel, ps.map((p) => path.basename(p)))
  for (const j of juntados) registar(j.pasta, j.ficheiros.map((p) => path.basename(p)))
  // (nome e tamanho de cada imagem das pastas conhecidas: páginas soltas iguais são uma pasta largada duas vezes)
  const assinatura = new Map()
  const assinar = (chave, ps) => { for (const p of ps) { try { assinatura.set(`${NF(path.basename(p))}:${fs.statSync(p).size}`, chave) } catch (_) {} } }
  for (const [rel, ps] of espera) assinar(rel, ps)
  for (const j of juntados) assinar(j.pasta, j.ficheiros)
  const fontes = new Map()
  const fonte = (chave) => {
    if (!fontes.has(chave)) fontes.set(chave, { chave, soltas: [], juntados: [], espera: espera.get(chave) || [], duplicados: [] })
    return fontes.get(chave)
  }
  const pequenas = []
  for (const s of sequencias) {
    if (s.itens.length < 3) {
      pequenas.push(...s.itens)
      continue
    }
    // Repetição exata (nome e tamanho) de uma pasta já tratada ou em espera?
    const iguais = new Map()
    for (const x of s.itens) {
      let tam = -1
      try {
        tam = fs.statSync(path.join(PASTAS.biblioteca, x.ficha.ficheiro)).size
      } catch (_) {}
      const c = assinatura.get(`${x.nome}:${tam}`)
      if (c) iguais.set(c, (iguais.get(c) || 0) + 1)
    }
    const [repetida, nIguais] = [...iguais.entries()].sort((a, b) => b[1] - a[1])[0] || []
    if (repetida && nIguais >= s.itens.length * 0.8) {
      fonte(`${repetida} (repetida)`).soltas.push(...s.itens)
      fonte(`${repetida} (repetida)`).repetidaDe = repetida
      continue
    }
    const candidatas = [...conhecidas.entries()].filter(([, k]) =>
      s.fam ? k.fams.has(s.fam) : s.itens.filter((x) => k.formas.has(x.forma)).length >= s.itens.length * 0.8 && [...k.fams].every((f) => !f)
    )
    let chave = candidatas.length === 1 ? candidatas[0][0] : ''
    if (!chave) {
      // pasta nova: o nome comum das imagens ("bsb00016889", "CantataEbraica"); só números → "imagens #0525-#0529"
      const exemplo = path.basename(s.itens[0].nome, path.extname(s.itens[0].nome))
      const comum = s.fam && s.fam.length >= 3 ? exemplo.slice(0, s.fam.length).replace(/[\s_\-.]+$/, '') : ''
      chave = comum && !fontes.has(comum) ? comum : `imagens ${numero(s.itens[0].ficha.numero)}-${numero(s.itens[s.itens.length - 1].ficha.numero)}`
      registar(chave, s.itens.map((x) => x.nome))
    }
    fonte(chave).soltas.push(...s.itens)
  }
  for (const j of juntados) fonte(j.pasta).juntados.push(j)

  // 6. Páginas em _duplicados por um título parecido ("Outra cópia de"), da mesma família e forma de nome
  const dupDir = path.join(PASTAS.biblioteca, DUPLICADOS)
  const outraCopia = new Set()
  try {
    for (const linha of fs.readFileSync(process.env.REGISTO_SERVICO || path.join(PASTAS.app, 'registos', 'servico.log'), 'utf8').split('\n')) {
      const m = /Outra cópia de «.*» \(#\d+\): movida para _duplicados\/(.+)$/.exec(linha)
      if (m && IMG.test(m[1])) outraCopia.add(NF(m[1]))
    }
  } catch (_) {}
  for (const nome of outraCopia) {
    const abs = path.join(dupDir, nome)
    if (!fs.existsSync(abs)) continue
    const orig = nome.replace(/_\d+(\.[^.]+)$/, '$1')
    const alvo = [...fontes.values()].filter((fo) => fo.soltas.length && (familia(orig) ? fo.soltas[0].fam === familia(orig) : fo.soltas.some((x) => x.forma === forma(orig)) && !fo.soltas[0].fam))
    if (alvo.length === 1) alvo[0].duplicados.push({ abs, nome: orig })
  }
  for (const [rel] of espera) fonte(rel)

  // 7. Decisão por fonte
  for (const fo of fontes.values()) {
    const fichas = [...fo.soltas.map((x) => x.ficha), ...fo.juntados.map((j) => j.ficha)]
    fo.retidas = fichas.filter((f) => comNotas.has(f.id))
    const revistas = fo.juntados.filter((j) => j.ficha.estado === 'completo' || comNotas.has(j.ficha.id) || j.ficha.tags?.length)
    if (fo.repetidaDe) fo.acao = 'repetida' // (páginas iguais às de outra pasta: vão para _duplicados)
    else if (!fo.soltas.length && !fo.espera.length && fo.juntados.length === 1) fo.acao = 'ligar'
    else if (!fo.soltas.length && !fo.espera.length && revistas.length) fo.acao = 'ligar' // (PDFs parciais já revistos: cada um fica com os seus originais)
    else if (!fo.soltas.length && !fo.juntados.length) fo.acao = 'esperar' // (só a pasta em espera: entra pela watch folder)
    else fo.acao = 'reconstruir'
    fo.paginas = fo.soltas.length + fo.juntados.reduce((t, j) => t + j.ficheiros.length, 0) + fo.espera.length + fo.duplicados.length
  }
  const lista = [...fontes.values()].sort((a, b) => a.chave.localeCompare(b.chave, 'pt'))
  return { fontes: lista, pequenas, semPasta, totalSoltas: soltas.length }
}

// Põe uma imagem na pasta da fonte; se já lá estiver a mesma (nome e tamanho iguais: a pasta foi largada
// duas vezes), a repetida vai para _duplicados/<pasta> - repetidas/
async function porNaPasta(abs, destino, nome) {
  const alvo = path.join(destino, nome)
  if (fs.existsSync(alvo) && fs.statSync(alvo).size === fs.statSync(abs).size) {
    await F.mover(abs, path.join(PASTAS.biblioteca, DUPLICADOS, `${path.basename(destino)} - repetidas`), nome)
    return { movido: null, repetida: true }
  }
  return { movido: await F.mover(abs, destino, nome), repetida: false }
}

// Aplica o plano. ativo(): nome do ficheiro que o serviço está a ler (não se mexe nele);
// excluir: números de fichas que ficam como estão
export async function aplicarPlano(plano, { ativo = async () => '', registo = () => {}, excluir = [] } = {}) {
  const conta = { ligadas: 0, reconstruidas: 0, fichasRetiradas: 0, imagens: 0, repetidasNaPasta: 0, saltadas: [] }
  const fora = new Set(excluir.map(Number))
  for (const fo of plano.fontes) {
    if (fo.acao === 'ligar') {
      for (const j of fo.juntados) {
        if (fora.has(j.ficha.numero)) continue
        const f = await pb.collection('fontes').getOne(j.ficha.id)
        if (f.estado === 'processando' || f.metadados?.originais) {
          conta.saltadas.push(`${numero(f.numero)} (${f.estado === 'processando' ? 'a ser processada' : 'já ligada'})`)
          continue
        }
        const base = F.seguro(j.pasta.split(path.sep).join(' - '))
        let nome = base
        for (let n = 2; fs.existsSync(path.join(PASTAS.biblioteca, ORIGINAIS, nome)); n++) nome = `${base}_${n}`
        const destino = path.join(PASTAS.biblioteca, ORIGINAIS, nome)
        const conjunto = conjuntoDe(j.ficheiros)
        for (const p of j.ficheiros) await F.mover(p, destino, path.basename(p))
        await F.limparPastasVazias(path.dirname(j.ficheiros[0]), PASTAS.naoProcessados)
        const rel = `${ORIGINAIS}/${nome}`
        await pb.collection('fontes').update(f.id, { metadados: { ...(f.metadados || {}), originais: juntarOriginais(f.metadados?.originais, rel), originais_conjunto: juntarOriginais(f.metadados?.originais_conjunto, conjunto) } })
        registo(`LIGADA ${numero(f.numero)} «${f.titulo}» ← ${j.ficheiros.length} originais em biblioteca/${rel}`)
        conta.ligadas++
        conta.imagens += j.ficheiros.length
      }
      continue
    }
    if (fo.acao !== 'reconstruir' && fo.acao !== 'repetida') continue
    const destino = fo.acao === 'repetida' ? path.join(PASTAS.biblioteca, DUPLICADOS, F.seguro(fo.chave.split(path.sep).join(' - '))) : path.join(EM_ESPERA, fo.chave)
    const todas = [...fo.soltas.map((x) => x.ficha), ...fo.juntados.map((j) => j.ficha)]
    const retidas = new Set([...fo.retidas, ...todas.filter((f) => fora.has(f.numero))].map((f) => f.id))
    let n = 0
    // páginas soltas: a imagem volta para a pasta com o nome original; a ficha de página deixa de existir
    for (const x of fo.soltas) {
      if (retidas.has(x.ficha.id)) continue
      const f = await pb.collection('fontes').getOne(x.ficha.id).catch(() => null)
      if (!f || !f.ficheiro) continue
      const abs = path.join(PASTAS.biblioteca, f.ficheiro)
      if (path.basename(abs) === (await ativo())) {
        conta.saltadas.push(`${numero(f.numero)} (a ser lida agora; correr outra vez)`)
        continue
      }
      if (!fs.existsSync(abs)) {
        conta.saltadas.push(`${numero(f.numero)} (ficheiro em falta: ${f.ficheiro})`)
        continue
      }
      const { movido, repetida } = await porNaPasta(abs, destino, x.nome)
      if (repetida) conta.repetidasNaPasta++
      try {
        await pb.collection('fontes').delete(f.id)
      } catch (e) {
        if (movido) await F.mover(movido, path.dirname(abs), path.basename(abs)).catch(() => {})
        throw e
      }
      await F.limparPastasVazias(path.dirname(abs), PASTAS.biblioteca)
      registo(`  página ${numero(f.numero)} «${f.titulo}» → ${movido ? path.basename(movido) : 'repetida (já estava na pasta)'}`)
      conta.fichasRetiradas++
      n++
    }
    // PDFs parciais antigos: os originais voltam para a pasta; o PDF (só de visualização) vai para _duplicados
    for (const j of fo.juntados) {
      if (retidas.has(j.ficha.id)) continue
      const f = await pb.collection('fontes').getOne(j.ficha.id).catch(() => null)
      if (!f || f.estado === 'processando') {
        conta.saltadas.push(`${numero(j.ficha.numero)} (a ser processada)`)
        continue
      }
      for (const p of j.ficheiros) {
        if (!fs.existsSync(p)) continue
        const { repetida } = await porNaPasta(p, destino, path.basename(p))
        repetida ? conta.repetidasNaPasta++ : n++
      }
      await F.limparPastasVazias(path.dirname(j.ficheiros[0]), PASTAS.naoProcessados)
      const abs = path.join(PASTAS.biblioteca, f.ficheiro)
      if (fs.existsSync(abs)) await F.mover(abs, path.join(PASTAS.biblioteca, DUPLICADOS), path.basename(abs))
      await pb.collection('fontes').delete(f.id)
      await F.limparPastasVazias(path.dirname(abs), PASTAS.biblioteca)
      registo(`  PDF parcial ${numero(f.numero)} «${f.titulo}» (${j.ficheiros.length} p.): originais → ${fo.chave}/, PDF → ${DUPLICADOS}/`)
      conta.fichasRetiradas++
    }
    // páginas postas em _duplicados por engano
    for (const d of fo.duplicados) {
      if (!fs.existsSync(d.abs)) continue
      const { repetida } = await porNaPasta(d.abs, destino, d.nome)
      repetida ? conta.repetidasNaPasta++ : n++
    }
    // (as que já estavam à espera também podem repetir as que voltaram agora: ver pelo nome e tamanho)
    if (fo.acao === 'repetida') {
      registo(`REPETIDA ${fo.chave}: ${n} imagens iguais às de «${fo.repetidaDe}» → ${path.relative(PASTAS.biblioteca, destino)}/`)
      conta.repetidas = (conta.repetidas || 0) + 1
      conta.imagens += n
      continue
    }
    registo(`RECONSTRUÍDA ${fo.chave}: ${n} imagens juntas em watch_folder_em_espera/${fo.chave}/ (+${fo.espera.length} que já lá estavam)`)
    conta.reconstruidas++
    conta.imagens += n
  }
  return conta
}
