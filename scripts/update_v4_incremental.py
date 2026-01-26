#!/usr/bin/env python3
"""
Update Uniswap V4 fetcher to use incremental block range queries
"""

# Read the original file
with open('src/pools/fetchers/uniswapV4.ts', 'r') as f:
    content = f.read()

# Find the section to replace (from "async fetchAllPools" to before the event processing loop)
old_code = """      // Get current block number
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      stats.rpcCalls++;

      // Fetch Initialize events from Pool Manager
      console.log('Fetching Initialize events from Pool Manager...');
      const initializeFilter = this.poolManager.filters.Initialize();
      const events = await this.poolManager.queryFilter(initializeFilter, 0, currentBlock);
      stats.rpcCalls++;

      console.log(`Found ${events.length} Initialize events\\n`);
      stats.totalRequested = events.length;

      if (events.length === 0) {
        errors.push('No Initialize events found - Uniswap V4 may not have active pools on this chain yet');
        stats.executionTime = Date.now() - startTime;
        return {
          success: true,
          pools: [],
          errors,
          stats
        };
      }

      // Process events in batches to avoid RPC rate limits
      const batchSize = 50;
      const batches = Math.ceil(events.length / batchSize);
      stats.batches = batches;

      console.log(`Processing ${events.length} pool keys in ${batches} batches of ${batchSize}...\\n`);"""

new_code = """      // Get current block number
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      stats.rpcCalls++;

      // Configure incremental query parameters
      const BLOCK_RANGE_LIMIT = 100; // RPC limit for block range queries
      const DELAY_BETWEEN_QUERIES = 500; // ms delay between block range queries
      const DELAY_BETWEEN_BATCHES = 100; // ms delay between processing batches
      
      // Fetch Initialize events from Pool Manager using incremental block ranges
      console.log('Fetching Initialize events from Pool Manager using incremental block ranges...');
      const initializeFilter = this.poolManager.filters.Initialize();
      
      let allEvents: any[] = [];
      let startBlock = 0;
      let endBlock = currentBlock;
      let rangeCount = 0;
      
      // Process block ranges in chunks of BLOCK_RANGE_LIMIT
      while (startBlock <= endBlock) {
        const rangeEnd = Math.min(startBlock + BLOCK_RANGE_LIMIT - 1, endBlock);
        rangeCount++;
        
        console.log(`  [Range ${rangeCount}] Fetching blocks ${startBlock} to ${rangeEnd}...`);
        
        try {
          const events = await this.poolManager.queryFilter(
            initializeFilter, 
            startBlock, 
            rangeEnd
          );
          stats.rpcCalls++;
          
          if (events.length > 0) {
            allEvents = allEvents.concat(events);
            console.log(`    Found ${events.length} Initialize events in this range`);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`    Error querying blocks ${startBlock}-${rangeEnd}: ${errMsg}`);
          errors.push(`Block range ${startBlock}-${rangeEnd}: ${errMsg}`);
          
          // If it's a block range limit error, try a smaller range
          if (errMsg.includes('query returned more than') || errMsg.includes('exceeds block range')) {
            console.log(`    Retrying with smaller range (50 blocks)...`);
            const smallerRangeEnd = Math.min(startBlock + 49, rangeEnd);
            try {
              const events = await this.poolManager.queryFilter(
                initializeFilter,
                startBlock,
                smallerRangeEnd
              );
              stats.rpcCalls++;
              
              if (events.length > 0) {
                allEvents = allEvents.concat(events);
                console.log(`    Found ${events.length} Initialize events in smaller range`);
              }
              
              // Adjust startBlock to skip the blocks we just queried
              startBlock = smallerRangeEnd + 1;
              continue;
            } catch (retryError) {
              console.error(`    Retry failed: ${retryError}`);
            }
          }
        }
        
        // Move to next block range
        startBlock = rangeEnd + 1;
        
        // Add delay between queries to avoid rate limiting
        if (startBlock <= endBlock) {
          await this.sleep(DELAY_BETWEEN_QUERIES);
        }
      }
      
      console.log(`\\nTotal Initialize events found across ${rangeCount} block ranges: ${allEvents.length}\\n`);
      stats.totalRequested = allEvents.length;

      if (allEvents.length === 0) {
        errors.push('No Initialize events found - Uniswap V4 may not have active pools on this chain yet');
        stats.executionTime = Date.now() - startTime;
        return {
          success: true,
          pools: [],
          errors,
          stats
        };
      }

      // Process events in batches to avoid RPC rate limits
      const batchSize = 50;
      const batches = Math.ceil(allEvents.length / batchSize);
      stats.batches = batches;

      console.log(`Processing ${allEvents.length} pool keys in ${batches} batches of ${batchSize}...\\n`);"""

# Replace the old code with new code
content = content.replace(old_code, new_code)

# Also update the batch processing loop to use allEvents
old_loop = """      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);"""
new_loop = """      for (let i = 0; i < allEvents.length; i += batchSize) {
        const batch = allEvents.slice(i, i + batchSize);"""
content = content.replace(old_loop, new_loop)

# Update the header text
old_header = """      console.log(`\\n${'='.repeat(80)}`);
      console.log(`Uniswap V4 Pool Discovery`);
      console.log(`${'='.repeat(80)}`);"""
new_header = """      console.log(`\\n${'='.repeat(80)}`);
      console.log(`Uniswap V4 Pool Discovery (Incremental Block Range Queries)`);
      console.log(`${'='.repeat(80)}`);"""
content = content.replace(old_header, new_header)

# Write the updated content
with open('src/pools/fetchers/uniswapV4.ts', 'w') as f:
    f.write(content)

print("✅ Successfully updated Uniswap V4 fetcher with incremental block range queries")