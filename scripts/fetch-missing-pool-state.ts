import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://base-rpc.publicnode.com';

// ABIs for different pool types
const V2_POOL_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)'
];

async function fetchMissingPoolState() {
  console.log('=== Fetching Missing Pool State ===\n');
  
  // Load registry
  if (!fs.existsSync('data/pool-registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
  const pools = registry.pools || [];
  
  console.log(`Total pools in registry: ${pools.length}`);
  
  // Find pools missing state
  const poolsMissingState = pools.filter((p: any) => {
    const hasV2State = p.reserve0 && p.reserve1;
    const hasV3State = p.sqrtPriceX96 && p.liquidity;
    return !hasV2State && !hasV3State;
  });
  
  console.log(`Pools missing state data: ${poolsMissingState.length}\n`);
  
  if (poolsMissingState.length === 0) {
    console.log('✅ All pools have state data!');
    return;
  }
  
  // Initialize provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Test connection
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`✓ RPC connected - Current block: ${blockNumber}\n`);
  } catch (error) {
    console.log('✗ RPC connection failed');
    return;
  }
  
  // Fetch state for pools missing it
  let success = 0;
  let failed = 0;
  const errors: any[] = [];
  
  console.log('Fetching pool state...\n');
  
  for (let i = 0; i < poolsMissingState.length; i++) {
    const pool = poolsMissingState[i];
    const progress = Math.round(((i + 1) / poolsMissingState.length) * 100);
    
    try {
      if (pool.dexType === 'v2' || pool.dexType === 'v2style') {
        // Fetch V2 reserves
        const contract = new ethers.Contract(pool.address, V2_POOL_ABI, provider);
        const reserves = await contract.getReserves();
        
        // Update pool with reserves
        pool.reserve0 = reserves[0].toString();
        pool.reserve1 = reserves[1].toString();
        
        success++;
        console.log(`[${progress}%] ✓ ${pool.address.substring(0,10)}... (${pool.dex} V2)`);
      } else if (pool.dexType === 'v3' || pool.dexType === 'v3style') {
        // Fetch V3 state
        const contract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
        const [slot0, liquidity] = await Promise.all([
          contract.slot0(),
          contract.liquidity()
        ]);
        
        // Update pool with V3 state
        pool.sqrtPriceX96 = slot0.sqrtPriceX96.toString();
        pool.tick = slot0.tick.toString();
        pool.liquidity = liquidity.toString();
        
        success++;
        console.log(`[${progress}%] ✓ ${pool.address.substring(0,10)}... (${pool.dex} V3)`);
      } else {
        // Unknown pool type - try both
        const v2Contract = new ethers.Contract(pool.address, V2_POOL_ABI, provider);
        
        try {
          const reserves = await v2Contract.getReserves();
          pool.reserve0 = reserves[0].toString();
          pool.reserve1 = reserves[1].toString();
          success++;
          console.log(`[${progress}%] ✓ ${pool.address.substring(0,10)}... (${pool.dex} V2-detected)`);
        } catch {
          // Try V3
          const v3Contract = new ethers.Contract(pool.address, V3_POOL_ABI, provider);
          const [slot0, liquidity] = await Promise.all([
            v3Contract.slot0(),
            v3Contract.liquidity()
          ]);
          
          pool.sqrtPriceX96 = slot0.sqrtPriceX96.toString();
          pool.tick = slot0.tick.toString();
          pool.liquidity = liquidity.toString();
          success++;
          console.log(`[${progress}%] ✓ ${pool.address.substring(0,10)}... (${pool.dex} V3-detected)`);
        }
      }
      
      // Update lastUpdated
      pool.lastUpdated = Date.now();
      
    } catch (error: any) {
      failed++;
      const errorMsg = error?.message || 'Unknown error';
      errors.push({
        pool: pool.address,
        dex: pool.dex,
        type: pool.dexType,
        error: errorMsg
      });
      console.log(`[${progress}%] ✗ ${pool.address.substring(0,10)}... - ${errorMsg.split('(')[0]}`);
    }
    
    // Add small delay to avoid rate limiting
    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n=== Results ===`);
  console.log(`Success: ${success}/${poolsMissingState.length} (${((success/poolsMissingState.length)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}/${poolsMissingState.length} (${((failed/poolsMissingState.length)*100).toFixed(1)}%)`);
  
  if (errors.length > 0) {
    console.log(`\n=== Common Errors ===`);
    const errorCounts: Record<string, number> = {};
    for (const err of errors) {
      const errorMsg = err.error.split('(')[0].trim();
      errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
    }
    
    for (const [error, count] of Object.entries(errorCounts)) {
      console.log(`  ${error}: ${count}`);
    }
  }
  
  // Save updated registry
  registry.lastUpdated = Date.now();
  registry.version = '1.1';
  fs.writeFileSync('data/pool-registry.json', JSON.stringify(registry, null, 2));
  
  console.log(`\n✅ Updated registry saved to data/pool-registry.json`);
  
  // Generate report
  const errorCounts: Record<string, number> = {};
  for (const err of errors) {
    const errorMsg = err.error.split('(')[0].trim();
    errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    totalPools: pools.length,
    poolsMissingState: poolsMissingState.length,
    stateRetrieval: {
      success,
      failed,
      successRate: ((success/poolsMissingState.length)*100).toFixed(1) + '%'
    },
    errors: errors.length > 0 ? errorCounts : null,
    recommendations: generateRecommendations(success, poolsMissingState.length, errors)
  };
  
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }
  
  fs.writeFileSync('reports/pool-state-fetch-report.json', JSON.stringify(report, null, 2));
  console.log(`✅ Report saved to reports/pool-state-fetch-report.json`);
  
  return report;
}

function generateRecommendations(success: number, total: number, errors: any[]): string[] {
  const recommendations: string[] = [];
  const successRate = (success / total) * 100;
  
  if (successRate > 90) {
    recommendations.push('State retrieval is working excellently');
    recommendations.push('Registry is now up-to-date with all pool data');
  } else if (successRate > 70) {
    recommendations.push('Most pools updated successfully');
    recommendations.push('Investigate failed pools - they may be inactive or have contract issues');
  } else if (successRate > 50) {
    recommendations.push('Mixed success - some pools may be inactive');
    recommendations.push('Consider removing permanently failed pools from registry');
    recommendations.push('Implement retry logic for transient failures');
  } else {
    recommendations.push('Low success rate - investigate RPC or pool issues');
    recommendations.push('Many pools may be inactive or have contract problems');
    recommendations.push('Consider pruning registry to remove inactive pools');
  }
  
  // Check for specific error patterns
  const errorCounts: Record<string, number> = {};
  for (const err of errors) {
    const errorMsg = err.error.split('(')[0].trim();
    errorCounts[errorMsg] = (errorCounts[errorMsg] || 0) + 1;
  }
  
  if (errorCounts['contract code not present']) {
    recommendations.push('Remove pools with no contract code - they are inactive');
  }
  
  if (errorCounts['call revert exception']) {
    recommendations.push('Some pools may have incompatible ABIs or be paused');
  }
  
  return recommendations;
}

// Run the script
fetchMissingPoolState().catch(console.error);