# Componentes de terceiros

O TINCTORIS usa os componentes abaixo. Cada um mantém a sua licença; nenhum é alterado.

| Componente | Para que serve | Licença | Como chega |
|---|---|---|---|
| [PocketBase](https://pocketbase.io) | Base de dados e servidor web | MIT | Descarregado pelo instalador |
| [SDK JavaScript do PocketBase](https://github.com/pocketbase/js-sdk) | Ligação da interface e do serviço à base de dados | MIT | Incluído (`app/pb_public/vendor`) e via npm |
| [Inter](https://rsms.me/inter/) (Rasmus Andersson) | Tipo de letra da interface | SIL Open Font License 1.1 | Incluído (`app/pb_public/fontes`, licença em `Inter-OFL.txt`) |
| [Node.js](https://nodejs.org) | Serviço de fundo | MIT | Descarregado pelo instalador |
| [citation-js](https://citation.js.org) | Importação e exportação de referências (BibTeX, RIS, CSL) | MIT | npm |
| [chokidar](https://github.com/paulmillr/chokidar) | Vigiar a pasta de entrada | MIT | npm |
| [pdf-lib](https://pdf-lib.js.org) | Criar e juntar PDFs | MIT | npm |
| [word-extractor](https://github.com/morungos/node-word-extractor) | Ler ficheiros Word antigos (.doc) | MIT | npm |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) e dados `tessdata_fast` | Reconhecimento de texto (OCR) | Apache 2.0 | Descarregado pelo instalador |
| [Poppler](https://poppler.freedesktop.org) | Ler texto e imagens de PDFs | GPL-2.0-or-later | Descarregado pelo instalador |
| [FFmpeg](https://ffmpeg.org) | Ler gravações áudio e vídeo | LGPL-2.1-or-later / GPL | Descarregado pelo instalador |
| [Ollama](https://ollama.com) (opcional) | Executar a IA local | MIT | Instalado à parte, se o utilizador quiser |
| [Qwen3-VL 8B Instruct](https://huggingface.co/Qwen) (opcional) | Ler capas e folhas de rosto difíceis | Apache 2.0 | Descarregado pelo Ollama, se o utilizador quiser |
| Estilos e localizações [CSL](https://citationstyles.org) (`app/estilos`) | Formatos de citação (APA, Chicago, NP 405…) | CC BY-SA 3.0 | Incluídos |

Os serviços online consultados para identificar fontes (RISM, DIAMM, IMSLP, CrossRef, Open Library, MusicBrainz,
Gallica, Europeana e outros) são usados segundo os termos de cada um; o TINCTORIS não redistribui os seus dados.
