@echo off
rem Met à jour le site Mémoire Vive : export de la mémoire, commit et push.
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
