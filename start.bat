@echo off
title MetricsEdu - One Connected Platform. One Smart Classroom
color 0b

echo ========================================================================
echo.
echo           __  __      _        _          ______     _       
echo          ^|  \/  ^|    ^| ^|      (_)        ^|  ____^|   ^| ^|      
echo          ^| \  / ^| ___^| ^|_ _ __ _  ___ ___^| ^|__   ___^| ^|_   _ 
echo          ^| ^|\/^| ^|/ _ \ __^| '__^| ^|/ __/ __^|  __^| / _ \ ^| ^| ^| ^|
echo          ^| ^|  ^| ^|  __/ ^|_^| ^|  ^| ^| (__\__ \ ^|___^|  __/ ^| ^|_^| ^|
echo          ^|_^|  ^|_^|\___^|\__^|_^|  ^|_^|\___^|___/______\___^|_^|\__,_^|
echo.
echo          "One Connected Platform. One Smart Classroom"
echo ========================================================================
echo.

echo [*] Initializing MetricsEdu Smart Classroom Environment...
echo.

:: 1. Check or Launch MongoDB Daemon
netstat -ano | findstr 27017 >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] Local MongoDB daemon already active on port 27017.
) else (
    echo [*] Starting local MongoDB daemon...
    if exist "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" (
        start "MetricsEdu MongoDB" "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath "%~dp0server\data\db" --port 27017 --bind_ip 127.0.0.1
    ) else if exist "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" (
        start "MetricsEdu MongoDB" "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath "%~dp0server\data\db" --port 27017 --bind_ip 127.0.0.1
    ) else (
        echo [!] Warning: mongod.exe not found at standard path. Ensure MongoDB is running.
    )
)

:: 2. Launch Node Express Backend Server (:5000)
echo [*] Starting Node.js / Express API Server on http://localhost:5000...
cd /d "%~dp0server"
start "MetricsEdu Backend API" cmd /k "title MetricsEdu API Server (Port 5000) && node server.js"

:: 3. Launch React / Vite Frontend Client (:5173)
echo [*] Starting React 18 / Vite Frontend Client on http://localhost:5173...
cd /d "%~dp0client"
start "MetricsEdu Web Client" cmd /k "title MetricsEdu Vite Client (Port 5173) && npm run dev -- --host 0.0.0.0"

:: Return to project root
cd /d "%~dp0"

echo.
echo ========================================================================
echo [✓] MetricsEdu Services Launched Successfully!
echo ========================================================================
echo.
echo  Default Actor Credentials for Login:
echo  -------------------------------------------------------------
echo  [1] Institutional Admin:
echo      Email:    admin@metricsedu.ac.in
echo      Password: adminpassword123
echo      Admin ID: ADM-2026-001
echo.
echo  [2] Faculty Lecturer (Division-C Coordinator):
echo      Email:    nandini.cv@metricsedu.ac.in
echo      Password: teacherpassword123
echo      Teacher:  Prof. Nandini C.V (Room AS-11)
echo.
echo  [3] Student (Division-C / Semester 5):
echo      USN:      1MS22CS001  (or 1MS22CS041 for Div-C)
echo      Password: studentpassword123
echo.
echo  [4] School Admin (K-12 Curriculum):
echo      Email:    schooladmin@metricsedu.ac.in
echo      Password: adminpassword123
echo      Admin ID: ADM-SCH-001
echo.
echo ========================================================================
echo [*] Opening browser to http://localhost:5173 in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Keep this terminal window open while working. Press any key to exit launcher.
pause >nul
