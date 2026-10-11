/// <reference path="../pb_data/types.d.ts" />

// Ortografia anterior ao AO90 (pedido do Pedro, 4/10/2026): acerta o que já está guardado e tinha a grafia nova.
// As migrações antigas já foram corrigidas para as instalações novas; esta trata das bases existentes.
// Só mexe em texto escrito pelo próprio programa (opções de listas, rótulos de campos, notas automáticas),
// nunca em títulos, autores nem notas do utilizador.
const TROCAS = [
  ["Projeto Artístico e Tese", "Projecto Artístico e Tese"],
  ["Ideia", "Idéia"],
]

const PALAVRAS = [
  ["Coleção", "Colecção"],
  ["coleção", "colecção"],
  ["Espetáculo ao vivo", "Espectáculo ao vivo"],
]

function trocaPalavras(texto) {
  let t = texto
  PALAVRAS.forEach(([a, b]) => {
    t = t.split(a).join(b)
  })
  return t
}

migrate((app) => {
  // 1) Listas de opções (contextos das fontes e das notas, tipo de nota)
  const acertarLista = (colecao, campo) => {
    const col = app.findCollectionByNameOrId(colecao)
    const f = col.fields.getByName(campo)
    if (!f) return
    const novos = f.values.map((v) => {
      const par = TROCAS.find((p) => p[0] === v)
      return par ? par[1] : v
    })
    if (novos.join("|") === f.values.join("|")) return
    f.values = novos
    app.save(col)
  }
  acertarLista("fontes", "contextos")
  acertarLista("notas_leitura", "contextos")
  acertarLista("notas_leitura", "tipo_nota")

  // 2) Valores já guardados nessas listas (hoje não há nenhum, mas não custa garantir)
  const q = (sql) => app.db().newQuery(sql).execute()
  q("UPDATE fontes SET contextos = replace(contextos, 'Projeto Artístico e Tese', 'Projecto Artístico e Tese') WHERE contextos LIKE '%Projeto Artístico e Tese%'")
  q("UPDATE notas_leitura SET contextos = replace(contextos, 'Projeto Artístico e Tese', 'Projecto Artístico e Tese') WHERE contextos LIKE '%Projeto Artístico e Tese%'")
  q("UPDATE notas_leitura SET tipo_nota = 'Idéia' WHERE tipo_nota = 'Ideia'")

  // 3) Tipos de fonte: nome e rótulos/opções dos campos
  app.findAllRecords("tipos_fonte").forEach((tipo) => {
    let mudou = false
    const nome = tipo.getString("nome")
    const nomeNovo = trocaPalavras(nome)
    if (nomeNovo !== nome) {
      tipo.set("nome", nomeNovo)
      mudou = true
    }
    let campos = []
    try {
      campos = JSON.parse(tipo.getString("campos") || "[]")
    } catch (_) {}
    campos.forEach((c) => {
      if (typeof c.rotulo === "string") {
        const r = trocaPalavras(c.rotulo)
        if (r !== c.rotulo) (c.rotulo = r), (mudou = true)
      }
      if (Array.isArray(c.opcoes)) {
        const o = c.opcoes.map((x) => (typeof x === "string" ? trocaPalavras(x) : x))
        if (o.join("|") !== c.opcoes.join("|")) (c.opcoes = o), (mudou = true)
      }
    })
    if (mudou) {
      tipo.set("campos", campos)
      app.save(tipo)
    }
  })

  // 4) Fichas: «Coleção ou obra», nota automática do frontispício e «manuscrito coletivo» (Bach digital)
  q("UPDATE fontes SET metadados = json_set(metadados, '$.conteudo_tipo', 'Colecção') WHERE json_extract(metadados, '$.conteudo_tipo') = 'Coleção'")
  q("UPDATE fontes SET metadados = json_set(metadados, '$.conteudo_tipo', 'Peça de uma colecção') WHERE json_extract(metadados, '$.conteudo_tipo') = 'Peça de uma coleção'")
  q("UPDATE fontes SET metadados = json_set(metadados, '$.nota_revisao', replace(json_extract(metadados, '$.nota_revisao'), 'uma coleção sem frontispício', 'uma colecção sem frontispício')) WHERE json_extract(metadados, '$.nota_revisao') LIKE '%uma coleção sem frontispício%'")
  q("UPDATE fontes SET metadados = replace(metadados, 'manuscrito coletivo', 'manuscrito colectivo') WHERE metadados LIKE '%manuscrito coletivo%'")
}, (app) => {
  // Sem volta atrás: a grafia anterior ao AO90 é a que se pretende.
})
