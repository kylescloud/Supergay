#!/bin/bash

echo "=== Creating and pushing to SupergayV1 branch ==="
echo ""

# Create new branch
echo "Creating branch SupergayV1..."
git checkout -b SupergayV1

# Add all files
echo "Adding all files..."
git add -A

# Commit changes
echo "Committing changes..."
git commit -m "Production scan setup with 477 pools and comprehensive documentation

- Updated pool registry with 477 pools across multiple DEXs
- Created full-scan-detailed-logging.ts for production scanning
- Added comprehensive documentation for production scan execution
- Implemented 4 arbitrage strategies with detailed logging
- Added profit calculations with complete fee breakdowns
- Created pool discovery scripts for all 10 DEXs
- Added production bot with logging and Telegram alerts
- Updated configurations for all 14 Aave V3 flash loan tokens
- Created multi-RPC system with 8 public + 2 private nodes
- Added comprehensive testing and verification scripts"

# Check if remote exists
if git remote | grep -q origin; then
    echo "Pushing to remote..."
    git push -u origin SupergayV1
else
    echo "No remote 'origin' found. Please add a remote repository:"
    echo "  git remote add origin <your-repo-url>"
    echo "  git push -u origin SupergayV1"
fi

echo ""
echo "=== Setup Complete ==="
echo "Branch: SupergayV1"
echo "Files committed: $(git diff --name-only --cached | wc -l)"