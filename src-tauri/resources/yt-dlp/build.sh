#!/bin/bash

# Exit on any error
set -e

echo "🚀 Building yt-dlp binary for macOS..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed or not in PATH"
    exit 1
fi

# Check Python version (yt-dlp requires 3.9+)
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "🐍 Python version: $PYTHON_VERSION"

# Check if ffmpeg is available (recommended for yt-dlp)
if command -v ffmpeg &> /dev/null; then
    echo "✅ ffmpeg found: $(ffmpeg -version | head -n1)"
else
    echo "⚠️  ffmpeg not found. It's recommended to install ffmpeg for full yt-dlp functionality."
    echo "   You can install it with: brew install ffmpeg"
fi

# Create and activate virtual environment
echo "📦 Creating virtual environment..."
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip and install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Build the binary using PyInstaller
echo "🔨 Building binary with PyInstaller..."
pyinstaller yt_dlp.spec --noconfirm

# Check if build was successful
if [ -f "dist/yt-dlp/yt-dlp" ]; then
    echo "✅ Build successful! Binary created at dist/yt-dlp/yt-dlp"
    
    # Make the binary executable
    chmod +x dist/yt-dlp/yt-dlp
    
    # Test the binary
    echo "🧪 Testing the binary..."
    ./dist/yt-dlp/yt-dlp --help
    
    echo "🎉 Build completed successfully!"
    echo "📁 Binary location: dist/yt-dlp/yt-dlp"
    echo "💡 Note: For full functionality, ensure ffmpeg is available in your PATH"
else
    echo "❌ Build failed! Binary not found"
    exit 1
fi

# Deactivate virtual environment
deactivate
