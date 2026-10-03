#!/bin/zsh
# Instala (ou repara) o TINCTORIS neste computador.
# Pode ser corrido mais de uma vez sem estragar nada.
set -e

APP="${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$APP"

echo "1/6  Programas necessários (Homebrew)"
if ! command -v brew >/dev/null; then
  echo "     Falta o Homebrew. Instale-o a partir de https://brew.sh e volte a correr este script."
  exit 1
fi
for p in node tesseract poppler ffmpeg; do
  if ! brew list --formula "$p" >/dev/null 2>&1 && ! command -v "${p/poppler/pdftotext}" >/dev/null; then
    echo "     A instalar $p..."
    brew install "$p"
  fi
done

echo "2/6  PocketBase"
if [[ ! -x "$APP/bin/pocketbase" ]]; then
  mkdir -p "$APP/bin"
  ARQ=$([[ "$(uname -m)" == "arm64" ]] && echo arm64 || echo amd64)
  VER=$(curl -s https://api.github.com/repos/pocketbase/pocketbase/releases/latest | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p')
  curl -sL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v$VER/pocketbase_${VER}_darwin_${ARQ}.zip"
  unzip -o -q /tmp/pb.zip pocketbase -d "$APP/bin" && rm /tmp/pb.zip
fi

echo "3/6  Bibliotecas do serviço de fundo (Node.js)"
(cd "$APP/worker" && npm install --no-audit --no-fund --silent)

echo "4/6  Línguas do OCR"
mkdir -p "$APP/tessdata"
for l in por lat ita fra spa deu eng osd; do
  if [[ ! -f "$APP/tessdata/$l.traineddata" ]]; then
    curl -sL -o "$APP/tessdata/$l.traineddata" "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata"
  fi
done

echo "5/6  Base de dados"
if [[ ! -f "$APP/.segredo" ]]; then
  openssl rand -hex 24 > "$APP/.segredo"
  chmod 600 "$APP/.segredo"
fi
if [[ ! -f "$APP/.servico.json" ]]; then
  PASS=$(openssl rand -hex 20)
  printf '{"email":"servico@biblioteca.local","password":"%s"}\n' "$PASS" > "$APP/.servico.json"
  chmod 600 "$APP/.servico.json"
fi
PASS=$(sed -n 's/.*"password":"\([^"]*\)".*/\1/p' "$APP/.servico.json")
"$APP/bin/pocketbase" migrate up --dir "$APP/pb_data" --migrationsDir "$APP/pb_migrations" --hooksDir "$APP/pb_hooks" >/dev/null
"$APP/bin/pocketbase" superuser upsert servico@biblioteca.local "$PASS" --dir "$APP/pb_data" >/dev/null

echo "6/6  IA local (opcional)"
if command -v ollama >/dev/null 2>&1; then
  mkdir -p "$APP/modelos"
  export OLLAMA_MODELS="$APP/modelos" OLLAMA_HOST=127.0.0.1:11434
  if ! curl -s -m 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then ollama serve >/dev/null 2>&1 & OLP=$!; sleep 2; fi
  ollama list 2>/dev/null | grep -q "qwen3-vl:8b-instruct" || { echo "     A descarregar o modelo (~6 GB)..."; ollama pull qwen3-vl:8b-instruct; }
  [[ -n "$OLP" ]] && kill $OLP 2>/dev/null
else
  echo "     (desligada: para a ativar, instale o Ollama com 'brew install ollama' e volte a correr este script)"
fi

chmod +x "$APP/iniciar.sh" "$APP/biblioteca" "$APP/../Iniciar TINCTORIS.command" 2>/dev/null || true
echo ""
echo "Instalação concluída. Para começar, faça duplo clique em «Iniciar TINCTORIS.command»."
