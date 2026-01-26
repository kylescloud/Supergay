import fs from 'fs';

function createCleanRegistry() {
  console.log('=== Creating Clean Pool Registry ===\n');
  
  // Load current registry
  if (!fs.existsSync('data/pool-registry.json')) {
    console.log('❌ Pool registry not found!');
    return;
  }
  
  const registry = JSON.parse(fs.readFileSync('data/pool-registry.json', 'utf8'));
  const pools = registry.pools || [];
  
  console.log(`Total pools in current registry: ${pools.length}`);
  
  // Filter pools that have valid state data
  const activePools = pools.filter((pool: any) => {
    const hasV2State = pool.reserve0 && pool.reserve1;
    const hasV3State = pool.sqrtPriceX96 && pool.liquidity;
    const hasSqrtPrice = pool.sqrtPriceX96 && pool.sqrtPriceX96 !== '0';
    
    return hasV2State || hasV3State || hasSqrtPrice;
  });
  
  const inactivePools = pools.length - activePools.length;
  
  console.log(`Active pools (with state): ${activePools.length}`);
  console.log(`Inactive pools (no state): ${inactivePools}\n`);
  
  // Analyze active pools by DEX
  console.log('=== Active Pools by DEX ===');
  const poolsByDEX = activePools.reduce((acc: any, pool: any) => {
    const dex = pool.dex || 'Unknown';
    if (!acc[dex]) {
      acc[dex] = [];
    }
    acc[dex].push(pool);
    return acc;
  }, {});
  
  for (const [dex, dexPools] of Object.entries(poolsByDEX)) {
    const poolArray = dexPools as any[];
    console.log(`${dex}: ${poolArray.length} pools`);
  }
  
  // Analyze by pool type
  console.log('\n=== Active Pools by Type ===');
  const poolsByType = activePools.reduce((acc: any, pool: any) => {
    const type = pool.dexType || 'unknown';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(pool);
    return acc;
  }, {});
  
  for (const [type, typePools] of Object.entries(poolsByType)) {
    const poolArray = typePools as any[];
    console.log(`${type}: ${poolArray.length} pools`);
  }
  
  // Get unique tokens
  const uniqueTokens = new Set<string>();
  for (const pool of activePools) {
    if (pool.token0?.address) uniqueTokens.add(pool.token0.address);
    if (pool.token1?.address) uniqueTokens.add(pool.token1.address);
  }
  
  console.log(`\nUnique tokens: ${uniqueTokens.size}\n`);
  
  // Create clean registry
  const cleanRegistry = {
    version: '2.0',
    lastUpdated: Date.now(),
    metadata: {
      totalPools: activePools.length,
      uniqueTokens: uniqueTokens.size,
      source: 'Cleaned from original registry',
      filters: 'Only pools with valid state data (reserves or sqrtPriceX96 + liquidity)'
    },
    pools: activePools
  };
  
  // Backup original registry
  if (!fs.existsSync('data/backups')) {
    fs.mkdirSync('data/backups', { recursive: true });
  }
  const backupPath = `data/backups/pool-registry-backup-${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(registry, null, 2));
  console.log(`✅ Original registry backed up to: ${backupPath}`);
  
  // Save clean registry
  fs.writeFileSync('data/pool-registry.json', JSON.stringify(cleanRegistry, null, 2));
  console.log(`✅ Clean registry saved to: data/pool-registry.json`);
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      originalPools: pools.length,
      activePools: activePools.length,
      inactivePoolsRemoved: inactivePools,
      removalRate: ((inactivePools / pools.length) * 100).toFixed(1) + '%',
      uniqueTokens: uniqueTokens.size
    },
    byDEX: Object.fromEntries(
      Object.entries(poolsByDEX).map(([dex, dexPools]) => [dex, (dexPools as any[]).length])
    ),
    byType: Object.fromEntries(
      Object.entries(poolsByType).map(([type, typePools]) => [type, (typePools as any[]).length])
    ),
    benefits: [
      `Reduced registry size by ${((inactivePools / pools.length) * 100).toFixed(1)}%`,
      `All pools have valid state data for arbitrage calculations`,
      `Faster pool loading and processing`,
      `Eliminated RPC call failures for inactive pools`,
      `${uniqueTokens.size} unique tokens available for trading`
    ]
  };
  
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }
  fs.writeFileSync('reports/clean-registry-report.json', JSON.stringify(report, null, 2));
  console.log(`✅ Report saved to: reports/clean-registry-report.json`);
  
  console.log('\n=== Summary ===');
  console.log(`✅ Registry cleaned successfully!`);
  console.log(`📊 Reduced from ${pools.length} to ${activePools.length} pools`);
  console.log(`🗑️  Removed ${inactivePools} inactive pools`);
  console.log(`💰 ${uniqueTokens.size} unique tokens available`);
  
  return report;
}

// Run the script
createCleanRegistry();