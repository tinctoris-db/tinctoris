# TINCTORIS — guia de instalação (versão beta)

*Tratados, Inventários, Notação, Códices, Textos, Organologia, Registos, Iconografia e Sumários.*

*English: [installation guide](INSTALL.md).*

O TINCTORIS é uma base de dados de fontes para musicologia, investigação artística e ensino: manuscritos, impressos,
partituras, gravações, instrumentos, iconografia. Cada pessoa instala-o no seu Mac e tem a sua própria biblioteca.

## Antes de começar

- **Mac com processador Apple** (M1 ou mais recente). Para confirmar:  → Acerca deste Mac → «Chip: Apple M…».
  Num Mac com processador Intel, a versão beta não funciona: nas aulas, trabalhe em par com um colega.
- **Conta de administrador** no Mac e a respetiva palavra-passe (num Mac pessoal, é normalmente a sua).
- **Ligação à internet** e **15 a 25 minutos** (a primeira instalação descarrega várias peças).
- Espaço livre: cerca de 3 GB, mais 6 GB se quiser a IA local, mais o espaço das suas fontes.

## Instalar

1. Abra o **Terminal**: carregue em ⌘ + espaço, escreva «Terminal» e carregue em Enter.
2. Copie esta linha inteira, cole-a no Terminal (⌘ + V) e carregue em Enter:

   ```
   /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/tinctoris-db/tinctoris/main/instalar-tinctoris.sh)"
   ```

3. Responda às janelas que aparecem:
   - **Onde guardar o TINCTORIS** — escolha uma pasta (por exemplo, Documentos); é criada lá dentro uma pasta
     «TINCTORIS» com o programa e as suas fontes. Pode ser um disco externo.
   - **IA local** — só aparece em Macs com 16 GB de memória ou mais. Ajuda a identificar capas e folhas de rosto
     difíceis, sem enviar nada para fora do Mac. Ocupa cerca de 6 GB. Pode dizer «Não» e instalá-la mais tarde.
4. Quando o Terminal pedir **Password**, escreva a palavra-passe do Mac e carregue em Enter.
   **Enquanto escreve não aparece nada no ecrã: é normal.**
5. Espere. A instalação do Homebrew pode estar 10 a 15 minutos sem mostrar nada: não feche a janela.
6. No fim, o TINCTORIS abre-se no navegador e a pasta TINCTORIS aparece no Finder.

Se algo falhar, o instalador abre o formulário de comentários já com a descrição do erro: carregue em «Enviar».

## Primeira utilização

1. **Crie a sua conta** (email e palavra-passe). Fica só no seu Mac.
2. **Escreva o seu nome** na janela de boas-vindas. Serve para o TINCTORIS saber que, num PDF que digitalizou,
   não é o autor da fonte.
3. Para acrescentar fontes, arraste ficheiros (PDF, imagens, gravações…) para a pasta **watch_folder**, dentro da pasta
   TINCTORIS. O TINCTORIS identifica-os e cria as fichas; as que precisam de ajuda aparecem em **Por rever**.

## Abrir e fechar

- **Abrir:** duplo clique em **«Iniciar TINCTORIS»**, na pasta TINCTORIS. Abre-se uma janela do Terminal (deixe-a
  aberta) e o TINCTORIS no navegador. Se houver uma versão nova, pergunta antes se quer atualizar.
- **Fechar:** feche a janela do Terminal.

Por omissão, o TINCTORIS só abre no seu Mac. Para o abrir também no iPad ou noutro computador da mesma rede Wi-Fi:
Definições → «A sua biblioteca» → desligar «Abrir só neste Mac», e voltar a abrir o TINCTORIS.

## Exportar referências bibliográficas

No ecrã **Fontes**, o botão **«Exportar bibliografia»** exporta as fontes selecionadas (caixas à esquerda de cada
fonte) ou, sem nenhuma selecionada, todas as da pesquisa atual. Escolha o estilo (APA, Chicago, MLA, Harvard,
NP 405, ABNT), a língua dos termos e o formato. **Copiar** põe a lista pronta a colar no Word; **Descarregar ficheiro**
guarda-a em texto, RTF, HTML, BibTeX, RIS ou CSL-JSON (para Zotero, Mendeley ou EndNote).

## Comentários

Esta é uma versão beta: os seus comentários decidem o que melhora. No fundo da barra lateral, **«Enviar comentário»**
abre um formulário curto (não funciona / podia funcionar melhor / falta fazer / dúvida de utilização). A versão
do programa e do macOS e os últimos erros técnicos vão preenchidos; nunca vão títulos, nomes de ficheiros nem fontes.
Nome e email são opcionais. Quem quiser pode aparecer nos **Créditos** (Definições).

---

© 2026 Pedro Sousa Silva e contribuidores do TINCTORIS. Este guia: CC BY-SA 4.0. Programa: GNU AGPL 3.0 ou posterior.
