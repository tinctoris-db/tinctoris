#!/bin/zsh
# Instala o TINCTORIS num Mac com processador Apple (M1 ou mais recente). Abrir o Terminal e colar:
#
#   /bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/tinctoris-db/tinctoris/main/instalar-tinctoris.sh)"
#
# O que faz: pergunta onde guardar o TINCTORIS e se quer a IA local; instala o Homebrew (e as ferramentas da Apple)
# se faltar; descarrega o TINCTORIS do GitHub; corre o app/instalar.sh; abre o TINCTORIS.
# Pode ser corrido outra vez sem estragar nada (repara a instalação e atualiza o programa).
# Se algo falhar, abre o formulário de comentários com o erro já preenchido.

REPO="${TINCTORIS_REPO:-https://github.com/tinctoris-db/tinctoris.git}"
BRUTO="${TINCTORIS_BRUTO:-https://raw.githubusercontent.com/tinctoris-db/tinctoris/main}"
REGISTO="$HOME/Library/Logs/instalar-tinctoris.log"
setopt pipefail
mkdir -p "${REGISTO:h}"
: > "$REGISTO"

titulo() { print ""; print -P "%B$1%b" }
diz() { print "   $1" }

# Pedir ajuda: abre o formulário (Google Forms) com a informação técnica e as últimas linhas do registo.
pedir_ajuda() {
  local motivo="$1" form url campo info
  form=$(curl -fsSL -m 10 "$BRUTO/app/pb_public/formulario.json" 2>/dev/null) || return
  url=$(osascript -l JavaScript -e 'function run(a){try{var j=JSON.parse(a[0]);return (j.url||"")+"\t"+((j.campos||{}).informacao||"")}catch(e){return ""}}' "$form" 2>/dev/null)
  campo="${url#*$'\t'}"; url="${url%%$'\t'*}"
  [[ -z "$url" ]] && return
  info="Instalação falhou: $motivo
macOS $(sw_vers -productVersion 2>/dev/null) ($(uname -m))
$(tail -n 15 "$REGISTO" 2>/dev/null | sed -E 's#/Users/[^ ]*#‹caminho›#g' | cut -c1-200)"
  if [[ -n "$campo" ]]; then
    info=$(osascript -l JavaScript -e 'function run(a){return encodeURIComponent(a[0])}' "$info")
    open "$url?usp=pp_url&$campo=$info"
  else
    open "$url"
  fi
}

falhar() {
  print ""
  print -P "%B  Não foi possível concluir a instalação.%b"
  diz "$1"
  diz "Registo completo: $REGISTO"
  diz "Vou abrir o formulário de comentários no navegador, já com o erro, para pedir ajuda."
  pedir_ajuda "$1"
  exit 1
}

pergunta_sim_nao() { # $1 = pergunta; devolve 0 se «Sim»
  local r
  r=$(osascript -e "button returned of (display dialog \"$1\" buttons {\"Não\", \"Sim\"} default button \"Sim\" with title \"TINCTORIS\")" 2>/dev/null)
  [[ "$r" == "Sim" ]]
}

print ""
print -P "%B  TINCTORIS — instalação da versão beta%b"
diz "Demora 15 a 25 minutos da primeira vez. Pode deixar o Mac a trabalhar."

# ---- 1. Este Mac serve?
if [[ "$(uname -m)" != "arm64" ]]; then
  print ""
  diz "Este Mac tem processador Intel. A versão beta só funciona em Macs com processador Apple (M1 ou mais recente)."
  diz "Nas aulas, trabalhe em par com um colega que tenha um destes Macs."
  exit 1
fi
if ! dseditgroup -o checkmember -m "$USER" admin >/dev/null 2>&1; then
  print ""
  diz "A sua conta neste Mac não é de administrador, e a instalação precisa de o ser."
  diz "Peça a quem gere o Mac para o fazer, ou use o Mac de um colega."
  exit 1
fi

# ---- 2. Perguntas
titulo "1/6  Onde guardar o TINCTORIS"
PASTA=$(osascript -e 'POSIX path of (choose folder with prompt "Onde quer guardar o TINCTORIS e as suas fontes? Dentro da pasta escolhida será criada uma pasta «TINCTORIS». Pode ser um disco externo." default location (path to documents folder))' 2>/dev/null)
[[ -z "$PASTA" ]] && { diz "Instalação cancelada."; exit 0 }
DESTINO="${PASTA%/}/TINCTORIS"
diz "$DESTINO"

IA=0
MEMORIA_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
if (( MEMORIA_GB >= 16 )); then
  pergunta_sim_nao "Quer instalar a IA local? Ajuda a identificar capas e folhas de rosto difíceis, sem enviar nada para fora do Mac. Ocupa cerca de 6 GB e demora mais a descarregar. Pode instalá-la mais tarde." && IA=1
else
  diz "(A IA local precisa de 16 GB de memória; este Mac tem $MEMORIA_GB GB. O TINCTORIS funciona sem ela.)"
fi

# ---- 3. Palavra-passe (uma vez; fica válida durante a instalação)
titulo "2/6  Autorização"
diz "Escreva a palavra-passe com que entra no Mac e carregue em Enter."
diz "Enquanto escreve não aparece nada no ecrã: é normal."
sudo -v || falhar "a palavra-passe não foi aceite."
( while true; do sudo -n true; sleep 50; kill -0 $$ 2>/dev/null || exit; done ) 2>/dev/null &
MANTER_SUDO=$!
trap 'kill $MANTER_SUDO 2>/dev/null' EXIT

# ---- 4. Homebrew (e as ferramentas da Apple, que o Homebrew instala)
titulo "3/6  Homebrew"
if [[ ! -x /opt/homebrew/bin/brew ]]; then
  diz "A instalar o Homebrew e as ferramentas da Apple. É a parte mais demorada (10 a 15 minutos)"
  diz "e durante esse tempo esta janela não mostra nada: não a feche."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" >>"$REGISTO" 2>&1 \
    || falhar "o Homebrew não ficou instalado."
else
  diz "Já está instalado."
fi
eval "$(/opt/homebrew/bin/brew shellenv)"
grep -q 'brew shellenv' "$HOME/.zprofile" 2>/dev/null || print 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"

# ---- 5. Programa
titulo "4/6  TINCTORIS"
if [[ -d "$DESTINO/.git" ]]; then
  diz "Já existe nesta pasta: vou atualizá-lo."
  git -C "$DESTINO" pull -q --ff-only >>"$REGISTO" 2>&1 || falhar "não consegui atualizar o programa em $DESTINO."
else
  [[ -e "$DESTINO" && -n "$(ls -A "$DESTINO" 2>/dev/null)" ]] && falhar "já existe uma pasta TINCTORIS com outros ficheiros em ${PASTA%/}. Escolha outro sítio ou mude-lhe o nome."
  git clone -q "$REPO" "$DESTINO" >>"$REGISTO" 2>&1 || falhar "não consegui descarregar o programa do GitHub."
fi
# Por omissão só abre neste Mac (muda-se em Definições)
[[ -f "$DESTINO/app/.so_local" ]] || print "Criado pelo instalador: o TINCTORIS só abre neste Mac (muda-se em Definições)." > "$DESTINO/app/.so_local"

if (( IA )); then
  diz "A instalar o Ollama (para a IA local)…"
  brew list --formula ollama >/dev/null 2>&1 || brew install ollama >>"$REGISTO" 2>&1 || falhar "o Ollama não ficou instalado."
fi

# ---- 6. Peças, base de dados e (se pedida) o modelo de IA: o instalar.sh de sempre
titulo "5/6  Peças do programa"
diz "OCR, leitura de PDFs e gravações, base de dados$( (( IA )) && print ', modelo de IA (~6 GB)')…"
"$DESTINO/app/instalar.sh" 2>&1 | tee -a "$REGISTO" | sed 's/^/   /' || falhar "a instalação das peças do programa falhou."

# ---- 7. Abrir
titulo "6/6  Pronto"
diz "Para abrir o TINCTORIS no futuro: duplo clique em «Iniciar TINCTORIS», na pasta"
diz "$DESTINO (abre-se agora no Finder)."
diz "Para o fechar: feche esta janela do Terminal."
diz "Da primeira vez, crie uma conta (email e palavra-passe) e escreva o seu nome."
open "$DESTINO"
kill $MANTER_SUDO 2>/dev/null
exec "$DESTINO/Iniciar TINCTORIS.command"
