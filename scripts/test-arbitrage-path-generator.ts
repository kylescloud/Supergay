import { ArbitrageGraph, ArbitragePathGenerator, AAVE_V3_ASSETS } from '../src/core/arbitragePathGenerator.js';
import { PoolRegistryManager } from '../src/pools/registry.js';
import { ethers } from 'ethers';

async function testArbitragePathGenerator() {
  console.log('=== 🚀 Advanced Arbitrage Path Generator Test ===\n');

  try {
    // Load pool registry
    console.log('📊 Loading pool registry...');
    const registry = new PoolRegistryManager();
    await registry.load();
    
    const allPools = registry.getAllPools();
    const poolsWithState = allPools.filter(p => 
      (p.reserve0 && p.reserve1) || (p.liquidity && p.sqrtPriceX96)
    );
    
    console.log(`✅ Loaded ${poolsWithState.length} pools with state data\n`);

    // Build arbitrage graph
    console.log('🏗️  Building arbitrage graph...');
    const graph = new ArbitrageGraph(registry);
    await graph.buildGraph(
      BigInt(10000), // $10K minimum liquidity
      3000 // 300 basis points = 3% maximum fee
    );
    
    console.log(`📈 Graph statistics:`);
    console.log(`   Tokens: ${graph.getAllTokens().length}`);
    console.log(`   Total edges: ${graph.getEdges(graph.getAllTokens()[0] || '').length || 0}\n`);

    // Test with different Aave V3 tokens
    const testTokens = [
      { symbol: 'WETH', address: AAVE_V3_ASSETS.WETH },
      { symbol: 'USDC', address: AAVE_V3_ASSETS.USDC },
      { symbol: 'USDbC', address: AAVE_V3_ASSETS.USDbC }
    ];
    
    console.log('\n🔍 Checking test tokens in graph:');
    testTokens.forEach(token => {
      const found = graph.hasToken(token.address);
      const edges = graph.getEdges(token.address);
      console.log(`   ${token.symbol} (${token.address}): ${found ? '✅ Found' : '❌ Not found'}, ${edges.length} edges`);
      if (edges.length > 0 && edges.length <= 5) {
        edges.forEach(edge => {
          console.log(`      → ${edge.toToken} (${edge.dex}, fee: ${(edge.fee * 100).toFixed(2)}%)`);
        });
      }
    });

    const allResults = [];

    for (const token of testTokens) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Testing with ${token.symbol} (${token.address})`);
      console.log(`${'='.repeat(60)}\n`);

      if (!graph.hasToken(token.address)) {
        console.log(`⚠️  Token ${token.symbol} not found in graph - skipping\n`);
        continue;
      }

      // Initialize path generator
      const generator = new ArbitragePathGenerator(
        graph,
        5, // Max 5 hops
        0.00001 // 0.001% minimum profit (for testing)
      );

      // Generate triangular paths
      console.log('🔺 Generating triangular arbitrage paths...');
      const triangularPaths = generator.generateTriangularPaths(token.address);
      console.log(`   Found ${triangularPaths.length} triangular paths\n`);

      // Generate multi-hop paths
      console.log('🔄 Generating multi-hop arbitrage paths...');
      const multiHopPaths = generator.generateMultiHopPaths(token.address);
      console.log(`   Found ${multiHopPaths.length} multi-hop paths\n`);

      // Generate cross-DEX paths
      console.log('🌐 Generating cross-DEX arbitrage paths...');
      const crossDEXPaths = generator.generateCrossDEXPaths(token.address);
      console.log(`   Found ${crossDEXPaths.length} cross-DEX paths\n`);

      // Analyze results
      const tokenResults = {
        token: token.symbol,
        address: token.address,
        triangularCount: triangularPaths.length,
        multiHopCount: multiHopPaths.length,
        crossDEXCount: crossDEXPaths.length,
        totalPaths: triangularPaths.length + multiHopPaths.length + crossDEXPaths.length,
        bestTriangular: triangularPaths.length > 0 ? triangularPaths[0] : null,
        bestMultiHop: multiHopPaths.length > 0 ? multiHopPaths[0] : null,
        bestCrossDEX: crossDEXPaths.length > 0 ? crossDEXPaths[0] : null
      };

      allResults.push(tokenResults);

      // Display best opportunities
      if (triangularPaths.length > 0) {
        console.log('🏆 Best Triangular Opportunity:');
        displayOpportunity(triangularPaths[0], token.symbol);
      }

      if (multiHopPaths.length > 0) {
        console.log('🏆 Best Multi-Hop Opportunity:');
        displayOpportunity(multiHopPaths[0], token.symbol);
      }

      if (crossDEXPaths.length > 0) {
        console.log('🏆 Best Cross-DEX Opportunity:');
        displayOpportunity(crossDEXPaths[0], token.symbol);
      }

      console.log();
    }

    // Generate summary report
    generateSummaryReport(allResults, graph);

  } catch (error) {
    console.error('❌ Error testing arbitrage path generator:', error);
    throw error;
  }
}

function displayOpportunity(path: any, tokenSymbol: string): void {
  console.log(`   ID: ${path.id}`);
  console.log(`   Path Length: ${path.totalHops} hops`);
  console.log(`   Flash Loan: ${ethers.formatUnits(path.flashLoanAmount, 18)} ${tokenSymbol}`);
  console.log(`   Estimated Profit: ${ethers.formatUnits(path.estimatedProfit, 18)} ${tokenSymbol}`);
  console.log(`   ROI: ${(path.roi * 100).toFixed(4)}%`);
  console.log(`   Confidence: ${(path.confidence * 100).toFixed(2)}%`);
  console.log(`   Path:`);
  
  path.steps.forEach((step: any, idx: number) => {
    const fromSymbol = ArbitragePathGenerator.getTokenSymbol(step.fromToken);
    const toSymbol = ArbitragePathGenerator.getTokenSymbol(step.toToken);
    console.log(`      ${idx + 1}. ${fromSymbol} → ${toSymbol} (${step.dex})`);
    console.log(`         Fee: ${(step.fee * 100).toFixed(2)}%`);
  });
  console.log();
}

function generateSummaryReport(results: any[], graph: ArbitrageGraph): void {
  console.log(`${'='.repeat(60)}`);
  console.log('📊 FINAL SUMMARY REPORT');
  console.log(`${'='.repeat(60)}\n`);

  const totalPaths = results.reduce((sum, r) => sum + r.totalPaths, 0);
  const totalTriangular = results.reduce((sum, r) => sum + r.triangularCount, 0);
  const totalMultiHop = results.reduce((sum, r) => sum + r.multiHopCount, 0);
  const totalCrossDEX = results.reduce((sum, r) => sum + r.crossDEXCount, 0);

  console.log(`📈 Graph Statistics:`);
  console.log(`   Total Tokens: ${graph.getAllTokens().length}`);
  console.log(`   Available Pools: ${results.length} tokens tested\n`);

  console.log(`🎯 Path Generation Results:`);
  console.log(`   Total Paths Generated: ${totalPaths}`);
  console.log(`   Triangular Paths: ${totalTriangular}`);
  console.log(`   Multi-Hop Paths: ${totalMultiHop}`);
  console.log(`   Cross-DEX Paths: ${totalCrossDEX}\n`);

  console.log(`📊 Results by Token:`);
  results.forEach(result => {
    console.log(`   ${result.token.padEnd(8)}: ${result.totalPaths.toString().padStart(4)} total`);
    console.log(`              ${result.triangularCount} triangular, ${result.multiHopCount} multi-hop, ${result.crossDEXCount} cross-DEX`);
  });

  // Find best overall opportunity
  const bestOpportunities = results
    .map(r => [r.bestTriangular, r.bestMultiHop, r.bestCrossDEX].filter(Boolean))
    .flat()
    .sort((a, b) => Number(b.netProfit) - Number(a.netProfit));

  if (bestOpportunities.length > 0) {
    console.log(`\n🏆 BEST OVERALL OPPORTUNITY:`);
    const best = bestOpportunities[0];
    const tokenSymbol = results.find(r => 
      r.bestTriangular === best || r.bestMultiHop === best || r.bestCrossDEX === best
    )?.token || 'UNKNOWN';
    
    displayOpportunity(best, tokenSymbol);
  }

  console.log(`${'='.repeat(60)}\n`);
  console.log('✅ Arbitrage path generator test completed successfully!');
  console.log('📝 Results saved to: reports/path-generator-results.json\n');

  // Save results to file
  import('fs').then(fs => {
    fs.writeFileSync(
      'reports/path-generator-results.json',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        graphStats: {
          totalTokens: graph.getAllTokens().length,
          testedTokens: results.length
        },
        summary: {
          totalPaths,
          totalTriangular,
          totalMultiHop,
          totalCrossDEX
        },
        results
      }, null, 2)
    );
  });
}

// Run the test
testArbitragePathGenerator().catch(console.error);