// Comandos de terminal da Biblioteca (a biblioteca tem de estar a correr).
//   ./biblioteca estado
//   ./biblioteca adicionar
//   ./biblioteca exportar --estilo apa --formato texto [--pesquisa "termos"] [--tipo "Livro"] [--contexto "Ensino"] [--saida ficheiro]
//   ./biblioteca estilos
//   ./biblioteca reindexar
//   ./biblioteca titulos-obras [--aplicar] [--limite 20]
//   ./biblioteca rever-catalogos [--aplicar] [--limite 20]
//   ./biblioteca lotes-midi [--aplicar] [--excluir scozzesi,thesaurus]
//   ./biblioteca reanalisar-nomes [--aplicar]
//   ./biblioteca limpar-titulos [--aplicar]
//   ./biblioteca reler-rism [--aplicar]
//   ./biblioteca reler-imslp [--aplicar] [--limite N]
//   ./biblioteca rever-colecoes [--aplicar]
//   ./biblioteca titulos-rism [--aplicar]
//   ./biblioteca duplicados [--aplicar]
//   ./biblioteca reconstruir-imagens [--aplicar]
//   ./biblioteca testar-catalogos [--guardar]
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { pb, entrar, tipos, copiaDeSeguranca } from './pb.js'
import { PORTA, PASTAS, DUPLICADOS, segredo } from './config.js'
import { listarEstilos, exportar } from './exportacao.js'
import { pessoa } from './fontes_externas/util.js'
import { catalogoDe, obraPorCatalogo, obraCompativel, aplicarObra, compositorDe, eIntervalo } from './fontes_externas/obras.js'
import { reverCatalogos } from './rever_catalogos.js'
import { lotesExistentes, autorDoNome } from './lotes_midi.js'
import { doNomeFicheiro } from './capa.js'
import { limparTitulos } from './limpar_titulos.js'
import { planoImagens, aplicarPlano, EM_ESPERA } from './reconstruir_imagens.js'
import { testarCatalogos } from './testar_catalogos.js'

const [comando, ...resto] = process.argv.slice(2)
const opcoes = {}
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) opcoes[resto[i].slice(2)] = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true
}

const AJUDA = `Comandos:
  estado                       mostra o que o serviço de fundo está a fazer
  adicionar                    acrescenta uma fonte, respondendo a perguntas
  exportar [opções]            imprime (ou grava) uma bibliografia
      --estilo apa             (ver "estilos")
      --formato texto          texto | html | rtf | bibtex | ris | csl-json
      --lingua pt-PT           pt-PT | en-US
      --pesquisa "termos"      pesquisa em texto completo
      --tipo "Livro"           só fontes deste tipo
      --contexto "Ensino"      só fontes deste contexto/UC
      --etiqueta barroco       só fontes com esta etiqueta
      --saida ficheiro.txt     grava num ficheiro em vez de imprimir
  estilos                      lista os estilos de citação disponíveis
  testar-catalogos [--guardar] vê se os catálogos online (RISM, DIAMM, Gallica, BnF, BSB, BNP,
                               K10plus, Europeana, Cantus, PEM, Bach digital, RECIPP, Google Books)
                               respondem a partir deste Mac; não mexe na base de dados (não precisa
                               da biblioteca a correr); --guardar grava as respostas em app/registos/
  reindexar                    reconstrói o índice de pesquisa
  rever-catalogos [opções]     confirma os nºs de catálogo lidos pela IA (pelo nome do ficheiro,
                               texto ou IMSLP); corrige-os ou passa-os a sugestão; repõe títulos
      --limite 20 / --aplicar  como em titulos-obras
  lotes-midi [opções]          junta numa ficha cada lote de MIDI numerados de uma coleção
                               ("rossi_1608_1.mid", "_2"…) e procura o livro (biblioteca/RISM)
      --excluir a,b            deixa estes lotes como estão (nomes como aparecem na lista)
      --aplicar                grava (faz cópia de segurança antes); sem esta opção só mostra
  reanalisar-nomes [--aplicar] fichas por rever a quem o nome do ficheiro agora dá autor ou data
                               ("rossi_1608_9", "sonata_1720_2"): lista; com --aplicar, reanalisa-as
  limpar-titulos [--aplicar]   fichas por rever com títulos "SD ANONIMO SD-ANONIMO-…" (versão antiga):
                               título = nome original do ficheiro, e o ficheiro é renomeado
  reler-rism [--aplicar]       fichas identificadas no RISM sem impressor/editor: relê o registo e
                               preenche o impressor (e o local, se faltar); nunca apaga nada
  reler-imslp [--aplicar]      fichas identificadas no IMSLP: lê a página da obra (coleção ou obra,
                               impressor tomado por compositor, edição do exemplar); só preenche o que falta
  duplicados [--aplicar]       procura PDFs quase iguais (mesmo aspeto página a página, bytes diferentes);
                               com --aplicar, junta as cópias certas (fica a ficha mais completa, o ficheiro
                               repetido vai para biblioteca/_duplicados); os duvidosos ficam no ecrã «Duplicados»
  rever-colecoes [--aplicar]   PDFs com título de uma peça ("Sonata I") e 30+ páginas, lidos pela IA ou
                               pelo IMSLP: reanalisa-os (provável coleção sem frontispício)
  titulos-rism [--aplicar]     tira dos títulos vindos do RISM o impressor entre [ ] no fim
  reconstruir-imagens [--aplicar] [--excluir 15791,15805]  fontes fotografadas página a página que a versão antiga partiu (uma ficha
                               por página, PDFs parciais): mostra o plano; com --aplicar, liga os originais
                               aos PDFs antigos completos e junta as outras em watch_folder_em_espera/<pasta>/
  juntar 22 23-47              junta fichas numa só (ex.: volumes de uma obra): os ficheiros das
                               outras passam a ficheiros adicionais da primeira; nada é apagado do disco
  titulos-obras [opções]       títulos normalizados (IMSLP) nas partituras com nº de catálogo
      --limite 20              só as primeiras N (para ver uma amostra)
      --excluir 12,345         deixa estas fichas (números #) como estão
      --aplicar                grava as alterações (faz cópia de segurança antes);
                               sem esta opção só mostra o que mudaria`

async function main() {
  if (!comando || comando === 'ajuda' || comando === '--help') return console.log(AJUDA)
  if (comando === 'estilos') {
    for (const e of listarEstilos()) console.log(`${e.id.padEnd(44)} ${e.titulo}`)
    return
  }
  if (comando === 'testar-catalogos') return testarCatalogos({ guardar: !!opcoes.guardar })
  await entrar()

  if (comando === 'estado') {
    const r = await fetch(`http://127.0.0.1:${PORTA}/estado`, { headers: { 'X-Segredo': segredo() } })
    const e = await r.json()
    console.log(`Watch folder: ${e.entrada.ativo ? 'a processar ' + e.entrada.ativo : 'em espera'} (${e.entrada.pendentes} em fila)`)
    console.log(`OCR: ${e.ocr ? `${e.ocr.titulo} — página ${e.ocr.pagina}/${e.ocr.total}` : 'em espera'} (${e.ocr_pendentes} em fila)`)
    console.log(`Por rever: ${e.por_rever}`)
    console.log(`Endereços na rede: ${e.enderecos.join(', ')}`)
    console.log('\nÚltimos eventos:')
    e.eventos.slice(0, 15).forEach((ev) => console.log(`  ${ev.quando.slice(11, 19)} ${ev.msg}`))
    return
  }

  if (comando === 'titulos-obras') {
    // Partituras e manuscritos com número de catálogo, que não sejam impressos antigos identificados no RISM
    const lista = (await pb.collection('fontes').getFullList({ filter: "(tipo.nome = 'Partitura' || tipo.nome = 'Manuscrito') && metadados.catalogo != '' && origem !~ 'RISM'", fields: 'id,numero,titulo,autores,metadados' }))
      .filter((f) => !f.metadados?.titulo_fonte && !eIntervalo(f.metadados?.catalogo) && catalogoDe(f.metadados?.catalogo))
    const limite = Number(opcoes.limite) || lista.length
    // --excluir 12451,1098,…: fichas que ficam como estão (ex.: nº de catálogo errado na ficha)
    const excluir = new Set(String(opcoes.excluir || '').split(/[\s,;#]+/).filter(Boolean).map(Number))
    if (excluir.size) lista.splice(0, lista.length, ...lista.filter((f) => !excluir.has(f.numero)))
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-titulos-obras')}`)
    let mudadas = 0
    let vistas = 0
    let saltadas = 0
    for (const f of lista.slice(0, limite)) {
      vistas++
      const cat = catalogoDe(f.metadados.catalogo)
      let obra = null
      try {
        obra = await obraPorCatalogo(cat, compositorDe(f.autores)?.apelido, '', compositorDe(f.autores)?.nome)
      } catch (e) {
        console.log(`#${f.numero}: IMSLP falhou (${e.message})`)
        continue
      }
      if (!obra || !obraCompativel(f.titulo, obra, cat) || obra.titulo === f.titulo) continue
      if (opcoes.aplicar) {
        // A reanálise pode ter mexido na ficha entretanto: reler, e não tocar nas que estão a ser processadas ou mudaram
        const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,titulo,estado,autores,metadados' })
        if (atual.estado === 'processando' || atual.titulo !== f.titulo || atual.metadados?.titulo_fonte || atual.metadados?.catalogo !== f.metadados.catalogo) {
          saltadas++
          continue
        }
        await pb.collection('fontes').update(f.id, aplicarObra(atual, obra, cat))
      }
      mudadas++
      console.log(`#${String(f.numero).padStart(5, '0')}  ${f.titulo}\n        → ${obra.titulo}`)
    }
    if (saltadas) console.log(`\n${saltadas} fontes não foram tocadas porque estavam a ser reanalisadas (basta correr o comando outra vez mais tarde).`)
    return console.log(`\n${mudadas} de ${vistas} fontes ${opcoes.aplicar ? 'atualizadas' : 'mudariam (nada foi gravado; use --aplicar)'}.`)
  }

  if (comando === 'rever-catalogos') {
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-rever-catalogos')}`)
    const r = await reverCatalogos({ aplicar: !!opcoes.aplicar, limite: Number(opcoes.limite) || 0 })
    const c = r.contagem
    console.log(`\n${r.vistas} fichas vistas: ${c.mantido || 0} mantidas, ${c.corrigido || 0} com o número corrigido, ${c.retirado || 0} passadas a sugestão da IA, ${(c['titulo-reposto'] || 0) + (c['titulo-corrigido'] || 0)} com o título normalizado reposto ou corrigido.`)
    if (r.saltadas) console.log(`${r.saltadas} não foram tocadas porque estavam a ser reanalisadas (basta correr outra vez mais tarde).`)
    return console.log(opcoes.aplicar ? 'Gravado.' : 'Nada foi gravado (use --aplicar).')
  }

  if (comando === 'lotes-midi') {
    // (as mesmas funções do serviço, aqui: uma só cópia de segurança para todos os lotes, mesmo com o serviço
    // ainda na versão anterior; os ficheiros destes lotes estão por rever, fora da fila de reanálise)
    const proc = await import('./processador.js')
    const servico = async (acao, corpo) => (acao === 'juntar' ? proc.juntarFichas(corpo.id, corpo.ids) : proc.reorganizar(corpo.id))
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-lotes-midi')}`)
    const excluir = String(opcoes.excluir || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    const lista = await lotesExistentes({ aplicar: !!opcoes.aplicar, excluir, servico, doNome: doNomeFicheiro })
    for (const l of lista) {
      console.log(`\n${l.chave}: ${l.total} ficheiros → ficha #${l.principal}${l.estado ? `  [${l.estado}]` : ''}`)
      if (l.titulo) console.log(`   título: ${l.titulo}${l.autor ? `\n   autor: ${l.autor}` : ''}\n   ${l.identificado}`)
      if (l.fora.length) console.log(`   ficam de fora: ${l.fora.join(', ')}`)
      if (l.aviso) console.log(`   aviso: ${l.aviso}`)
    }
    console.log(`\n${lista.length} lotes${opcoes.aplicar ? '' : ' (simulação: nada foi gravado; para gravar, acrescente --aplicar)'}`)
    return
  }

  if (comando === 'reanalisar-nomes') {
    const lista = await pb.collection('fontes').getFullList({ filter: "estado = 'a_rever' && ficheiro != '' && ficheiro_original != ''", fields: 'id,numero,titulo,autores,data,ficheiro_original' })
    const escolhidas = []
    for (const f of lista) {
      const nome = doNomeFicheiro(f.ficheiro_original)
      const semAutor = !f.autores?.length
      const semData = !String(f.data || '').trim()
      // (o RISM só é consultado na reanálise; aqui basta um autor já conhecido ou uma hipótese com ano)
      const autor = semAutor ? await autorDoNome(f.ficheiro_original, {}) : null
      const ganha = [autor && `autor ${autor.literal || autor.apelido}`, semAutor && !autor && nome.provavel && nome.ano && `autor provável ${nome.autor} (a confirmar no RISM)`, semData && nome.ano && `data ${nome.ano}`].filter(Boolean)
      if (ganha.length) escolhidas.push({ f, ganha })
    }
    for (const { f, ganha } of escolhidas.slice(0, Number(opcoes.limite) || 60)) console.log(`#${String(f.numero).padStart(5, '0')}  ${f.ficheiro_original.slice(0, 60).padEnd(60)}  → ${ganha.join('; ')}`)
    console.log(`\n${escolhidas.length} fichas por rever ganham autor ou data pelo nome do ficheiro${escolhidas.length > (Number(opcoes.limite) || 60) ? ` (mostradas ${Number(opcoes.limite) || 60}; --limite N para ver mais)` : ''}.`)
    if (!opcoes.aplicar) return console.log('Simulação: nada foi alterado. Para as reanalisar, acrescente --aplicar.')
    const cap = await fetch(`http://127.0.0.1:${PORTA}/capacidades`, { headers: { 'X-Segredo': segredo() } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    if (!cap.capacidades?.includes('autor-pelo-nome')) return console.log('O TINCTORIS ainda está com a versão anterior: reinicie-o (fechar a janela do Terminal e abrir «Iniciar TINCTORIS») e repita.')
    console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-reanalisar-nomes')}`)
    let n = 0
    for (const { f } of escolhidas) {
      const r = await fetch(`http://127.0.0.1:${PORTA}/reanalisar`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id }) })
      if (r.ok) n++
    }
    return console.log(`${n} fichas postas a reanalisar (passam à frente da reanálise longa).`)
  }

  if (comando === 'limpar-titulos') {
    const servico = async (acao, corpo) => {
      const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || r.statusText)
      return j
    }
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-limpar-titulos')}`)
    const { mudar, feitas, saltadas } = await limparTitulos({ aplicar: !!opcoes.aplicar, servico })
    for (const f of mudar) console.log(`#${String(f.numero).padStart(5, '0')}  ${f.titulo.slice(0, 70).padEnd(70)}  →  ${f.novo}${f.aviso ? `  [aviso: ${f.aviso}]` : ''}`)
    console.log(`\n${mudar.length} títulos${opcoes.aplicar ? `: ${feitas} corrigidos, ${saltadas} saltados (mudaram ou estavam a ser processados)` : ' (simulação: nada foi alterado; para gravar, acrescente --aplicar)'}`)
    return
  }

  if (comando === 'reler-rism') {
    const { rismFonte } = await import('./fontes_externas/musicologicas.js')
    const lista = (await pb.collection('fontes').getFullList({ filter: "metadados.rism != '' && (editora = '' || local = '')", fields: 'id,numero,titulo,editora,local,estado,metadados' })).filter((f) => /^\d+$/.test(String(f.metadados?.rism || '')))
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-reler-rism')}`)
    let n = 0
    let sem = 0
    for (const f of lista) {
      let c
      try {
        c = await rismFonte(f.metadados.rism)
      } catch (e) {
        console.log(`#${f.numero}: RISM falhou (${e.message})`)
        continue
      }
      const alt = { ...(!f.editora && c.editora ? { editora: c.editora } : {}), ...(!f.local && c.local ? { local: c.local } : {}) }
      if (!Object.keys(alt).length) {
        sem++
        continue
      }
      if (opcoes.aplicar) {
        const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,editora,local,estado' })
        if (atual.estado === 'processando' || (alt.editora && atual.editora) || (alt.local && atual.local)) continue
        await pb.collection('fontes').update(f.id, alt)
      }
      n++
      console.log(`#${String(f.numero).padStart(5, '0')}  ${f.titulo.slice(0, 60).padEnd(60)}  → ${[alt.editora && `impressor: ${alt.editora}`, alt.local && `local: ${alt.local}`].filter(Boolean).join('; ')}`)
    }
    return console.log(`\n${lista.length} fichas do RISM sem impressor ou sem local: ${n} ${opcoes.aplicar ? 'preenchidas' : 'a preencher (simulação; --aplicar para gravar)'}; ${sem} sem esses dados no próprio RISM.`)
  }

  if (comando === 'reler-imslp') {
    const { imslpPagina, correcoesImslp } = await import('./fontes_externas/imslp_pagina.js')
    const { autoresConhecidos } = await import('./lotes_midi.js')
    const conhecidos = await autoresConhecidos()
    // (conhecido como compositor fora das fichas que vieram do próprio IMSLP)
    const conhecido = (apelido) => {
      const e = conhecidos.get(apelido)
      return !!e && (e.papeis.get('compositor') || 0) >= 2
    }
    const lista = await pb.collection('fontes').getFullList({ filter: "url ~ 'imslp.org/wiki/'", fields: 'id,numero,titulo,autores,editora,local,data,estado,url,ficheiro_original,metadados', sort: 'numero' })
    const limite = Number(opcoes.limite) || lista.length
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-reler-imslp')}`)
    const conta = { vistas: 0, mudadas: 0, impressor: 0, colecao: 0, edicao: 0, falhas: 0, saltadas: 0 }
    for (const f of lista.slice(0, limite)) {
      conta.vistas++
      let pagina
      try {
        pagina = await imslpPagina(f.url)
      } catch (e) {
        conta.falhas++
        console.log(`#${f.numero}: IMSLP falhou (${e.message})`)
        continue
      }
      if (!pagina) continue
      const { alt, notas } = correcoesImslp(f, pagina, { conhecido })
      if (!Object.keys(alt).length) continue
      if (opcoes.aplicar) {
        const atual = await pb.collection('fontes').getOne(f.id, { fields: 'id,estado,editora,autores' })
        const motivo = atual.estado === 'processando' ? 'a ser processada' : atual.editora !== f.editora ? 'impressor mudou entretanto' : JSON.stringify(atual.autores || []) !== JSON.stringify(f.autores || []) ? 'autores mudaram entretanto' : ''
        if (motivo) {
          conta.saltadas++
          console.log(`#${String(f.numero).padStart(5, '0')}  saltada: ${motivo}`)
          continue
        }
        await pb.collection('fontes').update(f.id, alt)
      }
      conta.mudadas++
      if (alt.autores) conta.impressor++
      if (alt.metadados?.conteudo_tipo === 'Coleção' && f.metadados?.conteudo_tipo !== 'Coleção') conta.colecao++
      if (alt.editora || alt.local) conta.edicao++
      const mostrar = [alt.metadados?.conteudo_tipo !== f.metadados?.conteudo_tipo && alt.metadados?.conteudo_tipo, alt.editora && `impressor: ${alt.editora}`, alt.local && `local: ${alt.local}`, alt.data && `data: ${alt.data}`, ...notas].filter(Boolean)
      console.log(`#${String(f.numero).padStart(5, '0')}  ${f.titulo.slice(0, 55).padEnd(55)}  → ${mostrar.join('; ')}`)
    }
    return console.log(`\n${conta.vistas} fichas vistas: ${conta.mudadas} ${opcoes.aplicar ? 'alteradas' : 'a alterar (simulação; --aplicar para gravar)'} — ${conta.colecao} coleções, ${conta.impressor} com o impressor tirado dos compositores, ${conta.edicao} com impressor/local da edição; ${conta.falhas} falhas de ligação${opcoes.aplicar ? `, ${conta.saltadas} saltadas` : ''}.`)
  }

  if (comando === 'rever-colecoes') {
    const { PECA } = await import('./fontes_externas/imslp_pagina.js')
    const lista = (await pb.collection('fontes').getFullList({ filter: "ficheiro ~ '.pdf' && estado != 'processando'", fields: 'id,numero,titulo,estado,origem,paginas,metadados', sort: 'numero' }))
      .filter((f) => PECA.test(f.titulo || '') && (f.paginas || 0) >= 30 && !f.metadados?.nota_revisao && /^(IA local|IMSLP|ficheiro)$/.test(f.origem || ''))
    for (const f of lista) console.log(`#${String(f.numero).padStart(5, '0')}  ${String(f.paginas).padStart(4)} p.  [${f.estado}, ${f.origem}]  ${f.titulo.slice(0, 70)}`)
    console.log(`\n${lista.length} PDFs com título de peça e 30+ páginas.`)
    if (!opcoes.aplicar) return console.log('Simulação: nada foi alterado. Para os reanalisar, acrescente --aplicar.')
    const cap = await fetch(`http://127.0.0.1:${PORTA}/capacidades`, { headers: { 'X-Segredo': segredo() } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    if (!cap.capacidades?.includes('colecoes-impressores')) return console.log('O TINCTORIS ainda está com a versão anterior: reinicie-o (fechar a janela do Terminal e abrir «Iniciar TINCTORIS») e repita.')
    console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-rever-colecoes')}`)
    let n = 0
    for (const f of lista) {
      const r = await fetch(`http://127.0.0.1:${PORTA}/reanalisar`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id }) })
      if (r.ok) n++
    }
    return console.log(`${n} fichas postas a reanalisar (passam à frente da reanálise longa).`)
  }

  if (comando === 'reconstruir-imagens') {
    const plano = await planoImagens()
    const linhas = []
    const p = (t) => (console.log(t), linhas.push(t))
    const num = (n) => `#${String(n).padStart(4, '0')}`
    const estados = (fs_) => Object.entries(fs_.reduce((o, f) => ((o[f.estado] = (o[f.estado] || 0) + 1), o), {})).map(([e, n]) => `${n} ${e}`).join(', ')
    for (const acao of ['reconstruir', 'repetida', 'ligar', 'esperar']) {
      const lista = plano.fontes.filter((f) => f.acao === acao)
      p(`\n===== ${acao.toUpperCase()} (${lista.length}) =====`)
      for (const fo of lista) {
        const partes = [
          fo.soltas.length && `${fo.soltas.length} fichas de página ${num(fo.soltas[0].ficha.numero)}…${num(fo.soltas[fo.soltas.length - 1].ficha.numero)} (${estados(fo.soltas.map((x) => x.ficha))}; ex.: ${fo.soltas.slice(0, 2).map((x) => x.nome).join(', ')})`,
          ...fo.juntados.map((j) => `PDF ${num(j.ficha.numero)} ${j.ficha.estado} ${j.ficheiros.length} p. «${String(j.ficha.titulo).slice(0, 40)}»`),
          fo.espera.length && `${fo.espera.length} em espera`,
          fo.duplicados.length && `${fo.duplicados.length} recuperadas de _duplicados`,
        ].filter(Boolean)
        p(`${String(fo.paginas).padStart(5)} p.  ${fo.chave}`)
        for (const x of partes) p(`          · ${x}`)
        if (fo.retidas.length) p(`          ! ficam de fora (têm notas de leitura): ${fo.retidas.map((f) => num(f.numero)).join(', ')}`)
      }
    }
    p(`\n${plano.totalSoltas} fichas que são uma só imagem; ${plano.pequenas.length} ficam como estão (imagens isoladas ou em grupos de 1–2).`)
    if (plano.semPasta.length) p(`PDFs antigos sem pasta de originais encontrada: ${plano.semPasta.map((f) => num(f.numero)).join(', ')}`)
    const hoje = new Date().toISOString().slice(0, 10)
    const registo = path.join(PASTAS.app, 'registos', `reconstruir-imagens-${opcoes.aplicar ? 'aplicado' : 'simulacao'}-${hoje}.txt`)
    if (!opcoes.aplicar) {
      fs.mkdirSync(path.dirname(registo), { recursive: true })
      fs.writeFileSync(registo, linhas.join('\n') + '\n')
      return console.log(`\nSimulação: nada foi alterado (lista em ${registo}). Para aplicar, acrescente --aplicar.`)
    }
    const cap = await fetch(`http://127.0.0.1:${PORTA}/capacidades`, { headers: { 'X-Segredo': segredo() } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    if (!cap.capacidades?.includes('originais')) return console.log('O TINCTORIS ainda está com a versão anterior: reinicie-o (fechar a janela do Terminal e abrir «Iniciar TINCTORIS») e repita.')
    console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-reconstruir-imagens')}`)
    const ativo = async () => {
      const e = await fetch(`http://127.0.0.1:${PORTA}/estado`, { headers: { 'X-Segredo': segredo() } }).then((r) => r.json()).catch(() => ({}))
      return e.entrada?.ativo || ''
    }
    const r = await aplicarPlano(plano, { ativo, registo: p, excluir: String(opcoes.excluir || '').split(/[\s,]+/).filter(Boolean).map((n) => n.replace('#', '')) })
    p(`\n${r.ligadas} PDFs ligados aos originais; ${r.repetidas || 0} grupos repetidos postos em _duplicados; ${r.reconstruidas} fontes reconstruídas em ${EM_ESPERA}; ${r.fichasRetiradas} fichas retiradas; ${r.imagens} imagens movidas, ${r.repetidasNaPasta} repetidas postas em _duplicados (nenhuma apagada).`)
    if (r.saltadas.length) p(`Saltadas (correr outra vez mais tarde): ${r.saltadas.join(', ')}`)
    fs.writeFileSync(registo, linhas.join('\n') + '\n')
    return console.log(`Lista em ${registo}`)
  }

  if (comando === 'titulos-rism') {
    const servico = async (acao, corpo) => {
      const r = await fetch(`http://127.0.0.1:${PORTA}/${acao}`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || r.statusText)
      return j
    }
    // "… opera quarta. [London, John Walsh & Joseph Hare]": o impressor e a cidade já têm campos próprios
    const imprenta = /\s*\[([^\]]*)\]\s*[.,;]?\s*$/
    const lista = (await pb.collection('fontes').getFullList({ filter: "origem ~ 'RISM' && estado != 'processando'", fields: 'id,numero,titulo,editora,local,metadados', sort: 'numero' }))
      .filter((f) => { const m = imprenta.exec(f.titulo || ''); return m && (/,|\d{4}/.test(m[1]) || (f.local && m[1].includes(f.local))) })
    if (opcoes.aplicar) console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-titulos-rism')}`)
    let n = 0
    for (const f of lista) {
      const m = imprenta.exec(f.titulo)
      const novo = f.titulo.replace(imprenta, '').trim()
      // (se o impressor ou o local faltam, tiram-se do que estava entre [ ]: "London, John Walsh & Joseph Hare")
      const [cidade, ...resto] = m[1].split(/\s*,\s*/)
      const alt = { titulo: novo, ...(!f.local && cidade && resto.length ? { local: cidade } : {}), ...(!f.editora && resto.length ? { editora: resto.join(', ') } : {}) }
      console.log(`#${String(f.numero).padStart(5, '0')}  …${f.titulo.slice(-60)}  →  …${novo.slice(-40)}${alt.editora ? ` | impressor: ${alt.editora}` : ''}${alt.local ? ` | local: ${alt.local}` : ''}`)
      if (!opcoes.aplicar) continue
      await pb.collection('fontes').update(f.id, { ...alt, metadados: { ...(f.metadados || {}), ...(f.metadados?.titulo_fonte ? {} : { titulo_fonte: f.titulo }) } })
      try {
        await servico('reorganizar', { id: f.id })
      } catch (_) {}
      n++
    }
    return console.log(`\n${lista.length} títulos${opcoes.aplicar ? `: ${n} corrigidos (o título completo fica em «Título na fonte»)` : ' (simulação; --aplicar para gravar)'}`)
  }

  if (comando === 'juntar') {
    // ./biblioteca juntar 22 23-47: os ficheiros das fichas #23…#47 passam a ficheiros adicionais da #22
    const numeros = resto.filter((x) => !x.startsWith('--')).flatMap((x) => {
      const m = /^#?(\d+)(?:-#?(\d+))?$/.exec(x)
      if (!m) return []
      const a = Number(m[1])
      const b = Number(m[2] || m[1])
      return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
    })
    if (numeros.length < 2) return console.log('Uso: ./biblioteca juntar 22 23-47   (a primeira é a ficha que fica)')
    const ids = []
    for (const n of numeros) ids.push((await pb.collection('fontes').getFirstListItem(`numero = ${n}`, { fields: 'id' })).id)
    const r = await fetch(`http://127.0.0.1:${PORTA}/juntar`, { method: 'POST', headers: { 'X-Segredo': segredo(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ids[0], ids: ids.slice(1) }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.erro || r.statusText)
    return console.log(`Ficha #${String(numeros[0]).padStart(4, '0')} «${j.titulo}»: 1 ficheiro principal + ${(j.ficheiros_extra || []).length} adicionais.`)
  }

  if (comando === 'duplicados') {
    // PDFs quase iguais (ver duplicados.js): os certos juntam-se com --aplicar; os duvidosos vão para o
    // ecrã "Duplicados" da biblioteca
    const D = await import('./duplicados.js')
    const r = await D.procurar({ aoProgresso: (fase, i, total) => process.stdout.write(`\r${fase}: ${i} de ${total}      `) })
    process.stdout.write('\n')
    const linhas = []
    const grupos = []
    for (const ids of r.certos) {
      const [manter, ...retirar] = await D.escolherPrincipal(ids)
      grupos.push({ manter, retirar })
      linhas.push(`fica  #${String(manter.numero).padStart(5, '0')} [${manter.estado}] ${manter.titulo}\n      ${manter.ficheiro}`)
      for (const x of retirar) linhas.push(`  sai #${String(x.numero).padStart(5, '0')} [${x.estado}] ${x.titulo}\n      ${x.ficheiro}`)
    }
    console.log(linhas.join('\n'))
    const porDecidir = await D.guardarDuvidosos(r.duvidosos)
    const retirar = grupos.reduce((s, g) => s + g.retirar.length, 0)
    console.log(`\n${r.vistos} PDFs vistos: ${grupos.length} grupos de cópias iguais (${retirar} fichas a mais); ${porDecidir} pares duvidosos para o ecrã «Duplicados».`)
    // (app/registos; na cópia de teste, ao lado da pasta de dados de teste)
    const pastaRegistos = path.resolve(PASTAS.dados, '..', 'registos')
    fs.mkdirSync(pastaRegistos, { recursive: true })
    const registo = path.join(pastaRegistos, `duplicados-${new Date().toISOString().slice(0, 10)}${opcoes.aplicar ? '-aplicado' : ''}.txt`)
    if (!opcoes.aplicar) {
      fs.writeFileSync(registo, linhas.join('\n') + '\n')
      return console.log(`Simulação: nada foi alterado (lista em ${registo}). Para juntar as cópias iguais, acrescente --aplicar.`)
    }
    console.log(`Cópia de segurança: ${await copiaDeSeguranca('antes-duplicados')}`)
    const feitas = []
    const saltadas = []
    for (const g of grupos) {
      for (const x of g.retirar) {
        try {
          const j = await D.juntarDuplicado(g.manter.id, x.id)
          feitas.push(`${j.retirada} → ${j.manter}  ${j.titulo}  (ficheiro: ${j.guardado_em || '—'})`)
        } catch (e) {
          saltadas.push(`#${String(x.numero).padStart(5, '0')}: ${e.message}`)
        }
      }
    }
    fs.writeFileSync(registo, [...feitas, '', 'Saltadas:', ...saltadas].join('\n') + '\n')
    if (saltadas.length) console.log(saltadas.join('\n'))
    return console.log(`\n${feitas.length} fichas repetidas retiradas (ficheiros em biblioteca/${DUPLICADOS}); ${saltadas.length} saltadas (basta correr outra vez mais tarde). Lista em ${registo}`)
  }

  if (comando === 'reindexar') {
    const r = await pb.send('/api/bib/reindexar', { method: 'POST' })
    return console.log(`Índice reconstruído: ${r.reindexadas} fontes.`)
  }

  if (comando === 'adicionar') {
    const rl = readline.createInterface({ input: stdin, output: stdout })
    const lista = await tipos()
    lista.forEach((t, i) => console.log(`${String(i + 1).padStart(3)}. ${t.nome}`))
    const n = Number(await rl.question('Número do tipo de fonte: ')) - 1
    const tipo = lista[n] || lista.find((t) => t.nome === 'Outro')
    const titulo = await rl.question('Título: ')
    const autores = (await rl.question('Autores (Apelido, Nome; Apelido, Nome): '))
      .split(';')
      .map((s) => pessoa(s.trim()))
      .filter(Boolean)
    const data = await rl.question('Data (ex.: 1985): ')
    const editora = await rl.question('Editora: ')
    const local = await rl.question('Local: ')
    const tags = (await rl.question('Etiquetas (separadas por vírgulas): ')).split(',').map((s) => s.trim()).filter(Boolean)
    rl.close()
    const r = await pb.collection('fontes').create({ tipo: tipo.id, titulo, autores, data, editora, local, tags, estado: 'completo', ocr_estado: 'nao_aplicavel' })
    return console.log(`Fonte criada (${r.id}): ${r.titulo}`)
  }

  if (comando === 'exportar') {
    const partes = []
    const params = {}
    if (opcoes.tipo) {
      const t = (await tipos()).find((x) => x.nome.toLowerCase() === String(opcoes.tipo).toLowerCase())
      if (!t) throw new Error(`Tipo desconhecido: ${opcoes.tipo}`)
      partes.push('tipo = {:tipo}')
      params.tipo = t.id
    }
    if (opcoes.contexto) (partes.push('contextos ?= {:ctx}'), (params.ctx = opcoes.contexto))
    if (opcoes.etiqueta) (partes.push('tags ~ {:tag}'), (params.tag = opcoes.etiqueta))
    let ids = null
    if (opcoes.pesquisa) {
      const fts = await pb.send('/api/bib/pesquisa', { query: { q: opcoes.pesquisa, limite: 5000 } })
      ids = new Set(fts.map((r) => r.id))
    }
    let fontes = await pb.collection('fontes').getFullList({ filter: partes.length ? pb.filter(partes.join(' && '), params) : '', expand: 'tipo' })
    if (ids) fontes = fontes.filter((f) => ids.has(f.id))
    if (!fontes.length) return console.error('Nenhuma fonte corresponde aos critérios.')
    const r = exportar(fontes, { estilo: opcoes.estilo || 'apa', formato: opcoes.formato || 'texto', lingua: opcoes.lingua || 'pt-PT' })
    if (opcoes.saida) {
      fs.writeFileSync(opcoes.saida, r.conteudo)
      return console.log(`${fontes.length} referências gravadas em ${opcoes.saida}`)
    }
    return console.log(r.conteudo)
  }

  console.log(AJUDA)
}

main().catch((e) => {
  console.error('Erro:', e.message.includes('fetch failed') ? 'o TINCTORIS não está a correr (faça duplo clique em «Iniciar TINCTORIS»).' : e.message)
  process.exit(1)
})
