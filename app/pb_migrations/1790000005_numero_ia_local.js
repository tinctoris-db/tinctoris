/// <reference path="../pb_data/types.d.ts" />

// Número visível e permanente de cada fonte (#0001, #0002…) e definições da IA local.
migrate((app) => {
  const fontes = app.findCollectionByNameOrId("fontes")
  if (!fontes.fields.getByName("numero")) {
    fontes.fields.add(new NumberField({ name: "numero", onlyInt: true, min: 0 }))
    fontes.addIndex("idx_fontes_numero", true, "numero", "numero > 0")
    app.save(fontes)
  }
  // Numerar as fontes que já existem, pela ordem em que foram criadas
  const ids = arrayOf(new DynamicModel({ id: "" }))
  app.db().newQuery("SELECT id FROM fontes WHERE numero IS NULL OR numero = 0 ORDER BY created, id").all(ids)
  const maxRow = new DynamicModel({ m: 0 })
  app.db().newQuery("SELECT COALESCE(MAX(numero), 0) AS m FROM fontes").one(maxRow)
  let n = maxRow.m
  ids.forEach((r) => {
    n++
    app.db().newQuery("UPDATE fontes SET numero = {:n} WHERE id = {:id}").bind({ n: n, id: r.id }).execute()
  })

  const defs = app.findCollectionByNameOrId("definicoes")
  const padrao = { ia_local_ativa: true, ia_modelo: "qwen3-vl:8b-instruct", ia_url: "http://127.0.0.1:11434" }
  Object.keys(padrao).forEach((k) => {
    try {
      app.findFirstRecordByData("definicoes", "chave", k)
    } catch (_) {
      const r = new Record(defs)
      r.set("chave", k)
      r.set("valor", padrao[k])
      app.save(r)
    }
  })
})
