@echo off
title Forest Fire Simulation

:: Очищення екрану
cls

echo [INFO] Checking if port 3001 is busy...

:: Закриваємо старі процеси на порту 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo [INFO] Killing process PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)

echo [INFO] Starting logger server...
start "Logger" cmd /k node logger.js

:: Чекаємо, щоб сервер встиг запуститися
timeout /t 2 >nul

echo [INFO] Building project with webpack...
npx webpack

:: Ще невеличка пауза
timeout /t 1 >nul

echo [INFO] Opening simulation map...
start "" "file:///%cd%/index.html"

exit /b
