/// <reference path="../pb_data/types.d.ts" />

// Notas de leitura (várias por fonte), chave opcional do Semantic Scholar,
// e índice de texto completo alargado às notas.
migrate((app) => {
  const fontes = app.findCollectionByNameOrId("fontes")
  const notas = new Collection({
    type: "base",
    name: "notas_leitura",
    fields: [
      { type: "relation", name: "fonte", collectionId: fontes.id, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "select", name: "tipo_nota", values: ["Citação", "Paráfrase", "Comentário", "Ideia", "Pergunta"], maxSelect: 1 },
      { type: "text", name: "localizacao", max: 500 },
      { type: "text", name: "texto", max: 2000000 },
      { type: "json", name: "tags", maxSize: 100000 },
      {
        type: "select",
        name: "contextos",
        values: fontes.fields.getByName("contextos").values,
        maxSelect: fontes.fields.getByName("contextos").values.length,
      },
      { type: "number", name: "ordem" },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_notas_fonte ON notas_leitura (fonte)"],
  })
  app.save(notas)

  const defs = app.findCollectionByNameOrId("definicoes")
  try {
    app.findFirstRecordByData("definicoes", "chave", "semantic_scholar_api_key")
  } catch (_) {
    const r = new Record(defs)
    r.set("chave", "semantic_scholar_api_key")
    r.set("valor", "")
    app.save(r)
  }

  // Recria o índice com uma coluna para as notas de leitura (é reconstruído pelo serviço).
  app.db().newQuery("DROP TABLE IF EXISTS fontes_fts").execute()
  app.db().newQuery(
    "CREATE VIRTUAL TABLE fontes_fts USING fts5(" +
    "fonte_id UNINDEXED, titulo, autores, outros, notas, texto, " +
    "tokenize = 'unicode61 remove_diacritics 2')"
  ).execute()
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("notas_leitura")) } catch (_) {}
})
