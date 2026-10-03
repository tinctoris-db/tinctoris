/// <reference path="../pb_data/types.d.ts" />

// Nome novo da aplicação (versão beta): TINCTORIS.
migrate((app) => {
  const s = app.settings()
  s.meta.appName = "TINCTORIS"
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.meta.appName = "Biblioteca de Fontes"
  app.save(s)
})
