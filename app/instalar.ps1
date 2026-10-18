# Instala o TINCTORIS neste computador Windows (versão Windows, fase 3 — Pedro, 18/10/2026): o equivalente de
# app/instalar.sh do Mac. Usa o winget (vem com o Windows 11) para os programas; o resto fica dentro da pasta.
# Corre-se uma vez (o instalar-tinctoris.ps1 chama-o); pode correr-se outra vez sem perigo: só faz o que falta.
#   powershell -ExecutionPolicy Bypass -File app\instalar.ps1 [-ComIA]
param([switch]$ComIA)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$APP = $PSScriptRoot
$RAIZ = Split-Path $APP -Parent
$FERRAMENTAS = Join-Path $APP 'ferramentas'
New-Item -ItemType Directory -Force -Path $FERRAMENTAS | Out-Null

function Escrever-Sem-BOM($caminho, $texto) { [IO.File]::WriteAllText($caminho, $texto, (New-Object Text.UTF8Encoding($false))) }
function Aleatorio($bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString('x2') })
}
function Actualizar-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
# Pasta onde está um programa (no PATH, nas pastas habituais ou nas do winget); '' se não houver
function Onde($exe) {
  $c = Get-Command $exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return Split-Path $c.Source -Parent }
  $sitios = @("$env:ProgramFiles\Tesseract-OCR", "$env:LOCALAPPDATA\Microsoft\WinGet\Links", "$env:LOCALAPPDATA\Microsoft\WinGet\Packages", "$env:ProgramFiles\WinGet\Packages")
  foreach ($s in $sitios) {
    if (Test-Path $s) {
      $f = Get-ChildItem -Path $s -Filter $exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($f) { return $f.DirectoryName }
    }
  }
  return ''
}
function Instalar($id, $exe, $nome) {
  if (Onde $exe) { Write-Host "     $nome (já estava instalado)"; return }
  Write-Host "     A instalar $nome..."
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
  Actualizar-Path
  if (-not (Onde $exe)) { throw "O $nome não ficou instalado (winget install --id $id)." }
}

Write-Host ''
Write-Host 'Instalação do TINCTORIS (Windows)'
Write-Host ''
if (-not [Environment]::Is64BitOperatingSystem) { throw 'O TINCTORIS precisa de Windows de 64 bits.' }
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Falta o winget («Instalador de Aplicações» da Microsoft Store). Instale-o e volte a correr a instalação.' }

Write-Host '1/7  Programas necessários'
$nodeOk = $false
try { $nodeOk = ([int]((node -v) -replace '^v(\d+)\..*', '$1')) -ge 22 } catch {}
if ($nodeOk) { Write-Host "     Node.js $(node -v) (já estava instalado)" }
else {
  Write-Host '     A instalar o Node.js...'
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
  Actualizar-Path
  # (um Node antigo de outra instalação pode estar primeiro no PATH: o do winget fica à frente)
  $env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
  $versao = 0
  try { $versao = [int]((node -v) -replace '^v(\d+)\..*', '$1') } catch {}
  if ($versao -lt 22) { throw 'O Node.js 22 (ou mais recente) não ficou disponível. Feche esta janela, abra outra e volte a correr a instalação.' }
  Write-Host "     Node.js $(node -v)"
}
Instalar 'oschwartz10612.Poppler' 'pdftoppm.exe' 'Poppler (PDF)'
Instalar 'UB-Mannheim.TesseractOCR' 'tesseract.exe' 'Tesseract (OCR)'
Instalar 'Gyan.FFmpeg' 'ffprobe.exe' 'FFmpeg (áudio e vídeo)'
Instalar 'SQLite.SQLite' 'sqlite3.exe' 'SQLite'
# (o serviço procura os programas nestas pastas: ver worker/src/plataforma.js)
$pastas = @('pdftoppm.exe', 'tesseract.exe', 'ffprobe.exe', 'sqlite3.exe') | ForEach-Object { Onde $_ } | Where-Object { $_ } | Select-Object -Unique
Escrever-Sem-BOM (Join-Path $FERRAMENTAS 'caminhos.txt') (($pastas -join "`r`n") + "`r`n")

Write-Host '2/7  PocketBase (base de dados)'
$pb = Join-Path $APP 'bin\pocketbase.exe'
if (-not (Test-Path $pb)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $APP 'bin') | Out-Null
  $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/pocketbase/pocketbase/releases/latest' -Headers @{ 'User-Agent' = 'TINCTORIS' }
  $ver = $rel.tag_name -replace '^v', ''
  $zip = Join-Path $env:TEMP "pocketbase_$ver.zip"
  Invoke-WebRequest -Uri "https://github.com/pocketbase/pocketbase/releases/download/v$ver/pocketbase_${ver}_windows_amd64.zip" -OutFile $zip
  $tmp = Join-Path $env:TEMP "pocketbase_$ver"
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  Copy-Item (Join-Path $tmp 'pocketbase.exe') $pb
  Remove-Item $zip, $tmp -Recurse -Force
  Write-Host "     PocketBase $ver"
} else { Write-Host '     (já estava instalado)' }

Write-Host '3/7  Peças do serviço de fundo (Node.js)'
Push-Location (Join-Path $APP 'worker')
try { & npm.cmd install --no-audit --no-fund --silent; if ($LASTEXITCODE) { throw 'A instalação das peças do serviço falhou (npm install).' } }
finally { Pop-Location }

Write-Host '4/7  Línguas do OCR'
$tess = Join-Path $APP 'tessdata'
New-Item -ItemType Directory -Force -Path $tess | Out-Null
foreach ($l in 'por', 'lat', 'ita', 'fra', 'spa', 'deu', 'eng', 'osd') {
  $f = Join-Path $tess "$l.traineddata"
  if (-not (Test-Path $f)) { Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$l.traineddata" -OutFile $f }
}

Write-Host '5/7  Base de dados'
$segredo = Join-Path $APP '.segredo'
if (-not (Test-Path $segredo)) { Escrever-Sem-BOM $segredo ((Aleatorio 24) + "`n") }
$servico = Join-Path $APP '.servico.json'
if (-not (Test-Path $servico)) { Escrever-Sem-BOM $servico ('{"email":"servico@biblioteca.local","password":"' + (Aleatorio 20) + '"}' + "`n") }
$pass = (Get-Content $servico -Raw | ConvertFrom-Json).password
# (só neste computador, por omissão; muda-se em Definições)
$soLocal = Join-Path $APP '.so_local'
if (-not (Test-Path $soLocal)) { Escrever-Sem-BOM $soLocal '' }
$dados = Join-Path $APP 'pb_data'
& $pb migrate up --dir $dados --migrationsDir (Join-Path $APP 'pb_migrations') --hooksDir (Join-Path $APP 'pb_hooks') | Out-Null
& $pb superuser upsert servico@biblioteca.local $pass --dir $dados | Out-Null
if ($LASTEXITCODE) { throw 'Não consegui preparar a base de dados (PocketBase).' }

Write-Host '6/7  IA local (opcional)'
$ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama -and (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")) { $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
if ($ram -lt 16 -and -not $ComIA) {
  Write-Host "     (desligada: este computador tem $ram GB de memória e a IA local precisa de 16 GB; o resto funciona sem ela)"
} elseif ($ollama) {
  # (os modelos ficam na pasta normal do Ollama; um aviso do ollama não pode parar a instalação)
  $antes = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $lista = (& $ollama list 2>&1 | Out-String)
    if ($lista -notmatch 'qwen3-vl:8b-instruct') { Write-Host '     A descarregar o modelo (~6 GB)...'; & $ollama pull qwen3-vl:8b-instruct }
  } catch { Write-Host "     (a IA local não ficou pronta: $($_.Exception.Message))" }
  finally { $ErrorActionPreference = $antes }
} else {
  Write-Host '     (desligada: para a activar, instale o Ollama com «winget install Ollama.Ollama» e volte a correr a instalação)'
}

Write-Host '7/7  Atalho no Ambiente de Trabalho'
$bat = Join-Path $RAIZ 'Iniciar TINCTORIS.bat'
$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TINCTORIS.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
$s.TargetPath = $bat
$s.WorkingDirectory = $RAIZ
$s.Save()

Write-Host ''
Write-Host 'Instalação concluída. Para começar, faça duplo clique em «TINCTORIS» no Ambiente de Trabalho'
Write-Host "(ou em «Iniciar TINCTORIS.bat», na pasta $RAIZ)."
