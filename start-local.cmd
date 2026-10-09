@echo off
setlocal
cd /d "%~dp0"
start "Hi-Market API" /D "%~dp0backend" php artisan serve --host=127.0.0.1 --port=8000
start "Hi-Market Frontend" /D "%~dp0" npm.cmd run dev -- --host 127.0.0.1
endlocal
