@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge.ps1" %*
exit /b %ERRORLEVEL%
