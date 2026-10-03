/// <reference path="../pb_data/types.d.ts" />

// Obra identificada pelo número de catálogo (IMSLP): o título normalizado fica no título da fonte;
// o título impresso, a data de composição e a ligação à obra ficam nestes campos.
migrate((app) => {
  const novos = [
    { chave: "titulo_fonte", rotulo: "Título na fonte (como está impresso)", tipo: "texto" },
    { chave: "data_composicao", rotulo: "Data de composição", tipo: "texto" },
    { chave: "imslp", rotulo: "Obra no IMSLP (ligação)", tipo: "texto" },
  ]
  ;["Partitura", "Manuscrito"].forEach((nome) => {
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
    const acrescentar = novos.filter((c) => existentes.indexOf(c.chave) < 0)
    if (!acrescentar.length) return
    tipo.set("campos", campos.concat(acrescentar))
    app.save(tipo)
  })
})
