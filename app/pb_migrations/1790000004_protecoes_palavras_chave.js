/// <reference path="../pb_data/types.d.ts" />

// Cópias de segurança de hora a hora (guarda as últimas 48) e palavras-chave por fonte.
migrate((app) => {
  const s = app.settings()
  s.backups.cron = "0 * * * *"
  s.backups.cronMaxKeep = 48
  app.save(s)

  const fontes = app.findCollectionByNameOrId("fontes")
  if (!fontes.fields.getByName("palavras_chave")) {
    fontes.fields.add(new JSONField({ name: "palavras_chave", maxSize: 100000 }))
    app.save(fontes)
  }
})
