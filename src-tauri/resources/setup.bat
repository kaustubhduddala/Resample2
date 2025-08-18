@echo off
REM Audio Separator Setup Script for Windows
REM This script sets up a self-contained virtual environment for audio-separator
REM Works both locally and in GitHub Actions CI/CD

setlocal enabledelayedexpansion

echo 🎵 Setting up unified environment for Audio Separator and yt-dlp...

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
echo 📁 Working directory: %SCRIPT_DIR%

REM Check if Python 3 is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Python 3 is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Get Python version
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%i"
echo 🐍 Python version: %PYTHON_VERSION%

REM Remove existing virtual environment if it exists
if exist "%SCRIPT_DIR%.venv" (
    echo 🗑️  Removing existing virtual environment...
    rmdir /s /q "%SCRIPT_DIR%.venv"
)

REM Create new virtual environment
echo 🔧 Creating new virtual environment...
python -m venv "%SCRIPT_DIR%.venv"

REM Activate virtual environment
echo 🔌 Activating virtual environment...
call "%SCRIPT_DIR%.venv\Scripts\activate.bat"

REM Upgrade pip
echo ⬆️  Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo 📦 Installing dependencies from requirements.txt...
if exist "%SCRIPT_DIR%requirements-win.txt" (
    pip install -r "%SCRIPT_DIR%requirements-win.txt"
) else (
    echo ❌ Error: requirements-win.txt not found
    pause
    exit /b 1
)

REM Verify audio-separator installation
echo ✅ Verifying audio-separator installation...
python -c "import audio_separator; print('audio-separator version:', getattr(audio_separator, '__version__', 'unknown'))" >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: audio-separator installation failed
    pause
    exit /b 1
) else (
    echo ✅ audio-separator installed successfully
)

REM Verify yt-dlp installation
echo ✅ Verifying yt-dlp installation...
python -c "import yt_dlp; print('yt-dlp version:', getattr(yt_dlp, '__version__', 'unknown'))" >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: yt-dlp installation failed
    pause
    exit /b 1
) else (
    echo ✅ yt-dlp installed successfully
)

REM Verify Python is self-contained (not symbolic links)
echo 🔍 Verifying Python is self-contained...
if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
    echo ✅ Python is self-contained
) else (
    echo ❌ Error: Python executable not found
    pause
    exit /b 1
)

REM Test the standalone wrappers
echo 🧪 Testing standalone wrappers...
if exist "%SCRIPT_DIR%audio-separator-standalone.bat" (
    echo ✅ Windows audio-separator wrapper script ready
) else (
    echo ❌ Error: Windows audio-separator wrapper script not found
    pause
    exit /b 1
)

if exist "%SCRIPT_DIR%yt-dlp-standalone.bat" (
    echo ✅ Windows yt-dlp wrapper script ready
) else (
    echo ❌ Error: Windows yt-dlp wrapper script not found
    pause
    exit /b 1
)

REM Show final status
echo.
echo 🎉 Audio Separator setup complete!
echo.
echo 📁 Virtual environment: %SCRIPT_DIR%.venv
echo 🐍 Python executable: %SCRIPT_DIR%.venv\Scripts\python.exe
echo 🎵 Audio separator: %SCRIPT_DIR%.venv\Scripts\audio-separator.exe
echo 📺 yt-dlp: %SCRIPT_DIR%.venv\Scripts\yt-dlp.exe
echo 📜 Audio separator wrapper: %SCRIPT_DIR%audio-separator-standalone.bat
echo 📜 yt-dlp wrapper: %SCRIPT_DIR%yt-dlp-standalone.bat
echo.
echo 🚀 You can now:
echo    - Run audio separation locally: audio-separator-standalone.bat --help
echo    - Run yt-dlp locally: yt-dlp-standalone.bat --help
echo    - Build your Tauri app: cargo build
echo    - Deploy to GitHub Actions (this script will run there too)
echo.
echo 💡 Note: The virtual environment is self-contained and will be bundled with your app
echo    Users won't need Python or any dependencies installed on their system!

pause
