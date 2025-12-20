#!/bin/bash
set -e

echo "🐍 Building Python Backend"
echo "=========================="

# Verify frontend is built first
if [ ! -d "frontend/dist" ] || [ ! -f "frontend/dist/index.html" ]; then
    echo "❌ Frontend not built!"
    echo "Run: cd frontend && npm run build"
    exit 1
fi

echo "✓ Frontend found"

cd backend

# Check Python
python_version=$(python --version 2>&1 | awk '{print $2}')
echo "Using Python $python_version"

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -q -r requirements.txt
pip install -q pyinstaller

# Clean
echo ""
echo "Cleaning previous builds..."
rm -rf dist/ build/ 2>/dev/null || true

# Build
echo ""
echo "Building with PyInstaller..."
pyinstaller backend.spec

# Verify
echo ""
if [ -f "dist/backend.exe" ] || [ -f "dist/backend" ]; then
    echo "✅ Build successful!"
    ls -lh dist/
else
    echo "❌ Build failed!"
    exit 1
fi

cd ..
