# TINCTORIS — novidades de cada versão

## 0.12.0-beta (18 de Outubro de 2026)

- TINCTORIS também em Windows 11 (experimental): instalação com uma linha no PowerShell (winget), ícone no Ambiente de Trabalho e actualização automática a partir das versões publicadas.
- Imagens convertidas com uma ferramenta que funciona nos dois sistemas: as páginas de visualização das fotografias ocupam metade do espaço.
- Catálogos: «[s.n.]» e «[S.l.]» ficam vazios; a imprenta da Gallica é separada em local e editora; títulos com «pdf» vindo do nome do ficheiro deixam de passar.

## 0.11.0-beta (18 de Outubro de 2026)

### Acrescentar fontes
- Ficheiros do Finale (.mus e .musx): a ficha faz-se a partir dos dados guardados no ficheiro (título, compositor, fonte) e do nome; as partes cavas da mesma peça ficam numa só ficha.
- PDFs de transcrições feitos num editor de partituras (Finale, Sibelius, LilyPond…): juntam-se à ficha do ficheiro do Finale de onde foram impressos, ou ganham ficha própria pelo nome e pela primeira página.
- Bach-Gesellschaft-Ausgabe: volumes inteiros e extractos reconhecidos (BWV, volume, ano e editor).

### Catálogos
- Google Books e Semantic Scholar consultados ao ritmo que aceitam: quando recusam, uma pausa curta em vez de avisos vermelhos repetidos; o Semantic Scholar entra na pesquisa automática quando há chave.
- Fotografias e imagens soltas já não ficam «completas» só pelo Google Books ou pelo Semantic Scholar (ficam como sugestão).

### Conta, instalação e arranque
- Definições → «A sua conta»: ver o email e mudar a palavra-passe.
- A instalação usa o Node.js oficial (nodejs.org) em vez do Homebrew e avisa em macOS anterior ao 15.
- Arranque mais robusto: o serviço de fundo espera até 10 minutos pela base de dados (bibliotecas grandes demoram a abrir).
- As mensagens do serviço de fundo (página Actividade) também em inglês.

## 0.10.0-beta (11 de Outubro de 2026)

### Interface
- **Interface em inglês.** Escolhe-se em Definições, nas boas-vindas ou no ecrã de entrada; na primeira vez segue o
  idioma do Mac.
- Ortografia portuguesa anterior ao Acordo de 1990 em todo o programa (interface, mensagens e manuais).
- Menu reorganizado: «Acerca» e «Ajuda» separados, número da versão na barra lateral.

### Acrescentar fontes
- **Livros em papel pela fotografia do ISBN** (código de barras ou ficha técnica): a ficha faz-se sozinha a partir dos
  catálogos, com um campo livre «Onde está o exemplar físico».
- **Discos (CD, LP) pela fotografia** do código de barras ou da capa, com confirmação da edição (ano ℗/©, número de
  catálogo, editora).
- **Folhas de rosto do JSTOR** lidas por inteiro: artigos e recensões identificados, com a «Obra recenseada».

### Organizar e corrigir
- **Editar várias fichas de uma vez**: só os campos comuns, «só onde está vazio» ou «substituir em todas»,
  etiquetas e contextos.
- **Apagar várias fontes de uma vez**, com os ficheiros no Lixo do Mac e cópia de segurança antes.
- Filtro **«Formato do ficheiro»** (PDF, Word, MIDI, Finale, sem ficheiro…).
- **Duplicados**: comparação lado a lado com a ficha confundida; só se põe de parte o que tem as páginas iguais.

### Ler e partilhar
- **Cópia de leitura num disco externo**: fichas, notas de leitura, ficheiros e texto integral, que abrem com duplo
  clique em qualquer Mac ou Windows, sem instalar nada. Pode ser emprestada: as notas privadas ficam de fora.

### Texto integral (OCR)
- OCR também nas fichas por rever, quando não há mais nada em fila.
- Melhor leitura de PDFs digitalizados com páginas pequenas (resolução ajustada).

### Documentação
- Manual e guia de instalação em inglês; guia para colaboradores (CONTRIBUTING.md); créditos e forma de citar
  actualizados.

## 0.9.0-beta (3 de Outubro de 2026)

Primeira versão publicada: nome TINCTORIS e identidade a preto e branco, licença aberta (AGPL), forma de citar,
boas-vindas, botão «Enviar comentário», opção «Abrir só neste Mac» e instalação para os testers.
