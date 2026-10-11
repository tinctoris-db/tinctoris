'use strict'

// TINCTORIS — interface web (sem dependências além do SDK do PocketBase).

const pb = new PocketBase(location.origin)
pb.autoCancellation(false)

// ---------------------------------------------------------------------------
// Idiomas: os textos ficam em português no código; tr('…') devolve a tradução de idiomas/<idioma>.json
// (a chave é o próprio texto em português). Sem tradução, fica o português. {n}, {titulo}… = valores.
// Os valores guardados na base (tipos, papéis, opções) ficam sempre em português; só o que se mostra muda.
const IDIOMAS = { pt: 'Português', en: 'English' }
const IDIOMA = (() => {
  let i = null
  try {
    i = JSON.parse(localStorage.getItem('bib.idioma'))
  } catch (_) {}
  if (!IDIOMAS[i]) i = String(navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'
  return i
})()
const LOCALE = IDIOMA === 'pt' ? 'pt-PT' : 'en-GB'
const TRADUCOES = (() => {
  if (IDIOMA === 'pt') return {}
  try {
    // Pedido síncrono (ficheiro pequeno e local): as constantes abaixo já precisam das traduções.
    const x = new XMLHttpRequest()
    x.open('GET', 'idiomas/' + IDIOMA + '.json?v=' + Date.now(), false)
    x.send()
    if (x.status === 200) return JSON.parse(x.responseText)
  } catch (_) {}
  return {}
})()
document.documentElement.lang = IDIOMA === 'pt' ? 'pt-PT' : 'en'

function tr(texto, vars) {
  if (texto === null || texto === undefined) return texto
  let s = String(texto)
  if (IDIOMA !== 'pt' && TRADUCOES[s]) s = TRADUCOES[s]
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  return s
}

// Número com separadores do idioma (1 234 / 1,234).
const numTxt = (n, opcoes) => Number(n || 0).toLocaleString(LOCALE, opcoes)

// Muda o idioma da interface (guardado neste navegador e na base, para os outros aparelhos) e recarrega.
async function mudarIdioma(i) {
  if (!IDIOMAS[i] || i === IDIOMA) return
  guardarPreferencia('idioma', i)
  try {
    if (pb.authStore.isValid) await guardarDefinicao('idioma', i)
  } catch (_) {}
  location.reload()
}

function seletorIdioma() {
  return h(
    'div',
    { class: 'seletor-idioma linha-flex' },
    Object.entries(IDIOMAS).map(([i, nome]) =>
      h('button', { class: 'botao pequeno' + (i === IDIOMA ? ' primario' : ''), type: 'button', lang: i, onclick: () => mudarIdioma(i) }, nome)
    )
  )
}

const CONTEXTOS = ['Leitura e Interpretação de Fontes', 'Pesquisa Avançada em Música', 'Projecto Artístico e Tese', 'Ensino', 'Produção artística']
const PAPEIS = ['autor', 'compositor', 'arranjador', 'editor', 'tradutor', 'intérprete', 'maestro', 'realizador', 'destinatário', 'copista', 'construtor', 'organizador', 'compilador', 'produtor', 'libretista', 'ilustrador', 'entrevistador']
const TIPOS_NOTA = ['Citação', 'Paráfrase', 'Comentário', 'Idéia', 'Pergunta']
const CATEGORIAS = ['Escrita', 'Audiovisual', 'Instrumento', 'Digital', 'Outro']
const TIPOS_CAMPO = { texto: tr('Texto curto'), texto_longo: tr('Texto longo'), numero: tr('Número'), data: tr('Data'), url: tr('Endereço web'), lista: tr('Lista de opções'), sim_nao: tr('Sim / não') }
const LINGUAS_OCR = { por: tr('Português'), eng: tr('Inglês'), lat: tr('Latim'), ita: tr('Italiano'), fra: tr('Francês'), spa: tr('Espanhol'), deu: tr('Alemão') }
const ESTADOS = { completo: tr('Completo'), a_rever: tr('Por rever'), processando: tr('A processar'), erro: tr('Erro') }
const OCR_ESTADOS = { pendente: tr('OCR em fila'), em_curso: tr('OCR em curso'), feito: tr('OCR feito'), erro: tr('OCR falhou') }

// Tipos CSL (para citações) com explicação em português
const CSL_TIPOS = {
  book: tr('Livro'), chapter: tr('Capítulo'), 'article-journal': tr('Artigo de revista'), article: tr('Artigo / ensaio'), 'article-newspaper': tr('Artigo de jornal'),
  manuscript: tr('Manuscrito'), musical_score: tr('Partitura'), thesis: tr('Tese'), report: tr('Relatório'), pamphlet: tr('Folheto / programa'), legislation: tr('Legislação'),
  song: tr('Gravação sonora'), motion_picture: tr('Filme / vídeo'), broadcast: tr('Emissão'), performance: tr('Espectáculo'), event: tr('Evento'), interview: tr('Entrevista'),
  dataset: tr('Conjunto de dados'), software: tr('Software'), webpage: tr('Página web'), 'paper-conference': tr('Comunicação em congresso'), 'entry-encyclopedia': tr('Entrada de enciclopédia'),
  review: tr('Recensão'), graphic: tr('Imagem'), map: tr('Mapa'), personal_communication: tr('Comunicação pessoal'), document: tr('Documento genérico'),
}
// Variáveis CSL a que um campo pode corresponder (para aparecer nas citações)
const CSL_VARS = {
  '': tr('— não entra na citação —'), 'container-title': tr('Publicado em (revista, livro, álbum)'), 'collection-title': tr('Colecção / série'), volume: tr('Volume'), issue: tr('Número (fascículo)'),
  page: tr('Páginas'), 'number-of-pages': tr('Nº de páginas'), edition: tr('Edição'), number: tr('Número / nº de catálogo'), archive: tr('Arquivo'), 'archive-place': tr('Local do arquivo'),
  archive_collection: tr('Fundo'), 'call-number': tr('Cota'), medium: tr('Suporte / meio'), dimensions: tr('Dimensões / duração'), genre: tr('Género'), version: tr('Versão'),
  'event-title': tr('Evento'), 'event-place': tr('Local do evento'), 'event-date': tr('Data do evento'), accessed: tr('Data de acesso'), 'original-date': tr('Data original'), note: tr('Nota'), abstract: tr('Resumo'),
}
const PESQUISAS_EXTERNAS = [
  ['JSTOR', 'https://www.jstor.org/action/doBasicSearch?Query='],
  ['Google Scholar', 'https://scholar.google.com/scholar?q='],
  ['WorldCat', 'https://search.worldcat.org/search?q='],
  ['RISM', 'https://rism.online/search?q='],
  ['IMSLP', 'https://imslp.org/index.php?search='],
  ['Cantus', 'https://cantusdatabase.org/sources/?general='],
  ['BNP', 'https://catalogo.bnportugal.gov.pt/ipac20/ipac.jsp?profile=bn&index=.GW&term='],
  ['Europeana', 'https://www.europeana.eu/pt/search?query='],
  ['Internet Archive', 'https://archive.org/search?query='],
]

const estado = {
  tipos: [],
  tiposPorId: {},
  defs: {},
  defsRegistos: {},
  filtros: { q: '', autor: '', titulo: '', tipo: '', contexto: '', natureza: '', estado: '', anoDe: '', anoAte: '', tag: '', formatos: [], ordem: lerPreferencia('ordem', 'recentes') },
  limiteVisivel: 200,
  resultados: [],
  trechos: {},
  total: 0,
  pagina: 1,
  selecionados: new Set(),
  porRever: 0,
  painelAberto: false,
  filtrosVisiveis: false,
}

// ---------------------------------------------------------------------------
// Utilitários

function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'value') el.value = v
    else if (['checked', 'selected', 'disabled', 'multiple'].includes(k)) el[k] = !!v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue
    anexar(el, f instanceof Node ? f : String(f))
  }
  return el
}

// Como Element.append, mas ignora valores vazios (null, false, undefined).
function anexar(el, ...filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue
    el.append(f instanceof Node ? f : String(f))
  }
}

function toast(msg, erro) {
  const t = h('div', { class: 'aviso-toast' + (erro ? ' erro' : '') }, tr(msg))
  anexar(document.body, t)
  setTimeout(() => t.remove(), erro ? 6000 : 3000)
}

function mensagemErro(e) {
  const d = e?.response?.data
  if (d && typeof d === 'object') {
    const campos = Object.entries(d).map(([k, v]) => `${k}: ${v.message || v}`).join('; ')
    if (campos) return campos
  }
  return e?.response?.erro || e?.response?.message || e?.message || String(e)
}

function atraso(fn, ms) {
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

function nomeAutor(a, completo) {
  if (!a) return ''
  if (a.literal) return a.literal
  return completo ? [a.nome, a.apelido].filter(Boolean).join(' ') : a.apelido || a.nome || ''
}

function autoresTexto(autores, max = 3) {
  const lista = (Array.isArray(autores) ? autores : []).map((a) => nomeAutor(a, true) + (a.papel && a.papel !== 'autor' ? ` (${tr(a.papel)})` : ''))
  if (lista.length > max) return lista.slice(0, max).join('; ') + ' et al.'
  return lista.join('; ')
}

const numeroFmt = (n) => '#' + String(n).padStart(4, '0')

function trechoHtml(t) {
  const div = h('div', { class: 'trecho' })
  // Retira os marcadores de página do OCR ("[p. 12]") do excerto.
  const limpo = String(t || '').replace(/(^…?\s*\d*\]\s*)|\[p\. \d+\]\s*/g, '')
  const partes = limpo.split(/(\u0002[^\u0003]*\u0003)/)
  for (const p of partes) {
    if (p.startsWith('\u0002')) anexar(div, h('mark', {}, p.slice(1, -1)))
    else anexar(div, p)
  }
  return div
}

async function servico(acao, corpo) {
  return pb.send('/api/bib/servico/' + acao, corpo ? { method: 'POST', body: corpo } : { method: 'GET' })
}

function guardarPreferencia(k, v) {
  try {
    localStorage.setItem('bib.' + k, JSON.stringify(v))
  } catch (_) {}
}
function lerPreferencia(k, omissao) {
  try {
    const v = localStorage.getItem('bib.' + k)
    return v === null ? omissao : JSON.parse(v)
  } catch (_) {
    return omissao
  }
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'campo'
}

function selectTipos(valor, onchange, comVazio) {
  const s = h('select', { onchange })
  if (comVazio) anexar(s, h('option', { value: '' }, tr(comVazio)))
  for (const cat of CATEGORIAS) {
    const tipos = estado.tipos.filter((t) => (t.categoria || 'Outro') === cat)
    if (!tipos.length) continue
    const g = h('optgroup', { label: tr(cat) })
    tipos.forEach((tp) => anexar(g, h('option', { value: tp.id, selected: tp.id === valor }, tr(tp.nome))))
    anexar(s, g)
  }
  return s
}

function selectSimples(opcoes, valor, attrs) {
  const s = h('select', attrs || {})
  const pares = Array.isArray(opcoes) ? opcoes.map((o) => [o, o]) : Object.entries(opcoes)
  pares.forEach(([v, r]) => anexar(s, h('option', { value: v, selected: String(v) === String(valor ?? '') }, tr(r))))
  return s
}

function campo(rotulo, controlo, attrs) {
  return h('label', { class: 'campo ' + (attrs?.class || '') }, h('span', {}, typeof rotulo === 'string' ? tr(rotulo) : rotulo), controlo)
}

// ---------------------------------------------------------------------------
// Entrada / criação de conta

async function iniciar() {
  if (pb.authStore.isValid && pb.authStore.isSuperuser) {
    try {
      await pb.collection('_superusers').authRefresh()
      return montarApp()
    } catch (_) {
      pb.authStore.clear()
    }
  }
  // Neste computador entra-se diretamente; nos outros aparelhos aparece o ecrã de entrada
  try {
    const r = await pb.send('/api/bib/sessao-local', { method: 'POST' })
    pb.authStore.save(r.token, r.record)
    return montarApp()
  } catch (_) {}
  ecraEntrada()
}

async function ecraEntrada() {
  const raiz = document.getElementById('raiz')
  raiz.innerHTML = ''
  let info = { temConta: true, local: false }
  try {
    info = await pb.send('/api/bib/conta-estado', {})
  } catch (_) {}
  const erro = h('div', { class: 'mensagem-erro' })
  const email = h('input', { type: 'email', required: true, autocomplete: 'username' })
  const pass = h('input', { type: 'password', required: true, autocomplete: info.temConta ? 'current-password' : 'new-password', minlength: 8 })

  let conteudo
  if (!info.temConta && !info.local) {
    conteudo = [
      h('h1', { class: 'marca-entrada' }, 'TINCTORIS'),
      h('p', { class: 'subtitulo' }, tr('Ainda não existe uma conta. Crie-a no computador onde a biblioteca está instalada (abrindo esta página nesse computador) e depois volte aqui.')),
    ]
  } else if (!info.temConta) {
    conteudo = [
      h('h1', {}, tr('Criar a sua conta')),
      h('p', { class: 'subtitulo' }, tr('Primeira utilização. Esta conta fica só neste disco e protege a biblioteca de outros dispositivos na rede.')),
      h(
        'form',
        {
          onsubmit: async (ev) => {
            ev.preventDefault()
            erro.textContent = ''
            try {
              await pb.send('/api/bib/primeira-conta', { method: 'POST', body: { email: email.value.trim(), password: pass.value } })
              await pb.collection('_superusers').authWithPassword(email.value.trim(), pass.value)
              montarApp()
            } catch (e) {
              erro.textContent = mensagemErro(e)
            }
          },
        },
        campo(tr('Email'), email),
        campo(tr('Palavra-passe (mínimo 8 caracteres)'), pass),
        erro,
        h('button', { class: 'botao primario', type: 'submit' }, tr('Criar conta e entrar'))
      ),
    ]
  } else {
    conteudo = [
      h('h1', { class: 'marca-entrada' }, 'TINCTORIS'),
      h('p', { class: 'subtitulo' }, tr('Entre com a sua conta.')),
      h(
        'form',
        {
          onsubmit: async (ev) => {
            ev.preventDefault()
            erro.textContent = ''
            try {
              await pb.collection('_superusers').authWithPassword(email.value.trim(), pass.value)
              montarApp()
            } catch (e) {
              erro.textContent = tr('Email ou palavra-passe incorrectos.')
            }
          },
        },
        campo(tr('Email'), email),
        campo(tr('Palavra-passe'), pass),
        erro,
        h('button', { class: 'botao primario', type: 'submit' }, tr('Entrar'))
      ),
    ]
  }
  anexar(raiz, h('div', { class: 'ecra-entrada' }, h('div', { class: 'cartao-entrada' }, seletorIdioma(), conteudo)))
}

// ---------------------------------------------------------------------------
// Estrutura da aplicação

const VERSAO = '0.10.0-beta'
const REPOSITORIO = 'https://github.com/tinctoris-db/tinctoris'

const VISTAS = {
  fontes: { rotulo: tr('Fontes'), fn: () => vistaFontes() },
  rever: { rotulo: tr('Por rever'), fn: () => vistaRever() },
  duplicados: { rotulo: tr('Duplicados'), fn: () => vistaDuplicados() },
  notas: { rotulo: tr('Notas de leitura'), fn: () => vistaNotas() },
  importar: { rotulo: tr('Importar'), fn: () => vistaImportar() },
  tipos: { rotulo: tr('Tipos de fonte'), fn: () => vistaTipos() },
  atividade: { rotulo: tr('Actividade'), fn: () => vistaAtividade() },
  definicoes: { rotulo: tr('Definições'), fn: () => vistaDefinicoes() },
  ajuda: { rotulo: tr('Ajuda'), fn: () => vistaAjuda() },
  acerca: { rotulo: tr('Acerca'), fn: () => vistaAcerca() },
}

async function carregarTipos() {
  estado.tipos = await pb.collection('tipos_fonte').getFullList({ sort: 'ordem,nome' })
  estado.tiposPorId = Object.fromEntries(estado.tipos.map((t) => [t.id, t]))
}

async function carregarDefinicoes() {
  const lista = await pb.collection('definicoes').getFullList()
  estado.defs = Object.fromEntries(lista.map((r) => [r.chave, r.valor]))
  estado.defsRegistos = Object.fromEntries(lista.map((r) => [r.chave, r]))
}

// Datas de última atualização do código e dos dados (hora de Lisboa)
function dataHora(segundos) {
  if (!segundos) return '—'
  const p = Object.fromEntries(
    new Intl.DateTimeFormat(LOCALE, { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(segundos * 1000))
      .map((x) => [x.type, x.value])
  )
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

async function atualizarCarimbos() {
  const el = document.getElementById('carimbos')
  if (!el) return
  try {
    const i = await pb.send('/api/bib/info', {})
    el.innerHTML = ''
    anexar(
      el,
      h('div', { class: 'versao-app' }, h('strong', {}, tr('Versão')), ' · ', VERSAO),
      h('div', { class: 'carimbos-titulo' }, tr('Última actualização')),
      h('div', {}, h('strong', {}, tr('Dados')), ' · ', dataHora(i.dados)),
      h('div', {}, h('strong', {}, tr('Código')), ' · ', dataHora(i.codigo))
    )
    el.title = tr('Última actualização dos dados (fontes, notas, tipos) e do programa')
  } catch (_) {}
}

// Aviso quando o serviço pausou a watch folder (muitos ficheiros de uma vez)
async function verificarPausa() {
  let e
  try {
    e = await servico('estado')
  } catch (_) {
    return
  }
  let aviso = document.getElementById('aviso-pausa')
  if (!e?.entrada?.pausada) return aviso?.remove()
  if (!aviso) {
    aviso = h('div', { id: 'aviso-pausa', class: 'caixa destaque', style: 'margin-bottom:16px' })
    document.getElementById('principal')?.prepend(aviso)
  }
  aviso.innerHTML = ''
  anexar(
    aviso,
    h('strong', {}, tr('A watch folder recebeu {n} ficheiros de uma vez e está em pausa. ', { n: numTxt(e.entrada.pendentes) })),
    tr('Confirme que quer mesmo processá-los todos (podem ser, por exemplo, uma pasta de páginas web largada por engano).'),
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h('button', { class: 'botao primario', onclick: async () => (await servico('fila-retomar', {}), aviso.remove(), toast(tr('A processar.'))) }, tr('Processar todos')),
      h('button', { class: 'botao', onclick: async () => (await servico('fila-cancelar', {}), aviso.remove(), toast(tr('Cancelado. Os ficheiros ficam na watch folder; retire os que não quer e reinicie o TINCTORIS.'))) }, tr('Cancelar'))
    )
  )
}

// Aviso quando a pasta _duplicados ocupa mais do que o limite (10 %) do espaço das fontes
const gb = (b) => (b / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' GB'
// (ficheiros pequenos: em MB, para não aparecerem como «0 GB»)
const tamanhoTxt = (b) => (b >= 1e8 ? gb(b) : (b / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' MB')
let espacoDup = null
let espacoDupQuando = 0
let espacoDupAdiado = false
async function verificarEspaco() {
  let aviso = document.getElementById('aviso-espaco')
  if (espacoDupAdiado || vistaAtual() === 'duplicados') return aviso?.remove()
  if (!espacoDup || Date.now() - espacoDupQuando > 600000) {
    try {
      espacoDup = await servico('espaco-duplicados')
      espacoDupQuando = Date.now()
    } catch (_) {
      return
    }
  }
  const e = espacoDup
  if (!e?.acima) return aviso?.remove()
  if (!aviso) {
    aviso = h('div', { id: 'aviso-espaco', class: 'caixa destaque', style: 'margin-bottom:16px' })
    document.getElementById('principal')?.prepend(aviso)
  }
  aviso.innerHTML = ''
  anexar(
    aviso,
    h('strong', {}, tr('Os duplicados ocupam {tamanho}: {pct}% do espaço das fontes (o limite é {limite}%). ', { tamanho: gb(e.duplicados_bytes), pct: numTxt(e.percentagem), limite: e.limite })),
    tr('Reveja-os para libertar espaço. Só vão para o Lixo do Mac os que têm uma cópia igual na biblioteca, e só quando carregar no botão.'),
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h('a', { class: 'botao primario', href: '#/duplicados' }, tr('Rever duplicados')),
      h('button', { class: 'botao', onclick: () => ((espacoDupAdiado = true), aviso.remove()) }, tr('Lembrar mais tarde'))
    )
  )
}

// Secção "Espaço ocupado" do ecrã Duplicados: medição, verificação, Lixo e lista "por ver" (os maiores primeiro)
function secaoEspaco() {
  const caixa = h('div', { class: 'caixa', style: 'margin-bottom:20px' })
  let temporizador = null
  const desenhar = async () => {
    clearTimeout(temporizador)
    let e
    try {
      e = await servico('espaco-duplicados')
    } catch (err) {
      caixa.innerHTML = ''
      anexar(caixa, h('h3', { style: 'margin-top:0' }, tr('Espaço ocupado pelos duplicados')), /desconhecida/i.test(mensagemErro(err)) ? tr('Esta parte fica activa depois de reiniciar o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).') : tr('O serviço de fundo não respondeu: {erro}', { erro: mensagemErro(err) }))
      return
    }
    espacoDup = e
    espacoDupQuando = Date.now()
    caixa.innerHTML = ''
    const v = e.verificacao
    anexar(
      caixa,
      h('h3', { style: 'margin-top:0' }, tr('Espaço ocupado pelos duplicados')),
      h('p', { style: 'margin-top:0' }, h('strong', {}, `${gb(e.duplicados_bytes)}`), tr(' em {n} ficheiros (pasta _duplicados): ', { n: numTxt(e.duplicados_ficheiros) }), h('strong', { style: e.acima ? 'color:var(--erro)' : '' }, `${numTxt(e.percentagem)}%`), tr(' do espaço das fontes ({tamanho}). Aviso acima de {limite}%.', { tamanho: gb(e.fontes_bytes), limite: e.limite }))
    )
    if (e.a_verificar) {
      const a = e.a_verificar
      const pct = a.total ? Math.round((100 * a.feitos) / a.total) : 0
      anexar(caixa, h('div', {}, `${tr('A verificar:')} ${a.fase}… ${a.total ? tr('{feitos} de {total}', { feitos: numTxt(a.feitos), total: numTxt(a.total) }) : ''}`), h('div', { class: 'progresso' }, h('div', { style: `width:${pct}%` })))
      temporizador = setTimeout(() => vistaAtual() === 'duplicados' && desenhar(), 3000)
      return
    }
    const verificar = h('button', { class: v ? 'botao' : 'botao primario', onclick: async () => (await servico('espaco-verificar', {}), desenhar()) }, v ? tr('Verificar de novo') : tr('Verificar agora'))
    if (!v) {
      anexar(caixa, h('p', {}, tr('A verificação compara o conteúdo de cada ficheiro com a biblioteca (a primeira vez demora alguns minutos; o resto da biblioteca continua a funcionar).')), verificar)
      return
    }
    const lista = h('div', {})
    anexar(
      caixa,
      h('p', { class: 'ajuda', style: 'margin-top:0' }, tr('Última verificação: {data}', { data: new Date(v.feita_em).toLocaleString(LOCALE) })),
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;margin-bottom:12px' },
        h(
          'div',
          { class: 'caixa' },
          h('div', {}, h('strong', {}, tr('Seguros: ')), tr('{n} ficheiros, {tamanho}', { n: numTxt(v.seguros), tamanho: gb(v.seguros_bytes) })),
          h('div', { class: 'ajuda' }, tr('Têm uma cópia igual na biblioteca (ou são PDFs quase iguais já juntados).')),
          v.seguros
            ? h(
                'button',
                {
                  class: 'botao primario',
                  style: 'margin-top:8px',
                  onclick: async (ev) => {
                    if (!confirm(tr('Pôr no Lixo do Mac {n} ficheiros ({tamanho})?\n\nCada um é confirmado outra vez antes de sair. Ficam numa pasta «Duplicados …» no Lixo e podem ser recuperados até esvaziar o Lixo.', { n: numTxt(v.seguros), tamanho: gb(v.seguros_bytes) }))) return
                    ev.target.disabled = true
                    ev.target.textContent = tr('A pôr no Lixo…')
                    try {
                      const r = await servico('espaco-lixo', {})
                      toast(tr('{n} ficheiros ({tamanho}) no Lixo, pasta «{pasta}».', { n: numTxt(r.movidos), tamanho: gb(r.bytes), pasta: r.lixo }) + (r.saltados ? ' ' + tr('{n} ficaram (mudaram desde a verificação).', { n: r.saltados }) : ''))
                    } catch (err) {
                      toast(mensagemErro(err), true)
                    }
                    espacoDupAdiado = false
                    desenhar()
                  },
                },
                tr('Pôr no Lixo do Mac ({tamanho})', { tamanho: gb(v.seguros_bytes) })
              )
            : null
        ),
        h(
          'div',
          { class: 'caixa' },
          h('div', {}, h('strong', {}, tr('Por ver: ')), tr('{n} ficheiros, {tamanho}', { n: numTxt(v.por_ver), tamanho: gb(v.por_ver_bytes) })),
          h('div', { class: 'ajuda' }, tr('Sem cópia igual na biblioteca: decida um a um (os maiores primeiro).')),
          v.por_ver ? h('button', { class: 'botao', style: 'margin-top:8px', onclick: () => mostrarPorVer(lista) }, tr('Ver a lista')) : null
        )
      ),
      verificar,
      lista
    )
  }
  desenhar()
  return caixa
}

async function mostrarPorVer(lista) {
  lista.innerHTML = tr('A carregar…')
  let r
  try {
    r = await servico('espaco-por-ver')
  } catch (e) {
    lista.innerHTML = ''
    return toast(mensagemErro(e), true)
  }
  lista.innerHTML = ''
  const acao = async (rota, x, linha, msg) => {
    try {
      await servico(rota, { ficheiro: x.ficheiro })
      if (msg) {
        linha.remove()
        toast(msg)
      }
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }
  // Grupos pela comparação das páginas com a ficha com que o ficheiro se confundiu (verificação feita pelo serviço)
  const grupoDe = (x) => (!x.ficha ? 'sem_ficha' : x.comparacao?.resultado || 'sem_comparacao')
  const GRUPOS = {
    diferente: tr('Páginas diferentes (provavelmente não são duplicados)'),
    parecido: tr('Muito parecidos'),
    sem_comparacao: tr('Sem comparação possível'),
    sem_ficha: tr('Sem ficha conhecida'),
  }
  const contagem = {}
  for (const x of r.lista) contagem[grupoDe(x)] = (contagem[grupoDe(x)] || 0) + 1
  let filtro = ''
  const corpo = h('div', {})
  const filtros = h('div', { class: 'linha-flex', style: 'gap:6px;margin:8px 0' })
  const desenharFiltros = () => {
    filtros.innerHTML = ''
    const botao = (k, rotulo, n) => h('button', { class: 'botao pequeno' + (filtro === k ? ' primario' : ''), onclick: () => ((filtro = k), desenharFiltros(), desenharLinhas()) }, `${rotulo} (${numTxt(n)})`)
    anexar(filtros, botao('', tr('Todos'), r.lista.length), Object.entries(GRUPOS).filter(([k]) => contagem[k]).map(([k, rotulo]) => botao(k, rotulo, contagem[k])))
  }
  const desenharLinhas = () => {
    corpo.innerHTML = ''
    anexar(corpo, r.lista.filter((x) => !filtro || grupoDe(x) === filtro).map(linhaPorVer))
  }
  const linhaPorVer = (x) => {
    const linha = h('div', { style: 'border-top:1px solid var(--linha);padding:8px 0' })
    const painel = h('div', { style: 'display:none' })
    const g = grupoDe(x)
    const lixo = async () => {
      const aviso = g === 'diferente' ? tr('\n\nAs páginas são DIFERENTES das da ficha {num}: provavelmente não é um duplicado.', { num: numeroFmt(x.ficha.numero) }) : tr('\nNão tem cópia igual na biblioteca.')
      if (!confirm(tr('Pôr no Lixo do Mac «{nome}» ({tamanho})?', { nome: x.ficheiro.split('/').pop(), tamanho: tamanhoTxt(x.tamanho) }) + aviso)) return
      await servico('espaco-lixo', { ficheiros: [x.ficheiro] })
        .then(() => (linha.remove(), toast(tr('No Lixo do Mac.'))))
        .catch((e) => toast(mensagemErro(e), true))
    }
    anexar(
      linha,
      h(
        'div',
        { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center' },
        h('strong', { style: 'min-width:70px' }, tamanhoTxt(x.tamanho)),
        h('span', { style: 'flex:1 1 280px;word-break:break-all' }, x.ficheiro.replace(/^_duplicados\//, '')),
        h(
          'span',
          { class: 'linha-flex', style: 'gap:6px;flex-wrap:wrap' },
          h('button', { class: 'botao pequeno primario', onclick: () => alternarComparacao(x, painel) }, tr('Comparar')),
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-abrir', x, linha) }, tr('Abrir')),
          h('button', { class: 'botao pequeno', onclick: () => servico('espaco-abrir', { ficheiro: x.ficheiro, finder: true }).catch((e) => toast(mensagemErro(e), true)) }, tr('Mostrar no Finder')),
          h('button', { class: 'botao pequeno', onclick: lixo }, tr('Pôr no Lixo')),
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-devolver', x, linha, tr('Devolvido à watch folder: vai ter ficha própria.')) }, tr('Devolver à biblioteca')),
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-manter', x, linha, tr('Fica em _duplicados.')) }, tr('Manter'))
        )
      ),
      h('div', { class: 'ajuda', style: 'margin-left:82px' }, porqueAqui(x)),
      painel
    )
    return linha
  }
  anexar(
    lista,
    h('h3', {}, r.total > r.lista.length ? tr('Por ver ({n}; mostrados os {m} maiores)', { n: numTxt(r.total), m: r.lista.length }) : tr('Por ver ({n})', { n: numTxt(r.total) })),
    h('p', { class: 'ajuda', style: 'margin-top:0' }, tr('«Comparar» mostra lado a lado uma página deste ficheiro e a mesma página da ficha com que foi confundido. «Abrir» e «Mostrar no Finder» funcionam no Mac onde a biblioteca está. «Devolver à biblioteca» põe o ficheiro na watch folder, para ter ficha própria. «Manter» deixa-o em _duplicados e tira-o desta lista.')),
    r.lista.some((x) => 'ficha' in x) ? filtros : h('p', { class: 'ajuda' }, tr('Carregue em «Verificar de novo» para saber com que ficha cada ficheiro foi confundido e comparar as páginas.')),
    corpo
  )
  desenharFiltros()
  desenharLinhas()
}

// Porque está um ficheiro em _duplicados, com que ficha se confundiu e o que diz a comparação das páginas
function porqueAqui(x) {
  const MOTIVOS = {
    mesma_obra: tr('Posto de parte por ter sido identificado como a mesma obra de'),
    mesmas_fotografias: tr('Posto de parte por ter as mesmas fotografias de'),
    copia_exata: tr('Era cópia exacta do ficheiro de'),
    copia_exata_extra: tr('Era cópia exacta de um ficheiro adicional de'),
    quase_igual: tr('Juntado como quase igual a'),
    originais_repetidos: tr('Fotografias originais repetidas'),
  }
  const PISTAS = { 'título': tr('Ficha com o mesmo título:'), '1.ª página parecida': tr('Origem desconhecida; ficha com a 1.ª página mais parecida:'), 'nome do ficheiro parecido': tr('Origem desconhecida; ficha com nome de ficheiro parecido:') }
  const partes = []
  const f = x.ficha
  const fichaTxt = f ? `${numeroFmt(f.numero)} «${f.titulo || tr('sem título')}»` : ''
  if (x.origem && f && f.pista !== '1.ª página parecida' && f.pista !== 'nome do ficheiro parecido') partes.push(`${MOTIVOS[x.origem.motivo] || tr('Posto de parte:')} ${fichaTxt}.`)
  else if (x.origem && !f) partes.push(tr('{motivo}{titulo} — essa ficha já não existe.', { motivo: MOTIVOS[x.origem.motivo] || tr('Posto de parte'), titulo: x.origem.titulo ? ` «${x.origem.titulo}»` : '' }))
  else if (f) partes.push(`${PISTAS[f.pista] || tr('Ficha parecida:')} ${fichaTxt}.`)
  else if ('ficha' in x) partes.push(tr('Origem desconhecida e nenhuma ficha parecida.'))
  else if (x.talvez?.length) partes.push(tr('Nome parecido com {numeros}.', { numeros: x.talvez.map(numeroFmt).join(', ') }))
  const c = x.comparacao
  if (c) {
    const pp = c.paginas?.length ? tr(' ({a} e {b} páginas)', { a: c.paginas[0], b: c.paginas[1] }) : ''
    const txt = { diferente: tr('Páginas diferentes{pp}: provavelmente não é um duplicado.', { pp }), parecido: tr('Páginas muito parecidas{pp}: veja as duas antes de decidir.', { pp }), sem_comparacao: tr('Não foi possível comparar as páginas (não é PDF ou não se lê).') }[c.resultado]
    if (txt) partes.push(c.resultado === 'diferente' ? h('strong', {}, ' ' + txt) : ' ' + txt)
  }
  return partes.map((p) => (typeof p === 'string' ? document.createTextNode(p + ' ') : p))
}

// Painel com as duas páginas lado a lado (pedidas ao serviço como imagens pequenas)
function alternarComparacao(x, painel) {
  if (painel.style.display !== 'none') return (painel.style.display = 'none')
  painel.style.display = ''
  let p = 1
  const f = x.ficha
  const maximo = Math.max(...(x.comparacao?.paginas || [1]), 1)
  const imagens = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px' })
  const rotuloPagina = h('span', {})
  const lado = (titulo, src, extra) =>
    h(
      'div',
      { class: 'caixa', style: 'min-width:0;display:flex;flex-direction:column;gap:6px' },
      h('div', { style: 'font-weight:600;word-break:break-word' }, titulo),
      src ? h('img', { src, alt: titulo, style: 'width:100%;height:auto;border:1px solid var(--linha);border-radius:6px;background:#fff' }) : h('div', { class: 'ajuda' }, tr('Sem imagem desta página.')),
      extra
    )
  const carregar = async () => {
    rotuloPagina.textContent = maximo > 1 ? tr('Página {p} de {max}', { p, max: maximo }) : tr('Página {p}', { p })
    imagens.innerHTML = tr('A preparar as páginas…')
    try {
      const r = await servico('espaco-comparar', { ficheiro: x.ficheiro, numero: f?.numero, p })
      imagens.innerHTML = ''
      const url = f && `/api/bib/ficheiro/${f.id}?token=${encodeURIComponent(pb.authStore.token)}`
      anexar(
        imagens,
        lado(tr('Este ficheiro (_duplicados)'), r.duplicado),
        f
          ? lado(
              tr('Ficha {num} «{titulo}»', { num: numeroFmt(f.numero), titulo: f.titulo || tr('sem título') }),
              r.ficha,
              h('div', { class: 'linha-flex', style: 'gap:6px' }, h('a', { class: 'botao pequeno', href: '#', onclick: (e) => (e.preventDefault(), abrirFonte(f.id)) }, tr('Ver ficha')), h('a', { class: 'botao pequeno', href: url, target: '_blank' }, tr('Abrir o ficheiro da ficha')))
            )
          : h('div', { class: 'caixa ajuda' }, tr('Não se sabe com que ficha foi confundido.'))
      )
    } catch (e) {
      imagens.innerHTML = ''
      toast(mensagemErro(e), true)
    }
  }
  painel.innerHTML = ''
  anexar(
    painel,
    h(
      'div',
      { class: 'linha-flex', style: 'gap:6px;margin:8px 0' },
      h('button', { class: 'botao pequeno', onclick: () => p > 1 && (p--, carregar()) }, '◀'),
      rotuloPagina,
      h('button', { class: 'botao pequeno', onclick: () => p < maximo && (p++, carregar()) }, '▶')
    ),
    imagens
  )
  carregar()
}

async function atualizarContagem() {
  atualizarCarimbos()
  try {
    const r = await pb.collection('fontes').getList(1, 1, { filter: "estado = 'a_rever'", fields: 'id' })
    estado.porRever = r.totalItems
    const c = document.getElementById('contagem-rever')
    if (c) {
      c.textContent = r.totalItems
      c.classList.toggle('oculto', !r.totalItems)
    }
  } catch (_) {}
}

async function montarApp() {
  await Promise.all([carregarTipos(), carregarDefinicoes()])
  // Idioma escolhido noutro aparelho (fica guardado na base): segue-o.
  if (IDIOMAS[estado.defs.idioma] && estado.defs.idioma !== IDIOMA) {
    guardarPreferencia('idioma', estado.defs.idioma)
    return location.reload()
  }
  const raiz = document.getElementById('raiz')
  raiz.innerHTML = ''
  const lateral = h(
    'aside',
    { class: 'lateral', id: 'lateral' },
    h('div', { class: 'marca-app' }, 'TINCTORIS', h('small', {}, tr('Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários'))),
    h(
      'nav',
      { class: 'nav' },
      h('a', { href: '#/fontes', 'data-vista': 'fontes' }, tr('Fontes')),
      h('a', { href: '#/rever', 'data-vista': 'rever' }, tr('Por rever'), h('span', { class: 'contagem oculto', id: 'contagem-rever' }, '0')),
      h('a', { href: '#/duplicados', 'data-vista': 'duplicados' }, tr('Duplicados')),
      h('a', { href: '#/notas', 'data-vista': 'notas' }, tr('Notas de leitura')),
      h('a', { href: '#', onclick: (e) => (e.preventDefault(), abrirFonte(null)) }, tr('+ Nova fonte')),
      h('a', { href: '#/importar', 'data-vista': 'importar' }, tr('Importar')),
      h('div', { class: 'separador' }),
      h('a', { href: '#/tipos', 'data-vista': 'tipos' }, tr('Tipos de fonte')),
      h('a', { href: '#/atividade', 'data-vista': 'atividade' }, tr('Actividade')),
      h('a', { href: '#/definicoes', 'data-vista': 'definicoes' }, tr('Definições')),
      h('a', { href: '#/ajuda', 'data-vista': 'ajuda' }, tr('Ajuda')),
      h('a', { href: '#/acerca', 'data-vista': 'acerca' }, tr('Acerca'))
    ),
    h('div', { class: 'carimbos', id: 'carimbos', style: 'margin-top:auto' }),
    h(
      'div',
      { class: 'rodape', style: 'margin-top:0' },
      h('button', { class: 'enviar-comentario', onclick: enviarComentario, title: tr('Algo não funciona, podia funcionar melhor ou falta? Diga-nos.') }, tr('Enviar comentário')),
      h('div', {}, pb.authStore.record?.email || ''),
      h('button', { onclick: () => (pb.authStore.clear(), ecraEntrada()) }, tr('Sair'))
    )
  )
  const principal = h('main', { class: 'principal', id: 'principal' })
  const barra = h(
    'div',
    { class: 'barra-movel' },
    h('button', { onclick: () => lateral.classList.toggle('aberta') }, '☰'),
    h('span', {}, 'TINCTORIS')
  )
  anexar(raiz, h('div', { class: 'app' }, lateral, h('div', { style: 'min-width:0;overflow:auto' }, barra, principal)))
  lateral.addEventListener('click', (e) => {
    if (e.target.closest('a')) lateral.classList.remove('aberta')
  })

  window.onhashchange = rota
  rota()
  atualizarContagem()
  setInterval(atualizarCarimbos, 60000)
  verificarPausa()
  setInterval(verificarPausa, 15000)
  boasVindas()

  // Atualizações em tempo real (ex.: ficheiros novos processados pelo serviço)
  const aoMudar = atraso(() => {
    atualizarContagem()
    // Atualiza a lista discretamente, sem interromper quem está a escrever ou a editar.
    if (estado.painelAberto || document.activeElement?.matches('input, textarea, select')) return
    const vista = vistaAtual()
    if (vista === 'fontes' && estado.atualizarListaEmSilencio) estado.atualizarListaEmSilencio()
    else if (vista === 'rever') vistaRever()
  }, 1500)
  pb.collection('fontes').subscribe('*', aoMudar).catch(() => {})
}

function vistaAtual() {
  const v = location.hash.replace(/^#\//, '').split('?')[0]
  return VISTAS[v] ? v : 'fontes'
}

let pararAtividade = null
function rota() {
  if (pararAtividade) {
    pararAtividade()
    pararAtividade = null
  }
  // Mudar de página fecha o painel aberto (perguntando antes se houver alterações).
  const painel = document.getElementById('painel')
  if (painel) {
    const aoFechar = painel._aoFechar
    painel._aoFechar = null
    fecharPainel()
    if (aoFechar && painel._alterado?.() && confirm(tr('Há alterações por guardar na ficha que estava aberta. Guardar agora?'))) painel._guardar?.()
  }
  const v = vistaAtual()
  document.querySelectorAll('.nav a[data-vista]').forEach((a) => a.classList.toggle('ativo', a.dataset.vista === v))
  VISTAS[v].fn()
}

function principal() {
  const p = document.getElementById('principal')
  p.innerHTML = ''
  setTimeout(verificarPausa, 0)
  setTimeout(verificarEspaco, 0)
  return p
}

// ---------------------------------------------------------------------------
// Fontes: pesquisa e lista

// Formatos do ficheiro principal da ficha (filtro «Formato do ficheiro», pode marcar vários)
const FORMATOS = {
  pdf: ['PDF', ['pdf']],
  word: ['Word', ['doc', 'docx']],
  rtf: ['RTF', ['rtf']],
  texto: [tr('Texto simples'), ['txt', 'md']],
  documento: [tr('Outros documentos (Pages, ODT, DjVu)'), ['pages', 'odt', 'djvu']],
  epub: ['EPUB', ['epub']],
  finale: ['Finale', ['mus', 'musx']],
  sibelius: ['Sibelius', ['sib']],
  partitura: [tr('Outras partituras (MusicXML, MuseScore, Dorico…)'), ['musicxml', 'mxl', 'mscz', 'mscx', 'dorico', 'mei', 'ly', 'gp', 'gpx']],
  midi: ['MIDI', ['mid', 'midi']],
  imagem: [tr('Imagem'), ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'gif', 'webp', 'heic']],
  audio: [tr('Áudio'), ['mp3', 'wav', 'flac', 'aif', 'aiff', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'alac']],
  video: [tr('Vídeo'), ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm', 'mpg', 'mpeg', 'wmv']],
  nenhum: [tr('Sem ficheiro'), []],
}

// (devolve a condição e acrescenta os valores a params; «nome.pdf» acaba em «.pdf», maiúsculas ignoradas)
function condicaoFormatos(formatos, params) {
  const ou = []
  for (const k of formatos) {
    if (k === 'nenhum') ou.push("ficheiro = ''")
    for (const ext of FORMATOS[k]?.[1] || []) {
      const chave = `fmt${Object.keys(params).length}`
      params[chave] = `%.${ext}`
      ou.push(`ficheiro ~ {:${chave}}`)
    }
  }
  return ou.length ? `(${ou.join(' || ')})` : ''
}

function filtroBase() {
  const f = estado.filtros
  const partes = []
  const params = {}
  if (f.tipo) (partes.push('tipo = {:tipo}'), (params.tipo = f.tipo))
  if (f.contexto) (partes.push('contextos ?= {:ctx}'), (params.ctx = f.contexto))
  if (f.natureza) (partes.push('natureza = {:nat}'), (params.nat = f.natureza))
  if (f.estado) (partes.push('estado = {:est}'), (params.est = f.estado))
  if (f.anoDe) (partes.push('ano >= {:de}'), (params.de = Number(f.anoDe)))
  if (f.anoAte) (partes.push('ano <= {:ate}'), (params.ate = Number(f.anoAte)))
  if (f.tag) (partes.push('tags ~ {:tag}'), (params.tag = f.tag))
  if (f.formatos?.length) partes.push(condicaoFormatos(f.formatos, params))
  return { partes, params }
}

const CAMPOS_LISTA = 'id,numero,titulo,autores,data,ano,tipo,contextos,natureza,estado,tags,palavras_chave,ficheiro,ficheiros_extra,ocr_estado,editora,created'

// ---- Ordenação como num catálogo: sem maiúsculas/acentos, sem artigos iniciais, sem data no fim

const ORDENS = {
  recentes: tr('Mais recentes'),
  numero: tr('Número (#)'),
  titulo: tr('Título (A → Z)'),
  '-titulo': tr('Título (Z → A)'),
  autor: tr('Autor (A → Z)'),
  '-autor': tr('Autor (Z → A)'),
  data: tr('Data (antiga → recente)'),
  '-data': tr('Data (recente → antiga)'),
}
const colador = new Intl.Collator(LOCALE, { sensitivity: 'base', numeric: true, ignorePunctuation: true })
const ARTIGOS = /^(the|an?|os?|as?|uma?|uns|umas|l'|le|la|les|il|lo|gli|i|el|los|las|der|die|das|ein|eine)\s+|^l'/i

function chaveTitulo(t) {
  return String(t || '').replace(/^[\s"'«»“”‘’(\[¿¡]+/, '').replace(ARTIGOS, '').trim()
}
function chaveAutor(r) {
  const autores = Array.isArray(r.autores) ? r.autores : []
  const a = autores.find((x) => ['autor', 'compositor', 'construtor', 'realizador'].includes(x.papel || 'autor')) || autores[0]
  return a ? a.literal || [a.apelido, a.nome].filter(Boolean).join(' ') : ''
}
function chaveData(r) {
  const m = /(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(r.data || '')
  return m ? Number(m[1]) * 10000 + Number(m[2] || 0) * 100 + Number(m[3] || 0) : null
}

function ordenar(lista, ordem) {
  const inv = ordem.startsWith('-') ? -1 : 1
  const campo = ordem.replace(/^-/, '')
  const porTitulo = (a, b) => {
    const x = chaveTitulo(a.titulo).replace(/[^\p{L}\p{N}]/gu, '') ? chaveTitulo(a.titulo) : ''
    const y = chaveTitulo(b.titulo).replace(/[^\p{L}\p{N}]/gu, '') ? chaveTitulo(b.titulo) : ''
    if (!x !== !y) return x ? -1 : 1 // sem título sempre no fim
    return colador.compare(x, y)
  }
  const cmp = {
    recentes: (a, b) => String(b.created).localeCompare(String(a.created)),
    numero: (a, b) => inv * ((a.numero || 0) - (b.numero || 0)),
    titulo: (a, b) => {
      const vazio = (r) => !chaveTitulo(r.titulo).replace(/[^\p{L}\p{N}]/gu, '')
      if (vazio(a) !== vazio(b)) return vazio(a) ? 1 : -1
      return inv * porTitulo(a, b)
    },
    autor: (a, b) => {
      const x = chaveAutor(a)
      const y = chaveAutor(b)
      if (!x !== !y) return x ? -1 : 1 // sem autor sempre no fim
      return inv * colador.compare(x, y) || porTitulo(a, b)
    },
    data: (a, b) => {
      const x = chaveData(a)
      const y = chaveData(b)
      if ((x === null) !== (y === null)) return x === null ? 1 : -1 // sem data sempre no fim
      return inv * ((x || 0) - (y || 0)) || porTitulo(a, b)
    },
  }[campo]
  return cmp ? lista.slice().sort(cmp) : lista
}

async function pesquisar() {
  const f = estado.filtros
  const { partes, params } = filtroBase()
  estado.trechos = {}
  const comTexto = !!(f.q || f.autor || f.titulo)
  let out = []
  const porNumero = /^\s*#?\s*(\d{1,6})\s*$/.exec(f.q || '')
  if (porNumero && !f.autor && !f.titulo) {
    out = await pb.collection('fontes').getFullList({ filter: pb.filter('numero = {:n}', { n: Number(porNumero[1]) }), fields: CAMPOS_LISTA })
    if (out.length) {
      estado.resultados = out
      estado.total = out.length
      return
    }
  }
  if (comTexto) {
    const fts = await pb.send('/api/bib/pesquisa', { query: { q: f.q, autor: f.autor, titulo: f.titulo, limite: 5000 } })
    const ids = fts.map((r) => r.id)
    fts.forEach((r) => (estado.trechos[r.id] = r.trecho))
    for (let i = 0; i < ids.length; i += 80) {
      const bloco = ids.slice(i, i + 80)
      const p = { ...params }
      const ou = bloco.map((id, j) => ((p['i' + j] = id), `id = {:i${j}}`)).join(' || ')
      const filtro = pb.filter([`(${ou})`, ...partes].join(' && '), p)
      out.push(...(await pb.collection('fontes').getFullList({ filter: filtro, fields: CAMPOS_LISTA })))
    }
    const posicao = new Map(ids.map((id, i) => [id, i]))
    out.sort((a, b) => posicao.get(a.id) - posicao.get(b.id))
  } else {
    out = await pb.collection('fontes').getFullList({ filter: partes.length ? pb.filter(partes.join(' && '), params) : '', fields: CAMPOS_LISTA, batch: 1000 })
  }
  // "Relevância" só faz sentido numa pesquisa por texto
  if (f.ordem === 'relevancia' && !comTexto) f.ordem = 'recentes'
  estado.resultados = f.ordem === 'relevancia' ? out : ordenar(out, f.ordem)
  estado.total = out.length
}

// Ids de todas as fontes que correspondem à pesquisa atual (para exportar).
async function idsDaPesquisa() {
  return estado.resultados.map((r) => r.id)
}

function itemFonte(r, aoAbrir) {
  const tipo = estado.tiposPorId[r.tipo]
  const sel = estado.selecionados.has(r.id)
  const caixa = h('input', {
    type: 'checkbox',
    checked: sel,
    onclick: (e) => {
      e.stopPropagation()
      if (e.target.checked) estado.selecionados.add(r.id)
      else estado.selecionados.delete(r.id)
      e.target.closest('.item').classList.toggle('selecionado', e.target.checked)
      atualizarBarraSelecao()
    },
  })
  const meta = [autoresTexto(r.autores, 3), r.data, r.editora].filter(Boolean).join(' · ')
  return h(
    'div',
    { class: 'item' + (sel ? ' selecionado' : ''), onclick: () => (aoAbrir || abrirFonte)(r.id) },
    caixa,
    h(
      'div',
      {},
      h('div', { class: 'titulo' }, r.numero ? h('span', { class: 'numero' }, numeroFmt(r.numero)) : null, r.titulo || tr('Sem título')),
      meta ? h('div', { class: 'meta' }, meta) : null,
      (r.contextos || []).length || (r.tags || []).length
        ? h('div', { class: 'chips', style: 'margin-top:6px' }, (r.contextos || []).map((c) => h('span', { class: 'etiqueta acento' }, tr(c))), (r.tags || []).map((t) => h('span', { class: 'etiqueta' }, '#' + t)))
        : null,
      (r.palavras_chave || []).length
        ? h(
            'div',
            { class: 'palavras-chave' },
            (r.palavras_chave || []).slice(0, 8).map((k) =>
              h(
                'span',
                {
                  class: 'palavra',
                  title: tr('Pesquisar esta palavra-chave'),
                  onclick: (e) => {
                    e.stopPropagation()
                    estado.filtros.q = `"${k}"`
                    estado.filtros.ordem = 'relevancia'
                    if (vistaAtual() === 'fontes') vistaFontes()
                    else location.hash = '#/fontes'
                  },
                },
                k
              )
            )
          )
        : null,
      estado.trechos[r.id] ? trechoHtml(estado.trechos[r.id]) : null
    ),
    h(
      'div',
      { class: 'lado' },
      tipo ? h('span', { class: 'etiqueta' }, tr(tipo.nome)) : null,
      r.estado === 'a_rever' ? h('span', { class: 'etiqueta rever' }, tr('Por rever')) : null,
      r.estado === 'processando' ? h('span', { class: 'etiqueta rever' }, tr('A processar')) : null,
      OCR_ESTADOS[r.ocr_estado] && r.ocr_estado !== 'feito' ? h('span', { class: 'etiqueta' }, OCR_ESTADOS[r.ocr_estado]) : null,
      r.ficheiro ? h('span', { class: 'etiqueta', title: r.ficheiro }, (r.ficheiro.split('.').pop() || '').toUpperCase() + (r.ficheiros_extra?.length ? ` ×${r.ficheiros_extra.length + 1}` : '')) : null
    )
  )
}

function atualizarBarraSelecao() {
  const el = document.getElementById('info-selecao')
  if (!el) return
  const n = estado.selecionados.size
  el.textContent = n ? (n > 1 ? tr('{n} seleccionadas', { n: numTxt(n) }) : tr('{n} seleccionada', { n: numTxt(n) })) : ''
  const limpar = document.getElementById('limpar-selecao')
  if (limpar) limpar.classList.toggle('oculto', !n)
  const apagar = document.getElementById('apagar-selecao')
  if (apagar) apagar.classList.toggle('oculto', !n)
  const editar = document.getElementById('editar-selecao')
  if (editar) editar.classList.toggle('oculto', !n)
}

// Lista para marcar um ou vários formatos; o resumo mostra o que está marcado.
// (as contagens são da biblioteca inteira e só se pedem quando a lista se abre pela primeira vez)
function escolhaFormatos(f, aoMudar) {
  const resumo = h('summary', {})
  const escrever = () => (resumo.textContent = f.formatos.length ? f.formatos.map((k) => FORMATOS[k][0].replace(/ \(.*\)$/, '')).join(', ') : tr('Todos'))
  const contagens = {}
  const caixas = Object.entries(FORMATOS).map(([k, [rotulo]]) => {
    contagens[k] = h('span', { class: 'contagem' })
    return h(
      'label',
      {},
      h('input', {
        type: 'checkbox',
        checked: f.formatos.includes(k),
        onchange: (e) => {
          f.formatos = e.target.checked ? [...f.formatos, k] : f.formatos.filter((x) => x !== k)
          escrever()
          aoMudar()
        },
      }),
      h('span', {}, rotulo),
      contagens[k]
    )
  })
  let contado = false
  const caixa = h(
    'details',
    {
      class: 'escolha-multipla',
      ontoggle: async (e) => {
        if (!e.target.open || contado) return
        contado = true
        for (const k of Object.keys(FORMATOS)) {
          const params = {}
          try {
            const r = await pb.collection('fontes').getList(1, 1, { filter: pb.filter(condicaoFormatos([k], params), params), fields: 'id' })
            contagens[k].textContent = numTxt(r.totalItems)
          } catch (_) {}
        }
      },
    },
    resumo,
    h('div', { class: 'opcoes' }, caixas, h('button', { class: 'botao-texto', type: 'button', onclick: () => ((f.formatos = []), caixa.querySelectorAll('input').forEach((i) => (i.checked = false)), escrever(), aoMudar()) }, tr('Desmarcar todos')))
  )
  // (fecha ao clicar fora)
  const fora = (e) => {
    if (!caixa.isConnected) return document.removeEventListener('click', fora)
    if (caixa.open && !caixa.contains(e.target)) caixa.open = false
  }
  document.addEventListener('click', fora)
  escrever()
  return caixa
}

// Apagar as fontes seleccionadas: fichas fora da base, ficheiros para o Lixo do Mac (com cópia de segurança antes)
async function apagarSelecionadas(depois) {
  const ids = [...estado.selecionados]
  if (!ids.length) return
  // (os títulos das primeiras 8; as que não estão na lista actual vêm da base)
  const porId = new Map(estado.resultados.map((r) => [r.id, r]))
  const primeiras = ids.slice(0, 8)
  const faltam = primeiras.filter((id) => !porId.has(id))
  if (faltam.length) {
    try {
      const filtro = pb.filter(faltam.map((_, i) => `id = {:i${i}}`).join(' || '), Object.fromEntries(faltam.map((id, i) => [`i${i}`, id])))
      ;(await pb.collection('fontes').getFullList({ filter: filtro, fields: 'id,numero,titulo' })).forEach((r) => porId.set(r.id, r))
    } catch (_) {}
  }
  const titulos = primeiras.map((id) => porId.get(id)).filter(Boolean).map((r) => `  • #${r.numero} ${r.titulo || tr('(sem título)')}`)
  const n = ids.length
  const texto =
    (n > 1 ? tr('Apagar {n} fontes?', { n: numTxt(n) }) : tr('Apagar {n} fonte?', { n: numTxt(n) })) + '\n\n' +
    (titulos.length ? titulos.join('\n') + (n > titulos.length ? '\n  ' + tr('… e mais {n}', { n: numTxt(n - titulos.length) }) : '') + '\n\n' : '') +
    tr('As fichas saem da base de dados, com as notas de leitura. Os ficheiros vão para o Lixo do Mac (pasta «Fontes apagadas» com a data): ') +
    tr('pode recuperá-los enquanto não esvaziar o Lixo. Antes disso é feita uma cópia de segurança da base.')
  if (!confirm(texto)) return
  if (n >= 50 && prompt(tr('São {n} fontes. Para confirmar, escreva o número {num}:', { n: numTxt(n), num: n }))?.trim() !== String(n)) return toast(tr('Nada foi apagado.'))
  let apagadas = 0
  let movidos = 0
  const saltadas = []
  try {
    for (let i = 0; i < ids.length; i += 100) {
      if (ids.length > 100) toast(tr('A apagar… {feitas} de {total}', { feitas: Math.min(i + 100, n), total: n }))
      const r = await servico('apagar-fontes', { ids: ids.slice(i, i + 100), semCopia: i > 0 })
      apagadas += r.apagadas
      movidos += r.movidos
      saltadas.push(...r.saltadas)
      ids.slice(i, i + 100).forEach((id) => estado.selecionados.delete(id))
      saltadas.forEach((x) => estado.selecionados.add(x.id))
    }
  } catch (e) {
    const m = mensagemErro(e)
    toast(/Acção desconhecida/.test(m) ? tr('Esta função só fica activa depois de reiniciar o TINCTORIS.') : tr('Erro: {erro}', { erro: m }) + (apagadas ? ' ' + tr('({n} já apagadas)', { n: apagadas }) : ''), true)
    if (!apagadas) return
  }
  const aProcessar = saltadas.filter((x) => x.motivo === 'a processar').length
  toast(
    (apagadas === 1 ? tr('{n} fonte apagada', { n: numTxt(apagadas) }) : tr('{n} fontes apagadas', { n: numTxt(apagadas) })) +
      '; ' +
      (movidos === 1 ? tr('{n} ficheiro no Lixo do Mac.', { n: numTxt(movidos) }) : tr('{n} ficheiros no Lixo do Mac.', { n: numTxt(movidos) })) +
      (saltadas.length
        ? ' ' +
          (aProcessar
            ? tr('{n} ficaram ({p} a processar: tente mais tarde) e continuam seleccionadas.', { n: saltadas.length, p: aProcessar })
            : tr('{n} ficaram e continuam seleccionadas.', { n: saltadas.length }))
        : ''),
    saltadas.length > 0
  )
  atualizarBarraSelecao()
  await depois()
}

// Editar as fontes seleccionadas: só os campos que todas têm (pedido do Pedro, 10/10/2026). Cada campo começa vazio
// («não mudar»); nos de texto escolhe-se «só onde está vazio» ou «substituir em todas»; nas etiquetas e contextos,
// «acrescentar» ou «retirar». Nunca se esvazia um campo. O serviço faz a cópia de segurança e a lista do que mudou.
const CAMPOS_INTERNOS = new Set(['nota_revisao', 'herdado_de', 'lote', 'transcricao_midi', 'catalogo_ia'])
// (valor à esquerda, modo à direita)
const LADO_A_LADO = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,200px);gap:8px;align-items:start'
async function editarSelecionadas(depois) {
  const ids = [...estado.selecionados]
  if (!ids.length) return
  // Tipos das fichas seleccionadas (as que não estão na lista actual vêm da base)
  const porId = new Map(estado.resultados.map((r) => [r.id, r]))
  const faltam = ids.filter((id) => !porId.has(id))
  try {
    for (let i = 0; i < faltam.length; i += 80) {
      const bloco = faltam.slice(i, i + 80)
      const filtro = pb.filter(bloco.map((_, j) => `id = {:i${j}}`).join(' || '), Object.fromEntries(bloco.map((id, j) => [`i${j}`, id])))
      ;(await pb.collection('fontes').getFullList({ filter: filtro, fields: 'id,numero,titulo,tipo' })).forEach((r) => porId.set(r.id, r))
    }
  } catch (e) {
    return toast(mensagemErro(e), true)
  }
  const fichas = ids.map((id) => porId.get(id)).filter(Boolean)
  const contagem = {}
  fichas.forEach((r) => (contagem[r.tipo] = (contagem[r.tipo] || 0) + 1))
  const tipos = Object.keys(contagem).map((t) => estado.tiposPorId[t]).filter(Boolean)
  // Campos do tipo que todas têm («Onde está o exemplar físico» primeiro)
  const comuns = (tipos[0]?.campos || []).filter((c) => c.chave && !CAMPOS_INTERNOS.has(c.chave) && tipos.every((t) => (t.campos || []).some((x) => x.chave === c.chave)))
  comuns.sort((a, b) => (b.chave === 'exemplar_papel') - (a.chave === 'exemplar_papel'))

  const linhas = []
  const modoTexto = () => selectSimples({ vazio: tr('só onde está vazio'), substituir: tr('substituir em todas') }, 'vazio')
  const linhaTexto = (id, rotulo, controlo, ler) => {
    const modo = modoTexto()
    linhas.push({ id, rotulo, ler, modo: () => modo.value })
    return campo(rotulo, h('div', { style: LADO_A_LADO }, controlo, modo), { class: 'largo' })
  }
  const controloDe = (c) => {
    if (c.tipo === 'texto_longo') {
      const t = h('textarea', { rows: 2 })
      return [t, () => t.value]
    }
    if (c.tipo === 'numero') {
      const t = h('input', { type: 'number' })
      return [t, () => (t.value === '' ? '' : Number(t.value))]
    }
    if (c.tipo === 'lista') {
      const t = selectSimples(['', ...(c.opcoes || [])], '')
      return [t, () => t.value]
    }
    if (c.tipo === 'sim_nao') {
      const t = selectSimples({ '': '—', sim: tr('Sim'), nao: tr('Não') }, '')
      return [t, () => (t.value === '' ? '' : t.value === 'sim')]
    }
    const t = h('input', { type: c.tipo === 'url' ? 'url' : 'text', placeholder: c.tipo === 'data' ? tr('aaaa-mm-dd ou ano') : '' })
    return [t, () => t.value]
  }
  const gerais = [
    ['editora', tr('Editora')],
    ['local', tr('Local')],
    ['data', tr('Data (ex.: 1985, 1621-03-12, c. 1740)')],
  ].map(([k, rotulo]) => {
    const [c, ler] = controloDe({ tipo: 'texto' })
    return linhaTexto(k, rotulo, c, ler)
  })
  const nat = selectSimples({ '': '—', primária: tr('Primária'), secundária: tr('Secundária') }, '')
  gerais.push(linhaTexto('natureza', tr('Natureza'), nat, () => nat.value))
  const proprios = comuns.map((c) => {
    const [ctl, ler] = controloDe(c)
    return linhaTexto(`meta:${c.chave}`, tr(c.rotulo), ctl, ler)
  })
  // Etiquetas e contextos: acrescentar ou retirar um valor
  const listas = []
  const linhaLista = (id, rotulo, controlo, ler) => {
    const modo = selectSimples({ acrescentar: tr('acrescentar a todas'), retirar: tr('retirar de todas') }, 'acrescentar')
    listas.push({ id, rotulo, ler, modo: () => modo.value })
    return campo(rotulo, h('div', { style: LADO_A_LADO }, controlo, modo), { class: 'largo' })
  }
  const etiqueta = h('input', { type: 'text', placeholder: tr('ex.: Em papel') })
  const contexto = selectSimples({ '': '—', ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, '')

  const nomesTipos = Object.entries(contagem).map(([t, n]) => `${numTxt(n)} ${estado.tiposPorId[t]?.nome ? tr(estado.tiposPorId[t].nome) : tr('sem tipo')}`).join(', ')
  const n = fichas.length
  const aplicar = async () => {
    const alteracoes = [
      ...linhas.map((l) => ({ campo: l.id, rotulo: l.rotulo, valor: l.ler(), modo: l.modo() })),
      ...listas.map((l) => ({ campo: l.id, rotulo: l.rotulo, valor: l.ler(), modo: l.modo() })),
    ].filter((a) => !(a.valor === '' || a.valor === null || a.valor === undefined || (typeof a.valor === 'string' && !a.valor.trim())))
    if (!alteracoes.length) return toast(tr('Não escreveu nenhum valor: nada a mudar.'))
    const MODOS = { vazio: tr('só nas que o têm vazio'), substituir: tr('em todas (substitui o que lá está)'), acrescentar: tr('acrescentar a todas'), retirar: tr('retirar de todas') }
    const descricao = alteracoes.map((a) => tr('  • {rotulo}: «{valor}» — {modo}', { rotulo: a.rotulo, valor: typeof a.valor === 'boolean' ? (a.valor ? tr('Sim') : tr('Não')) : a.valor, modo: MODOS[a.modo] })).join('\n')
    const textoConfirmar =
      n === 1
        ? tr('Mudar {n} ficha?\n\n{descricao}\n\nAntes é feita uma cópia de segurança da base. Os outros campos não mudam.', { n: numTxt(n), descricao })
        : tr('Mudar {n} fichas?\n\n{descricao}\n\nAntes é feita uma cópia de segurança da base. Os outros campos não mudam.', { n: numTxt(n), descricao })
    if (!confirm(textoConfirmar)) return
    if (n >= 50 && prompt(tr('São {n} fichas. Para confirmar, escreva o número {num}:', { n: numTxt(n), num: n }))?.trim() !== String(n)) return toast(tr('Nada foi mudado.'))
    let mudadas = 0
    let iguais = 0
    const saltadas = []
    try {
      for (let i = 0; i < ids.length; i += 100) {
        if (ids.length > 100) toast(tr('A gravar… {i} de {n}', { i: Math.min(i + 100, n), n }))
        const r = await servico('editar-fontes', { ids: ids.slice(i, i + 100), alteracoes: alteracoes.map(({ rotulo, ...a }) => a), semCopia: i > 0 })
        mudadas += r.mudadas
        iguais += r.iguais
        saltadas.push(...r.saltadas)
      }
    } catch (e) {
      const m = mensagemErro(e)
      toast(/Acção desconhecida/.test(m) ? tr('Esta função só fica activa depois de reiniciar o TINCTORIS.') : mudadas ? tr('Erro: {m} ({n} já mudadas)', { m, n: numTxt(mudadas) }) : tr('Erro: {m}', { m }), true)
      if (!mudadas) return
    }
    const aProcessar = saltadas.filter((x) => x.motivo === 'a processar').length
    fecharPainel()
    toast(
      (mudadas === 1 ? tr('{n} ficha mudada', { n: numTxt(mudadas) }) : tr('{n} fichas mudadas', { n: numTxt(mudadas) })) +
        (iguais ? '; ' + (iguais === 1 ? tr('{n} já tinha o valor ou o campo preenchido', { n: numTxt(iguais) }) : tr('{n} já tinham o valor ou o campo preenchido', { n: numTxt(iguais) })) : '') +
        (saltadas.length
          ? '; ' + (saltadas.length === 1 ? tr('{n} saltada', { n: saltadas.length }) : tr('{n} saltadas', { n: saltadas.length })) + (aProcessar ? tr(' ({a} a processar: tente mais tarde)', { a: aProcessar }) : '')
          : '') +
        '.',
      saltadas.length > 0
    )
    await depois()
  }

  abrirPainel({
    topo: h('strong', {}, n === 1 ? tr('Editar {n} ficha', { n: numTxt(n) }) : tr('Editar {n} fichas', { n: numTxt(n) })),
    corpo: h(
      'div',
      {},
      h('p', { class: 'ajuda' }, tr('Seleccionadas: {tipos}. Só aparecem os campos que todas têm. Escreva apenas o que quer mudar; os campos que deixar em branco ficam como estão. Título e autores mudam-se ficha a ficha.', { tipos: nomesTipos })),
      proprios.length ? [h('h3', {}, tr('Campos do tipo')), h('div', { class: 'grelha' }, proprios)] : null,
      h('h3', {}, tr('Campos gerais')),
      h('div', { class: 'grelha' }, gerais),
      h('h3', {}, tr('Etiquetas e contextos')),
      h('div', { class: 'grelha' }, linhaLista('tags', tr('Etiqueta'), etiqueta, () => etiqueta.value.trim()), linhaLista('contextos', tr('Contexto / UC'), contexto, () => contexto.value))
    ),
    rodape: [h('button', { class: 'botao', onclick: () => fecharPainel() }, tr('Cancelar')), h('button', { class: 'botao primario', onclick: aplicar }, n === 1 ? tr('Aplicar a {n} ficha', { n: numTxt(n) }) : tr('Aplicar a {n} fichas', { n: numTxt(n) }))],
  })
}

async function vistaFontes() {
  const p = principal()
  const f = estado.filtros
  const lista = h('div', {})
  const resumo = h('span', {})

  const recarregar = async () => {
    estado.limiteVisivel = 200
    lista.innerHTML = ''
    anexar(lista, h('div', { class: 'vazio' }, tr('A pesquisar…')))
    try {
      await pesquisar()
    } catch (e) {
      lista.innerHTML = ''
      anexar(lista, h('div', { class: 'vazio' }, h('strong', {}, tr('Não foi possível pesquisar')), mensagemErro(e)))
      return
    }
    desenhar()
  }

  const desenhar = () => {
    lista.innerHTML = ''
    resumo.textContent = estado.total === 1 ? tr('{n} fonte', { n: numTxt(estado.total) }) : tr('{n} fontes', { n: numTxt(estado.total) })
    const comTexto = !!(f.q || f.autor || f.titulo)
    seletorOrdem.innerHTML = ''
    anexar(seletorOrdem, (comTexto ? [['relevancia', tr('Relevância')], ...Object.entries(ORDENS)] : Object.entries(ORDENS)).map(([v, r]) => h('option', { value: v, selected: v === f.ordem }, tr(r))))
    if (!estado.resultados.length) {
      const semNada = !f.q && !f.autor && !f.titulo && !filtroBase().partes.length
      anexar(lista, 
        h(
          'div',
          { class: 'lista' },
          h(
            'div',
            { class: 'vazio' },
            h('strong', {}, semNada ? tr('A biblioteca ainda está vazia') : tr('Nada encontrado')),
            semNada ? tr('Largue ficheiros na pasta watch_folder ou use «Nova fonte».') : tr('Experimente outras palavras ou retire filtros.')
          )
        )
      )
      return
    }
    const l = h('div', { class: 'lista' })
    estado.resultados.slice(0, estado.limiteVisivel).forEach((r) => anexar(l, itemFonte(r)))
    anexar(lista, l)
    if (estado.resultados.length > estado.limiteVisivel) {
      anexar(
        lista,
        h(
          'div',
          { style: 'text-align:center;margin-top:14px' },
          h('button', { class: 'botao', onclick: () => ((estado.limiteVisivel += 200), desenhar()) }, tr('Mostrar mais ({n} restantes)', { n: numTxt(estado.resultados.length - estado.limiteVisivel) }))
        )
      )
    }
  }

  // Mudar a ordem é instantâneo: as fontes já estão carregadas
  const seletorOrdem = h('select', {
    style: 'width:auto;padding:4px 8px;font-size:14px',
    'aria-label': tr('Ordenar por'),
    onchange: async (e) => {
      f.ordem = e.target.value
      if (f.ordem !== 'relevancia') guardarPreferencia('ordem', f.ordem)
      if (f.ordem === 'relevancia') return recarregar()
      estado.resultados = ordenar(estado.resultados, f.ordem)
      estado.limiteVisivel = 200
      desenhar()
    },
  })

  estado.atualizarListaEmSilencio = async () => {
    if (estado.limiteVisivel > 200) return
    try {
      await pesquisar()
      desenhar()
    } catch (_) {}
  }

  const aoEscrever = atraso(() => recarregar(), 300)
  const entradaQ = h('input', {
    type: 'search',
    placeholder: tr('Pesquisar em tudo: títulos, autores, notas, texto integral…'),
    value: f.q,
    oninput: (e) => {
      const antes = !!f.q
      f.q = e.target.value
      if (!antes && f.q) f.ordem = 'relevancia'
      if (antes && !f.q && f.ordem === 'relevancia') f.ordem = lerPreferencia('ordem', 'recentes')
      aoEscrever()
    },
  })

  const filtros = h(
    'div',
    { class: 'filtros' + (estado.filtrosVisiveis ? '' : ' oculto') },
    h(
      'div',
      { class: 'grelha' },
      campo(tr('Autor'), h('input', { type: 'text', value: f.autor, oninput: (e) => ((f.autor = e.target.value), aoEscrever()) })),
      campo(tr('Título'), h('input', { type: 'text', value: f.titulo, oninput: (e) => ((f.titulo = e.target.value), aoEscrever()) })),
      campo(tr('Tipo de fonte'), selectTipos(f.tipo, (e) => ((f.tipo = e.target.value), recarregar()), tr('Todos'))),
      campo(tr('Contexto / UC'), selectSimples({ '': tr('Todos'), ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, f.contexto, { onchange: (e) => ((f.contexto = e.target.value), recarregar()) })),
      campo(tr('Natureza'), selectSimples({ '': tr('Todas'), primária: tr('Primária'), secundária: tr('Secundária') }, f.natureza, { onchange: (e) => ((f.natureza = e.target.value), recarregar()) })),
      campo(tr('Estado'), selectSimples({ '': tr('Todos'), ...ESTADOS }, f.estado, { onchange: (e) => ((f.estado = e.target.value), recarregar()) })),
      campo(tr('Ano (de)'), h('input', { type: 'number', value: f.anoDe, oninput: (e) => ((f.anoDe = e.target.value), aoEscrever()) })),
      campo(tr('Ano (até)'), h('input', { type: 'number', value: f.anoAte, oninput: (e) => ((f.anoAte = e.target.value), aoEscrever()) })),
      campo(tr('Etiqueta'), h('input', { type: 'text', value: f.tag, oninput: (e) => ((f.tag = e.target.value), aoEscrever()) })),
      h('div', { class: 'campo' }, h('span', {}, tr('Formato do ficheiro')), escolhaFormatos(f, recarregar)),
    ),
    h(
      'div',
      { style: 'margin-top:10px' },
      h(
        'button',
        {
          class: 'botao-texto',
          onclick: () => {
            Object.assign(f, { q: '', autor: '', titulo: '', tipo: '', contexto: '', natureza: '', estado: '', anoDe: '', anoAte: '', tag: '', formatos: [] })
            vistaFontes()
          },
        },
        tr('Limpar filtros')
      )
    )
  )

  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, tr('Fontes')), h('p', { class: 'subtitulo' }, tr('A sua biblioteca de investigação, ensino e prática artística.'))),
      h('div', { class: 'linha-flex' }, h('button', { class: 'botao', onclick: () => abrirExportar() }, tr('Exportar bibliografia')), h('button', { class: 'botao primario', onclick: () => abrirFonte(null) }, tr('+ Nova fonte')))
    ),
    h(
      'div',
      { class: 'pesquisa-principal' },
      entradaQ,
      h(
        'button',
        {
          class: 'botao',
          onclick: () => {
            estado.filtrosVisiveis = !estado.filtrosVisiveis
            filtros.classList.toggle('oculto', !estado.filtrosVisiveis)
          },
        },
        tr('Filtros')
      )
    ),
    h('p', { class: 'ajuda', style: 'margin:-2px 0 12px' }, tr('Dica: use aspas para uma expressão exacta, ex.: "basso continuo". Acentos e maiúsculas são ignorados.')),
    filtros,
    h(
      'div',
      { class: 'resumo-lista' },
      h('span', { class: 'linha-flex' }, resumo, h('span', { style: 'color:var(--tinta-3)' }, tr('· ordenar por')), seletorOrdem),
      h(
        'span',
        { class: 'linha-flex' },
        h('span', { id: 'info-selecao' }),
        h('button', { class: 'botao-texto oculto', id: 'limpar-selecao', onclick: () => (estado.selecionados.clear(), desenhar(), atualizarBarraSelecao()) }, tr('Limpar selecção')),
        h('button', { class: 'botao-texto oculto', id: 'editar-selecao', onclick: () => editarSelecionadas(recarregar) }, tr('Editar as seleccionadas…')),
        h('button', { class: 'botao-texto perigo oculto', id: 'apagar-selecao', onclick: () => apagarSelecionadas(recarregar) }, tr('Apagar as seleccionadas…')),
        h(
          'button',
          {
            class: 'botao-texto',
            onclick: () => {
              estado.resultados.forEach((r) => estado.selecionados.add(r.id))
              desenhar()
              atualizarBarraSelecao()
            },
          },
          tr('Seleccionar as visíveis')
        )
      )
    ),
    lista
  )
  atualizarBarraSelecao()
  if (!f.q) entradaQ.focus()
  await recarregar()
}

async function vistaRever() {
  const p = principal()
  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h(
        'div',
        {},
        h('h1', {}, tr('Por rever')),
        h('p', { class: 'subtitulo' }, tr('Fontes cujos metadados não foram identificados com segurança. Abra cada uma, escolha uma sugestão ou preencha à mão, e confirme.'))
      ),
      h(
        'button',
        {
          class: 'botao',
          title: tr('Aplicar as regras e a IA local mais recentes a todas as fontes por rever que têm ficheiro'),
          onclick: async () => {
            if (!confirm(tr('Reanalisar todas as fontes por rever que têm ficheiro? Com a IA local pode levar ~15 segundos por fonte, em segundo plano. Antes disso é feita uma cópia de segurança.'))) return
            try {
              const r = await servico('reanalisar-por-rever', {})
              toast(tr('{n} fontes em reanálise. Acompanhe em «Actividade».', { n: numTxt(r.fontes) }))
            } catch (e) {
              toast(mensagemErro(e), true)
            }
          },
        },
        tr('Reanalisar todas')
      )
    )
  )
  const r = await pb.collection('fontes').getFullList({ filter: "estado = 'a_rever' || estado = 'erro'", sort: 'created', fields: CAMPOS_LISTA })
  estado.trechos = {}
  if (!r.length) {
    anexar(p, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, tr('Tudo revisto')), tr('Não há fontes à espera de revisão.'))))
    return
  }
  const l = h('div', { class: 'lista' })
  r.forEach((x) => anexar(l, itemFonte(x)))
  anexar(p, l)
}

// ---------------------------------------------------------------------------
// Painel lateral genérico

function abrirPainel({ topo, corpo, rodape, aoFechar }) {
  fecharPainel()
  estado.painelAberto = true
  const fundo = h('div', { class: 'painel-fundo', onclick: () => fecharPainel() })
  const painel = h(
    'section',
    { class: 'painel', id: 'painel' },
    h('div', { class: 'painel-topo' }, topo, h('span', { class: 'espaco' }), h('button', { class: 'botao', onclick: () => fecharPainel() }, tr('Fechar'))),
    h('div', { class: 'painel-corpo' }, corpo),
    rodape ? h('div', { class: 'painel-rodape' }, rodape) : null
  )
  painel._aoFechar = aoFechar
  fundo.id = 'painel-fundo'
  anexar(document.body, fundo, painel)
  document.addEventListener('keydown', escParaFechar)
  return painel
}

function escParaFechar(e) {
  if (e.key === 'Escape') fecharPainel()
}

function fecharPainel() {
  const p = document.getElementById('painel')
  if (p?._aoFechar) p._aoFechar()
  p?.remove()
  document.getElementById('painel-fundo')?.remove()
  document.removeEventListener('keydown', escParaFechar)
  estado.painelAberto = false
}

// ---------------------------------------------------------------------------
// Ficha de uma fonte (ver, editar, criar)

async function abrirFonte(id) {
  let f
  if (id) {
    try {
      f = await pb.collection('fontes').getOne(id)
    } catch (e) {
      return toast(mensagemErro(e), true)
    }
  } else {
    const outro = estado.tipos.find((t) => t.nome === 'Livro') || estado.tipos[0]
    f = { titulo: '', autores: [], tipo: outro?.id, contextos: [], tags: [], metadados: {}, estado: 'completo', candidatos: [] }
  }
  // Cópia de trabalho
  const r = JSON.parse(JSON.stringify(f))
  // (também depois de «Usar esta» e «Guardar»: o PocketBase devolve null nas listas vazias)
  const normalizar = () => {
    r.autores = Array.isArray(r.autores) ? r.autores : []
    r.tags = Array.isArray(r.tags) ? r.tags : []
    r.palavras_chave = Array.isArray(r.palavras_chave) ? r.palavras_chave : []
    r.metadados = r.metadados && typeof r.metadados === 'object' ? r.metadados : {}
    r.contextos = Array.isArray(r.contextos) ? r.contextos : []
    r.candidatos = Array.isArray(r.candidatos) ? r.candidatos : []
  }
  normalizar()
  let alterado = false
  const marcar = () => (alterado = true)

  const corpo = h('div', {})
  const topo = h('div', { class: 'linha-flex' })
  const rodape = h('div', { class: 'linha-flex', style: 'width:100%;justify-content:flex-end' })

  const guardar = async ({ confirmar = false } = {}) => {
    const dados = {
      tipo: r.tipo,
      titulo: r.titulo,
      autores: r.autores.filter((a) => a.literal || a.apelido || a.nome),
      data: r.data || '',
      editora: r.editora || '',
      local: r.local || '',
      doi: r.doi || '',
      isbn: r.isbn || '',
      url: r.url || '',
      natureza: r.natureza || '',
      contextos: r.contextos,
      tags: r.tags,
      palavras_chave: r.palavras_chave,
      metadados: r.metadados,
      notas: r.notas || '',
    }
    try {
      let salvo
      if (r.id) salvo = await pb.collection('fontes').update(r.id, dados)
      else salvo = await pb.collection('fontes').create({ ...dados, estado: 'completo', ocr_estado: 'nao_aplicavel' })
      if (salvo.ficheiro && (confirmar || document.getElementById('renomear')?.checked)) {
        await servico(confirmar ? 'confirmar' : 'reorganizar', { id: salvo.id })
      } else if (confirmar) {
        await pb.collection('fontes').update(salvo.id, { estado: 'completo', candidatos: [] })
      }
      alterado = false
      toast(confirmar ? tr('Fonte confirmada.') : tr('Guardado.'))
      atualizarContagem()
      return salvo
    } catch (e) {
      toast(mensagemErro(e), true)
      return null
    }
  }

  const redesenhar = () => {
    corpo.innerHTML = ''
    topo.innerHTML = ''
    rodape.innerHTML = ''
    const tipo = estado.tiposPorId[r.tipo]

    // Topo: ações
    if (r.id && r.ficheiro) {
      anexar(topo, h('a', { class: 'botao primario', href: `/api/bib/ficheiro/${r.id}?token=${encodeURIComponent(pb.authStore.token)}`, target: '_blank' }, tr('Abrir ficheiro')))
    }
    if (r.id) {
      anexar(topo, 
        h(
          'button',
          {
            class: 'botao',
            onclick: async (e) => {
              e.target.disabled = true
              e.target.textContent = tr('A pesquisar em todas as fontes…')
              try {
                if (alterado) await guardar()
                const res = await servico('aprofundar', { id: r.id })
                r.candidatos = res.candidatos || []
                if (res.erros?.length) toast(tr('Algumas fontes não responderam: {fontes}', { fontes: res.erros.map((x) => x.split(':')[0]).join(', ') }))
                redesenhar()
                document.getElementById('sugestoes')?.scrollIntoView({ behavior: 'smooth' })
              } catch (err) {
                toast(mensagemErro(err), true)
                e.target.disabled = false
              }
            },
          },
          tr('Pesquisa aprofundada')
        )
      )
    }

    // Cabeçalho
    anexar(corpo, 
      h('h1', {}, r.titulo || (r.id ? tr('Sem título') : tr('Nova fonte'))),
      h(
        'div',
        { class: 'linha-flex', style: 'margin-top:6px' },
        r.numero ? h('span', { class: 'etiqueta', title: tr('Número permanente desta fonte') }, numeroFmt(r.numero)) : null,
        r.estado === 'a_rever' ? h('span', { class: 'etiqueta rever' }, tr('Por rever')) : null,
        r.origem ? h('span', { class: 'etiqueta' }, tr('Metadados: {origem}', { origem: tr(r.origem) })) : null,
        OCR_ESTADOS[r.ocr_estado] ? h('span', { class: 'etiqueta' }, tr(OCR_ESTADOS[r.ocr_estado])) : null,
        r.ficheiro ? h('span', { class: 'ajuda', style: 'margin:0' }, r.ficheiro) : null
      )
    )

    // Vários ficheiros por fonte (volumes, livros de partes)
    const ficheirosExtra = Array.isArray(r.ficheiros_extra) ? r.ficheiros_extra : []
    // (só depois de a base de dados ter o campo novo, ou seja, depois de reiniciar a biblioteca)
    if (r.id && r.ficheiro && 'ficheiros_extra' in r) {
      const abrir = (n) => `/api/bib/ficheiro/${r.id}?token=${encodeURIComponent(pb.authStore.token)}${n > 1 ? '&n=' + n : ''}`
      const nomeDe = (p) => String(p || '').split('/').pop()
      const juntarOutras = async () => {
        const txt = prompt(tr('Números das fichas a juntar a esta (os ficheiros delas passam para aqui e essas fichas deixam de existir; os ficheiros nunca são apagados).\nEx.: 23, 24-47'))
        if (!txt) return
        const numeros = []
        for (const parte of txt.split(/[\s,;]+/).filter(Boolean)) {
          const m = /^#?(\d+)(?:-#?(\d+))?$/.exec(parte)
          if (!m) return toast(tr('Não percebi «{parte}». Use números, ex.: 23, 24-47', { parte }), true)
          for (let n = Number(m[1]); n <= Number(m[2] || m[1]); n++) if (n !== r.numero) numeros.push(n)
        }
        if (!numeros.length || numeros.length > 500) return toast(tr('Indique entre 1 e 500 fichas.'), true)
        const outras = []
        for (const n of numeros) {
          try {
            outras.push(await pb.collection('fontes').getFirstListItem(`numero = ${n}`, { fields: 'id,numero,titulo,ficheiro' }))
          } catch (_) {
            return toast(tr('A ficha {n} não existe.', { n: numeroFmt(n) }), true)
          }
        }
        const lista = outras.slice(0, 12).map((o) => `${numeroFmt(o.numero)} ${o.titulo}`).join('\n') + (outras.length > 12 ? tr('\n… e mais {n}', { n: numTxt(outras.length - 12) }) : '')
        if (!confirm(tr('Juntar {n} ficha(s) a «{titulo}»?\n\n{lista}\n\nÉ feita uma cópia de segurança antes. As notas de leitura e as etiquetas passam para esta ficha.', { n: numTxt(outras.length), titulo: r.titulo, lista }))) return
        try {
          if (alterado) await guardar()
          await servico('juntar', { id: r.id, ids: outras.map((o) => o.id) })
          toast(tr('{n} ficha(s) juntadas.', { n: numTxt(outras.length) }))
          abrirFonte(r.id)
          rota()
        } catch (e) {
          toast(mensagemErro(e), true)
        }
      }
      anexar(corpo,
        h('h3', {}, ficheirosExtra.length ? tr('Ficheiros ({n})', { n: numTxt(ficheirosExtra.length + 1) }) : tr('Ficheiros')),
        h('div', { class: 'ficheiros-fonte', style: ficheirosExtra.length > 6 ? 'display:flex;flex-wrap:wrap;gap:2px 18px' : '' },
          h('div', { class: 'linha-flex' }, h('a', { href: abrir(1), target: '_blank' }, nomeDe(r.ficheiro_original || r.ficheiro)), h('span', { class: 'ajuda', style: 'margin:0' }, ficheirosExtra.length ? tr('principal') : '')),
          ...ficheirosExtra.map((x, i) =>
            h('div', { class: 'linha-flex' },
              h('a', { href: abrir(i + 2), target: '_blank', title: x.ficheiro }, x.rotulo || nomeDe(x.ficheiro)),
              nomeDe(x.original) && !nomeDe(x.original).startsWith((x.rotulo || '') + '.') ? h('span', { class: 'ajuda', style: 'margin:0' }, nomeDe(x.original)) : null,
              h('button', {
                class: 'botao-texto', style: 'font-size:12px',
                title: tr('Tirar este ficheiro desta ficha e dar-lhe uma ficha própria (por rever)'),
                onclick: async () => {
                  if (!confirm(tr('Separar «{nome}» desta ficha? Fica com uma ficha própria, por rever. O ficheiro não é apagado.', { nome: x.rotulo || nomeDe(x.ficheiro) }))) return
                  try {
                    const nova = await servico('separar', { id: r.id, indice: i })
                    toast(tr('Nova ficha {n} (por rever).', { n: numeroFmt(nova.numero) }))
                    abrirFonte(r.id)
                    rota()
                  } catch (e) {
                    toast(mensagemErro(e), true)
                  }
                },
              }, tr('(separar)'))
            )
          )
        ),
        h('p', { class: 'ajuda' },
          tr('Uma obra em vários volumes ou um livro de partes pode ter vários ficheiros numa só ficha. '),
          h('button', { class: 'botao pequeno', onclick: juntarOutras }, tr('Juntar outras fichas a esta…'))
        )
      )
    }

    // Fonte fotografada página a página: as imagens originais (sem compressão), à parte do PDF de visualização
    if (r.id && r.metadados?.originais) {
      const caixaOrig = h('div', { class: 'ficheiros-fonte' }, h('p', { class: 'ajuda' }, tr('A ler a lista de imagens…')))
      anexar(corpo,
        h('h3', {}, tr('Fotografias originais')),
        h('p', { class: 'ajuda', style: 'margin-top:-4px' }, r.ficheiro ? tr('As imagens tal como foram fotografadas, sem compressão e com o nome original. O PDF acima é só para ver.') : tr('As fotografias de onde vieram os dados desta ficha (ISBN ou ficha técnica de um livro, capa ou contracapa de um disco: o exemplar físico), para os conferir.')),
        caixaOrig
      )
      servico('originais', { id: r.id })
        .then(({ pastas }) => {
          caixaOrig.innerHTML = ''
          for (const p of pastas) {
            const mb = p.tamanho / 1048576
            const tam = mb >= 1024 ? `${numTxt(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB` : `${numTxt(Math.round(mb))} MB`
            const abrirImg = (nome) => `/api/bib/ficheiro/${r.id}?token=${encodeURIComponent(pb.authStore.token)}&original=${encodeURIComponent(p.pasta + '/' + nome)}`
            anexar(caixaOrig,
              h('div', { class: 'linha-flex' },
                h('strong', {}, p.pasta.replace(/^_originais\//, '')),
                h('span', { class: 'ajuda', style: 'margin:0' }, p.existe ? tr('{n} imagens · {tam}', { n: numTxt(p.ficheiros.length), tam }) : tr('pasta não encontrada')),
                p.existe ? h('button', {
                  class: 'botao pequeno', title: tr('Abre a pasta no Finder do Mac onde a biblioteca está a correr'),
                  onclick: async () => {
                    try {
                      await servico('mostrar-originais', { id: r.id, pasta: p.pasta })
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                }, tr('Mostrar no Finder')) : null
              ),
              p.ficheiros.length ? h('details', {},
                h('summary', {}, tr('Ver as {n} imagens', { n: numTxt(p.ficheiros.length) })),
                h('div', { style: 'display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px' },
                  ...p.ficheiros.map((nome) => h('a', { href: abrirImg(nome), target: '_blank' }, nome))
                )
              ) : null,
              h('p', { class: 'ajuda', style: 'margin:2px 0 8px' }, tr('Pasta: biblioteca/{pasta}', { pasta: p.pasta }))
            )
          }
        })
        .catch((e) => {
          caixaOrig.innerHTML = ''
          anexar(caixaOrig, h('p', { class: 'ajuda' }, tr('Não foi possível ler a lista de imagens: {erro}', { erro: mensagemErro(e) })))
        })
    }

    // Sugestões (candidatos)
    if (r.candidatos.length) {
      const caixa = h(
        'div',
        { class: 'caixa' + (r.estado === 'a_rever' ? ' destaque' : ''), id: 'sugestoes', style: 'margin-top:16px' },
        h('h3', { style: 'margin-top:0' }, tr('Sugestões encontradas ({n})', { n: numTxt(r.candidatos.length) })),
        h('p', { class: 'ajuda', style: 'margin-top:-4px' }, tr('Escolha a correspondência certa para preencher os metadados. Pode depois corrigir à mão.'))
      )
      r.candidatos.slice(0, 25).forEach((c) => {
        const pct = Math.round((c.confianca || 0) * 100)
        anexar(caixa, 
          h(
            'div',
            { class: 'candidato' },
            h(
              'div',
              {},
              h('div', { class: 'titulo' }, c.titulo),
              h('div', { class: 'meta' }, [autoresTexto(c.autores, 4), c.data, c.editora, c.metadados?.album, c.metadados?.revista, c.metadados?.cota && tr('cota {arquivo} {cota}', { arquivo: c.metadados.arquivo || '', cota: c.metadados.cota })].filter(Boolean).join(' · ')),
              h(
                'div',
                { class: 'meta' },
                h('span', { class: 'etiqueta' }, c.fonte),
                ' ',
                c.tipo_sugerido ? h('span', { class: 'etiqueta' }, tr(c.tipo_sugerido)) : null,
                ' ',
                c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, tr('ver na origem')) : null
              )
            ),
            h(
              'div',
              { style: 'text-align:right' },
              h('div', { class: 'confianca', style: `color:${pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--aviso)' : 'var(--tinta-3)'}` }, pct + '%'),
              h(
                'button',
                {
                  class: 'botao pequeno',
                  style: 'margin-top:6px',
                  onclick: async () => {
                    try {
                      if (!r.id) return
                      if (alterado) await guardar()
                      const novo = await servico('aplicar', { id: r.id, candidato: c })
                      Object.assign(r, novo)
                      normalizar()
                      alterado = true
                      redesenhar()
                      toast(tr('Sugestão aplicada. Verifique e confirme.'))
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                },
                tr('Usar esta')
              )
            )
          )
        )
      })
      anexar(corpo, caixa)
    }

    // Dados principais
    const autoresBox = h('div', {})
    const desenharAutores = () => {
      autoresBox.innerHTML = ''
      r.autores.forEach((a, i) => {
        const papel = selectSimples(PAPEIS, a.papel || 'autor', { onchange: (e) => ((a.papel = e.target.value), marcar()) })
        const remover = h('button', { class: 'botao-icone', title: tr('Remover'), onclick: () => (r.autores.splice(i, 1), marcar(), desenharAutores()) }, '✕')
        if (a.literal !== undefined) {
          anexar(autoresBox, 
            h('div', { class: 'autor-linha literal' }, h('input', { type: 'text', placeholder: tr('Entidade (orquestra, instituição…)'), value: a.literal, oninput: (e) => ((a.literal = e.target.value), marcar()) }), papel, remover)
          )
        } else {
          anexar(autoresBox, 
            h(
              'div',
              { class: 'autor-linha' },
              h('input', { type: 'text', placeholder: tr('Apelido'), value: a.apelido || '', oninput: (e) => ((a.apelido = e.target.value), marcar()) }),
              h('input', { type: 'text', placeholder: tr('Nome(s) próprio(s)'), value: a.nome || '', oninput: (e) => ((a.nome = e.target.value), marcar()) }),
              papel,
              remover
            )
          )
        }
      })
      anexar(autoresBox, 
        h(
          'div',
          { class: 'linha-flex' },
          h('button', { class: 'botao pequeno', onclick: () => (r.autores.push({ apelido: '', nome: '', papel: r.autores.length ? 'autor' : papelPadrao(tipo) }), desenharAutores()) }, tr('+ Pessoa')),
          h('button', { class: 'botao pequeno', onclick: () => (r.autores.push({ literal: '', papel: 'autor' }), desenharAutores()) }, tr('+ Entidade / grupo'))
        )
      )
    }
    desenharAutores()

    const inp = (chave, attrs) =>
      h('input', { type: 'text', value: r[chave] || '', oninput: (e) => ((r[chave] = e.target.value), marcar(), chave === 'titulo' && (corpo.querySelector('h1').textContent = e.target.value || tr('Sem título'))), ...(attrs || {}) })

    anexar(corpo, 
      h('h3', {}, tr('Identificação')),
      h(
        'div',
        { class: 'grelha' },
        campo(tr('Tipo de fonte'), selectTipos(r.tipo, (e) => ((r.tipo = e.target.value), marcar(), redesenhar()))),
        campo(tr('Natureza'), selectSimples({ '': '—', primária: tr('Primária'), secundária: tr('Secundária') }, r.natureza, { onchange: (e) => ((r.natureza = e.target.value), marcar()) })),
        campo(tr('Título'), inp('titulo'), { class: 'largo' }),
        h('div', { class: 'largo' }, h('label', { class: 'campo' }, h('span', {}, tr('Autores e outros responsáveis'))), autoresBox),
        campo(tr('Data (ex.: 1985, 1621-03-12, c. 1740)'), inp('data')),
        campo(tipo?.categoria === 'Audiovisual' ? tr('Editora discográfica / produtora') : tr('Editora'), inp('editora')),
        campo(tr('Local'), inp('local')),
        campo('DOI', inp('doi')),
        campo('ISBN', inp('isbn')),
        campo(tr('Endereço web (URL)'), inp('url', { type: 'url' }))
      )
    )

    // Campos específicos do tipo + campos extra
    anexar(corpo, h('h3', {}, tr('Campos de «{tipo}»', { tipo: tipo?.nome ? tr(tipo.nome) : tr('Outro') })))
    const especificos = h('div', { class: 'grelha' })
    const definidos = new Set()
    for (const c of tipo?.campos || []) {
      definidos.add(c.chave)
      anexar(especificos, campoMetadado(c, r, marcar))
    }
    // (a ligação às imagens originais tem secção própria, "Fotografias originais")
    const extras = Object.keys(r.metadados).filter((k) => !definidos.has(k) && !['originais', 'originais_conjunto'].includes(k))
    for (const k of extras) {
      anexar(especificos, 
        h(
          'label',
          { class: 'campo' },
          h('span', {}, k, ' ', h('button', { class: 'botao-texto', style: 'font-size:12px', onclick: (e) => (e.preventDefault(), delete r.metadados[k], marcar(), redesenhar()) }, tr('(remover)'))),
          h('input', { type: 'text', value: typeof r.metadados[k] === 'object' ? JSON.stringify(r.metadados[k]) : r.metadados[k], oninput: (e) => ((r.metadados[k] = e.target.value), marcar()) })
        )
      )
    }
    if (!(tipo?.campos || []).length && !extras.length) anexar(especificos, h('p', { class: 'ajuda largo' }, tr('Este tipo ainda não tem campos próprios.')))
    anexar(corpo, especificos, formularioCampoNovo(r, tipo, marcar, redesenhar))

    // Contextos, etiquetas, notas gerais
    const chipsCtx = h('div', { class: 'chips' })
    CONTEXTOS.forEach((c) => {
      const ativo = r.contextos.includes(c)
      anexar(chipsCtx, 
        h(
          'span',
          {
            class: 'chip' + (ativo ? ' ativo' : ''),
            onclick: (e) => {
              if (r.contextos.includes(c)) r.contextos = r.contextos.filter((x) => x !== c)
              else r.contextos.push(c)
              e.target.classList.toggle('ativo')
              marcar()
            },
          },
          tr(c)
        )
      )
    })
    anexar(corpo, 
      h('h3', {}, tr('Finalidade e organização')),
      h('label', { class: 'campo' }, h('span', {}, tr('Contexto / UC associado (opcional)')), chipsCtx),
      h('div', { style: 'height:12px' }),
      campo(
        r.metadados?.palavras_chave_origem ? tr('Palavras-chave (separadas por ponto e vírgula) · origem: {origem}', { origem: tr(r.metadados.palavras_chave_origem) }) : tr('Palavras-chave (separadas por ponto e vírgula)'),
        h('input', {
          type: 'text',
          value: r.palavras_chave.join('; '),
          oninput: (e) => {
            r.palavras_chave = e.target.value.split(';').map((x) => x.trim()).filter(Boolean)
            if (r.metadados) r.metadados.palavras_chave_origem = 'editadas à mão'
            marcar()
          },
        })
      ),
      h('div', { style: 'height:12px' }),
      campo(
        tr('Etiquetas pessoais (separadas por vírgulas)'),
        h('input', {
          type: 'text',
          value: r.tags.join(', '),
          oninput: (e) => ((r.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)), marcar()),
        })
      ),
      h('div', { style: 'height:12px' }),
      campo(tr('Notas gerais / resumo'), h('textarea', { rows: 3, oninput: (e) => ((r.notas = e.target.value), marcar()) }, r.notas || ''))
    )

    // Notas de leitura
    if (r.id) {
      const caixaNotas = h('div', { class: 'caixa' })
      anexar(corpo, h('h2', {}, tr('Notas de leitura')), caixaNotas)
      desenharNotas(caixaNotas, r)
    } else {
      anexar(corpo, h('p', { class: 'ajuda', style: 'margin-top:20px' }, tr('Depois de guardar poderá acrescentar notas de leitura.')))
    }

    // Texto integral
    if (r.id) {
      const caixaTexto = h('div', {})
      anexar(corpo, h('h2', {}, tr('Texto integral')), caixaTexto)
      desenharTexto(caixaTexto, r)
    }

    // Procurar noutros catálogos
    const termo = encodeURIComponent([r.titulo, r.autores?.[0] && nomeAutor(r.autores[0])].filter(Boolean).join(' '))
    anexar(corpo, 
      h('h3', {}, tr('Procurar noutros catálogos')),
      h('div', { class: 'chips' }, PESQUISAS_EXTERNAS.map(([n, u]) => h('a', { class: 'chip', href: u + termo, target: '_blank', rel: 'noopener' }, n + ' ↗'))),
      h('p', { class: 'ajuda' }, tr('O JSTOR e o Google Scholar não permitem pesquisa automática; estas ligações abrem a pesquisa no navegador (com a sua sessão institucional, se a tiver).'))
    )

    if (r.id) {
      anexar(corpo, 
        h('h3', {}, tr('Outras acções')),
        h(
          'div',
          { class: 'linha-flex' },
          r.ficheiro
            ? h(
                'button',
                {
                  class: 'botao pequeno',
                  title: tr('Voltar a ler o ficheiro com as regras e a IA local mais recentes (substitui os dados actuais desta ficha)'),
                  onclick: async () => {
                    if (alterado) await guardar()
                    if (!confirm(tr('Voltar a identificar esta fonte a partir do ficheiro? Os dados actuais da ficha podem ser substituídos. As notas de leitura mantêm-se.'))) return
                    try {
                      await servico('reanalisar', { id: r.id })
                      toast(tr('Em reanálise. A ficha actualiza-se quando terminar (acompanhe em «Actividade»).'))
                      fecharPainel()
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                },
                tr('Reanalisar ficheiro')
              )
            : null,
          r.ficheiro
            ? h(
                'button',
                {
                  class: 'botao pequeno',
                  onclick: async () => {
                    await servico('ocr', { id: r.id })
                    r.ocr_estado = 'pendente'
                    toast(tr('OCR colocado em fila. Pode acompanhar em «Actividade».'))
                    redesenhar()
                  },
                },
                tr('Refazer OCR')
              )
            : null,
          h(
            'button',
            {
              class: 'botao pequeno perigo',
              onclick: async () => {
                if (!confirm(tr('Apagar esta fonte da base de dados? As notas de leitura também são apagadas. O ficheiro (se existir) fica no disco, na pasta biblioteca.'))) return
                await pb.collection('fontes').delete(r.id)
                fecharPainel()
                toast(tr('Fonte apagada.'))
                rota()
              },
            },
            tr('Apagar fonte')
          )
        )
      )
    }

    // Rodapé
    if (r.ficheiro) {
      anexar(rodape, 
        h('label', { class: 'linha-flex', style: 'margin-right:auto;font-size:13px;color:var(--tinta-2)' }, h('input', { type: 'checkbox', id: 'renomear', checked: r.estado === 'completo' }), tr('Actualizar nome e pasta do ficheiro'))
      )
    }
    anexar(rodape, 
      h(
        'button',
        {
          class: 'botao' + (r.estado === 'a_rever' ? '' : ' primario'),
          onclick: async () => {
            const s = await guardar()
            if (s) {
              if (!r.id) return abrirFonte(s.id)
              Object.assign(r, s)
              normalizar()
              redesenhar()
            }
          },
        },
        tr('Guardar')
      )
    )
    if (r.estado === 'a_rever' && r.id) {
      anexar(rodape, 
        h(
          'button',
          {
            class: 'botao primario',
            onclick: async () => {
              const s = await guardar({ confirmar: true })
              if (s) {
                fecharPainel()
                rota()
              }
            },
          },
          tr('Guardar e confirmar')
        )
      )
    }
  }

  const painel = abrirPainel({
    topo,
    corpo,
    rodape,
    aoFechar: () => {
      if (alterado && confirm(tr('Há alterações por guardar. Guardar agora?'))) guardar().then(() => rota())
      else rota()
    },
  })
  painel._alterado = () => alterado
  painel._guardar = () => guardar()
  redesenhar()
}

function papelPadrao(tipo) {
  const n = tipo?.nome || ''
  if (/Partitura|Edição crítica/.test(n)) return 'compositor'
  if (/Gravação|Disco|Registo|Espetáculo/.test(n)) return 'intérprete'
  if (/Instrumento/.test(n)) return 'construtor'
  if (/Vídeo/.test(n)) return 'realizador'
  return 'autor'
}

function campoMetadado(c, r, marcar) {
  const v = r.metadados[c.chave]
  const definir = (valor) => {
    if (valor === '' || valor === null) delete r.metadados[c.chave]
    else r.metadados[c.chave] = valor
    marcar()
  }
  let controlo
  if (c.tipo === 'texto_longo') controlo = h('textarea', { rows: 2, oninput: (e) => definir(e.target.value) }, v || '')
  else if (c.tipo === 'numero') controlo = h('input', { type: 'number', value: v ?? '', oninput: (e) => definir(e.target.value === '' ? '' : Number(e.target.value)) })
  else if (c.tipo === 'url') controlo = h('input', { type: 'url', value: v || '', oninput: (e) => definir(e.target.value) })
  else if (c.tipo === 'data') controlo = h('input', { type: 'text', placeholder: tr('aaaa-mm-dd ou ano'), value: v || '', oninput: (e) => definir(e.target.value) })
  else if (c.tipo === 'lista') controlo = selectSimples(['', ...(c.opcoes || []), ...(v && !(c.opcoes || []).includes(v) ? [v] : [])], v || '', { onchange: (e) => definir(e.target.value) })
  else if (c.tipo === 'sim_nao') controlo = selectSimples({ '': '—', sim: tr('Sim'), nao: tr('Não') }, v === true ? 'sim' : v === false ? 'nao' : '', { onchange: (e) => definir(e.target.value === '' ? '' : e.target.value === 'sim') })
  else controlo = h('input', { type: 'text', value: v || '', oninput: (e) => definir(e.target.value) })
  return campo(tr(c.rotulo), controlo, { class: c.tipo === 'texto_longo' ? 'largo' : '' })
}

function formularioCampoNovo(r, tipo, marcar, redesenhar) {
  const caixa = h('div', { class: 'oculto', style: 'margin-top:12px' })
  const nome = h('input', { type: 'text', placeholder: tr('Nome do campo (ex.: Dedicatário)') })
  const tipoCampo = selectSimples(TIPOS_CAMPO, 'texto')
  const noTipo = h('input', { type: 'checkbox', checked: true })
  anexar(caixa, 
    h(
      'div',
      { class: 'caixa' },
      h('div', { class: 'grelha' }, campo(tr('Nome do campo'), nome), campo(tr('Tipo de valor'), tipoCampo)),
      h('label', { class: 'linha-flex', style: 'margin-top:10px;font-size:14px' }, noTipo, tr('Acrescentar também ao tipo «{tipo}» (fica disponível em todas as fontes deste tipo)', { tipo: tr(tipo?.nome || '') })),
      h(
        'div',
        { class: 'linha-flex', style: 'margin-top:10px' },
        h(
          'button',
          {
            class: 'botao pequeno primario',
            onclick: async () => {
              const rotulo = nome.value.trim()
              if (!rotulo) return
              const chave = slug(rotulo)
              if (noTipo.checked && tipo) {
                const campos = [...(tipo.campos || [])]
                if (!campos.some((c) => c.chave === chave)) campos.push({ chave, rotulo, tipo: tipoCampo.value })
                try {
                  const t = await pb.collection('tipos_fonte').update(tipo.id, { campos })
                  estado.tiposPorId[t.id] = t
                  estado.tipos = estado.tipos.map((x) => (x.id === t.id ? t : x))
                } catch (e) {
                  return toast(mensagemErro(e), true)
                }
              } else if (!(chave in r.metadados)) {
                r.metadados[chave] = ''
                marcar()
              }
              redesenhar()
            },
          },
          tr('Acrescentar campo')
        ),
        h('button', { class: 'botao pequeno', onclick: () => caixa.classList.add('oculto') }, tr('Cancelar'))
      )
    )
  )
  return h('div', {}, h('button', { class: 'botao-texto', style: 'margin-top:10px', onclick: () => (caixa.classList.remove('oculto'), nome.focus()) }, tr('+ Novo campo')), caixa)
}

// ---- Notas de leitura de uma fonte

async function desenharNotas(caixa, fonte) {
  caixa.innerHTML = ''
  let notas = []
  try {
    notas = await pb.collection('notas_leitura').getFullList({ filter: pb.filter('fonte = {:f}', { f: fonte.id }), sort: 'ordem,created' })
  } catch (e) {
    anexar(caixa, h('p', { class: 'mensagem-erro' }, mensagemErro(e)))
  }
  const lista = h('div', {})
  if (!notas.length) anexar(lista, h('p', { class: 'ajuda', style: 'margin:0 0 8px' }, tr('Ainda sem notas. Registe citações, paráfrases, comentários, idéias ou perguntas, com a página, fólio ou minutagem.')))
  notas.forEach((n) => anexar(lista, vistaNota(n, () => desenharNotas(caixa, fonte), true)))
  anexar(caixa, lista, formularioNota(fonte.id, null, () => desenharNotas(caixa, fonte)))
}

function vistaNota(n, aoMudar, editavel, fonteTitulo) {
  const el = h('div', { class: 'nota' })
  const desenhar = () => {
    el.innerHTML = ''
    anexar(el, 
      fonteTitulo ? h('div', { class: 'fonte-nota', onclick: () => abrirFonte(n.fonte) }, fonteTitulo) : null,
      h(
        'div',
        { class: 'cabeca' },
        n.localizacao ? h('strong', {}, n.localizacao) : null,
        n.tipo_nota ? h('span', { class: 'etiqueta' }, tr(n.tipo_nota)) : null,
        (n.contextos || []).map((c) => h('span', { class: 'etiqueta acento' }, tr(c))),
        (n.tags || []).map((t) => h('span', { class: 'etiqueta' }, '#' + t)),
        editavel
          ? h(
              'span',
              { style: 'margin-left:auto' },
              h('button', { class: 'botao-texto', onclick: () => (el.innerHTML = '', anexar(el, formularioNota(n.fonte, n, aoMudar))) }, tr('Editar')),
              ' · ',
              h(
                'button',
                {
                  class: 'botao-texto',
                  style: 'color:var(--erro)',
                  onclick: async () => {
                    if (!confirm(tr('Apagar esta nota?'))) return
                    await pb.collection('notas_leitura').delete(n.id)
                    aoMudar()
                  },
                },
                tr('Apagar')
              )
            )
          : null
      ),
      h('div', { class: 'texto' + (n.tipo_nota === 'Citação' ? ' citacao' : '') }, n.texto)
    )
  }
  desenhar()
  return el
}

function formularioNota(fonteId, nota, aoGuardar) {
  const n = nota ? { ...nota } : { tipo_nota: 'Comentário', localizacao: '', texto: '', tags: [], contextos: [] }
  const aberto = !!nota
  const caixa = h('div', { class: aberto ? '' : 'oculto', style: 'margin-top:10px' })
  const loc = h('input', { type: 'text', placeholder: tr('p. 23 · fól. 3v · 12:30'), value: n.localizacao })
  const tipoN = selectSimples(TIPOS_NOTA, n.tipo_nota)
  const texto = h('textarea', { rows: 4, placeholder: tr('Texto da nota…') }, n.texto)
  const tags = h('input', { type: 'text', placeholder: tr('etiquetas, separadas, por vírgulas'), value: (n.tags || []).join(', ') })
  const ctx = new Set(n.contextos || [])
  const chips = h(
    'div',
    { class: 'chips' },
    CONTEXTOS.map((c) =>
      h(
        'span',
        {
          class: 'chip' + (ctx.has(c) ? ' ativo' : ''),
          onclick: (e) => {
            ctx.has(c) ? ctx.delete(c) : ctx.add(c)
            e.target.classList.toggle('ativo')
          },
        },
        tr(c)
      )
    )
  )
  anexar(caixa, 
    h(
      'div',
      { class: 'grelha' },
      campo(tr('Localização'), loc),
      campo(tr('Tipo de nota'), tipoN),
      campo(tr('Texto'), texto, { class: 'largo' }),
      campo(tr('Etiquetas'), tags, { class: 'largo' }),
      h('div', { class: 'largo' }, h('label', { class: 'campo' }, h('span', {}, tr('Contexto / UC (opcional)'))), chips)
    ),
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h(
        'button',
        {
          class: 'botao pequeno primario',
          onclick: async () => {
            if (!texto.value.trim()) return toast(tr('Escreva o texto da nota.'), true)
            const dados = {
              fonte: fonteId,
              localizacao: loc.value.trim(),
              tipo_nota: tipoN.value,
              texto: texto.value,
              tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean),
              contextos: [...ctx],
            }
            try {
              if (nota) await pb.collection('notas_leitura').update(nota.id, dados)
              else await pb.collection('notas_leitura').create(dados)
              atualizarCarimbos()
              aoGuardar()
            } catch (e) {
              toast(mensagemErro(e), true)
            }
          },
        },
        nota ? tr('Guardar nota') : tr('Acrescentar nota')
      ),
      h('button', { class: 'botao pequeno', onclick: () => (nota ? aoGuardar() : caixa.classList.add('oculto')) }, tr('Cancelar'))
    )
  )
  if (aberto) return caixa
  return h('div', {}, h('button', { class: 'botao pequeno', onclick: (e) => (caixa.classList.remove('oculto'), e.target.remove(), texto.focus()) }, tr('+ Nova nota')), caixa)
}

async function desenharTexto(caixa, fonte) {
  let t = null
  try {
    t = await pb.collection('textos').getFirstListItem(pb.filter('fonte = {:f}', { f: fonte.id }))
  } catch (_) {}
  if (!t || !t.conteudo) {
    const msg = fonte.ocr_estado === 'pendente' || fonte.ocr_estado === 'em_curso' ? tr('O OCR ainda está a decorrer; o texto aparece aqui quando terminar.') : tr('Sem texto extraído para esta fonte.')
    anexar(caixa, h('p', { class: 'ajuda' }, msg))
    return
  }
  const completo = t.conteudo.length <= 6000
  const pre = h('div', { class: 'texto-integral' }, completo ? t.conteudo : t.conteudo.slice(0, 6000) + '…')
  anexar(caixa, 
    h('p', { class: 'ajuda' }, tr('{metodo} · {n} caracteres', { metodo: t.metodo === 'ocr' ? tr('Obtido por OCR (aproximado)') : tr('Extraído do ficheiro'), n: numTxt(t.conteudo.length) })),
    pre,
    completo ? null : h('button', { class: 'botao-texto', style: 'margin-top:6px', onclick: (e) => ((pre.textContent = t.conteudo), e.target.remove()) }, tr('Mostrar o texto completo'))
  )
}

// ---------------------------------------------------------------------------
// Versão beta: comentários dos testers, boas-vindas (nome do dono) e créditos

async function guardarDefinicao(k, v) {
  const reg = estado.defsRegistos[k]
  if (reg) await pb.collection('definicoes').update(reg.id, { valor: v })
  else await pb.collection('definicoes').create({ chave: k, valor: v })
  await carregarDefinicoes()
}

const jsonPublico = {}
async function lerJsonPublico(nome) {
  if (!jsonPublico[nome]) {
    try {
      jsonPublico[nome] = await (await fetch(nome, { cache: 'no-store' })).json()
    } catch (_) {
      jsonPublico[nome] = {}
    }
  }
  return jsonPublico[nome]
}

// Tira das mensagens de erro os caminhos de ficheiros e o que está entre aspas (títulos, nomes): nunca saem conteúdos
// da biblioteca, só a descrição técnica do erro.
function limparMensagem(m) {
  return String(m || '')
    .replace(/(?:~|\/)[^\s«»"“”]*\/[^\s«»"“”]*/g, '‹caminho›')
    .replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, '‹…›')
    .slice(0, 200)
}

async function informacaoTecnica() {
  const linhas = [`TINCTORIS ${VERSAO}`]
  try {
    const s = await servico('sistema')
    linhas[0] += ` · macOS ${s.macos || '?'} (${s.arquitetura || '?'})`
  } catch (_) {}
  linhas.push(`Ecrã: ${VISTAS[vistaAtual()]?.rotulo || vistaAtual()}`)
  try {
    const e = await servico('estado')
    const erros = (e.eventos || []).filter((x) => x.nivel === 'erro').slice(0, 5)
    if (erros.length) linhas.push('Últimos erros:', ...erros.map((x) => `${String(x.quando).slice(0, 16).replace('T', ' ')} ${limparMensagem(x.msg)}`))
  } catch (_) {
    linhas.push('(o serviço de fundo não respondeu)')
  }
  return linhas.join('\n')
}

// Abre o formulário de comentários (Google Forms) com a informação técnica já preenchida. O endereço e o
// identificador do campo estão em pb_public/formulario.json.
async function enviarComentario() {
  const janela = window.open('', '_blank') // (aberta já, para o navegador não a bloquear)
  const f = await lerJsonPublico('formulario.json')
  if (!f.url) {
    janela?.close()
    return toast(tr('O formulário de comentários ainda não está configurado nesta versão.'), true)
  }
  const u = new URL(f.url)
  u.searchParams.set('usp', 'pp_url')
  if (f.campos?.informacao) u.searchParams.set(f.campos.informacao, await informacaoTecnica())
  if (janela) {
    janela.opener = null
    janela.location = u.toString()
  } else location.href = u.toString()
}

// Primeira vez: pede o nome do dono da biblioteca (num PDF digitalizado por ele, ele não é o autor da fonte).
function boasVindas() {
  if (estado.defs.nome_dono || lerPreferencia('boas-vindas-adiadas', false)) return
  const nome = h('input', { type: 'text', id: 'boas-vindas-nome', autocomplete: 'name', placeholder: tr('Ex.: Maria da Conceição Gonçalves') })
  const erro = h('div', { class: 'mensagem-erro' })
  const guardar = async () => {
    if (!nome.value.trim()) return (erro.textContent = tr('Escreva o seu nome, ou carregue em «Mais tarde».'))
    try {
      await guardarDefinicao('nome_dono', nome.value.trim())
      fecharPainel()
      toast(tr('Nome guardado. Pode mudá-lo em Definições.'))
    } catch (e) {
      erro.textContent = mensagemErro(e)
    }
  }
  abrirPainel({
    topo: h('strong', {}, tr('Bem-vindo')),
    corpo: h(
      'div',
      {},
      seletorIdioma(),
      h('h1', {}, tr('Bem-vindo ao TINCTORIS')),
      h('p', { class: 'subtitulo' }, tr('Antes de começar, diga-nos o seu nome.')),
      h('div', { style: 'margin-top:16px' }, campo(tr('O seu nome'), nome)),
      h('p', { class: 'ajuda' }, tr('Serve para o TINCTORIS distinguir o seu trabalho das fontes: num PDF que digitalizou, não é o autor; numa transcrição que fez num editor de partituras, é o editor. Se assina de mais de uma forma, separe-as com «;». Pode mudá-lo em Definições.')),
      erro,
      h('h3', {}, tr('Versão beta')),
      h('p', {}, tr('Se alguma coisa não funcionar, podia funcionar melhor ou faz falta, use «Enviar comentário», no fundo da barra lateral.'))
    ),
    rodape: [h('button', { class: 'botao', onclick: () => (guardarPreferencia('boas-vindas-adiadas', true), fecharPainel()) }, tr('Mais tarde')), h('button', { class: 'botao primario', onclick: guardar }, tr('Guardar'))],
  })
  setTimeout(() => nome.focus(), 50)
}

// Créditos (o mesmo conteúdo do CREDITOS.md, gerado a partir de pb_public/creditos.json)
async function caixaCreditos() {
  const c = await lerJsonPublico('creditos.json')
  const caixa = h('div', { class: 'caixa creditos' })
  if (!c.nota) return anexar(caixa, h('p', { class: 'ajuda' }, tr('Créditos indisponíveis.'))), caixa
  const pessoas = (lista, vazio) =>
    (lista || []).length
      ? h(
          'div',
          { class: 'lista-creditos' },
          lista.map((p) =>
            h(
              'div',
              { class: 'entrada-credito' },
              h('div', { class: 'quem' }, p.nome, p.onde ? h('span', {}, tr(p.onde)) : null),
              h('ul', {}, (p.alteracoes || []).map((a) => h('li', {}, tr(a.texto), a.versao ? h('span', { class: 'versao' }, ' ' + a.versao) : null)))
            )
          )
        )
      : h('p', { class: 'ajuda' }, vazio)
  anexar(
    caixa,
    h('h3', { style: 'margin-top:0' }, tr('Concepção e desenvolvimento')),
    h('p', {}, tr(c.nota)),
    h('h3', {}, tr('Contribuições para o código')),
    pessoas(c.codigo, tr('Ainda sem contribuições.')),
    h('h3', {}, tr('Tradução e revisão')),
    pessoas(c.traducao, tr('Ainda sem contribuições.')),
    h('h3', {}, tr('Beta testers')),
    pessoas(c.testers, tr('Ainda sem contribuições.')),
    h('p', { class: 'ajuda' }, tr('Só aparecem os testers que deixaram o nome e marcaram «Aceito aparecer nos créditos» no formulário de comentários.')),
    h('h3', {}, tr('Projectos e catálogos')),
    h('p', {}, tr('O TINCTORIS existe graças ao trabalho aberto destes projectos:')),
    h('ul', { class: 'projetos-creditos' }, (c.projetos || []).map((p) => h('li', {}, h('strong', {}, p.nome), p.papel ? `, ${tr(p.papel)}` : ''))),
    h('p', { class: 'ajuda' }, tr('Licenças de cada componente: ficheiro TERCEIROS.md. Esta lista também está no ficheiro CREDITOS.md do repositório.'))
  )
  return caixa
}

// Página «Acerca»: versão, licença, como citar e créditos
// Novidades de cada versão (novidades.json, textos em pt e en): a mais recente aberta, as outras fechadas.
async function caixaNovidades() {
  const n = await lerJsonPublico('novidades.json')
  const txt = (o) => (o && (o[IDIOMA] || o.pt)) || ''
  const versao = (v, i) =>
    h(
      'details',
      { open: i === 0, style: i ? 'margin-top:10px' : '' },
      h('summary', {}, h('strong', {}, tr('Versão {versao}', { versao: v.versao })), ' · ', txt(v.data)),
      v.intro ? h('p', {}, txt(v.intro)) : null,
      (v.grupos || []).map((g) => [h('h4', { style: 'margin:12px 0 4px' }, txt(g.titulo)), h('ul', { style: 'margin:0;padding-left:20px' }, (g.itens || []).map((x) => h('li', {}, txt(x))))])
    )
  if (!n.versoes?.length) return h('div', { class: 'caixa' }, tr('Novidades indisponíveis.'))
  return h('div', { class: 'caixa' }, n.versoes.map(versao))
}

function vistaAcerca() {
  const p = principal()
  const citacao = `Sousa Silva, P. (2026). TINCTORIS: Treatises, Inventories, Notation, Codices, Texts, Organology, Records, Iconography and Sources (${tr('Versão {versao}', { versao: VERSAO })}) [Software]. ${REPOSITORIO}`
  const copiarCitacao = async () => {
    try {
      await navigator.clipboard.writeText(citacao)
      toast(tr('Referência copiada.'))
    } catch (e) {
      toast(tr('Não foi possível copiar: {erro}', { erro: mensagemErro(e) }), true)
    }
  }
  const creditos = h('div', {}, h('div', { class: 'caixa' }, tr('A carregar…')))
  caixaCreditos().then((c) => creditos.replaceChildren(c))
  const novidades = h('div', {})
  caixaNovidades().then((c) => novidades.replaceChildren(c))
  anexar(
    p,
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, tr('Acerca')), h('p', { class: 'subtitulo' }, tr('Versão, licença, como citar e créditos.')))),
    h('h2', {}, 'TINCTORIS'),
    h(
      'div',
      { class: 'caixa' },
      h('p', { style: 'margin-top:0' }, h('strong', {}, tr('Versão {versao}', { versao: VERSAO })), tr(' — Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários.')),
      h('p', {}, tr('O nome homenageia Johannes Tinctoris (c. 1435–1511), autor do '), h('em', {}, 'Terminorum musicae diffinitorium'), tr(' (c. 1495), o primeiro dicionário musical impresso.')),
      h('p', {}, tr('© 2026 Pedro Sousa Silva e contribuidores do TINCTORIS. Programa livre, com licença '), h('a', { href: 'https://www.gnu.org/licenses/agpl-3.0.html', target: '_blank', rel: 'noopener' }, tr('GNU AGPL 3.0 ou posterior')), tr('; documentação com licença '), h('a', { href: (IDIOMA === 'pt' ? 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt' : 'https://creativecommons.org/licenses/by-sa/4.0/'), target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'), tr('. Sem qualquer garantia.')),
      h('p', { style: 'margin-bottom:0' }, tr('Código-fonte: '), h('a', { href: REPOSITORIO, target: '_blank', rel: 'noopener' }, REPOSITORIO.replace('https://', '')), tr('. Componentes de terceiros e respectivas licenças: '), h('a', { href: `${REPOSITORIO}/blob/main/TERCEIROS.md`, target: '_blank', rel: 'noopener' }, 'TERCEIROS.md'), '.')
    ),
    h('h2', {}, tr('Novidades')),
    novidades,
    h('h2', {}, tr('Como citar')),
    h('div', { class: 'caixa' }, h('p', { class: 'citacao-programa', style: 'margin-top:0' }, citacao), h('button', { class: 'botao pequeno', onclick: copiarCitacao }, tr('Copiar referência'))),
    h('h2', {}, tr('Créditos')),
    creditos
  )
}

// Página «Ajuda»: manuais e guias (no GitHub público) e envio de comentários
function vistaAjuda() {
  const p = principal()
  const ligacao = (rotulo, caminho) => h('li', {}, h('a', { href: `${REPOSITORIO}/blob/main/${caminho}`, target: '_blank', rel: 'noopener' }, rotulo))
  anexar(
    p,
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, tr('Ajuda')), h('p', { class: 'subtitulo' }, tr('Manuais, guias de instalação e como enviar um comentário.')))),
    h('h2', {}, tr('Manuais e guias')),
    h(
      'div',
      { class: 'caixa' },
      h('ul', { class: 'ligacoes-ajuda' }, ligacao(tr('Manual (português)'), 'README.md'), ligacao(tr('Manual (English)'), 'README.en.md'), ligacao(tr('Guia de instalação'), 'GUIA-INSTALACAO.md'), ligacao(tr('Installation guide (English)'), 'INSTALL.md'), ligacao(tr('Como colaborar'), 'CONTRIBUTING.md')),
      h('p', { class: 'ajuda', style: 'margin-bottom:0' }, tr('As ligações abrem no GitHub (é preciso internet) e mostram sempre a versão mais recente.'))
    ),
    h('h2', {}, tr('Comentários e pedidos de ajuda')),
    h(
      'div',
      { class: 'caixa' },
      h('h3', { style: 'margin-top:0' }, tr('Algo não funciona, podia funcionar melhor ou faz falta?')),
      h('p', { style: 'margin-top:0' }, tr('Envie um comentário: abre um formulário curto, já com a versão do programa e do macOS e os últimos erros técnicos (nunca títulos, nomes de ficheiros nem fontes). Também é aqui que se pede ajuda.')),
      h('button', { class: 'botao', onclick: enviarComentario }, tr('Enviar comentário'))
    )
  )
}

// ---------------------------------------------------------------------------
// Exportar bibliografia

async function abrirExportar(opcoes = {}) {
  let ids = opcoes.ids
  let origem = opcoes.origem
  if (!ids) {
    if (estado.selecionados.size) {
      ids = [...estado.selecionados]
      origem = ids.length > 1 ? tr('{n} fontes seleccionadas', { n: numTxt(ids.length) }) : tr('{n} fonte seleccionada', { n: numTxt(ids.length) })
    } else {
      ids = await idsDaPesquisa()
      origem = tr('todas as {n} fontes da pesquisa actual', { n: numTxt(ids.length) })
    }
  }
  if (!ids.length) return toast(tr('Não há fontes para exportar.'), true)

  let estilos = []
  try {
    estilos = await servico('estilos')
  } catch (e) {
    return toast(tr('O serviço de fundo não está a responder: {erro}', { erro: mensagemErro(e) }), true)
  }
  const estiloSel = selectSimples(Object.fromEntries(estilos.map((e) => [e.id, e.titulo])), lerPreferencia('estilo', 'apa'))
  const linguaSel = selectSimples({ 'pt-PT': tr('Português'), 'en-US': tr('Inglês') }, lerPreferencia('lingua', 'pt-PT'))
  const formatoSel = selectSimples(
    { texto: tr('Texto simples'), html: 'HTML', rtf: tr('RTF (abre no Word com itálicos)'), bibtex: 'BibTeX (LaTeX, Zotero)', ris: 'RIS (Zotero, Mendeley, EndNote)', 'csl-json': 'CSL-JSON', 'notas-md': tr('Notas de leitura (Markdown)') },
    opcoes.formato || lerPreferencia('formato', 'texto')
  )
  const previa = h('div', { class: 'pre-visualizacao' }, tr('A preparar…'))
  let ultimo = null

  const gerar = async (formato) => servico('exportar', { ids, estilo: estiloSel.value, lingua: linguaSel.value, formato })

  const atualizar = async () => {
    guardarPreferencia('estilo', estiloSel.value)
    guardarPreferencia('lingua', linguaSel.value)
    guardarPreferencia('formato', formatoSel.value)
    previa.textContent = tr('A preparar…')
    const f = formatoSel.value
    try {
      if (['texto', 'html', 'rtf'].includes(f)) {
        const r = await gerar('html')
        previa.innerHTML = r.conteudo // HTML gerado localmente pelo citeproc a partir dos seus dados
      } else {
        const r = await gerar(f)
        previa.innerHTML = ''
        anexar(previa, h('pre', {}, r.conteudo))
      }
    } catch (e) {
      previa.textContent = mensagemErro(e)
    }
  }
  ;[estiloSel, linguaSel, formatoSel].forEach((s) => s.addEventListener('change', atualizar))

  const copiar = async () => {
    try {
      const f = formatoSel.value
      if (['texto', 'html', 'rtf'].includes(f)) {
        const [html, texto] = await Promise.all([gerar('html'), gerar('texto')])
        if (window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html.conteudo], { type: 'text/html' }), 'text/plain': new Blob([texto.conteudo], { type: 'text/plain' }) })])
        } else await navigator.clipboard.writeText(texto.conteudo)
      } else {
        await navigator.clipboard.writeText((await gerar(f)).conteudo)
      }
      toast(tr('Copiado. Pode colar no Word ou noutro editor.'))
    } catch (e) {
      toast(tr('Não foi possível copiar: {erro}', { erro: mensagemErro(e) }), true)
    }
  }

  const descarregar = async () => {
    try {
      const r = await gerar(formatoSel.value)
      const blob = new Blob([r.conteudo], { type: r.mime + ';charset=utf-8' })
      const a = h('a', { href: URL.createObjectURL(blob), download: `${formatoSel.value === 'notas-md' ? 'notas-de-leitura' : 'bibliografia'}-${estiloSel.value}.${r.extensao}` })
      anexar(document.body, a)
      a.click()
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000)
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }

  abrirPainel({
    topo: h('strong', {}, tr('Exportar bibliografia')),
    corpo: h(
      'div',
      {},
      h('h1', {}, tr('Exportar')),
      h('p', { class: 'subtitulo' }, tr('A exportar {origem}.', { origem })),
      h('div', { class: 'grelha', style: 'margin-top:16px' }, campo(tr('Estilo de citação'), estiloSel), campo(tr('Língua dos termos'), linguaSel), campo(tr('Formato'), formatoSel)),
      h('h3', {}, tr('Pré-visualização')),
      previa,
      h('p', { class: 'ajuda' }, tr('Pode acrescentar outros estilos colocando ficheiros .csl (de zotero.org/styles) na pasta app/estilos.'))
    ),
    rodape: [h('button', { class: 'botao', onclick: copiar }, tr('Copiar')), h('button', { class: 'botao primario', onclick: descarregar }, tr('Descarregar ficheiro'))],
  })
  atualizar()
}

// ---------------------------------------------------------------------------
// Importar bibliotecas (BibTeX / RIS)

async function vistaImportar() {
  const p = principal()
  const area = h('div', {})
  p.append(
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, tr('Importar')), h('p', { class: 'subtitulo' }, tr('Traga a sua biblioteca do Mendeley, do Zotero ou de outro gestor de referências.')))),
    area
  )

  const mostrarProgresso = () => {
    area.innerHTML = ''
    const caixa = h('div', { class: 'caixa' })
    area.append(caixa)
    let ativo = true
    const atualizar = async () => {
      if (!ativo || !document.body.contains(caixa)) return
      let e
      try {
        e = await servico('importacao')
      } catch (err) {
        caixa.textContent = mensagemErro(err)
        return
      }
      if (!e) return
      const pct = Math.round((100 * e.feitas) / Math.max(1, e.total))
      caixa.innerHTML = ''
      anexar(
        caixa,
        h('h3', { style: 'margin-top:0' }, e.terminado ? tr('Importação concluída') : tr('A importar…')),
        h('div', { class: 'progresso', style: 'margin:8px 0' }, h('div', { style: `width:${pct}%` })),
        h('p', {}, tr('{feitas} de {total} referências processadas · {criadas} fontes novas', { feitas: numTxt(e.feitas), total: numTxt(e.total), criadas: numTxt(e.criadas) }) + (e.completadas ? tr(' · {n} completadas online', { n: numTxt(e.completadas) }) : '') + (e.enriquecidas ? tr(' · {n} já existentes completadas com os dados do ficheiro', { n: numTxt(e.enriquecidas) }) : '') + (e.notas ? tr(' · {n} notas', { n: numTxt(e.notas) }) : '') + (e.ficheiros ? tr(' · {n} ficheiros', { n: numTxt(e.ficheiros) }) : '')),
        e.erros.length ? h('details', {}, h('summary', {}, tr('{n} problema(s)', { n: numTxt(e.erros.length) })), h('div', { class: 'registo' }, e.erros.slice(0, 200).map((x) => h('div', { class: 'erro' }, x)))) : null,
        e.terminado
          ? h('div', { class: 'linha-flex', style: 'margin-top:12px' }, h('a', { class: 'botao primario', href: '#/fontes' }, tr('Ver as fontes')), h('a', { class: 'botao', href: '#/rever' }, tr('Ver as que estão por rever')))
          : h('p', { class: 'ajuda' }, tr('Pode continuar a usar a biblioteca enquanto a importação decorre.'))
      )
      if (e.terminado) {
        ativo = false
        atualizarContagem()
      } else setTimeout(atualizar, 1000)
    }
    atualizar()
  }

  // Importação já a decorrer?
  try {
    const e = await servico('importacao')
    if (e && !e.terminado) return mostrarProgresso()
  } catch (_) {}

  const entrada = h('input', { type: 'file', accept: '.bib,.bibtex,.ris,.txt', style: 'display:none' })
  const resultado = h('div', {})
  entrada.addEventListener('change', async () => {
    const f = entrada.files[0]
    if (!f) return
    resultado.innerHTML = ''
    resultado.append(h('p', { class: 'ajuda' }, tr('A analisar «{nome}»…', { nome: f.name })))
    let r
    try {
      const texto = await f.text()
      r = await servico('importar-analisar', { texto, nome: f.name })
    } catch (e) {
      resultado.innerHTML = ''
      return resultado.append(h('div', { class: 'caixa destaque' }, tr('Não foi possível ler o ficheiro: '), mensagemErro(e)))
    }
    mostrarAnalise(r, f.name)
  })

  const mostrarAnalise = (r, nome) => {
    resultado.innerHTML = ''
    const novas = r.total - r.duplicados
    const completar = h('input', { type: 'checkbox', checked: true })
    const pastas = h('input', { type: 'checkbox', checked: true })
    const copiar = h('input', { type: 'checkbox', checked: true })
    const contexto = selectSimples({ '': tr('— nenhum —'), ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, '')
    anexar(
      resultado,
      h('h2', {}, `«${nome}»`),
      h(
        'div',
        { class: 'caixa' },
        h('div', { style: 'font-size:21px;font-weight:600' }, novas === 1 ? tr('1 fonte nova') : tr('{n} fontes novas', { n: numTxt(novas) })),
        h('p', { class: 'ajuda', style: 'margin-top:2px' }, tr('de {total} referências no ficheiro', { total: numTxt(r.total) }) + (r.duplicados ? ' — ' + (r.duplicados === 1 ? tr('1 é uma repetição') : tr('{n} são repetições', { n: numTxt(r.duplicados) })) + tr(' (dentro do ficheiro ou de fontes que já estão na biblioteca). Não se criam fontes duplicadas: as que já existem são completadas com os dados deste ficheiro.') : '.')),
        h('div', { class: 'chips', style: 'margin-top:10px' }, Object.entries(r.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'etiqueta' }, `${tr(t)}: ${numTxt(n)}`))),
        r.incompletas ? h('p', {}, h('strong', {}, r.incompletas === 1 ? tr('1 está incompleta') : tr('{n} estão incompletas', { n: numTxt(r.incompletas) })), tr(' (sem autor ou sem data). Ficam em «Por rever» para completar.')) : null,
        r.comNotas ? h('p', {}, r.comNotas === 1 ? tr('1 tem anotações do Mendeley — passam a notas de leitura.') : tr('{n} têm anotações do Mendeley — passam a notas de leitura.', { n: numTxt(r.comNotas) })) : null,
        r.comFicheiros ? h('p', {}, r.comFicheiros === 1 ? tr('1 tem PDF anexado; {encontrados} encontrado(s) neste computador.', { encontrados: numTxt(r.ficheirosEncontrados) }) : tr('{n} têm PDF anexado; {encontrados} encontrado(s) neste computador.', { n: numTxt(r.comFicheiros), encontrados: numTxt(r.ficheirosEncontrados) }), r.semAcesso ? tr(' (O macOS pode pedir autorização para aceder à pasta dos PDFs.)') : '') : null,
        r.grupos.length ? h('p', {}, tr('Pastas do Mendeley: {pastas}', { pastas: r.grupos.join(', ') })) : null,
        h('h3', {}, tr('Exemplos')),
        h('ul', { style: 'margin:0;padding-left:20px' }, r.exemplos.map((x) => h('li', {}, x.titulo, h('span', { class: 'ajuda' }, ` — ${x.data || tr('s.d.')} · ${tr(x.tipo)}`))))
      ),
      h('h2', {}, tr('Opções')),
      h(
        'div',
        { class: 'caixa' },
        r.incompletas
          ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, completar, tr('Procurar online o que falta nas {n} referências incompletas (demora cerca de {min} min; só preenche campos vazios)', { n: numTxt(r.incompletas), min: Math.max(1, Math.round(r.incompletas / 40)) }))
          : null,
        r.grupos.length ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, pastas, tr('Transformar as pastas do Mendeley em etiquetas')) : null,
        r.ficheirosEncontrados ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, copiar, tr('Copiar os PDFs para a biblioteca (o original fica onde está)')) : null,
        h('label', { class: 'campo', style: 'margin-top:10px;max-width:420px' }, h('span', {}, tr('Atribuir um contexto / UC a todas (opcional)')), contexto)
      ),
      h(
        'div',
        { class: 'linha-flex', style: 'margin-top:16px' },
        h(
          'button',
          {
            class: 'botao primario',
            disabled: !novas,
            onclick: async () => {
              try {
                await servico('importar', {
                  id: r.id,
                  opcoes: { ignorarDuplicados: true, completarOnline: completar.checked, pastasComoEtiquetas: pastas.checked, copiarFicheiros: copiar.checked, contexto: contexto.value },
                })
                mostrarProgresso()
              } catch (e) {
                toast(mensagemErro(e), true)
              }
            },
          },
          novas === 1 ? tr('Importar 1 fonte') : tr('Importar {n} fontes', { n: numTxt(novas) })
        ),
        h('button', { class: 'botao', onclick: () => vistaImportar() }, tr('Cancelar'))
      )
    )
  }

  anexar(
    area,
    h(
      'div',
      { class: 'caixa' },
      h('h3', { style: 'margin-top:0' }, tr('Como exportar')),
      h('p', { style: 'margin:4px 0' }, h('strong', {}, 'Mendeley: '), tr('seleccione todas as referências (⌘A) → Exportar → BibTeX (.bib).')),
      h('p', { style: 'margin:4px 0' }, h('strong', {}, 'Zotero: '), tr('Ficheiro → Exportar biblioteca → BibTeX ou RIS.')),
      h('p', { class: 'ajuda' }, tr('Primeiro vê-se um resumo do que vai ser importado; nada é gravado até confirmar. As repetições são detectadas e ignoradas.')),
      h('button', { class: 'botao primario', style: 'margin-top:8px', onclick: () => entrada.click() }, tr('Escolher ficheiro…')),
      entrada
    ),
    resultado
  )
}

// ---------------------------------------------------------------------------
// Notas de leitura (todas)

async function vistaNotas() {
  const p = principal()
  const filtro = { q: '', tipo: '', contexto: '' }
  const lista = h('div', {})
  let ultimas = []
  const carregar = async () => {
    const partes = []
    const params = {}
    if (filtro.q) (partes.push('(texto ~ {:q} || localizacao ~ {:q} || tags ~ {:q} || fonte.titulo ~ {:q})'), (params.q = filtro.q))
    if (filtro.tipo) (partes.push('tipo_nota = {:t}'), (params.t = filtro.tipo))
    if (filtro.contexto) (partes.push('contextos ?= {:c}'), (params.c = filtro.contexto))
    lista.innerHTML = ''
    try {
      const r = await pb.collection('notas_leitura').getList(1, 300, { filter: partes.length ? pb.filter(partes.join(' && '), params) : '', sort: '-updated', expand: 'fonte' })
      ultimas = r.items
      if (!r.items.length) {
        anexar(lista, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, tr('Sem notas')), tr('As notas de leitura acrescentam-se na ficha de cada fonte.'))))
        return
      }
      const caixa = h('div', { class: 'caixa' })
      r.items.forEach((n) => anexar(caixa, vistaNota(n, carregar, false, n.expand?.fonte ? `${n.expand.fonte.titulo}${n.expand.fonte.data ? ' (' + n.expand.fonte.data + ')' : ''}` : '')))
      anexar(lista, h('p', { class: 'ajuda' }, r.totalItems === 1 ? tr('1 nota') : tr('{n} notas', { n: numTxt(r.totalItems) })), caixa)
    } catch (e) {
      anexar(lista, h('p', { class: 'mensagem-erro' }, mensagemErro(e)))
    }
  }
  const aoEscrever = atraso(carregar, 300)
  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, tr('Notas de leitura')), h('p', { class: 'subtitulo' }, tr('Todas as suas notas, de todas as fontes.'))),
      h(
        'button',
        {
          class: 'botao',
          onclick: () => {
            const ids = [...new Set(ultimas.map((n) => n.fonte))]
            abrirExportar({ ids, origem: ids.length === 1 ? tr('as notas de 1 fonte') : tr('as notas de {n} fontes', { n: numTxt(ids.length) }), formato: 'notas-md' })
          },
        },
        tr('Exportar estas notas')
      )
    ),
    h(
      'div',
      { class: 'grelha', style: 'margin-bottom:14px' },
      campo(tr('Pesquisar nas notas'), h('input', { type: 'search', placeholder: tr('palavra, página, etiqueta, título da fonte…'), oninput: (e) => ((filtro.q = e.target.value), aoEscrever()) })),
      campo(tr('Tipo de nota'), selectSimples({ '': tr('Todos'), ...Object.fromEntries(TIPOS_NOTA.map((t) => [t, t])) }, '', { onchange: (e) => ((filtro.tipo = e.target.value), carregar()) })),
      campo(tr('Contexto / UC'), selectSimples({ '': tr('Todos'), ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, '', { onchange: (e) => ((filtro.contexto = e.target.value), carregar()) }))
    ),
    lista
  )
  carregar()
}

// ---------------------------------------------------------------------------
// Tipos de fonte (esquema extensível)

async function vistaTipos() {
  await carregarTipos()
  const p = principal()
  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, tr('Tipos de fonte')), h('p', { class: 'subtitulo' }, tr('Crie tipos novos e defina os campos de cada um. As alterações aplicam-se de imediato.'))),
      h('button', { class: 'botao primario', onclick: () => editarTipo(null) }, tr('+ Novo tipo'))
    )
  )
  for (const cat of CATEGORIAS) {
    const tipos = estado.tipos.filter((t) => (t.categoria || 'Outro') === cat)
    if (!tipos.length) continue
    const l = h('div', { class: 'lista' })
    tipos.forEach((t) =>
      anexar(l, 
        h(
          'div',
          { class: 'item', style: 'grid-template-columns:1fr auto', onclick: () => editarTipo(t) },
          h('div', {}, h('div', { class: 'titulo' }, tr(t.nome)), h('div', { class: 'meta' }, (t.campos || []).map((c) => tr(c.rotulo)).join(' · ') || tr('Sem campos próprios'))),
          h('div', { class: 'lado' }, h('span', { class: 'etiqueta' }, CSL_TIPOS[t.csl_tipo] || t.csl_tipo || '—'), t.natureza_padrao ? h('span', { class: 'etiqueta' }, tr(t.natureza_padrao)) : null)
        )
      )
    )
    anexar(p, h('h2', {}, tr(cat)), l)
  }
}

function editarTipo(t) {
  const r = t ? JSON.parse(JSON.stringify(t)) : { nome: '', categoria: 'Escrita', csl_tipo: 'document', csl_genero: '', natureza_padrao: '', descricao: '', campos: [], ordem: (estado.tipos.length + 1) * 10 }
  r.campos = Array.isArray(r.campos) ? r.campos : []
  const corpo = h('div', {})
  const camposBox = h('div', { class: 'campos-tipo caixa' })

  const desenharCampos = () => {
    camposBox.innerHTML = ''
    if (!r.campos.length) anexar(camposBox, h('p', { class: 'ajuda', style: 'margin:0' }, tr('Sem campos. Acrescente os que precisar.')))
    r.campos.forEach((c, i) => {
      const opcoes = h('input', { type: 'text', placeholder: tr('opções, separadas, por vírgulas'), value: (c.opcoes || []).join(', '), oninput: (e) => (c.opcoes = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) })
      anexar(camposBox, 
        h(
          'div',
          { class: 'campo-def' },
          h('input', { type: 'text', placeholder: tr('Nome do campo'), value: c.rotulo, oninput: (e) => ((c.rotulo = e.target.value), c._novo && (c.chave = slug(e.target.value))) }),
          selectSimples(TIPOS_CAMPO, c.tipo || 'texto', { onchange: (e) => ((c.tipo = e.target.value), desenharCampos()) }),
          c.tipo === 'lista' ? opcoes : h('span', { class: 'ajuda', style: 'margin:0' }, c.chave ? tr('chave: {chave}', { chave: c.chave }) : ''),
          selectSimples(CSL_VARS, c.csl || '', { title: tr('Como este campo aparece nas citações'), onchange: (e) => (e.target.value ? (c.csl = e.target.value) : delete c.csl) }),
          h(
            'span',
            { class: 'linha-flex', style: 'gap:4px' },
            h('button', { class: 'botao pequeno', title: tr('Subir'), disabled: i === 0, onclick: () => (r.campos.splice(i - 1, 0, r.campos.splice(i, 1)[0]), desenharCampos()) }, '↑'),
            h('button', { class: 'botao pequeno', title: tr('Descer'), disabled: i === r.campos.length - 1, onclick: () => (r.campos.splice(i + 1, 0, r.campos.splice(i, 1)[0]), desenharCampos()) }, '↓'),
            h('button', { class: 'botao-icone', title: tr('Remover'), onclick: () => (r.campos.splice(i, 1), desenharCampos()) }, '✕')
          )
        )
      )
    })
  }
  desenharCampos()

  anexar(corpo, 
    h('h1', {}, t ? tr(t.nome) : tr('Novo tipo de fonte')),
    h(
      'div',
      { class: 'grelha', style: 'margin-top:14px' },
      campo(tr('Nome'), h('input', { type: 'text', value: r.nome, oninput: (e) => (r.nome = e.target.value) })),
      campo(tr('Categoria'), selectSimples(CATEGORIAS, r.categoria, { onchange: (e) => (r.categoria = e.target.value) })),
      campo(tr('Natureza por omissão'), selectSimples({ '': '—', primária: tr('Primária'), secundária: tr('Secundária') }, r.natureza_padrao, { onchange: (e) => (r.natureza_padrao = e.target.value) })),
      campo(tr('Tipo para citações'), selectSimples(CSL_TIPOS, r.csl_tipo || 'document', { onchange: (e) => (r.csl_tipo = e.target.value) })),
      campo(tr('Designação na citação (opcional, ex.: «Carta»)'), h('input', { type: 'text', value: r.csl_genero || '', oninput: (e) => (r.csl_genero = e.target.value) })),
      campo(tr('Descrição'), h('textarea', { rows: 2, oninput: (e) => (r.descricao = e.target.value) }, r.descricao || ''), { class: 'largo' })
    ),
    h('h3', {}, tr('Campos próprios')),
    h('p', { class: 'ajuda', style: 'margin-top:-4px' }, tr('Coluna final: como o campo entra nas citações (ex.: «Cota» → Cota). Deixe «não entra» para campos só de trabalho.')),
    camposBox,
    h('button', { class: 'botao pequeno', style: 'margin-top:10px', onclick: () => (r.campos.push({ chave: '', rotulo: '', tipo: 'texto', _novo: true }), desenharCampos()) }, tr('+ Campo'))
  )

  const guardar = async () => {
    if (!r.nome.trim()) return toast(tr('Indique o nome do tipo.'), true)
    const vistos = new Set()
    const campos = r.campos
      .filter((c) => c.rotulo.trim())
      .map((c) => {
        let chave = c.chave || slug(c.rotulo)
        while (vistos.has(chave)) chave += '_2'
        vistos.add(chave)
        const out = { chave, rotulo: c.rotulo.trim(), tipo: c.tipo || 'texto' }
        if (c.csl) out.csl = c.csl
        if (c.tipo === 'lista') out.opcoes = c.opcoes || []
        return out
      })
    const dados = { nome: r.nome.trim(), categoria: r.categoria, csl_tipo: r.csl_tipo, csl_genero: r.csl_genero || '', natureza_padrao: r.natureza_padrao || '', descricao: r.descricao || '', campos, ordem: r.ordem }
    try {
      if (t) await pb.collection('tipos_fonte').update(t.id, dados)
      else await pb.collection('tipos_fonte').create(dados)
      await carregarTipos()
      fecharPainel()
      toast(tr('Tipo guardado.'))
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }

  const apagar = async () => {
    const usos = await pb.collection('fontes').getList(1, 1, { filter: pb.filter('tipo = {:t}', { t: t.id }), fields: 'id' })
    if (usos.totalItems) return toast(tr('Não é possível apagar: há {n} fonte(s) deste tipo. Mude-lhes o tipo primeiro.', { n: numTxt(usos.totalItems) }), true)
    if (!confirm(tr('Apagar o tipo «{nome}»?', { nome: tr(t.nome) }))) return
    await pb.collection('tipos_fonte').delete(t.id)
    await carregarTipos()
    fecharPainel()
  }

  abrirPainel({
    topo: h('strong', {}, tr('Tipo de fonte')),
    corpo,
    rodape: [t ? h('button', { class: 'botao perigo', style: 'margin-right:auto', onclick: apagar }, tr('Apagar tipo')) : null, h('button', { class: 'botao primario', onclick: guardar }, tr('Guardar tipo'))],
    aoFechar: () => vistaAtual() === 'tipos' && setTimeout(vistaTipos, 0),
  })
}

// ---------------------------------------------------------------------------
// Atividade do serviço de fundo

// Intensidade do trabalho de fundo: poupar a bateria do portátil (o serviço decide o resto; ver intensidade.js)
const NIVEIS_INTENSIDADE = [
  ['automatico', tr('Automático'), tr('Ligado ao carregador trabalha à velocidade máxima; a bateria passa sozinho a poupança.')],
  ['maxima', tr('Máxima'), tr('Tudo à velocidade normal, incluindo o OCR. O Mac não adormece enquanto a biblioteca está aberta.')],
  ['poupanca', tr('Poupança'), tr('OCR parado; pausa de 30 s entre reanálises; prioridade baixa. Os ficheiros novos da watch folder continuam a entrar.')],
  ['pausa', tr('Pausa'), tr('Nada é processado. As filas ficam guardadas e continuam quando escolher outro nível.')],
]
function caixaIntensidade(i, depois) {
  if (!i) return h('div', { class: 'caixa destaque' }, tr('Para escolher a intensidade, reinicie o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).'))
  const rotulo = Object.fromEntries(NIVEIS_INTENSIDADE.map(([k, r]) => [k, r]))
  const energia = i.bateria === null ? (i.carregador ? tr('ligado ao carregador') : '') : `${i.carregador ? tr('ligado ao carregador') : tr('a bateria')} · ${i.bateria}%`
  const escolher = async (nivel) => {
    try {
      await servico('intensidade', { nivel })
      toast(tr('Intensidade: {nivel}.', { nivel: rotulo[nivel] }))
    } catch (err) {
      toast(err.message || tr('Não foi possível mudar a intensidade.'))
    }
    depois()
  }
  const descricao = (NIVEIS_INTENSIDADE.find(([k]) => k === i.nivel) || [])[2] || ''
  return h(
    'div',
    { class: 'caixa', style: 'margin-bottom:14px' },
    h('h3', { style: 'margin-top:0' }, tr('Intensidade do trabalho de fundo')),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, ...NIVEIS_INTENSIDADE.map(([k, r]) => h('button', { class: k === i.nivel ? 'botao primario' : 'botao', 'aria-pressed': String(k === i.nivel), onclick: () => k !== i.nivel && escolher(k) }, r))),
    h('div', { class: 'ajuda' }, descricao),
    h('div', { class: 'ajuda' }, tr('Agora: {nivel}{energia}.', { nivel: rotulo[i.efetivo] || i.efetivo, energia: energia ? ` (${energia})` : '' }))
  )
}

function vistaAtividade() {
  const p = principal()
  const conteudo = h('div', {})
  anexar(p, h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, tr('Actividade')), h('p', { class: 'subtitulo' }, tr('O que o serviço de fundo está a fazer: watch folder, metadados e OCR.')))), conteudo)
  let ativo = true
  const atualizar = async () => {
    if (!ativo) return
    let e
    try {
      e = await servico('estado')
    } catch (err) {
      conteudo.innerHTML = ''
      anexar(conteudo, h('div', { class: 'caixa destaque' }, h('strong', {}, tr('O serviço de fundo não está a responder. ')), tr('A watch folder, o OCR e a exportação ficam parados até ele voltar. Reinicie o TINCTORIS com o ficheiro «Iniciar TINCTORIS».')))
      return
    }
    conteudo.innerHTML = ''
    const pct = e.ocr ? Math.round((100 * e.ocr.pagina) / Math.max(1, e.ocr.total)) : 0
    anexar(conteudo, caixaIntensidade(e.intensidade, atualizar))
    anexar(conteudo, 
      h(
        'div',
        { class: 'grelha' },
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, tr('Watch folder')), e.entrada.ativo ? h('div', {}, tr('A processar: '), h('strong', {}, e.entrada.ativo)) : h('div', {}, tr('Em espera.')), h('div', { class: 'ajuda' }, e.entrada.novos === undefined ? tr('{n} ficheiro(s) em fila', { n: numTxt(e.entrada.pendentes) }) : tr('Novos: {novos} · Reanálise: {reanalise}', { novos: numTxt(e.entrada.novos), reanalise: numTxt(e.entrada.pendentes - e.entrada.novos) }))),
        h(
          'div',
          { class: 'caixa' },
          h('h3', { style: 'margin-top:0' }, 'OCR'),
          e.ocr ? [h('div', {}, h('strong', {}, e.ocr.titulo)), h('div', { class: 'ajuda' }, tr('página {pagina} de {total}', { pagina: numTxt(e.ocr.pagina), total: numTxt(e.ocr.total) })), h('div', { class: 'progresso' }, h('div', { style: `width:${pct}%` }))] : h('div', {}, tr('Em espera.')),
          h('div', { class: 'ajuda' }, tr('{n} documento(s) em fila', { n: numTxt(e.ocr_pendentes) }))
        ),
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, tr('Por rever')), h('div', { style: 'font-size:26px;font-weight:600;font-variant-numeric:tabular-nums' }, e.por_rever), h('a', { href: '#/rever' }, tr('Abrir lista'))),
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, tr('IA local')), h('div', {}, e.ia?.disponivel ? h('span', { class: 'etiqueta ok' }, tr('Ligada')) : h('span', { class: 'etiqueta rever' }, tr('Desligada'))), h('div', { class: 'ajuda' }, e.ia?.modelo || ''))
      ),
      h('h2', {}, tr('Aceder a partir de outros dispositivos')),
      h(
        'div',
        { class: 'caixa' },
        e.so_local
          ? h('p', { style: 'margin:0' }, tr('O TINCTORIS está a abrir só neste Mac. Para o abrir também no iPad ou noutro computador da mesma rede Wi-Fi, desligue «Abrir só neste Mac» em Definições e volte a abrir o TINCTORIS.'))
          : e.enderecos?.length
          ? [h('p', { style: 'margin-top:0' }, tr('No iPad, telemóvel ou outro computador ligado à mesma rede Wi-Fi, abra no navegador:')), ...e.enderecos.map((u) => h('div', {}, h('a', { href: u, target: '_blank' }, u)))]
          : h('p', { style: 'margin:0' }, tr('Sem ligação de rede detectada.'))
      ),
      h('h2', {}, tr('Pastas')),
      h('div', { class: 'caixa' }, h('div', {}, h('strong', {}, tr('Entrada (watch folder): ')), e.pastas.watch_folder), h('div', {}, h('strong', {}, tr('Biblioteca organizada: ')), e.pastas.biblioteca)),
      h('h2', {}, tr('Registo')),
      h('div', { class: 'caixa registo' }, e.eventos.length ? e.eventos.map((ev) => h('div', { class: ev.nivel }, new Date(ev.quando).toLocaleTimeString(LOCALE), ' — ', ev.msg)) : h('div', {}, tr('Sem actividade desde o arranque.')))
    )
  }
  atualizar()
  const t = setInterval(atualizar, 3000)
  pararAtividade = () => {
    ativo = false
    clearInterval(t)
  }
}

// ---------------------------------------------------------------------------
// Duplicados: pares de PDFs quase iguais que precisam de uma decisão (os certos já foram juntados
// pelo comando "./biblioteca duplicados --aplicar"). Um par de cada vez, os dois PDFs lado a lado.

async function vistaDuplicados() {
  const p = principal()
  const conteudo = h('div', {})
  anexar(
    p,
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, tr('Duplicados')), h('p', { class: 'subtitulo' }, tr('PDFs muito parecidos. Veja os dois e decida: se forem o mesmo documento, escolha a ficha que fica; a outra deixa de existir (as notas de leitura e etiquetas passam para a que fica) e o ficheiro vai para a pasta _duplicados, sem ser apagado.')))
    ),
    secaoEspaco(),
    h('h2', {}, tr('Pares por decidir')),
    conteudo
  )
  let dados
  try {
    dados = await servico('duplicados')
  } catch (e) {
    const antigo = /desconhecida/i.test(mensagemErro(e))
    anexar(conteudo, h('div', { class: 'caixa destaque' }, antigo ? tr('Este ecrã fica activo depois de reiniciar o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).') : tr('O serviço de fundo não respondeu: {erro}', { erro: mensagemErro(e) })))
    return
  }
  const pares = dados.pares
  let i = 0
  const mostrar = () => {
    conteudo.innerHTML = ''
    fusao.innerHTML = ''
    if (!pares.length) {
      anexar(conteudo, h('div', { class: 'caixa' }, dados.gerado_em ? tr('Não há pares por decidir.') : tr('Ainda não foi feita nenhuma procura de duplicados.')))
      return
    }
    if (i >= pares.length) i = 0
    const par = pares[i]
    const lado = (f, outra) => {
      const url = `/api/bib/ficheiro/${f.id}?token=${encodeURIComponent(pb.authStore.token)}`
      const aMais = (f.paginas || 0) - (outra.paginas || 0)
      return h(
        'div',
        { class: 'caixa', style: 'min-width:0;display:flex;flex-direction:column;gap:8px' },
        h('div', {}, h('strong', {}, numeroFmt(f.numero)), ' ', h('span', { class: 'etiqueta' + (f.estado === 'a_rever' ? ' rever' : '') }, ESTADOS[f.estado] || f.estado)),
        h('div', { style: 'font-size:16px;font-weight:600' }, f.titulo || tr('(sem título)')),
        h('div', { class: 'ajuda' }, [autoresTexto(f.autores), f.data || f.ano, f.editora].filter(Boolean).join(' · ') || tr('sem autor nem data')),
        h('div', { class: 'ajuda', style: 'word-break:break-all' }, tr('{paginas} páginas{mais} · ficheiro original: {ficheiro}', { paginas: f.paginas || '?', mais: aMais > 0 ? tr(' ({n} a mais)', { n: numTxt(aMais) }) : '', ficheiro: f.ficheiro_original || '—' })),
        h('iframe', { src: url, title: f.titulo, style: 'width:100%;height:65vh;border:1px solid var(--linha);border-radius:8px;background:#fff' }),
        h('div', { class: 'linha-flex' }, h('button', { class: 'botao primario', onclick: () => decidir({ decisao: 'manter', manter: f.id }) }, tr('Ficar com esta ficha')), h('a', { class: 'botao', href: url, target: '_blank' }, tr('Abrir à parte')), h('a', { class: 'botao', href: '#', onclick: (e) => (e.preventDefault(), abrirFonte(f.id)) }, tr('Ver ficha')))
      )
    }
    // (antes/depois: passos da fusão — gravar os dados escolhidos na ficha que fica, e renomear o ficheiro)
    const decidir = async (corpo, { antes, depois } = {}) => {
      conteudo.querySelectorAll('button').forEach((b) => (b.disabled = true))
      try {
        if (antes) await antes()
        const r = await servico('duplicados-decidir', { a: par.a, b: par.b, ...corpo })
        if (depois) await depois()
        toast(corpo.decisao === 'manter' ? tr('Fica {manter}; {retirada} retirada.', { manter: r.manter, retirada: r.retirada }) : tr('Marcados como diferentes: não voltam a aparecer.'))
        // (a ficha retirada desaparece também dos outros pares em que estava)
        const fora = corpo.decisao === 'manter' ? (corpo.manter === par.a ? par.b : par.a) : null
        pares.splice(i, 1)
        if (fora) for (let k = pares.length - 1; k >= 0; k--) if (pares[k].a === fora || pares[k].b === fora) (pares.splice(k, 1), k < i && i--)
      } catch (e) {
        toast(mensagemErro(e), true)
      }
      mostrar()
    }
    const semelhanca = par.titulos_diferentes && par.alta <= 50 && par.paginas[0] === par.paginas[1] ? tr('O mesmo PDF em duas fichas com títulos diferentes: uma delas deve ter o ficheiro errado (veja as fichas antes de decidir).') : par.paginas[0] !== par.paginas[1] ?tr('Mesmo conteúdo, mas um tem páginas a mais (capa, página em branco…).') : par.alta <= 50 ? tr('Praticamente iguais.') : tr('Muito parecidos: pode ser o mesmo documento com outra digitalização, ou partes/edições diferentes da mesma obra.')
    anexar(
      conteudo,
      h(
        'div',
        { class: 'linha-flex', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px' },
        h('div', {}, h('strong', {}, tr('Par {i} de {total}', { i: i + 1, total: pares.length })), ' — ', semelhanca),
        h(
          'div',
          { class: 'linha-flex', style: 'gap:8px' },
          h('button', { class: 'botao', onclick: () => abrirFusao() }, tr('Fundir as duas…')),
          h('button', { class: 'botao', onclick: () => decidir({ decisao: 'diferentes' }) }, tr('São diferentes')),
          h('button', { class: 'botao', disabled: pares.length < 2, onclick: () => ((i = (i + 1) % pares.length), mostrar()) }, tr('Saltar (decidir depois)'))
        )
      ),
      fusao,
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:16px' }, lado(par.fa, par.fb), lado(par.fb, par.fa))
    )

    // Fundir: juntar numa só ficha a informação das duas, campo a campo (ex.: o título da cantata de uma
    // e o BWV da outra). Fica a ficha escolhida, com os dados escolhidos; a outra é retirada como em
    // "Ficar com esta ficha" (notas, etiquetas e o nome do ficheiro passam também).
    async function abrirFusao() {
      fusao.innerHTML = ''
      let A, B
      try {
        ;[A, B] = await Promise.all([pb.collection('fontes').getOne(par.a), pb.collection('fontes').getOne(par.b)])
      } catch (e) {
        return toast(mensagemErro(e), true)
      }
      const completas = [A, B].filter((f) => f.estado === 'completo')
      let fica = completas.length === 1 ? completas[0] : A.numero < B.numero ? A : B
      const ler = (f, k) => (k === 'catalogo' ? String(f.metadados?.catalogo || '') : k === 'autores' ? f.autores || [] : String(f[k] || ''))
      const escolhas = {}
      const linhas = h('div', { style: 'display:flex;flex-direction:column;gap:14px' })

      // Campos de texto: caixa editável, já com uma sugestão, e botões para usar o valor de uma, da outra ou dos dois
      const CAMPOS = [['titulo', tr('Título')], ['data', tr('Data')], ['catalogo', tr('Nº de catálogo')], ['editora', tr('Editora / impressor')], ['local', tr('Local')], ['doi', 'DOI'], ['isbn', 'ISBN'], ['url', tr('Endereço web')], ['notas', tr('Notas')]]
      for (const [k, rotulo] of CAMPOS) {
        const va = ler(A, k).trim()
        const vb = ler(B, k).trim()
        if (!va && !vb) continue
        const sugestao = va === vb ? va : !va || !vb ? va || vb : k === 'titulo' ? combinarTitulos(va, vb) : ler(fica, k).trim()
        const campo = h(k === 'notas' ? 'textarea' : 'input', { type: 'text', value: sugestao, rows: k === 'notas' ? 4 : null, style: 'width:100%' })
        escolhas[k] = () => campo.value.trim()
        const usar = (v) => (campo.value = v)
        anexar(
          linhas,
          h(
            'div',
            {},
            h('div', { style: 'font-weight:600;margin-bottom:4px' }, rotulo, va === vb ? h('span', { class: 'ajuda' }, tr(' (igual nas duas)')) : null),
            campo,
            va !== vb
              ? h(
                  'div',
                  { class: 'linha-flex', style: 'gap:6px;flex-wrap:wrap;margin-top:4px' },
                  va && h('button', { class: 'botao pequeno', title: va, onclick: () => usar(va) }, tr('Usar o de {numero}', { numero: numeroFmt(A.numero) })),
                  vb && h('button', { class: 'botao pequeno', title: vb, onclick: () => usar(vb) }, tr('Usar o de {numero}', { numero: numeroFmt(B.numero) })),
                  va && vb && h('button', { class: 'botao pequeno', onclick: () => usar(k === 'titulo' ? combinarTitulos(va, vb) : k === 'notas' ? `${va}\n\n${vb}` : `${va}; ${vb}`) }, tr('Os dois'))
                )
              : null
          )
        )
      }

      // Autores: de uma, da outra, ou todos (sem repetir)
      const aa = ler(A, 'autores')
      const ab = ler(B, 'autores')
      if (aa.length || ab.length) {
        const chave = (x) => (x.literal || `${x.apelido || ''}|${x.nome || ''}`).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
        const todos = [...aa, ...ab.filter((x) => !aa.some((y) => chave(y) === chave(x)))]
        const iguais = todos.length === aa.length && aa.length === ab.length
        const opcoes = iguais ? [['a', aa]] : [['a', aa], ['b', ab], ['todos', todos]].filter(([, l]) => l.length)
        const omissao = iguais ? 'a' : !aa.length ? 'b' : !ab.length ? 'a' : fica === A ? 'a' : 'b'
        const nome = 'autores-fusao'
        escolhas.autores = () => (opcoes.find(([v]) => linhas.querySelector(`input[name=${nome}]:checked`)?.value === v) || opcoes[0])[1]
        const rotuloOpcao = (v) => (v === 'a' ? tr('De {numero}', { numero: numeroFmt(A.numero) }) : v === 'b' ? tr('De {numero}', { numero: numeroFmt(B.numero) }) : tr('Todos'))
        anexar(
          linhas,
          h(
            'div',
            {},
            h('div', { style: 'font-weight:600;margin-bottom:4px' }, tr('Autores'), iguais ? h('span', { class: 'ajuda' }, tr(' (iguais nas duas)')) : null),
            ...opcoes.map(([v, l]) => h('label', { style: 'display:block' }, h('input', { type: 'radio', name: nome, value: v, checked: v === omissao }), ' ', iguais ? '' : rotuloOpcao(v) + ': ', autoresTexto(l, 10)))
          )
        )
      }

      const radioFica = (f) => h('label', { style: 'margin-right:16px' }, h('input', { type: 'radio', name: 'fica-fusao', checked: f === fica, onchange: () => (fica = f) }), ` ${numeroFmt(f.numero)} (${ESTADOS[f.estado] || f.estado})`)
      const confirmar = h('input', { type: 'checkbox', checked: completas.length > 0 })
      anexar(
        fusao,
        h(
          'div',
          { class: 'caixa', style: 'margin-bottom:16px;border-color:var(--tinta-3)' },
          h('h3', { style: 'margin-top:0' }, tr('Fundir as duas fichas')),
          h('p', { class: 'ajuda', style: 'margin-top:0' }, tr('Escolha, campo a campo, o que fica. Pode também escrever à mão. A outra ficha é retirada (as notas de leitura e as etiquetas passam para esta) e o ficheiro repetido vai para _duplicados.')),
          linhas,
          h('div', { style: 'margin-top:14px' }, h('strong', {}, tr('Número que fica: ')), radioFica(A), radioFica(B)),
          h('label', { style: 'display:block;margin-top:8px' }, confirmar, tr(' Confirmar a ficha (fica completa e o ficheiro é arrumado com o novo título)')),
          h(
            'div',
            { class: 'linha-flex', style: 'gap:8px;margin-top:14px' },
            h('button', { class: 'botao primario', onclick: () => executar() }, tr('Fundir')),
            h('button', { class: 'botao', onclick: () => (fusao.innerHTML = '') }, tr('Cancelar'))
          )
        )
      )
      fusao.scrollIntoView({ behavior: 'smooth', block: 'start' })

      function executar() {
        const dados = {}
        for (const [k, obter] of Object.entries(escolhas)) if (k !== 'catalogo') dados[k] = obter()
        if (!dados.titulo && 'titulo' in escolhas) return toast(tr('O título não pode ficar vazio.'), true)
        const metadados = { ...(fica.metadados || {}) }
        if ('catalogo' in escolhas) {
          const c = escolhas.catalogo()
          if (c) metadados.catalogo = c
          else delete metadados.catalogo
        }
        dados.metadados = metadados
        const id = fica.id
        decidir(
          { decisao: 'manter', manter: id },
          {
            antes: () => pb.collection('fontes').update(id, dados),
            // (o ficheiro fica com o nome do novo título; sem confirmar, só é renomeado)
            depois: () => servico(confirmar.checked ? 'confirmar' : 'reorganizar', { id }),
          }
        )
      }
    }
  }
  const fusao = h('div', {})
  mostrar()
}

// Título que junta os dois: o mais completo, com o nº de catálogo do outro se lhe faltar
// ("Brich dem Hungrigen dein Brot" + "Cantata BWV 39" → "Brich dem Hungrigen dein Brot, BWV 39")
// e, entre parênteses, o resto do outro se trouxer mais do que uma palavra nova.
function combinarTitulos(a, b) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (norm(a).includes(norm(b))) return a
  if (norm(b).includes(norm(a))) return b
  // (também "Cantata No. 122", como as cantatas de Bach aparecem no IMSLP)
  const CAT = /\b(?:(?:BWV|HWV|TWV|RV|KV|K\.|Hob\.?|Wq\.?|D\.|Op\.|Opus|WoO|SWV|BuxWV|ZWV|Z\.)\s*[\dIVXL]+[a-z]?(?:[\s,/]*(?:n[º°o]\.?|nr\.?|no\.?|№)\s*\d+)?|Cantat[ae]\s+(?:n[º°o]\.?|nr\.?|no\.?|№)\s*\d+)/i
  const semCat = (s) => s.replace(CAT, '').replace(/[\s,;:–—-]+$/, '').replace(/^[\s,;:–—-]+/, '').replace(/\s{2,}/g, ' ').trim()
  const palavras = (s) => norm(s).split(' ').filter((w) => w.length >= 3)
  const [base, outro] = palavras(semCat(a)).length >= palavras(semCat(b)).length ? [a, b] : [b, a]
  let t = base
  const cat = CAT.exec(outro)?.[0]
  if (cat && !CAT.test(base)) t = `${semCat(base)}, ${cat.trim()}`
  const resto = semCat(outro)
  const novas = palavras(resto).filter((w) => !palavras(t).includes(w))
  if (novas.length >= 2) t = `${t} (${resto})`
  return t
}

// ---------------------------------------------------------------------------
// Definições

function previsaoNome(padrao, pastas) {
  const v = { data: '2003', ano: '2003', AUTOR: 'SUTCLIFFE', autor: 'Sutcliffe', Titulo: 'The-Keyboard-Sonatas-of-Domenico-Scarlatti', tipo: 'Livro', natureza: 'Secundárias', contexto: 'Pesquisa Avançada em Música', editora: 'Cambridge University Press' }
  const sub = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : ''))
  return `biblioteca/${pastas.split('/').map(sub).filter(Boolean).join('/')}/${sub(padrao).replace(/_+/g, '_')}.pdf`
}

// Cópia de leitura num disco externo: uma cópia só de leitura da biblioteca, que abre em qualquer computador.
// O serviço corre o exportador à parte; aqui escolhe-se o destino, vê-se o que vai mudar e acompanha-se a cópia.
function secaoCopiaLeitura() {
  const caixa = h('div', { class: 'caixa' })
  const bloco = h('div', { style: 'display:none' }, h('h2', {}, tr('Cópia de leitura (disco externo)')), caixa)
  const OUTRA = '__outra'
  const barra = (pct) => h('div', { class: 'progresso', style: 'margin:8px 0' }, h('div', { style: `width:${pct}%` }))
  const fase = { planear: tr('A preparar o plano (a ler a base e os ficheiros)…'), apagar: tr('A apagar do disco o que já não está na biblioteca…'), copiar: tr('A copiar ficheiros…'), texto: tr('A escrever o texto integral…'), fichas: tr('A escrever as fichas…'), pagina: tr('A escrever a página…'), pronto: tr('A acabar…') }
  const semBarra = (t) => String(t || '').replace(/\/+$/, '')
  let e = null
  let temporizador = null

  const disco = h('select', { onchange: () => (mostrarOutra(), desenhar()) })
  const outra = h('input', { type: 'text', placeholder: tr('Caminho completo da pasta, ex.: /Volumes/MEU DISCO/TINCTORIS'), style: 'display:none;margin-top:8px', oninput: () => desenhar() })
  const notaDisco = h('p', { class: 'ajuda' })
  const dinamico = h('div', { style: 'margin-top:12px' })
  const botaoVer = h('button', { class: 'botao', onclick: () => pedir('exportar-leitura-simular') }, tr('Ver o que vai mudar'))
  const botaoAplicar = h('button', { class: 'botao primario', onclick: () => aplicar() }, tr('Actualizar a cópia'))
  const botaoParar = h('button', { class: 'botao perigo', onclick: () => pedir('exportar-leitura-parar') }, tr('Parar'))
  const procurar = h('button', { class: 'botao-texto', onclick: async () => (await ler(), desenharDiscos(true)) }, tr('Procurar discos'))

  const destino = () => semBarra(disco.value === OUTRA ? outra.value.trim() : disco.value)
  const mostrarOutra = () => (outra.style.display = disco.value === OUTRA ? '' : 'none')
  const discoAtual = () => (e?.discos || []).find((d) => d.destino === disco.value)

  function desenharDiscos(manter) {
    const antes = manter ? disco.value : null
    disco.innerHTML = ''
    const lista = e?.discos || []
    for (const d of lista) anexar(disco, h('option', { value: d.destino }, tr('{nome} — {livre} livres — {sistema}', { nome: d.nome, livre: tamanhoTxt(d.livre), sistema: String(d.sistema).toUpperCase() })))
    anexar(disco, h('option', { value: OUTRA }, tr('Outra pasta…')))
    const ultimo = semBarra(e?.ultimoDestino)
    if (antes && [...disco.options].some((o) => o.value === antes)) disco.value = antes
    else if (ultimo && lista.some((d) => d.destino === ultimo)) disco.value = ultimo
    else if (ultimo) ((disco.value = OUTRA), (outra.value = ultimo))
    else disco.value = lista.length ? lista[0].destino : OUTRA
    mostrarOutra()
    desenhar()
  }

  async function ler() {
    try {
      e = await servico('exportar-leitura')
    } catch (err) {
      e = null
      return false
    }
    return true
  }

  async function pedir(acao, mais = {}) {
    // (o primeiro pedido demora um instante: os botões desactivam-se já)
    if (acao !== 'exportar-leitura-parar') botaoVer.disabled = botaoAplicar.disabled = true
    try {
      e = await servico(acao, { destino: destino(), ...mais })
    } catch (err) {
      toast(mensagemErro(err), true)
    }
    desenhar()
  }

  function aplicar() {
    const c = e?.plano?.contagens
    if (!c) return
    const nApagar = e.plano.nApagar
    const texto = tr('Actualizar a cópia de leitura em:\n{destino}\n\nVai copiar {n} ficheiros ({tamanho})', { destino: e.destino, n: numTxt(c.copiar), tamanho: tamanhoTxt(c.bytesCopiar) }) + (nApagar ? tr(' e apagar {n} do disco (já não estão na biblioteca).', { n: numTxt(nApagar) }) : '.') + tr('\n\nPode parar a qualquer momento: da vez seguinte continua onde ficou.')
    // (apaga muito, ou a biblioteca parece desligada: como em «Apagar as seleccionadas», escreve-se o número)
    if (e.plano.precisaConfirmacaoForte) {
      const r = prompt(`${texto}\n\n${tr('ATENÇÃO: {motivos}', { motivos: (e.plano.motivosConfirmacao || []).join(' ') })}\n\n${tr('Para confirmar, escreva o número de ficheiros a apagar do disco ({n}):', { n: nApagar })}`)
      if (r == null) return
      if (r.trim() !== String(nApagar)) return toast(tr('Nada foi alterado.'))
      return pedir('exportar-leitura-aplicar', { confirmarApagar: nApagar })
    }
    if (confirm(texto)) pedir('exportar-leitura-aplicar')
  }

  function resumoDoPlano(pl) {
    const c = pl.contagens
    const linhas = [
      h('p', { style: 'margin:0 0 4px' }, h('strong', {}, tr('{n} fontes', { n: numTxt(c.fichas) })), tr(' e {notas} notas de leitura vão para a cópia ({ficheiros} ficheiros, {tamanho}).', { notas: numTxt(c.notas), ficheiros: numTxt(c.ficheiros), tamanho: tamanhoTxt(c.bytes) })),
      h('p', { style: 'margin:0 0 4px' }, tr('A copiar: '), h('strong', {}, tr('{n} ficheiros ({tamanho})', { n: numTxt(c.copiar), tamanho: tamanhoTxt(c.bytesCopiar) })), tr(' · já em dia: {n} · a apagar do disco: ', { n: numTxt(c.emDia) }), h('strong', {}, `${numTxt(pl.nApagar)}${pl.nApagar ? ` (${tamanhoTxt(c.bytesApagar)})` : ''}`)),
    ]
    if (c.fichasEmFalta) linhas.push(h('p', { class: 'ajuda' }, tr('{n} fontes têm ficheiros em falta na biblioteca: saem sem eles.', { n: numTxt(c.fichasEmFalta) })))
    if (pl.exportadoAntes) linhas.push(h('p', { class: 'ajuda' }, tr('Última actualização desta cópia: {data}.', { data: new Date(pl.exportadoAntes).toLocaleString(LOCALE) })))
    if (pl.precisaConfirmacaoForte) linhas.push(h('p', { style: 'margin:6px 0 0;color:var(--erro)' }, h('strong', {}, tr('Precisa de confirmação: ')), tr('ao carregar em «Actualizar a cópia» vai ter de escrever o número de ficheiros a apagar ({n}).', { n: numTxt(pl.nApagar) })))
    for (const a of pl.avisos || []) linhas.push(h('p', { style: 'margin:6px 0 0;color:var(--erro)' }, a))
    if (pl.nApagar) {
      const mais = pl.nApagar - pl.apagar.length
      linhas.push(
        h(
          'details',
          { style: 'margin-top:8px' },
          h('summary', {}, tr('Ver o que vai ser apagado do disco ({n})', { n: numTxt(pl.nApagar) })),
          h('p', { class: 'ajuda' }, tr('São ficheiros da cópia que já não pertencem a nenhuma fonte (foram apagados ou mudaram de nome na biblioteca{renomeados}). Nada é apagado da biblioteca.', { renomeados: pl.nApagarRenomeados ? tr('; {n} mudaram de nome', { n: numTxt(pl.nApagarRenomeados) }) : '' })),
          h('div', { class: 'registo' }, pl.apagar.map((x) => h('div', {}, x)), mais > 0 ? h('div', {}, tr('… e mais {n} (lista completa no ficheiro da simulação).', { n: numTxt(mais) })) : null)
        )
      )
    }
    if (pl.registo) linhas.push(h('p', { class: 'ajuda' }, tr('Lista completa: {registo}', { registo: pl.registo })))
    return linhas
  }

  function desenhar() {
    clearTimeout(temporizador)
    if (!caixa.isConnected) return
    const d = discoAtual()
    const avisoDisco = d && !d.exfat ? tr('Este disco não está em exFAT (é {sistema}): o Windows não o consegue abrir.', { sistema: String(d.sistema).toUpperCase() }) : ''
    const jaTem = d?.copia ? (d.copia !== 'sim' ? tr('Já tem uma cópia de {data}: vai ser actualizada.', { data: new Date(d.copia).toLocaleString(LOCALE) }) : tr('Já tem uma cópia: vai ser actualizada.')) : ''
    notaDisco.textContent = !(e?.discos || []).length && disco.value === OUTRA ? tr('Não há nenhum disco externo ligado. Ligue o disco e carregue em «Procurar discos», ou escreva o caminho de uma pasta.') : [avisoDisco, jaTem].filter(Boolean).join(' ')
    notaDisco.style.color = avisoDisco ? 'var(--erro)' : ''

    const ocupado = e?.estado === 'a_simular' || e?.estado === 'a_copiar'
    const igual = e && e.destino === destino()
    const simulado = e?.estado === 'simulado' && igual
    botaoVer.disabled = ocupado || !destino()
    botaoVer.className = 'botao' + (simulado || ocupado ? '' : ' primario')
    botaoAplicar.disabled = ocupado || !simulado
    botaoAplicar.style.display = simulado || e?.estado === 'a_copiar' ? '' : 'none'
    botaoParar.style.display = ocupado ? '' : 'none'
    botaoParar.disabled = !!e?.a_parar
    disco.disabled = outra.disabled = ocupado

    dinamico.innerHTML = ''
    if (e) {
      const p = e.progresso || {}
      if (ocupado) {
        const a = e.estado === 'a_simular' ? tr('A ver o que vai mudar… ') : ''
        let linha = fase[p.fase] || tr('A trabalhar…')
        let pct = null
        if (p.fase === 'copiar' && p.bytesTotal) {
          pct = Math.round((100 * p.bytes) / p.bytesTotal)
          linha = tr('A copiar: {feitos} de {total} ficheiros · {bytes} de {bytesTotal}', { feitos: numTxt(p.feitos), total: numTxt(p.total), bytes: tamanhoTxt(p.bytes), bytesTotal: tamanhoTxt(p.bytesTotal) })
        } else if (p.total > 1) {
          pct = Math.round((100 * p.feitos) / p.total)
          linha = `${fase[p.fase]} ${tr('{feitos} de {total}', { feitos: numTxt(p.feitos), total: numTxt(p.total) })}`
        }
        if (e.a_parar) linha = tr('A parar: a acabar o ficheiro em curso…')
        anexar(dinamico, h('div', {}, a + linha), pct !== null ? barra(pct) : null)
        if (e.estado === 'a_copiar' && e.plano?.avisos?.length) e.plano.avisos.forEach((x) => anexar(dinamico, h('p', { style: 'margin:4px 0;color:var(--erro)' }, x)))
        temporizador = setTimeout(async () => ((await ler()) ? desenhar() : null), 1500)
      } else if (e.estado === 'simulado' && e.plano) {
        anexar(dinamico, h('p', { style: 'margin:0 0 6px' }, h('strong', {}, tr('O que vai mudar em ')), e.destino), resumoDoPlano(e.plano))
        if (!igual) anexar(dinamico, h('p', { class: 'ajuda' }, tr('Mudou a pasta de destino: veja outra vez o que vai mudar.')))
      } else if (e.estado === 'feito' && e.resultado) {
        const r = e.resultado
        anexar(
          dinamico,
          h('p', { style: 'margin:0 0 4px' }, h('strong', {}, tr('Cópia actualizada. ')), tr('{copiados} ficheiros copiados ({tamanho}), {apagados} apagados do disco, em {segundos} s.', { copiados: numTxt(r.copiados), tamanho: tamanhoTxt(r.bytes), apagados: numTxt(r.apagados), segundos: numTxt(r.segundos) })),
          h('p', { class: 'ajuda' }, tr('Para abrir: duplo clique em «Abrir TINCTORIS.html» na pasta {destino} (Mac ou Windows, sem internet).', { destino: e.destino })),
          r.nErros ? h('details', { open: true }, h('summary', { style: 'color:var(--erro)' }, tr('{n} problema(s)', { n: numTxt(r.nErros) })), h('div', { class: 'registo' }, r.erros.map((x) => h('div', { class: 'erro' }, x)))) : null,
          h('p', { class: 'ajuda' }, tr('Lista do que foi feito: {registo}', { registo: r.registo }))
        )
      } else if (e.estado === 'parado_pelo_utilizador') {
        const antes = p.fase === 'planear'
        const f = p.fase === 'copiar' ? tr(' Já tinham sido copiados {feitos} de {total} ficheiros.', { feitos: numTxt(p.feitos), total: numTxt(p.total) }) : ''
        anexar(dinamico, h('p', { style: 'margin:0' }, (antes ? tr('Parado: nada foi alterado no disco.') : tr('A cópia foi parada.')) + f), h('p', { class: 'ajuda' }, antes ? tr('Carregue em «Ver o que vai mudar» quando quiser recomeçar.') : tr('Carregue em «Ver o que vai mudar» e depois em «Actualizar a cópia»: continua onde ficou, sem voltar a copiar o que já está.')))
      } else if (e.estado === 'erro') {
        const verDeNovo = ['mais-apagar', 'confirmar-apagar', 'bloqueado', 'origem-inacessivel'].includes(e.erro?.codigo)
        anexar(dinamico, h('p', { class: 'mensagem-erro', style: 'margin:0' }, e.erro?.mensagem || tr('Não foi possível fazer a cópia.')), verDeNovo ? h('p', { class: 'ajuda' }, tr('Carregue em «Ver o que vai mudar» para ver a lista actual.')) : null)
      }
    }
  }

  anexar(
    caixa,
    h('p', { style: 'margin-top:0' }, tr('Uma cópia só de leitura da biblioteca num disco externo, que se abre com duplo clique em qualquer computador (Mac ou Windows), sem instalar nada. O disco pode ser emprestado: as notas pessoais das fichas, as notas para rever, as etiquetas e os contextos não vão para a cópia, nem o seu nome nas palavras-chave. As notas de leitura vão.')),
    campo(tr('Disco de destino (a cópia fica na pasta «TINCTORIS» do disco)'), h('div', {}, disco, outra)),
    notaDisco,
    h('div', { class: 'linha-flex', style: 'margin-top:10px' }, botaoVer, botaoAplicar, botaoParar, procurar),
    dinamico
  )

  servico('capacidades')
    .then(async (r) => {
      if (!r.capacidades?.includes('exportar-leitura') || !(await ler())) return
      bloco.style.display = ''
      desenharDiscos()
    })
    .catch(() => {})
  return bloco
}

async function vistaDefinicoes() {
  await carregarDefinicoes()
  const p = principal()
  const d = { ...estado.defs }
  const previa = h('code', {})
  const atualizarPrevia = () => (previa.textContent = previsaoNome(d.padrao_nome || '', d.padrao_pastas || ''))
  const linguas = new Set(String(d.linguas_ocr || '').split('+').filter(Boolean))
  const marcadores = ['{data}', '{ano}', '{AUTOR}', '{autor}', '{Titulo}', '{tipo}', '{natureza}', '{contexto}', '{editora}']

  const guardar = async () => {
    d.linguas_ocr = [...linguas].join('+') || 'por+eng'
    try {
      for (const [k, v] of Object.entries(d)) {
        if (JSON.stringify(v) === JSON.stringify(estado.defs[k])) continue
        const reg = estado.defsRegistos[k]
        if (reg) await pb.collection('definicoes').update(reg.id, { valor: v })
        else await pb.collection('definicoes').create({ chave: k, valor: v })
      }
      await carregarDefinicoes()
      toast(tr('Definições guardadas.'))
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }

  const texto = (k, attrs) => h('input', { type: 'text', value: d[k] || '', oninput: (e) => ((d[k] = e.target.value), atualizarPrevia()), ...(attrs || {}) })
  const interruptor = (k, rotulo) => h('label', { class: 'linha-flex', style: 'margin:6px 0' }, h('input', { type: 'checkbox', checked: d[k] !== false, onchange: (e) => (d[k] = e.target.checked) }), rotulo)

  // Acesso pela rede: guarda-se logo (ficheiro app/.so_local) e aplica-se ao reiniciar
  const soLocal = h('input', { type: 'checkbox', id: 'so-local', disabled: true })
  const notaRede = h('p', { class: 'ajuda' }, tr('Aplica-se da próxima vez que abrir o TINCTORIS.'))
  servico('rede')
    .then((r) => {
      soLocal.checked = !!r.so_local
      soLocal.disabled = false
    })
    .catch(() => (notaRede.textContent = tr('Esta opção fica activa depois de reiniciar o TINCTORIS.')))
  soLocal.addEventListener('change', async () => {
    try {
      await servico('rede', { so_local: soLocal.checked })
      toast(soLocal.checked ? tr('Da próxima vez, o TINCTORIS só abre neste Mac.') : tr('Da próxima vez, o TINCTORIS também abre noutros aparelhos da mesma rede (com a sua conta).'))
    } catch (e) {
      soLocal.checked = !soLocal.checked
      toast(mensagemErro(e), true)
    }
  })

  anexar(p, 
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, tr('Definições')), h('p', { class: 'subtitulo' }, tr('Organização dos ficheiros, OCR e pesquisa de metadados.'))), h('button', { class: 'botao primario', onclick: guardar }, tr('Guardar definições'))),
    h('h2', {}, tr('Idioma da interface')),
    h('div', { class: 'caixa' }, seletorIdioma(), h('p', { class: 'ajuda' }, tr('Muda já, sem guardar as definições. As fichas, as notas e os nomes dos ficheiros não são traduzidos.'))),
    h('h2', {}, tr('A sua biblioteca')),
    h(
      'div',
      { class: 'caixa' + (d.nome_dono ? '' : ' destaque') },
      campo(tr('O seu nome (dono da biblioteca)'), texto('nome_dono', { id: 'nome-dono', placeholder: tr('Ex.: Maria da Conceição Gonçalves') })),
      h('p', { class: 'ajuda' }, d.nome_dono ? tr('Num PDF que digitalizou, não é o autor da fonte; numa transcrição feita num editor de partituras, é o editor. Várias formas do nome: separe-as com «;».') : tr('Falta o seu nome: sem ele, o TINCTORIS pode pô-lo como autor das fontes que digitalizou. Escreva-o e guarde as definições.')),
      h('label', { class: 'linha-flex', style: 'margin:12px 0 0' }, soLocal, tr('Abrir só neste Mac (recomendado em redes partilhadas, como a da escola)')),
      notaRede
    ),
    h('h2', {}, tr('Nomes e pastas dos ficheiros')),
    h(
      'div',
      { class: 'caixa' },
      h('div', { class: 'grelha' }, campo(tr('Padrão do nome do ficheiro'), texto('padrao_nome')), campo(tr('Padrão das subpastas (separadas por /)'), texto('padrao_pastas'))),
      h('p', { class: 'ajuda' }, tr('Marcadores disponíveis: '), marcadores.join('  ')),
      h('p', { class: 'ajuda' }, tr('Exemplo: '), previa),
      h('p', { class: 'ajuda' }, tr('Aplica-se aos ficheiros novos e sempre que guarda uma fonte com «Actualizar nome e pasta do ficheiro» activo.'))
    ),
    h('h2', {}, tr('OCR (reconhecimento de texto)')),
    h(
      'div',
      { class: 'caixa' },
      interruptor('ocr_ativo', tr('Fazer OCR automaticamente a PDFs digitalizados e imagens')),
      h('h3', {}, tr('Línguas a reconhecer')),
      h(
        'div',
        { class: 'chips' },
        Object.entries(LINGUAS_OCR).map(([cod, nome]) =>
          h(
            'span',
            {
              class: 'chip' + (linguas.has(cod) ? ' ativo' : ''),
              onclick: (e) => {
                linguas.has(cod) ? linguas.delete(cod) : linguas.add(cod)
                e.target.classList.toggle('ativo')
              },
            },
            nome
          )
        )
      ),
      h('p', { class: 'ajuda' }, tr('Menos línguas = OCR mais rápido e, em geral, mais exacto.'))
    ),
    h('h2', {}, tr('Metadados automáticos')),
    h(
      'div',
      { class: 'caixa' },
      interruptor('enriquecimento_auto', tr('Pesquisar metadados online quando entra um ficheiro novo')),
      h(
        'label',
        { class: 'campo', style: 'margin-top:10px;max-width:420px' },
        h('span', {}, tr('Confiança mínima para aceitar sem rever: '), h('strong', { id: 'limiar-valor' }, Math.round((Number(d.limiar_confianca) || 0.8) * 100) + '%')),
        h('input', {
          type: 'range',
          min: 50,
          max: 100,
          value: Math.round((Number(d.limiar_confianca) || 0.8) * 100),
          oninput: (e) => ((d.limiar_confianca = Number(e.target.value) / 100), (document.getElementById('limiar-valor').textContent = e.target.value + '%')),
        })
      ),
      h(
        'div',
        { class: 'grelha', style: 'margin-top:12px' },
        campo(tr('Email de contacto para os serviços (opcional)'), texto('email_contacto', { type: 'email' })),
        campo(tr('Chave YouTube Data API (opcional)'), texto('youtube_api_key')),
        campo(tr('Chave Semantic Scholar (opcional)'), texto('semantic_scholar_api_key')),
        campo(tr('Chave Europeana (opcional)'), texto('europeana_api_key')),
        campo(tr('Chave Google Books (opcional)'), texto('google_books_api_key'))
      ),
      h('p', { class: 'ajuda' }, tr('O email (opcional) é enviado ao CrossRef, OpenAlex e MusicBrainz, que dão prioridade a pedidos identificados. A chave do YouTube é gratuita (Google Cloud Console → YouTube Data API v3); sem ela, a pesquisa no YouTube fica desligada. A chave da Europeana também é gratuita (europeana.eu → API); sem ela usa-se a chave pública de demonstração. Com a chave do Google Books, os livros também são procurados no Google Books quando entram; sem ela, só na «Pesquisa aprofundada».'))
    ),
    h('h2', {}, tr('IA local (no próprio Mac)')),
    h(
      'div',
      { class: 'caixa' },
      interruptor('ia_local_ativa', tr('Usar a IA local para ler capas que as regras não conseguem identificar')),
      h('div', { class: 'grelha', style: 'margin-top:10px' }, campo(tr('Modelo'), texto('ia_modelo')), campo(tr('Endereço do Ollama'), texto('ia_url'))),
      h('p', { class: 'ajuda' }, tr('Gratuita e privada: o modelo corre neste Mac e nada é enviado para fora. Só é usada quando as regras e os identificadores (DOI, ISBN, capa do JSTOR) não chegam; leva ~15 segundos por documento, em segundo plano.'))
    ),
    secaoCopiaLeitura(),
    h('h2', {}, tr('Manutenção')),
    h(
      'div',
      { class: 'caixa linha-flex' },
      h(
        'button',
        {
          class: 'botao',
          onclick: async () => {
            const r = await pb.send('/api/bib/reindexar', { method: 'POST' })
            toast(tr('Índice de pesquisa reconstruído ({n} fontes).', { n: numTxt(r.reindexadas) }))
          },
        },
        tr('Reconstruir índice de pesquisa')
      ),
      h(
        'button',
        {
          class: 'botao',
          onclick: async () => {
            if (!confirm(tr('Voltar a ler todos os ficheiros da pasta biblioteca? Os que ainda não têm ficha são identificados de novo (e associados às fontes importadas, quando corresponderem). Antes disso é feita uma cópia de segurança.'))) return
            try {
              const r = await servico('reler-biblioteca', {})
              toast(tr('{n} ficheiros em fila. Acompanhe em «Actividade».', { n: numTxt(r.ficheiros) }))
            } catch (e) {
              toast(mensagemErro(e), true)
            }
          },
        },
        tr('Reler os ficheiros da biblioteca')
      ),
      h('a', { class: 'botao', href: '/_/', target: '_blank' }, tr('Painel de administração do PocketBase ↗'))
    )
  )
  atualizarPrevia()
}

iniciar()
