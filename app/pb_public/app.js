'use strict'

// TINCTORIS — interface web (sem dependências além do SDK do PocketBase).

const pb = new PocketBase(location.origin)
pb.autoCancellation(false)

const CONTEXTOS = ['Leitura e Interpretação de Fontes', 'Pesquisa Avançada em Música', 'Projeto Artístico e Tese', 'Ensino', 'Produção artística']
const PAPEIS = ['autor', 'compositor', 'arranjador', 'editor', 'tradutor', 'intérprete', 'maestro', 'realizador', 'destinatário', 'copista', 'construtor', 'organizador', 'compilador', 'produtor', 'libretista', 'ilustrador', 'entrevistador']
const TIPOS_NOTA = ['Citação', 'Paráfrase', 'Comentário', 'Ideia', 'Pergunta']
const CATEGORIAS = ['Escrita', 'Audiovisual', 'Instrumento', 'Digital', 'Outro']
const TIPOS_CAMPO = { texto: 'Texto curto', texto_longo: 'Texto longo', numero: 'Número', data: 'Data', url: 'Endereço web', lista: 'Lista de opções', sim_nao: 'Sim / não' }
const LINGUAS_OCR = { por: 'Português', eng: 'Inglês', lat: 'Latim', ita: 'Italiano', fra: 'Francês', spa: 'Espanhol', deu: 'Alemão' }
const ESTADOS = { completo: 'Completo', a_rever: 'Por rever', processando: 'A processar', erro: 'Erro' }
const OCR_ESTADOS = { pendente: 'OCR em fila', em_curso: 'OCR em curso', feito: 'OCR feito', erro: 'OCR falhou' }

// Tipos CSL (para citações) com explicação em português
const CSL_TIPOS = {
  book: 'Livro', chapter: 'Capítulo', 'article-journal': 'Artigo de revista', article: 'Artigo / ensaio', 'article-newspaper': 'Artigo de jornal',
  manuscript: 'Manuscrito', musical_score: 'Partitura', thesis: 'Tese', report: 'Relatório', pamphlet: 'Folheto / programa', legislation: 'Legislação',
  song: 'Gravação sonora', motion_picture: 'Filme / vídeo', broadcast: 'Emissão', performance: 'Espetáculo', event: 'Evento', interview: 'Entrevista',
  dataset: 'Conjunto de dados', software: 'Software', webpage: 'Página web', 'paper-conference': 'Comunicação em congresso', 'entry-encyclopedia': 'Entrada de enciclopédia',
  review: 'Recensão', graphic: 'Imagem', map: 'Mapa', personal_communication: 'Comunicação pessoal', document: 'Documento genérico',
}
// Variáveis CSL a que um campo pode corresponder (para aparecer nas citações)
const CSL_VARS = {
  '': '— não entra na citação —', 'container-title': 'Publicado em (revista, livro, álbum)', 'collection-title': 'Coleção / série', volume: 'Volume', issue: 'Número (fascículo)',
  page: 'Páginas', 'number-of-pages': 'Nº de páginas', edition: 'Edição', number: 'Número / nº de catálogo', archive: 'Arquivo', 'archive-place': 'Local do arquivo',
  archive_collection: 'Fundo', 'call-number': 'Cota', medium: 'Suporte / meio', dimensions: 'Dimensões / duração', genre: 'Género', version: 'Versão',
  'event-title': 'Evento', 'event-place': 'Local do evento', 'event-date': 'Data do evento', accessed: 'Data de acesso', 'original-date': 'Data original', note: 'Nota', abstract: 'Resumo',
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
  filtros: { q: '', autor: '', titulo: '', tipo: '', contexto: '', natureza: '', estado: '', anoDe: '', anoAte: '', tag: '', ordem: lerPreferencia('ordem', 'recentes') },
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
  const t = h('div', { class: 'aviso-toast' + (erro ? ' erro' : '') }, msg)
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
  const lista = (Array.isArray(autores) ? autores : []).map((a) => nomeAutor(a, true) + (a.papel && a.papel !== 'autor' ? ` (${a.papel})` : ''))
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
  if (comVazio) anexar(s, h('option', { value: '' }, comVazio))
  for (const cat of CATEGORIAS) {
    const tipos = estado.tipos.filter((t) => (t.categoria || 'Outro') === cat)
    if (!tipos.length) continue
    const g = h('optgroup', { label: cat })
    tipos.forEach((t) => anexar(g, h('option', { value: t.id, selected: t.id === valor }, t.nome)))
    anexar(s, g)
  }
  return s
}

function selectSimples(opcoes, valor, attrs) {
  const s = h('select', attrs || {})
  const pares = Array.isArray(opcoes) ? opcoes.map((o) => [o, o]) : Object.entries(opcoes)
  pares.forEach(([v, r]) => anexar(s, h('option', { value: v, selected: String(v) === String(valor ?? '') }, r)))
  return s
}

function campo(rotulo, controlo, attrs) {
  return h('label', { class: 'campo ' + (attrs?.class || '') }, h('span', {}, rotulo), controlo)
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
      h('p', { class: 'subtitulo' }, 'Ainda não existe uma conta. Crie-a no computador onde a biblioteca está instalada (abrindo esta página nesse computador) e depois volte aqui.'),
    ]
  } else if (!info.temConta) {
    conteudo = [
      h('h1', {}, 'Criar a sua conta'),
      h('p', { class: 'subtitulo' }, 'Primeira utilização. Esta conta fica só neste disco e protege a biblioteca de outros dispositivos na rede.'),
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
        campo('Email', email),
        campo('Palavra-passe (mínimo 8 caracteres)', pass),
        erro,
        h('button', { class: 'botao primario', type: 'submit' }, 'Criar conta e entrar')
      ),
    ]
  } else {
    conteudo = [
      h('h1', { class: 'marca-entrada' }, 'TINCTORIS'),
      h('p', { class: 'subtitulo' }, 'Entre com a sua conta.'),
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
              erro.textContent = 'Email ou palavra-passe incorretos.'
            }
          },
        },
        campo('Email', email),
        campo('Palavra-passe', pass),
        erro,
        h('button', { class: 'botao primario', type: 'submit' }, 'Entrar')
      ),
    ]
  }
  anexar(raiz, h('div', { class: 'ecra-entrada' }, h('div', { class: 'cartao-entrada' }, conteudo)))
}

// ---------------------------------------------------------------------------
// Estrutura da aplicação

const VERSAO = '0.9.0-beta'

const VISTAS = {
  fontes: { rotulo: 'Fontes', fn: () => vistaFontes() },
  rever: { rotulo: 'Por rever', fn: () => vistaRever() },
  duplicados: { rotulo: 'Duplicados', fn: () => vistaDuplicados() },
  notas: { rotulo: 'Notas de leitura', fn: () => vistaNotas() },
  importar: { rotulo: 'Importar', fn: () => vistaImportar() },
  tipos: { rotulo: 'Tipos de fonte', fn: () => vistaTipos() },
  atividade: { rotulo: 'Atividade', fn: () => vistaAtividade() },
  definicoes: { rotulo: 'Definições', fn: () => vistaDefinicoes() },
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
    new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
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
    anexar(el, h('div', {}, h('strong', {}, 'Dados'), ' · ', dataHora(i.dados)), h('div', {}, h('strong', {}, 'Código'), ' · ', dataHora(i.codigo)))
    el.title = 'Última atualização dos dados (fontes, notas, tipos) e do programa'
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
    h('strong', {}, `A watch folder recebeu ${e.entrada.pendentes} ficheiros de uma vez e está em pausa. `),
    'Confirme que quer mesmo processá-los todos (podem ser, por exemplo, uma pasta de páginas web largada por engano).',
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h('button', { class: 'botao primario', onclick: async () => (await servico('fila-retomar', {}), aviso.remove(), toast('A processar.')) }, 'Processar todos'),
      h('button', { class: 'botao', onclick: async () => (await servico('fila-cancelar', {}), aviso.remove(), toast('Cancelado. Os ficheiros ficam na watch folder; retire os que não quer e reinicie o TINCTORIS.')) }, 'Cancelar')
    )
  )
}

// Aviso quando a pasta _duplicados ocupa mais do que o limite (10 %) do espaço das fontes
const gb = (b) => (b / 1e9).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' GB'
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
    h('strong', {}, `Os duplicados ocupam ${gb(e.duplicados_bytes)}: ${e.percentagem.toLocaleString('pt-PT')}% do espaço das fontes (o limite é ${e.limite}%). `),
    'Reveja-os para libertar espaço. Só vão para o Lixo do Mac os que têm uma cópia igual na biblioteca, e só quando carregar no botão.',
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h('a', { class: 'botao primario', href: '#/duplicados' }, 'Rever duplicados'),
      h('button', { class: 'botao', onclick: () => ((espacoDupAdiado = true), aviso.remove()) }, 'Lembrar mais tarde')
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
      anexar(caixa, h('h3', { style: 'margin-top:0' }, 'Espaço ocupado pelos duplicados'), /desconhecida/i.test(mensagemErro(err)) ? 'Esta parte fica ativa depois de reiniciar o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).' : `O serviço de fundo não respondeu: ${mensagemErro(err)}`)
      return
    }
    espacoDup = e
    espacoDupQuando = Date.now()
    caixa.innerHTML = ''
    const v = e.verificacao
    anexar(
      caixa,
      h('h3', { style: 'margin-top:0' }, 'Espaço ocupado pelos duplicados'),
      h('p', { style: 'margin-top:0' }, h('strong', {}, `${gb(e.duplicados_bytes)}`), ` em ${e.duplicados_ficheiros.toLocaleString('pt-PT')} ficheiros (pasta _duplicados): `, h('strong', { style: e.acima ? 'color:var(--erro)' : '' }, `${e.percentagem.toLocaleString('pt-PT')}%`), ` do espaço das fontes (${gb(e.fontes_bytes)}). Aviso acima de ${e.limite}%.`)
    )
    if (e.a_verificar) {
      const a = e.a_verificar
      const pct = a.total ? Math.round((100 * a.feitos) / a.total) : 0
      anexar(caixa, h('div', {}, `A verificar: ${a.fase}… ${a.total ? `${a.feitos.toLocaleString('pt-PT')} de ${a.total.toLocaleString('pt-PT')}` : ''}`), h('div', { class: 'progresso' }, h('div', { style: `width:${pct}%` })))
      temporizador = setTimeout(() => vistaAtual() === 'duplicados' && desenhar(), 3000)
      return
    }
    const verificar = h('button', { class: v ? 'botao' : 'botao primario', onclick: async () => (await servico('espaco-verificar', {}), desenhar()) }, v ? 'Verificar de novo' : 'Verificar agora')
    if (!v) {
      anexar(caixa, h('p', {}, 'A verificação compara o conteúdo de cada ficheiro com a biblioteca (a primeira vez demora alguns minutos; o resto da biblioteca continua a funcionar).'), verificar)
      return
    }
    const lista = h('div', {})
    anexar(
      caixa,
      h('p', { class: 'ajuda', style: 'margin-top:0' }, `Última verificação: ${new Date(v.feita_em).toLocaleString('pt-PT')}`),
      h(
        'div',
        { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;margin-bottom:12px' },
        h(
          'div',
          { class: 'caixa' },
          h('div', {}, h('strong', {}, 'Seguros: '), `${v.seguros.toLocaleString('pt-PT')} ficheiros, ${gb(v.seguros_bytes)}`),
          h('div', { class: 'ajuda' }, 'Têm uma cópia igual na biblioteca (ou são PDFs quase iguais já juntados).'),
          v.seguros
            ? h(
                'button',
                {
                  class: 'botao primario',
                  style: 'margin-top:8px',
                  onclick: async (ev) => {
                    if (!confirm(`Pôr no Lixo do Mac ${v.seguros.toLocaleString('pt-PT')} ficheiros (${gb(v.seguros_bytes)})?\n\nCada um é confirmado outra vez antes de sair. Ficam numa pasta «Duplicados …» no Lixo e podem ser recuperados até esvaziar o Lixo.`)) return
                    ev.target.disabled = true
                    ev.target.textContent = 'A pôr no Lixo…'
                    try {
                      const r = await servico('espaco-lixo', {})
                      toast(`${r.movidos.toLocaleString('pt-PT')} ficheiros (${gb(r.bytes)}) no Lixo, pasta «${r.lixo}».${r.saltados ? ` ${r.saltados} ficaram (mudaram desde a verificação).` : ''}`)
                    } catch (err) {
                      toast(mensagemErro(err), true)
                    }
                    espacoDupAdiado = false
                    desenhar()
                  },
                },
                `Pôr no Lixo do Mac (${gb(v.seguros_bytes)})`
              )
            : null
        ),
        h(
          'div',
          { class: 'caixa' },
          h('div', {}, h('strong', {}, 'Por ver: '), `${v.por_ver.toLocaleString('pt-PT')} ficheiros, ${gb(v.por_ver_bytes)}`),
          h('div', { class: 'ajuda' }, 'Sem cópia igual na biblioteca: decida um a um (os maiores primeiro).'),
          v.por_ver ? h('button', { class: 'botao', style: 'margin-top:8px', onclick: () => mostrarPorVer(lista) }, 'Ver a lista') : null
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
  lista.innerHTML = 'A carregar…'
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
  anexar(
    lista,
    h('h3', {}, `Por ver (${r.total.toLocaleString('pt-PT')}${r.total > r.lista.length ? `; mostrados os ${r.lista.length} maiores` : ''})`),
    h('p', { class: 'ajuda', style: 'margin-top:0' }, '«Abrir» e «Mostrar no Finder» funcionam no Mac onde a biblioteca está. «Devolver à biblioteca» põe o ficheiro na watch folder, para ter ficha própria. «Manter» deixa-o em _duplicados e tira-o desta lista.'),
    r.lista.map((x) => {
      const linha = h('div', { style: 'border-top:1px solid var(--linha);padding:8px 0;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center' })
      anexar(
        linha,
        h('strong', { style: 'min-width:70px' }, gb(x.tamanho)),
        h('span', { style: 'flex:1 1 280px;word-break:break-all' }, x.ficheiro.replace(/^_duplicados\//, ''), x.talvez?.length ? h('span', { class: 'ajuda' }, ` — nome parecido com ${x.talvez.map(numeroFmt).join(', ')}`) : null),
        h(
          'span',
          { class: 'linha-flex', style: 'gap:6px;flex-wrap:wrap' },
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-abrir', x, linha) }, 'Abrir'),
          h('button', { class: 'botao pequeno', onclick: () => servico('espaco-abrir', { ficheiro: x.ficheiro, finder: true }).catch((e) => toast(mensagemErro(e), true)) }, 'Mostrar no Finder'),
          h('button', { class: 'botao pequeno', onclick: async () => confirm(`Pôr no Lixo do Mac «${x.ficheiro.split('/').pop()}» (${gb(x.tamanho)})?\nNão tem cópia igual na biblioteca.`) && (await servico('espaco-lixo', { ficheiros: [x.ficheiro] }).then(() => (linha.remove(), toast('No Lixo do Mac.'))).catch((e) => toast(mensagemErro(e), true))) }, 'Pôr no Lixo'),
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-devolver', x, linha, 'Devolvido à watch folder: vai ter ficha própria.') }, 'Devolver à biblioteca'),
          h('button', { class: 'botao pequeno', onclick: () => acao('espaco-manter', x, linha, 'Fica em _duplicados.') }, 'Manter')
        )
      )
      return linha
    })
  )
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
  const raiz = document.getElementById('raiz')
  raiz.innerHTML = ''
  const lateral = h(
    'aside',
    { class: 'lateral', id: 'lateral' },
    h('div', { class: 'marca-app' }, 'TINCTORIS', h('small', {}, 'Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários')),
    h(
      'nav',
      { class: 'nav' },
      h('a', { href: '#/fontes', 'data-vista': 'fontes' }, 'Fontes'),
      h('a', { href: '#/rever', 'data-vista': 'rever' }, 'Por rever', h('span', { class: 'contagem oculto', id: 'contagem-rever' }, '0')),
      h('a', { href: '#/duplicados', 'data-vista': 'duplicados' }, 'Duplicados'),
      h('a', { href: '#/notas', 'data-vista': 'notas' }, 'Notas de leitura'),
      h('a', { href: '#', onclick: (e) => (e.preventDefault(), abrirFonte(null)) }, '+ Nova fonte'),
      h('a', { href: '#/importar', 'data-vista': 'importar' }, 'Importar (Mendeley, Zotero)'),
      h('div', { class: 'separador' }),
      h('a', { href: '#/tipos', 'data-vista': 'tipos' }, 'Tipos de fonte'),
      h('a', { href: '#/atividade', 'data-vista': 'atividade' }, 'Atividade'),
      h('a', { href: '#/definicoes', 'data-vista': 'definicoes' }, 'Definições')
    ),
    h('div', { class: 'carimbos', id: 'carimbos', style: 'margin-top:auto' }),
    h(
      'div',
      { class: 'rodape', style: 'margin-top:0' },
      h('button', { class: 'enviar-comentario', onclick: enviarComentario, title: 'Algo não funciona, podia funcionar melhor ou falta? Diga-nos.' }, 'Enviar comentário'),
      h('div', {}, pb.authStore.record?.email || ''),
      h('button', { onclick: () => (pb.authStore.clear(), ecraEntrada()) }, 'Sair')
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
    if (aoFechar && painel._alterado?.() && confirm('Há alterações por guardar na ficha que estava aberta. Guardar agora?')) painel._guardar?.()
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
  return { partes, params }
}

const CAMPOS_LISTA = 'id,numero,titulo,autores,data,ano,tipo,contextos,natureza,estado,tags,palavras_chave,ficheiro,ficheiros_extra,ocr_estado,editora,created'

// ---- Ordenação como num catálogo: sem maiúsculas/acentos, sem artigos iniciais, sem data no fim

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
const colador = new Intl.Collator('pt', { sensitivity: 'base', numeric: true, ignorePunctuation: true })
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
      h('div', { class: 'titulo' }, r.numero ? h('span', { class: 'numero' }, numeroFmt(r.numero)) : null, r.titulo || 'Sem título'),
      meta ? h('div', { class: 'meta' }, meta) : null,
      (r.contextos || []).length || (r.tags || []).length
        ? h('div', { class: 'chips', style: 'margin-top:6px' }, (r.contextos || []).map((c) => h('span', { class: 'etiqueta acento' }, c)), (r.tags || []).map((t) => h('span', { class: 'etiqueta' }, '#' + t)))
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
                  title: 'Pesquisar esta palavra-chave',
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
      tipo ? h('span', { class: 'etiqueta' }, tipo.nome) : null,
      r.estado === 'a_rever' ? h('span', { class: 'etiqueta rever' }, 'Por rever') : null,
      r.estado === 'processando' ? h('span', { class: 'etiqueta rever' }, 'A processar') : null,
      OCR_ESTADOS[r.ocr_estado] && r.ocr_estado !== 'feito' ? h('span', { class: 'etiqueta' }, OCR_ESTADOS[r.ocr_estado]) : null,
      r.ficheiro ? h('span', { class: 'etiqueta', title: r.ficheiro }, (r.ficheiro.split('.').pop() || '').toUpperCase() + (r.ficheiros_extra?.length ? ` ×${r.ficheiros_extra.length + 1}` : '')) : null
    )
  )
}

function atualizarBarraSelecao() {
  const el = document.getElementById('info-selecao')
  if (!el) return
  const n = estado.selecionados.size
  el.textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : ''
  const limpar = document.getElementById('limpar-selecao')
  if (limpar) limpar.classList.toggle('oculto', !n)
}

async function vistaFontes() {
  const p = principal()
  const f = estado.filtros
  const lista = h('div', {})
  const resumo = h('span', {})

  const recarregar = async () => {
    estado.limiteVisivel = 200
    lista.innerHTML = ''
    anexar(lista, h('div', { class: 'vazio' }, 'A pesquisar…'))
    try {
      await pesquisar()
    } catch (e) {
      lista.innerHTML = ''
      anexar(lista, h('div', { class: 'vazio' }, h('strong', {}, 'Não foi possível pesquisar'), mensagemErro(e)))
      return
    }
    desenhar()
  }

  const desenhar = () => {
    lista.innerHTML = ''
    resumo.textContent = `${estado.total} fonte${estado.total === 1 ? '' : 's'}`
    const comTexto = !!(f.q || f.autor || f.titulo)
    seletorOrdem.innerHTML = ''
    anexar(seletorOrdem, (comTexto ? [['relevancia', 'Relevância'], ...Object.entries(ORDENS)] : Object.entries(ORDENS)).map(([v, r]) => h('option', { value: v, selected: v === f.ordem }, r)))
    if (!estado.resultados.length) {
      const semNada = !f.q && !f.autor && !f.titulo && !filtroBase().partes.length
      anexar(lista, 
        h(
          'div',
          { class: 'lista' },
          h(
            'div',
            { class: 'vazio' },
            h('strong', {}, semNada ? 'A biblioteca ainda está vazia' : 'Nada encontrado'),
            semNada ? 'Largue ficheiros na pasta watch_folder ou use «Nova fonte».' : 'Experimente outras palavras ou retire filtros.'
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
          h('button', { class: 'botao', onclick: () => ((estado.limiteVisivel += 200), desenhar()) }, `Mostrar mais (${estado.resultados.length - estado.limiteVisivel} restantes)`)
        )
      )
    }
  }

  // Mudar a ordem é instantâneo: as fontes já estão carregadas
  const seletorOrdem = h('select', {
    style: 'width:auto;padding:4px 8px;font-size:14px',
    'aria-label': 'Ordenar por',
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
    placeholder: 'Pesquisar em tudo: títulos, autores, notas, texto integral…',
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
      campo('Autor', h('input', { type: 'text', value: f.autor, oninput: (e) => ((f.autor = e.target.value), aoEscrever()) })),
      campo('Título', h('input', { type: 'text', value: f.titulo, oninput: (e) => ((f.titulo = e.target.value), aoEscrever()) })),
      campo('Tipo de fonte', selectTipos(f.tipo, (e) => ((f.tipo = e.target.value), recarregar()), 'Todos')),
      campo('Contexto / UC', selectSimples({ '': 'Todos', ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, f.contexto, { onchange: (e) => ((f.contexto = e.target.value), recarregar()) })),
      campo('Natureza', selectSimples({ '': 'Todas', primária: 'Primária', secundária: 'Secundária' }, f.natureza, { onchange: (e) => ((f.natureza = e.target.value), recarregar()) })),
      campo('Estado', selectSimples({ '': 'Todos', ...ESTADOS }, f.estado, { onchange: (e) => ((f.estado = e.target.value), recarregar()) })),
      campo('Ano (de)', h('input', { type: 'number', value: f.anoDe, oninput: (e) => ((f.anoDe = e.target.value), aoEscrever()) })),
      campo('Ano (até)', h('input', { type: 'number', value: f.anoAte, oninput: (e) => ((f.anoAte = e.target.value), aoEscrever()) })),
      campo('Etiqueta', h('input', { type: 'text', value: f.tag, oninput: (e) => ((f.tag = e.target.value), aoEscrever()) })),
    ),
    h(
      'div',
      { style: 'margin-top:10px' },
      h(
        'button',
        {
          class: 'botao-texto',
          onclick: () => {
            Object.assign(f, { q: '', autor: '', titulo: '', tipo: '', contexto: '', natureza: '', estado: '', anoDe: '', anoAte: '', tag: '' })
            vistaFontes()
          },
        },
        'Limpar filtros'
      )
    )
  )

  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, 'Fontes'), h('p', { class: 'subtitulo' }, 'A sua biblioteca de investigação, ensino e prática artística.')),
      h('div', { class: 'linha-flex' }, h('button', { class: 'botao', onclick: () => abrirExportar() }, 'Exportar bibliografia'), h('button', { class: 'botao primario', onclick: () => abrirFonte(null) }, '+ Nova fonte'))
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
        'Filtros'
      )
    ),
    h('p', { class: 'ajuda', style: 'margin:-2px 0 12px' }, 'Dica: use aspas para uma expressão exata, ex.: "basso continuo". Acentos e maiúsculas são ignorados.'),
    filtros,
    h(
      'div',
      { class: 'resumo-lista' },
      h('span', { class: 'linha-flex' }, resumo, h('span', { style: 'color:var(--tinta-3)' }, '· ordenar por'), seletorOrdem),
      h(
        'span',
        { class: 'linha-flex' },
        h('span', { id: 'info-selecao' }),
        h('button', { class: 'botao-texto oculto', id: 'limpar-selecao', onclick: () => (estado.selecionados.clear(), desenhar(), atualizarBarraSelecao()) }, 'Limpar seleção'),
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
          'Selecionar as visíveis'
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
        h('h1', {}, 'Por rever'),
        h('p', { class: 'subtitulo' }, 'Fontes cujos metadados não foram identificados com segurança. Abra cada uma, escolha uma sugestão ou preencha à mão, e confirme.')
      ),
      h(
        'button',
        {
          class: 'botao',
          title: 'Aplicar as regras e a IA local mais recentes a todas as fontes por rever que têm ficheiro',
          onclick: async () => {
            if (!confirm('Reanalisar todas as fontes por rever que têm ficheiro? Com a IA local pode levar ~15 segundos por fonte, em segundo plano. Antes disso é feita uma cópia de segurança.')) return
            try {
              const r = await servico('reanalisar-por-rever', {})
              toast(`${r.fontes} fontes em reanálise. Acompanhe em «Atividade».`)
            } catch (e) {
              toast(mensagemErro(e), true)
            }
          },
        },
        'Reanalisar todas'
      )
    )
  )
  const r = await pb.collection('fontes').getFullList({ filter: "estado = 'a_rever' || estado = 'erro'", sort: 'created', fields: CAMPOS_LISTA })
  estado.trechos = {}
  if (!r.length) {
    anexar(p, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, 'Tudo revisto'), 'Não há fontes à espera de revisão.')))
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
    h('div', { class: 'painel-topo' }, topo, h('span', { class: 'espaco' }), h('button', { class: 'botao', onclick: () => fecharPainel() }, 'Fechar')),
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
  r.autores = Array.isArray(r.autores) ? r.autores : []
  r.tags = Array.isArray(r.tags) ? r.tags : []
  r.palavras_chave = Array.isArray(r.palavras_chave) ? r.palavras_chave : []
  r.metadados = r.metadados && typeof r.metadados === 'object' ? r.metadados : {}
  r.contextos = Array.isArray(r.contextos) ? r.contextos : []
  r.candidatos = Array.isArray(r.candidatos) ? r.candidatos : []
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
      toast(confirmar ? 'Fonte confirmada.' : 'Guardado.')
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
      anexar(topo, h('a', { class: 'botao primario', href: `/api/bib/ficheiro/${r.id}?token=${encodeURIComponent(pb.authStore.token)}`, target: '_blank' }, 'Abrir ficheiro'))
    }
    if (r.id) {
      anexar(topo, 
        h(
          'button',
          {
            class: 'botao',
            onclick: async (e) => {
              e.target.disabled = true
              e.target.textContent = 'A pesquisar em todas as fontes…'
              try {
                if (alterado) await guardar()
                const res = await servico('aprofundar', { id: r.id })
                r.candidatos = res.candidatos || []
                if (res.erros?.length) toast(`Algumas fontes não responderam: ${res.erros.map((x) => x.split(':')[0]).join(', ')}`)
                redesenhar()
                document.getElementById('sugestoes')?.scrollIntoView({ behavior: 'smooth' })
              } catch (err) {
                toast(mensagemErro(err), true)
                e.target.disabled = false
              }
            },
          },
          'Pesquisa aprofundada'
        )
      )
    }

    // Cabeçalho
    anexar(corpo, 
      h('h1', {}, r.titulo || (r.id ? 'Sem título' : 'Nova fonte')),
      h(
        'div',
        { class: 'linha-flex', style: 'margin-top:6px' },
        r.numero ? h('span', { class: 'etiqueta', title: 'Número permanente desta fonte' }, numeroFmt(r.numero)) : null,
        r.estado === 'a_rever' ? h('span', { class: 'etiqueta rever' }, 'Por rever') : null,
        r.origem ? h('span', { class: 'etiqueta' }, 'Metadados: ' + r.origem) : null,
        OCR_ESTADOS[r.ocr_estado] ? h('span', { class: 'etiqueta' }, OCR_ESTADOS[r.ocr_estado]) : null,
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
        const txt = prompt('Números das fichas a juntar a esta (os ficheiros delas passam para aqui e essas fichas deixam de existir; os ficheiros nunca são apagados).\nEx.: 23, 24-47')
        if (!txt) return
        const numeros = []
        for (const parte of txt.split(/[\s,;]+/).filter(Boolean)) {
          const m = /^#?(\d+)(?:-#?(\d+))?$/.exec(parte)
          if (!m) return toast(`Não percebi «${parte}». Use números, ex.: 23, 24-47`, true)
          for (let n = Number(m[1]); n <= Number(m[2] || m[1]); n++) if (n !== r.numero) numeros.push(n)
        }
        if (!numeros.length || numeros.length > 500) return toast('Indique entre 1 e 500 fichas.', true)
        const outras = []
        for (const n of numeros) {
          try {
            outras.push(await pb.collection('fontes').getFirstListItem(`numero = ${n}`, { fields: 'id,numero,titulo,ficheiro' }))
          } catch (_) {
            return toast(`A ficha ${numeroFmt(n)} não existe.`, true)
          }
        }
        const lista = outras.slice(0, 12).map((o) => `${numeroFmt(o.numero)} ${o.titulo}`).join('\n') + (outras.length > 12 ? `\n… e mais ${outras.length - 12}` : '')
        if (!confirm(`Juntar ${outras.length} ficha(s) a «${r.titulo}»?\n\n${lista}\n\nÉ feita uma cópia de segurança antes. As notas de leitura e as etiquetas passam para esta ficha.`)) return
        try {
          if (alterado) await guardar()
          await servico('juntar', { id: r.id, ids: outras.map((o) => o.id) })
          toast(`${outras.length} ficha(s) juntadas.`)
          abrirFonte(r.id)
          rota()
        } catch (e) {
          toast(mensagemErro(e), true)
        }
      }
      anexar(corpo,
        h('h3', {}, ficheirosExtra.length ? `Ficheiros (${ficheirosExtra.length + 1})` : 'Ficheiros'),
        h('div', { class: 'ficheiros-fonte', style: ficheirosExtra.length > 6 ? 'display:flex;flex-wrap:wrap;gap:2px 18px' : '' },
          h('div', { class: 'linha-flex' }, h('a', { href: abrir(1), target: '_blank' }, nomeDe(r.ficheiro_original || r.ficheiro)), h('span', { class: 'ajuda', style: 'margin:0' }, ficheirosExtra.length ? 'principal' : '')),
          ...ficheirosExtra.map((x, i) =>
            h('div', { class: 'linha-flex' },
              h('a', { href: abrir(i + 2), target: '_blank', title: x.ficheiro }, x.rotulo || nomeDe(x.ficheiro)),
              nomeDe(x.original) && !nomeDe(x.original).startsWith((x.rotulo || '') + '.') ? h('span', { class: 'ajuda', style: 'margin:0' }, nomeDe(x.original)) : null,
              h('button', {
                class: 'botao-texto', style: 'font-size:12px',
                title: 'Tirar este ficheiro desta ficha e dar-lhe uma ficha própria (por rever)',
                onclick: async () => {
                  if (!confirm(`Separar «${x.rotulo || nomeDe(x.ficheiro)}» desta ficha? Fica com uma ficha própria, por rever. O ficheiro não é apagado.`)) return
                  try {
                    const nova = await servico('separar', { id: r.id, indice: i })
                    toast(`Nova ficha ${numeroFmt(nova.numero)} (por rever).`)
                    abrirFonte(r.id)
                    rota()
                  } catch (e) {
                    toast(mensagemErro(e), true)
                  }
                },
              }, '(separar)')
            )
          )
        ),
        h('p', { class: 'ajuda' },
          'Uma obra em vários volumes ou um livro de partes pode ter vários ficheiros numa só ficha. ',
          h('button', { class: 'botao pequeno', onclick: juntarOutras }, 'Juntar outras fichas a esta…')
        )
      )
    }

    // Fonte fotografada página a página: as imagens originais (sem compressão), à parte do PDF de visualização
    if (r.id && r.metadados?.originais) {
      const caixaOrig = h('div', { class: 'ficheiros-fonte' }, h('p', { class: 'ajuda' }, 'A ler a lista de imagens…'))
      anexar(corpo,
        h('h3', {}, 'Fotografias originais'),
        h('p', { class: 'ajuda', style: 'margin-top:-4px' }, 'As imagens tal como foram fotografadas, sem compressão e com o nome original. O PDF acima é só para ver.'),
        caixaOrig
      )
      servico('originais', { id: r.id })
        .then(({ pastas }) => {
          caixaOrig.innerHTML = ''
          for (const p of pastas) {
            const mb = p.tamanho / 1048576
            const tam = mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`
            const abrirImg = (nome) => `/api/bib/ficheiro/${r.id}?token=${encodeURIComponent(pb.authStore.token)}&original=${encodeURIComponent(p.pasta + '/' + nome)}`
            anexar(caixaOrig,
              h('div', { class: 'linha-flex' },
                h('strong', {}, p.pasta.replace(/^_originais\//, '')),
                h('span', { class: 'ajuda', style: 'margin:0' }, p.existe ? `${p.ficheiros.length} imagens · ${tam}` : 'pasta não encontrada'),
                p.existe ? h('button', {
                  class: 'botao pequeno', title: 'Abre a pasta no Finder do Mac onde a biblioteca está a correr',
                  onclick: async () => {
                    try {
                      await servico('mostrar-originais', { id: r.id, pasta: p.pasta })
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                }, 'Mostrar no Finder') : null
              ),
              p.ficheiros.length ? h('details', {},
                h('summary', {}, `Ver as ${p.ficheiros.length} imagens`),
                h('div', { style: 'display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px' },
                  ...p.ficheiros.map((nome) => h('a', { href: abrirImg(nome), target: '_blank' }, nome))
                )
              ) : null,
              h('p', { class: 'ajuda', style: 'margin:2px 0 8px' }, 'Pasta: biblioteca/' + p.pasta)
            )
          }
        })
        .catch((e) => {
          caixaOrig.innerHTML = ''
          anexar(caixaOrig, h('p', { class: 'ajuda' }, 'Não foi possível ler a lista de imagens: ' + mensagemErro(e)))
        })
    }

    // Sugestões (candidatos)
    if (r.candidatos.length) {
      const caixa = h(
        'div',
        { class: 'caixa' + (r.estado === 'a_rever' ? ' destaque' : ''), id: 'sugestoes', style: 'margin-top:16px' },
        h('h3', { style: 'margin-top:0' }, `Sugestões encontradas (${r.candidatos.length})`),
        h('p', { class: 'ajuda', style: 'margin-top:-4px' }, 'Escolha a correspondência certa para preencher os metadados. Pode depois corrigir à mão.')
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
              h('div', { class: 'meta' }, [autoresTexto(c.autores, 4), c.data, c.editora, c.metadados?.album, c.metadados?.revista, c.metadados?.cota && `cota ${c.metadados.arquivo || ''} ${c.metadados.cota}`].filter(Boolean).join(' · ')),
              h(
                'div',
                { class: 'meta' },
                h('span', { class: 'etiqueta' }, c.fonte),
                ' ',
                c.tipo_sugerido ? h('span', { class: 'etiqueta' }, c.tipo_sugerido) : null,
                ' ',
                c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, 'ver na origem') : null
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
                      alterado = true
                      redesenhar()
                      toast('Sugestão aplicada. Verifique e confirme.')
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                },
                'Usar esta'
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
        const remover = h('button', { class: 'botao-icone', title: 'Remover', onclick: () => (r.autores.splice(i, 1), marcar(), desenharAutores()) }, '✕')
        if (a.literal !== undefined) {
          anexar(autoresBox, 
            h('div', { class: 'autor-linha literal' }, h('input', { type: 'text', placeholder: 'Entidade (orquestra, instituição…)', value: a.literal, oninput: (e) => ((a.literal = e.target.value), marcar()) }), papel, remover)
          )
        } else {
          anexar(autoresBox, 
            h(
              'div',
              { class: 'autor-linha' },
              h('input', { type: 'text', placeholder: 'Apelido', value: a.apelido || '', oninput: (e) => ((a.apelido = e.target.value), marcar()) }),
              h('input', { type: 'text', placeholder: 'Nome(s) próprio(s)', value: a.nome || '', oninput: (e) => ((a.nome = e.target.value), marcar()) }),
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
          h('button', { class: 'botao pequeno', onclick: () => (r.autores.push({ apelido: '', nome: '', papel: r.autores.length ? 'autor' : papelPadrao(tipo) }), desenharAutores()) }, '+ Pessoa'),
          h('button', { class: 'botao pequeno', onclick: () => (r.autores.push({ literal: '', papel: 'autor' }), desenharAutores()) }, '+ Entidade / grupo')
        )
      )
    }
    desenharAutores()

    const inp = (chave, attrs) =>
      h('input', { type: 'text', value: r[chave] || '', oninput: (e) => ((r[chave] = e.target.value), marcar(), chave === 'titulo' && (corpo.querySelector('h1').textContent = e.target.value || 'Sem título')), ...(attrs || {}) })

    anexar(corpo, 
      h('h3', {}, 'Identificação'),
      h(
        'div',
        { class: 'grelha' },
        campo('Tipo de fonte', selectTipos(r.tipo, (e) => ((r.tipo = e.target.value), marcar(), redesenhar()))),
        campo('Natureza', selectSimples({ '': '—', primária: 'Primária', secundária: 'Secundária' }, r.natureza, { onchange: (e) => ((r.natureza = e.target.value), marcar()) })),
        campo('Título', inp('titulo'), { class: 'largo' }),
        h('div', { class: 'largo' }, h('label', { class: 'campo' }, h('span', {}, 'Autores e outros responsáveis')), autoresBox),
        campo('Data (ex.: 1985, 1621-03-12, c. 1740)', inp('data')),
        campo(tipo?.categoria === 'Audiovisual' ? 'Editora discográfica / produtora' : 'Editora', inp('editora')),
        campo('Local', inp('local')),
        campo('DOI', inp('doi')),
        campo('ISBN', inp('isbn')),
        campo('Endereço web (URL)', inp('url', { type: 'url' }))
      )
    )

    // Campos específicos do tipo + campos extra
    anexar(corpo, h('h3', {}, `Campos de «${tipo?.nome || 'Outro'}»`))
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
          h('span', {}, k, ' ', h('button', { class: 'botao-texto', style: 'font-size:12px', onclick: (e) => (e.preventDefault(), delete r.metadados[k], marcar(), redesenhar()) }, '(remover)')),
          h('input', { type: 'text', value: typeof r.metadados[k] === 'object' ? JSON.stringify(r.metadados[k]) : r.metadados[k], oninput: (e) => ((r.metadados[k] = e.target.value), marcar()) })
        )
      )
    }
    if (!(tipo?.campos || []).length && !extras.length) anexar(especificos, h('p', { class: 'ajuda largo' }, 'Este tipo ainda não tem campos próprios.'))
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
          c
        )
      )
    })
    anexar(corpo, 
      h('h3', {}, 'Finalidade e organização'),
      h('label', { class: 'campo' }, h('span', {}, 'Contexto / UC associado (opcional)'), chipsCtx),
      h('div', { style: 'height:12px' }),
      campo(
        'Palavras-chave (separadas por ponto e vírgula)' + (r.metadados?.palavras_chave_origem ? ` · origem: ${r.metadados.palavras_chave_origem}` : ''),
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
        'Etiquetas pessoais (separadas por vírgulas)',
        h('input', {
          type: 'text',
          value: r.tags.join(', '),
          oninput: (e) => ((r.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)), marcar()),
        })
      ),
      h('div', { style: 'height:12px' }),
      campo('Notas gerais / resumo', h('textarea', { rows: 3, oninput: (e) => ((r.notas = e.target.value), marcar()) }, r.notas || ''))
    )

    // Notas de leitura
    if (r.id) {
      const caixaNotas = h('div', { class: 'caixa' })
      anexar(corpo, h('h2', {}, 'Notas de leitura'), caixaNotas)
      desenharNotas(caixaNotas, r)
    } else {
      anexar(corpo, h('p', { class: 'ajuda', style: 'margin-top:20px' }, 'Depois de guardar poderá acrescentar notas de leitura.'))
    }

    // Texto integral
    if (r.id) {
      const caixaTexto = h('div', {})
      anexar(corpo, h('h2', {}, 'Texto integral'), caixaTexto)
      desenharTexto(caixaTexto, r)
    }

    // Procurar noutros catálogos
    const termo = encodeURIComponent([r.titulo, r.autores?.[0] && nomeAutor(r.autores[0])].filter(Boolean).join(' '))
    anexar(corpo, 
      h('h3', {}, 'Procurar noutros catálogos'),
      h('div', { class: 'chips' }, PESQUISAS_EXTERNAS.map(([n, u]) => h('a', { class: 'chip', href: u + termo, target: '_blank', rel: 'noopener' }, n + ' ↗'))),
      h('p', { class: 'ajuda' }, 'O JSTOR e o Google Scholar não permitem pesquisa automática; estas ligações abrem a pesquisa no navegador (com a sua sessão institucional, se a tiver).')
    )

    if (r.id) {
      anexar(corpo, 
        h('h3', {}, 'Outras ações'),
        h(
          'div',
          { class: 'linha-flex' },
          r.ficheiro
            ? h(
                'button',
                {
                  class: 'botao pequeno',
                  title: 'Voltar a ler o ficheiro com as regras e a IA local mais recentes (substitui os dados atuais desta ficha)',
                  onclick: async () => {
                    if (alterado) await guardar()
                    if (!confirm('Voltar a identificar esta fonte a partir do ficheiro? Os dados atuais da ficha podem ser substituídos. As notas de leitura mantêm-se.')) return
                    try {
                      await servico('reanalisar', { id: r.id })
                      toast('Em reanálise. A ficha atualiza-se quando terminar (acompanhe em «Atividade»).')
                      fecharPainel()
                    } catch (e) {
                      toast(mensagemErro(e), true)
                    }
                  },
                },
                'Reanalisar ficheiro'
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
                    toast('OCR colocado em fila. Pode acompanhar em «Atividade».')
                    redesenhar()
                  },
                },
                'Refazer OCR'
              )
            : null,
          h(
            'button',
            {
              class: 'botao pequeno perigo',
              onclick: async () => {
                if (!confirm('Apagar esta fonte da base de dados? As notas de leitura também são apagadas. O ficheiro (se existir) fica no disco, na pasta biblioteca.')) return
                await pb.collection('fontes').delete(r.id)
                fecharPainel()
                toast('Fonte apagada.')
                rota()
              },
            },
            'Apagar fonte'
          )
        )
      )
    }

    // Rodapé
    if (r.ficheiro) {
      anexar(rodape, 
        h('label', { class: 'linha-flex', style: 'margin-right:auto;font-size:13px;color:var(--tinta-2)' }, h('input', { type: 'checkbox', id: 'renomear', checked: r.estado === 'completo' }), 'Atualizar nome e pasta do ficheiro')
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
              redesenhar()
            }
          },
        },
        'Guardar'
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
          'Guardar e confirmar'
        )
      )
    }
  }

  const painel = abrirPainel({
    topo,
    corpo,
    rodape,
    aoFechar: () => {
      if (alterado && confirm('Há alterações por guardar. Guardar agora?')) guardar().then(() => rota())
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
  else if (c.tipo === 'data') controlo = h('input', { type: 'text', placeholder: 'aaaa-mm-dd ou ano', value: v || '', oninput: (e) => definir(e.target.value) })
  else if (c.tipo === 'lista') controlo = selectSimples(['', ...(c.opcoes || []), ...(v && !(c.opcoes || []).includes(v) ? [v] : [])], v || '', { onchange: (e) => definir(e.target.value) })
  else if (c.tipo === 'sim_nao') controlo = selectSimples({ '': '—', sim: 'Sim', nao: 'Não' }, v === true ? 'sim' : v === false ? 'nao' : '', { onchange: (e) => definir(e.target.value === '' ? '' : e.target.value === 'sim') })
  else controlo = h('input', { type: 'text', value: v || '', oninput: (e) => definir(e.target.value) })
  return campo(c.rotulo, controlo, { class: c.tipo === 'texto_longo' ? 'largo' : '' })
}

function formularioCampoNovo(r, tipo, marcar, redesenhar) {
  const caixa = h('div', { class: 'oculto', style: 'margin-top:12px' })
  const nome = h('input', { type: 'text', placeholder: 'Nome do campo (ex.: Dedicatário)' })
  const tipoCampo = selectSimples(TIPOS_CAMPO, 'texto')
  const noTipo = h('input', { type: 'checkbox', checked: true })
  anexar(caixa, 
    h(
      'div',
      { class: 'caixa' },
      h('div', { class: 'grelha' }, campo('Nome do campo', nome), campo('Tipo de valor', tipoCampo)),
      h('label', { class: 'linha-flex', style: 'margin-top:10px;font-size:14px' }, noTipo, `Acrescentar também ao tipo «${tipo?.nome || ''}» (fica disponível em todas as fontes deste tipo)`),
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
          'Acrescentar campo'
        ),
        h('button', { class: 'botao pequeno', onclick: () => caixa.classList.add('oculto') }, 'Cancelar')
      )
    )
  )
  return h('div', {}, h('button', { class: 'botao-texto', style: 'margin-top:10px', onclick: () => (caixa.classList.remove('oculto'), nome.focus()) }, '+ Novo campo'), caixa)
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
  if (!notas.length) anexar(lista, h('p', { class: 'ajuda', style: 'margin:0 0 8px' }, 'Ainda sem notas. Registe citações, paráfrases, comentários, ideias ou perguntas, com a página, fólio ou minutagem.'))
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
        n.tipo_nota ? h('span', { class: 'etiqueta' }, n.tipo_nota) : null,
        (n.contextos || []).map((c) => h('span', { class: 'etiqueta acento' }, c)),
        (n.tags || []).map((t) => h('span', { class: 'etiqueta' }, '#' + t)),
        editavel
          ? h(
              'span',
              { style: 'margin-left:auto' },
              h('button', { class: 'botao-texto', onclick: () => (el.innerHTML = '', anexar(el, formularioNota(n.fonte, n, aoMudar))) }, 'Editar'),
              ' · ',
              h(
                'button',
                {
                  class: 'botao-texto',
                  style: 'color:var(--erro)',
                  onclick: async () => {
                    if (!confirm('Apagar esta nota?')) return
                    await pb.collection('notas_leitura').delete(n.id)
                    aoMudar()
                  },
                },
                'Apagar'
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
  const loc = h('input', { type: 'text', placeholder: 'p. 23 · fól. 3v · 12:30', value: n.localizacao })
  const tipoN = selectSimples(TIPOS_NOTA, n.tipo_nota)
  const texto = h('textarea', { rows: 4, placeholder: 'Texto da nota…' }, n.texto)
  const tags = h('input', { type: 'text', placeholder: 'etiquetas, separadas, por vírgulas', value: (n.tags || []).join(', ') })
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
        c
      )
    )
  )
  anexar(caixa, 
    h(
      'div',
      { class: 'grelha' },
      campo('Localização', loc),
      campo('Tipo de nota', tipoN),
      campo('Texto', texto, { class: 'largo' }),
      campo('Etiquetas', tags, { class: 'largo' }),
      h('div', { class: 'largo' }, h('label', { class: 'campo' }, h('span', {}, 'Contexto / UC (opcional)')), chips)
    ),
    h(
      'div',
      { class: 'linha-flex', style: 'margin-top:10px' },
      h(
        'button',
        {
          class: 'botao pequeno primario',
          onclick: async () => {
            if (!texto.value.trim()) return toast('Escreva o texto da nota.', true)
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
        nota ? 'Guardar nota' : 'Acrescentar nota'
      ),
      h('button', { class: 'botao pequeno', onclick: () => (nota ? aoGuardar() : caixa.classList.add('oculto')) }, 'Cancelar')
    )
  )
  if (aberto) return caixa
  return h('div', {}, h('button', { class: 'botao pequeno', onclick: (e) => (caixa.classList.remove('oculto'), e.target.remove(), texto.focus()) }, '+ Nova nota'), caixa)
}

async function desenharTexto(caixa, fonte) {
  let t = null
  try {
    t = await pb.collection('textos').getFirstListItem(pb.filter('fonte = {:f}', { f: fonte.id }))
  } catch (_) {}
  if (!t || !t.conteudo) {
    const msg = fonte.ocr_estado === 'pendente' || fonte.ocr_estado === 'em_curso' ? 'O OCR ainda está a decorrer; o texto aparece aqui quando terminar.' : 'Sem texto extraído para esta fonte.'
    anexar(caixa, h('p', { class: 'ajuda' }, msg))
    return
  }
  const completo = t.conteudo.length <= 6000
  const pre = h('div', { class: 'texto-integral' }, completo ? t.conteudo : t.conteudo.slice(0, 6000) + '…')
  anexar(caixa, 
    h('p', { class: 'ajuda' }, `${t.metodo === 'ocr' ? 'Obtido por OCR (aproximado)' : 'Extraído do ficheiro'} · ${t.conteudo.length.toLocaleString('pt-PT')} caracteres`),
    pre,
    completo ? null : h('button', { class: 'botao-texto', style: 'margin-top:6px', onclick: (e) => ((pre.textContent = t.conteudo), e.target.remove()) }, 'Mostrar o texto completo')
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
    return toast('O formulário de comentários ainda não está configurado nesta versão.', true)
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
  const nome = h('input', { type: 'text', id: 'boas-vindas-nome', autocomplete: 'name', placeholder: 'Ex.: Maria da Conceição Gonçalves' })
  const erro = h('div', { class: 'mensagem-erro' })
  const guardar = async () => {
    if (!nome.value.trim()) return (erro.textContent = 'Escreva o seu nome, ou carregue em «Mais tarde».')
    try {
      await guardarDefinicao('nome_dono', nome.value.trim())
      fecharPainel()
      toast('Nome guardado. Pode mudá-lo em Definições.')
    } catch (e) {
      erro.textContent = mensagemErro(e)
    }
  }
  abrirPainel({
    topo: h('strong', {}, 'Bem-vindo'),
    corpo: h(
      'div',
      {},
      h('h1', {}, 'Bem-vindo ao TINCTORIS'),
      h('p', { class: 'subtitulo' }, 'Antes de começar, diga-nos o seu nome.'),
      h('div', { style: 'margin-top:16px' }, campo('O seu nome', nome)),
      h('p', { class: 'ajuda' }, 'Serve para o TINCTORIS distinguir o seu trabalho das fontes: num PDF que digitalizou, não é o autor; numa transcrição que fez num editor de partituras, é o editor. Se assina de mais de uma forma, separe-as com «;». Pode mudá-lo em Definições.'),
      erro,
      h('h3', {}, 'Versão beta'),
      h('p', {}, 'Se alguma coisa não funcionar, podia funcionar melhor ou faz falta, use «Enviar comentário», no fundo da barra lateral.')
    ),
    rodape: [h('button', { class: 'botao', onclick: () => (guardarPreferencia('boas-vindas-adiadas', true), fecharPainel()) }, 'Mais tarde'), h('button', { class: 'botao primario', onclick: guardar }, 'Guardar')],
  })
  setTimeout(() => nome.focus(), 50)
}

// Créditos (o mesmo conteúdo do CREDITOS.md, gerado a partir de pb_public/creditos.json)
async function caixaCreditos() {
  const c = await lerJsonPublico('creditos.json')
  const caixa = h('div', { class: 'caixa creditos' })
  if (!c.nota) return anexar(caixa, h('p', { class: 'ajuda' }, 'Créditos indisponíveis.')), caixa
  const pessoas = (lista, vazio) =>
    (lista || []).length
      ? h(
          'div',
          { class: 'lista-creditos' },
          lista.map((p) =>
            h(
              'div',
              { class: 'entrada-credito' },
              h('div', { class: 'quem' }, p.nome, p.onde ? h('span', {}, p.onde) : null),
              h('ul', {}, (p.alteracoes || []).map((a) => h('li', {}, a.texto, a.versao ? h('span', { class: 'versao' }, ' ' + a.versao) : null)))
            )
          )
        )
      : h('p', { class: 'ajuda' }, vazio)
  anexar(
    caixa,
    h('h3', { style: 'margin-top:0' }, 'Conceção e desenvolvimento'),
    h('p', {}, c.nota),
    h('h3', {}, 'Contribuições para o código'),
    pessoas(c.codigo, 'Ainda sem contribuições.'),
    h('h3', {}, 'Tradução e revisão'),
    pessoas(c.traducao, 'Ainda sem contribuições.'),
    h('h3', {}, 'Beta testers'),
    pessoas(c.testers, 'Ainda sem contribuições.'),
    h('p', { class: 'ajuda' }, 'Só aparecem os testers que deixaram o nome e marcaram «Aceito aparecer nos créditos» no formulário de comentários.'),
    h('h3', {}, 'Projetos e catálogos'),
    h('p', {}, 'O TINCTORIS existe graças ao trabalho aberto destes projetos:'),
    h('ul', { class: 'projetos-creditos' }, (c.projetos || []).map((p) => h('li', {}, h('strong', {}, p.nome), p.papel ? `, ${p.papel}` : ''))),
    h('p', { class: 'ajuda' }, 'Licenças de cada componente: ficheiro TERCEIROS.md. Esta lista também está no ficheiro CREDITOS.md do repositório.')
  )
  return caixa
}

// ---------------------------------------------------------------------------
// Exportar bibliografia

async function abrirExportar(opcoes = {}) {
  let ids = opcoes.ids
  let origem = opcoes.origem
  if (!ids) {
    if (estado.selecionados.size) {
      ids = [...estado.selecionados]
      origem = `${ids.length} fonte${ids.length > 1 ? 's' : ''} selecionada${ids.length > 1 ? 's' : ''}`
    } else {
      ids = await idsDaPesquisa()
      origem = `todas as ${ids.length} fontes da pesquisa atual`
    }
  }
  if (!ids.length) return toast('Não há fontes para exportar.', true)

  let estilos = []
  try {
    estilos = await servico('estilos')
  } catch (e) {
    return toast('O serviço de fundo não está a responder: ' + mensagemErro(e), true)
  }
  const estiloSel = selectSimples(Object.fromEntries(estilos.map((e) => [e.id, e.titulo])), lerPreferencia('estilo', 'apa'))
  const linguaSel = selectSimples({ 'pt-PT': 'Português', 'en-US': 'Inglês' }, lerPreferencia('lingua', 'pt-PT'))
  const formatoSel = selectSimples(
    { texto: 'Texto simples', html: 'HTML', rtf: 'RTF (abre no Word com itálicos)', bibtex: 'BibTeX (LaTeX, Zotero)', ris: 'RIS (Zotero, Mendeley, EndNote)', 'csl-json': 'CSL-JSON', 'notas-md': 'Notas de leitura (Markdown)' },
    opcoes.formato || lerPreferencia('formato', 'texto')
  )
  const previa = h('div', { class: 'pre-visualizacao' }, 'A preparar…')
  let ultimo = null

  const gerar = async (formato) => servico('exportar', { ids, estilo: estiloSel.value, lingua: linguaSel.value, formato })

  const atualizar = async () => {
    guardarPreferencia('estilo', estiloSel.value)
    guardarPreferencia('lingua', linguaSel.value)
    guardarPreferencia('formato', formatoSel.value)
    previa.textContent = 'A preparar…'
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
      toast('Copiado. Pode colar no Word ou noutro editor.')
    } catch (e) {
      toast('Não foi possível copiar: ' + mensagemErro(e), true)
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
    topo: h('strong', {}, 'Exportar bibliografia'),
    corpo: h(
      'div',
      {},
      h('h1', {}, 'Exportar'),
      h('p', { class: 'subtitulo' }, `A exportar ${origem}.`),
      h('div', { class: 'grelha', style: 'margin-top:16px' }, campo('Estilo de citação', estiloSel), campo('Língua dos termos', linguaSel), campo('Formato', formatoSel)),
      h('h3', {}, 'Pré-visualização'),
      previa,
      h('p', { class: 'ajuda' }, 'Pode acrescentar outros estilos colocando ficheiros .csl (de zotero.org/styles) na pasta app/estilos.')
    ),
    rodape: [h('button', { class: 'botao', onclick: copiar }, 'Copiar'), h('button', { class: 'botao primario', onclick: descarregar }, 'Descarregar ficheiro')],
  })
  atualizar()
}

// ---------------------------------------------------------------------------
// Importar bibliotecas (BibTeX / RIS)

async function vistaImportar() {
  const p = principal()
  const area = h('div', {})
  p.append(
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Importar'), h('p', { class: 'subtitulo' }, 'Traga a sua biblioteca do Mendeley, do Zotero ou de outro gestor de referências.'))),
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
        h('h3', { style: 'margin-top:0' }, e.terminado ? 'Importação concluída' : 'A importar…'),
        h('div', { class: 'progresso', style: 'margin:8px 0' }, h('div', { style: `width:${pct}%` })),
        h('p', {}, `${e.feitas} de ${e.total} referências processadas · ${e.criadas} fontes novas` + (e.completadas ? ` · ${e.completadas} completadas online` : '') + (e.enriquecidas ? ` · ${e.enriquecidas} já existentes completadas com os dados do ficheiro` : '') + (e.notas ? ` · ${e.notas} notas` : '') + (e.ficheiros ? ` · ${e.ficheiros} ficheiros` : '')),
        e.erros.length ? h('details', {}, h('summary', {}, `${e.erros.length} problema(s)`), h('div', { class: 'registo' }, e.erros.slice(0, 200).map((x) => h('div', { class: 'erro' }, x)))) : null,
        e.terminado
          ? h('div', { class: 'linha-flex', style: 'margin-top:12px' }, h('a', { class: 'botao primario', href: '#/fontes' }, 'Ver as fontes'), h('a', { class: 'botao', href: '#/rever' }, 'Ver as que estão por rever'))
          : h('p', { class: 'ajuda' }, 'Pode continuar a usar a biblioteca enquanto a importação decorre.')
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
    resultado.append(h('p', { class: 'ajuda' }, `A analisar «${f.name}»…`))
    let r
    try {
      const texto = await f.text()
      r = await servico('importar-analisar', { texto, nome: f.name })
    } catch (e) {
      resultado.innerHTML = ''
      return resultado.append(h('div', { class: 'caixa destaque' }, 'Não foi possível ler o ficheiro: ', mensagemErro(e)))
    }
    mostrarAnalise(r, f.name)
  })

  const mostrarAnalise = (r, nome) => {
    resultado.innerHTML = ''
    const novas = r.total - r.duplicados
    const completar = h('input', { type: 'checkbox', checked: true })
    const pastas = h('input', { type: 'checkbox', checked: true })
    const copiar = h('input', { type: 'checkbox', checked: true })
    const contexto = selectSimples({ '': '— nenhum —', ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, '')
    anexar(
      resultado,
      h('h2', {}, `«${nome}»`),
      h(
        'div',
        { class: 'caixa' },
        h('div', { style: 'font-size:21px;font-weight:600' }, novas === 1 ? '1 fonte nova' : `${novas} fontes novas`),
        h('p', { class: 'ajuda', style: 'margin-top:2px' }, `de ${r.total} referências no ficheiro` + (r.duplicados ? ` — ${r.duplicados} ${r.duplicados === 1 ? 'é uma repetição' : 'são repetições'} (dentro do ficheiro ou de fontes que já estão na biblioteca). Não se criam fontes duplicadas: as que já existem são completadas com os dados deste ficheiro.` : '.')),
        h('div', { class: 'chips', style: 'margin-top:10px' }, Object.entries(r.porTipo).sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'etiqueta' }, `${t}: ${n}`))),
        r.incompletas ? h('p', {}, h('strong', {}, r.incompletas === 1 ? '1 está incompleta' : `${r.incompletas} estão incompletas`), ' (sem autor ou sem data). Ficam em «Por rever» para completar.') : null,
        r.comNotas ? h('p', {}, `${r.comNotas} ${r.comNotas === 1 ? 'tem' : 'têm'} anotações do Mendeley — passam a notas de leitura.`) : null,
        r.comFicheiros ? h('p', {}, `${r.comFicheiros} ${r.comFicheiros === 1 ? 'tem' : 'têm'} PDF anexado; ${r.ficheirosEncontrados} encontrado(s) neste computador.`, r.semAcesso ? ' (O macOS pode pedir autorização para aceder à pasta dos PDFs.)' : '') : null,
        r.grupos.length ? h('p', {}, `Pastas do Mendeley: ${r.grupos.join(', ')}`) : null,
        h('h3', {}, 'Exemplos'),
        h('ul', { style: 'margin:0;padding-left:20px' }, r.exemplos.map((x) => h('li', {}, x.titulo, h('span', { class: 'ajuda' }, ` — ${x.data || 's.d.'} · ${x.tipo}`))))
      ),
      h('h2', {}, 'Opções'),
      h(
        'div',
        { class: 'caixa' },
        r.incompletas
          ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, completar, `Procurar online o que falta nas ${r.incompletas} referências incompletas (demora cerca de ${Math.max(1, Math.round(r.incompletas / 40))} min; só preenche campos vazios)`)
          : null,
        r.grupos.length ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, pastas, 'Transformar as pastas do Mendeley em etiquetas') : null,
        r.ficheirosEncontrados ? h('label', { class: 'linha-flex', style: 'margin:4px 0' }, copiar, 'Copiar os PDFs para a biblioteca (o original fica onde está)') : null,
        h('label', { class: 'campo', style: 'margin-top:10px;max-width:420px' }, h('span', {}, 'Atribuir um contexto / UC a todas (opcional)'), contexto)
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
          `Importar ${novas} fonte${novas === 1 ? '' : 's'}`
        ),
        h('button', { class: 'botao', onclick: () => vistaImportar() }, 'Cancelar')
      )
    )
  }

  anexar(
    area,
    h(
      'div',
      { class: 'caixa' },
      h('h3', { style: 'margin-top:0' }, 'Como exportar'),
      h('p', { style: 'margin:4px 0' }, h('strong', {}, 'Mendeley: '), 'selecione todas as referências (⌘A) → Exportar → BibTeX (.bib).'),
      h('p', { style: 'margin:4px 0' }, h('strong', {}, 'Zotero: '), 'Ficheiro → Exportar biblioteca → BibTeX ou RIS.'),
      h('p', { class: 'ajuda' }, 'Primeiro vê-se um resumo do que vai ser importado; nada é gravado até confirmar. As repetições são detetadas e ignoradas.'),
      h('button', { class: 'botao primario', style: 'margin-top:8px', onclick: () => entrada.click() }, 'Escolher ficheiro…'),
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
        anexar(lista, h('div', { class: 'lista' }, h('div', { class: 'vazio' }, h('strong', {}, 'Sem notas'), 'As notas de leitura acrescentam-se na ficha de cada fonte.')))
        return
      }
      const caixa = h('div', { class: 'caixa' })
      r.items.forEach((n) => anexar(caixa, vistaNota(n, carregar, false, n.expand?.fonte ? `${n.expand.fonte.titulo}${n.expand.fonte.data ? ' (' + n.expand.fonte.data + ')' : ''}` : '')))
      anexar(lista, h('p', { class: 'ajuda' }, `${r.totalItems} nota${r.totalItems === 1 ? '' : 's'}`), caixa)
    } catch (e) {
      anexar(lista, h('p', { class: 'mensagem-erro' }, mensagemErro(e)))
    }
  }
  const aoEscrever = atraso(carregar, 300)
  anexar(p, 
    h(
      'div',
      { class: 'cabecalho' },
      h('div', {}, h('h1', {}, 'Notas de leitura'), h('p', { class: 'subtitulo' }, 'Todas as suas notas, de todas as fontes.')),
      h(
        'button',
        {
          class: 'botao',
          onclick: () => {
            const ids = [...new Set(ultimas.map((n) => n.fonte))]
            abrirExportar({ ids, origem: `as notas de ${ids.length} fonte${ids.length === 1 ? '' : 's'}`, formato: 'notas-md' })
          },
        },
        'Exportar estas notas'
      )
    ),
    h(
      'div',
      { class: 'grelha', style: 'margin-bottom:14px' },
      campo('Pesquisar nas notas', h('input', { type: 'search', placeholder: 'palavra, página, etiqueta, título da fonte…', oninput: (e) => ((filtro.q = e.target.value), aoEscrever()) })),
      campo('Tipo de nota', selectSimples({ '': 'Todos', ...Object.fromEntries(TIPOS_NOTA.map((t) => [t, t])) }, '', { onchange: (e) => ((filtro.tipo = e.target.value), carregar()) })),
      campo('Contexto / UC', selectSimples({ '': 'Todos', ...Object.fromEntries(CONTEXTOS.map((c) => [c, c])) }, '', { onchange: (e) => ((filtro.contexto = e.target.value), carregar()) }))
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
      h('div', {}, h('h1', {}, 'Tipos de fonte'), h('p', { class: 'subtitulo' }, 'Crie tipos novos e defina os campos de cada um. As alterações aplicam-se de imediato.')),
      h('button', { class: 'botao primario', onclick: () => editarTipo(null) }, '+ Novo tipo')
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
          h('div', {}, h('div', { class: 'titulo' }, t.nome), h('div', { class: 'meta' }, (t.campos || []).map((c) => c.rotulo).join(' · ') || 'Sem campos próprios')),
          h('div', { class: 'lado' }, h('span', { class: 'etiqueta' }, CSL_TIPOS[t.csl_tipo] || t.csl_tipo || '—'), t.natureza_padrao ? h('span', { class: 'etiqueta' }, t.natureza_padrao) : null)
        )
      )
    )
    anexar(p, h('h2', {}, cat), l)
  }
}

function editarTipo(t) {
  const r = t ? JSON.parse(JSON.stringify(t)) : { nome: '', categoria: 'Escrita', csl_tipo: 'document', csl_genero: '', natureza_padrao: '', descricao: '', campos: [], ordem: (estado.tipos.length + 1) * 10 }
  r.campos = Array.isArray(r.campos) ? r.campos : []
  const corpo = h('div', {})
  const camposBox = h('div', { class: 'campos-tipo caixa' })

  const desenharCampos = () => {
    camposBox.innerHTML = ''
    if (!r.campos.length) anexar(camposBox, h('p', { class: 'ajuda', style: 'margin:0' }, 'Sem campos. Acrescente os que precisar.'))
    r.campos.forEach((c, i) => {
      const opcoes = h('input', { type: 'text', placeholder: 'opções, separadas, por vírgulas', value: (c.opcoes || []).join(', '), oninput: (e) => (c.opcoes = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) })
      anexar(camposBox, 
        h(
          'div',
          { class: 'campo-def' },
          h('input', { type: 'text', placeholder: 'Nome do campo', value: c.rotulo, oninput: (e) => ((c.rotulo = e.target.value), c._novo && (c.chave = slug(e.target.value))) }),
          selectSimples(TIPOS_CAMPO, c.tipo || 'texto', { onchange: (e) => ((c.tipo = e.target.value), desenharCampos()) }),
          c.tipo === 'lista' ? opcoes : h('span', { class: 'ajuda', style: 'margin:0' }, c.chave ? 'chave: ' + c.chave : ''),
          selectSimples(CSL_VARS, c.csl || '', { title: 'Como este campo aparece nas citações', onchange: (e) => (e.target.value ? (c.csl = e.target.value) : delete c.csl) }),
          h(
            'span',
            { class: 'linha-flex', style: 'gap:4px' },
            h('button', { class: 'botao pequeno', title: 'Subir', disabled: i === 0, onclick: () => (r.campos.splice(i - 1, 0, r.campos.splice(i, 1)[0]), desenharCampos()) }, '↑'),
            h('button', { class: 'botao pequeno', title: 'Descer', disabled: i === r.campos.length - 1, onclick: () => (r.campos.splice(i + 1, 0, r.campos.splice(i, 1)[0]), desenharCampos()) }, '↓'),
            h('button', { class: 'botao-icone', title: 'Remover', onclick: () => (r.campos.splice(i, 1), desenharCampos()) }, '✕')
          )
        )
      )
    })
  }
  desenharCampos()

  anexar(corpo, 
    h('h1', {}, t ? t.nome : 'Novo tipo de fonte'),
    h(
      'div',
      { class: 'grelha', style: 'margin-top:14px' },
      campo('Nome', h('input', { type: 'text', value: r.nome, oninput: (e) => (r.nome = e.target.value) })),
      campo('Categoria', selectSimples(CATEGORIAS, r.categoria, { onchange: (e) => (r.categoria = e.target.value) })),
      campo('Natureza por omissão', selectSimples({ '': '—', primária: 'Primária', secundária: 'Secundária' }, r.natureza_padrao, { onchange: (e) => (r.natureza_padrao = e.target.value) })),
      campo('Tipo para citações', selectSimples(CSL_TIPOS, r.csl_tipo || 'document', { onchange: (e) => (r.csl_tipo = e.target.value) })),
      campo('Designação na citação (opcional, ex.: «Carta»)', h('input', { type: 'text', value: r.csl_genero || '', oninput: (e) => (r.csl_genero = e.target.value) })),
      campo('Descrição', h('textarea', { rows: 2, oninput: (e) => (r.descricao = e.target.value) }, r.descricao || ''), { class: 'largo' })
    ),
    h('h3', {}, 'Campos próprios'),
    h('p', { class: 'ajuda', style: 'margin-top:-4px' }, 'Coluna final: como o campo entra nas citações (ex.: «Cota» → Cota). Deixe «não entra» para campos só de trabalho.'),
    camposBox,
    h('button', { class: 'botao pequeno', style: 'margin-top:10px', onclick: () => (r.campos.push({ chave: '', rotulo: '', tipo: 'texto', _novo: true }), desenharCampos()) }, '+ Campo')
  )

  const guardar = async () => {
    if (!r.nome.trim()) return toast('Indique o nome do tipo.', true)
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
      toast('Tipo guardado.')
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }

  const apagar = async () => {
    const usos = await pb.collection('fontes').getList(1, 1, { filter: pb.filter('tipo = {:t}', { t: t.id }), fields: 'id' })
    if (usos.totalItems) return toast(`Não é possível apagar: há ${usos.totalItems} fonte(s) deste tipo. Mude-lhes o tipo primeiro.`, true)
    if (!confirm(`Apagar o tipo «${t.nome}»?`)) return
    await pb.collection('tipos_fonte').delete(t.id)
    await carregarTipos()
    fecharPainel()
  }

  abrirPainel({
    topo: h('strong', {}, 'Tipo de fonte'),
    corpo,
    rodape: [t ? h('button', { class: 'botao perigo', style: 'margin-right:auto', onclick: apagar }, 'Apagar tipo') : null, h('button', { class: 'botao primario', onclick: guardar }, 'Guardar tipo')],
    aoFechar: () => vistaAtual() === 'tipos' && setTimeout(vistaTipos, 0),
  })
}

// ---------------------------------------------------------------------------
// Atividade do serviço de fundo

// Intensidade do trabalho de fundo: poupar a bateria do portátil (o serviço decide o resto; ver intensidade.js)
const NIVEIS_INTENSIDADE = [
  ['automatico', 'Automático', 'Ligado ao carregador trabalha à velocidade máxima; a bateria passa sozinho a poupança.'],
  ['maxima', 'Máxima', 'Tudo à velocidade normal, incluindo o OCR. O Mac não adormece enquanto a biblioteca está aberta.'],
  ['poupanca', 'Poupança', 'OCR parado; pausa de 30 s entre reanálises; prioridade baixa. Os ficheiros novos da watch folder continuam a entrar.'],
  ['pausa', 'Pausa', 'Nada é processado. As filas ficam guardadas e continuam quando escolher outro nível.'],
]
function caixaIntensidade(i, depois) {
  if (!i) return h('div', { class: 'caixa destaque' }, 'Para escolher a intensidade, reinicie o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).')
  const rotulo = Object.fromEntries(NIVEIS_INTENSIDADE.map(([k, r]) => [k, r]))
  const energia = i.bateria === null ? (i.carregador ? 'ligado ao carregador' : '') : `${i.carregador ? 'ligado ao carregador' : 'a bateria'} · ${i.bateria}%`
  const escolher = async (nivel) => {
    try {
      await servico('intensidade', { nivel })
      toast(`Intensidade: ${rotulo[nivel]}.`)
    } catch (err) {
      toast(err.message || 'Não foi possível mudar a intensidade.')
    }
    depois()
  }
  const descricao = (NIVEIS_INTENSIDADE.find(([k]) => k === i.nivel) || [])[2] || ''
  return h(
    'div',
    { class: 'caixa', style: 'margin-bottom:14px' },
    h('h3', { style: 'margin-top:0' }, 'Intensidade do trabalho de fundo'),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, ...NIVEIS_INTENSIDADE.map(([k, r]) => h('button', { class: k === i.nivel ? 'botao primario' : 'botao', 'aria-pressed': String(k === i.nivel), onclick: () => k !== i.nivel && escolher(k) }, r))),
    h('div', { class: 'ajuda' }, descricao),
    h('div', { class: 'ajuda' }, `Agora: ${rotulo[i.efetivo] || i.efetivo}${energia ? ` (${energia})` : ''}.`)
  )
}

function vistaAtividade() {
  const p = principal()
  const conteudo = h('div', {})
  anexar(p, h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Atividade'), h('p', { class: 'subtitulo' }, 'O que o serviço de fundo está a fazer: watch folder, metadados e OCR.'))), conteudo)
  let ativo = true
  const atualizar = async () => {
    if (!ativo) return
    let e
    try {
      e = await servico('estado')
    } catch (err) {
      conteudo.innerHTML = ''
      anexar(conteudo, h('div', { class: 'caixa destaque' }, h('strong', {}, 'O serviço de fundo não está a responder. '), 'A watch folder, o OCR e a exportação ficam parados até ele voltar. Reinicie o TINCTORIS com o ficheiro «Iniciar TINCTORIS».'))
      return
    }
    conteudo.innerHTML = ''
    const pct = e.ocr ? Math.round((100 * e.ocr.pagina) / Math.max(1, e.ocr.total)) : 0
    anexar(conteudo, caixaIntensidade(e.intensidade, atualizar))
    anexar(conteudo, 
      h(
        'div',
        { class: 'grelha' },
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, 'Watch folder'), e.entrada.ativo ? h('div', {}, 'A processar: ', h('strong', {}, e.entrada.ativo)) : h('div', {}, 'Em espera.'), h('div', { class: 'ajuda' }, e.entrada.novos === undefined ? `${e.entrada.pendentes} ficheiro(s) em fila` : `Novos: ${e.entrada.novos} · Reanálise: ${e.entrada.pendentes - e.entrada.novos}`)),
        h(
          'div',
          { class: 'caixa' },
          h('h3', { style: 'margin-top:0' }, 'OCR'),
          e.ocr ? [h('div', {}, h('strong', {}, e.ocr.titulo)), h('div', { class: 'ajuda' }, `página ${e.ocr.pagina} de ${e.ocr.total}`), h('div', { class: 'progresso' }, h('div', { style: `width:${pct}%` }))] : h('div', {}, 'Em espera.'),
          h('div', { class: 'ajuda' }, `${e.ocr_pendentes} documento(s) em fila`)
        ),
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, 'Por rever'), h('div', { style: 'font-size:26px;font-weight:600;font-variant-numeric:tabular-nums' }, e.por_rever), h('a', { href: '#/rever' }, 'Abrir lista')),
        h('div', { class: 'caixa' }, h('h3', { style: 'margin-top:0' }, 'IA local'), h('div', {}, e.ia?.disponivel ? h('span', { class: 'etiqueta ok' }, 'Ligada') : h('span', { class: 'etiqueta rever' }, 'Desligada')), h('div', { class: 'ajuda' }, e.ia?.modelo || ''))
      ),
      h('h2', {}, 'Aceder a partir de outros dispositivos'),
      h(
        'div',
        { class: 'caixa' },
        e.so_local
          ? h('p', { style: 'margin:0' }, 'O TINCTORIS está a abrir só neste Mac. Para o abrir também no iPad ou noutro computador da mesma rede Wi-Fi, desligue «Abrir só neste Mac» em Definições e volte a abrir o TINCTORIS.')
          : e.enderecos?.length
          ? [h('p', { style: 'margin-top:0' }, 'No iPad, telemóvel ou outro computador ligado à mesma rede Wi-Fi, abra no navegador:'), ...e.enderecos.map((u) => h('div', {}, h('a', { href: u, target: '_blank' }, u)))]
          : h('p', { style: 'margin:0' }, 'Sem ligação de rede detetada.')
      ),
      h('h2', {}, 'Pastas'),
      h('div', { class: 'caixa' }, h('div', {}, h('strong', {}, 'Entrada (watch folder): '), e.pastas.watch_folder), h('div', {}, h('strong', {}, 'Biblioteca organizada: '), e.pastas.biblioteca)),
      h('h2', {}, 'Registo'),
      h('div', { class: 'caixa registo' }, e.eventos.length ? e.eventos.map((ev) => h('div', { class: ev.nivel }, new Date(ev.quando).toLocaleTimeString('pt-PT'), ' — ', ev.msg)) : h('div', {}, 'Sem atividade desde o arranque.'))
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
      h('div', {}, h('h1', {}, 'Duplicados'), h('p', { class: 'subtitulo' }, 'PDFs muito parecidos. Veja os dois e decida: se forem o mesmo documento, escolha a ficha que fica; a outra deixa de existir (as notas de leitura e etiquetas passam para a que fica) e o ficheiro vai para a pasta _duplicados, sem ser apagado.'))
    ),
    secaoEspaco(),
    h('h2', {}, 'Pares por decidir'),
    conteudo
  )
  let dados
  try {
    dados = await servico('duplicados')
  } catch (e) {
    const antigo = /desconhecida/i.test(mensagemErro(e))
    anexar(conteudo, h('div', { class: 'caixa destaque' }, antigo ? 'Este ecrã fica ativo depois de reiniciar o TINCTORIS (fechar a janela do Terminal e abrir «Iniciar TINCTORIS»).' : `O serviço de fundo não respondeu: ${mensagemErro(e)}`))
    return
  }
  const pares = dados.pares
  let i = 0
  const mostrar = () => {
    conteudo.innerHTML = ''
    fusao.innerHTML = ''
    if (!pares.length) {
      anexar(conteudo, h('div', { class: 'caixa' }, dados.gerado_em ? 'Não há pares por decidir.' : 'Ainda não foi feita nenhuma procura de duplicados.'))
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
        h('div', { style: 'font-size:16px;font-weight:600' }, f.titulo || '(sem título)'),
        h('div', { class: 'ajuda' }, [autoresTexto(f.autores), f.data || f.ano, f.editora].filter(Boolean).join(' · ') || 'sem autor nem data'),
        h('div', { class: 'ajuda', style: 'word-break:break-all' }, `${f.paginas || '?'} páginas${aMais > 0 ? ` (${aMais} a mais)` : ''} · ficheiro original: ${f.ficheiro_original || '—'}`),
        h('iframe', { src: url, title: f.titulo, style: 'width:100%;height:65vh;border:1px solid var(--linha);border-radius:8px;background:#fff' }),
        h('div', { class: 'linha-flex' }, h('button', { class: 'botao primario', onclick: () => decidir({ decisao: 'manter', manter: f.id }) }, 'Ficar com esta ficha'), h('a', { class: 'botao', href: url, target: '_blank' }, 'Abrir à parte'), h('a', { class: 'botao', href: '#', onclick: (e) => (e.preventDefault(), abrirFonte(f.id)) }, 'Ver ficha'))
      )
    }
    // (antes/depois: passos da fusão — gravar os dados escolhidos na ficha que fica, e renomear o ficheiro)
    const decidir = async (corpo, { antes, depois } = {}) => {
      conteudo.querySelectorAll('button').forEach((b) => (b.disabled = true))
      try {
        if (antes) await antes()
        const r = await servico('duplicados-decidir', { a: par.a, b: par.b, ...corpo })
        if (depois) await depois()
        toast(corpo.decisao === 'manter' ? `Fica ${r.manter}; ${r.retirada} retirada.` : 'Marcados como diferentes: não voltam a aparecer.')
        // (a ficha retirada desaparece também dos outros pares em que estava)
        const fora = corpo.decisao === 'manter' ? (corpo.manter === par.a ? par.b : par.a) : null
        pares.splice(i, 1)
        if (fora) for (let k = pares.length - 1; k >= 0; k--) if (pares[k].a === fora || pares[k].b === fora) (pares.splice(k, 1), k < i && i--)
      } catch (e) {
        toast(mensagemErro(e), true)
      }
      mostrar()
    }
    const semelhanca = par.titulos_diferentes && par.alta <= 50 && par.paginas[0] === par.paginas[1] ? 'O mesmo PDF em duas fichas com títulos diferentes: uma delas deve ter o ficheiro errado (veja as fichas antes de decidir).' : par.paginas[0] !== par.paginas[1] ?'Mesmo conteúdo, mas um tem páginas a mais (capa, página em branco…).' : par.alta <= 50 ? 'Praticamente iguais.' : 'Muito parecidos: pode ser o mesmo documento com outra digitalização, ou partes/edições diferentes da mesma obra.'
    anexar(
      conteudo,
      h(
        'div',
        { class: 'linha-flex', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px' },
        h('div', {}, h('strong', {}, `Par ${i + 1} de ${pares.length}`), ' — ', semelhanca),
        h(
          'div',
          { class: 'linha-flex', style: 'gap:8px' },
          h('button', { class: 'botao', onclick: () => abrirFusao() }, 'Fundir as duas…'),
          h('button', { class: 'botao', onclick: () => decidir({ decisao: 'diferentes' }) }, 'São diferentes'),
          h('button', { class: 'botao', disabled: pares.length < 2, onclick: () => ((i = (i + 1) % pares.length), mostrar()) }, 'Saltar (decidir depois)')
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
      const CAMPOS = [['titulo', 'Título'], ['data', 'Data'], ['catalogo', 'Nº de catálogo'], ['editora', 'Editora / impressor'], ['local', 'Local'], ['doi', 'DOI'], ['isbn', 'ISBN'], ['url', 'Endereço web'], ['notas', 'Notas']]
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
            h('div', { style: 'font-weight:600;margin-bottom:4px' }, rotulo, va === vb ? h('span', { class: 'ajuda' }, ' (igual nas duas)') : null),
            campo,
            va !== vb
              ? h(
                  'div',
                  { class: 'linha-flex', style: 'gap:6px;flex-wrap:wrap;margin-top:4px' },
                  va && h('button', { class: 'botao pequeno', title: va, onclick: () => usar(va) }, `Usar o de ${numeroFmt(A.numero)}`),
                  vb && h('button', { class: 'botao pequeno', title: vb, onclick: () => usar(vb) }, `Usar o de ${numeroFmt(B.numero)}`),
                  va && vb && h('button', { class: 'botao pequeno', onclick: () => usar(k === 'titulo' ? combinarTitulos(va, vb) : k === 'notas' ? `${va}\n\n${vb}` : `${va}; ${vb}`) }, 'Os dois')
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
        const rotuloOpcao = (v) => (v === 'a' ? `De ${numeroFmt(A.numero)}` : v === 'b' ? `De ${numeroFmt(B.numero)}` : 'Todos')
        anexar(
          linhas,
          h(
            'div',
            {},
            h('div', { style: 'font-weight:600;margin-bottom:4px' }, 'Autores', iguais ? h('span', { class: 'ajuda' }, ' (iguais nas duas)') : null),
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
          h('h3', { style: 'margin-top:0' }, 'Fundir as duas fichas'),
          h('p', { class: 'ajuda', style: 'margin-top:0' }, 'Escolha, campo a campo, o que fica. Pode também escrever à mão. A outra ficha é retirada (as notas de leitura e as etiquetas passam para esta) e o ficheiro repetido vai para _duplicados.'),
          linhas,
          h('div', { style: 'margin-top:14px' }, h('strong', {}, 'Número que fica: '), radioFica(A), radioFica(B)),
          h('label', { style: 'display:block;margin-top:8px' }, confirmar, ' Confirmar a ficha (fica completa e o ficheiro é arrumado com o novo título)'),
          h(
            'div',
            { class: 'linha-flex', style: 'gap:8px;margin-top:14px' },
            h('button', { class: 'botao primario', onclick: () => executar() }, 'Fundir'),
            h('button', { class: 'botao', onclick: () => (fusao.innerHTML = '') }, 'Cancelar')
          )
        )
      )
      fusao.scrollIntoView({ behavior: 'smooth', block: 'start' })

      function executar() {
        const dados = {}
        for (const [k, obter] of Object.entries(escolhas)) if (k !== 'catalogo') dados[k] = obter()
        if (!dados.titulo && 'titulo' in escolhas) return toast('O título não pode ficar vazio.', true)
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
      toast('Definições guardadas.')
    } catch (e) {
      toast(mensagemErro(e), true)
    }
  }

  const texto = (k, attrs) => h('input', { type: 'text', value: d[k] || '', oninput: (e) => ((d[k] = e.target.value), atualizarPrevia()), ...(attrs || {}) })
  const interruptor = (k, rotulo) => h('label', { class: 'linha-flex', style: 'margin:6px 0' }, h('input', { type: 'checkbox', checked: d[k] !== false, onchange: (e) => (d[k] = e.target.checked) }), rotulo)

  // Acesso pela rede: guarda-se logo (ficheiro app/.so_local) e aplica-se ao reiniciar
  const soLocal = h('input', { type: 'checkbox', id: 'so-local', disabled: true })
  const notaRede = h('p', { class: 'ajuda' }, 'Aplica-se da próxima vez que abrir o TINCTORIS.')
  servico('rede')
    .then((r) => {
      soLocal.checked = !!r.so_local
      soLocal.disabled = false
    })
    .catch(() => (notaRede.textContent = 'Esta opção fica ativa depois de reiniciar o TINCTORIS.'))
  soLocal.addEventListener('change', async () => {
    try {
      await servico('rede', { so_local: soLocal.checked })
      toast(soLocal.checked ? 'Da próxima vez, o TINCTORIS só abre neste Mac.' : 'Da próxima vez, o TINCTORIS também abre noutros aparelhos da mesma rede (com a sua conta).')
    } catch (e) {
      soLocal.checked = !soLocal.checked
      toast(mensagemErro(e), true)
    }
  })
  const creditos = h('div', {}, h('div', { class: 'caixa' }, 'A carregar…'))
  caixaCreditos().then((c) => creditos.replaceChildren(c))

  anexar(p, 
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Definições'), h('p', { class: 'subtitulo' }, 'Organização dos ficheiros, OCR e pesquisa de metadados.')), h('button', { class: 'botao primario', onclick: guardar }, 'Guardar definições')),
    h('h2', {}, 'A sua biblioteca'),
    h(
      'div',
      { class: 'caixa' + (d.nome_dono ? '' : ' destaque') },
      campo('O seu nome (dono da biblioteca)', texto('nome_dono', { id: 'nome-dono', placeholder: 'Ex.: Maria da Conceição Gonçalves' })),
      h('p', { class: 'ajuda' }, d.nome_dono ? 'Num PDF que digitalizou, não é o autor da fonte; numa transcrição feita num editor de partituras, é o editor. Várias formas do nome: separe-as com «;».' : 'Falta o seu nome: sem ele, o TINCTORIS pode pô-lo como autor das fontes que digitalizou. Escreva-o e guarde as definições.'),
      h('label', { class: 'linha-flex', style: 'margin:12px 0 0' }, soLocal, 'Abrir só neste Mac (recomendado em redes partilhadas, como a da escola)'),
      notaRede
    ),
    h('h2', {}, 'Nomes e pastas dos ficheiros'),
    h(
      'div',
      { class: 'caixa' },
      h('div', { class: 'grelha' }, campo('Padrão do nome do ficheiro', texto('padrao_nome')), campo('Padrão das subpastas (separadas por /)', texto('padrao_pastas'))),
      h('p', { class: 'ajuda' }, 'Marcadores disponíveis: ', marcadores.join('  ')),
      h('p', { class: 'ajuda' }, 'Exemplo: ', previa),
      h('p', { class: 'ajuda' }, 'Aplica-se aos ficheiros novos e sempre que guarda uma fonte com «Atualizar nome e pasta do ficheiro» ativo.')
    ),
    h('h2', {}, 'OCR (reconhecimento de texto)'),
    h(
      'div',
      { class: 'caixa' },
      interruptor('ocr_ativo', 'Fazer OCR automaticamente a PDFs digitalizados e imagens'),
      h('h3', {}, 'Línguas a reconhecer'),
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
      h('p', { class: 'ajuda' }, 'Menos línguas = OCR mais rápido e, em geral, mais exato.')
    ),
    h('h2', {}, 'Metadados automáticos'),
    h(
      'div',
      { class: 'caixa' },
      interruptor('enriquecimento_auto', 'Pesquisar metadados online quando entra um ficheiro novo'),
      h(
        'label',
        { class: 'campo', style: 'margin-top:10px;max-width:420px' },
        h('span', {}, 'Confiança mínima para aceitar sem rever: ', h('strong', { id: 'limiar-valor' }, Math.round((Number(d.limiar_confianca) || 0.8) * 100) + '%')),
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
        campo('Email de contacto para os serviços (opcional)', texto('email_contacto', { type: 'email' })),
        campo('Chave YouTube Data API (opcional)', texto('youtube_api_key')),
        campo('Chave Semantic Scholar (opcional)', texto('semantic_scholar_api_key')),
        campo('Chave Europeana (opcional)', texto('europeana_api_key')),
        campo('Chave Google Books (opcional)', texto('google_books_api_key'))
      ),
      h('p', { class: 'ajuda' }, 'O email (opcional) é enviado ao CrossRef, OpenAlex e MusicBrainz, que dão prioridade a pedidos identificados. A chave do YouTube é gratuita (Google Cloud Console → YouTube Data API v3); sem ela, a pesquisa no YouTube fica desligada. A chave da Europeana também é gratuita (europeana.eu → API); sem ela usa-se a chave pública de demonstração. Com a chave do Google Books, os livros também são procurados no Google Books quando entram; sem ela, só na «Pesquisa aprofundada».')
    ),
    h('h2', {}, 'IA local (no próprio Mac)'),
    h(
      'div',
      { class: 'caixa' },
      interruptor('ia_local_ativa', 'Usar a IA local para ler capas que as regras não conseguem identificar'),
      h('div', { class: 'grelha', style: 'margin-top:10px' }, campo('Modelo', texto('ia_modelo')), campo('Endereço do Ollama', texto('ia_url'))),
      h('p', { class: 'ajuda' }, 'Gratuita e privada: o modelo corre neste Mac e nada é enviado para fora. Só é usada quando as regras e os identificadores (DOI, ISBN, capa do JSTOR) não chegam; leva ~15 segundos por documento, em segundo plano.')
    ),
    h('h2', {}, 'Acerca do TINCTORIS'),
    h(
      'div',
      { class: 'caixa' },
      h('p', { style: 'margin-top:0' }, h('strong', {}, `TINCTORIS ${VERSAO}`), ' — Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários.'),
      h('p', {}, 'O nome homenageia Johannes Tinctoris (c. 1435–1511), autor do ', h('em', {}, 'Terminorum musicae diffinitorium'), ' (c. 1495), o primeiro dicionário musical impresso.'),
      h('p', {}, '© 2026 Pedro Sousa Silva e contribuidores do TINCTORIS. Programa livre, com licença ', h('a', { href: 'https://www.gnu.org/licenses/agpl-3.0.html', target: '_blank', rel: 'noopener' }, 'GNU AGPL 3.0 ou posterior'), '; documentação com licença ', h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt', target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'), '. Sem qualquer garantia.'),
      h('p', { class: 'ajuda', style: 'margin-bottom:0' }, 'Para citar: Sousa Silva, Pedro. ', h('em', {}, 'TINCTORIS'), `, versão ${VERSAO}. Componentes de terceiros e respetivas licenças: ficheiro TERCEIROS.md.`)
    ),
    h('h2', {}, 'Créditos'),
    creditos,
    h('h2', {}, 'Manutenção'),
    h(
      'div',
      { class: 'caixa linha-flex' },
      h(
        'button',
        {
          class: 'botao',
          onclick: async () => {
            const r = await pb.send('/api/bib/reindexar', { method: 'POST' })
            toast(`Índice de pesquisa reconstruído (${r.reindexadas} fontes).`)
          },
        },
        'Reconstruir índice de pesquisa'
      ),
      h(
        'button',
        {
          class: 'botao',
          onclick: async () => {
            if (!confirm('Voltar a ler todos os ficheiros da pasta biblioteca? Os que ainda não têm ficha são identificados de novo (e associados às fontes importadas, quando corresponderem). Antes disso é feita uma cópia de segurança.')) return
            try {
              const r = await servico('reler-biblioteca', {})
              toast(`${r.ficheiros} ficheiros em fila. Acompanhe em «Atividade».`)
            } catch (e) {
              toast(mensagemErro(e), true)
            }
          },
        },
        'Reler os ficheiros da biblioteca'
      ),
      h('a', { class: 'botao', href: '/_/', target: '_blank' }, 'Painel de administração do PocketBase ↗')
    )
  )
  atualizarPrevia()
}

iniciar()
