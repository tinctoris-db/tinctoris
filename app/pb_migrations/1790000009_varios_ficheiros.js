/// <reference path="../pb_data/types.d.ts" />

// Vários ficheiros por fonte (livros de partes, obras em vários volumes). O ficheiro principal continua
// em "ficheiro"; os outros ficam aqui: [{ ficheiro, rotulo, hash, original }]
migrate((app) => {
  const fontes = app.findCollectionByNameOrId("fontes")
  if (!fontes.fields.getByName("ficheiros_extra")) {
    fontes.fields.add(new JSONField({ name: "ficheiros_extra", maxSize: 2000000 }))
    app.save(fontes)
  }
  // Obras em vários volumes: "Nº de volumes" (na citação: "20 vols.")
  ;["Livro", "Edição crítica", "Partitura"].forEach((nome) => {
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
    if (campos.some((c) => c.chave === "n_volumes")) return
    tipo.set("campos", campos.concat([{ chave: "n_volumes", rotulo: "Nº de volumes", tipo: "texto", csl: "number-of-volumes" }]))
    app.save(tipo)
  })
}, (app) => {
  const fontes = app.findCollectionByNameOrId("fontes")
  if (!fontes.fields.getByName("ficheiros_extra")) return
  fontes.fields.removeByName("ficheiros_extra")
  app.save(fontes)
})
