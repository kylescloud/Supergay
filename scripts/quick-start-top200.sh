#!/bin/bash

# Quick Start Script for Top 200 Base Tokens Pool Discovery
# This script sets up and runs the pool discovery system

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "  TOP 200 BASE TOKENS - QUICK START"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Create data directory if it doesn't exist
mkdir -p data
echo "✅ Data directory ready"
echo ""

# Step 1: Test with a small subset first
echo "🔍 Step 1: Testing with small subset (3 base tokens × 3 quote tokens)..."
echo ""

# Create a test configuration
cat > src/config/test-tokens.ts << 'EOF'
// Test configuration for quick start
export const TEST_QUOTE_TOKENS = {
  WBTC: '0x1cea84203673764244e05693e42e6ace62be9ba5',
  LINK: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196',
  AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
} as const;
EOF

echo "✅ Test configuration created"
echo ""

# Step 2: Run pool discovery
echo "🚀 Step 2: Running pool discovery..."
echo "   This may take 5-10 minutes for the test subset"
echo ""

npx ts-node scripts/discover-and-test.ts

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Pool discovery completed successfully!"
    echo ""
    
    # Check if pool registry was created
    if [ -f "data/pool-registry.json" ]; then
        echo "📊 Pool registry created: data/pool-registry.json"
        echo ""
        echo "📈 Statistics:"
        node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
        console.log(\`  - Total Pools: \${data.pools.length}\`);
        console.log(\`  - Active Pools: \${data.stats.activePools}\`);
        console.log(\`  - Pools by DEX:\`);
        Object.entries(data.stats.poolsByDEX).forEach(([dex, count]) => {
            console.log(\`    - \${dex}: \${count}\`);
        });
        "
        echo ""
    fi
    
    if [ -f "data/pool-registry.csv" ]; then
        echo "📄 CSV export created: data/pool-registry.csv"
        echo ""
    fi
    
    echo "═══════════════════════════════════════════════════════════════"
    echo "  SUCCESS!"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Next steps:"
    echo "  1. Review the pool registry: cat data/pool-registry.json"
    echo "  2. Analyze opportunities in the output above"
    echo "  3. Run full discovery for all 200 tokens:"
    echo "     npx ts-node scripts/discover-and-test.ts"
    echo ""
    echo "For more information, see docs/TOP_200_TOKENS_GUIDE.md"
    echo ""
else
    echo ""
    echo "❌ Pool discovery failed!"
    echo ""
    echo "Please check the error messages above and:"
    echo "  1. Verify RPC endpoints are working"
    echo "  2. Check network connectivity"
    echo "  3. Review logs for specific errors"
    echo ""
    exit 1
fi