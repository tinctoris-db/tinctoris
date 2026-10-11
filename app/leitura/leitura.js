'use strict'

// TINCTORIS — cópia de leitura. Script clássico (sem módulos, sem fetch, sem XHR): tem de funcionar com duplo clique
// (file://) em qualquer navegador. Os dados vêm de dados/fichas.js (window.TINCTORIS_DADOS) e o texto integral de
// dados/texto/bloco-NNNN.js, carregado por <script> à medida que é preciso. Formato: FORMATO.md.

;(function () {
  const raiz = document.getElementById('raiz')
  const D = window.TINCTORIS_DADOS

  // ---------------------------------------------------------------------------
  // Utilitários

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue
      if (k === 'class') el.className = v
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else if (k === 'value') el.value = v
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v
      else el.setAttribute(k, v === true ? '' : v)
    }
    anexar(el, filhos)
    return el
  }
  function anexar(el, ...filhos) {
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue
      el.append(f instanceof Node ? f : String(f))
    }
    return el
  }
  const limpar = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild)
    return el
  }
  function atraso(fn, ms) {
    let t
    const f = (...a) => {
      clearTimeout(t)
      t = setTimeout(() => fn(...a), ms)
    }
    f.cancelar = () => clearTimeout(t)
    return f
  }
  const ceder = () => new Promise((r) => setTimeout(r, 0))
  const numPT = (n) => Number(n).toLocaleString('pt-PT')
  const numeroFmt = (n) => '#' + String(n).padStart(4, '0')
  const plural = (n, um, varios) => `${numPT(n)} ${n === 1 ? um : varios}`

  function guardar(k, v) {
    try {
      localStorage.setItem('tinctoris.' + k, JSON.stringify(v))
    } catch (_) {}
  }
  function lerGuardado(k, omissao) {
    try {
      const v = localStorage.getItem('tinctoris.' + k)
      return v === null ? omissao : JSON.parse(v)
    } catch (_) {
      return omissao
    }
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  function dataExportacao(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso || '')
    if (!m) return iso || 'data desconhecida'
    return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || m[2]} de ${m[1]}${m[4] ? ', às ' + m[4] + ':' + m[5] : ''}`
  }

  function tamanhoTxt(b) {
    const mb = b / 1048576
    if (mb >= 1024) return (mb / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' GB'
    if (mb >= 10) return Math.round(mb).toLocaleString('pt-PT') + ' MB'
    return mb.toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' MB'
  }

  const urlFicheiro = (caminho) => 'biblioteca/' + String(caminho).split('/').map(encodeURIComponent).join('/')
  const eUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim())

  // ---------------------------------------------------------------------------
  // Sem dados: mensagem clara

  function mensagemSemDados(titulo, texto) {
    limpar(raiz)
    anexar(raiz, h('div', { class: 'mensagem-erro' }, h('strong', {}, titulo), texto))
  }

  if (!D || !Array.isArray(D.fichas)) {
    mensagemSemDados(
      'Não foi possível abrir os dados da biblioteca.',
      'Esta página precisa da pasta «dados» (com o ficheiro fichas.js) ao lado de «Abrir TINCTORIS.html». Se copiou só o ficheiro «Abrir TINCTORIS.html» para outro sítio, copie antes a pasta TINCTORIS inteira. ' +
        'Se a cópia foi interrompida a meio, peça uma nova exportação no Mac onde está a biblioteca.'
    )
    return
  }

  // ---------------------------------------------------------------------------
  // Normalização (sem acentos nem maiúsculas) e preparação dos dados

  function norm(s) {
    return String(s === null || s === undefined ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ſ/g, 's')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/ß/g, 'ss')
  }

  const tipos = Array.isArray(D.tipos) ? D.tipos : []
  const tiposPorId = {}
  tipos.forEach((t) => (tiposPorId[t.id] = t))
  const fichas = D.fichas
  const notas = Array.isArray(D.notas) ? D.notas : []
  const porNumero = new Map()
  const porId = new Map()

  function nomeAutor(a, completo) {
    if (!a) return ''
    if (a.literal) return a.literal
    return completo ? [a.nome, a.apelido].filter(Boolean).join(' ') : a.apelido || a.nome || ''
  }
  function autoresTexto(autores, max = 3) {
    const lista = (Array.isArray(autores) ? autores : []).map((a) => nomeAutor(a, true) + (a.papel && a.papel !== 'autor' ? ` (${a.papel})` : ''))
    if (lista.length > max) return lista.slice(0, max).join('; ') + ' et al.'
    return lista.join('; ')
  }

  // Ordenação como num catálogo (igual à da biblioteca): sem maiúsculas/acentos/pontuação, sem artigos iniciais
  const ARTIGOS = /^(the|an?|os?|as?|uma?|uns|umas|l'|le|la|les|il|lo|gli|i|el|los|las|der|die|das|ein|eine)\s+|^l'/i
  function chaveOrd(s) {
    s = String(s || '')
      .replace(/^[\s"'«»“”‘’(\[¿¡]+/, '')
      .replace(ARTIGOS, '')
    return norm(s)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\d+/g, (m) => m.padStart(8, '0'))
  }
  function chaveAutor(f) {
    const autores = Array.isArray(f.autores) ? f.autores : []
    const a = autores.find((x) => ['autor', 'compositor', 'construtor', 'realizador'].includes(x.papel || 'autor')) || autores[0]
    return a ? a.literal || [a.apelido, a.nome].filter(Boolean).join(' ') : ''
  }
  function chaveData(f) {
    const m = /(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(f.data || '')
    if (m) return Number(m[1]) * 10000 + Number(m[2] || 0) * 100 + Number(m[3] || 0)
    return f.ano ? f.ano * 10000 : null
  }

  function preparar(f) {
    f.autores = Array.isArray(f.autores) ? f.autores : []
    f.palavras_chave = Array.isArray(f.palavras_chave) ? f.palavras_chave : []
    f.metadados = f.metadados && typeof f.metadados === 'object' ? f.metadados : {}
    f.ficheiros = Array.isArray(f.ficheiros) ? f.ficheiros : []
    f.originais = Array.isArray(f.originais) ? f.originais : []
    f.titulo = f.titulo || ''
    const autoresTxt = f.autores.map((a) => [a.literal, a.nome, a.apelido].filter(Boolean).join(' ')).join('\n')
    f._tit = norm(f.titulo)
    f._aut = norm(autoresTxt)
    f._pk = norm(f.palavras_chave.join('\n'))
    const meta = Object.values(f.metadados).map((v) => (Array.isArray(v) ? v.join(' ; ') : typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    f._busca = norm([f.titulo, autoresTxt, f.editora, f.local, f.data, f.palavras_chave.join('\n'), meta.join('\n'), f.doi, f.isbn].join('\n')).replace(/[ \t]+/g, ' ')
    f._kt = chaveOrd(f.titulo)
    f._ka = chaveOrd(chaveAutor(f))
    f._kd = chaveData(f)
    f._criado = String(f.criado || '')
    f._score = 0
  }
  for (const f of fichas) {
    preparar(f)
    porNumero.set(f.numero, f)
    porId.set(f.id, f)
  }
  const temTextoIntegral = fichas.some((f) => f.bloco_texto > 0)
  const ordemTipos = tipos.filter((t) => fichas.some((f) => f.tipo === t.id))
  const contagemTipo = {}
  fichas.forEach((f) => (contagemTipo[f.tipo] = (contagemTipo[f.tipo] || 0) + 1))

  const ORDENS = {
    recentes: 'Mais recentes',
    numero: 'Número (#)',
    titulo: 'Título (A → Z)',
    '-titulo': 'Título (Z → A)',
    autor: 'Autor (A → Z)',
    '-autor': 'Autor (Z → A)',
    data: 'Data (antiga → recente)',
    '-data': 'Data (recente → antiga)',
  }
  const cmpS = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

  function ordenar(lista, ordem) {
    const inv = ordem[0] === '-' ? -1 : 1
    const campo = ordem.replace(/^-/, '')
    const porTitulo = (a, b) => {
      if (!a._kt !== !b._kt) return a._kt ? -1 : 1 // sem título sempre no fim
      return cmpS(a._kt, b._kt)
    }
    const cmp = {
      recentes: (a, b) => cmpS(b._criado, a._criado) || b.numero - a.numero,
      numero: (a, b) => inv * ((a.numero || 0) - (b.numero || 0)),
      titulo: (a, b) => (!a._kt !== !b._kt ? (a._kt ? -1 : 1) : inv * cmpS(a._kt, b._kt)),
      autor: (a, b) => (!a._ka !== !b._ka ? (a._ka ? -1 : 1) : inv * cmpS(a._ka, b._ka) || porTitulo(a, b)),
      data: (a, b) => ((a._kd === null) !== (b._kd === null) ? (a._kd === null ? 1 : -1) : inv * ((a._kd || 0) - (b._kd || 0)) || porTitulo(a, b)),
    }[campo]
    return cmp ? lista.slice().sort(cmp) : lista
  }
  const porRelevancia = (lista) => lista.slice().sort((a, b) => b._score - a._score || a.numero - b.numero)

  // ---------------------------------------------------------------------------
  // Pesquisa: palavras com E; "frase exacta"; #123 ou 123 = número da ficha

  function termosDe(q) {
    const out = []
    const re = /"([^"]*)"|(\S+)/g
    const txt = String(q || '').replace(/[“”«»]/g, '"')
    let m
    while ((m = re.exec(txt))) {
      const bruto = m[1] !== undefined ? m[1] : m[2].replace(/"/g, '')
      const t = norm(bruto).replace(/\s+/g, ' ').trim()
      if (t) out.push({ t, frase: t.includes(' '), re: null })
    }
    return out
  }
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Posição de um termo num texto já normalizado (frases: os espaços casam com quebras de linha); [início, comprimento]
  function acharNoTexto(normTxt, termo, de) {
    if (!termo.frase) {
      const i = normTxt.indexOf(termo.t, de || 0)
      return i < 0 ? null : [i, termo.t.length]
    }
    if (!termo.re) termo.re = new RegExp(escRe(termo.t).replace(/ /g, '\\s+'), 'g')
    termo.re.lastIndex = de || 0
    const m = termo.re.exec(normTxt)
    return m ? [m.index, m[0].length] : null
  }

  // ---------------------------------------------------------------------------
  // Estado da vista «Fontes» (fica em memória: voltar da ficha mantém a pesquisa)

  const estado = {
    q: '',
    ordem: lerGuardado('ordem', 'recentes'),
    ordemGuardada: lerGuardado('ordem', 'recentes'),
    filtros: { tipo: '', natureza: '', estado: '', anoDe: '', anoAte: '' },
    filtrosAbertos: false,
    textoIntegral: false,
    limite: 200,
    meta: null, // resultados pelos dados da ficha
    texto: [], // resultados só pelo texto integral
    trechos: {}, // id -> excerto
    busca: null, // progresso da pesquisa no texto
    scrollY: 0,
    termos: [],
  }
  if (!ORDENS[estado.ordem]) estado.ordem = estado.ordemGuardada = 'recentes'
  let ui = null // elementos da vista «Fontes» montada

  function passaFiltros(f) {
    const x = estado.filtros
    if (x.tipo && f.tipo !== x.tipo) return false
    if (x.natureza && f.natureza !== x.natureza) return false
    if (x.estado && f.estado !== x.estado) return false
    if (x.anoDe !== '' && !(f.ano >= Number(x.anoDe) && f.ano > 0)) return false
    if (x.anoAte !== '' && !(f.ano <= Number(x.anoAte) && f.ano > 0)) return false
    return true
  }
  const nFiltros = () => Object.values(estado.filtros).filter((v) => v !== '').length

  function pesquisarMeta() {
    const termos = (estado.termos = termosDe(estado.q))
    const num = /^\s*#?\s*(\d{1,6})\s*$/.exec(estado.q || '')
    estado.porNumero = false
    if (num && porNumero.has(Number(num[1]))) {
      estado.porNumero = true
      return [porNumero.get(Number(num[1]))]
    }
    const out = []
    for (const f of fichas) {
      if (!passaFiltros(f)) continue
      let ok = true
      let score = 0
      for (const t of termos) {
        if (!f._busca.includes(t.t)) {
          ok = false
          break
        }
        score += 1 + (f._tit.includes(t.t) ? 4 : 0) + (f._aut.includes(t.t) ? 2 : 0) + (f._pk.includes(t.t) ? 1 : 0)
      }
      if (!ok) continue
      f._score = score
      out.push(f)
    }
    return out
  }

  // ---------------------------------------------------------------------------
  // Texto integral: blocos carregados um a um por <script>, guardados em memória

  const brutos = {} // n -> { id: texto }, preenchido por TINCTORIS_TEXTO
  const preparados = {} // n -> { id: { norm, disp } }
  window.TINCTORIS_TEXTO = function (n, textos) {
    brutos[n] = textos
  }

  function carregarBloco(n) {
    return new Promise((resolve) => {
      const s = document.createElement('script')
      s.async = true
      s.src = 'dados/texto/bloco-' + String(n).padStart(4, '0') + '.js'
      s.onload = () => {
        s.remove()
        resolve(!!brutos[n])
      }
      s.onerror = () => {
        s.remove()
        resolve(false)
      }
      document.head.appendChild(s)
    })
  }

  // Normalização do texto de um documento, em pedaços (os muito grandes não congelam o ecrã). A normalização pode
  // mudar o comprimento (ligaduras «æ», «ß», sinais soltos); por isso guardam-se pontos de controlo («cum») que
  // permitem passar da posição no texto normalizado à posição no texto original (para mostrar o excerto com acentos).
  const PEDACO = 2048
  async function normalizarTexto(raw) {
    const partes = []
    const cum = []
    let acc = 0
    let alinhado = true
    const grande = raw.length > 2e6
    for (let i = 0, k = 0; i < raw.length; i += PEDACO, k++) {
      cum.push(acc)
      if (acc !== i) alinhado = false
      const p = norm(raw.slice(i, i + PEDACO))
      acc += p.length
      partes.push(p)
      if (grande && k % 512 === 511) await ceder()
    }
    const nt = partes.join('')
    return { norm: nt, raw, cum: alinhado && nt.length === raw.length ? null : cum }
  }
  // Posição no original que corresponde à posição pn do texto normalizado
  function posOriginal(t, pn) {
    if (!t.cum) return pn
    const cum = t.cum
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (cum[mid] <= pn) lo = mid
      else hi = mid - 1
    }
    let i = lo * PEDACO
    let acc = cum[lo]
    while (acc < pn && i < t.raw.length) acc += norm(t.raw[i++]).length
    return i
  }
  async function prepararBloco(n) {
    const textos = brutos[n] || {}
    const prep = {}
    for (const id of Object.keys(textos)) {
      prep[id] = await normalizarTexto(typeof textos[id] === 'string' ? textos[id] : '')
    }
    preparados[n] = prep
    delete brutos[n]
    return prep
  }

  // Excerto à volta do primeiro resultado, com a página (a partir dos marcadores «[p. 12]») e os termos realçados
  function trechoDe(t, pos, len, termos) {
    const a = Math.max(0, pos - 90)
    const b = Math.min(t.norm.length, pos + len + 150)
    const ra = posOriginal(t, a)
    const rb = posOriginal(t, b)
    let pagina = ''
    const ini = t.raw.lastIndexOf('[p.', posOriginal(t, pos))
    if (ini >= 0) {
      const m = /^\[p\.\s*(\d+)\]/.exec(t.raw.slice(ini, ini + 16))
      if (m) pagina = m[1]
    }
    const janelaNorm = t.norm.slice(a, b)
    const marcas = []
    for (const termo of termos) {
      let de = 0
      for (let k = 0; k < 6; k++) {
        const r = acharNoTexto(janelaNorm, termo, de)
        if (!r) break
        marcas.push([r[0], r[0] + r[1]])
        de = r[0] + Math.max(1, r[1])
      }
    }
    marcas.sort((x, y) => x[0] - y[0])
    const juntas = []
    for (const m of marcas) {
      const ult = juntas[juntas.length - 1]
      if (ult && m[0] <= ult[1]) ult[1] = Math.max(ult[1], m[1])
      else juntas.push([m[0], m[1]])
    }
    const limpo = (x) => x.replace(/\[p\.\s*\d+\]/g, '').replace(/\s+/g, ' ')
    const partes = []
    let c = ra
    for (const [x, y] of juntas) {
      const rx = posOriginal(t, a + x)
      const ry = posOriginal(t, a + y)
      if (rx > c) partes.push([limpo(t.raw.slice(c, rx)), false])
      partes.push([limpo(t.raw.slice(rx, ry)), true])
      c = ry
    }
    if (c < rb) partes.push([limpo(t.raw.slice(c, rb)), false])
    if (partes.length && !partes[0][1]) partes[0][0] = partes[0][0].replace(/^\s+/, '')
    return { pagina, partes, antes: a > 0, depois: b < t.norm.length }
  }

  let buscaSeq = 0

  function pararBusca() {
    const b = estado.busca
    if (b && b.ativa) {
      b.ativa = false
      b.parado = true
      b.pararAgora && b.pararAgora()
      atualizarBusca()
      desenharLista()
    }
  }

  async function procurarNoTexto() {
    const meu = ++buscaSeq
    const termos = estado.termos
    estado.texto = []
    estado.busca = null
    if (!estado.textoIntegral || !termos.length || estado.porNumero) return atualizarBusca()
    const jaTem = new Set((estado.meta || []).map((f) => f.id))
    const porBloco = new Map()
    for (const f of fichas) {
      if (!(f.bloco_texto > 0) || jaTem.has(f.id) || !passaFiltros(f)) continue
      if (!porBloco.has(f.bloco_texto)) porBloco.set(f.bloco_texto, [])
      porBloco.get(f.bloco_texto).push(f)
    }
    const blocos = [...porBloco.keys()].sort((x, y) => x - y)
    if (!blocos.length) return atualizarBusca()
    const b = (estado.busca = { ativa: true, parado: false, feitos: 0, total: blocos.length, falhas: 0, pararAgora: null })
    const sinal = new Promise((r) => (b.pararAgora = () => r(false)))
    atualizarBusca()
    let ultimaCedencia = performance.now()
    let ultimoDesenho = 0
    for (const n of blocos) {
      if (meu !== buscaSeq || !b.ativa) return
      let prep = preparados[n]
      if (!prep) {
        const ok = brutos[n] ? true : await Promise.race([carregarBloco(n), sinal])
        if (meu !== buscaSeq || !b.ativa) return
        if (!ok) {
          b.falhas++
          b.feitos++
          atualizarBusca()
          continue
        }
        prep = await prepararBloco(n)
        if (meu !== buscaSeq || !b.ativa) return
      }
      for (const f of porBloco.get(n)) {
        const t = prep[f.id]
        if (!t) continue
        let ok = true
        let primeiro = null
        let termoPrimeiro = null
        for (const termo of termos) {
          const r = acharNoTexto(t.norm, termo, 0)
          if (!r) {
            if (!f._busca.includes(termo.t)) {
              ok = false
              break
            }
          } else if (!primeiro) {
            primeiro = r
            termoPrimeiro = termo
          }
        }
        if (ok && primeiro) {
          estado.trechos[f.id] = trechoDe(t, primeiro[0], primeiro[1], termos)
          estado.texto.push(f)
        }
      }
      b.feitos++
      atualizarBusca()
      const agora = performance.now()
      if (agora - ultimoDesenho > 200) {
        ultimoDesenho = agora
        desenharLista()
      }
      if (agora - ultimaCedencia > 40) {
        await ceder()
        ultimaCedencia = performance.now()
      }
    }
    if (meu !== buscaSeq) return
    b.ativa = false
    if (estado.ordem !== 'relevancia') estado.texto = ordenar(estado.texto, estado.ordem)
    atualizarBusca()
    desenharLista()
  }

  // ---------------------------------------------------------------------------
  // Execução da pesquisa

  function executar() {
    buscaSeq++ // cancela uma pesquisa no texto em curso
    if (estado.busca && estado.busca.pararAgora) estado.busca.pararAgora()
    estado.limite = 200
    estado.trechos = {}
    let meta = pesquisarMeta()
    if (estado.ordem === 'relevancia' && !estado.termos.length) estado.ordem = estado.ordemGuardada
    meta = estado.ordem === 'relevancia' ? porRelevancia(meta) : ordenar(meta, estado.ordem)
    estado.meta = meta
    estado.texto = []
    estado.busca = null
    estado.sujo = false
    desenharLista()
    atualizarBusca()
    procurarNoTexto()
  }

  function reordenar() {
    if (!estado.meta) return
    estado.limite = 200
    const rel = estado.ordem === 'relevancia'
    estado.meta = rel ? porRelevancia(estado.meta) : ordenar(estado.meta, estado.ordem)
    if (!rel && !(estado.busca && estado.busca.ativa)) estado.texto = ordenar(estado.texto, estado.ordem)
    desenharLista()
  }

  function pesquisarPalavra(k) {
    estado.q = '"' + k.replace(/"/g, '') + '"'
    estado.ordem = 'relevancia'
    estado.sujo = true
    if (vistaAtual() === 'fontes') montarFontes()
    else location.hash = '#/fontes'
  }

  // ---------------------------------------------------------------------------
  // Item da lista

  function itemFonte(f) {
    const tipo = tiposPorId[f.tipo]
    const meta = [autoresTexto(f.autores, 3), f.data, f.editora].filter(Boolean).join(' · ')
    const trecho = estado.trechos[f.id]
    return h(
      'div',
      { class: 'item', onclick: () => (location.hash = '#/fonte/' + f.numero) },
      h(
        'div',
        {},
        h('div', { class: 'titulo' }, f.numero ? h('span', { class: 'numero' }, numeroFmt(f.numero)) : null, h('a', { href: '#/fonte/' + f.numero, onclick: (e) => e.stopPropagation() }, f.titulo || 'Sem título')),
        meta ? h('div', { class: 'meta' }, meta) : null,
        f.palavras_chave.length
          ? h(
              'div',
              { class: 'palavras-chave' },
              f.palavras_chave.slice(0, 8).map((k) =>
                h(
                  'button',
                  {
                    class: 'palavra',
                    type: 'button',
                    title: 'Pesquisar esta palavra-chave',
                    onclick: (e) => {
                      e.stopPropagation()
                      pesquisarPalavra(k)
                    },
                  },
                  k
                )
              )
            )
          : null,
        trecho
          ? h(
              'div',
              { class: 'trecho' },
              trecho.pagina ? h('span', { class: 'pag' }, 'p. ' + trecho.pagina) : null,
              trecho.antes ? '… ' : '',
              trecho.partes.map(([txt, marcado]) => (marcado ? h('mark', {}, txt) : txt)),
              trecho.depois ? ' …' : ''
            )
          : null
      ),
      h('div', { class: 'lado' }, tipo ? h('span', { class: 'etiqueta' }, tipo.nome) : null, f.estado === 'rever' ? h('span', { class: 'etiqueta rever' }, 'Por rever') : null)
    )
  }

  function desenharLista() {
    if (!ui || !ui.lista.isConnected) return
    const meta = estado.meta || []
    const texto = estado.texto || []
    const total = meta.length + texto.length
    ui.resumo.textContent = plural(total, 'fonte', 'fontes') + (texto.length ? ` · ${numPT(texto.length)} só no texto integral` : '')
    // Opções de ordem (a relevância só existe com uma pesquisa por texto)
    const comTexto = estado.termos.length > 0 && !estado.porNumero
    if (ui.ordemComTexto !== comTexto || !ui.ordem.options.length) {
      ui.ordemComTexto = comTexto
      limpar(ui.ordem)
      const pares = (comTexto ? [['relevancia', 'Relevância']] : []).concat(Object.entries(ORDENS))
      pares.forEach(([v, r]) => anexar(ui.ordem, h('option', { value: v }, r)))
    }
    if (estado.ordem === 'relevancia' && !comTexto) estado.ordem = estado.ordemGuardada
    ui.ordem.value = estado.ordem
    limpar(ui.lista)
    if (!total) {
      const semNada = !estado.q && !nFiltros()
      anexar(ui.lista, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, semNada ? 'Esta cópia não tem fontes' : 'Nada encontrado'), semNada ? 'A exportação não trouxe nenhuma ficha.' : 'Experimente outras palavras ou retire filtros.')))
      return
    }
    const todas = meta.concat(texto)
    const visiveis = todas.slice(0, estado.limite)
    const l = h('div', { class: 'lista' })
    visiveis.forEach((f, i) => {
      if (texto.length && i === meta.length) anexar(l, h('div', { class: 'separador-lista' }, 'Encontradas no texto integral'))
      anexar(l, itemFonte(f))
    })
    anexar(ui.lista, l)
    if (todas.length > estado.limite) {
      anexar(
        ui.lista,
        h('div', { class: 'mais' }, h('button', { class: 'botao', onclick: () => ((estado.limite += 200), desenharLista()) }, `Mostrar mais (${numPT(todas.length - estado.limite)} restantes)`))
      )
    }
  }

  function atualizarBusca() {
    if (!ui || !ui.caixaBusca.isConnected) return
    const b = estado.busca
    ui.caixaBusca.classList.toggle('oculto', !b)
    if (!b) return
    const pct = b.total ? Math.round((100 * b.feitos) / b.total) : 0
    let txt
    if (b.ativa) txt = `A procurar no texto: ${numPT(b.feitos)} de ${numPT(b.total)} blocos`
    else if (b.parado) txt = `Pesquisa no texto parada: ${numPT(b.feitos)} de ${numPT(b.total)} blocos`
    else txt = `Pesquisa no texto concluída: ${numPT(b.total)} blocos`
    ui.rotuloBusca.textContent = txt
    ui.aviso.textContent = b.falhas ? `${plural(b.falhas, 'bloco não abriu', 'blocos não abriram')} (ficheiro em falta ou ilegível na pasta dados/texto): o resultado pode estar incompleto.` : ''
    ui.aviso.classList.toggle('oculto', !b.falhas)
    ui.barra.style.width = pct + '%'
    ui.parar.classList.toggle('oculto', !b.ativa)
    ui.progresso.classList.toggle('oculto', !b.ativa)
  }

  // ---------------------------------------------------------------------------
  // Vista «Fontes»

  function montarFontes() {
    const p = principal()
    const aoEscrever = atraso(() => executar(), 250)

    const entradaQ = h('input', {
      type: 'search',
      placeholder: 'Pesquisar: título, autor, cota, palavra-chave, número (#123)…',
      'aria-label': 'Pesquisar',
      autocomplete: 'off',
      value: estado.q,
      oninput: (e) => {
        const antes = !!estado.q.trim()
        estado.q = e.target.value
        if (!antes && estado.q.trim()) estado.ordem = 'relevancia'
        if (antes && !estado.q.trim() && estado.ordem === 'relevancia') estado.ordem = estado.ordemGuardada
        aoEscrever()
      },
      onkeydown: (e) => {
        if (e.key === 'Enter') {
          aoEscrever.cancelar()
          executar()
        }
      },
    })

    const painelFiltros = h('div', { class: 'filtros' + (estado.filtrosAbertos ? '' : ' oculto') })
    const botaoFiltros = h('button', { class: 'botao', type: 'button', 'aria-expanded': String(estado.filtrosAbertos), onclick: () => {
      estado.filtrosAbertos = !estado.filtrosAbertos
      painelFiltros.classList.toggle('oculto', !estado.filtrosAbertos)
      botaoFiltros.setAttribute('aria-expanded', String(estado.filtrosAbertos))
    } })
    const rotuloFiltros = () => {
      const n = nFiltros()
      botaoFiltros.textContent = n ? `Filtros (${n})` : 'Filtros'
      botaoFiltros.classList.toggle('ativo', n > 0)
    }
    const mudou = () => {
      rotuloFiltros()
      executar()
    }
    const selTipo = h('select', { onchange: (e) => ((estado.filtros.tipo = e.target.value), mudou()) }, h('option', { value: '' }, 'Todos'), ordemTipos.map((t) => h('option', { value: t.id }, `${t.nome} (${numPT(contagemTipo[t.id])})`)))
    selTipo.value = estado.filtros.tipo
    const selNat = h('select', { onchange: (e) => ((estado.filtros.natureza = e.target.value), mudou()) }, h('option', { value: '' }, 'Todas'), h('option', { value: 'primária' }, 'Primária'), h('option', { value: 'secundária' }, 'Secundária'))
    selNat.value = estado.filtros.natureza
    const selEst = h('select', { onchange: (e) => ((estado.filtros.estado = e.target.value), mudou()) }, h('option', { value: '' }, 'Todos'), h('option', { value: 'completo' }, 'Completo'), h('option', { value: 'rever' }, 'Por rever'))
    selEst.value = estado.filtros.estado
    const aoAno = atraso(mudou, 300)
    const anoDe = h('input', { type: 'number', value: estado.filtros.anoDe, oninput: (e) => ((estado.filtros.anoDe = e.target.value.trim()), aoAno()) })
    const anoAte = h('input', { type: 'number', value: estado.filtros.anoAte, oninput: (e) => ((estado.filtros.anoAte = e.target.value.trim()), aoAno()) })
    anexar(
      painelFiltros,
      h(
        'div',
        { class: 'grelha' },
        h('label', { class: 'campo' }, h('span', {}, 'Tipo de fonte'), selTipo),
        h('label', { class: 'campo' }, h('span', {}, 'Natureza'), selNat),
        h('label', { class: 'campo' }, h('span', {}, 'Estado'), selEst),
        h('label', { class: 'campo' }, h('span', {}, 'Ano (de)'), anoDe),
        h('label', { class: 'campo' }, h('span', {}, 'Ano (até)'), anoAte)
      ),
      h(
        'div',
        { style: 'margin-top:10px' },
        h(
          'button',
          {
            class: 'botao-texto',
            type: 'button',
            onclick: () => {
              Object.assign(estado.filtros, { tipo: '', natureza: '', estado: '', anoDe: '', anoAte: '' })
              selTipo.value = selNat.value = selEst.value = ''
              anoDe.value = anoAte.value = ''
              mudou()
            },
          },
          'Limpar filtros'
        )
      )
    )
    rotuloFiltros()

    const caixaTexto = h('input', {
      type: 'checkbox',
      id: 'texto-integral',
      checked: estado.textoIntegral && temTextoIntegral,
      disabled: !temTextoIntegral,
      onchange: (e) => {
        estado.textoIntegral = e.target.checked
        if (!estado.textoIntegral) {
          buscaSeq++
          if (estado.busca && estado.busca.pararAgora) estado.busca.pararAgora()
          estado.busca = null
          estado.texto = []
          desenharLista()
          atualizarBusca()
        } else {
          procurarNoTexto()
        }
      },
    })

    const rotuloBusca = h('span', {})
    const parar = h('button', { class: 'botao pequeno', type: 'button', onclick: pararBusca }, 'Parar')
    const barra = h('div', {})
    const progresso = h('div', { class: 'progresso' }, barra)
    const aviso = h('div', { class: 'ajuda alerta oculto' })
    const caixaBusca = h('div', { class: 'busca-texto oculto' }, h('div', { class: 'linha-flex' }, rotuloBusca, parar), progresso, aviso)

    const resumo = h('span', {})
    const ordem = h('select', {
      'aria-label': 'Ordenar por',
      style: 'width:auto;padding:4px 8px;font-size:14px',
      onchange: (e) => {
        estado.ordem = e.target.value
        if (estado.ordem !== 'relevancia') {
          estado.ordemGuardada = estado.ordem
          guardar('ordem', estado.ordem)
        }
        reordenar()
      },
    })
    const lista = h('div', {})

    anexar(
      p,
      h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Fontes'), h('p', { class: 'subtitulo' }, 'A biblioteca de investigação, ensino e prática artística (só de leitura).'))),
      h('div', { class: 'pesquisa-principal' }, entradaQ, botaoFiltros),
      h('label', { class: 'opcao-texto' + (temTextoIntegral ? '' : ' desativada') }, caixaTexto, 'Procurar também no texto integral (mais lento)', temTextoIntegral ? null : h('span', { class: 'ajuda', style: 'margin:0' }, ' — esta cópia não inclui texto integral')),
      h('p', { class: 'ajuda', style: 'margin:6px 0 0' }, 'Dica: use aspas para uma expressão exacta, ex.: "basso continuo". Acentos e maiúsculas são ignorados; com várias palavras, todas têm de aparecer.'),
      painelFiltros,
      caixaBusca,
      h('div', { class: 'resumo-lista' }, h('span', { class: 'linha-flex' }, resumo, h('span', { style: 'color:var(--tinta-3)' }, '· ordenar por'), ordem)),
      lista
    )
    ui = { lista, resumo, ordem, ordemComTexto: null, caixaBusca, rotuloBusca, parar, barra, progresso, aviso, entradaQ }
    if (estado.sujo !== false || !estado.meta) {
      executar()
    } else {
      desenharLista()
      atualizarBusca()
    }
    if (!estado.q) entradaQ.focus({ preventScroll: true })
  }

  // ---------------------------------------------------------------------------
  // Vista «Ficha»

  function linha(rotulo, conteudo, classe) {
    if (conteudo === null || conteudo === undefined || conteudo === '' || (Array.isArray(conteudo) && !conteudo.length)) return null
    return [h('dt', {}, rotulo), h('dd', { class: classe || '' }, conteudo)]
  }
  function valorComLigacao(v) {
    const s = Array.isArray(v) ? v.join('; ') : String(v)
    if (eUrl(s)) return h('a', { href: s.trim(), target: '_blank', rel: 'noopener' }, s)
    return s
  }

  function notaHtml(n) {
    return h(
      'div',
      { class: 'nota' },
      h('div', { class: 'cabeca' }, n.localizacao ? h('strong', {}, n.localizacao) : null, n.tipo_nota ? h('span', { class: 'etiqueta' }, n.tipo_nota) : null),
      h(n.tipo_nota === 'Citação' ? 'blockquote' : 'div', { class: 'texto' }, n.texto || '')
    )
  }
  const ordemNotas = (a, b) => (a.ordem || 0) - (b.ordem || 0) || cmpS(String(a.criado || ''), String(b.criado || ''))

  function vistaFicha(numero) {
    const p = principal()
    const f = porNumero.get(numero)
    const volta = estado.q || nFiltros() ? `← Voltar aos resultados${estado.q ? ' (' + estado.q + ')' : ''}` : '← Voltar às fontes'
    anexar(p, h('a', { class: 'voltar', href: '#/fontes' }, volta))
    if (!f) {
      anexar(p, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, 'Ficha não encontrada'), `Esta cópia não tem nenhuma ficha com o número ${numeroFmt(numero)}.`)))
      return
    }
    const tipo = tiposPorId[f.tipo]
    const autores = f.autores.map((a) => h('span', { class: 'autor-item' }, nomeAutor(a, true), a.papel && a.papel !== 'autor' ? h('span', { class: 'papel' }, ' · ' + a.papel) : null))

    // Metadados com o rótulo do tipo (primeiro os campos do tipo, pela ordem do tipo; depois os que sobrarem)
    const campos = tipo && Array.isArray(tipo.campos) ? tipo.campos : []
    const vistos = new Set()
    const linhasMeta = []
    for (const c of campos) {
      vistos.add(c.chave)
      const v = f.metadados[c.chave]
      if (v === undefined || v === null || v === '') continue
      linhasMeta.push(linha(c.rotulo || c.chave, valorComLigacao(v), c.tipo === 'texto_longo' ? 'longo' : ''))
    }
    for (const [k, v] of Object.entries(f.metadados)) {
      if (vistos.has(k) || v === undefined || v === null || v === '') continue
      linhasMeta.push(linha(k.replace(/_/g, ' '), valorComLigacao(v)))
    }
    const doiLink = f.doi ? h('a', { href: 'https://doi.org/' + encodeURI(f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')), target: '_blank', rel: 'noopener' }, f.doi) : null
    const isbnTxt = f.isbn || null
    const urlLink = f.url ? (eUrl(f.url) ? h('a', { href: f.url.trim(), target: '_blank', rel: 'noopener' }, f.url) : f.url) : null

    const dl = h(
      'dl',
      { class: 'dados' },
      linha(f.autores.length > 1 ? 'Autores' : 'Autor', autores.length ? autores : null),
      linha('Data', f.data),
      linha('Tipo de fonte', tipo ? tipo.nome : null),
      linha('Natureza', f.natureza ? f.natureza.charAt(0).toUpperCase() + f.natureza.slice(1) : null),
      linha('Editora', f.editora),
      linha('Local', f.local),
      linha('Páginas', f.paginas > 0 ? numPT(f.paginas) : null),
      linha('DOI', doiLink),
      linha('ISBN', isbnTxt),
      linha('Endereço web', urlLink),
      linhasMeta
    )

    anexar(
      p,
      h(
        'div',
        { class: 'ficha' },
        h('h1', {}, f.titulo || 'Sem título'),
        h(
          'div',
          { class: 'linha-flex', style: 'margin-top:8px' },
          h('span', { class: 'etiqueta', title: 'Número permanente desta fonte' }, numeroFmt(f.numero)),
          f.estado === 'rever' ? h('span', { class: 'etiqueta rever', title: 'Os dados desta ficha ainda não foram confirmados' }, 'Por rever') : h('span', { class: 'etiqueta acento' }, 'Completo'),
          tipo ? h('span', { class: 'etiqueta' }, tipo.nome) : null
        )
      ),
      h('div', { class: 'caixa', style: 'margin-top:16px' }, dl.children.length ? dl : h('p', { class: 'ajuda', style: 'margin:0' }, 'Esta ficha não tem mais dados.'))
    )

    if (f.palavras_chave.length) {
      anexar(
        p,
        h('h3', {}, 'Palavras-chave'),
        h('div', { class: 'chips' }, f.palavras_chave.map((k) => h('button', { class: 'etiqueta acento', type: 'button', style: 'cursor:pointer;border:0', title: 'Pesquisar esta palavra-chave', onclick: () => pesquisarPalavra(k) }, k)))
      )
    }

    // Ficheiros
    const nomeDe = (c) => String(c).split('/').pop()
    const extDe = (c) => {
      const n = nomeDe(c)
      return n.includes('.') ? n.split('.').pop().toUpperCase() : ''
    }
    anexar(p, h('h3', {}, f.ficheiros.length > 1 ? `Ficheiros (${f.ficheiros.length})` : 'Ficheiros'))
    if (!f.ficheiros.length) {
      anexar(p, h('p', { class: 'ajuda', style: 'margin-top:0' }, 'Esta ficha não tem ficheiro nesta cópia.'))
    } else {
      anexar(
        p,
        h(
          'div',
          { class: 'caixa ficheiros-fonte' },
          f.ficheiros.map((x, i) =>
            h(
              'div',
              { class: 'linha-flex' },
              h('a', { href: urlFicheiro(x.caminho), target: '_blank', rel: 'noopener', title: x.caminho }, (i > 0 && x.rotulo) || nomeDe(x.caminho)),
              extDe(x.caminho) ? h('span', { class: 'etiqueta' }, extDe(x.caminho)) : null,
              i === 0 && f.ficheiros.length > 1 ? h('span', { class: 'ajuda', style: 'margin:0' }, 'principal') : null
            )
          )
        )
      )
    }

    // Fotografias originais
    if (f.originais.length) {
      anexar(p, h('h3', {}, 'Fotografias originais'), h('p', { class: 'ajuda', style: 'margin-top:-4px' }, 'As imagens tal como foram fotografadas, sem compressão. O ficheiro acima é só para ver.'))
      const caixa = h('div', { class: 'caixa' })
      for (const o of f.originais) {
        const imgs = Array.isArray(o.imagens) ? o.imagens : []
        const lista = h('div', { class: 'lista-imagens' })
        let feito = false
        const det = h(
          'details',
          {
            ontoggle: () => {
              // (a lista de ligações só se constrói quando se abre: pode haver centenas)
              if (!det.open || feito) return
              feito = true
              imgs.forEach((nome) => anexar(lista, h('a', { href: urlFicheiro(o.pasta + '/' + nome), target: '_blank', rel: 'noopener' }, nome)))
            },
          },
          h('summary', {}, `Ver as ${plural(imgs.length, 'imagem', 'imagens')}`),
          lista
        )
        anexar(
          caixa,
          h(
            'div',
            { class: 'pasta-originais' },
            h('div', { class: 'linha-flex' }, h('strong', {}, String(o.pasta).replace(/^_originais\//, '')), h('span', { class: 'ajuda', style: 'margin:0' }, `${plural(imgs.length, 'imagem', 'imagens')} · ${tamanhoTxt(o.tamanho || 0)}`)),
            imgs.length ? det : null
          )
        )
      }
      anexar(p, caixa)
    }

    // Notas de leitura da ficha
    const dasNotas = notas.filter((n) => n.fonte === f.id).sort(ordemNotas)
    if (dasNotas.length) {
      anexar(p, h('h3', {}, `Notas de leitura (${dasNotas.length})`), h('div', { class: 'caixa' }, dasNotas.map((n) => notaHtml(n))))
    }
  }

  // ---------------------------------------------------------------------------
  // Vista «Notas de leitura»

  function vistaNotas() {
    const p = principal()
    const lista = h('div', {})
    const desenhar = (q) => {
      limpar(lista)
      if (!notas.length) {
        anexar(lista, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, 'Sem notas'), 'Ainda não há notas de leitura nesta cópia.')))
        return
      }
      const termos = termosDe(q)
      const grupos = new Map()
      let n = 0
      for (const nota of notas) {
        const f = porId.get(nota.fonte)
        if (!f) continue
        if (termos.length) {
          const s = norm([nota.texto, nota.localizacao, nota.tipo_nota, f.titulo, autoresTexto(f.autores, 9)].join('\n'))
          if (!termos.every((t) => s.includes(t.t))) continue
        }
        if (!grupos.has(f.id)) grupos.set(f.id, [])
        grupos.get(f.id).push(nota)
        n++
      }
      if (!n) {
        anexar(lista, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, 'Nada encontrado'), 'Nenhuma nota corresponde a esta pesquisa.')))
        return
      }
      anexar(lista, h('p', { class: 'ajuda' }, `${plural(n, 'nota', 'notas')} em ${plural(grupos.size, 'fonte', 'fontes')}`))
      const ordenados = [...grupos.keys()].map((id) => porId.get(id)).sort((a, b) => a.numero - b.numero)
      for (const f of ordenados) {
        anexar(
          lista,
          h(
            'div',
            { class: 'grupo-notas' },
            h('div', { style: 'margin-bottom:6px' }, h('span', { class: 'numero' }, numeroFmt(f.numero)), h('a', { class: 'fonte-nota', href: '#/fonte/' + f.numero }, f.titulo || 'Sem título'), f.data ? h('span', { class: 'ajuda', style: 'margin-left:8px' }, f.data) : null),
            h('div', { class: 'caixa' }, grupos.get(f.id).sort(ordemNotas).map((nota) => notaHtml(nota)))
          )
        )
      }
    }
    const aoEscrever = atraso((q) => desenhar(q), 200)
    anexar(
      p,
      h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Notas de leitura'), h('p', { class: 'subtitulo' }, 'As notas de leitura de todas as fontes.'))),
      notas.length
        ? h('div', { class: 'pesquisa-principal' }, h('input', { type: 'search', placeholder: 'Pesquisar nas notas: texto, página, título da fonte…', 'aria-label': 'Pesquisar nas notas', autocomplete: 'off', oninput: (e) => aoEscrever(e.target.value) }))
        : null,
      lista
    )
    desenhar('')
  }

  // ---------------------------------------------------------------------------
  // Vista «Acerca»

  function vistaAcerca() {
    const p = principal()
    const comTexto = fichas.filter((f) => f.bloco_texto > 0).length
    const comFicheiro = fichas.filter((f) => f.ficheiros.length).length
    anexar(
      p,
      h(
        'div',
        { class: 'acerca' },
        h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Acerca'))),
        h('p', {}, 'Cópia só de leitura da biblioteca. Para alterar fichas, use a biblioteca no Mac.'),
        h(
          'div',
          { class: 'caixa' },
          h(
            'dl',
            { class: 'dados' },
            h('dt', {}, 'Exportada em'),
            h('dd', {}, dataExportacao(D.exportado_em)),
            h('dt', {}, 'Fichas'),
            h('dd', {}, numPT(fichas.length)),
            h('dt', {}, 'Com ficheiro'),
            h('dd', {}, numPT(comFicheiro)),
            h('dt', {}, 'Com texto integral'),
            h('dd', {}, numPT(comTexto)),
            h('dt', {}, 'Notas de leitura'),
            h('dd', {}, numPT(notas.length)),
            D.programa ? [h('dt', {}, 'Versão'), h('dd', {}, D.programa)] : null
          )
        ),
        h('p', { class: 'ajuda', style: 'margin-top:14px' }, 'Para abrir um ficheiro, a pasta «biblioteca» tem de estar ao lado de «Abrir TINCTORIS.html», como foi exportada.')
      )
    )
  }

  // ---------------------------------------------------------------------------
  // Estrutura e rotas

  const VISTAS = { fontes: 'Fontes', notas: 'Notas de leitura', acerca: 'Acerca' }
  const principalEl = h('main', { class: 'principal', id: 'principal' })
  const principal = () => limpar(principalEl)
  const nav = h(
    'nav',
    { class: 'nav' },
    Object.entries(VISTAS).map(([k, r]) => h('a', { href: '#/' + k, 'data-vista': k }, r))
  )

  function vistaAtual() {
    const v = location.hash.replace(/^#\/?/, '').split('/')[0].split('?')[0]
    if (v === 'fonte') return 'fonte'
    return VISTAS[v] ? v : 'fontes'
  }

  let vistaAnterior = null
  function rota() {
    const v = vistaAtual()
    if (vistaAnterior === 'fontes') estado.scrollY = window.scrollY
    ui = v === 'fontes' ? ui : null
    nav.querySelectorAll('a').forEach((a) => a.classList.toggle('ativo', a.dataset.vista === (v === 'fonte' ? 'fontes' : v)))
    if (v === 'fontes') {
      montarFontes()
      window.scrollTo(0, estado.scrollY || 0)
    } else {
      if (v === 'fonte') {
        const n = Number(location.hash.replace(/^#\/?/, '').split('/')[1])
        vistaFicha(n)
      } else if (v === 'notas') vistaNotas()
      else vistaAcerca()
      window.scrollTo(0, 0)
    }
    vistaAnterior = v
    document.title = 'TINCTORIS'
  }

  limpar(raiz)
  anexar(
    raiz,
    h('header', { class: 'topo' }, h('div', { class: 'topo-dentro' }, h('a', { class: 'marca-app', href: '#/fontes', title: 'Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários' }, 'TINCTORIS'), nav, h('span', { class: 'so-leitura' }, 'Cópia de leitura'))),
    principalEl
  )
  try {
    history.scrollRestoration = 'manual'
  } catch (_) {}
  estado.sujo = true
  window.addEventListener('hashchange', rota)
  if (!location.hash) {
    try {
      history.replaceState(null, '', '#/fontes')
    } catch (_) {
      location.hash = '#/fontes'
    }
  }
  rota()
})()
