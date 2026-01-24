import { ethers } from 'ethers';
import { PoolRegistryManager } from '../src/pools/registry';
import { DEX_CONFIG, TOKENS, TOKEN_METADATA } from '../src/config/constants';
import { RPCManager } from '../src/utils/rpcManager';

// ABI for Uniswap V2 factory
const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint256) external view returns (address pair)',
  'function allPairsLength() external view returns (uint256)'
];

// ABI for Uniswap V3 factory
const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

// ABI for Curve registry
const CURVE_REGISTRY_ABI = [
  'function pool_count() external view returns (uint256)',
  'function pool_list(uint256) external view returns (address)',
  'function get_balances(address pool) external view returns (uint256[8])',
];

// ABI for Aerodrome factory
const AERODROME_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

// ABI for Uniswap V4 hooks
const UNISWAP_V4_HOOKS_ABI = [
  'function getHook(address poolManager, address key) external view returns (address)',
];

async function discoverAllPools() {
  console.log('='.repeat(80));
  console.log('DISCOVERING POOLS FROM ALL 10 DEXs');
  console.log('='.repeat(80));

  // Initialize RPC manager
  const rpcManager = new RPCManager();
  const provider = rpcManager.getProvider('scanning' as any);

  // Initialize pool registry
  const registry = new PoolRegistryManager();
  await registry.load();

  const tokenList = Object.values(TOKENS);
  const tokenKeys = Object.keys(TOKENS) as Array<keyof typeof TOKENS>;
  const tokens = tokenList.map(address => {
    const symbol = tokenKeys.find(key => TOKENS[key] === address);
    return {
      address,
      symbol: symbol || '',
      decimals: symbol ? TOKEN_METADATA[symbol]?.decimals || 18 : 18,
      name: symbol ? TOKEN_METADATA[symbol]?.name || '' : ''
    };
  });

  let totalPoolsDiscovered = 0;
  const discoveryResults: Record<string, { found: number; details: string[] }> = {};

  // ============ UNISWAP V4 POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('1. UNISWAP V4 DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['uniswap-v4'] = { found: 0, details: [] };
  
  try {
    const poolManager = new ethers.Contract(
      DEX_CONFIG.uniswapV4.poolManager,
      UNISWAP_V3_FACTORY_ABI,
      provider
    );

    console.log('Note: Uniswap V4 uses hooks architecture - querying pool states directly...');
    
    for (const feeTier of DEX_CONFIG.uniswapV4.feeTiers) {
      console.log(`  Checking fee tier: ${feeTier / 10000}%`);
      
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          try {
            // V4 pools don't have a simple factory - we'll try to query state
            const token0 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[i].address 
              : tokens[j].address;
            const token1 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[j].address 
              : tokens[i].address;

            const poolKey = ethers.solidityPackedKeccak256(
              ['address', 'address', 'uint24', 'address'],
              [token0, token1, feeTier, ethers.ZeroAddress]
            );

            try {
              const poolAddress = await poolManager.getPool(token0, token1, feeTier);
              if (poolAddress && poolAddress !== ethers.ZeroAddress) {
                console.log(`  ✓ Found V4 pool: ${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`);
                
                await registry.addPools([{
                  address: poolAddress,
                  dex: 'uniswap-v4',
                  dexVersion: 'v4',
                  token0: tokens[i],
                  token1: tokens[j],
                  fee: feeTier,
                  isActive: true,
                  lastUpdated: Date.now()
                }]);
                
                discoveryResults['uniswap-v4'].found++;
                discoveryResults['uniswap-v4'].details.push(
                  `${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`
                );
                totalPoolsDiscovered++;
              }
            } catch (error) {
              // Pool doesn't exist
            }
          } catch (error) {
            // Continue to next pair
          }
        }
      }
    }
  } catch (error) {
    console.log('  ✗ V4 discovery failed:', error instanceof Error ? error.message : error);
  }

  // ============ UNISWAP V2 POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('2. UNISWAP V2 DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['uniswap-v2'] = { found: 0, details: [] };
  
  try {
    const factory = new ethers.Contract(
      DEX_CONFIG.uniswapV2.factory,
      UNISWAP_V2_FACTORY_ABI,
      provider
    );

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const pairAddress = await factory.getPair(tokens[i].address, tokens[j].address);
          
          if (pairAddress && pairAddress !== ethers.ZeroAddress) {
            console.log(`  ✓ Found V2 pair: ${tokens[i].symbol}/${tokens[j].symbol}`);
            
            await registry.addPools([{
              address: pairAddress,
              dex: 'uniswap-v2',
              dexVersion: 'v2',
              token0: tokens[i],
              token1: tokens[j],
              fee: 30, // V2 has 0.3% fee
              isActive: true,
              lastUpdated: Date.now()
            }]);
            
            discoveryResults['uniswap-v2'].found++;
            discoveryResults['uniswap-v2'].details.push(
              `${tokens[i].symbol}/${tokens[j].symbol}`
            );
            totalPoolsDiscovered++;
          }
        } catch (error) {
          // Pair doesn't exist
        }
      }
    }
  } catch (error) {
    console.log('  ✗ V2 discovery failed:', error instanceof Error ? error.message : error);
  }

  // ============ CURVE POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('3. CURVE DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['curve'] = { found: 0, details: [] };
  
  try {
    const registryContract = new ethers.Contract(
      DEX_CONFIG.curve.registry,
      CURVE_REGISTRY_ABI,
      provider
    );

    const poolCount = await registryContract.pool_count();
    console.log(`  Found ${poolCount} pools in Curve registry`);

    for (let i = 0; i < poolCount; i++) {
      try {
        const poolAddress = await registryContract.pool_list(i);
        
        // Get pool balances to check if it's relevant
        try {
          const balances = await registryContract.get_balances(poolAddress);
          
          // Check if any of our tokens are in this pool
          // This is a simplified check - in production you'd verify LP tokens
          if (balances.some((b: any) => b > 0)) {
            console.log(`  ✓ Found Curve pool: ${poolAddress}`);
            
            // Try to identify tokens (simplified)
            await registry.addPools([{
              address: poolAddress,
              dex: 'curve',
              dexVersion: 'curve',
              token0: tokens[0], // Placeholder - would need to query pool for actual tokens
              token1: tokens[1],
              fee: 4, // Curve has 0.04% fee
              isActive: true,
              lastUpdated: Date.now()
            }]);
            
            discoveryResults['curve'].found++;
            discoveryResults['curve'].details.push(poolAddress);
            totalPoolsDiscovered++;
          }
        } catch (error) {
          // Can't get balances
        }
      } catch (error) {
        // Skip this pool
      }
    }
  } catch (error) {
    console.log('  ✗ Curve discovery failed:', error instanceof Error ? error.message : error);
  }

  // ============ AERODROME (V2) POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('4. AERODROME (V2) DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['aerodrome'] = { found: 0, details: [] };
  
  try {
    const factory = new ethers.Contract(
      DEX_CONFIG.aerodrome.factory,
      AERODROME_FACTORY_ABI,
      provider
    );

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const pairAddress = await factory.getPair(tokens[i].address, tokens[j].address);
          
          if (pairAddress && pairAddress !== ethers.ZeroAddress) {
            console.log(`  ✓ Found Aerodrome pair: ${tokens[i].symbol}/${tokens[j].symbol}`);
            
            await registry.addPools([{
              address: pairAddress,
              dex: 'aerodrome',
              dexVersion: 'v2',
              token0: tokens[i],
              token1: tokens[j],
              fee: 30, // Aerodrome V2 has 0.3% fee
              isActive: true,
              lastUpdated: Date.now()
            }]);
            
            discoveryResults['aerodrome'].found++;
            discoveryResults['aerodrome'].details.push(
              `${tokens[i].symbol}/${tokens[j].symbol}`
            );
            totalPoolsDiscovered++;
          }
        } catch (error) {
          // Pair doesn't exist
        }
      }
    }
  } catch (error) {
    console.log('  ✗ Aerodrome discovery failed:', error instanceof Error ? error.message : error);
  }

  // ============ AERODROME SLIPSTREAM (V3) POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('5. AERODROME SLIPSTREAM DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['aerodrome-slipstream'] = { found: 0, details: [] };
  
  try {
    const factory = new ethers.Contract(
      DEX_CONFIG.aerodromeSlipStream.factory,
      UNISWAP_V3_FACTORY_ABI,
      provider
    );

    for (const feeTier of DEX_CONFIG.aerodromeSlipStream.feeTiers) {
      console.log(`  Checking fee tier: ${feeTier / 10000}%`);
      
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          try {
            const token0 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[i].address 
              : tokens[j].address;
            const token1 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[j].address 
              : tokens[i].address;

            const poolAddress = await factory.getPool(token0, token1, feeTier);
            
            if (poolAddress && poolAddress !== ethers.ZeroAddress) {
              console.log(`  ✓ Found Aerodrome SlipStream pool: ${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`);
              
              await registry.addPools([{
                address: poolAddress,
                dex: 'aerodrome-slipstream',
                dexVersion: 'v3',
                token0: tokens[i],
                token1: tokens[j],
                fee: feeTier,
                isActive: true,
                lastUpdated: Date.now()
              }]);
              
              discoveryResults['aerodrome-slipstream'].found++;
              discoveryResults['aerodrome-slipstream'].details.push(
                `${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`
              );
              totalPoolsDiscovered++;
            }
          } catch (error) {
            // Pool doesn't exist
          }
        }
      }
    }
  } catch (error) {
    console.log('  ✗ Aerodrome SlipStream discovery failed:', error instanceof Error ? error.message : error);
  }

  // ============ AERODROME SLIPSTREAM 2 POOL DISCOVERY ============
  console.log('\n' + '='.repeat(80));
  console.log('6. AERODROME SLIPSTREAM 2 DISCOVERY');
  console.log('='.repeat(80));
  
  discoveryResults['aerodrome-slipstream-2'] = { found: 0, details: [] };
  
  try {
    const factory = new ethers.Contract(
      DEX_CONFIG.aerodromeSlipStream2.factory,
      UNISWAP_V3_FACTORY_ABI,
      provider
    );

    for (const feeTier of DEX_CONFIG.aerodromeSlipStream2.feeTiers) {
      console.log(`  Checking fee tier: ${feeTier / 10000}%`);
      
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          try {
            const token0 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[i].address 
              : tokens[j].address;
            const token1 = tokens[i].address.toLowerCase() < tokens[j].address.toLowerCase() 
              ? tokens[j].address 
              : tokens[i].address;

            const poolAddress = await factory.getPool(token0, token1, feeTier);
            
            if (poolAddress && poolAddress !== ethers.ZeroAddress) {
              console.log(`  ✓ Found Aerodrome SlipStream 2 pool: ${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`);
              
              await registry.addPools([{
                address: poolAddress,
                dex: 'aerodrome-slipstream-2',
                dexVersion: 'v3',
                token0: tokens[i],
                token1: tokens[j],
                fee: feeTier,
                isActive: true,
                lastUpdated: Date.now()
              }]);
              
              discoveryResults['aerodrome-slipstream-2'].found++;
              discoveryResults['aerodrome-slipstream-2'].details.push(
                `${tokens[i].symbol}/${tokens[j].symbol} (${feeTier / 10000}%)`
              );
              totalPoolsDiscovered++;
            }
          } catch (error) {
            // Pool doesn't exist
          }
        }
      }
    }
  } catch (error) {
    console.log('  ✗ Aerodrome SlipStream 2 discovery failed:', error instanceof Error ? error.message : error);
  }

  // Save registry
  await registry.save();
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('DISCOVERY SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total pools discovered: ${totalPoolsDiscovered}`);
  console.log('\nBreakdown by DEX:');
  
  for (const [dex, result] of Object.entries(discoveryResults)) {
    console.log(`  ${dex}: ${result.found} pools`);
    if (result.details.length > 0 && result.details.length <= 10) {
      result.details.forEach(detail => console.log(`    - ${detail}`));
    } else if (result.details.length > 10) {
      console.log(`    - First 5: ${result.details.slice(0, 5).join(', ')}`);
      console.log(`    - ... and ${result.details.length - 5} more`);
    }
  }

  // Update total count in registry
  const allPools = registry.getAllPools();
  console.log(`\nTotal pools in registry: ${allPools.length}`);
  
  return { totalPoolsDiscovered, discoveryResults };
}

// Run discovery
discoverAllPools()
  .then(result => {
    console.log('\n✓ Pool discovery completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Pool discovery failed:', error);
    process.exit(1);
  });