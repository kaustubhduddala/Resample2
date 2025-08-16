#!/usr/bin/env python3
"""
yt-dlp wrapper script for building standalone binary
This script provides a command-line interface to yt-dlp functionality
"""

import sys
import os
from yt_dlp import main as yt_dlp_main

def main():
    """Main entry point for the yt-dlp wrapper"""
    # Pass all arguments directly to yt-dlp's main function
    # This ensures exact compatibility with the real yt-dlp package
    try:
        yt_dlp_main()
    except KeyboardInterrupt:
        print("\nDownload interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
