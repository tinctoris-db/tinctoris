// Funções partilhadas pelos hooks (carregadas com require dentro de cada handler).

function ler(json, omissao) {
  if (!json) return omissao
  try {
    const v = JSON.parse(json)
    return v == null ? omissao : v
  } catch (_) {
    return omissao
  }
}

const PAPEIS_PRINCIPAIS = ["autor", "compositor", "construtor", "realizador"]

function nomeAutor(a) {
  if (!a) return ""
  if (a.literal) return a.literal
  return a.apelido || a.nome || ""
}

// Número visível e permanente (#0001…): atribuído na criação, nunca reutilizado
function numerar(app, record) {
  if (record.getInt("numero") > 0) return
  const r = new DynamicModel({ m: 0 })
  app.db().newQuery("SELECT COALESCE(MAX(numero), 0) AS m FROM fontes").one(r)
  record.set("numero", r.m + 1)
}

// Campos derivados: autor_principal, ano e natureza por omissão.
function derivar(app, record) {
  const autores = ler(record.getString("autores"), [])
  let principal = autores.find((a) => PAPEIS_PRINCIPAIS.indexOf(a.papel || "autor") >= 0) || autores[0]
  record.set("autor_principal", nomeAutor(principal))

  const m = /(\d{4})/.exec(record.getString("data"))
  record.set("ano", m ? parseInt(m[1], 10) : 0)

  if (!record.getString("natureza") && record.getString("tipo")) {
    try {
      const t = app.findRecordById("tipos_fonte", record.getString("tipo"))
      if (t.getString("natureza_padrao")) record.set("natureza", t.getString("natureza_padrao"))
    } catch (_) {}
  }
}

function remover(app, id) {
  app.db().newQuery("DELETE FROM fontes_fts WHERE fonte_id = {:id}").bind({ id: id }).execute()
}

// (Re)constrói a entrada de uma fonte no índice de texto completo.
function reindexar(app, id) {
  remover(app, id)
  let f
  try {
    f = app.findRecordById("fontes", id)
  } catch (_) {
    return
  }
  let conteudo = ""
  try {
    conteudo = app.findFirstRecordByData("textos", "fonte", id).getString("conteudo")
  } catch (_) {}
  let tipoNome = ""
  try {
    tipoNome = app.findRecordById("tipos_fonte", f.getString("tipo")).getString("nome")
  } catch (_) {}

  const autores = ler(f.getString("autores"), [])
    .map((a) => [a.literal, a.nome, a.apelido].filter(Boolean).join(" "))
    .join("; ")
  const meta = ler(f.getString("metadados"), {})
  const tags = ler(f.getString("tags"), [])
  const numero = f.getInt("numero")
  const outros = [
    numero ? `n${numero} ${String(numero).padStart(4, "0")}` : "",
    tipoNome,
    f.getString("data"),
    f.getString("editora"),
    f.getString("local"),
    f.getString("doi"),
    f.getString("isbn"),
    f.getString("notas"),
    f.getString("natureza"),
    f.getStringSlice("contextos").join(" "),
    tags.join(" "),
    ler(f.getString("palavras_chave"), []).join(" "),
    Object.keys(meta).map((k) => (typeof meta[k] === "object" ? "" : String(meta[k]))).join(" "),
  ].join(" ")

  let notas = ""
  try {
    notas = app
      .findRecordsByFilter("notas_leitura", "fonte = {:id}", "ordem,created", 0, 0, { id: id })
      .map((n) => [n.getString("localizacao"), n.getString("texto"), ler(n.getString("tags"), []).join(" ")].join(" "))
      .join("\n")
  } catch (_) {}

  app.db()
    .newQuery(
      "INSERT INTO fontes_fts (fonte_id, titulo, autores, outros, notas, texto) VALUES ({:id}, {:titulo}, {:autores}, {:outros}, {:notas}, {:texto})"
    )
    .bind({ id: id, titulo: f.getString("titulo"), autores: autores, outros: outros, notas: notas, texto: conteudo })
    .execute()
}

// Reconstrói o índice se estiver desatualizado (ex.: depois de uma migração).
function verificarIndice(app) {
  const n = new DynamicModel({ a: 0, b: 0 })
  app.db().newQuery("SELECT (SELECT count(*) FROM fontes) AS a, (SELECT count(*) FROM fontes_fts) AS b").one(n)
  if (n.a !== n.b) reconstruirIndice(app)
}

function reconstruirIndice(app) {
  app.db().newQuery("DELETE FROM fontes_fts").execute()
  const ids = arrayOf(new DynamicModel({ id: "" }))
  app.db().newQuery("SELECT id FROM fontes").all(ids)
  ids.forEach((r) => reindexar(app, r.id))
  return ids.length
}

// Converte o texto escrito pelo utilizador numa expressão FTS5 segura.
// "frase exata" fica entre aspas; palavras soltas pesquisam também por prefixo.
function termos(s) {
  const out = []
  const re = /"([^"]+)"|(\S+)/g
  let m
  while ((m = re.exec(s || ""))) {
    if (m[1]) {
      const frase = m[1].replace(/"/g, "").trim()
      if (frase) out.push('"' + frase + '"')
    } else {
      const t = m[2].replace(/["*^():{}+\-]/g, " ").trim()
      if (t) out.push('"' + t + '"*')
    }
  }
  return out
}

function expressao(q, autor, titulo) {
  const partes = []
  termos(q).forEach((t) => partes.push(t))
  termos(autor).forEach((t) => partes.push("autores : " + t))
  termos(titulo).forEach((t) => partes.push("titulo : " + t))
  return partes.join(" AND ")
}

function pastaBiblioteca() {
  return $os.getenv("BIBLIOTECA_DIR") || __hooks + "/../../biblioteca"
}

function reencaminhar(e, metodo) {
  let segredo = ""
  try {
    segredo = toString($os.readFile(__hooks + "/../.segredo")).trim()
  } catch (_) {}
  const porta = $os.getenv("SERVICO_PORTA") || "8091"
  const acao = e.request.pathValue("acao")
  let res
  try {
    res = $http.send({
      method: metodo,
      url: "http://127.0.0.1:" + porta + "/" + acao,
      body: metodo === "POST" ? JSON.stringify(e.requestInfo().body || {}) : "",
      headers: { "Content-Type": "application/json", "X-Segredo": segredo },
      timeout: 180,
    })
  } catch (err) {
    return e.json(503, { erro: "O serviço de fundo não está a correr." })
  }
  return e.json(res.statusCode, res.json)
}

// Pedido feito no próprio computador? (IPv4 127.x, IPv6 ::1 em forma curta ou longa)
function pedidoLocal(e) {
  const ip = String(e.remoteIP() || "").toLowerCase()
  return /^127\./.test(ip) || /^::ffff:127\./.test(ip) || /^[0:]+:0*1$/.test(ip)
}

// Última alteração do código: o ficheiro do programa modificado mais recentemente.
function ultimaAlteracaoCodigo() {
  const raiz = __hooks + "/.."
  let max = 0
  const ver = (t) => {
    if (t > max) max = t
  }
  const percorrer = (dir, prof) => {
    let itens
    try {
      itens = $os.readDir(dir)
    } catch (_) {
      return
    }
    for (const it of itens) {
      const n = it.name()
      if (n.startsWith(".") || n === "node_modules") continue
      if (it.isDir()) {
        if (prof < 4) percorrer(dir + "/" + n, prof + 1)
      } else ver(it.info().modTime().unix())
    }
  }
  ;["pb_public", "pb_hooks", "pb_migrations", "worker/src", "estilos"].forEach((d) => percorrer(raiz + "/" + d, 0))
  ;["iniciar.sh", "instalar.sh", "biblioteca", "worker/package.json"].forEach((f) => {
    try {
      ver($os.stat(raiz + "/" + f).modTime().unix())
    } catch (_) {}
  })
  return max
}

// Última alteração dos dados: fontes, notas, textos, tipos ou definições (inclui eliminações desde o arranque).
function ultimaAlteracaoDados(app) {
  const r = new DynamicModel({ u: "" })
  app
    .db()
    .newQuery(
      "SELECT COALESCE(max(u), '') AS u FROM (" +
        "SELECT max(updated) AS u FROM fontes UNION ALL SELECT max(updated) FROM notas_leitura UNION ALL " +
        "SELECT max(updated) FROM textos UNION ALL SELECT max(updated) FROM tipos_fonte UNION ALL SELECT max(updated) FROM definicoes)"
    )
    .one(r)
  let t = r.u ? Math.floor(Date.parse(String(r.u).replace(" ", "T")) / 1000) : 0
  const apagado = app.store().get("dadosApagadosEm")
  if (apagado && apagado > t) t = apagado
  return t
}

// ---------------------------------------------------------------------------
// Lotes de transcrições (MIDI…) que herdaram título, autor e data do PDF da coleção ("herdado_de": "#5974"):
// quando a ficha do PDF é corrigida, os lotes acompanham. Cada campo só muda no lote se ainda tiver o valor
// antigo do PDF (o que foi corrigido à mão no lote nunca é apagado). O título do lote é o título curto do
// PDF seguido de " — transcrições MIDI" (a mesma regra de tituloCurto em worker/src/lotes_midi.js).
function tituloCurto(t) {
  let s = String(t || "").replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\[(?:!|sic)\]/gi, "").replace(/\s+—\s+transcriç(?:ão|ões)\b.*$/i, "").trim()
  s = s.split(/\s*(?:,|\.\.\.|…|;|:)\s*/)[0]
  if (s.length > 70) s = s.slice(0, 70).replace(/\s+\S*$/, "") + "…"
  if (s === s.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(s)) s = (s.charAt(0) + s.slice(1).toLowerCase()).replace(/\b[ivxlc]+\b/gi, (r) => (/^(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(r) && !/^(di|li|mi|ci)$/i.test(r) ? r.toUpperCase() : r))
  return s.trim()
}

// Valores do PDF antes de gravar (para comparar com os do lote)
function antesDoPdf(record) {
  const md = ler(record.original().getString("metadados"), {})
  if (!md.transcricao_midi && !md.transcricao) return null
  const o = record.original()
  return { titulo: o.getString("titulo"), autores: JSON.stringify(ler(o.getString("autores"), [])), data: o.getString("data"), editora: o.getString("editora"), local: o.getString("local") }
}

function propagarAosLotes(app, record, antes) {
  if (!antes) return
  const md = ler(record.getString("metadados"), {})
  const numero = "#" + String(record.getInt("numero")).padStart(4, "0")
  const lotes = (String(md.transcricao_midi || "") + " " + String(md.transcricao || "")).match(/#\d+/g) || []
  const novo = { titulo: record.getString("titulo"), autores: JSON.stringify(ler(record.getString("autores"), [])), data: record.getString("data"), editora: record.getString("editora"), local: record.getString("local") }
  for (const ref of lotes) {
    let lote
    try {
      lote = app.findFirstRecordByFilter("fontes", "numero = {:n}", { n: parseInt(ref.slice(1), 10) })
    } catch (_) {
      continue
    }
    const mdl = ler(lote.getString("metadados"), {})
    if (mdl.herdado_de !== numero) continue
    let mudou = false
    // Título: o lote ainda tem o título curto antigo do PDF (seguido de " — transcrições MIDI")
    const curtoAntes = tituloCurto(antes.titulo)
    const curtoNovo = tituloCurto(novo.titulo)
    const tl = lote.getString("titulo")
    if (curtoAntes !== curtoNovo && tl.indexOf(curtoAntes) === 0) {
      lote.set("titulo", curtoNovo + tl.slice(curtoAntes.length))
      mudou = true
    }
    if (antes.autores !== novo.autores && JSON.stringify(ler(lote.getString("autores"), [])) === antes.autores) {
      lote.set("autores", JSON.parse(novo.autores))
      mudou = true
    }
    for (const k of ["data", "editora", "local"]) {
      if (antes[k] !== novo[k] && lote.getString(k) === antes[k]) {
        lote.set(k, novo[k])
        mudou = true
      }
    }
    if (mudou) app.save(lote)
  }
}

module.exports = { tituloCurto, antesDoPdf, propagarAosLotes, numerar, ultimaAlteracaoCodigo, ultimaAlteracaoDados, pedidoLocal, reencaminhar, ler, derivar, reindexar, verificarIndice, reconstruirIndice, remover, expressao, pastaBiblioteca }
