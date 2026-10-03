#!/bin/zsh
# Inicia o TINCTORIS: base de dados (PocketBase) + serviço de fundo.
# Fechar a janela do Terminal (ou Ctrl+C) para tudo.

APP="${0:A:h}"
RAIZ="${APP:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export BIBLIOTECA_DIR="$RAIZ/biblioteca"
export WATCH_DIR="$RAIZ/watch_folder"
export PB_PORTA=8090
export PB_URL="http://127.0.0.1:$PB_PORTA"
export SERVICO_PORTA=8091

if [[ ! -f "$APP/.segredo" || ! -d "$APP/worker/node_modules" ]]; then
  echo "O TINCTORIS ainda não está instalado neste computador."
  echo "Corra primeiro:  $APP/instalar.sh"
  exit 1
fi

if curl -s -m 2 "$PB_URL/api/health" >/dev/null 2>&1; then
  echo "O TINCTORIS já está a correr. A abrir no navegador..."
  open "http://127.0.0.1:$PB_PORTA"
  exit 0
fi

mkdir -p "$BIBLIOTECA_DIR" "$WATCH_DIR" "$APP/registos"

# Só neste Mac (app/.so_local, criado pelo instalador; muda-se em Definições) ou também noutros aparelhos da mesma rede
ESCUTA="0.0.0.0"
[[ -f "$APP/.so_local" ]] && ESCUTA="127.0.0.1"
export PB_ESCUTA="$ESCUTA"

"$APP/bin/pocketbase" serve \
  --http "$ESCUTA:$PB_PORTA" \
  --dir "$APP/pb_data" \
  --hooksDir "$APP/pb_hooks" \
  --migrationsDir "$APP/pb_migrations" \
  --publicDir "$APP/pb_public" \
  --hooksWatch=false >> "$APP/registos/pocketbase.log" 2>&1 &
PB_PID=$!

# Ligado ao carregador, o Mac não adormece enquanto a biblioteca corre (o ecrã pode apagar-se). A bateria adormece
# normalmente; com a intensidade «Máxima» escolhida à mão, o serviço mantém-no acordado (ver worker/src/intensidade.js)
caffeinate -s -w $PB_PID &

# IA local (Ollama), se estiver instalada: lê as capas difíceis sem enviar nada para fora
OL_PID=""
if command -v ollama >/dev/null 2>&1 && ! curl -s -m 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  OLLAMA_MODELS="$APP/modelos" OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
    ollama serve >> "$APP/registos/ollama.log" 2>&1 &
  OL_PID=$!
fi

parar() {
  trap - INT TERM HUP EXIT
  kill $SV_PID $PB_PID $OL_PID 2>/dev/null
  wait 2>/dev/null
  echo
  echo "TINCTORIS parado."
  exit 0
}
trap parar INT TERM HUP EXIT

for i in {1..40}; do
  curl -s -m 1 "$PB_URL/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done

(cd "$APP/worker" && exec node --no-deprecation src/index.js) > >(tee -a "$APP/registos/servico.log") 2>&1 &
SV_PID=$!

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  TINCTORIS a funcionar                                     │"
echo "  └──────────────────────────────────────────────────────────┘"
echo "   Neste computador:     http://127.0.0.1:$PB_PORTA"
[[ -n "$IP" && "$ESCUTA" == "0.0.0.0" ]] && echo "   Noutros dispositivos: http://$IP:$PB_PORTA  (mesma rede Wi-Fi)"
echo "   Watch folder:         $WATCH_DIR"
command -v ollama >/dev/null 2>&1 && echo "   IA local:             ligada (modelos em app/modelos)"
echo ""
echo "   Para parar: feche esta janela ou carregue Ctrl+C."
echo ""

[[ -z "$SEM_NAVEGADOR" ]] && open "http://127.0.0.1:$PB_PORTA"
wait $PB_PID
