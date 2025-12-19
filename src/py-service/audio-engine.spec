# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# --- 1. DYNAMIC PATH FINDER ---
# This block ensures the build works on Local Mac, Local Windows, AND GitHub Actions
# regardless of where you run the command from.

cwd = os.getcwd()
possible_paths = [
    # 1. GitHub Actions / Standard Root run (src/py-service)
    os.path.join(cwd, 'src', 'py-service', 'main.py'),
    # 2. Alternative Root run (py-service)
    os.path.join(cwd, 'py-service', 'main.py'),
    # 3. Running directly inside the folder
    os.path.join(cwd, 'main.py'),
    # 4. Your specific local absolute path (Fallback)
    '/Users/kaustubhduddala/Documents/PJW/projectwampus/Resample2/src/py-service/main.py'
]

script_path = None
for p in possible_paths:
    if os.path.exists(p):
        script_path = p
        print(f"Found entry point at: {script_path}")
        break

if not script_path:
    raise FileNotFoundError("Could not find main.py! Please run this from the project root.")

# --- 2. SETUP: Force-collect hidden dependencies ---
datas = []
binaries = []
hiddenimports = []

# Collect everything for audio-separator (the main library)
tmp_ret = collect_all('audio_separator')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Collect ONNX Runtime (essential for the AI models)
tmp_ret = collect_all('onnxruntime')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Collect Torch (The heavy lifter - this ensures all C++ libs are included)
tmp_ret = collect_all('torch')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Add specific hidden imports that often break in scientific packages
hiddenimports += [
    'sklearn.utils._cython_blas', 
    'sklearn.neighbors.typedefs',
    'sklearn.neighbors.quad_tree',
    'sklearn.tree',
    'sklearn.tree._utils',
    'scipy.special.cython_special',
    'scipy.spatial.transform._rotation_groups'
]

# --- 3. ANALYSIS ---
a = Analysis(
    [script_path],               # <-- Uses the dynamically found path
    pathex=[],
    binaries=binaries,           # <-- Injects collected binaries
    datas=datas,                 # <-- Injects collected data
    hiddenimports=hiddenimports, # <-- Injects collected imports
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# --- 4. BUILD ---
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='audio-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True, # Keep True for debugging via Electron stdout
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# --- 5. COLLECT ---
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='audio-engine',
)