# Testing Audio Engine from Command Line

This guide explains how to test the `audio-engine` binary from the command line with the FFmpeg that was downloaded by the Electron app.

## Prerequisites

1. The Electron app must have been run at least once to download FFmpeg
2. The `audio-engine` binary must be built (located in `dist/audio-engine/`)
3. You need to know where FFmpeg was downloaded

## Finding FFmpeg Location

The FFmpeg binary is downloaded by the `ytdlp-nodejs` package. The location depends on your platform:

### macOS/Linux

FFmpeg is typically stored in:

- `~/Library/Application Support/ytdlp-nodejs/` (macOS)
- `~/.local/share/ytdlp-nodejs/` (Linux)

### Windows

FFmpeg is typically stored in:

- `%APPDATA%\ytdlp-nodejs\`

### Finding the Exact Path

You can find the exact FFmpeg path by:

1. **From the Electron app console**: When the app starts, it logs:

   ```
   FFmpeg found at: /path/to/ffmpeg
   ```

2. **From Node.js**: Run this in a Node.js REPL:

   ```javascript
   const { helpers } = require("ytdlp-nodejs");
   const ffmpegPath = helpers.findFFmpegBinary();
   console.log(ffmpegPath);
   ```

3. **Search manually**: Look for `ffmpeg` (or `ffmpeg.exe` on Windows) in the directories above.

## Setting Up PATH for Testing

### macOS/Linux

1. Find your FFmpeg directory (e.g., `~/Library/Application Support/ytdlp-nodejs/`)

2. Add it to PATH for the current terminal session:

   ```bash
   export PATH="~/Library/Application Support/ytdlp-nodejs:$PATH"
   ```

   Or use the absolute path:

   ```bash
   export PATH="/Users/yourusername/Library/Application Support/ytdlp-nodejs:$PATH"
   ```

3. Verify FFmpeg is accessible:
   ```bash
   which ffmpeg
   ffmpeg -version
   ```

### Windows (PowerShell)

1. Find your FFmpeg directory (e.g., `$env:APPDATA\ytdlp-nodejs\`)

2. Add it to PATH for the current PowerShell session:

   ```powershell
   $env:PATH = "$env:APPDATA\ytdlp-nodejs;$env:PATH"
   ```

   Or use the full path:

   ```powershell
   $env:PATH = "C:\Users\YourUsername\AppData\Roaming\ytdlp-nodejs;$env:PATH"
   ```

3. Verify FFmpeg is accessible:
   ```powershell
   Get-Command ffmpeg
   ffmpeg -version
   ```

### Windows (Command Prompt)

1. Find your FFmpeg directory

2. Add it to PATH for the current CMD session:

   ```cmd
   set PATH=%APPDATA%\ytdlp-nodejs;%PATH%
   ```

3. Verify FFmpeg is accessible:
   ```cmd
   where ffmpeg
   ffmpeg -version
   ```

## Testing Audio Engine

Once FFmpeg is in your PATH, you can test the audio-engine binary. The binary works exactly like the `audio-separator` CLI tool.

### Basic Test

```bash
# macOS/Linux
./dist/audio-engine/audio-engine "/path/to/input.mp3"

# Windows
.\dist\audio-engine\audio-engine.exe "C:\path\to\input.mp3"
```

### Advanced Test with CLI Options

```bash
# macOS/Linux
./dist/audio-engine/audio-engine \
  "/path/to/input.mp3" \
  --output_dir "/path/to/output/dir" \
  --output_format MP3 \
  --output_bitrate 320k \
  --model_filename "model_bs_roformer_ep_317_sdr_12.9755.ckpt"

# Windows (PowerShell)
.\dist\audio-engine\audio-engine.exe `
  "C:\path\to\input.mp3" `
  --output_dir "C:\path\to\output\dir" `
  --output_format MP3 `
  --output_bitrate 320k `
  --model_filename "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
```

### Testing Model Listing

```bash
# macOS/Linux - Pretty format
./dist/audio-engine/audio-engine --list_models

# macOS/Linux - JSON format
./dist/audio-engine/audio-engine --list_models --list_format=json

# Windows
.\dist\audio-engine\audio-engine.exe --list_models --list_format=json
```

### Testing Model Download

```bash
# macOS/Linux
./dist/audio-engine/audio-engine \
  --download_model_only \
  --model_filename "UVR_MDX.onnx" \
  --model_file_dir "/path/to/models"

# Windows
.\dist\audio-engine\audio-engine.exe `
  --download_model_only `
  --model_filename "UVR_MDX.onnx" `
  --model_file_dir "C:\path\to\models"
```

### View Help

```bash
# macOS/Linux
./dist/audio-engine/audio-engine --help

# Windows
.\dist\audio-engine\audio-engine.exe --help
```

## Troubleshooting

### FFmpeg Not Found

If you get an error about FFmpeg not being found:

1. **Verify FFmpeg exists**: Check that the file exists at the expected location
2. **Check PATH**: Run `echo $PATH` (macOS/Linux) or `echo %PATH%` (Windows) to verify FFmpeg directory is included
3. **Use absolute path**: You can also set the FFmpeg path directly in the environment:

   ```bash
   # macOS/Linux
   export FFMPEG_PATH="/path/to/ffmpeg"

   # Windows PowerShell
   $env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
   ```

### Binary Not Found

If the audio-engine binary is not found:

1. **Check build**: Make sure you've built the Python binary:

   ```bash
   cd src/py-service
   pyinstaller audio-engine.spec
   ```

2. **Check path**: Verify the binary exists at `dist/audio-engine/audio-engine` (or `.exe` on Windows)

### Permission Issues (macOS/Linux)

If you get permission denied:

```bash
chmod +x dist/audio-engine/audio-engine
```

## Example Test Script

Here's a complete example for macOS/Linux:

```bash
#!/bin/bash

# Find FFmpeg (adjust path as needed)
FFMPEG_DIR="$HOME/Library/Application Support/ytdlp-nodejs"

# Add to PATH
export PATH="$FFMPEG_DIR:$PATH"

# Verify FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: FFmpeg not found in PATH"
    exit 1
fi

echo "FFmpeg found: $(which ffmpeg)"
echo "FFmpeg version:"
ffmpeg -version | head -n 1

# Test audio-engine
INPUT_FILE="/path/to/your/audio.mp3"
OUTPUT_DIR="/path/to/output"

echo "Testing audio-engine..."
./dist/audio-engine/audio-engine "$INPUT_FILE" "$OUTPUT_DIR" '{"output_format": "MP3"}'
```

Save this as `test-audio-engine.sh`, make it executable (`chmod +x test-audio-engine.sh`), and run it.

## Notes

- The FFmpeg path is automatically added to PATH when the Electron app spawns the audio-engine process
- For command-line testing, you need to manually add it to your PATH
- The audio-engine binary expects FFmpeg to be available in the system PATH
- If you're testing in a different terminal session, you'll need to set PATH again

