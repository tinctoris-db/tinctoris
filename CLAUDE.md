# TINCTORIS — instruções para o Claude

## Quem mantém o projeto
Pedro Sousa Silva (ESMAE – Politécnico do Porto), autor e mantenedor. Não programa: responder sempre em PT-PT simples,
sem jargão; explicar o que cada passo faz e o que ele tem de fazer (duplo clique, onde carregar). Nunca lhe pedir que
edite código.
- Antes de mudanças grandes, explicar primeiro o que é possível e porquê, e só depois programar.
- **Perguntar SEMPRE antes de alterar código**: primeiro discutir a arquitetura; só programar quando ele disser.
  Verificações só de leitura podem fazer-se, dizendo que não mexem no código.
- Várias sessões do Claude podem trabalhar ao mesmo tempo: antes de alterar ficheiros partilhados (`servidor.js`,
  `processador.js`, `config.js`, `pb_public/app.js`, hooks), ver se outra sessão os está a mudar; se sim, combinar com
  ela ou esperar.
- Downloads (modelos, programas) só com autorização explícita, dizendo o que é, de onde vem e o tamanho.
- Diário de trabalho de cada instalação: `CLAUDE.local.md` (fica fora do GitHub). Aqui ficam só regras e decisões gerais.

## O que é
Base de dados de fontes (manuscritos, partituras, livros, gravações, instrumentos…) para musicologia, investigação
artística e ensino. Programa e dados vivem na pasta de instalação. Manual: `README.md`; instalação: `GUIA-INSTALACAO.md`.
- `app/bin/pocketbase` + `app/pb_data` (base de dados, cópias em `app/pb_data/backups`)
- `app/pb_hooks`, `app/pb_migrations` (esquema), `app/pb_public` (interface web, sem compilação)
- `app/worker/src` — serviço de fundo em Node: watch folder, capas (`capa.js`), IA local (`ia.js`,
  Ollama + `qwen3-vl:8b-instruct` em `app/modelos`), metadados online (`fontes_externas/`),
  importação (`importacao.js`), exportação CSL (`exportacao.js`), OCR, palavras-chave, imagens de
  páginas (`juntar.js`), duplicados (`duplicados.js`, `espaco_duplicados.js`), intensidade (`intensidade.js`).
- Arranque: `Iniciar TINCTORIS.command` → `app/iniciar.sh` (PocketBase :8090, serviço :8091, Ollama :11434,
  `caffeinate`); antes, procura atualizações no GitHub. Instalar: `instalar-tinctoris.sh` (ver o guia).
- Comandos: `app/biblioteca …` (`cli.js`) e ferramentas pontuais em `app/worker/src/*.js` (`--aplicar`).
- Testes automáticos: `cd app/worker && node --test testes/*.test.js`.

## Regras de segurança
1. **A biblioteca real pode estar a correr.** Nunca a parar, reiniciar ou mexer nos seus processos sem pedir.
   Alterações ao código só entram quando se reinicia (hooks com `--hooksWatch=false`); dizer sempre quando é preciso.
2. **Testar sempre num ambiente isolado**: PocketBase de teste em `127.0.0.1:8095`, serviço em `8096` (com
   `SERVICO_PORTA=8096` também no PocketBase de teste), pastas em `app/.teste/` (cópias APFS com `cp -c`). O serviço de
   teste corre como `node --no-deprecation src/index.js --teste`; para o parar usar **só**
   `pkill -f "src/index.js --teste"` e `pkill -f "http 127.0.0.1:8095"`. Nunca `pkill` genérico.
3. **Leituras da base de dados real:** `sqlite3 -readonly`. Escritas só através da app/API e com cópia de segurança antes.
4. Antes de ejetar um disco externo, o TINCTORIS tem de estar parado (fechar a janela do Terminal).
5. Nunca apagar ficheiros do utilizador: o que não é fonte vai para `nao_processados/`; duplicados para
   `biblioteca/_duplicados/` (o Lixo do Mac só pelo botão do ecrã Duplicados, depois de verificado).
6. **Mudanças em massa na base real** (comandos `--aplicar`): primeiro simulação com lista em
   `app/registos/…-simulacao-….txt`, mostrar, testar numa cópia em `app/.teste/`, só depois aplicar com cópia de
   segurança (`antes-…`) e lista do que foi feito.

## GitHub
- Repositório público `tinctoris-db/tinctoris`, ramo `main`. O `.gitignore` deixa fora fontes, base de dados, cópias,
  modelos, testes, registos, segredos (`app/.segredo`, `app/.servico.json`), `app/.so_local` e o `CLAUDE.local.md`.
  Nunca forçar a entrada de nada disso (`git add -f`).
- Alterações num ramo próprio com Pull Request; antes de juntar, teste no Mac do mantenedor numa cópia em `app/.teste/`
  e OK dele. Cada contribuição aceite entra nos créditos (`app/pb_public/creditos.json` → `CREDITOS.md`).
- **Atualizar**: o lançador vê se há versão nova no GitHub e pergunta antes; se sim, faz cópia da base
  (`app/pb_data/backups/antes-atualizar-….zip`), atualiza (`git merge --ff-only`) e, se mudaram as dependências, corre
  `npm install`. Recusa se houver alterações locais por registar ou se as versões divergirem. As migrações aplicam-se
  sozinhas no arranque.

## Preferências e decisões já tomadas
- **Nome e identidade (2/10/2026, versão beta):** TINCTORIS (Tratados, Inventários, Notação, Códices, Textos,
  Organologia, Registos, Iconografia e Sumários; EN: Treatises, …, Records, Iconography and Sources). Logótipo só
  tipográfico (maiúsculas espaçadas). Preto e branco, letra **Inter** (em `app/pb_public/fontes/`, sem internet).
  Selecionado = fundo e sombra cinzentos; **vermelho só para alertas** e o que precisa da intervenção do utilizador.
  Substitui a paleta bordeaux antiga. Não propor a paleta verde da Arte Minima (rejeitada: pior leitura).
  Só os nomes visíveis mudaram; pastas e comandos internos (`biblioteca/`, `app/biblioteca`, `BIBLIOTECA_*`) ficam.
- **Plano da beta (2/10):** testers instalam no seu Mac Apple Silicon colando uma linha no Terminal
  (`instalar-tinctoris.sh`: Homebrew → `git clone` do repositório público → `app/instalar.sh`; guia em
  `GUIA-INSTALACAO.md`), IA local opcional; interface PT/EN (EN depois de 10/10); repositório público novo na
  organização «tinctoris-db» (repositório tinctoris-db/tinctoris) licença AGPL-3.0-or-later, documentação CC BY-SA 4.0,
  «© 2026 Pedro Sousa Silva e contribuidores do TINCTORIS»; CITATION.cff + DOI Zenodo; comentários por botão → Google
  Forms (`app/pb_public/formulario.json`); erros automáticos só com consentimento (depois de 10/10).
- **Créditos:** fonte única `app/pb_public/creditos.json` (a app mostra-os em «Acerca e ajuda»); `node app/worker/src/creditos.js`
  gera o `CREDITOS.md`. A cada contribuição aceite, acrescentar nome + frase simples; o Pedro revê antes de cada versão.
- **Acesso pela rede:** com `app/.so_local` o PocketBase só escuta em 127.0.0.1 (o instalador cria-o; muda-se em
  Definições, aplica-se ao reiniciar). Sem o ficheiro continua aberto à rede local, com conta.
- Vias gratuitas primeiro; IA **local** (no Mac) para capas difíceis. IA paga (API) não foi adotada.
  Modelo: `qwen3-vl:8b-instruct`; o 32b foi comparado (30/9) e não é claramente melhor (2–5× mais lento,
  pouca memória livre). Não correr os dois ao mesmo tempo.
- Número permanente visível por fonte (`#0001`), pesquisável com "#123".
- Mendeley é a referência: PDFs associam-se às entradas importadas em vez de duplicar.
- Sem ecrã de entrada neste Mac (`POST /api/bib/sessao-local`, só IP local + Host/Origin locais); noutros
  aparelhos continua a pedir a conta.
- **Nome do ficheiro primeiro**: arquivo + cota no nome (ex.: `bguc_mm243`) → identidade sigla+cota, RISM
  primeiro, a IA só preenche o que falta; nome informativo manda sobre a leitura da IA. Abreviaturas
  confirmadas: BGUC = P-Cug, BPMP = P-Pm. Variantes equivalentes das siglas aceites (2/10): «P-BRd» = P-BRad, «P-Arouca»
  = P-AR, quando o RISM só tem uma sigla equivalente; sigla no início do nome que o RISM não reconhece = manuscrito com
  cota, por rever com nota (catálogos modernos recusados). Siglas P-Csc/P-Cs: confiar no RISM, com nota para confirmar.
  Sigla + cota no nome e a IA a dizer «impresso» sem impressor/editora, local, data de impressão nem fórmula de imprenta
  (2/10, `P-BRd_949`, #15445): fica «Manuscrito», com nota, por rever salvo identificação na PEM/Cantus/DIAMM/RISM ms.
  Não se aplica a cotas de impressos («Mus.pr.», «Res.», bsb/ark/purl) nem a fichas de catálogo ou feitas à mão.
- Fotografias/manuscritos nunca ficam «completo» por catálogos modernos (CrossRef, Open Library, OpenAlex,
  OpenAIRE, DataCite). O conteúdo dos manuscritos vem dos catálogos (a IA lê mal paleografia).
- Nº de catálogo lido pela IA só é aceite se estiver no nome/texto ou se a obra do IMSLP bater com o título;
  senão fica como sugestão em `metadados.catalogo_ia`.
- **A reanálise nunca esvazia um campo** nem troca título/compositor de catálogo por leitura da IA
  (`protegerReanalise` em `processador.js`). Regras de 2/10 (`regras_identificacao.js`): um registo cujo compositor
  contradiz o conhecido (nº de catálogo BWV/K./HWV…, ficha antiga, nome do ficheiro) não ganha; uma ficha já
  identificada num catálogo de fontes só troca de registo pelo mesmo compositor e a mesma obra (senão fica o antigo e
  a sugestão vai para a nota); um registo de manuscrito não identifica uma edição moderna (salvo sigla + cota no nome);
  forma e suporte contraditórios impedem «completo»; num trabalho académico o compositor do título é o assunto; a data
  mais precisa fica; uma ficha completa de catálogo/Mendeley continua completa (sugestões recusadas só deixam nota);
  uma edição moderna do IMSLP só sem data fica completa com nota.
- Data = a da fonte/edição que o Pedro tem; o ano das fotografias/digitalização vai para
  `metadados.data_fotografias`. O título deve dizer se é coleção, obra ou peça de uma coleção; compositor ≠
  impressor (o impressor vai para «editora»).
- O dono (Definições → «O seu nome», chave `nome_dono`; vários nomes separados por «;»; lido por `definicoes()` e
  usado por `eDoDono` em `config.js`): num PDF de digitalização não é autor; num PDF de editor de partituras
  (Finale, Sibelius…) é «editor»; em textos dele (Word/Pages) é autor. Sem nome, a app pede-o (boas-vindas).
- Imagens de páginas: «uma fonte por pasta»; originais intactos (sem compressão) em
  `biblioteca/_originais/<pasta>/`; a ficha tem um PDF de visualização (1600 px, JPEG 60%).
- Lotes MIDI: ficha própria por lote, ligada ao PDF da obra; o que herda do PDF fica sempre «por rever».
- Duplicados: só se juntam automaticamente os certos; os duvidosos vão para o ecrã **Duplicados**.
- Intensidade (página Atividade): Automático = ao carregador Máxima, a bateria Poupança. O Pedro aceita
  carga no Mac, só quer ser avisado se for demasiada.
- **Fontes históricas noutros catálogos** (decisão dele, 1/10): RISM, DIAMM e IMSLP primeiro; os outros só completam
  o que eles não deram (nunca substituem) ou identificam quando eles falham. Prioridade: folha inicial do PDF (exemplar:
  biblioteca, cota, identificador) → PEM → Cantus → Gallica/BnF → BSB → K10plus/DNB → BNP/PORBASE → Europeana; British
  Library, BNE e BPMP só com ligação (recusam acesso automático). Bases de compositores (modelo: Bach digital) também
  dão as «fontes conhecidas» da obra. Escritos académicos: também RCAAP e RECIPP; Google Scholar e JSTOR só ligação
  (os termos de uso proíbem pesquisa automática). Um catálogo de biblioteca que descreve o próprio exemplar (pelo
  identificador da folha inicial) ou que bate certo em título, compositor e data pode deixar a ficha «completa».
- Por fazer: ficheiros do Finale (`.mus`, `.musx`) só identificáveis pelo nome; GROBID só se ainda fizer falta.
- Sessões na nuvem: o `fetch` do Node só sai para a internet com `NODE_USE_ENV_PROXY=1` (no Mac não é preciso).
