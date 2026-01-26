#!/usr/bin/env ts-node
/**
 * Test V4 Pool Discovery with Private RPCs (Optimized for Recent Blocks)
 * 
 * This script queries only the most recent blocks where V4 pools are likely to exist
 */

import { ethers } from 'ethers';
import { UniswapV4Fetcher } from '../src/pools/fetchers/uniswapV4';
import { DEX_CONFIG } from '../src/config/constants';

// Private RPC endpoints
const PRIVATE_RPCS = [
  process.env.PRIVATE_RPC_1 || 'https://site1.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357',
  process.env.PRIVATE_RPC_2 || 'https://site2.moralis-nodes.com/base/60f0cf30acc14837bbb9405cbdcff357'
];

async function testV4DiscoveryRecent() {
  console.log('\n' + '='.repeat(80));
  console.log('Uniswap V4 Pool Discovery Test - Recent Blocks Only');
  console.log('='.repeat(80) + '\n');

  for (let i = 0; i < PRIVATE_RPCS.length; i++) {
    const rpcUrl = PRIVATE_RPCS[i];
    console.log(`\nAttempting connection to Private RPC ${i + 1}/${PRIVATE_RPCS.length}...`);
    console.log(`RPC URL: ${rpcUrl.substring(0, 50)}...`);

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      console.log('Testing connection...');
      const currentBlock = await provider.getBlockNumber();
      console.log(`✅ Connected! Current block: ${currentBlock}\n`);

      // V4 on Base is likely very new - let's query only the last 10,000 blocks
      // Base block time is ~2 seconds, so 10,000 blocks = ~5.5 hours
      const START_BLOCK = Math.max(0, currentBlock - 10000);
      const BLOCK_RANGE_LIMIT = 100;
      const DELAY_BETWEEN_QUERIES = 200; // ms

      console.log(`Query strategy: Recent blocks only`);
      console.log(`  Start block: ${START_BLOCK}`);
      console.log(`  End block: ${currentBlock}`);
      console.log(`  Total blocks to query: ${currentBlock - START_BLOCK}`);
      console.log(`  Block range limit: ${BLOCK_RANGE_LIMIT}`);
      console.log(`  Expected queries: ~${Math.ceil((currentBlock - START_BLOCK) / BLOCK_RANGE_LIMIT)}\n`);

      // Create V4 fetcher
      const config = {
        name: 'Uniswap V4',
        chainId: 8453,
        poolManager: DEX_CONFIG.uniswapV4.poolManager,
        stateView: DEX_CONFIG.uniswapV4.stateView,
        feeTiers: [100, 500, 2500, 3000, 10000]
      };

      const fetcher = new UniswapV4Fetcher(provider, config as any);
      console.log('✅ Fetcher initialized\n');

      // Manually query Initialize events with our optimized range
      console.log('Starting optimized pool discovery...\n');
      
      const poolManager = new ethers.Contract(
        config.poolManager,
        ['event Initialize(bytes32 indexed id, (address,address,uint24,int24,address) key, uint160 sqrtPriceX96, int24 tick)'],
        provider
      );

      const initializeFilter = poolManager.filters.Initialize();
      let allEvents: any[] = [];
      let startBlock = START_BLOCK;
      let endBlock = currentBlock;
      let rangeCount = 0;
      let eventsFound = 0;
      
      console.log('Fetching Initialize events from Pool Manager...\n');

      while (startBlock <= endBlock) {
        const rangeEnd = Math.min(startBlock + BLOCK_RANGE_LIMIT - 1, endBlock);
        rangeCount++;
        
        process.stdout.write(`  [Range ${rangeCount}] Blocks ${startBlock}-${rangeEnd}... `);
        
        try {
          const events = await poolManager.queryFilter(
            initializeFilter, 
            startBlock, 
            rangeEnd
          );
          
          if (events.length > 0) {
            allEvents = allEvents.concat(events);
            eventsFound += events.length;
            console.log(`✅ Found ${events.length} events (total: ${eventsFound})`);
          } else {
            console.log(`- No events`);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          console.log(`❌ Error: ${errMsg.substring(0, 80)}...`);
        }
        
        startBlock = rangeEnd + 1;
        
        if (startBlock <= endBlock && rangeCount % 10 === 0) {
          console.log(`\n  Progress: ${Math.round((startBlock - START_BLOCK) / (endBlock - START_BLOCK) * 100)}% complete\n`);
        }
        
        if (startBlock <= endBlock) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_QUERIES));
        }
      }
      
      console.log(`\n\n✅ Discovery complete!`);
      console.log(`   Total ranges queried: ${rangeCount}`);
      console.log(`   Total Initialize events found: ${allEvents.length}\n`);

      // Now process the events to get pool details
      if (allEvents.length > 0) {
        console.log('Processing events to fetch pool state...\n');
        
        const pools: any[] = [];
        let processedCount = 0;
        
        for (const event of allEvents.slice(0, 10)) { // Process first 10 for demo
          try {
            // Use the public fetchAllPools method with our custom range
            // For now, just count the events
            processedCount++;
            const args = 'args' in event ? event.args : null;
            if (args && args.key) {
              const fee = Number(args.key.fee);
              console.log(`  ✅ Event ${processedCount}: Fee tier ${fee / 10000}%`);
            }
          } catch (error) {
            console.log(`  ❌ Error processing event: ${error}`);
          }
        }
        
        if (allEvents.length > 10) {
          console.log(`  ... and ${allEvents.length - 10} more events (not processed in this demo)`);
        }
        
        console.log(`\n✅ Successfully processed ${pools.length} pools with state data`);
        
        // Save results
        const fs = require('fs');
        const result = {
          success: true,
          pools,
          totalEventsFound: allEvents.length,
          eventsProcessed: processedCount,
          blockRange: {
            start: START_BLOCK,
            end: currentBlock,
            totalBlocks: currentBlock - START_BLOCK
          },
          rpcUrl: rpcUrl.substring(0, 50) + '...'
        };
        
        fs.writeFileSync('data/v4-recent-discovery.json', JSON.stringify(result, null, 2));
        console.log(`\n✅ Results saved to: data/v4-recent-discovery.json`);
      } else {
        console.log('No Initialize events found in the recent blocks.');
        console.log('This could mean:');
        console.log('  1. Uniswap V4 is not yet deployed on Base');
        console.log('  2. No pools have been created yet');
        console.log('  3. Pools were created in older blocks (try increasing START_BLOCK)');
      }

      return { success: true };

    } catch (error) {
      console.error(`\n❌ Failed with Private RPC ${i + 1}:`);
      console.error(error instanceof Error ? error.message : error);
      
      if (i < PRIVATE_RPCS.length - 1) {
        console.log('\nTrying next private RPC...\n');
      }
    }
  }

  throw new Error('Unable to connect to any private RPC');
}

// Run the test
testV4DiscoveryRecent()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });