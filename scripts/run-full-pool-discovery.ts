import { DiscoveryTop200 } from '../src/pools/discoveryTop200';

/**
 * Run full pool discovery for all 14 flash loan tokens × 200 quote tokens
 * across all 10 DEXs
 */
async function main() {
  console.log('='.repeat(80));
  console.log('FULL POOL DISCOVERY - All 14 Flash Loan Tokens × 200 Quote Tokens');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('Configuration:');
  console.log('  Flash Loan Tokens: 14 (Aave V3 assets)');
  console.log('  Quote Tokens: 200 (Top Base tokens)');
  console.log('  DEXs: 10 (All configured DEXs)');
  console.log('  Total Pairs: 2,800');
  console.log('  Expected Pools: ~28,000');
  console.log('');
  console.log('Starting discovery...');
  console.log(''.repeat(80));
  console.log('');

  const discovery = new DiscoveryTop200();
  
  try {
    await discovery.discoverAll();
    
    console.log('');
    console.log('='.repeat(80));
    console.log('DISCOVERY COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    
    const stats = discovery.getStats();
    console.log('');
    console.log('Final Statistics:');
    console.log(`  Total Pairs Checked: ${stats.totalPairs}`);
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  ✓ Successful: ${stats.successful}`);
    console.log(`  ✗ Failed: ${stats.failed}`);
    console.log(`  ⊘ Skipped: ${stats.skipped}`);
    
    const elapsed = Date.now() - stats.startTime.getTime();
    const elapsedMinutes = Math.floor(elapsed / 60000);
    const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);
    console.log(`  Time Elapsed: ${elapsedMinutes}m ${elapsedSeconds}s`);
    
    const successRate = stats.processed > 0 
      ? ((stats.successful / stats.processed) * 100).toFixed(2)
      : '0.00';
    console.log(`  Success Rate: ${successRate}%`);
    
    console.log('');
    console.log('Pool registry saved to: data/pool-registry.json');
    console.log('Pool CSV export: data/pool-registry.csv');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('DISCOVERY FAILED');
    console.error('='.repeat(80));
    console.error('');
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('');
    console.log('✅ Pool discovery completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error(`❌ Pool discovery failed: ${error}`);
    process.exit(1);
  });