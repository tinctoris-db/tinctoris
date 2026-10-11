/// <reference path="../pb_data/types.d.ts" />

// Obra recenseada: as recensões do JSTOR («Review: [untitled]», «Reviewed work(s): …») são artigos do recenseador
// sobre um livro; o livro fica neste campo e não no título nem nos autores (pedido do Pedro, 5/10/2026, #13984).
migrate((app) => {
  const novo = { chave: "recensao_de", rotulo: "Obra recenseada", tipo: "texto", csl: "reviewed-title" }
  let tipo
  try {
    tipo = app.findFirstRecordByData("tipos_fonte", "nome", "Artigo")
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
