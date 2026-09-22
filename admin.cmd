@echo off
rem Page d'admin locale de Mémoire Vive : réglages des projets, des familles,
rem des entrées et de la recherche. Double-cliquable (raccourci « Gérer Mémoire
rem Vive » sur le Bureau). La fenêtre reste ouverte tant que la page sert ;
rem Ctrl+C l'arrête. Les options de scripts\admin.py passent telles quelles
rem (ex. admin.cmd --port 8800).
chcp 65001 >nul
title Mémoire Vive - page d'admin
cd /d "%~dp0"

python scripts\admin.py %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" echo Échec : voir le message ci-dessus.
pause
exit /b %RC%
