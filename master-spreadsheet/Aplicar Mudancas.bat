@echo off
rem Aplica o balanceamento da planilha (dados_do_jogo.xlsx) ao jogo.
rem Equivalente a rodar "npm run planilha:aplicar" na raiz do projeto.
cd /d "%~dp0.."
node scripts\sync-planilha.js
echo.
pause
