/// <reference path="../pb_data/types.d.ts" />

// Discos fotografados (pedido do Pedro, 10/10/2026): as fichas feitas a partir de fotografias da capa / contracapa de um
// CD ou LP guardam o código de barras (EAN/UPC) no tipo «Disco». O campo «Onde está o exemplar em papel» passa a
// «Onde está o exemplar físico» (serve também para os discos); a chave (exemplar_papel) e o que lá está escrito ficam.
migrate((app) => {
  // 1) Código de barras no tipo «Disco» (a seguir ao nº de catálogo)
  const novo = { chave: "codigo_barras", rotulo: "Código de barras (EAN/UPC)", tipo: "texto" }
  // (campos ilegíveis: não se mexe no tipo, para não apagar os campos que lá estão)
  ;(() => {
    let disco = null
    try {
      disco = app.findFirstRecordByData("tipos_fonte", "nome", "Disco")
    } catch (_) {
      return
    }
    let campos = []
    try {
      campos = JSON.parse(disco.getString("campos") || "[]")
    } catch (_) {
      return
    }
    if (!Array.isArray(campos) || campos.some((c) => c.chave === novo.chave)) return
    const i = campos.findIndex((c) => c.chave === "n_catalogo")
    if (i >= 0) campos.splice(i + 1, 0, novo)
    else campos.push(novo)
    disco.set("campos", campos)
    app.save(disco)
  })()

  // 2) Novo rótulo de exemplar_papel em todos os tipos que o têm
  app.findAllRecords("tipos_fonte").forEach((tipo) => {
    let campos = []
    try {
      campos = JSON.parse(tipo.getString("campos") || "[]")
    } catch (_) {
      return
    }
    if (!Array.isArray(campos)) return
    let mudou = false
    campos.forEach((c) => {
      if (c.chave === "exemplar_papel" && c.rotulo !== "Onde está o exemplar físico") {
        c.rotulo = "Onde está o exemplar físico"
        mudou = true
      }
    })
    if (!mudou) return
    tipo.set("campos", campos)
    app.save(tipo)
  })
})
