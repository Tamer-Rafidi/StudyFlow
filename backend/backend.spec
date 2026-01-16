# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path

block_cipher = None

# Get paths - __file__ is not available in spec files, use os.getcwd()
backend_dir = Path(os.getcwd()).absolute()
project_root = backend_dir.parent
frontend_dist = project_root / 'frontend' / 'dist'

print("=" * 60)
print("PyInstaller Configuration")
print("=" * 60)
print(f"Backend dir: {backend_dir}")
print(f"Project root: {project_root}")
print(f"Frontend dist: {frontend_dist}")
print(f"Frontend exists: {frontend_dist.exists()}")

# Collect frontend files
frontend_datas = []

if frontend_dist.exists():
    print("\nCollecting frontend files...")
    
    # Walk through all files in frontend/dist
    for root, dirs, files in os.walk(str(frontend_dist)):
        for file in files:
            # Source file path
            src_file = Path(root) / file
            
            # Destination path (relative to 'frontend' in the bundle)
            rel_path = src_file.relative_to(frontend_dist)
            dest_dir = 'frontend' / rel_path.parent
            
            # Add to datas as tuple (source, destination)
            frontend_datas.append((str(src_file), str(dest_dir)))
    
    print(f"✓ Collected {len(frontend_datas)} frontend files")
    
    # Show first few files as verification
    if len(frontend_datas) > 0:
        print("\nFirst 5 files:")
        for src, dest in frontend_datas[:5]:
            print(f"  {Path(src).name} → {dest}")
    else:
        print("\nNo files collected!")
else:
    print("\nWARNING: Frontend not found!")
    print(f"Expected at: {frontend_dist}")
    print("Run: cd frontend && npm run build")

print("=" * 60)
print()

a = Analysis(
    ['main.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=frontend_datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'fastapi.routing',
        'fastapi.staticfiles',
        'pydantic',
        'pydantic.networks',
        'sqlalchemy',
        'sqlalchemy.ext.declarative',
        'sqlalchemy.orm',
        'PyPDF2',
        'openai',
        'starlette.staticfiles',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'pandas',
        'tkinter',
        'numpy.testing',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend',
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