# Audio Separator Setup

This directory contains the setup scripts and configuration for the self-contained audio separation system used in the Resample2 Tauri app.

## 🏗️ Architecture

The audio separation system is designed to be **completely self-contained** - users don't need Python, FFmpeg, or any other dependencies installed on their system. Everything is bundled with the app.

### Components

- **`.venv/`** - Virtual environment containing Python and audio-separator (created by setup script)
- **`audio-separator-standalone.sh`** - macOS/Linux wrapper script
- **`audio-separator-standalone.bat`** - Windows wrapper script
- **`requirements.txt`** - Python dependencies
- **`setup.sh`** - macOS/Linux setup script
- **`setup.bat`** - Windows setup script

## 🚀 Quick Start

### Local Development

1. **Run the setup script** to create the virtual environment:

   ```bash
   # macOS/Linux
   ./setup.sh

   # Windows
   setup.bat
   ```

2. **Test the standalone wrapper**:

   ```bash
   # macOS/Linux
   ./audio-separator-standalone.sh --help

   # Windows
   audio-separator-standalone.bat --help
   ```

3. **Build your Tauri app**:
   ```bash
   cd ../..
   cargo build
   ```

### GitHub Actions CI/CD

The setup scripts are automatically run in GitHub Actions workflows. The virtual environment is recreated from scratch on each build, ensuring consistency across different environments.

## 📋 Setup Script Features

### What the Setup Script Does

1. **Checks Python version** (requires 3.8+)
2. **Removes existing virtual environment** (if any)
3. **Creates new virtual environment** with `--copies` flag (CRUCIAL for self-contained)
4. **Installs all dependencies** from `requirements.txt`
5. **Verifies installation** and self-containment
6. **Makes wrapper scripts executable**
7. **Tests the standalone wrapper**

### Why `--copies` Flag is Important

The `--copies` flag creates **actual Python executable files** instead of symbolic links to system Python. This ensures:

- ✅ **No system Python dependency** - Everything is bundled
- ✅ **Cross-platform compatibility** - Works on any system
- ✅ **Self-contained deployment** - Users don't need Python installed

## 🔧 Customization

### Adding New Dependencies

1. **Add to `requirements.txt`**:

   ```
   your-package>=1.0.0
   ```

2. **Run setup script** to reinstall:
   ```bash
   ./setup.sh
   ```

### Modifying Wrapper Scripts

The wrapper scripts handle:

- **Environment variables** (PATH, PYTHONPATH, etc.)
- **Python executable path** (bundled from virtual environment)
- **FFmpeg path** (bundled separately)

## 🚨 Troubleshooting

### Common Issues

1. **"Python is a symbolic link" error**

   - Solution: Ensure you're using the `--copies` flag
   - Check: `ls -la .venv/bin/python*` should show actual files, not symlinks

2. **"FFmpeg not found" error**

   - Solution: Check the PATH in wrapper scripts
   - Verify: FFmpeg is bundled in `resources/ffmpeg/`

3. **"audio-separator not found" error**
   - Solution: Run the setup script to recreate virtual environment
   - Check: `requirements.txt` contains `audio-separator>=0.35.0`

### Verification Commands

```bash
# Check Python is self-contained
ls -la .venv/bin/python*

# Test standalone wrapper
./audio-separator-standalone.sh --help

# Verify virtual environment structure
tree .venv/ -L 2
```

## 📦 Bundle Configuration

The virtual environment is automatically bundled with your Tauri app via `tauri.conf.json`:

```json
{
  "bundle": {
    "resources": {
      "resources/audio-separator/.venv": "resources/audio-separator/.venv",
      "resources/audio-separator/audio-separator-standalone.sh": "resources/audio-separator/audio-separator-standalone.sh",
      "resources/audio-separator/audio-separator-standalone.bat": "resources/audio-separator/audio-separator-standalone.bat"
    }
  }
}
```

## 🎯 Benefits

- **No system dependencies** - Users can run your app immediately
- **Consistent environment** - Same setup across development and production
- **Easy deployment** - Setup scripts work in CI/CD and local development
- **Cross-platform** - Works on macOS, Windows, and Linux
- **Fast execution** - Audio separation in seconds, not minutes

## 📚 Additional Resources

- [audio-separator documentation](https://github.com/karaokenerds/python-audio-separator)
- [Tauri bundling guide](https://tauri.app/v2/guides/building/bundling/)
- [Python virtual environments](https://docs.python.org/3/tutorial/venv.html)
