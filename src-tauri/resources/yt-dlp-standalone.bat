@echo off
REM yt-dlp Standalone Wrapper Script for Windows
REM This script uses a bundled Python runtime and virtual environment
REM NO SYSTEM PYTHON REQUIRED

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Set the bundled Python runtime path (from virtual environment)
set "PYTHON_RUNTIME=%SCRIPT_DIR%.venv\Scripts\python.exe"

REM Set the virtual environment path
set "VENV_PATH=%SCRIPT_DIR%.venv"

REM Set the PATH to include our bundled ffmpeg
set "PATH=%SCRIPT_DIR%ffmpeg;%PATH%"

REM Set Python environment variables
set "PYTHONPATH=%VENV_PATH%\Lib\site-packages;%PYTHONPATH%"
set "VIRTUAL_ENV=%VENV_PATH%"

REM Check if bundled Python exists
if not exist "%PYTHON_RUNTIME%" (
    echo Error: Bundled Python runtime not found at %PYTHON_RUNTIME%
    echo This app requires the bundled Python runtime to be included.
    echo Please run the setup script first: setup.bat
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "%VENV_PATH%" (
    echo Error: Virtual environment not found at %VENV_PATH%
    echo This app requires the bundled virtual environment to be included.
    echo Please run the setup script first: setup.bat
    pause
    exit /b 1
)

REM Run yt-dlp using the bundled Python runtime
"%PYTHON_RUNTIME%" -m yt_dlp %*




