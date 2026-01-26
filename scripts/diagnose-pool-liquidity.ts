import { PoolRegistryManager } from '../src/pools/registry.js';
import { ethers } from 'ethers';

async function diagnosePoolLiquidity() {
  console.log('🔍 Diagnosing Pool Liquidity Issues...\n');
  
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const allPools = registry.getAllPools();
  const poolsWithState = allPools.filter(p => 
    (p.reserve0 && p.reserve1) || (p.liquidity && p.sqrtPriceX96)
  );
  
  console.log(`✅ Found ${poolsWithState.length} pools with state data\n`);
  
  const stablecoins = ['USDC', 'USDbC', 'DAI', 'USDT'];
  
  console.log('📊 Sample Pool Liquidity Analysis:\n');
  console.log('-'.repeat(100));
  console.log('Pool Address'.padEnd(44) + 'DEX'.padEnd(12) + 'Pair'.padEnd(30) + 'Est. Liquidity (USD)');
  console.log('-'.repeat(100));
  
  let totalLiquidity = BigInt(0);
  let validPools = 0;
  
  for (let i = 0; i < Math.min(poolsWithState.length, 20); i++) {
    const pool = poolsWithState[i];
    let liquidityUSD = BigInt(0);
    
    if (pool.reserve0 && pool.reserve1) {
      const isToken0Stable = stablecoins.includes(pool.token0.symbol.toUpperCase());
      const isToken1Stable = stablecoins.includes(pool.token1.symbol.toUpperCase());
      
      // Convert reserves to BigInt
      const reserve0 = BigInt(pool.reserve0);
      const reserve1 = BigInt(pool.reserve1);
      
      if (isToken0Stable) {
        // Token0 is stablecoin - use reserve0
        // Reserve is in wei, so divide by 10^decimals for actual value
        const divisor = BigInt(10 ** pool.token0.decimals);
        const actualReserve = reserve0 / divisor;
        liquidityUSD = actualReserve * 2n; // Total liquidity = 2 * reserve
      } else if (isToken1Stable) {
        // Token1 is stablecoin - use reserve1
        const divisor = BigInt(10 ** pool.token1.decimals);
        const actualReserve = reserve1 / divisor;
        liquidityUSD = actualReserve * 2n;
      } else {
        // Both volatile - rough estimate
        const divisor0 = BigInt(10 ** pool.token0.decimals);
        const divisor1 = BigInt(10 ** pool.token1.decimals);
        const actualReserve0 = reserve0 / divisor0;
        const actualReserve1 = reserve1 / divisor1;
        liquidityUSD = (actualReserve0 + actualReserve1) / 2n;
      }
    } else if (pool.liquidity && pool.sqrtPriceX96) {
      // V3 pool - rough estimate
      liquidityUSD = pool.liquidity;
    }
    
    
    
    const pair = `${pool.token0.symbol}/${pool.token1.symbol}`;
    const liquidityStr = liquidityUSD > 0n ? `$${Number(liquidityUSD).toLocaleString()}` : '$0';
    
    console.log(
      pool.address.padEnd(44) +
      pool.dex.padEnd(12) +
      pair.padEnd(30) +
      liquidityStr
    );
    
    if (liquidityUSD > 0n) {
      totalLiquidity += liquidityUSD;
      validPools++;
    }
  }
  
  console.log('-'.repeat(100));
  console.log(`\n📈 Statistics:`);
  console.log(`   Total Pools Analyzed: ${Math.min(poolsWithState.length, 20)}`);
  console.log(`   Pools with Valid Liquidity: ${validPools}`);
  console.log(`   Total Liquidity (Sample): $${Number(totalLiquidity).toLocaleString()}`);
  console.log(`   Average Liquidity per Pool: $${validPools > 0 ? Math.floor(Number(totalLiquidity) / validPools).toLocaleString() : 0}`);
  console.log(`   Minimum Liquidity Threshold: $10,000`);
  
  const poolsAboveThreshold = poolsWithState.filter(p => {
    let liquidityUSD = BigInt(0);
    if (p.reserve0 && p.reserve1) {
      const isToken0Stable = stablecoins.includes(p.token0.symbol.toUpperCase());
      const isToken1Stable = stablecoins.includes(p.token1.symbol.toUpperCase());
      const reserve0 = BigInt(p.reserve0);
      const reserve1 = BigInt(p.reserve1);
      
      if (isToken0Stable) {
        const divisor = BigInt(10 ** p.token0.decimals);
        liquidityUSD = (reserve0 / divisor) * 2n;
      } else if (isToken1Stable) {
        const divisor = BigInt(10 ** p.token1.decimals);
        liquidityUSD = (reserve1 / divisor) * 2n;
      }
    }
    return liquidityUSD >= BigInt(10000);
  }).length;
  
  console.log(`   Pools Above Threshold: ${poolsAboveThreshold}`);
}

diagnosePoolLiquidity().catch(console.error);