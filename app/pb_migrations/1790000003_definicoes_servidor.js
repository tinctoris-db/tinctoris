/// <reference path="../pb_data/types.d.ts" />

// Nome da aplicação e cópias de segurança automáticas diárias (às 03:00, guarda as últimas 14).
// As cópias ficam em app/pb_data/backups e podem ser geridas no painel de administração.
migrate((app) => {
  const s = app.settings()
  s.meta.appName = "Biblioteca de Fontes"
  s.backups.cron = "0 3 * * *"
  s.backups.cronMaxKeep = 14
  app.save(s)
})
