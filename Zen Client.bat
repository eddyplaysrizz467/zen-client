@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
if not exist node_modules (
  call "C:\Program Files\nodejs\npm.cmd" install
)
rem Launch Electron in the background so this terminal window can close.
start "" /min "C:\Program Files\nodejs\npm.cmd" start
exit /b 0
