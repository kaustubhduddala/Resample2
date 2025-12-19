import sys
import json
import logging
from audio_separator.separator import Separator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def process_audio(file_path, output_dir, options_json="{}"):
    try:
        # 1. Parse the JSON options from Electron
        # Example: {"output_format": "mp3", "model_filename": "UVR_MDX.onnx"}
        params = json.loads(options_json)

        # 2. Extract 'model_filename' specifically
        # The library requires model_filename in load_model(), not __init__
        model_filename = params.pop('model_filename', 'model_bs_roformer_ep_317_sdr_12.9755.ckpt')

        # 3. Initialize Separator with the rest of the arguments
        # **params unpacks the dictionary into arguments: output_format="mp3", etc.
        separator = Separator(
            log_level=logging.INFO,
            output_dir=output_dir,
            **params 
        )

        # 4. Load the specific model
        logger.info(f"Loading model: {model_filename}")
        separator.load_model(model_filename=model_filename)

        # 5. Perform separation
        logger.info(f"Separating: {file_path}")
        output_files = separator.separate(file_path)

        # 6. Return success
        print(json.dumps({"status": "success", "files": output_files}))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"status": "error", "message": "Missing arguments"}))
        sys.exit(1)

    input_file = sys.argv[1]
    out_dir = sys.argv[2]
    
    # Check for optional 3rd argument (JSON config)
    extra_options = sys.argv[3] if len(sys.argv) > 3 else "{}"
    
    process_audio(input_file, out_dir, extra_options)