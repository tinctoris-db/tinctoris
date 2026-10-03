/// <reference path="../pb_data/types.d.ts" />

// Fontes conhecidas de uma obra (bases de compositores, como o Bach digital): arquivo e cota de cada manuscrito ou
// impresso que a transmite, autógrafo ou cópia, datação (decisão do Pedro, 1/10/2026).
migrate((app) => {
  const novo = { chave: "fontes_conhecidas", rotulo: "Fontes conhecidas da obra (bases de compositores)", tipo: "texto_longo" }
  ;["Partitura", "Manuscrito", "Edição crítica"].forEach((nome) => {
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
