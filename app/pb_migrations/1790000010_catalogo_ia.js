/// <reference path="../pb_data/types.d.ts" />

// Nº de catálogo lido pela IA local mas não confirmado (não está escrito no nome do ficheiro nem no texto,
// e a obra do IMSLP não bate com o título): fica à vista como sugestão, sem contar como dado.
migrate((app) => {
  const novo = { chave: "catalogo_ia", rotulo: "Nº de catálogo sugerido pela IA (não confirmado)", tipo: "texto" }
  ;["Partitura", "Manuscrito", "Edição crítica", "Gravação", "Disco"].forEach((nome) => {
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
