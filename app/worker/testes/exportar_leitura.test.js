// Testes da cópia de leitura (5/10/2026), com uma base SQLite mínima feita aqui e ficheiros numa pasta temporária.
// Correr: cd app/worker && node --test testes/exportar_leitura.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import fsp from 'node:fs/promises'
import { planear, aplicar, foraDasProtegidas, nomeReservado, tomarBloqueio } from '../src/exportar_leitura.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exportar-leitura-'))
const base = path.join(tmp, 'data.db')
const origem = path.join(tmp, 'biblioteca')
const pagina = path.join(tmp, 'leitura')
const inter = path.join(tmp, 'inter')
const registos = path.join(tmp, 'registos')
const destino = path.join(tmp, 'TINCTORIS')
const q = (v) => (v == null ? 'NULL' : `'${String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/'/g, "''")}'`)

const CANCAO = 'Canção' // (no disco fica em NFD)
const campos = [
  { chave: 'catalogo', rotulo: 'Nº de catálogo', tipo: 'texto' },
  { chave: 'forma', rotulo: 'Manuscrito ou impresso', tipo: 'lista', opcoes: ['Impresso', 'Manuscrito'] },
  { chave: 'nota_revisao', rotulo: 'Nota para rever', tipo: 'texto' },
  { chave: 'lote', rotulo: 'Lote', tipo: 'texto' },
  { chave: 'notas_processo', rotulo: 'Notas do processo', tipo: 'texto_longo' },
  { chave: 'participantes', rotulo: 'Participantes', tipo: 'texto' },
  { chave: 'campo_novo', rotulo: 'Campo novo', tipo: 'texto' },
]
// (o esquema mínimo das tabelas que o exportador lê)
const ESQUEMA = [
  `CREATE TABLE fontes (id TEXT PRIMARY KEY, numero NUMERIC, titulo TEXT DEFAULT '', autores JSON, data TEXT DEFAULT '', ano NUMERIC DEFAULT 0, tipo TEXT DEFAULT '', estado TEXT, natureza TEXT DEFAULT '', editora TEXT DEFAULT '', local TEXT DEFAULT '', doi TEXT DEFAULT '', isbn TEXT DEFAULT '', url TEXT DEFAULT '', paginas NUMERIC DEFAULT 0, palavras_chave JSON, metadados JSON, ficheiro TEXT DEFAULT '', ficheiros_extra JSON, created TEXT DEFAULT '', updated TEXT DEFAULT '', notas TEXT DEFAULT '', tags JSON, contextos JSON, candidatos JSON, hash TEXT DEFAULT '', ocr_estado TEXT DEFAULT '', origem TEXT DEFAULT '', ficheiro_original TEXT DEFAULT '');`,
  `CREATE TABLE tipos_fonte (id TEXT PRIMARY KEY, nome TEXT, ordem NUMERIC, campos JSON);`,
  `CREATE TABLE notas_leitura (id TEXT PRIMARY KEY, fonte TEXT, localizacao TEXT, tipo_nota TEXT, texto TEXT, ordem NUMERIC, created TEXT, tags JSON, contextos JSON);`,
  `CREATE TABLE textos (id TEXT PRIMARY KEY, fonte TEXT, conteudo TEXT);`,
  `CREATE TABLE definicoes (id TEXT PRIMARY KEY, chave TEXT, valor JSON);`,
  `INSERT INTO definicoes VALUES ('d1', 'nome_dono', '"Pedro Sousa Silva"');`,
]
const fichas = [
  {
    id: 'aaa', numero: 5, titulo: 'Six sonatas', estado: 'completo', ficheiro: 'Partitura/1771/abel.pdf',
    ficheiros_extra: [{ ficheiro: 'Partitura/1771/abel_2.mid', hash: 'h2', original: 'abel_2.mid', rotulo: 'abel_2' }],
    metadados: { catalogo: 'BWV 1', forma: '', nota_revisao: 'SEGREDO-NOTA', lote: 'x', verificacao: { r: 1 }, originais: `_originais/Mu\u0301sica`, nao_existe: 'y', notas_processo: 'PROCESSO-PRIVADO', participantes: 'ALUNOS-PRIVADOS', campo_novo: 'NOVO-PRIVADO' },
    autores: [{ nome: 'Carl Friedrich', apelido: 'Abel', papel: 'compositor', orcid: 'z' }],
    palavras_chave: ['sonata', '', 'Pedro Silva', 'SILVA, Pedro', 'Pedro Sousa Silva', 'Pedro', 'Silva'],
  },
  { id: 'bbb', numero: 150, titulo: CANCAO, estado: 'a_rever', ficheiro: `Livro/${CANCAO}.pdf`, metadados: {}, autores: [] },
  { id: 'ccc', numero: 250, titulo: 'À mão', estado: 'processando', ficheiro: '', metadados: null, autores: null },
  { id: 'ddd', numero: 7, titulo: 'Perdida', estado: 'erro', ficheiro: 'Partitura/falta.pdf', metadados: {}, autores: [] },
]

function montar() {
  const sql = [
    ...ESQUEMA,
    `INSERT INTO tipos_fonte VALUES ('tp1', 'Partitura', 30, ${q(campos)});`,
    ...fichas.map(
      (f) =>
        `INSERT INTO fontes (id, numero, titulo, autores, tipo, estado, palavras_chave, metadados, ficheiro, ficheiros_extra, created, notas, tags, contextos, candidatos, hash, ocr_estado, origem, ficheiro_original, ano, data) VALUES (${q(f.id)}, ${f.numero}, ${q(f.titulo)}, ${q(f.autores)}, 'tp1', ${q(f.estado)}, ${q(f.palavras_chave)}, ${q(f.metadados)}, ${q(f.ficheiro)}, ${q(f.ficheiros_extra)}, '2026-09-27 19:05:45.649Z', 'NOTA-PRIVADA', '["ETIQUETA-PRIVADA"]', '["CONTEXTO-PRIVADO"]', '[{"x":"CANDIDATO-PRIVADO"}]', 'HASH-PRIVADO', 'feito', 'ORIGEM-PRIVADA', 'ORIGINAL-PRIVADO', 1771, '1771');`
    ),
    `INSERT INTO notas_leitura VALUES ('n1', 'aaa', 'p. 12', 'Citação', 'Bela frase', 0, '2026-10-01', '["ETIQUETA-NOTA"]', '["CONTEXTO-NOTA"]');`,
    `INSERT INTO notas_leitura VALUES ('n2', 'bbb', 'p. 1', 'Ideia', 'Outra', 0, '2026-10-01', NULL, '[]');`,
    `INSERT INTO textos VALUES ('t1', 'aaa', '[p. 1] texto </script><b> aqui');`,
    `INSERT INTO textos VALUES ('t2', 'bbb', '[p. 1] canção');`,
    `INSERT INTO textos VALUES ('t3', 'ccc', '');`,
  ].join('\n')
  execFileSync('/usr/bin/sqlite3', [base], { input: sql })
  const escrever = (rel, conteudo) => {
    fs.mkdirSync(path.dirname(path.join(origem, rel)), { recursive: true })
    fs.writeFileSync(path.join(origem, rel), conteudo)
  }
  escrever('Partitura/1771/abel.pdf', 'pdf do abel')
  escrever('Partitura/1771/abel_2.mid', 'midi')
  escrever(`Livro/${CANCAO.normalize('NFD')}.pdf`, 'livro')
  escrever('Partitura/solto.pdf', 'não pertence a nenhuma ficha')
  escrever(`_originais/${'Música'.normalize('NFD')}/10.jpg`, 'dez')
  escrever(`_originais/${'Música'.normalize('NFD')}/2.jpg`, 'dois')
  escrever(`_originais/${'Música'.normalize('NFD')}/.DS_Store`, 'x')
  escrever(`_originais/${'Música'.normalize('NFD')}/3.TIF`, 'tif')
  escrever(`_originais/${'Música'.normalize('NFD')}/leia-me.txt`, 'não é imagem')
  escrever(`_originais/${'Música'.normalize('NFD')}/video.mov`, 'não é imagem')
  escrever('_duplicados/abel.pdf', 'duplicado')
  fs.mkdirSync(path.join(pagina, 'fontes'), { recursive: true })
  fs.writeFileSync(path.join(pagina, 'index.html'), '<!doctype html><title>TINCTORIS</title>')
  fs.writeFileSync(path.join(pagina, 'leitura.js'), '// página')
  fs.writeFileSync(path.join(pagina, 'FORMATO.md'), '# contrato')
  fs.mkdirSync(inter, { recursive: true })
  for (const f of ['InterVariable.woff2', 'InterVariable-Italic.woff2', 'Inter-OFL.txt']) fs.writeFileSync(path.join(inter, f), f)
}
montar()

const opcoes = (mais = {}) => ({ destino, base, origem, pagina, fontesInter: inter, ...mais })
const exportar = async (mais) => {
  const plano = await planear(opcoes(mais))
  return { plano, r: await aplicar(plano, { registos }) }
}
function lerDados() {
  const js = fs.readFileSync(path.join(destino, 'dados', 'fichas.js'), 'utf8')
  const janela = {}
  vm.runInNewContext(js, { window: janela })
  // (objectos de outro contexto: passar por JSON para as comparações)
  return { js, dados: JSON.parse(JSON.stringify(janela.TINCTORIS_DADOS)) }
}
function lerBloco(n) {
  const js = fs.readFileSync(path.join(destino, 'dados', 'texto', `bloco-${String(n).padStart(4, '0')}.js`), 'utf8')
  let r
  vm.runInNewContext(js, { TINCTORIS_TEXTO: (num, textos) => (r = { num, textos: JSON.parse(JSON.stringify(textos)) }) })
  return { js, ...r }
}

test('primeira exportação: dados, privacidade, estados, blocos e nomes NFC', async () => {
  const { plano, r } = await exportar()
  assert.equal(r.erros.length, 0, r.erros.join('\n'))
  assert.equal(plano.contagens.fichas, 4)
  assert.equal(plano.contagens.fichasEmFalta, 1)
  assert.deepEqual(plano.emFalta.map((x) => x.numero), [7])
  assert.equal(r.copiados, 6) // abel.pdf, abel_2.mid, Canção.pdf, 3 imagens (o .txt e o .mov não são imagens)
  const { js, dados } = lerDados()
  assert.equal(dados.formato, 1)
  assert.match(dados.programa, /^TINCTORIS /)
  assert.match(dados.exportado_em, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/)
  for (const s of ['PRIVAD', 'SEGREDO', 'ETIQUETA', 'CONTEXTO', 'CANDIDATO', 'HASH-', 'ORIGEM-', 'orcid', 'verificacao', 'originais_conjunto', 'nome_dono', 'Sousa', 'notas_processo', 'participantes', 'campo_novo', 'leia-me.txt', 'video.mov'])
    assert.ok(!js.includes(s), `não devia sair: ${s}`)
  assert.ok(!js.includes('</script'))
  const chaves = ['id', 'numero', 'titulo', 'autores', 'data', 'ano', 'tipo', 'estado', 'natureza', 'editora', 'local', 'doi', 'isbn', 'url', 'paginas', 'palavras_chave', 'metadados', 'ficheiros', 'originais', 'bloco_texto', 'criado']
  for (const f of dados.fichas) assert.deepEqual(Object.keys(f).sort(), [...chaves].sort())
  for (const n of dados.notas) assert.deepEqual(Object.keys(n).sort(), ['criado', 'fonte', 'id', 'localizacao', 'ordem', 'texto', 'tipo_nota'])
  // tipos sem os campos internos
  assert.deepEqual(dados.tipos[0].campos.map((c) => c.chave), ['catalogo', 'forma'])
  assert.equal(plano.contagens.palavrasDoDono, 3)
  const por = Object.fromEntries(dados.fichas.map((f) => [f.numero, f]))
  assert.deepEqual(por[5].metadados, { catalogo: 'BWV 1' })
  assert.deepEqual(por[5].autores, [{ nome: 'Carl Friedrich', apelido: 'Abel', papel: 'compositor' }])
  // (o nome do dono sai das palavras-chave em qualquer das formas; «Pedro» e «Silva» sozinhos ficam)
  assert.deepEqual(por[5].palavras_chave, ['sonata', 'Pedro', 'Silva'])
  assert.deepEqual([por[5].estado, por[150].estado, por[250].estado, por[7].estado], ['completo', 'rever', 'rever', 'rever'])
  assert.deepEqual(por[5].ficheiros, [{ caminho: 'Partitura/1771/abel.pdf', rotulo: '' }, { caminho: 'Partitura/1771/abel_2.mid', rotulo: 'abel_2' }])
  assert.deepEqual(por[5].originais, [{ pasta: '_originais/Música'.normalize('NFC'), imagens: ['2.jpg', '3.TIF', '10.jpg'], tamanho: 10 }])
  assert.deepEqual(por[7].ficheiros, [])
  assert.deepEqual(por[250].ficheiros, [])
  assert.equal(por[150].ficheiros[0].caminho, `Livro/${CANCAO}.pdf`.normalize('NFC'))
  // blocos: #5 → 1, #150 → 2, #250 sem texto (vazio)
  assert.deepEqual([por[5].bloco_texto, por[150].bloco_texto, por[250].bloco_texto, por[7].bloco_texto], [1, 2, 0, 0])
  const b1 = lerBloco(1)
  assert.equal(b1.num, 1)
  assert.deepEqual(b1.textos, { aaa: '[p. 1] texto </script><b> aqui' })
  assert.ok(!b1.js.includes('</script'))
  assert.deepEqual(lerBloco(2).textos, { bbb: '[p. 1] canção' })
  assert.deepEqual(fs.readdirSync(path.join(destino, 'dados', 'texto')).sort(), ['bloco-0001.js', 'bloco-0002.js'])
  // nomes em NFC no destino; nada de _duplicados nem de ficheiros soltos
  assert.ok(fs.readdirSync(path.join(destino, 'biblioteca', 'Livro')).includes(`${CANCAO}.pdf`.normalize('NFC')))
  assert.ok(fs.readdirSync(path.join(destino, 'biblioteca', '_originais')).includes('Música'.normalize('NFC')))
  assert.deepEqual(fs.readdirSync(path.join(destino, 'biblioteca')).sort(), ['Livro', 'Partitura', '_originais'])
  assert.ok(!fs.existsSync(path.join(destino, 'biblioteca', 'Partitura', 'solto.pdf')))
  for (const f of dados.fichas) for (const x of f.ficheiros) assert.ok(fs.existsSync(path.join(destino, 'biblioteca', x.caminho)), x.caminho)
  // página, letras, LEIA-ME e marca
  assert.ok(fs.existsSync(path.join(destino, 'Abrir TINCTORIS.html')))
  assert.ok(fs.existsSync(path.join(destino, 'leitura', 'leitura.js')))
  assert.ok(!fs.existsSync(path.join(destino, 'leitura', 'FORMATO.md')))
  assert.ok(!fs.existsSync(path.join(destino, 'leitura', 'index.html')))
  assert.ok(fs.existsSync(path.join(destino, 'leitura', 'fontes', 'InterVariable.woff2')))
  assert.ok(fs.existsSync(path.join(destino, 'LEIA-ME.txt')))
  const marca = JSON.parse(fs.readFileSync(path.join(destino, '.tinctoris-leitura.json'), 'utf8'))
  assert.equal(Object.keys(marca.ficheiros).length, 6)
  assert.equal(marca.amostra, false)
  assert.equal(marca.ficheiros['Partitura/1771/abel.pdf'].ficha, 'aaa')
  assert.deepEqual(Object.keys(marca.blocos).sort(), ['bloco-0001.js', 'bloco-0002.js'])
  assert.ok(!fs.existsSync(path.join(destino, '.tinctoris-leitura.bloqueio')), 'o bloqueio sai no fim')
  // mtime do destino = o da origem
  const [a, b] = [fs.statSync(path.join(origem, 'Partitura/1771/abel.pdf')), fs.statSync(path.join(destino, 'biblioteca/Partitura/1771/abel.pdf'))]
  assert.ok(Math.abs(a.mtimeMs - b.mtimeMs) < 2)
  assert.ok(fs.existsSync(r.registo))
  assert.ok(!fs.readdirSync(destino, { recursive: true }).some((n) => String(n).endsWith('.parcial')))
})

test('segunda exportação: não copia nada', async () => {
  const { plano, r } = await exportar()
  assert.equal(plano.copiar.length, 0)
  assert.equal(plano.apagar.length, 0)
  assert.equal(plano.contagens.blocosNovos + plano.contagens.blocosAlterados, 0)
  assert.equal(r.copiados, 0)
  assert.equal(r.blocosEscritos, 0)
})

test('ficheiro mudado na origem volta a copiar-se', async () => {
  const f = path.join(origem, 'Partitura/1771/abel_2.mid')
  fs.writeFileSync(f, 'midi novo')
  // (sem clone: a cópia simples, a que se usa noutro disco)
  const { plano, r } = await exportar({ clonar: false })
  assert.equal(plano.clonar, false)
  assert.deepEqual(plano.copiar.map((x) => x.caminho), ['Partitura/1771/abel_2.mid'])
  assert.equal(r.copiados, 1)
  const alvo = path.join(destino, 'biblioteca/Partitura/1771/abel_2.mid')
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'midi novo')
  assert.ok(Math.abs(fs.statSync(alvo).mtimeMs - fs.statSync(f).mtimeMs) < 2)
})

// A mesma base sem a ficha #150 (como se tivesse sido apagada na biblioteca)
const baseSem150 = path.join(tmp, 'sem150.db')
fs.copyFileSync(base, baseSem150)
execFileSync('/usr/bin/sqlite3', [baseSem150, "DELETE FROM fontes WHERE id = 'bbb'; DELETE FROM notas_leitura WHERE fonte = 'bbb'; DELETE FROM textos WHERE fonte = 'bbb';"])

test('ficha que sai da exportação: o ficheiro e o bloco de texto são apagados no destino', async () => {
  fs.writeFileSync(path.join(destino, 'biblioteca', 'Livro', '.DS_Store'), 'lixo')
  const { plano, r } = await exportar({ base: baseSem150 })
  assert.deepEqual(plano.apagar.map((x) => x.rel), [`biblioteca/Livro/${CANCAO}.pdf`.normalize('NFC')])
  assert.deepEqual(plano.blocosApagar.map((x) => x.rel), ['dados/texto/bloco-0002.js'])
  assert.equal(r.apagados, 2)
  assert.ok(!fs.existsSync(path.join(destino, 'biblioteca', 'Livro')), 'pasta vazia removida')
  assert.ok(!fs.existsSync(path.join(destino, 'dados', 'texto', 'bloco-0002.js')))
  assert.equal(lerDados().dados.fichas.length, 3)
  assert.equal(lerDados().dados.notas.length, 1)
  const marca = JSON.parse(fs.readFileSync(path.join(destino, '.tinctoris-leitura.json'), 'utf8'))
  assert.equal(Object.keys(marca.ficheiros).length, 5)
})

test('--max-apagar: se o plano apaga mais do que a simulação mostrou, recusa antes de mexer em nada', async () => {
  await exportar() // (volta a pôr a ficha #150 no destino)
  const so5 = await planear(opcoes({ base: baseSem150 }))
  const n = so5.apagar.length + so5.blocosApagar.length
  assert.equal(n, 2) // Canção.pdf e bloco-0002.js
  await assert.rejects(aplicar(so5, { registos, maxApagar: n - 1 }), (e) => e.codigo === 'mais-apagar' && /Nada foi alterado/.test(e.message))
  assert.ok(fs.existsSync(path.join(destino, 'biblioteca', 'Livro', `${CANCAO}.pdf`.normalize('NFC'))))
  assert.ok(fs.existsSync(path.join(destino, 'dados', 'texto', 'bloco-0002.js')))
  assert.equal(lerDados().dados.fichas.length, 4)
  const r = await aplicar(so5, { registos, maxApagar: n })
  assert.equal(r.apagados, 2)
  await exportar() // (e volta a pôr tudo)
})

test('sobras «.parcial» de uma cópia interrompida saem sem entrar na lista de apagados', async () => {
  const sobra = path.join(destino, 'biblioteca', 'Partitura', '1771', 'abel.pdf.parcial')
  fs.writeFileSync(sobra, 'a meio')
  const plano = await planear(opcoes())
  assert.equal(plano.apagar.length, 0)
  assert.ok(plano.lixo.includes('biblioteca/Partitura/1771/abel.pdf.parcial'))
  await aplicar(plano, { registos })
  assert.ok(!fs.existsSync(sobra))
})

test('linha de comandos --json: um objecto por linha (plano, progresso, fim) e a guarda --max-apagar', () => {
  const novo = path.join(tmp, 'TINCTORIS-json')
  const correr = (...mais) =>
    execFileSync(process.execPath, ['--no-deprecation', path.join(import.meta.dirname, '..', 'src', 'exportar_leitura.js'), '--destino', novo, '--base', base, '--origem', origem, '--registos', registos, '--json', ...mais], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
  const sim = correr()
  assert.deepEqual(sim.map((x) => x.tipo), ['progresso', 'plano', 'fim'])
  assert.equal(sim[1].contagens.copiar, 6)
  assert.equal(sim[1].nApagar, 0)
  assert.ok(sim[1].resumo.length >= 6 && fs.existsSync(sim[1].registo))
  assert.ok(!fs.existsSync(novo), 'a simulação não escreve no destino')
  const ap = correr('--aplicar', '--max-apagar', '0')
  const fim = ap.at(-1)
  assert.equal(fim.tipo, 'fim')
  assert.equal(fim.copiados, 6)
  assert.ok(ap.some((x) => x.tipo === 'progresso' && x.fase === 'copiar'))
  assert.ok(fs.existsSync(path.join(novo, 'dados', 'fichas.js')))
  // um ficheiro que não pertence a nenhuma ficha: a cópia passa a ter 1 a apagar e --max-apagar 0 recusa
  const parcial = path.join(novo, 'biblioteca', 'Partitura', 'solta.pdf')
  fs.writeFileSync(parcial, 'não pertence a nenhuma ficha')
  let erro
  try {
    correr('--aplicar', '--max-apagar', '0')
  } catch (e) {
    erro = JSON.parse(e.stdout.trim().split('\n').at(-1))
  }
  assert.equal(erro.tipo, 'erro')
  assert.equal(erro.codigo, 'mais-apagar')
  assert.ok(fs.existsSync(parcial), 'recusou antes de apagar')
  assert.equal(correr('--aplicar', '--max-apagar', '1').at(-1).apagados, 1)
  assert.ok(!fs.existsSync(parcial))
})

test('recusa uma pasta com conteúdo que não é cópia de leitura', async () => {
  const outra = path.join(tmp, 'outra')
  fs.mkdirSync(outra)
  fs.writeFileSync(path.join(outra, 'importante.txt'), 'não mexer')
  await assert.rejects(planear(opcoes({ destino: outra })), /não está vazia/)
  await assert.rejects(planear(opcoes({ destino: path.join(tmp, 'disco-desligado', 'TINCTORIS') })), /não existe/)
  await assert.rejects(planear(opcoes({ destino: path.join(origem, 'copia') })), /dentro da biblioteca/)
  assert.deepEqual(fs.readdirSync(outra), ['importante.txt'])
})

// ---------- guardas de segurança (revisão de 5/10) ----------

// Uma biblioteca pequena à parte: N fichas, cada uma com o seu PDF (P/fN.pdf)
function outra(nome, n, mais = []) {
  const dir = path.join(tmp, nome)
  const o = { dir, base: path.join(dir, 'data.db'), origem: path.join(dir, 'biblioteca'), destino: path.join(dir, 'TINCTORIS') }
  fs.mkdirSync(path.join(o.origem, 'P'), { recursive: true })
  const sql = [...ESQUEMA]
  for (let i = 1; i <= n; i++) {
    sql.push(`INSERT INTO fontes (id, numero, titulo, autores, estado, palavras_chave, metadados, ficheiro, ficheiros_extra) VALUES ('id${i}', ${i}, 'T${i}', '[]', 'completo', '[]', '{}', 'P/f${i}.pdf', '[]');`)
    fs.writeFileSync(path.join(o.origem, 'P', `f${i}.pdf`), 'x'.repeat(i))
  }
  execFileSync('/usr/bin/sqlite3', [o.base], { input: [...sql, ...mais].join('\n') })
  o.op = (m = {}) => ({ destino: o.destino, base: o.base, origem: o.origem, pagina, fontesInter: inter, ...m })
  o.sql = (q) => execFileSync('/usr/bin/sqlite3', [o.base, q])
  o.noDisco = () => fs.readdirSync(path.join(o.destino, 'biblioteca', 'P')).sort()
  return o
}

test('ligações simbólicas plantadas no destino («….parcial», ficheiros e pastas) nunca são seguidas', async () => {
  const o = outra('ligacoes', 3)
  await aplicar(await planear(o.op()), { registos })
  const vitimas = ['v1', 'v2', 'v3', 'v4'].map((n) => {
    const f = path.join(o.dir, `${n}.txt`)
    fs.writeFileSync(f, `DADOS ${n}\n`)
    return f
  })
  const pastaFora = path.join(o.dir, 'fora')
  fs.mkdirSync(pastaFora)
  fs.writeFileSync(path.join(pastaFora, 'f1.pdf'), 'NÃO APAGAR')
  fs.symlinkSync(vitimas[0], path.join(o.destino, 'dados', 'fichas.js.parcial'))
  fs.symlinkSync(vitimas[1], path.join(o.destino, '.tinctoris-leitura.json.parcial'))
  fs.rmSync(path.join(o.destino, 'LEIA-ME.txt'))
  fs.symlinkSync(vitimas[2], path.join(o.destino, 'LEIA-ME.txt'))
  fs.symlinkSync(vitimas[3], path.join(o.destino, 'leitura', 'leitura.js.parcial'))
  // (uma pasta da cópia trocada por uma ligação para fora: o que lá está não pode ser apagado nem escrito)
  fs.rmSync(path.join(o.destino, 'biblioteca', 'P'), { recursive: true })
  fs.symlinkSync(pastaFora, path.join(o.destino, 'biblioteca', 'P'))
  const plano = await planear(o.op())
  for (const l of ['dados/fichas.js.parcial', '.tinctoris-leitura.json.parcial', 'LEIA-ME.txt', 'leitura/leitura.js.parcial', 'biblioteca/P']) assert.ok(plano.lixo.includes(l), l)
  const r = await aplicar(plano, { registos })
  assert.equal(r.erros.length, 0, r.erros.join('\n'))
  for (const [i, v] of vitimas.entries()) assert.equal(fs.readFileSync(v, 'utf8'), `DADOS v${i + 1}\n`)
  assert.equal(fs.readFileSync(path.join(pastaFora, 'f1.pdf'), 'utf8'), 'NÃO APAGAR')
  assert.deepEqual(fs.readdirSync(pastaFora), ['f1.pdf'])
  for (const f of ['dados/fichas.js', 'LEIA-ME.txt', '.tinctoris-leitura.json', 'biblioteca/P/f1.pdf']) assert.ok(fs.lstatSync(path.join(o.destino, f)).isFile(), f)
  assert.ok(fs.lstatSync(path.join(o.destino, 'biblioteca', 'P')).isDirectory())
  assert.ok(!fs.readdirSync(o.destino, { recursive: true }).some((n) => String(n).endsWith('.parcial')))
  // a marca como ligação: recusa
  fs.renameSync(path.join(o.destino, '.tinctoris-leitura.json'), path.join(o.dir, 'marca.json'))
  fs.symlinkSync(path.join(o.dir, 'marca.json'), path.join(o.destino, '.tinctoris-leitura.json'))
  await assert.rejects(planear(o.op()), /não é um ficheiro normal/)
})

test('destino dentro da biblioteca escrito com outras maiúsculas ou noutra forma Unicode: recusado', async () => {
  const o = outra('maiusculas', 1)
  fs.mkdirSync(path.join(o.origem, 'Música'.normalize('NFD')))
  // (o disco do Mac não distingue maiúsculas: «/…/BIBLIOTECA» é a pasta «biblioteca»)
  const maiusculas = path.join(path.dirname(o.origem), 'BIBLIOTECA', 'copia')
  assert.ok(fs.existsSync(path.dirname(maiusculas)))
  await assert.rejects(planear(o.op({ destino: maiusculas })), /dentro da biblioteca/)
  await assert.rejects(planear(o.op({ destino: path.join(o.origem, 'MÚSICA'.normalize('NFC'), 'copia') })), /dentro da biblioteca/)
  assert.equal(foraDasProtegidas(path.join(o.dir.toUpperCase(), 'BIBLIOTECA', 'P', 'x'), [o.origem]), false)
  assert.equal(foraDasProtegidas(o.dir, [o.origem]), false, 'nem pode conter a biblioteca')
  assert.equal(foraDasProtegidas(path.join(o.dir, 'TINCTORIS'), [o.origem]), true)
  // (a base de dados também não pode ficar dentro do destino)
  assert.equal(foraDasProtegidas(o.dir, [o.base]), false)
  assert.ok(!fs.existsSync(path.join(o.origem, 'copia')))
})

test('amostra sobre uma cópia completa: recusada antes de apagar; amostra sobre amostra e completa sobre amostra: aceites', async () => {
  const o = outra('amostra', 5)
  await aplicar(await planear(o.op()), { registos })
  const amostra = await planear(o.op({ numeros: [1, 2] }))
  assert.equal(amostra.amostraSobreCompleta, true)
  assert.ok(amostra.avisos.some((a) => /amostra não a pode substituir/.test(a)))
  await assert.rejects(aplicar(amostra, { registos }), (e) => e.codigo === 'amostra-sobre-completa' && /Nada foi alterado/.test(e.message))
  assert.equal(o.noDisco().length, 5)
  // (pela linha de comandos também)
  assert.throws(
    () => execFileSync(process.execPath, ['--no-deprecation', path.join(import.meta.dirname, '..', 'src', 'exportar_leitura.js'), '--destino', o.destino, '--base', o.base, '--origem', o.origem, '--registos', registos, '--numeros', '1', '--aplicar'], { encoding: 'utf8', stdio: 'pipe' }),
    (e) => /cópia completa/.test(e.stderr)
  )
  assert.equal(o.noDisco().length, 5)
  // uma pasta nova com uma amostra, depois outra amostra, depois a completa
  const nova = path.join(o.dir, 'AMOSTRA')
  await aplicar(await planear(o.op({ destino: nova, numeros: [1, 2] })), { registos })
  assert.equal(JSON.parse(fs.readFileSync(path.join(nova, '.tinctoris-leitura.json'), 'utf8')).amostra, true)
  const r = await aplicar(await planear(o.op({ destino: nova, numeros: [3] })), { registos })
  assert.equal(r.apagados, 2)
  await aplicar(await planear(o.op({ destino: nova })), { registos })
  assert.equal(JSON.parse(fs.readFileSync(path.join(nova, '.tinctoris-leitura.json'), 'utf8')).amostra, false)
  await assert.rejects(aplicar(await planear(o.op({ destino: nova, amostra: 2 })), { registos }), (e) => e.codigo === 'amostra-sobre-completa')
  // (uma marca de uma versão antiga, sem «amostra»: conta como completa)
  const m = JSON.parse(fs.readFileSync(path.join(nova, '.tinctoris-leitura.json'), 'utf8'))
  delete m.amostra
  fs.writeFileSync(path.join(nova, '.tinctoris-leitura.json'), JSON.stringify(m))
  assert.equal((await planear(o.op({ destino: nova, numeros: [1] }))).amostraSobreCompleta, true)
})

test('apagar muito do disco, biblioteca vazia ou muitos ficheiros em falta: só com o número escrito', async () => {
  const o = outra('forte', 30)
  await aplicar(await planear(o.op()), { registos })
  // 25 das 30 fichas desaparecem da base
  const menos = path.join(o.dir, 'menos.db')
  fs.copyFileSync(o.base, menos)
  execFileSync('/usr/bin/sqlite3', [menos, 'DELETE FROM fontes WHERE numero > 5;'])
  const plano = await planear(o.op({ base: menos }))
  assert.equal(plano.contagens.nApagar, 25)
  assert.equal(plano.precisaConfirmacaoForte, true)
  assert.match(plano.motivosConfirmacao.join(' '), /25 dos 30 ficheiros/)
  await assert.rejects(aplicar(plano, { registos }), (e) => e.codigo === 'confirmar-apagar' && /Nada foi alterado/.test(e.message))
  await assert.rejects(aplicar(plano, { registos, confirmarApagar: 24 }), (e) => e.codigo === 'confirmar-apagar')
  assert.equal(o.noDisco().length, 30)
  // a biblioteca deixou de se ler entre o plano e o aplicar: recusa antes de apagar
  fs.renameSync(o.origem, o.origem + '-desligada')
  await assert.rejects(aplicar(plano, { registos, confirmarApagar: 25 }), (e) => e.codigo === 'origem-inacessivel')
  fs.renameSync(o.origem + '-desligada', o.origem)
  assert.equal(o.noDisco().length, 30)
  // com o número certo: apaga
  assert.equal((await aplicar(plano, { registos, confirmarApagar: 25 })).apagados, 25)
  assert.equal(o.noDisco().length, 5)
  // abaixo dos limites (10 % e mais de 20): não precisa
  await aplicar(await planear(o.op()), { registos })
  const poucos = path.join(o.dir, 'poucos.db')
  fs.copyFileSync(o.base, poucos)
  execFileSync('/usr/bin/sqlite3', [poucos, 'DELETE FROM fontes WHERE numero > 28;'])
  assert.equal((await planear(o.op({ base: poucos }))).precisaConfirmacaoForte, false)
  // biblioteca vazia (disco mal ligado): todas as fichas sem ficheiro → dois motivos
  const vazia = path.join(o.dir, 'vazia')
  fs.mkdirSync(vazia)
  const pv = await planear(o.op({ origem: vazia }))
  assert.equal(pv.precisaConfirmacaoForte, true)
  assert.equal(pv.contagens.nApagar, 30)
  assert.equal(pv.motivosConfirmacao.length, 3)
  assert.ok(pv.motivosConfirmacao.some((m) => /não se consegue ler ou está vazia/.test(m)))
  assert.ok(pv.motivosConfirmacao.some((m) => /30 das 30 fontes com ficheiro/.test(m)))
  // linha de comandos: --confirmar-apagar
  const cli = (...mais) => execFileSync(process.execPath, ['--no-deprecation', path.join(import.meta.dirname, '..', 'src', 'exportar_leitura.js'), '--destino', o.destino, '--base', menos, '--origem', o.origem, '--registos', registos, '--json', ...mais], { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').map((l) => JSON.parse(l))
  const sim = cli()
  assert.equal(sim[1].precisaConfirmacaoForte, true)
  assert.equal(sim[1].nApagar, 25)
  assert.throws(() => cli('--aplicar'), (e) => JSON.parse(e.stdout.trim().split('\n').at(-1)).codigo === 'confirmar-apagar')
  assert.equal(o.noDisco().length, 30)
  assert.equal(cli('--aplicar', '--confirmar-apagar', '25').at(-1).apagados, 25)
})

test('mudança de nome entre a simulação e o aplicar: tolerada; outro ficheiro a mais para apagar: recusado', async () => {
  // (mais 25 fichas cujo ficheiro falta na biblioteca: o plano tem um motivo de confirmação escrita)
  const faltam = Array.from({ length: 25 }, (_, i) => `INSERT INTO fontes (id, numero, titulo, autores, estado, palavras_chave, metadados, ficheiro, ficheiros_extra) VALUES ('falta${i}', ${100 + i}, 'F', '[]', 'completo', '[]', '{}', 'P/falta${i}.pdf', '[]');`)
  const o = outra('renomear', 4, faltam)
  const primeiro = await planear(o.op())
  assert.equal(primeiro.motivosConfirmacao.length, 1)
  assert.equal(primeiro.precisaConfirmacaoForte, false, 'nada a apagar')
  await aplicar(primeiro, { registos })
  const sim = await planear(o.op())
  const visto = sim.apagar.length + sim.blocosApagar.length
  assert.equal(visto, 0)
  // a fila de reanálise muda o nome do ficheiro da ficha #2 (no disco e na base)
  fs.renameSync(path.join(o.origem, 'P', 'f2.pdf'), path.join(o.origem, 'P', 'f2-novo.pdf'))
  o.sql("UPDATE fontes SET ficheiro = 'P/f2-novo.pdf' WHERE id = 'id2';")
  const agora = await planear(o.op())
  assert.deepEqual(agora.apagar.map((x) => [x.rel, x.renomeado]), [['biblioteca/P/f2.pdf', true]])
  // (uma mudança de nome não pede confirmação escrita, mesmo com muitos ficheiros em falta na biblioteca)
  assert.equal(agora.motivosConfirmacao.length, 1)
  assert.equal(agora.precisaConfirmacaoForte, false)
  const r = await aplicar(agora, { registos, maxApagar: visto, maxApagarOutros: visto })
  assert.equal(r.apagados, 1)
  assert.deepEqual(o.noDisco(), ['f1.pdf', 'f2-novo.pdf', 'f3.pdf', 'f4.pdf'])
  // uma ficha apagada entretanto (não é mudança de nome): recusado
  o.sql("DELETE FROM fontes WHERE id = 'id3';")
  const outro = await planear(o.op())
  assert.deepEqual(outro.apagar.map((x) => [x.rel, x.renomeado]), [['biblioteca/P/f3.pdf', false]])
  await assert.rejects(aplicar(outro, { registos, maxApagar: 0, maxApagarOutros: 0 }), (e) => e.codigo === 'mais-apagar')
  assert.ok(o.noDisco().includes('f3.pdf'))
  // mudança de nome + ficha apagada: o que não é mudança de nome conta e recusa
  fs.renameSync(path.join(o.origem, 'P', 'f4.pdf'), path.join(o.origem, 'P', 'f4-novo.pdf'))
  o.sql("UPDATE fontes SET ficheiro = 'P/f4-novo.pdf' WHERE id = 'id4';")
  const misto = await planear(o.op())
  assert.equal(misto.contagens.apagarRenomeados, 1)
  await assert.rejects(aplicar(misto, { registos, maxApagar: 1, maxApagarOutros: 0 }), (e) => e.codigo === 'mais-apagar')
  // (se a simulação já mostrava a ficha apagada, passa — com o número escrito, porque há ficheiros em falta)
  assert.equal(misto.precisaConfirmacaoForte, true)
  await assert.rejects(aplicar(misto, { registos, maxApagar: 1, maxApagarOutros: 1 }), (e) => e.codigo === 'confirmar-apagar')
  assert.equal((await aplicar(misto, { registos, maxApagar: 1, maxApagarOutros: 1, confirmarApagar: 1 })).apagados, 2)
})

test('duas entradas no disco com o mesmo nome em NFC: o ficheiro que fica nunca é apagado', async () => {
  const o = outra('nfc', 3)
  await aplicar(await planear(o.op()), { registos })
  const pasta = path.join(o.destino, 'biblioteca', 'P')
  const original = fsp.readdir
  // (simula um exFAT que devolve o mesmo nome duas vezes)
  fsp.readdir = async (d, op) => {
    const r = await original(d, op)
    return d === pasta && !op ? [...r, 'f3.pdf'] : r
  }
  let plano
  try {
    plano = await planear(o.op())
  } finally {
    fsp.readdir = original
  }
  assert.deepEqual(plano.apagar, [])
  await aplicar(plano, { registos })
  assert.ok(fs.existsSync(path.join(pasta, 'f3.pdf')))
  assert.equal((await planear(o.op())).copiar.length, 0)
})

test('bloqueio: dois exportadores nunca escrevem no mesmo disco ao mesmo tempo', async () => {
  const o = outra('bloqueio', 2)
  await aplicar(await planear(o.op()), { registos })
  const f = path.join(o.destino, '.tinctoris-leitura.bloqueio')
  assert.ok(!fs.existsSync(f))
  // outro processo vivo, agora: recusa
  fs.writeFileSync(f, JSON.stringify({ pid: process.ppid, inicio: Date.now(), maquina: os.hostname() }))
  await assert.rejects(aplicar(await planear(o.op()), { registos }), (e) => e.codigo === 'bloqueado' && /outra cópia/.test(e.message))
  assert.ok(fs.existsSync(f), 'o bloqueio do outro fica')
  // de um processo que já não existe: toma-se, e sai no fim
  fs.writeFileSync(f, JSON.stringify({ pid: 2147483646, inicio: Date.now(), maquina: os.hostname() }))
  await aplicar(await planear(o.op()), { registos })
  assert.ok(!fs.existsSync(f))
  // com mais de 6 horas (mesmo de outro computador): toma-se
  fs.writeFileSync(f, JSON.stringify({ pid: process.ppid, inicio: Date.now() - 7 * 3600 * 1000, maquina: 'outro-mac' }))
  await aplicar(await planear(o.op()), { registos })
  assert.ok(!fs.existsSync(f))
  // de outro computador, recente: recusa
  fs.writeFileSync(f, JSON.stringify({ pid: 1, inicio: Date.now(), maquina: 'outro-mac' }))
  await assert.rejects(aplicar(await planear(o.op()), { registos }), (e) => e.codigo === 'bloqueado' && /outro-mac/.test(e.message))
  fs.rmSync(f)
  // dois ao mesmo tempo neste processo: o segundo recusa
  const soltar = await tomarBloqueio(o.destino)
  await assert.rejects(tomarBloqueio(o.destino), (e) => e.codigo === 'bloqueado')
  await soltar()
  assert.ok(!fs.existsSync(f))
})

test('nomes reservados do Windows (CON, AUX, COM1…, com ou sem extensão, em qualquer pasta) não saem', async () => {
  for (const c of ['CON', 'con.pdf', 'P/aux.txt', 'Nul/x.pdf', 'COM1.tar.gz', 'lpt9', 'a/Prn/b']) assert.equal(nomeReservado(c), true, c)
  for (const c of ['console.pdf', 'COM10.pdf', 'com0', 'conta/aux1.pdf', 'P/f1.pdf']) assert.equal(nomeReservado(c), false, c)
  const o = outra('reservados', 1, [
    `INSERT INTO fontes (id, numero, titulo, autores, estado, palavras_chave, metadados, ficheiro, ficheiros_extra) VALUES ('r1', 2, 'R', '[]', 'completo', '[]', '{}', 'P/CON.pdf', '[{"ficheiro":"Aux/x.pdf"},{"ficheiro":"P/console.pdf"}]');`,
  ])
  for (const f of ['P/CON.pdf', 'Aux/x.pdf', 'P/console.pdf']) (fs.mkdirSync(path.dirname(path.join(o.origem, f)), { recursive: true }), fs.writeFileSync(path.join(o.origem, f), f))
  const plano = await planear(o.op())
  assert.deepEqual(plano.reservados.map((x) => x.caminho).sort(), ['Aux/x.pdf', 'P/CON.pdf'])
  assert.ok(plano.avisos.some((a) => /reserva/.test(a)))
  assert.deepEqual(plano.necessarios.map((x) => x.caminho).sort(), ['P/console.pdf', 'P/f1.pdf'])
  assert.deepEqual(plano.dados.fichas.find((f) => f.id === 'r1').ficheiros.map((x) => x.caminho), ['P/console.pdf'])
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
