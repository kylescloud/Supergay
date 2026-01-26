import { config } from 'dotenv';
import { ethers } from 'ethers';
import fs from 'fs';

config();

// RPC endpoints to test
const RPC_ENDPOINTS = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
  'https://1rpc.io/base',
  'https://base.gateway.tenderly.co',
  'https://rpc.ankr.com/base',
  'https://base.blockpi.network/v1/rpc/public'
];

async function testRPCEndpoints() {
  console.log('\n=== Testing RPC Endpoints ===');
  const results = [];
  
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const start = Date.now();
      await provider.getBlockNumber();
      const latency = Date.now() - start;
      results.push({
        url: rpcUrl,
        status: 'healthy',
        latency: `${latency}ms`
      });
      console.log(`✓ ${rpcUrl} - ${latency}ms`);
    } catch (error: any) {
      results.push({
        url: rpcUrl,
        status: 'failed',
        error: error?.message || 'Unknown error'
      });
      console.log(`✗ ${rpcUrl} - ${error?.message || 'Unknown error'}`);
    }
  }
  
  return results;
}

async function analyzePoolRegistry() {
  console.log('\n=== Analyzing Pool Registry ===');
  
  if (!fs.existsSync('data/pools/registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pools/registry.json', 'utf8'));
  const pools = registry.pools || [];
  
  console.log(`\nTotal pools in registry: ${pools.length}`);
  
  // Categorize pools
  const poolsWithState = pools.filter((p: any) => hasStateData(p));
  const poolsWithoutState = pools.filter((p: any) => !hasStateData(p));
  
  console.log(`\nPools with state data: ${poolsWithState.length} (${((poolsWithState.length/pools.length)*100).toFixed(1)}%)`);
  console.log(`Pools missing state data: ${poolsWithoutState.length} (${((poolsWithoutState.length/pools.length)*100).toFixed(1)}%)`);
  
  // Analyze pools without state
  console.log('\n=== Analyzing Pools Without State ===');
  const byDEX = groupByDEX(poolsWithoutState);
  
  for (const [dex, dexPools] of Object.entries(byDEX)) {
    console.log(`\n${dex}: ${dexPools.length} pools`);
    
    // Sample a few pools to understand the issue
    const samples = dexPools.slice(0, 3);
    for (const pool of samples) {
      console.log(`  Address: ${pool.address}`);
      console.log(`  Type: ${pool.type || 'unknown'}`);
      console.log(`  Has reserves: ${!!pool.reserve0 && !!pool.reserve1}`);
      console.log(`  Has sqrtPriceX96: ${!!pool.sqrtPriceX96}`);
      console.log(`  Has liquidity: ${!!pool.liquidity}`);
      console.log(`  Token0: ${pool.token0}`);
      console.log(`  Token1: ${pool.token1}`);
    }
  }
  
  return {
    total: pools.length,
    withState: poolsWithState.length,
    withoutState: poolsWithoutState.length,
    byDEX
  };
}

function hasStateData(pool: any): boolean {
  return (
    (pool.reserve0 && pool.reserve1) ||
    (pool.sqrtPriceX96 && pool.liquidity) ||
    (pool.sqrtPriceX96 && pool.sqrtPriceX96 !== '0')
  );
}

function groupByDEX(pools: any[]): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  
  for (const pool of pools) {
    const dex = pool.dex || pool.factory || 'unknown';
    if (!result[dex]) {
      result[dex] = [];
    }
    result[dex].push(pool);
  }
  
  return result;
}

async function testPoolStateRetrieval() {
  console.log('\n=== Testing Pool State Retrieval ===');
  
  // Try to retrieve state for pools missing it
  if (!fs.existsSync('data/pools/registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pools/registry.json', 'utf8'));
  const poolsWithoutState = registry.pools.filter((p: any) => !hasStateData(p));
  
  // Test a sample of pools
  const samples = poolsWithoutState.slice(0, 10);
  const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0]);
  
  console.log(`\nTesting state retrieval for ${samples.length} sample pools...\n`);
  
  const results = {
    v2Success: 0,
    v2Failed: 0,
    v3Success: 0,
    v3Failed: 0,
    errors: [] as any[]
  };
  
  for (const pool of samples) {
    try {
      if (pool.type === 'v2' || pool.type === 'v2style') {
        // Try V2 reserves call
        const poolContract = new ethers.Contract(
          pool.address,
          ['function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'],
          provider
        );
        const reserves = await poolContract.getReserves();
        results.v2Success++;
        console.log(`✓ V2 pool ${pool.address} - reserves: ${reserves[0]}, ${reserves[1]}`);
      } else if (pool.type === 'v3') {
        // Try V3 slot0 call
        const poolContract = new ethers.Contract(
          pool.address,
          ['function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'],
          provider
        );
        const slot0 = await poolContract.slot0();
        results.v3Success++;
        console.log(`✓ V3 pool ${pool.address} - sqrtPriceX96: ${slot0[0]}, tick: ${slot0[1]}`);
      }
    } catch (error: any) {
      if (pool.type === 'v2' || pool.type === 'v2style') {
        results.v2Failed++;
      } else if (pool.type === 'v3') {
        results.v3Failed++;
      }
      results.errors.push({
        pool: pool.address,
        type: pool.type,
        error: error?.message || 'Unknown error'
      });
      console.log(`✗ ${pool.type} pool ${pool.address} - ${error?.message?.substring(0, 100) || 'Unknown error'}`);
    }
  }
  
  console.log('\n=== Results ===');
  console.log(`V2 pools: ${results.v2Success} success, ${results.v2Failed} failed`);
  console.log(`V3 pools: ${results.v3Success} success, ${results.v3Failed} failed`);
  
  if (results.errors.length > 0) {
    console.log('\n=== Common Errors ===');
    const errorCounts = groupErrors(results.errors);
    for (const [error, count] of Object.entries(errorCounts)) {
      console.log(`  ${error}: ${count} occurrences`);
    }
  }
  
  return results;
}

function groupErrors(errors: any[]): Record<string, number> {
  const result: Record<string, number> = {};
  
  for (const error of errors) {
    const errorMsg = error.error.split('(')[0].trim();
    result[errorMsg] = (result[errorMsg] || 0) + 1;
  }
  
  return result;
}

async function generateReport() {
  console.log('=== Starting Pool Data Investigation ===');
  
  const rpcResults = await testRPCEndpoints();
  const registryAnalysis = await analyzePoolRegistry();
  const retrievalResults = await testPoolStateRetrieval();
  
  const report = {
    timestamp: new Date().toISOString(),
    rpcHealth: rpcResults,
    registryAnalysis,
    stateRetrieval: retrievalResults,
    recommendations: generateRecommendations(rpcResults, registryAnalysis, retrievalResults)
  };
  
  // Save report
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }
  fs.writeFileSync('reports/pool-data-investigation.md', generateMarkdownReport(report));
  console.log('\n✅ Report saved to: reports/pool-data-investigation.md');
}

function generateRecommendations(rpcResults: any, registryAnalysis: any, retrievalResults: any): string[] {
  const recommendations = [];
  
  // Check RPC health
  const healthyRPCs = rpcResults.filter((r: any) => r.status === 'healthy');
  if (healthyRPCs.length < 3) {
    recommendations.push('Add more RPC endpoints for redundancy');
  }
  
  // Check pool state retrieval success rate
  const totalRetrieved = retrievalResults.v2Success + retrievalResults.v3Success;
  const totalTested = retrievalResults.v2Success + retrievalResults.v2Failed + retrievalResults.v3Success + retrievalResults.v3Failed;
  const successRate = totalTested > 0 ? (totalRetrieved / totalTested) * 100 : 0;
  
  if (successRate < 50) {
    recommendations.push('Many pools are non-existent or inactive - filter them out');
    recommendations.push('Add pool activity validation before adding to registry');
  } else if (successRate < 80) {
    recommendations.push('Some pools have RPC issues - implement retry logic');
    recommendations.push('Add backup RPC endpoints for failed calls');
  }
  
  // Check error patterns
  const errorCounts = groupErrors(retrievalResults.errors);
  if (errorCounts['contract code not present']) {
    recommendations.push('Remove pools with no contract code');
  }
  if (errorCounts['call revert exception']) {
    recommendations.push('Verify pool address correctness and ABI compatibility');
  }
  
  return recommendations;
}

function generateMarkdownReport(data: any): string {
  let md = `# Pool Data Investigation Report\n\n`;
  md += `**Generated:** ${data.timestamp}\n\n`;
  
  md += `## RPC Health Status\n\n`;
  md += `| Endpoint | Status | Latency |\n`;
  md += `|----------|--------|---------|\n`;
  for (const rpc of data.rpcHealth) {
    md += `| ${rpc.url} | ${rpc.status} | ${rpc.latency} |\n`;
  }
  
  md += `\n## Pool Registry Analysis\n\n`;
  md += `- **Total Pools:** ${data.registryAnalysis.total}\n`;
  md += `- **Pools with State:** ${data.registryAnalysis.withState} (${((data.registryAnalysis.withState/data.registryAnalysis.total)*100).toFixed(1)}%)\n`;
  md += `- **Pools Missing State:** ${data.registryAnalysis.withoutState} (${((data.registryAnalysis.withoutState/data.registryAnalysis.total)*100).toFixed(1)}%)\n\n`;
  
  md += `### Pools Without State by DEX\n\n`;
  for (const [dex, pools] of Object.entries(data.registryAnalysis.byDEX)) {
    md += `- **${dex}:** ${(pools as any[]).length} pools\n`;
  }
  
  md += `\n## State Retrieval Test Results\n\n`;
  md += `- **V2 Pools:** ${data.stateRetrieval.v2Success} success, ${data.stateRetrieval.v2Failed} failed\n`;
  md += `- **V3 Pools:** ${data.stateRetrieval.v3Success} success, ${data.stateRetrieval.v3Failed} failed\n\n`;
  
  if (data.stateRetrieval.errors.length > 0) {
    md += `### Common Errors\n\n`;
    for (const [error, count] of Object.entries(groupErrors(data.stateRetrieval.errors))) {
      md += `- **${error}:** ${count} occurrences\n`;
    }
  }
  
  md += `\n## Recommendations\n\n`;
  for (const rec of data.recommendations) {
    md += `- ${rec}\n`;
  }
  
  return md;
}

// Run investigation
generateReport().catch(console.error);