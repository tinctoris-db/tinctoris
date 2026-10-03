// Leitura da primeira página com um modelo de IA que corre no próprio Mac (Ollama).
// Gratuito e privado: nada sai do computador. Usado só quando as regras não chegam.
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BIN } from './config.js'
import { correr } from './extracao.js'
import { pessoa, eInstituicao } from './fontes_externas/util.js'
import { log } from './registo.js'

const TIPOS = ['Livro', 'Capítulo de livro', 'Artigo', 'Tese / dissertação', 'Partitura', 'Manuscrito', 'Edição crítica', 'Programa de concerto', 'Carta', 'Relatório', 'Legislação', 'Outro']
const PAPEIS = ['autor', 'compositor', 'editor', 'tradutor', 'arranjador', 'intérprete']

const INSTRUCOES = `You are a music librarian. From this page, return ONLY a JSON object with keys:
tipo (one of: ${TIPOS.join(', ')}),
escrita ("manuscrito" if the page is handwritten, "impresso" if printed, engraved or typeset),
conteudo ("colecao" if this is the title page of a book or collection of several works, e.g. "Il secondo libro delle sinfonie", "VI Sonate", "Airs", "Lessons", "Pièces de clavecin"; "obra" if it is the title page or heading of one single work; "peca" if the page begins directly with one numbered piece or movement of a larger set, without a general title page, e.g. "Sonata I", "Canzon prima", "Concerto I", "Suite 1"),
titulo (the general title exactly as printed — for a collection, the collection title, never the first piece; original language, never translated; fix only ALL-CAPS),
autores (list of {nome, papel}; papel one of ${PAPEIS.join(', ')}; only people who wrote, arranged or edited the music or text; never printers, publishers, engravers, booksellers, dedicatees, jury members or supervisors),
editora (the printer or publisher of this edition as given in the imprint, e.g. after "apud", "appresso", "stampa", "typis", "excudebat", "gedruckt bey", "verlegt", "chez", "printed for", "sold by", "t'Amsterdam, by"; "" if none),
local (the city of the imprint),
ano (4 digits, or "" when no year is printed or written), instituicao, grau, orientador, catalogo (e.g. BWV 1047), instrumentacao,
palavras_chave (3-6 subject keywords in the document's language). Use "" or [] when not printed.`

function config(defs) {
  return { url: String(defs.ia_url || 'http://127.0.0.1:11434').replace(/\/$/, ''), modelo: defs.ia_modelo || 'qwen3-vl:8b-instruct' }
}

let cacheDisponivel = { quando: 0, valor: false }
export async function iaDisponivel(defs) {
  if (defs.ia_local_ativa === false) return false
  if (Date.now() - cacheDisponivel.quando < 60000) return cacheDisponivel.valor
  const { url, modelo } = config(defs)
  let valor = false
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    valor = (j.models || []).some((m) => m.name === modelo || m.model === modelo)
  } catch (_) {}
  cacheDisponivel = { quando: Date.now(), valor }
  return valor
}

// Imagem da 1.ª página (PDF) ou da própria imagem, reduzida para ~1200 px
async function imagemPagina(caminho, categoria, pagina = 1) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ia-'))
  try {
    const png = path.join(tmp, 'p.png')
    if (categoria === 'pdf') {
      await correr(BIN.pdftoppm, ['-r', '100', '-png', '-singlefile', '-f', String(pagina), '-l', String(pagina), caminho, path.join(tmp, 'p')], { timeout: 120000 })
    } else {
      await correr('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '1200', caminho, '--out', png], { timeout: 60000 })
    }
    return (await fsp.readFile(png)).toString('base64')
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
}

function grauNormal(g) {
  if (/doutor|doctor|phd|ph\.d|doctorat|dottorato/i.test(g || '')) return 'Doutoramento'
  if (/mestr|master|maîtrise|magistrale/i.test(g || '')) return 'Mestrado'
  if (/licenc|bachelor/i.test(g || '')) return 'Licenciatura'
  return ''
}

const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

// Páginas que não são a capa: condições de uso de bibliotecas digitais, avisos de descarga…
export const PAGINA_DE_AVISO = /nutzungsbedingungen|terms (and conditions )?of use|conditions d.utilisation|condizioni d.uso|t[ée]rminos de uso|condi[çc][õo]es de (utiliza[çc][ãa]o|uso)|digiti[sz]ed by|digitalisiert|this content downloaded|about jstor|e-rara|google books|internet archive|copyright notice|avertissement|all rights reserved|z-library|libgen|webdokumente|web documents|folgeverwertung|digitalisierungszentrum|urn:nbn:/i

async function pedir(url, modelo, imagem, maxTokens, pistas = '') {
  const r = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(240000),
    body: JSON.stringify({
      model: modelo,
      stream: false,
      think: false,
      format: 'json',
      keep_alive: '15m',
      options: { temperature: 0, num_predict: maxTokens },
      messages: [{ role: 'user', content: pistas ? `${INSTRUCOES}\n\nHints (may be incomplete, wrong, or name the publisher instead of the author):\n${pistas}\nTrust what is printed on the page; use the hints only to fill what the page does not say (e.g. the composer of variations on another composer's theme).` : INSTRUCOES, images: [imagem] }],
    }),
  })
  if (!r.ok) throw new Error(`IA local: HTTP ${r.status}`)
  const bruto = String((await r.json()).message?.content || '')
  return JSON.parse(bruto.slice(bruto.indexOf('{'), bruto.lastIndexOf('}') + 1))
}

export async function lerComIA(caminho, categoria, defs, { pagina = 1, pistas = '' } = {}) {
  const { url, modelo } = config(defs)
  const inicio = Date.now()
  const imagem = await imagemPagina(caminho, categoria, pagina)
  let d
  try {
    d = await pedir(url, modelo, imagem, 900, pistas)
  } catch (e) {
    if (/HTTP/.test(e.message)) throw e
    // Resposta cortada ou malformada: repetir uma vez com mais espaço
    try {
      d = await pedir(url, modelo, imagem, 1800, pistas)
    } catch (_) {
      throw new Error('IA local: resposta sem JSON válido')
    }
  }
  const autores = (Array.isArray(d.autores) ? d.autores : [])
    .map((a) => {
      const nome = texto(typeof a === 'string' ? a : a?.nome)
      if (!nome || nome.length > 80) return null
      const papel = PAPEIS.includes(a?.papel) ? a.papel : 'autor'
      // Anónimo: registar como tal; séculos ("XVI") e nacionalidades ("italiano") não são autores
      if (/^(an[óo]nimo|anon\.?|anonymous|anonyme|anonimo|unknown|desconhecido|ignoto)$/i.test(nome)) return { literal: 'Anónimo', papel }
      if (/^(s[ée]c\.?|sec\.?|século|siècle|century)?\s*[IVXLC]{1,5}(\s*(th|e|º))?$/i.test(nome)) return null
      if (/^(italiano|italian|portugu[êe]s|portuguese|espa[ñn]ol|spanish|fran[çc]ais|french|english|inglês|deutsch|german|alemão|flamengo|flemish|tradicional|traditional|popular)$/i.test(nome)) return null
      return eInstituicao(nome) ? { literal: nome, papel } : pessoa(nome, papel)
    })
    .filter(Boolean)
  const res = {
    tipo: TIPOS.includes(d.tipo) ? d.tipo : 'Outro',
    titulo: texto(d.titulo),
    autores,
    // (fontes antigas: aceitar anos desde 1000; o nome do ficheiro e o catálogo confirmam)
    ano: (/\b(1[0-9]|20)\d{2}\b/.exec(String(d.ano || '')) || [])[0] || '',
    escrita: /manuscri|handwrit/i.test(String(d.escrita || '')) ? 'manuscrito' : /impress|print|engrav|typeset/i.test(String(d.escrita || '')) ? 'impresso' : '',
    instituicao: texto(d.instituicao),
    grau: grauNormal(d.grau) || (d.tipo === 'Tese / dissertação' ? grauNormal(d.instituicao) : ''),
    orientador: texto(d.orientador).replace(/^(M\.|Mme|Prof\.?|Professor[a]?|Doutor[a]?|Dr\.?)\s+/i, ''),
    editora: texto(d.editora),
    local: texto(d.local),
    catalogo: texto(d.catalogo),
    instrumentacao: texto(d.instrumentacao),
    conteudo: /^cole/i.test(String(d.conteudo || '')) ? 'colecao' : /^obra/i.test(String(d.conteudo || '')) ? 'obra' : /^pe[çc]a/i.test(String(d.conteudo || '')) ? 'peca' : '',
    palavras_chave: (Array.isArray(d.palavras_chave) ? d.palavras_chave : []).map(texto).filter((k) => k && k.length <= 60).slice(0, 8),
  }
  log.info(`IA local leu a página ${pagina} em ${Math.round((Date.now() - inicio) / 1000)} s: «${res.titulo.slice(0, 80)}»`)
  return res
}
