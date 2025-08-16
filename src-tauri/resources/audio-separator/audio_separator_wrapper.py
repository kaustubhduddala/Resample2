#!/usr/bin/env python3
import sys
from audio_separator.utils.cli import main  # CLI entrypoint (this exists in the package)

if __name__ == "__main__":
    sys.exit(main())  # forward CLI args & exit code
