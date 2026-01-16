#!/bin/bash
set -e

echo "AI Study Assistant - Release Tool"
echo "===================================="
echo ""

# Check current version
if [ ! -f "package.json" ]; then
    echo "package.json not found!"
    exit 1
fi

current=$(node -p "require('./package.json').version")
echo "Current version: $current"
echo ""

# Calculate next versions
IFS='.' read -r major minor patch <<< "$current"
next_patch="$major.$minor.$((patch + 1))"
next_minor="$major.$((minor + 1)).0"
next_major="$((major + 1)).0.0"

# Choose version
echo "Release type:"
echo "  1) Patch (bug fixes)    - $current → $next_patch"
echo "  2) Minor (new features) - $current → $next_minor"
echo "  3) Major (big changes)  - $current → $next_major"
echo ""
read -p "Choice (1-3): " choice

case $choice in
    1) type="patch" ;;
    2) type="minor" ;;
    3) type="major" ;;
    *) echo "Invalid"; exit 1 ;;
esac

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo ""
    echo "⚠️  Uncommitted changes:"
    git status -s
    echo ""
    read -p "Commit now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        read -p "Commit message: " msg
        git commit -m "$msg"
    fi
fi

# Bump version
npm version $type --no-git-tag-version
new=$(node -p "require('./package.json').version")

echo ""
echo "✓ Version: $current → $new"

# Commit and tag
git add package.json package-lock.json
git commit -m "chore: bump version to $new"
git tag -a "v$new" -m "Release v$new"

echo "✓ Tagged: v$new"
echo ""

# Push
read -p "Push to GitHub? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin main
    git push origin "v$new"
    
    echo ""
    echo "Done! GitHub is building now..."
    echo ""
    repo=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')
    echo "Track: https://github.com/$repo/actions"
    echo "Release: https://github.com/$repo/releases/tag/v$new"
fi
