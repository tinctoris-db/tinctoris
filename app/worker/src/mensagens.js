// Mensagens que o serviço manda para a interface, em vários idiomas.
// O texto português continua a ir pronto (msg, erro…: terminal, registos, versões antigas da interface); a chave é o
// mesmo texto com {marcadores} no lugar dos valores, e a interface mostra tr(chave, vars) (traduções em
// app/pb_public/idiomas/en.json, onde a chave é o texto português exacto).
//   m('Cópia de segurança criada: {copia}', { copia })  →  { msg: 'Cópia de segurança criada: antes-….zip', chave, vars }
//   throw erro('Fonte {n} não encontrada.', { n })        →  Error com .message em português, .chave e .vars
// A chave tem de ser um texto fixo entre plicas (os testes procuram-na no en.json). Um valor (vars) também pode ser
// outra mensagem (m(…) ou traduzivel(e)): é traduzida à parte.

// Texto português de uma mensagem, de um erro ou de um valor simples.
export function textoDe(x) {
  if (x === null || x === undefined) return ''
  if (typeof x === 'object') {
    if (typeof x.msg === 'string') return x.msg
    if (typeof x.message === 'string') return x.message
  }
  return String(x)
}

// Põe os valores no lugar dos {marcadores} (um marcador sem valor fica como está).
export function preencher(chave, vars) {
  return String(chave).replace(/\{(\w+)\}/g, (t, k) => (vars && k in vars ? textoDe(vars[k]) : t))
}

// Só os valores que se mandam para a interface: textos, números, ou outras mensagens já na forma { msg, chave, vars }.
function limparVars(vars) {
  if (!vars) return undefined
  const out = {}
  for (const [k, v] of Object.entries(vars)) {
    if (v && typeof v === 'object') out[k] = v.chave ? { msg: textoDe(v), chave: v.chave, ...(v.vars ? { vars: v.vars } : {}) } : textoDe(v)
    else out[k] = v === undefined || v === null ? '' : v
  }
  return Object.keys(out).length ? out : undefined
}

// Mensagem para a interface.
export function m(chave, vars) {
  const v = limparVars(vars)
  return { msg: preencher(chave, vars), chave, ...(v ? { vars: v } : {}) }
}

// Erro com a mensagem em português (como antes) e a chave para a interface traduzir.
export function erro(chave, vars, extra) {
  const e = new Error(preencher(chave, vars))
  e.chave = chave
  const v = limparVars(vars)
  if (v) e.vars = v
  if (extra) Object.assign(e, extra)
  return e
}

// Um erro (ou texto) como valor dentro de outra mensagem: traduzível se tiver chave; senão, o texto tal como veio
// (erros do sistema, de bibliotecas ou dos catálogos online ficam na língua em que vieram).
export function traduzivel(e) {
  if (e && typeof e === 'object' && e.chave) return { msg: textoDe(e), chave: e.chave, ...(e.vars ? { vars: e.vars } : {}) }
  return textoDe(e)
}

// Corpo da resposta de erro das rotas: { erro } como antes, mais { erro_chave, vars } quando há chave.
export function corpoErro(e) {
  const corpo = { erro: textoDe(e) }
  if (e && e.chave) {
    corpo.erro_chave = e.chave
    if (e.vars) corpo.vars = e.vars
  }
  return corpo
}
