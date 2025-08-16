# -*- mode: python ; coding: utf-8 -*-
block_cipher = None

# Get the site-packages path for the virtual environment
import os
import sys
from pathlib import Path

# Find the virtual environment site-packages
venv_path = Path('.venv')
site_packages = venv_path / 'lib' / 'python3.13' / 'site-packages'

# Ensure the audio-separator package is properly included
audio_separator_path = site_packages / 'audio_separator'

a = Analysis(
    ['audio_separator_wrapper.py'],
    pathex=[str(site_packages)],
    binaries=[],
    datas=[
        # Include the wrapper script
        ('audio_separator_wrapper.py', '.'),
        
        # Include all audio-separator data files
        (str(audio_separator_path / 'models.json'), 'audio_separator'),
        (str(audio_separator_path / 'model-data.json'), 'audio_separator'),
        (str(audio_separator_path / 'models-scores.json'), 'audio_separator'),
        
        # Include the entire audio-separator package structure
        (str(audio_separator_path), 'audio_separator'),
    ],
    collect_all=[
        'onnxruntime', 'audio_separator', 'torch', 'onnx2torch', 'ml_collections',
        'onnx', 'numpy', 'librosa', 'requests', 'six', 'tqdm', 'pydub'
    ],
    hiddenimports=[
        # Core audio-separator modules
        'audio_separator',
        'audio_separator.utils',
        'audio_separator.utils.cli',
        'audio_separator.separator',
        'audio_separator.separator.separator',
        'audio_separator.separator.architectures',
        'audio_separator.separator.architectures.mdx_separator',
        'audio_separator.separator.architectures.vr_separator',
        'audio_separator.separator.architectures.demucs_separator',
        'audio_separator.separator.architectures.mdxc_separator',
        'audio_separator.separator.uvr_lib_v5',
        'audio_separator.separator.uvr_lib_v5.vr_network',
        'audio_separator.separator.uvr_lib_v5.vr_network.model_param_init',
        'audio_separator.separator.uvr_lib_v5.vr_network.modelparams',
        
        # PyTorch modules
        'torch',
        'torch.nn',
        'torch.nn.functional',
        'torch.optim',
        'torch.utils.data',
        'torch.cuda',
        'torch.backends.cudnn',
        'torch.backends.mps',
        
        # ONNX modules
        'onnxruntime',
        'onnxruntime.capi.onnxruntime_pybind11_state',
        'onnxruntime.capi._pybind_state',
        'onnx2torch',
        'ml_collections',
        'ml_collections.config_dict',
        'onnx',
        
        # Audio processing modules
        'numpy',
        'librosa',
        'librosa.core',
        'librosa.feature',
        'librosa.util',
        'soundfile',
        'scipy',
        'scipy.signal',
        'scipy.io',
        'scipy.fft',
        'sklearn',
        'sklearn.metrics',
        'sklearn.utils',
        'numba',
        'llvmlite',
        'ffmpeg',
        'pydub',
        
        # Utility modules
        'requests',
        'six',
        'tqdm',
        'yaml',
        'json',
        'pathlib',
        'tempfile',
        'shutil',
        'subprocess',
        'multiprocessing',
        'threading',
        'queue',
        'pickle',
        'pickletools',
        'copy',
        'functools',
        'itertools',
        'collections',
        'contextlib',
        'typing',
        'typing_extensions',
        'importlib',
        'importlib.metadata',
        'importlib.resources',
        'pkg_resources',
        'setuptools',
        'setuptools._vendor',
        'setuptools._vendor.packaging',
        'setuptools._vendor.pyparsing',
        'setuptools._vendor.six',
        'setuptools._vendor.packaging.version',
        'setuptools._vendor.packaging.specifiers',
        'setuptools._vendor.packaging.requirements',
        'setuptools._vendor.packaging.markers',
        'setuptools._vendor.packaging.utils',
        'setuptools._vendor.packaging.tags',
        'setuptools._vendor.packaging.metadata',
        'setuptools._vendor.packaging.fields',
        'setuptools._vendor.packaging.legacy',
        'setuptools._vendor.jaraco',
        'setuptools._vendor.jaraco.text',
        'jaraco.text',
        'jaraco.text._local',
        'jaraco.text._abc',
        'pkg_resources._vendor.jaraco',
        'pkg_resources._vendor.jaraco.text',
        'pathlib._abc',
        'pathlib._local'
    ],
    hookspath=['.'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='audio-separator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='audio-separator'
)
 