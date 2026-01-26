import { PoolRegistryManager } from '../src/pools/registry.js';
import { ArbitrageBot } from '../src/index.js';
import { ethers } from 'ethers';

// Flash loan tokens for Base (only WETH and USDC supported by OpportunityFinder)
const FLASH_LOAN_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
};

// Loan amounts to test
const LOAN_AMOUNTS = [1.0, 5.0, 10.0]; // In token units

interface ScanResult {
  token: string;
  amount: number;
  opportunities: any[];
  scanDuration: number;
  error?: string;
}

async function runScanner() {
  console.log('=== 🚀 Base Pool Opportunity Scanner ===\n');
  
  const results: ScanResult[] = [];
  const startTime = Date.now();
  
  try {
    // Load pool registry
    console.log('📊 Loading pool registry...');
    const registry = new PoolRegistryManager();
    await registry.load();
    
    const allPools = registry.getAllPools();
    const poolsWithState = allPools.filter(p => 
      (p.reserve0 && p.reserve1) || (p.liquidity && p.sqrtPriceX96)
    );
    
    console.log(`✅ Registry loaded: ${poolsWithState.length} pools with state data\n`);
    
    // Initialize RPC provider
    console.log('🌐 Initializing RPC provider...');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
    console.log('✅ Provider initialized\n');
    
    // Test each flash loan token with different amounts
    for (const [tokenName, tokenAddress] of Object.entries(FLASH_LOAN_TOKENS)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing ${tokenName} (${tokenAddress})`);
      console.log(`${'='.repeat(60)}\n`);
      
      for (const amount of LOAN_AMOUNTS) {
        const tokenStartTime = Date.now();
        console.log(`\n🔍 Scanning with ${amount} ${tokenName}...`);
        console.log('   Finding multi-hop arbitrage paths...');
        
        try {
          // Run opportunity finder
          const { OpportunityFinder } = await import('../src/opportunity/opportunityFinder.js');
          const finder = new OpportunityFinder(
            provider,
            tokenName, // Base token
            { skipPoolDiscovery: true, dataDir: './data' } // Use existing registry
          );
          
          await finder.initialize(); // Initialize the finder
          
          const opportunities = await finder.findOpportunities(
            tokenName, // Use token symbol instead of address
            ethers.parseUnits(amount.toString(), tokenName === 'USDC' ? 6 : 18),
            false // Don't refresh pools
          );
          
          const scanDuration = Date.now() - tokenStartTime;
          
          results.push({
            token: tokenName,
            amount: amount,
            opportunities: opportunities,
            scanDuration: scanDuration
          });
          
          console.log(`   ✅ Scan completed in ${scanDuration}ms`);
          console.log(`   📈 Found ${opportunities.length} opportunities`);
          
          // Display top 3 opportunities
          if (opportunities.length > 0) {
            console.log(`\n   🎯 Top Opportunities:`);
            opportunities.slice(0, 3).forEach((opp, idx) => {
              const profitPercent = ((opp.expectedProfit / opp.loanAmount) * 100).toFixed(4);
              console.log(`      ${idx + 1}. Path: ${opp.path.length} hops`);
              console.log(`         Expected Profit: ${profitPercent}%`);
              console.log(`         Gas Cost: ${opp.estimatedGas} gas`);
              console.log(`         Net Profit: $${opp.netProfit.toFixed(4)}`);
            });
          }
          
        } catch (error) {
          const scanDuration = Date.now() - tokenStartTime;
          console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          results.push({
            token: tokenName,
            amount: amount,
            opportunities: [],
            scanDuration: scanDuration,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
        // Add delay between scans to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Generate summary report
    const totalDuration = Date.now() - startTime;
    generateSummaryReport(results, totalDuration, poolsWithState.length);
    
  } catch (error) {
    console.error('\n❌ Fatal error during scanning:', error);
    throw error;
  }
}

function generateSummaryReport(results: ScanResult[], totalDuration: number, poolCount: number) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SCAN SUMMARY REPORT');
  console.log(`${'='.repeat(60)}\n`);
  
  const totalScans = results.length;
  const successfulScans = results.filter(r => r.opportunities.length > 0).length;
  const failedScans = results.filter(r => r.error).length;
  
  const totalOpportunities = results.reduce((sum, r) => sum + r.opportunities.length, 0);
  const avgScanTime = results.reduce((sum, r) => sum + r.scanDuration, 0) / totalScans;
  
  console.log(`🎯 Pools Scanned: ${poolCount}`);
  console.log(`⏱️  Total Scan Time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`📊 Total Scans: ${totalScans}`);
  console.log(`✅ Successful Scans: ${successfulScans}`);
  console.log(`❌ Failed Scans: ${failedScans}`);
  console.log(`📈 Total Opportunities Found: ${totalOpportunities}`);
  console.log(`⚡ Average Scan Time: ${avgScanTime.toFixed(0)}ms`);
  
  // Breakdown by token
  console.log(`\n${'─'.repeat(60)}`);
  console.log('OPPORTUNITIES BY TOKEN');
  console.log(`${'─'.repeat(60)}`);
  
  const tokenStats = new Map<string, { opportunities: number; scans: number }>();
  
  for (const result of results) {
    if (!tokenStats.has(result.token)) {
      tokenStats.set(result.token, { opportunities: 0, scans: 0 });
    }
    const stats = tokenStats.get(result.token)!;
    stats.opportunities += result.opportunities.length;
    stats.scans++;
  }
  
  for (const [token, stats] of tokenStats.entries()) {
    const avgPerScan = stats.opportunities / stats.scans;
    console.log(`${token.padEnd(10)}: ${stats.opportunities.toString().padStart(4)} total (${avgPerScan.toFixed(1)} avg/scan)`);
  }
  
  // Breakdown by amount
  console.log(`\n${'─'.repeat(60)}`);
  console.log('OPPORTUNITIES BY LOAN AMOUNT');
  console.log(`${'─'.repeat(60)}`);
  
  const amountStats = new Map<number, { opportunities: number; scans: number }>();
  
  for (const result of results) {
    if (!amountStats.has(result.amount)) {
      amountStats.set(result.amount, { opportunities: 0, scans: 0 });
    }
    const stats = amountStats.get(result.amount)!;
    stats.opportunities += result.opportunities.length;
    stats.scans++;
  }
  
  for (const [amount, stats] of [...amountStats.entries()].sort((a, b) => a[0] - b[0])) {
    const avgPerScan = stats.opportunities / stats.scans;
    console.log(`${amount.toString().padEnd(10)}: ${stats.opportunities.toString().padStart(4)} total (${avgPerScan.toFixed(1)} avg/scan)`);
  }
  
  // Best opportunities
  console.log(`\n${'─'.repeat(60)}`);
  console.log('🏆 BEST OPPORTUNITIES ACROSS ALL SCANS');
  console.log(`${'─'.repeat(60)}`);
  
  const allOpportunities = results.flatMap(r => 
    r.opportunities.map(opp => ({
      ...opp,
      token: r.token,
      amount: r.amount
    }))
  ).sort((a, b) => b.netProfit - a.netProfit);
  
  if (allOpportunities.length > 0) {
    allOpportunities.slice(0, 5).forEach((opp, idx) => {
      const profitPercent = ((opp.expectedProfit / opp.loanAmount) * 100).toFixed(4);
      console.log(`${idx + 1}. ${opp.token} (${opp.amount}):`);
      console.log(`   Path: ${opp.path.length} hops`);
      console.log(`   Expected Profit: ${profitPercent}%`);
      console.log(`   Net Profit: $${opp.netProfit.toFixed(4)}`);
      console.log(`   ROI: ${((opp.netProfit / parseFloat(opp.loanAmount)) * 100).toFixed(2)}%`);
      console.log();
    });
  } else {
    console.log('No profitable opportunities found in current market conditions.');
  }
  
  console.log(`${'='.repeat(60)}\n`);
  console.log('✅ Scan completed successfully!');
  console.log('📝 Report saved to: reports/opportunity-scan-results.json\n');
  
  // Save detailed results to file
  import('fs').then(fs => {
    fs.writeFileSync(
      'reports/opportunity-scan-results.json',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        totalDuration: totalDuration,
        poolCount: poolCount,
        summary: {
          totalScans,
          successfulScans,
          failedScans,
          totalOpportunities,
          avgScanTime
        },
        results: results
      }, null, 2)
    );
  });
}

// Run the scanner
runScanner().catch(console.error);