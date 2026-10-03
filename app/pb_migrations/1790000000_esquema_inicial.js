/// <reference path="../pb_data/types.d.ts" />

// Esquema inicial da Biblioteca de Fontes.
//
// Ideia central: os campos comuns a todas as fontes (título, autores, data...)
// são colunas normais; os campos específicos de cada tipo vivem no campo JSON
// "metadados" e são descritos em "tipos_fonte.campos". Assim é possível criar
// novos tipos e novos campos a qualquer momento sem alterar a base de dados.
// (Em Postgres, o mesmo desenho usa colunas JSONB.)

const CONTEXTOS = [
  "Leitura e Interpretação de Fontes",
  "Pesquisa Avançada em Música",
  "Projeto Artístico e Tese",
  "Ensino",
  "Produção artística",
]

// Atalhos para descrever campos dos tipos de fonte.
// tipos de campo: texto | texto_longo | numero | data | url | lista | sim_nao
const c = (chave, rotulo, tipo, extra) => Object.assign({ chave, rotulo, tipo: tipo || "texto" }, extra || {})
const ARQUIVO = [
  c("arquivo", "Arquivo / biblioteca", "texto", { csl: "archive" }),
  c("local_arquivo", "Local do arquivo", "texto", { csl: "archive-place" }),
  c("fundo", "Fundo / coleção", "texto", { csl: "archive_collection" }),
  c("cota", "Cota", "texto", { csl: "call-number" }),
]
const ACESSO = [c("data_acesso", "Data de acesso", "data", { csl: "accessed" })]

const TIPOS = [
  // ---- Escritas
  ["Manuscrito", "Escrita", "manuscript", "", "primária", [
    ...ARQUIVO,
    c("rism", "RISM ID"),
    c("copista", "Copista"),
    c("notacao", "Notação", "lista", { opcoes: ["Neumática", "Mensural branca", "Mensural negra", "Tablatura", "Moderna", "Outra"] }),
    c("suporte", "Suporte / material", "texto", { csl: "medium" }),
    c("folios", "Fólios"),
    c("dimensoes", "Dimensões", "texto", { csl: "dimensions" }),
    c("proveniencia", "Proveniência", "texto_longo"),
  ]],
  ["Edição crítica", "Escrita", "book", "Edição crítica", "", [
    c("catalogo", "Nº de catálogo (BWV, K., op.)"),
    c("fontes_base", "Fontes de base", "texto_longo"),
    c("colecao", "Coleção / série", "texto", { csl: "collection-title" }),
    c("volume", "Volume", "texto", { csl: "volume" }),
    c("edicao", "Edição", "texto", { csl: "edition" }),
  ]],
  ["Partitura", "Escrita", "musical_score", "", "primária", [
    c("catalogo", "Nº de catálogo (BWV, K., op.)"),
    c("instrumentacao", "Instrumentação"),
    c("tonalidade", "Tonalidade"),
    c("n_chapa", "Nº de chapa", "texto", { csl: "number" }),
    c("colecao", "Coleção / série", "texto", { csl: "collection-title" }),
    c("edicao", "Edição", "texto", { csl: "edition" }),
  ]],
  ["Livro", "Escrita", "book", "", "secundária", [
    c("edicao", "Edição", "texto", { csl: "edition" }),
    c("colecao", "Coleção / série", "texto", { csl: "collection-title" }),
    c("volume", "Volume", "texto", { csl: "volume" }),
    c("n_paginas", "Nº de páginas", "numero", { csl: "number-of-pages" }),
  ]],
  ["Capítulo de livro", "Escrita", "chapter", "", "secundária", [
    c("livro", "Título do livro", "texto", { csl: "container-title" }),
    c("paginas", "Páginas", "texto", { csl: "page" }),
    c("colecao", "Coleção / série", "texto", { csl: "collection-title" }),
  ]],
  ["Artigo", "Escrita", "article-journal", "", "secundária", [
    c("revista", "Revista", "texto", { csl: "container-title" }),
    c("volume", "Volume", "texto", { csl: "volume" }),
    c("numero", "Número", "texto", { csl: "issue" }),
    c("paginas", "Páginas", "texto", { csl: "page" }),
  ]],
  ["Estudo analítico / teórico", "Escrita", "book", "", "secundária", [
    c("publicado_em", "Publicado em (livro/revista)", "texto", { csl: "container-title" }),
    c("paginas", "Páginas", "texto", { csl: "page" }),
    c("obras_analisadas", "Obras analisadas", "texto_longo"),
  ]],
  ["Ensaio", "Escrita", "article", "", "secundária", [
    c("publicado_em", "Publicado em", "texto", { csl: "container-title" }),
    c("paginas", "Páginas", "texto", { csl: "page" }),
  ]],
  ["Tese / dissertação", "Escrita", "thesis", "", "secundária", [
    c("grau", "Grau", "lista", { opcoes: ["Doutoramento", "Mestrado", "Licenciatura", "Outro"], csl: "genre" }),
    c("orientacao", "Orientação"),
  ]],
  ["Programa de concerto", "Escrita", "pamphlet", "Programa de concerto", "primária", [
    c("evento", "Evento / festival", "texto", { csl: "event-title" }),
    c("local_evento", "Local do concerto", "texto", { csl: "event-place" }),
    c("interpretes", "Intérpretes", "texto_longo"),
    c("programa", "Programa (obras)", "texto_longo"),
    ...ARQUIVO,
  ]],
  ["Carta", "Escrita", "manuscript", "Carta", "primária", [
    c("local_escrita", "Local de escrita"),
    ...ARQUIVO,
  ]],
  ["Diário", "Escrita", "manuscript", "Diário", "primária", [
    c("periodo", "Período coberto"),
    ...ARQUIVO,
  ]],
  ["Legislação", "Escrita", "legislation", "", "primária", [
    c("numero", "Número do diploma", "texto", { csl: "number" }),
    c("publicacao", "Publicação (ex. Diário da República)", "texto", { csl: "container-title" }),
    c("serie", "Série"),
    c("paginas", "Páginas", "texto", { csl: "page" }),
  ]],
  ["Relatório", "Escrita", "report", "", "", [
    c("instituicao", "Instituição"),
    c("numero", "Número", "texto", { csl: "number" }),
  ]],
  // ---- Audiovisuais
  ["Gravação", "Audiovisual", "song", "", "primária", [
    c("album", "Álbum / disco", "texto", { csl: "container-title" }),
    c("n_catalogo", "Nº de catálogo", "texto", { csl: "number" }),
    c("suporte", "Suporte", "lista", { opcoes: ["CD", "LP", "78 rpm", "Cassete", "Fita magnética", "Digital", "Streaming", "Outro"], csl: "medium" }),
    c("local_gravacao", "Local de gravação", "texto", { csl: "event-place" }),
    c("data_gravacao", "Data de gravação", "data"),
    c("duracao", "Duração", "texto", { csl: "dimensions" }),
    c("obras", "Obras gravadas", "texto_longo"),
  ]],
  ["Registo de ensaio", "Audiovisual", "song", "Registo de ensaio", "primária", [
    c("local_ensaio", "Local", "texto", { csl: "event-place" }),
    c("participantes", "Participantes", "texto_longo"),
    c("obra_trabalhada", "Obra trabalhada"),
    c("duracao", "Duração", "texto", { csl: "dimensions" }),
    c("notas_processo", "Notas de processo", "texto_longo"),
  ]],
  ["Registo de concerto", "Audiovisual", "song", "Registo de concerto", "primária", [
    c("evento", "Evento / festival", "texto", { csl: "event-title" }),
    c("local_evento", "Local do concerto", "texto", { csl: "event-place" }),
    c("programa", "Programa (obras)", "texto_longo"),
    c("duracao", "Duração", "texto", { csl: "dimensions" }),
  ]],
  ["Vídeo", "Audiovisual", "motion_picture", "Vídeo", "", [
    c("plataforma", "Plataforma / canal", "texto", { csl: "container-title" }),
    c("duracao", "Duração", "texto", { csl: "dimensions" }),
    ...ACESSO,
  ]],
  ["Espetáculo ao vivo", "Audiovisual", "performance", "", "primária", [
    c("evento", "Evento / festival", "texto", { csl: "event-title" }),
    c("local_evento", "Local", "texto", { csl: "event-place" }),
    c("interpretes", "Intérpretes", "texto_longo"),
    c("programa", "Programa", "texto_longo"),
  ]],
  ["Disco", "Audiovisual", "song", "Disco", "primária", [
    c("n_catalogo", "Nº de catálogo", "texto", { csl: "number" }),
    c("suporte", "Suporte", "lista", { opcoes: ["CD", "LP", "78 rpm", "Cassete", "Digital", "Outro"], csl: "medium" }),
    c("publicado", "Publicado comercialmente", "sim_nao"),
    c("faixas", "Faixas", "texto_longo"),
  ]],
  // ---- Instrumentos
  ["Instrumento histórico", "Instrumento", "document", "Instrumento musical", "primária", [
    c("local_construcao", "Local de construção"),
    c("colecao_museu", "Coleção / museu", "texto", { csl: "archive" }),
    c("n_inventario", "Nº de inventário", "texto", { csl: "call-number" }),
    c("hornbostel_sachs", "Classificação Hornbostel-Sachs"),
    c("materiais", "Materiais", "texto", { csl: "medium" }),
    c("afinacao", "Afinação / temperamento"),
    c("dimensoes", "Dimensões", "texto", { csl: "dimensions" }),
    c("conservacao", "Estado de conservação", "texto_longo"),
    c("restauros", "Restauros", "texto_longo"),
  ]],
  ["Instrumento moderno", "Instrumento", "document", "Instrumento musical", "", [
    c("modelo", "Modelo"),
    c("n_serie", "Nº de série", "texto", { csl: "number" }),
    c("materiais", "Materiais", "texto", { csl: "medium" }),
    c("afinacao", "Afinação / temperamento"),
  ]],
  ["Tecnologia (hardware / software)", "Instrumento", "software", "", "", [
    c("versao", "Versão", "texto", { csl: "version" }),
    c("plataforma", "Plataforma / sistema", "texto", { csl: "medium" }),
    c("licenca", "Licença"),
  ]],
  // ---- Digitais
  ["Base de dados", "Digital", "dataset", "Base de dados", "", [c("instituicao", "Instituição"), ...ACESSO]],
  ["Repositório", "Digital", "webpage", "Repositório", "", [c("instituicao", "Instituição"), ...ACESSO]],
  ["Plataforma de streaming", "Digital", "webpage", "Plataforma de streaming", "", [...ACESSO]],
  ["Biblioteca de software", "Digital", "software", "", "", [
    c("versao", "Versão", "texto", { csl: "version" }),
    c("linguagem", "Linguagem"),
    ...ACESSO,
  ]],
  // ---- Aberto
  ["Outro", "Outro", "document", "", "", []],
]

const DEFINICOES = {
  padrao_nome: "{data}_{AUTOR}_{Titulo}",
  padrao_pastas: "{tipo}/{ano}",
  linguas_ocr: "por+eng+lat+ita+fra+spa+deu",
  ocr_ativo: true,
  enriquecimento_auto: true,
  limiar_confianca: 0.8,
  email_contacto: "",
  youtube_api_key: "",
}

migrate((app) => {
  const auto = [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ]

  // --- tipos_fonte
  const tipos = new Collection({
    type: "base",
    name: "tipos_fonte",
    fields: [
      { type: "text", name: "nome", required: true, max: 200 },
      { type: "select", name: "categoria", values: ["Escrita", "Audiovisual", "Instrumento", "Digital", "Outro"], maxSelect: 1 },
      { type: "text", name: "descricao", max: 2000 },
      { type: "text", name: "csl_tipo", max: 100 },
      { type: "text", name: "csl_genero", max: 200 },
      { type: "select", name: "natureza_padrao", values: ["primária", "secundária"], maxSelect: 1 },
      { type: "json", name: "campos", maxSize: 1000000 },
      { type: "number", name: "ordem", onlyInt: true },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tipos_nome ON tipos_fonte (nome)"],
  })
  app.save(tipos)

  // --- fontes
  const fontes = new Collection({
    type: "base",
    name: "fontes",
    fields: [
      { type: "relation", name: "tipo", collectionId: tipos.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "titulo", max: 5000 },
      { type: "json", name: "autores", maxSize: 200000 },
      { type: "text", name: "autor_principal", max: 500 },
      { type: "text", name: "data", max: 200 },
      { type: "number", name: "ano", onlyInt: true },
      { type: "text", name: "editora", max: 1000 },
      { type: "text", name: "local", max: 1000 },
      { type: "text", name: "doi", max: 500 },
      { type: "text", name: "isbn", max: 100 },
      { type: "url", name: "url" },
      { type: "select", name: "natureza", values: ["primária", "secundária"], maxSelect: 1 },
      { type: "select", name: "contextos", values: CONTEXTOS, maxSelect: CONTEXTOS.length },
      { type: "json", name: "tags", maxSize: 100000 },
      { type: "json", name: "metadados", maxSize: 2000000 },
      { type: "text", name: "notas", max: 1000000 },
      { type: "text", name: "ficheiro", max: 4000 },
      { type: "text", name: "ficheiro_original", max: 2000 },
      { type: "text", name: "hash", max: 128 },
      { type: "select", name: "estado", values: ["processando", "a_rever", "completo", "erro"], maxSelect: 1 },
      { type: "text", name: "origem", max: 200 },
      { type: "json", name: "candidatos", maxSize: 2000000 },
      { type: "select", name: "ocr_estado", values: ["pendente", "em_curso", "feito", "nao_aplicavel", "erro"], maxSelect: 1 },
      { type: "number", name: "paginas", onlyInt: true },
      ...auto,
    ],
    indexes: [
      "CREATE INDEX idx_fontes_hash ON fontes (hash)",
      "CREATE INDEX idx_fontes_estado ON fontes (estado)",
      "CREATE INDEX idx_fontes_ano ON fontes (ano)",
      "CREATE INDEX idx_fontes_ocr ON fontes (ocr_estado)",
    ],
  })
  app.save(fontes)

  // --- textos (texto integral extraído / OCR), separado para não pesar nas listagens
  const textos = new Collection({
    type: "base",
    name: "textos",
    fields: [
      { type: "relation", name: "fonte", collectionId: fontes.id, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "text", name: "conteudo", max: 100000000 },
      { type: "select", name: "metodo", values: ["pdf", "ocr", "manual"], maxSelect: 1 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_textos_fonte ON textos (fonte)"],
  })
  app.save(textos)

  // --- definicoes (chave -> valor)
  const defs = new Collection({
    type: "base",
    name: "definicoes",
    fields: [
      { type: "text", name: "chave", required: true, max: 200 },
      { type: "json", name: "valor", maxSize: 100000 },
      ...auto,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_definicoes_chave ON definicoes (chave)"],
  })
  app.save(defs)

  // Nota: sem regras de acesso (null) = só o superutilizador (o próprio) acede.

  TIPOS.forEach((t, i) => {
    const r = new Record(tipos)
    r.set("nome", t[0])
    r.set("categoria", t[1])
    r.set("csl_tipo", t[2])
    r.set("csl_genero", t[3])
    r.set("natureza_padrao", t[4])
    r.set("campos", t[5])
    r.set("ordem", (i + 1) * 10)
    app.save(r)
  })

  Object.keys(DEFINICOES).forEach((k) => {
    const r = new Record(defs)
    r.set("chave", k)
    r.set("valor", DEFINICOES[k])
    app.save(r)
  })

  // Índice de pesquisa em texto completo (SQLite FTS5), sem acentos nem maiúsculas.
  // É um índice derivado: pode ser reconstruído a qualquer momento a partir dos dados.
  app.db().newQuery(
    "CREATE VIRTUAL TABLE IF NOT EXISTS fontes_fts USING fts5(" +
    "fonte_id UNINDEXED, titulo, autores, outros, texto, " +
    "tokenize = 'unicode61 remove_diacritics 2')"
  ).execute()
}, (app) => {
  app.db().newQuery("DROP TABLE IF EXISTS fontes_fts").execute()
  for (const n of ["textos", "fontes", "definicoes", "tipos_fonte"]) {
    try { app.delete(app.findCollectionByNameOrId(n)) } catch (_) {}
  }
})
