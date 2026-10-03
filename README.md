# TINCTORIS

*Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários.* O nome homenageia
Johannes Tinctoris (c. 1435–1511), autor do *Terminorum musicae diffinitorium* (c. 1495), o primeiro dicionário musical
impresso. (Antes chamava-se «Biblioteca de Fontes».)

Base de dados pessoal de fontes para musicologia, investigação artística e ensino.
Inspirada no Zotero/Mendeley, mas adaptada a manuscritos, partituras, gravações,
instrumentos, fontes digitais, e a qualquer tipo novo que queira criar.

**Instalar (alunos e colegas, versão beta):** ver o [guia de instalação](GUIA-INSTALACAO.md) — uma linha no
Terminal de um Mac com processador Apple. Licença: [AGPL 3.0](LICENSE) (programa) e [CC BY-SA 4.0](LICENSE-docs.md)
(este manual); [créditos](CREDITOS.md); [como citar](CITATION.cff).

Tudo vive na pasta onde o TINCTORIS foi instalado (pode ser um disco externo):

```
TINCTORIS/
├── Iniciar TINCTORIS.command    ← duplo clique para começar
├── README.md                    ← este manual
├── watch_folder/                ← largue aqui ficheiros novos
├── nao_processados/             ← o que não é uma fonte (páginas web, ícones…)
├── biblioteca/                  ← ficheiros organizados automaticamente
│   ├── Livro/2003/2003-08-07_SUTCLIFFE_The-Keyboard-Sonatas-….pdf
│   ├── _por_rever/              ← ficheiros à espera da sua revisão
│   └── _duplicados/             ← cópias repetidas (pode apagar)
└── app/                         ← o programa (não é preciso mexer)
```

---

## 1. Começar e parar

**Começar:** faça duplo clique em **`Iniciar TINCTORIS.command`**. Abre-se uma
janela do Terminal (deixe-a aberta) e a biblioteca aparece no navegador em
<http://127.0.0.1:8090>.

**Parar:** feche essa janela do Terminal (ou carregue `Ctrl+C` nela).
**Pare sempre a biblioteca antes de ejetar o disco.**

Enquanto a biblioteca está a correr, o Mac não adormece (o ecrã pode apagar-se),
para o tratamento de muitos ficheiros não parar a meio.

> Na primeira vez, o macOS pode perguntar se o «pocketbase» pode aceitar ligações
> de rede. Responda **Permitir** se quiser usar a biblioteca no iPad ou no
> telemóvel. Se responder «Recusar», continua a funcionar neste computador.

**Primeira utilização:** a página pede para **criar a sua conta** (email e
palavra-passe). A conta fica só neste disco e impede que outras pessoas na rede
Wi-Fi abram a biblioteca. Por segurança, só pode ser criada no próprio Mac onde
o disco está ligado.

**Neste Mac não é preciso entrar:** a biblioteca abre diretamente com a sua conta. O
ecrã de entrada só aparece nos outros aparelhos (iPad, telemóvel), para que ninguém na
mesma rede Wi-Fi a possa abrir.

## 2. Acrescentar fontes

### a) Pela watch folder (automático)
Arraste ficheiros para a pasta **`watch_folder`**. Aceita PDFs, digitalizações
(JPG, PNG, TIFF…), áudio (MP3, WAV, FLAC…), vídeo (MP4, MOV…), partituras
digitais (MusicXML, MIDI, Dorico, Sibelius…) e outros. Para cada ficheiro, a
biblioteca:

1. **Verifica se é repetido:** se já existir (mesmo conteúdo, qualquer nome), vai
   para `biblioteca/_duplicados`.
2. **Lê o ficheiro**, pela ordem de confiança seguinte:
   - a capa do JSTOR, de onde tira o DOI;
   - a **capa do documento**, pelo tamanho e pela posição das letras (título,
     autor, ano; nas teses também o grau, o orientador e a instituição). Nas
     digitalizações usa o OCR para isto;
   - o nome do ficheiro, se vier do Mendeley ("Autor_Ano_Título");
   - os metadados escondidos do PDF, só se forem credíveis.
   Nas **partituras** (Finale, Sibelius…), as notas que vêm como caracteres
   ("œœœ") são postas de parte antes de ler o cabeçalho. Nas capas com texto
   "cifrado", a capa é lida por OCR.
3. **Se as regras não chegarem, a IA local lê a primeira página "como uma
   pessoa"** (ver secção 11). Diz o título, os autores e os seus papéis
   (compositor, arranjador…), o ano, o tipo, a instituição e o orientador, o
   número de catálogo e o instrumento.
4. **Vê se a obra já existe na biblioteca**, por exemplo porque foi importada do
   Mendeley. Se existir, **associa-lhe o ficheiro** em vez de criar uma fonte
   duplicada, tolerando gralhas no título.
5. **Se não existir, procura os metadados online**:
   - teses: primeiro o OpenAIRE (que inclui o RCAAP e o RIA da Universidade
     de Aveiro) e o **RECIPP** (repositório do Politécnico do Porto, com as teses da
     ESMAE: dá também a instituição e o orientador);
   - outros escritos: CrossRef, OpenAlex, Open Library, OpenAIRE, **Google Books** e
     RECIPP. O Google Scholar e o JSTOR não permitem pesquisa automática: ficam as
     ligações na ficha;
   - gravações: MusicBrainz, Apple Music, Deezer e YouTube;
   - partituras: IMSLP e RISM.
   - **fontes musicais antigas** (manuscritos, impressos anteriores a 1800, ou
     ficheiros com sigla RISM no nome): primeiro o **RISM** e o **DIAMM**; depois o
     **Cantus** e a **PEM** (cantochão) e, se nada servir, a **Gallica** (BnF) —
     ver "Manuscritos e impressos antigos", mais abaixo.
6. **Gera palavras-chave**:
   - as do próprio autor, se o documento as tiver ("Palavras-chave:",
     "Keywords");
   - senão, as do repositório;
   - senão, as da IA local;
   - senão, calculadas a partir do texto.

   Aparecem na lista, por baixo de cada fonte; clicar numa delas pesquisa-a.
7. **Renomeia e move o ficheiro** para `biblioteca/`, por exemplo
   `Livro/2003/2003_SUTCLIFFE_The-Keyboard-Sonatas.pdf`.
   Se a identificação não for segura, o ficheiro vai para `_por_rever`.
8. **Faz OCR** (reconhecimento de texto), mas **só depois de a fonte estar
   identificada** e **nunca em partituras** (o OCR lê texto, não notas). Assim o
   Mac não fica ocupado durante horas com documentos ainda por rever.
   segundo plano, para poder pesquisar dentro deles.

O ficheiro é **movido**, não copiado: a `watch_folder` fica vazia, e as pastas
que lá largou são apagadas quando ficam vazias.

**Manuscritos e impressos antigos.** A biblioteca aproveita o nome do ficheiro:
- **data no início**: `1538 …`, `1580-1590 …`, `c1520 …`, `17xx …` (fica
  "séc. XVIII" e vai para a pasta `17xx`), `séc. XVI …`;
- **sigla RISM + cota**: `E-Tuy L I`, `P-Cug MM 37`, `D-Mbs Mus.ms. 34`. A sigla
  é confirmada no RISM (assim `G-Dur` ou `I-XII` nunca contam como bibliotecas)
  e preenche o arquivo, a cidade e a cota;
  **variantes** da sigla também servem quando o RISM só tem uma equivalente: `P-BRd`
  (abreviatura) é lida como P-BRad, `P-Arouca` (nome da cidade) como P-AR; a nota da ficha
  diz que sigla foi lida. Uma sigla no início do nome que o RISM não reconhece
  (`P-Ev_alegria_cod_1`, que pode ser P-EVc, P-EVp…) faz da ficha um manuscrito com a
  cota do nome, **por rever** com nota; os catálogos de livros modernos não contam;
- **compositor** a seguir à data (`1502 Josquin …`, `1410_Fernand Estevan_…`);
- **fólios** (`fol 34v`) e palavras como `Ms`, `manuscrito`, `codex`.

A IA local diz também se a página é **manuscrita ou impressa**. Depois:
- **com sigla + cota**, o manuscrito é procurado pela cota no RISM e no DIAMM
  (identificação quase exata: datação, suporte, dimensões, notação);
- **impressos**: o RISM é consultado pelo ano, compositor e título na fonte; quando
  encontra, preenche o **nº RISM** (A/I ou B/I, ex.: `RISM B/I 1538/4`), o
  impressor, o local, o título uniformizado e os exemplares conhecidos;
- manuscritos ficam com o tipo **Manuscrito** e natureza **primária**, e não
  passam pelo OCR (não lê letra manuscrita);
- um manuscrito sem título legível fica identificado pela sigla e cota
  (`E-TUY L I`);
- nas **coletâneas**, a lista das obras e dos compositores vem do RISM
  (campos "Conteúdo" e "Compositores no conteúdo");
- **exemplar digitalizado**: a mesma edição sobrevive muitas vezes em vários
  exemplares, em várias bibliotecas. Quando o PDF começa com a página da biblioteca
  digital, a app regista **qual é o seu exemplar**: biblioteca, cota, identificador
  permanente (URN, ark, purl) e ligação para a digitalização (ex.:
  `Bayerische Staatsbibliothek (D-Mbs), 4 Mus.pr. 56#Beibd.7`). Reconhece a BSB,
  a BnF/Gallica, a ÖNB, a Staatsbibliothek de Berlim, a SLUB Dresden, Wolfenbüttel,
  Göttingen, a Vaticana, a British Library, a Bodleian, a Library of Congress, a BNE,
  a BNP (purl.pt), a BPMP, a Biblioteca Geral de Coimbra, a Biblioteca Pública de
  Évora, a Estense, o Museo della Musica de Bolonha, a KB, a Biblioteca Real
  dinamarquesa, a Biblioteka Narodowa, o e-rara e o e-codices. O identificador
  também serve quando vem no nome do ficheiro ou das imagens (`bsb00016944_00001.jpg`,
  `btv1b52500918r.pdf`). Sem identificador: nos PDFs da **Gallica** que só dizem «Source
  gallica.bnf.fr», a app procura na Gallica pelo título, autor e ano da folha inicial e da
  notícia, e só aceita um resultado único (o ano é o da edição, não o da morte do autor; se
  o título estiver estragado, tenta só o autor e o ano, ou, num registo sem data no
  catálogo, o mesmo título e o mesmo fundo); nos PDFs antigos da **BSB** que só trazem a cota
  («4 Mus.pr. 109#Beibd.3»), encontra a digitalização pela cota exata (através da Europeana).
- **registo do exemplar no catálogo** (por agora, Gallica/BnF, BSB e BNP/purl.pt): com o
  identificador, a app vai buscar o registo exato do exemplar: título, autores,
  imprenta, a **proveniência** (antigos possuidores, quando o catálogo a tem), a
  ligação para o registo no catálogo e os **outros exemplares** da mesma edição
  nessa biblioteca. Se o RISM tiver várias edições parecidas (ex.: o 1.º e o 2.º
  livro de missas do mesmo ano), o exemplar ajuda a escolher a certa. Se o RISM e
  o DIAMM não encontrarem a fonte, o registo do exemplar identifica-a.
- **cantochão (Cantus e PEM)**: com sigla + cota, a app procura a fonte no
  **Cantus Index**, que lista as fontes de onze bases (Cantus Database, PEM —
  Portuguese Early Music Database —, Musica Hispanica…). Da **Cantus Database** e da
  **PEM** vêm a datação, a origem e a proveniência, o conteúdo litúrgico, a notação,
  o suporte e as dimensões; o campo «Noutras bases» guarda as ligações para a fonte
  em cada base e o número de cânticos inventariados. O RISM e o DIAMM continuam
  primeiro: o Cantus e a PEM só acrescentam o que eles não deram. Quando a sigla e a
  cota vêm do **nome do ficheiro**, o Cantus e a PEM são consultados mesmo que a IA
  tenha lido a fonte como impressa (uma capa vazia engana-a); se a PEM ou o Cantus
  tiverem a fonte, a ficha fica «Manuscrito», com a nota «A IA leu como impresso; a
  PEM descreve um manuscrito». Se a IA disser «impresso» sem nenhum sinal de impressão
  (sem impressor/editora, local nem data de impressão, sem fórmula de imprenta como
  «apud», «typis», «appresso») e a cota não for de um impresso («Mus.pr.», «Res.», bsb,
  ark, purl), a ficha fica logo «Manuscrito» com nota (ex.: `P-BRd_949_antifonario`),
  com o título «sigla cota — resto do nome», e **por rever** salvo se a PEM, o Cantus,
  o DIAMM ou um registo de manuscrito do RISM a identificarem.
- **bases de compositores** (por agora, o **Bach digital**): numa partitura ou num
  manuscrito com número de catálogo (BWV), o campo «Fontes conhecidas da obra» lista
  todas as fontes que a base conhece dessa obra: arquivo e cota, autógrafo ou cópia,
  datação, em português (ex.: `D-B Am.B 51 — manuscrito coletivo, cópia, 2.ª metade do
  séc. XVIII (c. 1760–1789)`). Num manuscrito com sigla + cota que esteja no Bach digital, vêm o copista,
  a datação, as dimensões e a **cadeia de possuidores** (proveniência). Outras bases de
  compositores entram da mesma maneira (uma entrada nova em `compositores.js`).
- **Gallica**: se nem o RISM nem o DIAMM identificarem uma partitura ou um
  manuscrito, a app procura na Gallica (compositor, título e ano). O exemplar da BnF
  fica nos «Exemplares conhecidos».
- **K10plus** (catálogo comum de Berlim, Göttingen, Wolfenbüttel, Halle, Dresden,
  Stuttgart…): impressos que nem o RISM, nem o DIAMM, nem a Gallica identificaram,
  quando se sabe o ano. Dá o número **VD16/VD17/VD18** e as cotas dos exemplares nessas
  bibliotecas («Outros exemplares»).
- **Europeana**: depois de identificado um impresso, a app procura as **outras
  digitalizações da mesma edição** noutras bibliotecas europeias (mesmo ano, título
  praticamente igual) e lista-as em «Outras digitalizações da mesma edição». Usa a
  chave pública de demonstração; em **Definições** pode pôr uma chave própria
  (gratuita, em europeana.eu).
- **BNP/PORBASE**: o catálogo da BNP não aceita pesquisas automáticas; na ficha há uma
  ligação «BNP» para pesquisar à mão. Os PDFs da Biblioteca Nacional Digital (purl.pt)
  são reconhecidos e ficam com a cota do exemplar digitalizado.

**Títulos normalizados das obras.** Quando uma partitura (ou manuscrito de uma obra)
tem número de catálogo (BWV, BuxWV, HWV, RV, TWV, K., Hob., Z., op.…), a app vai
buscar ao **IMSLP** o título normalizado, em inglês: "SONATA IV" + "BWV 528, 2"
→ *Organ Sonata No.4 in E minor, BWV 528*. O título impresso fica em "Título na
fonte"; a tonalidade, a data de composição e a ligação à obra no IMSLP também são
guardadas. Por prudência, o título **não** muda quando: o título da ficha tem outro
número de catálogo, outra tonalidade, outro número de obra ("No. 6" ≠ "No.2"), é de
outro género, é um andamento de dança que não existe na obra, ou é uma coleção.
Para as fichas antigas: `./biblioteca titulos-obras` mostra o que mudaria;
`./biblioteca titulos-obras --aplicar` grava (com cópia de segurança antes).

**Números de catálogo lidos pela IA.** A IA local às vezes inventa um número (sobretudo
"BWV 1047") quando não o vê na página. Por isso, o número que ela dá só conta se estiver
escrito no nome do ficheiro ou no texto do documento, ou se a obra correspondente no IMSLP
bater com o título impresso (mesmo género, tonalidade, palavras ou andamento em comum). Caso
contrário fica no campo «Nº de catálogo sugerido pela IA (não confirmado)», sem mudar o
título. O nome do ficheiro também conta: "Cantata nº 093.pdf" de Bach é a BWV 93.
`./biblioteca rever-catalogos` aplica esta verificação às fichas antigas (mostra primeiro;
`--aplicar` grava, com cópia de segurança antes).

`--excluir 12451,1098` deixa essas fichas como estão (por exemplo, quando o número de
catálogo guardado na ficha está errado).

**Vários ficheiros numa só fonte** (livros de partes, obras em vários volumes). Na ficha,
secção **Ficheiros** → **Juntar outras fichas a esta…** e indique os números (ex.:
`23, 24-47`). Os ficheiros dessas fichas passam para esta (com o rótulo no fim do nome:
`…_B.doc`, `…_Cantus.pdf`), tal como as notas de leitura e as etiquetas; essas fichas
deixam de existir, mas **nenhum ficheiro é apagado**. É feita uma cópia de segurança
antes. Cada ficheiro abre-se clicando no seu rótulo; **(separar)** devolve um ficheiro a
uma ficha própria, por rever. No terminal: `./biblioteca juntar 22 23-47`.
Um ficheiro repetido de um desses volumes, largado na watch folder, vai para
`_duplicados`.

**Word antigos (.doc, Word 97–2003):** os que o macOS não consegue ler são lidos pelo
módulo `word-extractor` (instalado com a biblioteca, não precisa de nada no Mac).

Uma fonte só fica **completa** com título, autor (ou «Anónimo» / «Vários») e
data (pelo menos aproximada). Caso contrário vai para «Por rever».

**Imagens de páginas soltas** do mesmo documento, na mesma pasta e com o mesmo
nome base ("matteo 1.jpeg", "matteo 2.jpeg"…; "bsb00016944_00001.jpg"…), são
**juntadas num só PDF** com várias páginas e ficam com uma só ficha. As imagens
originais ficam guardadas em `nao_processados/imagens_juntadas/`.

**Proteções:**
- **O que não é uma fonte vai para `nao_processados/`**, com a mesma estrutura
  de pastas: páginas web (.htm), ícones e imagens pequenas, ficheiros de
  sistema.
- **Muitos ficheiros de uma vez:** se entrarem mais de 300 documentos, a
  biblioteca faz uma pausa e pede confirmação (aviso no topo da página).
- **Trabalho interrompido:** se a biblioteca for fechada a meio de uma reanálise,
  as fontes que ficaram «A processar» voltam para a fila no arranque seguinte.
  Os ficheiros novos da `watch_folder` e as fichas reanalisadas à mão (botão
  **Reanalisar**) passam sempre à frente dessas reanálises. Em **Atividade** o
  cartão mostra os dois números: "Novos" e "Reanálise".
- **Ritmo das pesquisas online:** os serviços online não são sobrecarregados. Se
  um deles recusar pedidos, fica em pausa 10 minutos.

### b) Importar do Mendeley ou do Zotero
No menu, **Importar (Mendeley, Zotero)** → **Escolher ficheiro…** e indique o
ficheiro `.bib` (ou `.ris`). Primeiro aparece um **resumo**, e nada é gravado
até carregar em «Importar»:

- **Repetições** (dentro do ficheiro ou já na biblioteca) são detetadas e
  ignoradas. O que só existia numa repetição (por exemplo o DOI ou o ano) é
  aproveitado.
- **Tipos mal classificados** pelo Mendeley são corrigidos quando é evidente
  (por exemplo, um «livro» com revista, volume e número passa a Artigo).
- **Títulos que são nomes de ficheiro** (`Bent_2002_Counterpoint…`,
  `GAULDIN - A Practical Approach…`) são separados em autor, ano e título.
- **Fontes que já estão na biblioteca** (por exemplo, vindas da watch_folder)
  não são duplicadas: **são completadas com os dados do ficheiro**. Se estavam
  «por rever», os dados do Mendeley substituem os palpites lidos do PDF. A ordem
  (importar primeiro ou largar os ficheiros primeiro) não importa.
- **Referências incompletas** (sem autor ou sem data) ficam em «Por rever».
  Com a opção «Procurar online o que falta», a biblioteca só completa sozinha
  quando o autor coincide, para não confundir um livro com uma recensão desse
  livro. Nos outros casos guarda sugestões para escolher.
- Se o ficheiro trouxer **anotações** do Mendeley, passam a notas de leitura;
  as **pastas** do Mendeley passam a etiquetas; e os **PDFs anexados**, se
  existirem neste computador, são copiados para a biblioteca.

> O Mendeley Reference Manager (versão atual) não inclui PDFs, anotações nem
> pastas no ficheiro .bib: só os dados bibliográficos. Os PDFs podem depois ser
> largados na watch_folder.

### c) À mão
Clique em **+ Nova fonte**. Útil para instrumentos, espetáculos, fontes sem
ficheiro, ou para registar algo rapidamente.

## 3. Rever fontes («Por rever»)

Quando a biblioteca não tem a certeza da identificação (por exemplo, há várias
gravações com o mesmo título, ou é um manuscrito sem correspondência online), a
fonte aparece em **Por rever**, com um número no menu. Para cada uma:

- **Escolha uma sugestão** («Usar esta»). Cada sugestão mostra de onde vem e a
  percentagem de confiança.
- ou **preencha à mão** os campos;
- ou carregue em **Pesquisa aprofundada** para consultar *todas* as fontes:
  CrossRef, OpenAlex, Open Library, Google Books, Zenodo, DataCite, HAL,
  Semantic Scholar, Internet Archive, RECIPP, RISM, IMSLP, Gallica, MusicBrainz, Apple Music,
  Deezer e YouTube.

Depois carregue em **Guardar e confirmar**: o ficheiro é renomeado e arrumado na
pasta certa.

**Reanalisar:** na ficha de uma fonte com ficheiro, **Reanalisar ficheiro** volta
a identificá-la com as regras e a IA local mais recentes. A reanálise **não estraga uma ficha
boa**: uma ficha completa que veio de um catálogo (RISM, IMSLP…) ou do Mendeley continua
completa; só troca de registo se o novo for da mesma obra e do mesmo compositor (senão o
novo fica como sugestão na nota para rever); a data mais precisa fica («2019-07-17» não
passa a «2019»); e, numa tese ou artigo, o compositor que aparece no título não passa a
autor. Um registo do compositor errado (por exemplo, anónimo numa obra BWV) ou de um
manuscrito para um PDF que é uma edição moderna não é aceite. Em **Por rever**, o
botão **Reanalisar todas** faz o mesmo a todas as fontes por rever que têm
ficheiro, depois de uma cópia de segurança.

Na ficha de cada fonte há também ligações para procurar no **JSTOR** e no
**Google Scholar**, que não permitem pesquisa automática, e ainda no WorldCat, no
RISM, no IMSLP, no Cantus, na BNP, na Europeana e no Internet Archive.

### Duplicados (PDFs quase iguais)

Os ficheiros **exatamente iguais** nunca chegam a ter ficha: vão logo para
`_duplicados`. Os **quase iguais** (o mesmo PDF gravado de novo, com outro nome, uma
capa ou uma página em branco a mais) são procurados pelo comando
`./biblioteca duplicados`, que compara o aspeto das páginas (1.ª, 2.ª, 3.ª, do meio e
últimas, e depois em alta resolução, para não confundir partes diferentes da mesma peça):

- **Cópias certas** (mesmo nº de páginas, todas as páginas comparadas iguais):
  `./biblioteca duplicados --aplicar` junta-as. Fica a ficha mais completa (completa
  antes de «por rever», com notas de leitura, autor, data…); da outra passam as notas de
  leitura, etiquetas, contextos, o nome do ficheiro e o texto integral (se faltar). O
  ficheiro repetido vai para `_duplicados` (nunca é apagado) e a ficha repetida deixa de
  existir; a que fica guarda o número e o título da retirada (`duplicados_retirados`).
  Cópia de segurança antes; fichas «A processar» ficam para a vez seguinte.
- **Duvidosos** (muito parecidos, ou com páginas a mais): menu **Duplicados**. Um par de
  cada vez, os dois PDFs lado a lado: **Ficar com esta ficha** (a outra é retirada como
  acima), **São diferentes** (não voltam a aparecer) ou **Saltar**.

**Espaço ocupado pelos duplicados.** Quando a pasta `_duplicados` passa de **10 %** do
espaço das fontes, aparece um aviso no topo da página. No ecrã **Duplicados**, secção
«Espaço ocupado pelos duplicados»:
- **Verificar agora** compara o conteúdo de cada ficheiro de `_duplicados` com a biblioteca
  (a primeira vez demora alguns minutos).
- **Seguros** (têm uma cópia exatamente igual numa ficha ou em `_originais`, ou são PDFs
  quase iguais já juntados): **Pôr no Lixo do Mac**. Cada um é confirmado outra vez antes
  de sair; ficam no Lixo numa pasta «Duplicados AAAA-MM-DD …» e podem ser recuperados até
  esvaziar o Lixo. Nada é apagado de vez pela biblioteca.
- **Por ver** (sem cópia igual): lista com os **maiores primeiro**; para cada um, **Abrir**,
  **Mostrar no Finder**, **Pôr no Lixo**, **Devolver à biblioteca** (volta à watch folder e
  fica com ficha própria) ou **Manter**.

## 4. Notas de leitura

Na ficha de cada fonte, secção **Notas de leitura** → **+ Nova nota**. Cada nota tem:

- **Localização:** página, fólio (`fól. 3v`) ou minutagem (`12:30`);
- **Tipo:** Citação, Paráfrase, Comentário, Ideia ou Pergunta;
- **Texto**, **etiquetas** e **contexto/UC**.

A página **Notas de leitura** reúne as notas de todas as fontes, com pesquisa e
filtros. **Exportar estas notas** produz um ficheiro Markdown com a referência
bibliográfica de cada fonte no estilo escolhido, pronto para abrir no Word, no
Obsidian ou no Notion.

## 5. Pesquisar

Cada fonte tem um **número permanente** (#0001, #0002…), que nunca muda nem se
repete. Aparece na lista e na ficha. Escreva **#123** na pesquisa para ir
diretamente a essa fonte. Serve também para etiquetar exemplares físicos ou para
citar a fonte nas suas notas.


A caixa de pesquisa procura **em tudo ao mesmo tempo**: títulos, autores,
editoras, campos específicos, etiquetas, notas de leitura e **texto integral**
dos documentos (incluindo o texto obtido por OCR).

- Acentos e maiúsculas são ignorados: `evora` encontra «Évora».
- Palavras incompletas também servem: `polif` encontra «polifonia».
- Para uma expressão exata, use aspas: `"basso continuo"`.
- O botão **Filtros** permite filtrar por autor, título, tipo, contexto/UC,
  natureza (primária/secundária), estado, intervalo de anos e etiqueta.
- **Ordenar por**, por cima da lista: mais recentes, título, autor (pelo
  apelido) ou data, em ordem crescente ou decrescente. Numa pesquisa por texto
  há também «Relevância». A ordem é a de um catálogo: ignora maiúsculas,
  acentos e artigos iniciais («The Birth of the Orchestra» fica no B), e as
  fontes sem autor ou sem data ficam sempre no fim. A última ordem escolhida
  fica memorizada.

## 6. Exportar bibliografias

Em **Fontes**, selecione as fontes (ou não selecione nenhuma para exportar todas
as da pesquisa atual) e carregue em **Exportar bibliografia**. Escolha:

- **Estilo:**
  - APA 7;
  - Chicago 18, autor-data ou notas e bibliografia;
  - MLA 9;
  - Harvard (Cite Them Right);
  - ABNT;
  - **NP 405**, a norma portuguesa.
- **Língua dos termos:** português («Em», «s.d.», «Disponível em») ou inglês.
- **Formato:**
  - texto;
  - HTML;
  - **RTF**, que abre no Word com os itálicos;
  - BibTeX;
  - RIS (Zotero, Mendeley, EndNote);
  - CSL-JSON.

**Copiar** leva a bibliografia já formatada para colar no Word. **Descarregar**
grava um ficheiro.

Para acrescentar outros estilos, descarregue o ficheiro `.csl` em
<https://www.zotero.org/styles> e coloque-o em `app/estilos/`. Aparece na lista
no arranque seguinte.

> Alguns estilos omitem certos tipos de fonte quando falta informação. Por
> exemplo, o Chicago não lista manuscritos sem o campo «Arquivo» preenchido.

## 7. Tipos de fonte e campos (esquema extensível)

A página **Tipos de fonte** traz 28 tipos já prontos: manuscrito, edição crítica,
partitura, livro, artigo, carta, programa de concerto, legislação, gravação,
registo de ensaio, disco, instrumento histórico, tecnologia, base de dados, etc.

- **Novo tipo:** dê-lhe um nome, uma categoria, o «tipo para citações» (define
  como aparece na bibliografia) e os campos próprios.
- **Campos:** cada campo tem um nome, o tipo de valor (texto, número, data,
  lista de opções…) e, opcionalmente, a correspondência na citação (por exemplo,
  «Cota» → Cota; «Revista» → Publicado em).
- Também pode criar um campo **diretamente na ficha de uma fonte** (**+ Novo
  campo**), só para essa fonte ou para todas as do mesmo tipo.

O campo **Contexto / UC** (Leitura e Interpretação de Fontes, Pesquisa Avançada
em Música, Projeto Artístico e Tese, Ensino, Produção artística) existe em todas
as fontes e notas, e serve para filtrar por finalidade.

## 8. Usar no iPad, telemóvel ou outro computador

Com a biblioteca a correr, abra **Atividade**: lá aparece o endereço para a rede
de casa (por exemplo `http://192.168.1.69:8090`). Abra-o no navegador de
qualquer dispositivo ligado à **mesma rede Wi-Fi** e entre com a sua conta. A
biblioteca não fica acessível a partir da internet.

## 9. Definições

- **Padrão do nome do ficheiro:** por omissão `{data}_{AUTOR}_{Titulo}`. Também
  pode usar `{ano}`, `{autor}`, `{tipo}`, `{natureza}`, `{contexto}` e
  `{editora}`.
- **Padrão das subpastas:** por omissão `{tipo}/{ano}`. Por exemplo,
  `{natureza}/{tipo}` arruma em Primárias/Secundárias.
- **OCR:** ligar/desligar e escolher as línguas. Menos línguas torna o OCR mais
  rápido.
- **Metadados automáticos:** ligar/desligar e definir a confiança mínima para
  aceitar sem rever (por omissão, 80%).
- **Chaves opcionais:**
  - **YouTube:** chave gratuita, obtida no Google Cloud Console → «YouTube Data
    API v3». Sem ela, a pesquisa no YouTube fica desligada.
  - **Semantic Scholar:** sem chave, esta fonte responde muitas vezes «demasiados
    pedidos».
  - **Email de contacto:** faz o CrossRef, o OpenAlex e o MusicBrainz darem
    prioridade aos seus pedidos.
  - **Europeana:** chave gratuita (europeana.eu → API). Sem ela, usa-se a chave
    pública de demonstração, que pode recusar pedidos quando há muitos.
  - **Google Books:** sem chave, a quota partilhada está quase sempre esgotada, e o
    Google Books só entra na «Pesquisa aprofundada»; com chave, também na pesquisa
    automática dos livros. Para a obter: entrar em <https://console.cloud.google.com>
    com uma conta Google, criar um projeto, ativar a «Books API» (em «APIs e serviços»)
    e, em «Credenciais», carregar em «Criar credenciais» → «Chave de API». Copiar a
    chave para **Definições → Chave Google Books**.

## 10. Cópias de segurança

- A base de dados faz **uma cópia automática de hora a hora**, enquanto a
  biblioteca está a correr, e guarda as últimas 48. Faz também uma cópia
  **antes de cada importação** e **antes de reler a biblioteca**. As cópias ficam em
  `app/pb_data/backups`. Pode também criar uma cópia a qualquer momento em
  **Definições → Painel de administração → Settings → Backups**.
- **Muito importante:** estas cópias ficam no mesmo disco. De vez em quando,
  copie a pasta `app/pb_data` (a base de dados, incluindo as notas) e a pasta
  `biblioteca` (os ficheiros) para **outro disco** ou para a nuvem.

## 11. IA local (no próprio Mac)

A biblioteca usa um modelo de IA que corre **no próprio Mac** (Qwen3-VL, através
do programa Ollama). É **gratuito e privado**: não precisa de conta nem de chave,
e nada sai do computador. O modelo está em `app/modelos` (cerca de 6 GB) e é
ligado e desligado com a biblioteca.

- Só é usada quando as regras e os identificadores (DOI, ISBN, capa do JSTOR)
  não chegam.
- Leva **~15 segundos por documento**, em segundo plano.
- A leitura da IA é confirmada pelo próprio texto do documento: se o título
  lido existir mesmo na página, a fonte fica completa; senão, fica «por rever»
  com os dados já preenchidos.
- Liga-se e desliga-se em **Definições → IA local**. O estado aparece em
  **Atividade**.

## 12. Comandos de terminal (opcional)

Com a biblioteca a correr, no Terminal, dentro da pasta `app`:

```bash
./biblioteca estado
./biblioteca adicionar
./biblioteca exportar --estilo apa --formato rtf --contexto "Ensino" --saida ensino.rtf
./biblioteca exportar --pesquisa "Scarlatti" --formato bibtex
./biblioteca estilos
./biblioteca reindexar
./biblioteca titulos-obras [--aplicar] [--excluir 12,345]
./biblioteca juntar 22 23-47
./biblioteca duplicados [--aplicar]
./biblioteca testar-catalogos [--guardar]
```

`testar-catalogos` vê se os catálogos online (RISM, DIAMM, Gallica, BnF, BSB, BNP,
K10plus, Europeana, Cantus, PEM, Bach digital, RECIPP, Google Books) respondem a partir deste Mac. Não mexe na base de dados e não precisa da biblioteca
a correr.

## 13. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| A página não abre | Se o TINCTORIS está num disco externo, confirme que está ligado; depois faça duplo clique em `Iniciar TINCTORIS.command`. |
| «O serviço de fundo não está a responder» | Feche a janela do Terminal e volte a iniciar. |
| Um ficheiro ficou na watch_folder | Veja o erro em **Atividade → Registo**. Os registos completos estão em `app/registos/`. |
| A pesquisa não encontra algo que existe | **Definições → Reconstruir índice de pesquisa**. |
| Ficheiros em `biblioteca/` sem ficha (por exemplo, depois de restaurar uma cópia) | **Definições → Reler os ficheiros da biblioteca**. |
| A base de dados deu erro | Pare a biblioteca e restaure a última cópia em **Definições → Painel de administração → Settings → Backups**. |
| Mudou de computador | Ligue o disco e corra uma vez `app/instalar.sh` no Terminal. |

---

## Notas técnicas

- **Motor:** PocketBase (SQLite + API REST, binário único, em `app/bin`),
  servido em `0.0.0.0:8090`. Todas as coleções exigem sessão de superutilizador.
- **Esquema** (`app/pb_migrations`):
  - `tipos_fonte`: definição dos campos em JSON;
  - `fontes`: campos comuns em colunas, campos específicos em `metadados` (JSON);
  - `notas_leitura`;
  - `textos`: texto integral;
  - `definicoes`.

  O desenho é portável para Postgres: os campos JSON passam a JSONB, e o índice
  FTS5 é um índice derivado que corresponde a `tsvector` com `unaccent`.
- **Pesquisa em texto completo:** tabela SQLite FTS5 `fontes_fts`
  (`unicode61 remove_diacritics 2`), mantida por hooks em `app/pb_hooks`.
  Pesos: título > autores > notas > outros > texto.
- **Serviço de fundo** (`app/worker`, Node.js), organizado por função:

  | Ficheiro | Função |
  |---|---|
  | `src/pb.js` | base de dados |
  | `src/index.js`, `src/processador.js` | monitorização da watch folder |
  | `src/ficheiros.js` | organização e nomes dos ficheiros |
  | `src/extracao.js` | extração de texto e identificadores |
  | `src/fontes_externas/` | enriquecimento de metadados (bibliográficas, académicas, audiovisuais; `musicologicas.js`: RISM e DIAMM, e a ordem das fontes antigas) |
  | `src/fontes_externas/bibliotecas_digitais.js` | bibliotecas reconhecidas pela folha inicial do PDF (sigla, sinal, identificador, ligação); para acrescentar uma biblioteca, uma linha nova |
  | `src/fontes_externas/gallica.js`, `bsb.js` | registo do exemplar (Gallica + catálogo da BnF em UNIMARC; BSB: manifesto IIIF + MARC21) e pesquisa na Gallica (SRU) |
  | `src/fontes_externas/repositorios.js` | repositórios institucionais em DSpace 7 (RECIPP); para acrescentar outro, uma linha em `REPOSITORIOS` |
  | `src/fontes_externas/bnp.js`, `k10plus.js`, `europeana.js` | BNP (páginas purl.pt), K10plus (SRU, MARC21: VD16/17/18, exemplares) e Europeana (outras digitalizações) |
  | `src/fontes_externas/compositores.js`, `bach_digital.js` | bases de compositores: fontes conhecidas de cada obra e descrição de cada fonte (Bach digital: Solr em `/api/v1/search`, registos em `/api/v1/objects`) |
  | `src/fontes_externas/cantus.js`, `pem.js` | Cantus Index (lista das fontes por país), Cantus Database (`json-node`) e páginas das fontes da PEM |
  | `src/fontes_externas/xml.js` | leitura simples de XML (SRU, OAI, MARC) sem dependências |
  | `testes/` | testes sem internet (`node --test testes/*.test.js`), com exemplos inventados |
  | `src/fontes_externas/obras.js` | títulos normalizados de obras pelo nº de catálogo (IMSLP) |
  | `src/musica_antiga.js` | pistas do nome do ficheiro para fontes antigas (data, sigla + cota, fólios) |
  | `src/ocr.js` | OCR e indexação (Tesseract + Poppler) |
  | `src/exportacao.js` | exportação (citation-js + estilos CSL em `app/estilos`) |
  | `src/servidor.js` | API interna em `127.0.0.1:8091`, acessível através de `/api/bib/servico/*` |

- **IA local:** `src/ia.js` (Ollama em `127.0.0.1:11434`, modelo em
  `app/modelos`, ligado pelo `iniciar.sh`).
- **Leitura de capas:** `src/capa.js` (layout com `pdftotext -bbox-layout` ou
  TSV do Tesseract; partituras, texto cifrado, JSTOR, teses em várias línguas,
  palavras-chave do autor); palavras-chave calculadas em `src/palavras.js`.
- **Interface:** `app/pb_public`, em HTML, CSS e JavaScript simples, sem passo
  de compilação.
- **Importação:** `src/importacao.js` (BibTeX/RIS via citation-js; deteção de
  repetições por DOI, ISBN e título compacto com anos compatíveis).
- **Ainda não incluído:** acesso fora de casa e partilha com outras pessoas.
