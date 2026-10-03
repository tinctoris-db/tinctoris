/// <reference path="../pb_data/types.d.ts" />

// Nota para rever (ex.: "provavelmente uma coleção sem frontispício: o título é o da 1.ª peça")
migrate((app) => {
  const novo = { chave: "nota_revisao", rotulo: "Nota para rever", tipo: "texto" }
  ;["Partitura", "Manuscrito", "Edição crítica", "Livro"].forEach((nome) => {
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
    if (campos.some((c) => c.chave === novo.chave)) return
    tipo.set("campos", campos.concat([novo]))
    app.save(tipo)
  })
})
