/// <reference path="../pb_data/types.d.ts" />

// Impressos antigos: número das bibliografias nacionais alemãs (VD16, VD17, VD18, do K10plus) e outras
// digitalizações da mesma edição noutras bibliotecas (Europeana).
migrate((app) => {
  const vd = { chave: "vd", rotulo: "Nº VD16 / VD17 / VD18", tipo: "texto" }
  const digitais = { chave: "outras_digitalizacoes", rotulo: "Outras digitalizações da mesma edição", tipo: "texto_longo" }
  const novos = { Partitura: [vd, digitais], Livro: [vd, digitais], Manuscrito: [digitais] }
  Object.keys(novos).forEach((nome) => {
    let tipo
    try {
      tipo = app.findFirstRecordByData("tipos_fonte", "nome", nome)
    } catch (_) {
      return
    }
    let campos = []
    try {
      campos = JSON.parse(tipo.getString("campos") || "[]")
    } catch (_) {}
    const existentes = campos.map((c) => c.chave)
    const acrescentar = novos[nome].filter((c) => existentes.indexOf(c.chave) < 0)
    if (!acrescentar.length) return
    tipo.set("campos", campos.concat(acrescentar))
    app.save(tipo)
  })
})
