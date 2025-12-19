import sys
import json
import logging
import os
from audio_separator.separator import Separator

# Configure logging to capture output for Electron
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def process_audio(file_path, model_name=None, output_dir=None, model_file_dir=None, ffmpeg_path=None):
    try:
        # Set up environment for FFmpeg if path is provided
        if ffmpeg_path:
            # Add ffmpeg directory to PATH
            ffmpeg_dir = os.path.dirname(ffmpeg_path)
            current_path = os.environ.get('PATH', '')
            if ffmpeg_dir not in current_path:
                os.environ['PATH'] = f"{ffmpeg_dir}{os.pathsep}{current_path}"
            logger.info(f"FFmpeg path configured: {ffmpeg_path}")
        
        # Default model directory if not provided
        if not model_file_dir:
            model_file_dir = os.path.join(os.path.expanduser("~"), ".audio-separator-models")
        
        # Ensure model directory exists
        os.makedirs(model_file_dir, exist_ok=True)
        
        # Initialize Separator
        separator = Separator(
            log_level=logging.INFO,
            model_file_dir=model_file_dir,
            output_dir=output_dir
        )

        # Load the model (if model_name is provided, use it; otherwise use default)
        if model_name:
            logger.info(f"Loading model: {model_name}")
            separator.load_model(model_filename=model_name)
        else:
            logger.info("Loading default model")
            separator.load_model()

        # Perform separation
        logger.info(f"Separating: {file_path}")
        output_files = separator.separate(file_path)

        # Print JSON to stdout so Electron can parse it
        print(json.dumps({"status": "success", "files": output_files}))

    except Exception as e:
        # Print error JSON with traceback for debugging
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error during separation: {error_trace}")
        print(json.dumps({"status": "error", "message": str(e), "traceback": error_trace}))
        sys.exit(1)

if __name__ == "__main__":
    # Parse arguments: <input_file> <output_dir> [model_name] [model_file_dir] [ffmpeg_path]
    if len(sys.argv) < 3:
        print(json.dumps({"status": "error", "message": "Missing required arguments: input_file and output_dir"}))
        sys.exit(1)

    input_file = sys.argv[1]
    out_dir = sys.argv[2]
    model_name = sys.argv[3] if len(sys.argv) > 3 else None
    model_file_dir = sys.argv[4] if len(sys.argv) > 4 else None
    ffmpeg_path = sys.argv[5] if len(sys.argv) > 5 else None
    
    process_audio(
        input_file, 
        model_name=model_name,
        output_dir=out_dir,
        model_file_dir=model_file_dir,
        ffmpeg_path=ffmpeg_path
    )