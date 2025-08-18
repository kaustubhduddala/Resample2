#!/bin/bash

# yt-dlp Standalone Wrapper Script
# This script uses a bundled Python runtime and virtual environment
# NO SYSTEM PYTHON REQUIRED

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set the bundled Python runtime path (from virtual environment)
PYTHON_RUNTIME="$SCRIPT_DIR/.venv/bin/python3"

# Set the virtual environment path
VENV_PATH="$SCRIPT_DIR/.venv"

# Set the PATH to include our bundled ffmpeg
export PATH="$SCRIPT_DIR/ffmpeg:$PATH"

# Set Python environment variables
export PYTHONPATH="$VENV_PATH/lib/python3.13/site-packages:$PYTHONPATH"
export VIRTUAL_ENV="$VENV_PATH"

# Check if bundled Python exists
if [ ! -f "$PYTHON_RUNTIME" ]; then
    echo "Error: Bundled Python runtime not found at $PYTHON_RUNTIME"
    echo "This app requires the bundled Python runtime to be included."
    echo "Please run the setup script first: ./setup.sh"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo "Error: Virtual environment not found at $VENV_PATH"
    echo "This app requires the bundled virtual environment to be included."
    echo "Please run the setup script first: ./setup.sh"
    exit 1
fi

# Run yt-dlp using the bundled Python runtime
exec "$PYTHON_RUNTIME" -m yt_dlp "$@"




