/// <reference path="../pb_data/types.d.ts" />

// Exemplar digitalizado e proveniência (fontes antigas em várias coleções): o registo do exemplar no catálogo da
// biblioteca, os outros exemplares que esse catálogo conhece, a proveniência (antigos possuidores, carimbos) e as
// ligações para a mesma fonte noutras bases (Cantus Database, PEM…). O identificador permanente deixa de ser só URN
// (também ark da Gallica, purl da BNP, DOI do e-rara).
migrate((app) => {
  const proveniencia = { chave: "proveniencia", rotulo: "Proveniência (antigos possuidores, carimbos, ex-libris)", tipo: "texto_longo" }
  const registo = { chave: "registo_biblioteca", rotulo: "Registo no catálogo da biblioteca (ligação)", tipo: "url" }
  const outrosExemplares = { chave: "outros_exemplares", rotulo: "Outros exemplares (catálogo da biblioteca)", tipo: "texto_longo" }
  const outrosCatalogos = { chave: "outros_catalogos", rotulo: "Noutras bases (Cantus, PEM…)", tipo: "texto_longo" }
  const exemplar = { chave: "exemplar", rotulo: "Exemplar digitalizado", tipo: "texto" }
  const digitalizacao = { chave: "digitalizacao", rotulo: "Digitalização (ligação)", tipo: "texto" }
  const identificador = { chave: "urn", rotulo: "Identificador permanente (URN, ark, purl)", tipo: "texto" }
  const novos = {
    Partitura: [proveniencia, registo, outrosExemplares, outrosCatalogos],
    Manuscrito: [registo, outrosCatalogos, { chave: "cantus", rotulo: "Cantus Database ID", tipo: "texto" }, { chave: "pem", rotulo: "PEM ID", tipo: "texto" }],
    Livro: [exemplar, digitalizacao, identificador, proveniencia, registo, outrosExemplares],
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
    // (o campo "urn" já existente passa a chamar-se «Identificador permanente (URN, ark, purl)»)
    let mudou = false
    campos.forEach((c) => {
      if (c.chave === "urn" && c.rotulo !== identificador.rotulo) {
        c.rotulo = identificador.rotulo
        mudou = true
      }
    })
    const existentes = campos.map((c) => c.chave)
    const acrescentar = novos[nome].filter((c) => existentes.indexOf(c.chave) < 0)
    if (!acrescentar.length && !mudou) return
    tipo.set("campos", campos.concat(acrescentar))
    app.save(tipo)
  })
})
