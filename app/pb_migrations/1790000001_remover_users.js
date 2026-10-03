/// <reference path="../pb_data/types.d.ts" />

// A coleção "users" criada por omissão não é usada (acesso só pelo superutilizador).
migrate((app) => {
  try { app.delete(app.findCollectionByNameOrId("users")) } catch (_) {}
})
