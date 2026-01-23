import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import config from '../src/config/index';

/**
 * Real-time arbitrage scanner
 * Connects to the actual Base mainnet and finds real opportunities
 */
async function realtimeScan() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     BASE BLOCKCHAIN ARBITRAGE BOT - REAL-TIME SCAN        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize provider using multi-RPC system
    console.log('📡 Connecting to Base mainnet via Multi-RPC system...');
    const provider = config.getScanningProvider();
    
    // Test connection
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    console.log(`✅ Connected successfully`);
    console.log(`   Network: Base (Chain ID: ${network.chainId})`);
    console.log(`   Current Block: ${blockNumber}\n`);

    // Initialize Opportunity Finder
    console.log('🔍 Initializing Opportunity Finder...');
    const opportunityFinder = new OpportunityFinder(provider);
    console.log('✅ Opportunity Finder ready\n');

    // Display supported DEXs (from constants)
    console.log('📊 Supported DEXs (10 Total):');
    const supportedDEXs = [
      'Uniswap V4',
      'Uniswap V3',
      'Uniswap V2',
      'Curve Finance',
      'SushiSwap V3',
      'PancakeSwap V3',
      'Aerodrome Finance',
      'Aerodrome SlipStream',
      'Aerodrome SlipStream 2',
      'BaseSwap',
    ];
    supportedDEXs.forEach((dex, index) => {
      console.log(`   ${index + 1}. ${dex}`);
    });
    console.log();

    // Run opportunity finding
    console.log('💎 Scanning for arbitrage opportunities...');
    console.log('   Running 7 mathematical strategies...\n');
    
    const scanStartTime = Date.now();
    
    // Find opportunities with 10 ETH flash loan
    const loanAmount = ethers.parseEther('10');
    const opportunities = await opportunityFinder.findOpportunities('WETH', loanAmount);
    
    const scanTime = ((Date.now() - scanStartTime) / 1000).toFixed(2);

    console.log(`✅ Scan completed in ${scanTime}s\n`);

    // Display results
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    SCAN RESULTS                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (opportunities.length === 0) {
      console.log('📋 No profitable opportunities found at this time.');
      console.log('   This is normal in efficient markets.');
      console.log('   The bot will continue scanning for new opportunities.\n');
    } else {
      console.log(`✨ Found ${opportunities.length} potential arbitrage opportunities:\n`);

      // Sort by expectedProfitUSD (descending)
      const sortedOpps = opportunities.sort((a, b) => 
        b.expectedProfitUSD - a.expectedProfitUSD
      );

      sortedOpps.forEach((opp, index) => {
        console.log(`═══════════════════════════════════════════════════════════`);
        console.log(`🎯 Opportunity #${index + 1}`);
        console.log(`═══════════════════════════════════════════════════════════`);
        console.log(`ID:                     ${opp.id}`);
        console.log(`Base Token:             ${opp.baseToken.symbol}`);
        console.log(`Expected Profit (ETH):  ${ethers.formatEther(opp.expectedProfit)} ETH`);
        console.log(`Expected Profit (USD):  $${opp.expectedProfitUSD.toFixed(2)}`);
        console.log(`Net Profit (ETH):       ${ethers.formatEther(opp.netProfit)} ETH`);
        console.log(`Score:                  ${opp.score.toFixed(4)}`);
        console.log(`Entropy:                ${opp.entropy.toFixed(4)}`);
        
        // Build token path string
        const tokenPath = opp.path.map(t => t.symbol).join(' → ');
        console.log(`\nPath:`);
        console.log(`  ${tokenPath}`);
        
        // Show DEXs
        console.log(`\nDEXs:`);
        opp.dexes.forEach((dex, i) => {
          console.log(`  ${i + 1}. ${dex}`);
        });
        
        // Flash Loan details
        console.log(`\nFlash Loan:`);
        console.log(`  Amount:           ${ethers.formatEther(opp.loanAmount)} ETH`);
        console.log(`  Flash Fee:        ${ethers.formatEther(opp.flashFee)} ETH`);
        
        // Gas details
        console.log(`\nGas:`);
        console.log(`  Cost:             ${ethers.formatEther(opp.gasCost)} ETH`);
        
        // Liquidity details from pools
        if (opp.pools.length > 0) {
          const liquidityUSDs = opp.pools.map(p => {
            if (typeof p.liquidity === 'bigint') {
              return Number(ethers.formatEther(p.liquidity)) * 3000; // Rough estimate
            }
            return 0;
          });
          const minLiquidity = Math.min(...liquidityUSDs);
          const maxLiquidity = Math.max(...liquidityUSDs);
          
          console.log(`\nLiquidity:`);
          console.log(`  Min on Path:      $${minLiquidity.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
          console.log(`  Max on Path:      $${maxLiquidity.toLocaleString(undefined, {maximumFractionDigits: 0})}`);
        }
        
        console.log(`\nTimestamp:`);
        console.log(`  Block:            ${opp.blockNumber}`);
        console.log(`  Time:             ${new Date(opp.timestamp).toISOString()}`);
        console.log();
      });
    }

    // Display statistics
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    STATISTICS                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Block Number:       ${blockNumber}`);
    console.log(`Opportunities:      ${opportunities.length}`);
    
    if (opportunities.length > 0) {
      const profitsUSD = opportunities.map(o => o.expectedProfitUSD);
      const profitsETH = opportunities.map(o => Number(ethers.formatEther(o.expectedProfit)));
      
      const totalProfitUSD = profitsUSD.reduce((a, b) => a + b, 0);
      const avgProfitUSD = totalProfitUSD / opportunities.length;
      const maxProfitUSD = Math.max(...profitsUSD);
      const minProfitUSD = Math.min(...profitsUSD);
      
      const totalProfitETH = profitsETH.reduce((a, b) => a + b, 0);
      const maxProfitETH = Math.max(...profitsETH);
      const minProfitETH = Math.min(...profitsETH);

      console.log(`Average Profit:     $${avgProfitUSD.toFixed(2)} (${ethers.formatEther(avgProfitUSD / 3000)} ETH)`);
      console.log(`Max Profit:         $${maxProfitUSD.toFixed(2)} (${ethers.formatEther(maxProfitUSD / 3000)} ETH)`);
      console.log(`Min Profit:         $${minProfitUSD.toFixed(2)} (${ethers.formatEther(minProfitUSD / 3000)} ETH)`);
      console.log(`Total Potential:    $${totalProfitUSD.toFixed(2)} (${ethers.formatEther(totalProfitUSD / 3000)} ETH)`);
    }

    console.log();
    console.log(`Scan Time:          ${scanTime}s`);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    STRATEGIES USED                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const strategies = [
      '1. Multi-Hop Cyclic Arbitrage',
      '2. Fee-Tier Mispricing',
      '3. Liquidity Fragmentation',
      '4. Stable-Volatile Arbitrage',
      '5. Flash Loan Optimizer',
      '6. Gas Convexity Filter',
      '7. Time Decay Scoring'
    ];

    strategies.forEach(strategy => {
      console.log(strategy);
    });

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    NEXT SCAN                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('⏱️  Next scan will run on next block...');
    console.log('   The bot monitors continuously for new opportunities.\n');

    console.log('═════════════════════════════════════════════════════════════\n');
    console.log('✅ Real-time scan completed successfully!\n');

    return {
      blockNumber,
      opportunities,
      scanTime: parseFloat(scanTime)
    };

  } catch (error) {
    console.error('\n❌ Error during scan:');
    console.error(error);
    throw error;
  }
}

// Run the real-time scan
realtimeScan()
  .then((results) => {
    console.log('✓ Scan completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Scan failed:', error);
    process.exit(1);
  });