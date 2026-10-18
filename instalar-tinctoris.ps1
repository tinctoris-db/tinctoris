# Instala o TINCTORIS num computador Windows 11 com uma só linha (o equivalente de instalar-tinctoris.sh do Mac).
# Abrir o PowerShell e colar:
#   irm https://raw.githubusercontent.com/tinctoris-db/tinctoris/main/instalar-tinctoris.ps1 | iex
# Descarrega a versão publicada mais recente (sem Git) para a pasta TINCTORIS do utilizador e corre app\instalar.ps1.
# Para outra pasta: $env:TINCTORIS_PASTA = 'D:\TINCTORIS' antes de colar a linha.
# Para instalar a partir de um .zip já descarregado (ex.: numa pen, para testes): $env:TINCTORIS_ZIP = 'E:\tinctoris.zip'
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$REPOSITORIO = 'tinctoris-db/tinctoris'
$pasta = if ($env:TINCTORIS_PASTA) { $env:TINCTORIS_PASTA } else { Join-Path $HOME 'TINCTORIS' }

Write-Host ''
Write-Host "TINCTORIS: instalação em $pasta"
if (Test-Path (Join-Path $pasta 'app\worker\package.json')) {
  Write-Host 'O TINCTORIS já está instalado nesta pasta. Para actualizar, basta abri-lo: ele pergunta quando há uma versão nova.'
  return
}
$ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
if ($ram -lt 16) { Write-Host "(Aviso: $ram GB de memória. O TINCTORIS funciona; só a IA local, opcional, fica desligada.)" }

# Versão publicada mais recente (release); sem nenhuma, a do ramo principal
$url = "https://github.com/$REPOSITORIO/archive/refs/heads/main.zip"
if (-not $env:TINCTORIS_ZIP) { try {
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPOSITORIO/releases/latest" -Headers @{ 'User-Agent' = 'TINCTORIS' }
  if ($rel.zipball_url) { $url = $rel.zipball_url; Write-Host "Versão $($rel.tag_name -replace '^v', '')" }
} catch {} }
$tmp = Join-Path $env:TEMP ('tinctoris-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'tinctoris.zip'
  if ($env:TINCTORIS_ZIP) {
    Write-Host "A usar o programa em $env:TINCTORIS_ZIP"
    Copy-Item $env:TINCTORIS_ZIP $zip
  } else {
    Write-Host 'A descarregar o programa...'
    Invoke-WebRequest -Uri $url -OutFile $zip -Headers @{ 'User-Agent' = 'TINCTORIS' }
  }
  Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'x') -Force
  $dentro = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  Copy-Item -Path (Join-Path $dentro.FullName '*') -Destination $pasta -Recurse -Force
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
# (ficheiros descarregados da internet ficam marcados e o Windows bloqueia-os: desbloquear os do programa)
Get-ChildItem $pasta -Recurse -File | Unblock-File
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pasta 'app\instalar.ps1')
