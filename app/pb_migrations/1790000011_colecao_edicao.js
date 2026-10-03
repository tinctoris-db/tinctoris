/// <reference path="../pb_data/types.d.ts" />

// Campos novos (com nomes legíveis na ficha): coleção ou obra, edição do exemplar segundo o IMSLP, RISM da
// 1.ª edição, e as ligações entre um PDF e os lotes de transcrições MIDI que herdam dele.
migrate((app) => {
  const novos = [
    { chave: "conteudo_tipo", rotulo: "Coleção ou obra", tipo: "lista", opcoes: ["Coleção", "Obra", "Peça de uma coleção"] },
    { chave: "edicao_imslp", rotulo: "Edição do exemplar (IMSLP)", tipo: "texto" },
    { chave: "rism_primeira_edicao", rotulo: "RISM da 1.ª edição", tipo: "texto" },
    { chave: "transcricao_midi", rotulo: "Transcrições MIDI (fichas)", tipo: "texto" },
    { chave: "herdado_de", rotulo: "Dados herdados da ficha", tipo: "texto" },
    { chave: "lote", rotulo: "Lote de ficheiros (nome)", tipo: "texto" },
  ]
  ;["Partitura", "Manuscrito", "Edição crítica", "Livro"].forEach((nome) => {
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
    const falta = novos.filter((n) => !campos.some((c) => c.chave === n.chave))
    if (!falta.length) return
    tipo.set("campos", campos.concat(falta))
    app.save(tipo)
  })
})
