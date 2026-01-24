#!/usr/bin/env npx ts-node

/**
 * Test Pool Registry Functionality
 * 
 * This script tests the complete pool registry system:
 * 1. Load the pool registry
 * 2. Display statistics
 * 3. Find arbitrage opportunities using the registry
 */

import { PoolRegistryManager } from '../src/pools/registry';
import { ethers } from 'ethers';
import { TOKENS } from '../src/config/constants';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  POOL REGISTRY FUNCTIONALITY TEST                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Load pool registry
  console.log('📂 Loading pool registry...');
  const registry = new PoolRegistryManager();
  await registry.load();
  
  const allPools = registry.getAllPools();
  console.log(`✅ Loaded ${allPools.length} pools from registry\n`);

  // Display statistics
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          REGISTRY STATISTICS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Count pools by DEX
  const poolsByDEX: Record<string, number> = {};
  for (const pool of allPools) {
    poolsByDEX[pool.dex] = (poolsByDEX[pool.dex] || 0) + 1;
  }

  console.log('🏛️  Pools per DEX:');
  for (const [dex, count] of Object.entries(poolsByDEX).sort(([, a], [, b]) => b - a)) {
    console.log(`   ${dex.padEnd(30)}: ${count} pools`);
  }

  // Count pools by token
  const poolsByToken: Record<string, number> = {};
  for (const pool of allPools) {
    poolsByToken[pool.token0.symbol] = (poolsByToken[pool.token0.symbol] || 0) + 1;
    poolsByToken[pool.token1.symbol] = (poolsByToken[pool.token1.symbol] || 0) + 1;
  }

  console.log('\n💰 Pools per Token:');
  for (const [token, count] of Object.entries(poolsByToken).sort(([, a], [, b]) => b - a)) {
    console.log(`   ${token.padEnd(10)}: ${count} pairs`);
  }

  // Count pools by version
  const poolsByVersion: Record<string, number> = {};
  for (const pool of allPools) {
    poolsByVersion[pool.dexVersion] = (poolsByVersion[pool.dexVersion] || 0) + 1;
  }

  console.log('\n📊 Pools by Version:');
  for (const [version, count] of Object.entries(poolsByVersion)) {
    console.log(`   ${version.padEnd(10)}: ${count} pools`);
  }

  // Find WETH/USDC pools across all DEXs
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    WETH/USDC POOLS ACROSS ALL DEXs                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const wethPools = allPools.filter(pool => 
    (pool.token0.symbol === 'WETH' && pool.token1.symbol === 'USDC') ||
    (pool.token0.symbol === 'USDC' && pool.token1.symbol === 'WETH')
  );

  console.log(`Found ${wethPools.length} WETH/USDC pools:\n`);

  for (const pool of wethPools) {
    const isWethToken0 = pool.token0.symbol === 'WETH';
    const wethPrice = calculatePriceFromState(pool, isWethToken0);
    
    console.log(`📊 ${pool.dex.toUpperCase()} (${pool.dexVersion})`);
    console.log(`   Address:   ${pool.address}`);
    console.log(`   Fee:       ${pool.fee ? pool.fee / 10000 + '%' : '0.3%'}`);
    console.log(`   Liquidity: ${formatLiquidity(pool)}`);
    console.log(`   WETH Price: ${wethPrice.toFixed(2)} USD`);
    console.log(`   Active:    ${pool.isActive ? '✅ Yes' : '❌ No'}`);
    console.log();
  }

  // Simulate arbitrage opportunity detection
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                 SIMULATED ARBITRAGE OPPORTUNITIES                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  if (wethPools.length >= 2) {
    // Find price differences
    const prices: Array<{ pool: any; price: number; dex: string }> = [];
    
    for (const pool of wethPools) {
      const isWethToken0 = pool.token0.symbol === 'WETH';
      const price = calculatePriceFromState(pool, isWethToken0);
      prices.push({ pool, price, dex: pool.dex });
    }

    // Sort by price
    prices.sort((a, b) => a.price - b.price);

    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const priceDiff = maxPrice.price - minPrice.price;
    const priceDiffPercent = (priceDiff / minPrice.price) * 100;

    console.log(`📈 Price Spread Analysis:`);
    console.log(`   Lowest Price:  ${minPrice.price.toFixed(2)} USD (${minPrice.dex})`);
    console.log(`   Highest Price: ${maxPrice.price.toFixed(2)} USD (${maxPrice.dex})`);
    console.log(`   Spread:        ${priceDiff.toFixed(2)} USD (${priceDiffPercent.toFixed(4)}%)`);
    console.log();

    if (priceDiffPercent > 0.01) {
      console.log(`✅ POTENTIAL ARBITRAGE OPPORTUNITY DETECTED!`);
      console.log(`   Buy WETH at: ${minPrice.dex} (${minPrice.price.toFixed(2)} USD)`);
      console.log(`   Sell WETH at: ${maxPrice.dex} (${maxPrice.price.toFixed(2)} USD)`);
      console.log(`   Gross Profit: ${priceDiffPercent.toFixed(4)}%`);
      console.log(`   (Note: Must account for gas, slippage, and flash loan fees)`);
    } else {
      console.log(`⚠️  No significant arbitrage opportunities found`);
      console.log(`   Current spread is below profit threshold`);
    }
  } else {
    console.log(`❌ Not enough WETH/USDC pools to find arbitrage opportunities`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ TEST COMPLETED SUCCESSFULLY                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
}

function calculatePriceFromState(pool: any, isWethToken0: boolean): number {
  if (pool.dexVersion === 'v3') {
    // Calculate price from sqrtPriceX96
    const sqrtPriceX96 = BigInt(pool.sqrtPriceX96 || '0');
    if (sqrtPriceX96 === 0n) return 0;
    
    // Price = (sqrtPriceX96 / 2^96)^2
    const Q96 = BigInt(2) ** BigInt(96);
    const priceX96 = (sqrtPriceX96 * sqrtPriceX96) / Q96;
    
    // Adjust for decimals (WETH 18, USDC 6)
    const decimalsAdjustment = BigInt(10) ** BigInt(18 - 6);
    const price = Number(priceX96) / Number(decimalsAdjustment);
    
    return isWethToken0 ? price : 1 / price;
  } else {
    // V2: price = reserve1 / reserve0
    const reserve0 = BigInt(pool.reserve0 || '0');
    const reserve1 = BigInt(pool.reserve1 || '0');
    if (reserve0 === 0n || reserve1 === 0n) return 0;
    
    // Adjust for decimals
    const decimals0 = pool.token0.decimals;
    const decimals1 = pool.token1.decimals;
    const decimalsAdjustment = BigInt(10) ** BigInt(decimals0 - decimals1);
    
    const price = Number((reserve1 * decimalsAdjustment) / reserve0);
    
    return isWethToken0 ? price : 1 / price;
  }
}

function formatLiquidity(pool: any): string {
  if (pool.dexVersion === 'v3') {
    const liquidity = BigInt(pool.liquidity || '0');
    if (liquidity === 0n) return '0';
    return `$${(Number(liquidity) / 1e18).toFixed(2)}`;
  } else {
    const reserve0 = BigInt(pool.reserve0 || '0');
    const reserve1 = BigInt(pool.reserve1 || '0');
    // Rough estimate - sum of reserves in USD
    return `$${((Number(reserve0) / 1e18) + (Number(reserve1) / 1e6)).toFixed(2)}`;
  }
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});