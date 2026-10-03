#!/bin/zsh
# Duplo clique para iniciar o TINCTORIS. Fechar a janela para parar.
# Antes de arrancar, vê se há uma versão nova do programa no GitHub e pergunta se quer atualizar
# (com cópia de segurança da base de dados antes). Sem internet, arranca com a versão atual.

atualizar() {
  local raiz="$1" app="$1/app"
  cd "$raiz" || return
  [[ -d .git ]] || return
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  # (com a biblioteca já a correr não se mexe no programa: o iniciar.sh só abre o navegador)
  curl -s -m 2 "http://127.0.0.1:${PB_PORTA:-8090}/api/health" >/dev/null 2>&1 && return
  echo "A ver se há uma versão nova do programa…"
  if ! GIT_TERMINAL_PROMPT=0 git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 fetch -q origin main 2>/dev/null; then
    echo "   (sem ligação ao GitHub: continua com a versão atual)"
    return
  fi
  local novos=$(git rev-list --count HEAD..origin/main 2>/dev/null)
  (( ${novos:-0} > 0 )) || return
  echo ""
  echo "  Há uma versão nova do programa no GitHub ($novos alteração/ões):"
  git log --format='   • %s' HEAD..origin/main | head -20
  echo ""
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "  Mas há alterações neste Mac que ainda não estão no GitHub: não atualizo agora."
    echo "  (Peça ao Claude para as guardar primeiro.) Continua com a versão atual."
    echo ""
    return
  fi
  if ! git merge-base --is-ancestor HEAD origin/main; then
    echo "  A versão deste Mac e a do GitHub seguiram caminhos diferentes: não atualizo agora."
    echo "  (Peça ao Claude para as juntar.) Continua com a versão atual."
    echo ""
    return
  fi
  local resposta
  read "resposta?  Atualizar agora? (s = sim, n = não) "
  if [[ "$resposta" != [sSyY]* ]]; then
    echo "  Continua com a versão atual."
    echo ""
    return
  fi
  # Cópia de segurança da base de dados (no formato das cópias do PocketBase: aparece em Definições)
  if [[ -f "$app/pb_data/data.db" ]]; then
    echo "  A fazer uma cópia de segurança da base de dados (pode demorar um minuto)…"
    local nome="antes-atualizar-$(date +%Y%m%d-%H%M%S).zip" tmp=$(mktemp -d)
    local destino="$app/pb_data/backups/$nome"
    mkdir -p "$app/pb_data/backups"
    if ! { sqlite3 "$app/pb_data/data.db" ".backup '$tmp/data.db'" &&
           { [[ ! -f "$app/pb_data/auxiliary.db" ]] || sqlite3 "$app/pb_data/auxiliary.db" ".backup '$tmp/auxiliary.db'" } &&
           (cd "$tmp" && zip -q -1 "$destino" *.db) }; then
      rm -rf "$tmp"
      rm -f "$destino"
      echo "  Não consegui fazer a cópia de segurança: não atualizo. Continua com a versão atual."
      echo ""
      return
    fi
    rm -rf "$tmp"
    local md5=$(openssl dgst -md5 -binary "$destino" | base64)
    printf '{"user.cache_control":"","user.content_disposition":"","user.content_encoding":"","user.content_language":"","user.content_type":"application/zip","user.metadata":{"original-filename":"%s"},"md5":"%s"}' "$nome" "$md5" > "$destino.attrs"
    echo "  Cópia feita: $nome"
  fi
  local antes=$(git rev-parse HEAD)
  if ! git merge -q --ff-only origin/main; then
    echo "  A atualização falhou: continua com a versão atual."
    echo ""
    return
  fi
  if ! git diff --quiet "$antes" HEAD -- app/worker/package.json app/worker/package-lock.json; then
    echo "  A instalar as peças novas do serviço…"
    (cd "$app/worker" && npm install --no-audit --no-fund --silent) || echo "  Aviso: a instalação das peças novas falhou (ver acima)."
  fi
  echo "  Programa atualizado. A arrancar…"
  echo ""
}

# (numa só linha: se a atualização mudar este ficheiro, o resto já foi lido)
atualizar "${0:A:h}"; exec "${0:A:h}/app/iniciar.sh"
