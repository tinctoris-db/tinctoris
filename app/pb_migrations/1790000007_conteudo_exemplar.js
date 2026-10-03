/// <reference path="../pb_data/types.d.ts" />

// Conteúdo das coletâneas (obras e compositores, do RISM) e exemplar digitalizado (biblioteca, cota, URN).
migrate((app) => {
  const comuns = [
    { chave: "conteudo", rotulo: "Conteúdo (obras)", tipo: "texto_longo" },
    { chave: "compositores", rotulo: "Compositores no conteúdo", tipo: "texto" },
    { chave: "digitalizacao", rotulo: "Digitalização (ligação)", tipo: "texto" },
    { chave: "urn", rotulo: "Identificador permanente (URN)", tipo: "texto" },
  ]
  const novos = {
    Partitura: [{ chave: "exemplar", rotulo: "Exemplar digitalizado", tipo: "texto" }].concat(comuns),
    Manuscrito: comuns,
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
