/// <reference path="../pb_data/types.d.ts" />

// Onde está o exemplar em papel: em casa, numa biblioteca, emprestado… Campo livre, preenchido só pelo utilizador
// (o programa nunca o escreve nem o muda; pedido do Pedro, 10/10/2026, com as fichas feitas a partir de fotografias
// do ISBN). Nos tipos que podem existir em papel.
migrate((app) => {
  const novo = { chave: "exemplar_papel", rotulo: "Onde está o exemplar em papel", tipo: "texto" }
  ;[
    "Livro",
    "Tese / dissertação",
    "Capítulo de livro",
    "Artigo",
    "Ensaio",
    "Relatório",
    "Estudo analítico / teórico",
    "Partitura",
    "Edição crítica",
    "Manuscrito",
    "Carta",
    "Diário",
    "Programa de concerto",
    "Legislação",
    "Disco",
    "Outro",
  ].forEach((nome) => {
    let tipo
    try {
      tipo = app.findFirstRecordByData("tipos_fonte", "nome", nome)
    } catch (_) {
      return
    }
    let campos = []
    // (campos ilegíveis: não se mexe no tipo, para não apagar os campos que lá estão)
    try {
      campos = JSON.parse(tipo.getString("campos") || "[]")
    } catch (_) {
      return
    }
    if (!Array.isArray(campos) || campos.some((c) => c.chave === novo.chave)) return
    tipo.set("campos", campos.concat([novo]))
    app.save(tipo)
  })
})
