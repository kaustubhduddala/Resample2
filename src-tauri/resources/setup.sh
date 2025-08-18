#!/bin/bash

# Audio Separator Setup Script
# This script sets up a self-contained virtual environment for audio-separator
# Works both locally and in GitHub Actions CI/CD

set -e  # Exit on any error

echo "🎵 Setting up unified environment for Audio Separator and yt-dlp..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📁 Working directory: $SCRIPT_DIR"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed or not in PATH"
    echo "Please install Python 3.8+ and try again"
    exit 1
fi

# Get Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
echo "🐍 Python version: $(python3 --version)"

# Check if Python version is sufficient (3.8+)
if [[ "$(printf '%s\n' "3.8" "$PYTHON_VERSION" | sort -V | head -n1)" != "3.8" ]]; then
    echo "❌ Error: Python 3.8+ is required, found $PYTHON_VERSION"
    exit 1
fi

# Remove existing virtual environment if it exists
if [ -d "$SCRIPT_DIR/.venv" ]; then
    echo "🗑️  Removing existing virtual environment..."
    rm -rf "$SCRIPT_DIR/.venv"
fi

# Create new virtual environment with --copies flag (CRUCIAL for self-contained)
echo "🔧 Creating new virtual environment with --copies flag..."
python3 -m venv "$SCRIPT_DIR/.venv" --copies

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source "$SCRIPT_DIR/.venv/bin/activate"

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📦 Installing dependencies from requirements.txt..."
if [ -f "$SCRIPT_DIR/requirements-mac.txt" ]; then
    pip install -r "$SCRIPT_DIR/requirements-mac.txt"
else
    echo "❌ Error: requirements-mac.txt not found"
    exit 1
fi

# Verify audio-separator installation
echo "✅ Verifying audio-separator installation..."
if python -c "import audio_separator; print('audio-separator version:', getattr(audio_separator, '__version__', 'unknown'))" 2>/dev/null; then
    echo "✅ audio-separator installed successfully"
else
    echo "❌ Error: audio-separator installation failed"
    exit 1
fi

# Verify yt-dlp installation
echo "✅ Verifying yt-dlp installation..."
if python -c "import yt_dlp; print('yt-dlp version:', getattr(yt_dlp, '__version__', 'unknown'))" 2>/dev/null; then
    echo "✅ yt-dlp installed successfully"
else
    echo "❌ Error: yt-dlp installation failed"
    exit 1
fi

# Verify Python is self-contained (not symbolic links)
echo "🔍 Verifying Python is self-contained..."
if [ -L "$SCRIPT_DIR/.venv/bin/python3" ]; then
    echo "❌ Error: Python is a symbolic link, not self-contained"
    echo "This means the --copies flag didn't work properly"
    exit 1
else
    echo "✅ Python is self-contained (actual file, not symbolic link)"
fi

# Make standalone wrapper scripts executable
echo "🔧 Making wrapper scripts executable..."
chmod +x "$SCRIPT_DIR/audio-separator-standalone.sh"
chmod +x "$SCRIPT_DIR/yt-dlp-standalone.sh"
if [ -f "$SCRIPT_DIR/audio-separator-standalone.bat" ]; then
    echo "✅ Windows audio-separator wrapper script ready"
fi
if [ -f "$SCRIPT_DIR/yt-dlp-standalone.bat" ]; then
    echo "✅ Windows yt-dlp wrapper script ready"
fi

# Test the standalone wrappers
echo "🧪 Testing standalone wrappers..."
if "$SCRIPT_DIR/audio-separator-standalone.sh" --help > /dev/null 2>&1; then
    echo "✅ Audio separator standalone wrapper test successful"
else
    echo "❌ Error: Audio separator standalone wrapper test failed"
    exit 1
fi

if "$SCRIPT_DIR/yt-dlp-standalone.sh" --help > /dev/null 2>&1; then
    echo "✅ yt-dlp standalone wrapper test successful"
else
    echo "❌ Error: yt-dlp standalone wrapper test failed"
    exit 1
fi

# Show final status
echo ""
echo "🎉 Audio Separator setup complete!"
echo ""
echo "📁 Virtual environment: $SCRIPT_DIR/.venv"
echo "🐍 Python executable: $SCRIPT_DIR/.venv/bin/python3"
echo "🎵 Audio separator: $SCRIPT_DIR/.venv/bin/audio-separator"
echo "📺 yt-dlp: $SCRIPT_DIR/.venv/bin/yt-dlp"
echo "📜 Audio separator wrapper: $SCRIPT_DIR/audio-separator-standalone.sh"
echo "📜 yt-dlp wrapper: $SCRIPT_DIR/yt-dlp-standalone.sh"
echo ""
echo "🚀 You can now:"
echo "   - Run audio separation locally: ./audio-separator-standalone.sh --help"
echo "   - Run yt-dlp locally: ./yt-dlp-standalone.sh --help"
echo "   - Build your Tauri app: cargo build"
echo "   - Deploy to GitHub Actions (this script will run there too)"
echo ""
echo "💡 Note: The virtual environment is self-contained and will be bundled with your app"
echo "   Users won't need Python or any dependencies installed on their system!"
