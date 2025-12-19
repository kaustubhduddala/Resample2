import sys
import json
import logging
import argparse
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

        # 3. Handle parameter name mapping and defaults
        # Map CLI names to Separator class parameter names
        separator_params = {}
        
        # Common parameters
        if 'output_format' in params:
            separator_params['output_format'] = params.pop('output_format')
        if 'output_bitrate' in params and params['output_bitrate']:
            separator_params['output_bitrate'] = params.pop('output_bitrate')
        if 'model_file_dir' in params:
            separator_params['model_file_dir'] = params.pop('model_file_dir')
        if 'normalization_threshold' in params:
            separator_params['normalization_threshold'] = params.pop('normalization_threshold')
        if 'amplification_threshold' in params:
            separator_params['amplification_threshold'] = params.pop('amplification_threshold')
        if 'output_single_stem' in params and params['output_single_stem']:
            separator_params['output_single_stem'] = params.pop('output_single_stem')
        if 'sample_rate' in params:
            separator_params['sample_rate'] = params.pop('sample_rate')
        if 'use_soundfile' in params:
            separator_params['use_soundfile'] = params.pop('use_soundfile')
        if 'use_autocast' in params:
            separator_params['use_autocast'] = params.pop('use_autocast')
        if 'invert_using_spec' in params:
            separator_params['invert_using_spec'] = params.pop('invert_using_spec')
        if 'custom_output_names' in params and params['custom_output_names']:
            separator_params['custom_output_names'] = params.pop('custom_output_names')

        # Architecture-specific parameters - only include if provided
        # These will be passed as nested dictionaries
        if 'mdx_params' in params:
            separator_params['mdx_params'] = params.pop('mdx_params')
        if 'vr_params' in params:
            separator_params['vr_params'] = params.pop('vr_params')
        if 'demucs_params' in params:
            separator_params['demucs_params'] = params.pop('demucs_params')
        if 'mdxc_params' in params:
            separator_params['mdxc_params'] = params.pop('mdxc_params')

        # 4. Initialize Separator with the processed arguments
        separator = Separator(
            log_level=logging.INFO,
            output_dir=output_dir,
            **separator_params 
        )

        # 5. Load the specific model
        logger.info(f"Loading model: {model_filename}")
        separator.load_model(model_filename=model_filename)

        # 6. Perform separation
        logger.info(f"Separating: {file_path}")
        output_files = separator.separate(file_path)

        # 7. Return success
        print(json.dumps({"status": "success", "files": output_files}))

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error during separation: {error_trace}")
        print(json.dumps({"status": "error", "message": str(e), "traceback": error_trace}))
        sys.exit(1)

def list_models(list_filter=None, list_limit=None, list_format="json"):
    """List available models, optionally filtered and limited."""
    try:
        # Use Separator class to get model list (same as CLI does)
        separator = Separator(info_only=True)
        
        if list_format == "json":
            # Get full model list as JSON
            model_list = separator.list_supported_model_files()
            
            # Convert to list format expected by frontend
            models = []
            for filename, info in model_list.items():
                models.append({
                    "filename": filename,
                    "arch": info.get("Type", "Unknown"),
                    "output_stems": ", ".join(info.get("Stems", [])),
                    "friendly_name": info.get("Name", filename)
                })
            
            # Filter models if requested
            if list_filter and list_filter.lower() != "all":
                filter_lower = list_filter.lower()
                models = [
                    m for m in models
                    if (filter_lower in str(m.get('friendly_name', '')).lower() or
                        filter_lower in str(m.get('filename', '')).lower() or
                        filter_lower in str(m.get('output_stems', '')).lower() or
                        filter_lower in str(m.get('arch', '')).lower())
                ]
            
            # Limit results if requested
            if list_limit:
                try:
                    limit = int(list_limit)
                    models = models[:limit]
                except ValueError:
                    pass
            
            # Output only JSON - set logging to ERROR level to minimize output
            logging.getLogger().setLevel(logging.ERROR)
            # Print JSON to stdout
            print(json.dumps(models, indent=2))
        else:
            # Pretty table format using get_simplified_model_list
            models = separator.get_simplified_model_list(filter_sort_by=list_filter)
            
            # Apply limit if specified
            if list_limit and list_limit > 0:
                models = dict(list(models.items())[:list_limit])
            
            # Calculate maximum widths for each column
            filename_width = max(len("Model Filename"), max(len(filename) for filename in models.keys()) if models else 0)
            arch_width = max(len("Arch"), max(len(info["Type"]) for info in models.values()) if models else 0)
            stems_width = max(len("Output Stems (SDR)"), max(len(", ".join(info["Stems"])) for info in models.values()) if models else 0)
            name_width = max(len("Friendly Name"), max(len(info["Name"]) for info in models.values()) if models else 0)
            
            # Print header
            print(f"{'Model Filename':<{filename_width}} {'Arch':<{arch_width}} {'Output Stems (SDR)':<{stems_width}} {'Friendly Name':<{name_width}}")
            print("-" * (filename_width + arch_width + stems_width + name_width + 12))
            
            # Print models
            for filename, info in models.items():
                arch = info.get("Type", "Unknown")
                stems = ", ".join(info.get("Stems", []))
                friendly = info.get("Name", filename)
                print(f"{filename:<{filename_width}} {arch:<{arch_width}} {stems:<{stems_width}} {friendly:<{name_width}}")
        
        sys.exit(0)
    except Exception as e:
        import traceback
        error_msg = f"Error listing models: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

def download_model_only(model_filename, model_file_dir):
    """Download a model without performing separation."""
    try:
        separator = Separator(
            log_level=logging.INFO,
            model_file_dir=model_file_dir
        )
        logger.info(f"Downloading model: {model_filename}")
        separator.load_model(model_filename=model_filename)
        print(json.dumps({"status": "success", "message": f"Model {model_filename} downloaded successfully"}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Audio Engine - Audio separation binary')
    
    # Info and Debugging
    parser.add_argument('-v', '--version', action='store_true', help='Show version number and exit')
    parser.add_argument('-d', '--debug', action='store_true', help='Enable debug logging')
    parser.add_argument('-e', '--env_info', action='store_true', help='Print environment information and exit')
    parser.add_argument('-l', '--list_models', action='store_true', help='List all supported models and exit')
    parser.add_argument('--log_level', type=str, default='info', choices=['debug', 'info', 'warning', 'error'], help='Log level')
    parser.add_argument('--list_filter', type=str, help='Filter and sort the model list by name, filename, or stem type')
    parser.add_argument('--list_limit', type=int, help='Limit the number of models shown')
    parser.add_argument('--list_format', choices=['pretty', 'json'], default='json', help='Format for listing models')
    
    # Separation I/O Params
    parser.add_argument('-m', '--model_filename', type=str, help='Model to use for separation')
    parser.add_argument('--output_format', type=str, default='FLAC', help='Output format for separated files')
    parser.add_argument('--output_bitrate', type=str, help='Output bitrate for separated files (e.g., 320k)')
    parser.add_argument('--output_dir', type=str, help='Directory to write output files')
    parser.add_argument('--model_file_dir', type=str, default='/tmp/audio-separator-models/', help='Model files directory')
    parser.add_argument('--download_model_only', action='store_true', help='Download a model file only, without performing separation')
    
    # Common Separation Parameters
    parser.add_argument('--invert_spect', action='store_true', help='Invert secondary stem using spectrogram')
    parser.add_argument('--normalization', type=float, default=0.9, help='Max peak amplitude to normalize to (default: 0.9)')
    parser.add_argument('--amplification', type=float, default=0.0, help='Min peak amplitude to amplify to (default: 0.0)')
    parser.add_argument('--single_stem', type=str, help='Output only single stem (e.g., Instrumental, Vocals, Drums)')
    parser.add_argument('--sample_rate', type=int, default=44100, help='Sample rate of output audio (default: 44100)')
    parser.add_argument('--use_soundfile', action='store_true', help='Use soundfile to write audio output')
    parser.add_argument('--use_autocast', action='store_true', help='Use PyTorch autocast for faster inference')
    parser.add_argument('--custom_output_names', type=str, help='Custom names for output files in JSON format')
    
    # MDX Architecture Parameters
    parser.add_argument('--mdx_segment_size', type=int, default=256, help='MDX segment size (default: 256)')
    parser.add_argument('--mdx_overlap', type=float, default=0.25, help='MDX overlap 0.001-0.999 (default: 0.25)')
    parser.add_argument('--mdx_batch_size', type=int, default=1, help='MDX batch size (default: 1)')
    parser.add_argument('--mdx_hop_length', type=int, default=1024, help='MDX hop length (default: 1024)')
    parser.add_argument('--mdx_enable_denoise', action='store_true', help='Enable MDX denoising')
    
    # VR Architecture Parameters
    parser.add_argument('--vr_batch_size', type=int, default=1, help='VR batch size (default: 1)')
    parser.add_argument('--vr_window_size', type=int, default=512, help='VR window size (default: 512)')
    parser.add_argument('--vr_aggression', type=int, default=5, help='VR aggression -100 to 100 (default: 5)')
    parser.add_argument('--vr_enable_tta', action='store_true', help='Enable VR Test-Time-Augmentation')
    parser.add_argument('--vr_high_end_process', action='store_true', help='Enable VR high-end process')
    parser.add_argument('--vr_enable_post_process', action='store_true', help='Enable VR post-process')
    parser.add_argument('--vr_post_process_threshold', type=float, default=0.2, help='VR post-process threshold 0.1-0.3 (default: 0.2)')
    
    # Demucs Architecture Parameters
    parser.add_argument('--demucs_segment_size', type=str, default='Default', help='Demucs segment size (default: Default)')
    parser.add_argument('--demucs_shifts', type=int, default=2, help='Demucs shifts (default: 2)')
    parser.add_argument('--demucs_overlap', type=float, default=0.25, help='Demucs overlap 0.001-0.999 (default: 0.25)')
    parser.add_argument('--demucs_segments_enabled', type=lambda x: x.lower() == 'true', default=True, help='Enable Demucs segments (default: True)')
    
    # MDXC Architecture Parameters
    parser.add_argument('--mdxc_segment_size', type=int, default=256, help='MDXC segment size (default: 256)')
    parser.add_argument('--mdxc_override_model_segment_size', action='store_true', help='Override MDXC model default segment size')
    parser.add_argument('--mdxc_overlap', type=int, default=8, help='MDXC overlap 2-50 (default: 8)')
    parser.add_argument('--mdxc_batch_size', type=int, default=1, help='MDXC batch size (default: 1)')
    parser.add_argument('--mdxc_pitch_shift', type=int, default=0, help='MDXC pitch shift in semitones (default: 0)')
    
    # Positional arguments for JSON mode (Electron usage)
    parser.add_argument('input_file', nargs='?', help='Input audio file path (for JSON mode)')
    parser.add_argument('output_dir', nargs='?', help='Output directory path (for JSON mode)')
    parser.add_argument('options_json', nargs='?', default='{}', help='JSON options string (for JSON mode)')
    
    args = parser.parse_args()
    
    # Set log level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    else:
        log_level_map = {
            'debug': logging.DEBUG,
            'info': logging.INFO,
            'warning': logging.WARNING,
            'error': logging.ERROR,
        }
        logging.getLogger().setLevel(log_level_map.get(args.log_level.lower(), logging.INFO))
    
    # Handle version
    if args.version:
        try:
            from audio_separator import __version__
            print(f"audio-separator version: {__version__}")
        except:
            print("audio-separator version: unknown")
        sys.exit(0)
    
    # Handle env_info
    if args.env_info:
        try:
            import torch
            import onnxruntime as ort
            print("Environment Information:")
            print(f"PyTorch version: {torch.__version__}")
            print(f"ONNX Runtime version: {ort.__version__}")
            print(f"CUDA available: {torch.cuda.is_available()}")
            if torch.cuda.is_available():
                print(f"CUDA version: {torch.version.cuda}")
                print(f"GPU count: {torch.cuda.device_count()}")
            # Check for FFmpeg
            import subprocess
            try:
                result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    print("FFmpeg: installed")
                    print(result.stdout.split('\n')[0])
                else:
                    print("FFmpeg: not found")
            except:
                print("FFmpeg: not found")
        except Exception as e:
            print(f"Error getting environment info: {e}")
        sys.exit(0)
    
    # Handle CLI mode: list models
    if args.list_models:
        list_models(args.list_filter, args.list_limit, args.list_format)
    
    # Handle CLI mode: download model only
    if args.download_model_only:
        if not args.model_filename:
            print(json.dumps({"status": "error", "message": "model_filename is required for --download_model_only"}))
            sys.exit(1)
        download_model_only(args.model_filename, args.model_file_dir)
    
    # Handle separation mode
    # Check if we're in JSON mode (Electron) or CLI mode
    if args.input_file and args.output_dir:
        # JSON mode: use the options_json parameter
        if args.options_json and args.options_json != '{}':
            # JSON mode - parse the JSON string
            process_audio(args.input_file, args.output_dir, args.options_json)
        else:
            # CLI mode - build options from command-line arguments
            options = {}
            
            # Common parameters
            if args.model_filename:
                options['model_filename'] = args.model_filename
            if args.output_format:
                options['output_format'] = args.output_format
            if args.output_bitrate:
                options['output_bitrate'] = args.output_bitrate
            if args.output_dir:
                options['output_dir'] = args.output_dir
            if args.model_file_dir:
                options['model_file_dir'] = args.model_file_dir
            if args.invert_spect:
                options['invert_using_spec'] = True
            if args.normalization is not None:
                options['normalization_threshold'] = args.normalization
            if args.amplification is not None:
                options['amplification_threshold'] = args.amplification
            if args.single_stem:
                options['output_single_stem'] = args.single_stem
            if args.sample_rate:
                options['sample_rate'] = args.sample_rate
            if args.use_soundfile:
                options['use_soundfile'] = True
            if args.use_autocast:
                options['use_autocast'] = True
            if args.custom_output_names:
                try:
                    options['custom_output_names'] = json.loads(args.custom_output_names)
                except:
                    logger.warning(f"Failed to parse custom_output_names: {args.custom_output_names}")
            
            # Architecture-specific parameters - only include if set (not defaults)
            mdx_params = {}
            if args.mdx_segment_size != 256:
                mdx_params['segment_size'] = args.mdx_segment_size
            if args.mdx_overlap != 0.25:
                mdx_params['overlap'] = args.mdx_overlap
            if args.mdx_batch_size != 1:
                mdx_params['batch_size'] = args.mdx_batch_size
            if args.mdx_hop_length != 1024:
                mdx_params['hop_length'] = args.mdx_hop_length
            if args.mdx_enable_denoise:
                mdx_params['enable_denoise'] = True
            if mdx_params:
                options['mdx_params'] = mdx_params
            
            vr_params = {}
            if args.vr_batch_size != 1:
                vr_params['batch_size'] = args.vr_batch_size
            if args.vr_window_size != 512:
                vr_params['window_size'] = args.vr_window_size
            if args.vr_aggression != 5:
                vr_params['aggression'] = args.vr_aggression
            if args.vr_enable_tta:
                vr_params['enable_tta'] = True
            if args.vr_high_end_process:
                vr_params['high_end_process'] = True
            if args.vr_enable_post_process:
                vr_params['enable_post_process'] = True
            if args.vr_post_process_threshold != 0.2:
                vr_params['post_process_threshold'] = args.vr_post_process_threshold
            if vr_params:
                options['vr_params'] = vr_params
            
            demucs_params = {}
            if args.demucs_segment_size != 'Default':
                try:
                    demucs_params['segment_size'] = int(args.demucs_segment_size)
                except:
                    demucs_params['segment_size'] = args.demucs_segment_size
            if args.demucs_shifts != 2:
                demucs_params['shifts'] = args.demucs_shifts
            if args.demucs_overlap != 0.25:
                demucs_params['overlap'] = args.demucs_overlap
            if args.demucs_segments_enabled != True:
                demucs_params['segments_enabled'] = args.demucs_segments_enabled
            if demucs_params:
                options['demucs_params'] = demucs_params
            
            mdxc_params = {}
            if args.mdxc_segment_size != 256:
                mdxc_params['segment_size'] = args.mdxc_segment_size
            if args.mdxc_override_model_segment_size:
                mdxc_params['override_model_segment_size'] = True
            if args.mdxc_overlap != 8:
                mdxc_params['overlap'] = args.mdxc_overlap
            if args.mdxc_batch_size != 1:
                mdxc_params['batch_size'] = args.mdxc_batch_size
            if args.mdxc_pitch_shift != 0:
                mdxc_params['pitch_shift'] = args.mdxc_pitch_shift
            if mdxc_params:
                options['mdxc_params'] = mdxc_params
            
            # Convert to JSON and process
            options_json = json.dumps(options)
            process_audio(args.input_file, args.output_dir, options_json)
    else:
        # No input file - show help or error
        if len(sys.argv) == 1:
            parser.print_help()
        else:
            print(json.dumps({"status": "error", "message": "Missing required arguments: input_file and output_dir"}))
        sys.exit(1)