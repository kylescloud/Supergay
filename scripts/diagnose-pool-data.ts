import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = 'https://base-rpc.publicnode.com';

async function diagnosePoolData() {
  console.log('=== Pool Data Diagnosis ===\n');
  
  // Load registry
  if (!fs.existsSync('data/pools/registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pools/registry.json', 'utf8'));
  const pools = registry.pools || [];
  
  console.log(`Total pools: ${pools.length}`);
  
  // Test RPC
  console.log('\nTesting RPC connection...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`✓ RPC connected - Current block: ${blockNumber}`);
  } catch (error) {
    console.log('✗ RPC connection failed');
    return;
  }
  
  // Analyze pools
  const poolsWithState = pools.filter((p: any) => {
    return (p.reserve0 && p.reserve1) || (p.sqrtPriceX96 && p.liquidity);
  });
  
  const poolsWithoutState = pools.filter((p: any) => {
    return !(p.reserve0 && p.reserve1) && !(p.sqrtPriceX96 && p.liquidity);
  });
  
  console.log(`\nPools with state: ${poolsWithState.length}`);
  console.log(`Pools without state: ${poolsWithoutState.length}`);
  
  // Test state retrieval for pools without state
  console.log('\n=== Testing State Retrieval ===');
  
  const samples = poolsWithoutState.slice(0, 20);
  let success = 0;
  let failed = 0;
  
  for (const pool of samples) {
    try {
      if (pool.type === 'v2' || pool.type === 'v2style') {
        const contract = new ethers.Contract(
          pool.address,
          ['function getReserves() view returns (uint112, uint112, uint32)'],
          provider
        );
        await contract.getReserves();
        success++;
        console.log(`✓ ${pool.address.substring(0,10)}... (V2)`);
      } else {
        const contract = new ethers.Contract(
          pool.address,
          ['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'],
          provider
        );
        await contract.slot0();
        success++;
        console.log(`✓ ${pool.address.substring(0,10)}... (V3)`);
      }
    } catch (error: any) {
      failed++;
      const errorMsg = error?.message || 'Unknown error';
      console.log(`✗ ${pool.address.substring(0,10)}... - ${errorMsg.split('(')[0]}`);
    }
  }
  
  console.log(`\nSuccess: ${success}/${samples.length} (${((success/samples.length)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}/${samples.length} (${((failed/samples.length)*100).toFixed(1)}%)`);
  
  // Save findings
  const findings = {
    totalPools: pools.length,
    poolsWithState: poolsWithState.length,
    poolsWithoutState: poolsWithoutState.length,
    stateRetrievalSuccessRate: ((success/samples.length)*100).toFixed(1) + '%',
    testResults: {
      success,
      failed,
      total: samples.length
    }
  };
  
  fs.writeFileSync('data/diagnosis-results.json', JSON.stringify(findings, null, 2));
  console.log('\n✅ Diagnosis saved to data/diagnosis-results.json');
}

diagnosePoolData().catch(console.error);