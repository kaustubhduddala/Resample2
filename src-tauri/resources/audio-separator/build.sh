#!/bin/bash

# Exit on any error
set -e

echo "🚀 Building audio-separator binary for macOS..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed or not in PATH"
    exit 1
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
pyinstaller audio_separator.spec --noconfirm

# Check if build was successful
if [ -f "dist/audio-separator/audio-separator" ]; then
    echo "✅ Build successful! Binary created at dist/audio-separator/audio-separator"
    
    # Make the binary executable
    chmod +x dist/audio-separator/audio-separator
    
    # Test the binary
    echo "🧪 Testing the binary..."
    ./dist/audio-separator/audio-separator --help
    
    echo "🎉 Build completed successfully!"
    echo "📁 Binary location: dist/audio-separator/audio-separator"
else
    echo "❌ Build failed! Binary not found"
    exit 1
fi

# Deactivate virtual environment
deactivate
