/// <reference path="../pb_data/types.d.ts" />

// Campos para fontes musicais antigas identificadas no RISM e no DIAMM:
// sigla RISM, nº RISM (séries A/I e B/I), título uniformizado, exemplares, manuscrito ou impresso.
migrate((app) => {
  const novos = {
    Manuscrito: [
      { chave: "sigla", rotulo: "Sigla RISM do arquivo", tipo: "texto" },
      { chave: "titulo_uniforme", rotulo: "Título uniformizado (RISM)", tipo: "texto" },
      { chave: "descricao_catalogo", rotulo: "Descrição (catálogo)", tipo: "texto" },
      { chave: "notacao_catalogo", rotulo: "Notação (catálogo)", tipo: "texto" },
      { chave: "formato", rotulo: "Formato / extensão", tipo: "texto" },
      { chave: "diamm", rotulo: "DIAMM ID", tipo: "texto" },
    ],
    Partitura: [
      { chave: "forma", rotulo: "Manuscrito ou impresso", tipo: "lista", opcoes: ["Impresso", "Manuscrito"] },
      { chave: "rism_serie", rotulo: "Nº RISM (A/I, B/I)", tipo: "texto" },
      { chave: "rism", rotulo: "RISM ID", tipo: "texto" },
      { chave: "titulo_uniforme", rotulo: "Título uniformizado (RISM)", tipo: "texto" },
      { chave: "formato", rotulo: "Formato / extensão", tipo: "texto" },
      { chave: "exemplares", rotulo: "Exemplares conhecidos (RISM)", tipo: "texto_longo" },
    ],
  }
  Object.keys(novos).forEach((nome) => {
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
    const existentes = campos.map((c) => c.chave)
    const acrescentar = novos[nome].filter((c) => existentes.indexOf(c.chave) < 0)
    if (!acrescentar.length) return
    tipo.set("campos", campos.concat(acrescentar))
    app.save(tipo)
  })
})
