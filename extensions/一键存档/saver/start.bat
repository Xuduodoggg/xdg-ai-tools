@echo off
rem ============================================
rem  Web Note Saver - launcher (ASCII only)
rem  Auto-find a real Python, install deps,
rem  then start saver.py. Keep this window open.
rem ============================================
cd /d "%~dp0"

set "PYEXE="

rem 1) scan common install dirs first (skip MS Store stub)
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*" "C:\Python*") do (
    if not defined PYEXE (
        if exist "%%D\python.exe" (
            "%%D\python.exe" --version >nul 2>nul && set "PYEXE=%%D\python.exe"
        )
    )
)

rem 2) fallback: python from PATH (must be really runnable)
if not defined PYEXE (
    where python >nul 2>nul && python --version >nul 2>nul && set "PYEXE=python"
)

if not defined PYEXE (
    echo [ERROR] Python was not found on this PC.
    echo Please install Python from https://www.python.org/downloads/
    echo and check "Add python.exe to PATH" during install.
    pause
    exit /b 1
)

echo Using Python: "%PYEXE%"

rem ---- check deps, auto install on first run ----
"%PYEXE%" -c "import pyperclip, pystray" >nul 2>nul
if errorlevel 1 (
    echo First run: installing dependencies, please wait...
    "%PYEXE%" -m pip install pyperclip pystray pillow
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies. Check your network.
        echo You can also install them manually:
        echo   "%PYEXE%" -m pip install pyperclip pystray pillow
        pause
        exit /b 1
    )
)

rem ---- start the tool (keep this window open) ----
"%PYEXE%" saver.py
pause
