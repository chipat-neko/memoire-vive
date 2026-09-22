@echo off
rem Met à jour le site Mémoire Vive : reprise des commits que GitHub a en plus
rem (phase 2 : l'export quotidien publie aussi la nuit), export de la mémoire,
rem commit et push.
rem Double-cliquable. Les options de scripts\export.py passent telles quelles
rem (ex. exporter.cmd --dry-run).
chcp 65001 >nul
title Mémoire Vive - mise à jour du site
cd /d "%~dp0"

python scripts\export.py %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Terminé. Le site se met à jour en une à deux minutes :
    echo https://chipat-neko.github.io/memoire-vive/
) else (
    echo Échec : voir le message ci-dessus. Le dashboard tourne-t-il ^(start-memory-rest.ps1^) ?
)
echo.
pause
exit /b %RC%
