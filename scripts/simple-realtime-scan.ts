import { ethers } from 'ethers';
import { OpportunityFinder } from '../src/opportunity/opportunityFinder';
import { StateSnapshotManager } from '../src/dex/stateSnapshot';
import { MultiHopArbitrageStrategy } from '../src/strategies/multiHopArbitrage';
import { FeeTierArbitrageStrategy } from '../src/strategies/feeTierArbitrage';
import config from '../src/config/index';
import { TOKENS } from '../src/config/constants';

/**
 * Simplified real-time arbitrage scanner
 * Focuses on working DEXs (V3, V2, Curve) to demonstrate real opportunities
 */
async function simpleRealtimeScan() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     BASE ARBITRAGE BOT - SIMPLIFIED REAL-TIME SCAN         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize provider
    console.log('📡 Connecting to Base mainnet...');
    const provider = config.getScanningProvider();
    
    // Test connection
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    console.log(`✅ Connected successfully`);
    console.log(`   Network: Base (Chain ID: ${network.chainId})`);
    console.log(`   Current Block: ${blockNumber}\n`);

    // Initialize State Snapshot Manager (handles V3, V2, Curve)
    console.log('🔧 Initializing State Snapshot Manager...');
    const stateSnapshotManager = new StateSnapshotManager(provider);
    console.log('✅ State Snapshot Manager ready\n');

    // Get WETH token - create proper Token object
    const baseToken = {
      address: TOKENS.WETH,
      symbol: 'WETH',
      decimals: 18,
      name: 'Wrapped Ether'
    };
    console.log('📊 Base Token:');
    console.log(`   Symbol: ${baseToken.symbol}`);
    console.log(`   Address: ${baseToken.address}\n`);

    // Build block snapshot (this fetches pool states from V3, V2, Curve)
    console.log('📈 Fetching pool states from DEXs...');
    console.log('   Scanning: Uniswap V3, Uniswap V2, Curve, SushiSwap V3, PancakeSwap V3...\n');
    
    const snapshotStartTime = Date.now();
    const snapshot = await stateSnapshotManager.buildBlockSnapshot(blockNumber);
    const snapshotTime = ((Date.now() - snapshotStartTime) / 1000).toFixed(2);
    
    console.log(`✅ Snapshot captured in ${snapshotTime}s`);
    console.log(`   Total Pools: ${snapshot.poolStates.size}\n`);

    // Initialize strategies
    console.log('🎯 Initializing arbitrage strategies...\n');
    
    const loanAmount = ethers.parseEther('10'); // 10 ETH flash loan
    
    const multiHopStrategy = new MultiHopArbitrageStrategy(provider, 4, 0.01);
    const feeTierStrategy = new FeeTierArbitrageStrategy(provider, 0.01);

    console.log('💎 Running strategies to find opportunities...\n');

    // Strategy 1: Multi-Hop Cyclic Arbitrage
    console.log('--- Strategy 1: Multi-Hop Cyclic Arbitrage ---');
    const multiHopStartTime = Date.now();
    const multiHopOpps = await multiHopStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    const multiHopTime = ((Date.now() - multiHopStartTime) / 1000).toFixed(2);
    console.log(`Found ${multiHopOpps.length} opportunities in ${multiHopTime}s\n`);

    // Strategy 2: Fee-Tier Mispricing Arbitrage
    console.log('--- Strategy 2: Fee-Tier Mispricing Arbitrage ---');
    const feeTierStartTime = Date.now();
    const feeTierOpps = await feeTierStrategy.findOpportunities(
      snapshot.poolStates,
      baseToken,
      loanAmount
    );
    const feeTierTime = ((Date.now() - feeTierStartTime) / 1000).toFixed(2);
    console.log(`Found ${feeTierOpps.length} opportunities in ${feeTierTime}s\n`);

    // Combine all opportunities
    const allOpportunities = [...multiHopOpps, ...feeTierOpps];

    // Display results
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    SCAN RESULTS                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (allOpportunities.length === 0) {
      console.log('📋 No profitable opportunities found at this time.');
      console.log('   This is normal in efficient markets.');
      console.log('   The bot scanned ' + snapshot.poolStates.size + ' pools across multiple DEXs.');
      console.log('   Continue monitoring for new opportunities.\n');
    } else {
      console.log(`✨ Found ${allOpportunities.length} potential arbitrage opportunities:\n`);

      // Sort by expectedProfitUSD (descending)
      const sortedOpps = allOpportunities.sort((a, b) => 
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
    console.log(`Total Pools:        ${snapshot.poolStates.size}`);
    console.log(`Opportunities:      ${allOpportunities.length}`);
    console.log(`Multi-Hop Opps:     ${multiHopOpps.length}`);
    console.log(`Fee-Tier Opps:     ${feeTierOpps.length}`);
    
    if (allOpportunities.length > 0) {
      const profitsUSD = allOpportunities.map(o => o.expectedProfitUSD);
      const totalProfitUSD = profitsUSD.reduce((a, b) => a + b, 0);
      const avgProfitUSD = totalProfitUSD / allOpportunities.length;
      const maxProfitUSD = Math.max(...profitsUSD);
      const minProfitUSD = Math.min(...profitsUSD);

      console.log(`Average Profit:     $${avgProfitUSD.toFixed(2)}`);
      console.log(`Max Profit:         $${maxProfitUSD.toFixed(2)}`);
      console.log(`Min Profit:         $${minProfitUSD.toFixed(2)}`);
      console.log(`Total Potential:    $${totalProfitUSD.toFixed(2)}`);
    }

    console.log();
    console.log(`Snapshot Time:      ${snapshotTime}s`);
    console.log(`Multi-Hop Time:     ${multiHopTime}s`);
    console.log(`Fee-Tier Time:      ${feeTierTime}s`);
    console.log(`Total Time:         ${(parseFloat(snapshotTime) + parseFloat(multiHopTime) + parseFloat(feeTierTime)).toFixed(2)}s`);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    DEXs SCANNED                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const scannedDEXs = [
      'Uniswap V3 (5 fee tiers)',
      'Uniswap V2',
      'Curve Finance',
      'SushiSwap V3',
      'PancakeSwap V3',
    ];

    scannedDEXs.forEach(dex => {
      console.log(`✓ ${dex}`);
    });

    console.log('\n═════════════════════════════════════════════════════════════\n');
    console.log('✅ Real-time scan completed successfully!\n');

    return {
      blockNumber,
      poolCount: snapshot.poolStates.size,
      opportunities: allOpportunities,
      scanTime: parseFloat(snapshotTime) + parseFloat(multiHopTime) + parseFloat(feeTierTime)
    };

  } catch (error) {
    console.error('\n❌ Error during scan:');
    console.error(error);
    throw error;
  }
}

// Run the simplified real-time scan
simpleRealtimeScan()
  .then((results) => {
    console.log('✓ Scan completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Scan failed:', error);
    process.exit(1);
  });