@echo off
setlocal EnableDelayedExpansion
title Glenthorpe Cattleitics Launcher
echo =======================================================================
echo          GLENTHORPE CATTLEITICS - CATTLE ^& HERD MANAGEMENT
echo =======================================================================
echo.

:: Change to the directory where this batch file lives
cd /d "%~dp0"

:: Try to locate node.exe directly
set "NODE_EXE="

:: Check common install locations
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    goto FOUND_NODE
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
    goto FOUND_NODE
)

:: Check user-local install locations
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    goto FOUND_NODE
)

:: Last resort: check if node is on PATH already
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where node') do (
        set "NODE_EXE=%%i"
        goto FOUND_NODE
    )
)

:: Node not found anywhere
echo  [!] NOTIFICATION: Node.js was not found on this computer.
echo.
echo  Glenthorpe Cattleitics runs in a hybrid mode. You have two easy choices:
echo.
echo  -----------------------------------------------------------------
echo  CHOICE A: RUN OFFLINE NOW (Zero Softwares Needed!)
echo  -----------------------------------------------------------------
echo  Simply double-click the "index.html" file inside this folder!
echo  This runs Cattleitics instantly in Offline Browser Mode.
echo  - 100%% Free and operates offline without internet.
echo  - Requires NO installations or technical setups.
echo  - Saves all cattle records securely in your browser's private cache.
echo.
echo  -----------------------------------------------------------------
echo  CHOICE B: RUN EXCEL SPREADSHEET SYNC MODE (Requires Node.js)
echo  -----------------------------------------------------------------
echo  To sync records with physical Excel spreadsheets (data/cattle.csv),
echo  you need to install a free system package called Node.js.
echo.
echo  1. Download the free Windows Installer from: https://nodejs.org
echo  2. Install it using the standard default settings.
echo  3. Double-click this launcher again!
echo.
echo =======================================================================
echo.

set /p choice="Would you like us to open the Node.js download page for you? (Y/N): "
if /i "%choice%"=="Y" (
    start "" "https://nodejs.org"
)
pause
exit /b

:FOUND_NODE
echo  [OK] Found Node.js at: "!NODE_EXE!"
echo.
echo  Starting local Node.js database synchronization server...
echo  The application dashboard will open automatically in your web browser.
echo.
echo  - To save and close the application safely, use the "Shutdown Server"
echo    button directly inside the sidebar menu of the app.
echo  - Keep this terminal window open while working.
echo.
echo =======================================================================
echo.

:: Launch the default browser pointing to the localhost address
start "" "http://localhost:3000"

:: Start the node server process using the full path to node.exe
"!NODE_EXE!" server.js

echo.
echo  Server process terminated. Thank you for using Glenthorpe Cattleitics!
echo.
pause
