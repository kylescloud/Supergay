import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { config } from '../src/config';

/**
 * Test script to run the opportunity finder and show output
 */
async function testOpportunityFinder() {
  console.log('=== Testing Opportunity Finder ===\n');

  // Initialize provider
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  // Initialize opportunity finder
  const opportunityFinder = new OpportunityFinder(provider);

  console.log('Scanning for arbitrage opportunities...\n');
  console.log('Network: Base');
  console.log('Token: WETH');
  console.log('Amount: 10 ETH\n');
  console.log('Supported DEXs:');
  console.log('  1. Uniswap V4');
  console.log('  2. Uniswap V3');
  console.log('  3. Uniswap V2');
  console.log('  4. Curve Finance');
  console.log('  5. SushiSwap V3');
  console.log('  6. PancakeSwap V3');
  console.log('  7. Aerodrome Finance');
  console.log('  8. Aerodrome SlipStream');
  console.log('  9. Aerodrome SlipStream 2');
  console.log('  10. BaseSwap');
  console.log('\n' + '='.repeat(50) + '\n');

  try {
    // Find opportunities
    const opportunities = await opportunityFinder.findOpportunities(
      'WETH',
      BigInt('10000000000000000000') // 10 ETH
    );

    console.log(`\nFound ${opportunities.length} opportunity(ies):\n`);

    if (opportunities.length === 0) {
      console.log('No profitable opportunities found at this time.');
      console.log('\nThis is normal - opportunities depend on:');
      console.log('  - Price discrepancies between DEXs');
      console.log('  - Market volatility');
      console.log('  - Liquidity levels');
      console.log('  - Gas prices');
      console.log('\nTry running again when the market is more volatile.');
    } else {
      // Display top 5 opportunities
      const displayCount = Math.min(opportunities.length, 5);
      
      for (let i = 0; i < displayCount; i++) {
        const opp = opportunities[i];
        console.log(`\n[${i + 1}] Opportunity ID: ${opp.id}`);
        console.log(`    Expected Profit: $${opp.expectedProfitUSD.toFixed(4)}`);
        console.log(`    Net Profit: ${ethers.formatEther(opp.netProfit)} ETH`);
        console.log(`    Score: ${opp.score.toFixed(4)}`);
        console.log(`    Path: ${opp.path.map(t => t.symbol).join(' → ')}`);
        console.log(`    DEXs: ${opp.dexes.join(' → ')}`);
        console.log(`    Flash Loan Amount: ${ethers.formatEther(opp.loanAmount)} ETH`);
      }

      if (opportunities.length > displayCount) {
        console.log(`\n... and ${opportunities.length - displayCount} more opportunities`);
      }

      // Show statistics
      console.log('\n' + '='.repeat(50));
      console.log('\nOpportunity Statistics:');
      const avgProfit = opportunities.reduce((sum, opp) => sum + opp.expectedProfitUSD, 0) / opportunities.length;
      const maxProfit = Math.max(...opportunities.map(opp => opp.expectedProfitUSD));
      const minProfit = Math.min(...opportunities.map(opp => opp.expectedProfitUSD));
      
      console.log(`  Total Opportunities: ${opportunities.length}`);
      console.log(`  Average Profit: $${avgProfit.toFixed(4)}`);
      console.log(`  Max Profit: $${maxProfit.toFixed(4)}`);
      console.log(`  Min Profit: $${minProfit.toFixed(4)}`);
    }

  } catch (error) {
    console.error('Error scanning for opportunities:', error);
    console.error('\nPossible reasons:');
    console.error('  - RPC connection failed');
    console.error('  - Invalid RPC URL in .env');
    console.error('  - Network issues');
    console.error('  - DEX API rate limits');
  }

  console.log('\n' + '='.repeat(50));
  console.log('Scan complete!\n');
}

// Run the test
testOpportunityFinder()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });