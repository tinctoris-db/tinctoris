#!/bin/zsh
# Instala (ou repara) o TINCTORIS neste computador.
# Pode ser corrido mais de uma vez sem estragar nada.
set -e

APP="${0:A:h}"
export PATH="$APP/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$APP"

# Node.js: serve o que já houver no Mac (versão 22 ou mais recente); senão, a versão oficial de nodejs.org,
# já pronta, guardada em app/node. Não se usa o Homebrew porque, em macOS antigos, ele constrói o Node
# a partir do código-fonte (uma hora ou mais, e pode falhar).
NODE_MINIMO=22
NODE_LINHA="latest-v22.x"
node_serve() {
  local v
  v=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
  (( ${v:-0} >= NODE_MINIMO ))
}
instalar_node() {
  local base="${TINCTORIS_NODE_URL:-https://nodejs.org/dist/$NODE_LINHA}" arq somas linha soma nome tmp
  arq=$([[ "$(uname -m)" == "arm64" ]] && echo arm64 || echo x64)
  somas=$(curl -fsSL -m 60 "$base/SHASUMS256.txt") || { echo "     Não consegui contactar nodejs.org."; return 1 }
  linha=$(print -r -- "$somas" | grep -E " node-v[0-9.]+-darwin-$arq\.tar\.gz\$" | head -1)
  [[ -n "$linha" ]] || { echo "     Não encontrei o Node.js para este Mac em nodejs.org."; return 1 }
  soma=${linha%% *}; nome=${linha##* }
  echo "     A descarregar o Node.js (${nome%.tar.gz}, cerca de 50 MB) de nodejs.org..."
  tmp=$(mktemp -d)
  curl -fsSL -m 900 -o "$tmp/$nome" "$base/$nome" || { rm -rf "$tmp"; echo "     A descarga do Node.js falhou."; return 1 }
  if [[ "$(shasum -a 256 "$tmp/$nome" | cut -d' ' -f1)" != "$soma" ]]; then
    rm -rf "$tmp"; echo "     O Node.js descarregado não confere com a assinatura de nodejs.org."; return 1
  fi
  mkdir "$tmp/x" && tar -xzf "$tmp/$nome" -C "$tmp/x" || { rm -rf "$tmp"; return 1 }
  rm -rf "$APP/node"
  mv "$tmp/x/${nome%.tar.gz}" "$APP/node" && rm -rf "$tmp"
  rehash
}

# Se outra instalação do Homebrew estiver a correr (por exemplo, o instalador aberto noutra janela),
# espera que acabe em vez de falhar com «already locked».
esperar_brew() {
  local n=0
  while pgrep -f "Homebrew/brew.rb" >/dev/null 2>&1; do
    (( n == 0 )) && echo "     Há outra instalação do Homebrew a correr neste Mac. Espero que acabe (não feche esta janela)..."
    (( n % 30 == 29 )) && echo "     Ainda à espera ($(( (n + 1) / 6 )) minutos)..."
    (( ++n > 720 )) && { echo "     A outra instalação não acabou em 2 horas. Feche as outras janelas do Terminal, reinicie o Mac e corra outra vez a instalação."; return 1 }
    sleep 10
  done
}

echo "1/6  Programas necessários"
if node_serve; then
  echo "     Node.js $(node -v) (já estava no Mac)"
else
  instalar_node || { echo "     O Node.js não ficou instalado. Verifique a ligação à internet e volte a correr a instalação."; exit 1 }
  node_serve || { echo "     O Node.js descarregado não arranca neste Mac."; exit 1 }
  echo "     Node.js $(node -v) instalado em app/node"
fi
if ! command -v brew >/dev/null; then
  echo "     Falta o Homebrew. Instale-o a partir de https://brew.sh e volte a correr este script."
  exit 1
fi
for p in tesseract poppler ffmpeg; do
  if ! brew list --formula "$p" >/dev/null 2>&1 && ! command -v "${p/poppler/pdftotext}" >/dev/null; then
    esperar_brew
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
  echo "     (desligada: para a activar, instale o Ollama com 'brew install ollama' e volte a correr este script)"
fi

chmod +x "$APP/iniciar.sh" "$APP/biblioteca" "$APP/../Iniciar TINCTORIS.command" 2>/dev/null || true
echo ""
echo "Instalação concluída. Para começar, faça duplo clique em «Iniciar TINCTORIS.command»."
