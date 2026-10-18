@echo off
rem Inicia o TINCTORIS em Windows (o equivalente de «Iniciar TINCTORIS.command» do Mac): duplo clique.
rem Fechar esta janela pára tudo.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=%~dp0app\node;%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul || (
  echo O Node.js nao foi encontrado. Corra primeiro a instalacao: app\instalar.ps1
  pause
  exit /b 1
)
node "%~dp0app\iniciar.mjs"
if errorlevel 1 pause
