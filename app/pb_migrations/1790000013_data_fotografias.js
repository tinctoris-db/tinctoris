/// <reference path="../pb_data/types.d.ts" />

// Data das fotografias / digitalização: o ano no nome de um manuscrito fotografado ("P-Cug_MM243_2005") é o das
// fotografias, não o da fonte (pedido do Pedro, 1/10/2026). A «Data» fica para a data da própria fonte.
migrate((app) => {
  const novo = { chave: "data_fotografias", rotulo: "Data das fotografias / digitalização", tipo: "texto" }
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
