#!/bin/bash

echo "=== GitHub Branch Setup - SupergayV1 ==="
echo ""

# Get GitHub personal access token
read -sp "Enter your GitHub Personal Access Token: " GITHUB_TOKEN
echo ""

# Get GitHub username
read -p "Enter your GitHub username: " GITHUB_USERNAME

# Get repository name
read -p "Enter your repository name: " REPO_NAME

echo ""
echo "=== Configuration ==="
echo "Username: $GITHUB_USERNAME"
echo "Repository: $REPO_NAME"
echo ""

# Create new branch
echo "Creating branch SupergayV1..."
git checkout -b SupergayV1
if [ $? -ne 0 ]; then
    echo "Error: Failed to create branch"
    exit 1
fi
echo "✓ Branch created"
echo ""

# Add all files
echo "Staging files..."
git add -A
if [ $? -ne 0 ]; then
    echo "Error: Failed to stage files"
    exit 1
fi
echo "✓ Files staged"
echo ""

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

if [ $? -ne 0 ]; then
    echo "Error: Failed to commit changes"
    exit 1
fi
echo "✓ Changes committed"
echo ""

# Check if remote exists
if git remote | grep -q origin; then
    echo "Remote 'origin' exists"
    # Update remote URL with token
    git remote set-url origin https://${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git
    echo "✓ Remote URL updated with token"
else
    echo "Adding new remote 'origin'..."
    git remote add origin https://${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git
    if [ $? -ne 0 ]; then
        echo "Error: Failed to add remote"
        exit 1
   
fi
echo ""

# Push to remote
echo "Pushing to GitHub..."
git push -u origin SupergayV1
if [ $? -ne 0 ]; then
    echo "Error: Failed to push to GitHub"
    echo ""
    echo "Possible issues:"
    echo "1. Invalid personal access token"
    echo "2. Token doesn't have 'repo' scope permissions"
    echo "3. Repository doesn't exist or you don't have access"
    echo "4. Incorrect username or repository name"
    echo ""
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo "✓ Branch: SupergayV1"
echo "✓ Pushed to: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/tree/SupergayV1"
echo ""
echo "View your branch at:"
echo "  https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/tree/SupergayV1"
echo ""