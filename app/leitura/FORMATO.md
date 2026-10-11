# Cópia de leitura do TINCTORIS — formato dos dados (contrato)

Cópia só de leitura da biblioteca num disco externo (exFAT), que se abre com duplo clique em qualquer
computador (Mac ou Windows), sem instalar nada e sem servidor (`file://`). Pedido do Pedro, 5/10/2026.

Duas peças, que só se falam por este formato:
- **Exportador** (`app/worker/src/exportar_leitura.js`): lê a base e a pasta `biblioteca/` (só leitura) e escreve no destino.
- **Página** (`app/leitura/`): lê os dados escritos pelo exportador e mostra Fontes e Notas de leitura.

## 1. Estrutura no destino

O Pedro escolhe uma pasta no disco externo (ex.: `/Volumes/DISCO/TINCTORIS`). Dentro dela:

```
TINCTORIS/
  Abrir TINCTORIS.html          ← duplo clique (cópia de app/leitura/index.html)
  LEIA-ME.txt                   ← 5 linhas em PT: o que é, como abrir, data da exportação
  .tinctoris-leitura.json       ← marca + registo da sincronização (só o exportador lê; ver §5)
  .tinctoris-leitura.bloqueio   ← só enquanto um exportador está a escrever (ver §5)
  leitura/                      ← cópia de app/leitura/ (sem index.html nem FORMATO.md)
    leitura.js  estilo.css  fontes/InterVariable*.woff2  fontes/Inter-OFL.txt
  dados/
    fichas.js                   ← todas as fichas + notas de leitura (§2)
    texto/bloco-0001.js …       ← texto integral (OCR), em blocos (§3)
  biblioteca/                   ← os ficheiros, com o MESMO caminho relativo que têm na Rocinante
    Partitura/1771/…pdf
    _por_rever/…
    _originais/<pasta>/…jpg
```

Fica de fora: `biblioteca/_duplicados/` e qualquer ficheiro que não pertença a uma ficha.

**Nomes**: todos os caminhos (no disco de destino e dentro dos dados) em Unicode **NFC**
(`s.normalize('NFC')`). O Mac guarda muitas vezes em NFD; o Windows não normaliza, por isso a ligação da
página só encontra o ficheiro se os dois estiverem na mesma forma. O exportador escreve o ficheiro de destino
com o nome NFC, venha de onde vier.

## 2. `dados/fichas.js`

Um script (não JSON: `file://` não deixa usar `fetch`). Uma só atribuição:

```js
window.TINCTORIS_DADOS = { … }
```

```jsonc
{
  "formato": 1,                         // versão deste contrato
  "exportado_em": "2026-10-05T15:20:00", // hora local da exportação
  "programa": "TINCTORIS 0.9.0-beta",   // de app/worker/package.json
  "tipos": [
    { "id": "1qoplue3hv3d7tv", "nome": "Partitura",
      "campos": [ { "chave": "catalogo", "rotulo": "Nº de catálogo (BWV, K., op.)", "tipo": "texto" } ] }
    // só os campos que podem sair (§4); "tipo": texto | texto_longo | lista | numero | data | url | sim_nao
  ],
  "fichas": [
    {
      "id": "abc123",                    // id da base (estável)
      "numero": 578,                     // nº permanente (#0578)
      "titulo": "Six easy sonattas…",
      "autores": [ { "nome": "Carl Friedrich", "apelido": "Abel", "papel": "compositor" } ],
                                         // cada autor: nome, apelido, literal (opcional), papel (opcional; ausente = autor)
      "data": "1771",                    // texto livre como na base ("c. 1600", "1724-03-12", "séc. XVII")
      "ano": 1771,                       // número, 0 se desconhecido
      "tipo": "1qoplue3hv3d7tv",         // id em "tipos" ("" se nenhum)
      "estado": "completo",              // "completo" | "rever"  (a_rever, processando e erro → "rever")
      "natureza": "primária",            // "primária" | "secundária" | ""
      "editora": "", "local": "", "doi": "", "isbn": "", "url": "",
      "paginas": 0,
      "palavras_chave": [ "sonata", "viola da gamba" ],   // sem o nome do dono (§4)
      "metadados": { "catalogo": "…", "rism": "…" },   // só chaves permitidas (§4), valores texto/número
      "ficheiros": [                     // principal primeiro, depois os extra; [] se não tem ficheiro
        { "caminho": "Partitura/1771/1771_ABEL_….mid", "rotulo": "" },
        { "caminho": "Partitura/1771/1771_ABEL_…_2.mid", "rotulo": "abel_1771_2" }
      ],
      "originais": [                     // fotografias originais; [] se não há
        { "pasta": "_originais/tratados_ibéricos_de_vihuela - Libro_6",
          "imagens": [ "001.jpg", "002.jpg" ],   // nomes (NFC), ordem natural; só imagens (§4)
          "tamanho": 123456789 }                 // bytes, soma das imagens
      ],
      "bloco_texto": 6,                  // nº do bloco de texto integral (§3); 0 = sem texto
      "criado": "2026-09-28 01:02:03.000Z"
    }
  ],
  "notas": [
    { "id": "n1", "fonte": "abc123", "localizacao": "p. 12", "tipo_nota": "Citação",
      "texto": "…", "ordem": 0, "criado": "…" }
  ]
}
```

- `caminho` é relativo a `biblioteca/` do destino. A página faz a ligação assim:
  `'biblioteca/' + caminho.split('/').map(encodeURIComponent).join('/')`
  (e para as imagens: `pasta + '/' + imagem`, também segmento a segmento).
- Uma ficha cujo ficheiro não existe na Rocinante continua a sair, sem esse ficheiro em `ficheiros`
  (o exportador conta-as e diz quantas).
- Fichas sem ficheiro (feitas à mão) também saem.

## 3. Texto integral: `dados/texto/bloco-NNNN.js`

- Bloco = `Math.ceil(numero / 100)` (fichas #1–#100 → bloco 1, #101–#200 → bloco 2…). Assim uma ficha nova
  ou alterada só muda o seu bloco (a sincronização só reescreve esse).
- Cada ficheiro é uma só chamada:
  ```js
  TINCTORIS_TEXTO(6, { "abc123": "texto integral…", "def456": "…" })
  ```
  (chave = id da ficha; valor = conteúdo da colecção `textos`, tal como está, com marcas `[p. 12]`).
- Só existem os blocos que têm pelo menos um texto. `bloco_texto` em cada ficha diz qual é (0 = nenhum).
- A página define `window.TINCTORIS_TEXTO = function (n, textos) { … }` antes de carregar um bloco, e carrega-os
  um a um com `<script src="dados/texto/bloco-0006.js">` (sem `fetch`).

## 4. O que NÃO sai (o disco pode ser emprestado a colegas/alunos)

- Das fichas: `notas`, `tags` (etiquetas), `contextos`, `candidatos`, `hash`, `ocr_estado`, `origem`,
  `ficheiro_original`, `updated`.
- `palavras_chave`: sai cada palavra-chave **menos** as que são o nome do dono (Definições → `nome_dono`, vários nomes
  separados por «;»), reconhecido como em `config.js` (`padroesDono`: sem acentos nem maiúsculas; «Pedro Sousa Silva»
  apanha «Pedro Silva», «Silva, Pedro»…). Só na cópia: na biblioteca ficam como estão. (Os nomes dos alunos como
  compositores, #724–#815, ficam: decisão do Pedro, 5/10.)
- De `metadados`: **lista fechada** (`METADADOS_PERMITIDOS` no exportador). Uma chave sai só se estiver nessa lista
  **e** nos `campos` do tipo da ficha; um campo novo que se acrescente a um tipo não sai sem ser acrescentado à lista.
  Fora da lista, entre outros: `nota_revisao`, `herdado_de`, `lote`, `transcricao_midi`, `catalogo_ia`, `exemplar_papel`
  («Onde está o exemplar físico»: diz onde o dono guarda os livros e os discos), e do
  «Registo de ensaio» `notas_processo` e `participantes` (podem ser privados). Também nunca saem as internas
  (`verificacao`, `estado_antes_reanalise`, `nomes_alternativos`, `duplicados_retirados`, `palavras_chave_origem`,
  `originais`, `originais_conjunto`, `fonte_original`, `url_original`, …). Valores vazios não saem.
  A lista de `campos` de cada tipo em `tipos` segue a mesma regra.
- Fotografias originais: só ficheiros de imagem (`jpg`, `jpeg`, `tif`, `tiff`, `png`, `gif`, `bmp`, `webp`, `heic`,
  `heif`, sem distinguir maiúsculas); o resto da pasta (`.txt`, vídeos…) fica de fora.
- Ficheiros com nomes que o Windows reserva (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, com ou sem
  extensão, em qualquer pasta do caminho): não saem (aviso e lista na simulação).
- Das notas de leitura: `tags` e `contextos` (as notas de leitura em si saem).
- Nada das Definições (nem `nome_dono`), contas, cópias de segurança, registos.

## 5. `.tinctoris-leitura.json` (só para o exportador)

Marca que diz «esta pasta é uma cópia de leitura do TINCTORIS» e guarda o que já foi copiado:

```jsonc
{
  "formato": 1,
  "exportado_em": "…",
  "amostra": false,           // true = cópia só de algumas fichas (--amostra / --numeros); sem o campo = conta como completa
  "ficheiros": { "Partitura/1771/…pdf": { "tamanho": 1234, "modificado": 1727000000000, "ficha": "abc123" } },
                              // origem, ms; "ficha" = id da (1.ª) ficha a que o ficheiro pertence
  "blocos": { "bloco-0006.js": "<sha256 do conteúdo>" }
}
```

Regras de segurança do exportador:
- Só escreve/apaga **dentro** da pasta de destino, e só em `biblioteca/`, `dados/`, `leitura/` e nos ficheiros da raiz
  (os 3 de §1, a marca e o bloqueio). Recusa uma pasta de destino que não esteja vazia e não tenha a marca, e uma marca
  que não seja um ficheiro normal.
- O destino não pode ficar dentro (nem conter) a pasta do TINCTORIS inteira (`PASTAS.raiz`: `app`, `pb_data`,
  `biblioteca`, `watch_folder`, `nao_processados`…), a pasta da biblioteca indicada, nem conter a base. A comparação
  usa o caminho resolvido pelo sistema (`realpath`) do antepassado mais fundo que existe, em NFC e minúsculas (o disco
  do Mac não distingue maiúsculas). O serviço faz a mesma verificação antes de lançar o exportador.
- Nunca altera a base nem a pasta `biblioteca/` da Rocinante: a base lê-se com `sqlite3 -readonly`; a única
  escrita fora do destino é a lista em `app/registos/`.
- Copia/escreve para um nome temporário (`.parcial`) e só depois renomeia; um ficheiro a meio nunca fica com o nome
  final. O `.parcial` apaga-se primeiro (uma ligação simbólica com esse nome apaga-se, não se segue) e cria-se de novo
  com `wx` (falha se reaparecer). O nome final tem de ser um ficheiro normal ou não existir; nenhuma pasta do caminho
  dentro do destino pode ser uma ligação simbólica (escrever e apagar recusam).
- Sem `--aplicar`: só simulação (o que copiaria, o que apagaria, tamanhos). Com `--aplicar`: faz, e grava a lista em
  `app/registos/exportar-leitura-AAAA-MM-DD.txt`.
- Apagar no destino: só o que está em `biblioteca/` (ou `dados/texto/`) e já não pertence a nenhuma ficha.
  Também, sem os listar (lixo): `.DS_Store`, ficheiros `._*`, sobras `*.parcial` e ligações simbólicas em `biblioteca/`,
  `dados/`, `leitura/` e na raiz (apagam-se as próprias ligações, nunca o que apontam), e — em discos que não são APFS
  (exFAT) — os `._*` que o Mac cria ao lado do que o exportador escreveu (incluindo na raiz).
- Duas entradas da mesma pasta com o mesmo nome em NFC (no exFAT podem coexistir as duas formas Unicode): fica a de
  nome NFC; a outra apaga-se pelo nome que a pasta devolveu, nunca se for o mesmo ficheiro (mesmo nome ou mesmo inode).

Guardas antes de apagar (nenhuma escreve nada; se uma falhar, «Nada foi alterado»):
- **Amostra sobre cópia completa**: uma exportação com `--amostra`/`--numeros` recusa uma pasta cuja marca não diga
  `"amostra": true` (código `amostra-sobre-completa`). Amostra sobre amostra e completa sobre amostra são aceites.
- **Confirmação escrita** (`precisaConfirmacaoForte` no plano, com `motivosConfirmacao`): quando o plano apaga alguma
  coisa que não é mudança de nome (ver `--max-apagar`) e (a) apaga — sem contar as mudanças de nome — mais de 10 % dos
  ficheiros que estão no disco (e mais de 20), ou (b) a pasta da biblioteca não se lê ou está vazia, ou (c) mais de
  10 % das fichas com ficheiro (e mais de 20) têm o ficheiro em falta na biblioteca.
  Só aplica com `confirmarApagar` = número exacto de ficheiros a apagar (linha de comandos `--confirmar-apagar N`; nas
  Definições o utilizador escreve o número, como em «Apagar as seleccionadas»). Código `confirmar-apagar`.
- **Biblioteca acessível**: logo antes de apagar, a pasta da biblioteca tem de existir e ler-se (`origem-inacessivel`).
- **`--max-apagar N`** (o que a simulação mostrou; o serviço passa-o sempre): se o plano agora apaga mais, recusa
  (`mais-apagar`) — salvo se os ficheiros a mais forem mudanças de nome: ficheiros que, pela marca, pertenciam a uma
  ficha que continua na cópia com um ficheiro a copiar. `--max-apagar-outros M` = quantos dos mostrados não eram
  mudanças de nome; o que não é mudança de nome nunca pode passar de M.
- **Bloqueio** (`.tinctoris-leitura.bloqueio`, criado com `wx`: `pid`, `inicio` em ms, `maquina`): um exportador de
  cada vez por disco (`bloqueado`). Sai no fim, ao parar e em erro. Um bloqueio com mais de 6 h, ou de um processo
  deste Mac que já não existe, pode ser tomado.
- Exportação da biblioteca inteira usa ~1,3 GB de memória: o botão das Definições corre-a num processo à parte.
