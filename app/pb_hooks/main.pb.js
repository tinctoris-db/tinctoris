/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// A interface (pb_public) nunca fica em cache sem confirmação: depois de uma
// atualização, o navegador recebe sempre a versão nova.
// ---------------------------------------------------------------------------

routerUse((e) => {
  const caminho = e.request.url.path
  if (!caminho.startsWith("/api/") && !caminho.startsWith("/_/")) {
    e.response.header().set("Cache-Control", "no-cache")
  }
  return e.next()
})

// ---------------------------------------------------------------------------
// Campos derivados e índice de texto completo
// ---------------------------------------------------------------------------

onRecordCreate((e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  bib.numerar(e.app, e.record)
  bib.derivar(e.app, e.record)
  e.next()
}, "fontes")

onRecordUpdate((e) => {
  require(`${__hooks}/biblioteca.js`).derivar(e.app, e.record)
  e.next()
}, "fontes")

// Ficha de um PDF com lotes de transcrições que herdaram dela: os lotes acompanham as correções
onRecordUpdate((e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  let antes = null
  try {
    antes = bib.antesDoPdf(e.record)
  } catch (_) {}
  e.next()
  if (!antes) return
  try {
    bib.propagarAosLotes(e.app, e.record, antes)
  } catch (err) {
    console.log("Lotes herdados de #" + e.record.getInt("numero") + ": " + err)
  }
}, "fontes")

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.id)
}, "fontes")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.id)
}, "fontes")

onRecordAfterDeleteSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).remover(e.app, e.record.id)
}, "fontes")

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.getString("fonte"))
}, "textos")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.getString("fonte"))
}, "textos")

onRecordAfterDeleteSuccess((e) => {
  e.next()
  require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.getString("fonte"))
}, "textos")

for (const evento of [onRecordAfterCreateSuccess, onRecordAfterUpdateSuccess, onRecordAfterDeleteSuccess]) {
  evento((e) => {
    e.next()
    require(`${__hooks}/biblioteca.js`).reindexar(e.app, e.record.getString("fonte"))
  }, "notas_leitura")
}

// ---------------------------------------------------------------------------
// Pesquisa em texto completo
// GET /api/bib/pesquisa?q=...&autor=...&titulo=...&limite=500
// Devolve [{id, trecho, rank}] ordenado por relevância.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/bib/pesquisa", (e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  const q = e.request.url.query()
  const expr = bib.expressao(q.get("q"), q.get("autor"), q.get("titulo"))
  if (!expr) return e.json(200, [])
  const limite = Math.min(parseInt(q.get("limite") || "500", 10) || 500, 5000)

  const linhas = arrayOf(new DynamicModel({ id: "", trecho: "", rank: 0.5 }))
  try {
    e.app.db()
      .newQuery(
        "SELECT fonte_id AS id, " +
        "snippet(fontes_fts, -1, char(2), char(3), '…', 14) AS trecho, " +
        "bm25(fontes_fts, 0.0, 10.0, 5.0, 2.0, 3.0, 1.0) AS rank " +
        "FROM fontes_fts WHERE fontes_fts MATCH {:q} ORDER BY rank LIMIT {:lim}"
      )
      .bind({ q: expr, lim: limite })
      .all(linhas)
  } catch (err) {
    throw new BadRequestError("Pesquisa inválida: " + err)
  }
  return e.json(200, linhas)
}, $apis.requireSuperuserAuth())

// Reconstrói todo o índice de texto completo.
routerAdd("POST", "/api/bib/reindexar", (e) => {
  const n = require(`${__hooks}/biblioteca.js`).reconstruirIndice(e.app)
  return e.json(200, { reindexadas: n })
}, $apis.requireSuperuserAuth())

onBootstrap((e) => {
  e.next()
  // Numa base de dados nova as tabelas ainda não existem (as migrações correm depois)
  try {
    require(`${__hooks}/biblioteca.js`).verificarIndice(e.app)
  } catch (err) {
    console.log("Índice de pesquisa não verificado:", err)
  }
})

// ---------------------------------------------------------------------------
// Abrir o ficheiro digital de uma fonte (PDF, áudio, vídeo...).
// GET /api/bib/ficheiro/{id}?token=...
// O token vai no endereço para que o ficheiro abra num separador novo.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/bib/ficheiro/{id}", (e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  let autorizado = e.auth && e.auth.collection().name === "_superusers"
  if (!autorizado) {
    try {
      const u = e.app.findAuthRecordByToken(e.request.url.query().get("token"), "auth")
      autorizado = u.collection().name === "_superusers"
    } catch (_) {}
  }
  if (!autorizado) throw new UnauthorizedError("Sessão inválida.")

  const f = e.app.findRecordById("fontes", e.request.pathValue("id"))
  // ?original=_originais/<pasta>/<imagem>: uma das imagens originais (fonte fotografada página a página)
  const original = String(e.request.url.query().get("original") || "")
  if (original) {
    let md = {}
    try {
      md = JSON.parse(f.getString("metadados") || "{}") || {}
    } catch (_) {}
    const j = original.lastIndexOf("/")
    const pastaOrig = original.substring(0, j)
    const nomeOrig = original.substring(j + 1)
    const pastas = String(md.originais || "").split(" | ").filter((x) => x)
    if (j < 0 || !nomeOrig || pastas.indexOf(pastaOrig) < 0 || original.split("/").indexOf("..") >= 0) throw new NotFoundError("Imagem não encontrada.")
    return e.fileFS($os.dirFS(bib.pastaBiblioteca() + "/" + pastaOrig), nomeOrig)
  }
  // ?n=2, 3…: os ficheiros adicionais (volumes, livros de partes); sem n, o principal
  const n = parseInt(e.request.url.query().get("n") || "1", 10) || 1
  let rel = f.getString("ficheiro")
  if (n > 1) {
    let extra = []
    try {
      extra = JSON.parse(f.getString("ficheiros_extra") || "[]") || []
    } catch (_) {}
    rel = (extra[n - 2] && extra[n - 2].ficheiro) || ""
  }
  if (!rel || rel.split("/").indexOf("..") >= 0) throw new NotFoundError("Esta fonte não tem ficheiro.")
  const i = rel.lastIndexOf("/")
  const pasta = bib.pastaBiblioteca() + (i >= 0 ? "/" + rel.substring(0, i) : "")
  return e.fileFS($os.dirFS(pasta), rel.substring(i + 1))
})

// ---------------------------------------------------------------------------
// Ponte para o serviço de fundo (watch folder, metadados, OCR, exportação).
// O serviço só escuta em 127.0.0.1; aqui validamos a sessão e reencaminhamos.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/bib/servico/{acao}", (e) => require(`${__hooks}/biblioteca.js`).reencaminhar(e, "GET"), $apis.requireSuperuserAuth())
routerAdd("POST", "/api/bib/servico/{acao}", (e) => require(`${__hooks}/biblioteca.js`).reencaminhar(e, "POST"), $apis.requireSuperuserAuth())

// ---------------------------------------------------------------------------
// Conta pessoal: criada pela própria interface na primeira utilização.
// Só é permitido a partir do próprio computador (não de outros dispositivos da rede).
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/bib/conta-estado", (e) => {
  const n = new DynamicModel({ n: 0 })
  e.app.db().newQuery("SELECT count(*) AS n FROM _superusers WHERE email != 'servico@biblioteca.local'").one(n)
  return e.json(200, { temConta: n.n > 0, local: require(`${__hooks}/biblioteca.js`).pedidoLocal(e) })
})

// Entrada automática neste computador (sem ecrã de entrada); nos outros aparelhos da rede continua a
// pedir a palavra-passe. Só para a própria página da biblioteca: um site aberto no navegador deste Mac
// (ou um nome de domínio apontado para 127.0.0.1) não recebe a sessão.
routerAdd("POST", "/api/bib/sessao-local", (e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  const local = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i
  const host = String(e.request.host || "")
  const origem = String(e.request.header.get("Origin") || "")
  const origemOk = !origem || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origem)
  if (!bib.pedidoLocal(e) || !local.test(host) || !origemOk) throw new ForbiddenError("Só neste computador.")
  let conta
  try {
    conta = e.app.findFirstRecordByFilter("_superusers", "email != 'servico@biblioteca.local'", {})
  } catch (_) {
    throw new NotFoundError("Ainda não existe uma conta.")
  }
  return $apis.recordAuthResponse(e, conta, "local", null)
})

routerAdd("POST", "/api/bib/primeira-conta", (e) => {
  const n = new DynamicModel({ n: 0 })
  e.app.db().newQuery("SELECT count(*) AS n FROM _superusers WHERE email != 'servico@biblioteca.local'").one(n)
  if (n.n > 0) throw new ForbiddenError("A conta já existe.")
  if (!require(`${__hooks}/biblioteca.js`).pedidoLocal(e)) throw new ForbiddenError("Crie a conta no computador onde a biblioteca está instalada.")
  const b = e.requestInfo().body || {}
  if (!b.email || !b.password || String(b.password).length < 8) throw new BadRequestError("Indique um email e uma palavra-passe com pelo menos 8 caracteres.")
  const r = new Record(e.app.findCollectionByNameOrId("_superusers"))
  r.setEmail(String(b.email))
  r.setPassword(String(b.password))
  e.app.save(r)
  return e.json(200, { ok: true })
})

// ---------------------------------------------------------------------------
// Datas de última atualização (código e dados), em segundos Unix.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/bib/info", (e) => {
  const bib = require(`${__hooks}/biblioteca.js`)
  return e.json(200, { codigo: bib.ultimaAlteracaoCodigo(), dados: bib.ultimaAlteracaoDados(e.app) })
}, $apis.requireSuperuserAuth())

onRecordAfterDeleteSuccess((e) => {
  e.next()
  e.app.store().set("dadosApagadosEm", Math.floor(Date.now() / 1000))
}, "fontes", "notas_leitura", "tipos_fonte")
