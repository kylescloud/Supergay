import { rpcManager, RPCUsageType } from './src/utils/rpcManager';
import { ethers } from 'ethers';

async function testRPCManager() {
  console.log('=== Testing RPC Manager ===\n');

  // Test 1: Get scanning provider and make requests
  console.log('Test 1: Scanning with round-robin load balancing');
  console.log('------------------------------------------------');
  
  for (let i = 0; i < 10; i++) {
    try {
      const provider = rpcManager.getProvider(RPCUsageType.SCANNING);
      const startTime = Date.now();
      const blockNumber = await provider.getBlockNumber();
      const responseTime = Date.now() - startTime;
      
      rpcManager.recordTiming(provider, responseTime);
      
      console.log(`Request ${i + 1}: Block ${blockNumber} (${responseTime}ms)`);
    } catch (error) {
      console.error(`Request ${i + 1} failed:`, error instanceof Error ? error.message : error);
    }
  }

  // Test 2: Show statistics
  console.log('\n\nTest 2: RPC Statistics after requests');
  console.log('---------------------------------------');
  const stats = rpcManager.getStatistics();
  
  console.log('\n🔍 Scanning Nodes:');
  stats.scanning.forEach((node, i) => {
    const healthIcon = node.isHealthy ? '✅' : '❌';
    console.log(`  ${i + 1}. ${healthIcon} ${node.url}`);
    console.log(`     Avg Response: ${node.avgResponseTime}ms | Requests: ${node.requestCount}`);
  });

  // Test 3: Test failover by marking a node as unhealthy
  console.log('\n\nTest 3: Testing failover mechanism');
  console.log('-----------------------------------');
  const firstProvider = rpcManager.getProvider(RPCUsageType.SCANNING);
  console.log('Marking current provider as unhealthy...');
  rpcManager.markUnhealthy(firstProvider);
  
  console.log('\nMaking request with unhealthy node:');
  const providerAfterFailover = rpcManager.getProvider(RPCUsageType.SCANNING);
  const blockNumber = await providerAfterFailover.getBlockNumber();
  console.log(`Success! Got block ${blockNumber} from a healthy node`);

  // Test 4: Show statistics after failover
  console.log('\n\nTest 4: Statistics after failover');
  console.log('--------------------------------');
  const statsAfterFailover = rpcManager.getStatistics();
  
  console.log('\n🔍 Scanning Nodes:');
  statsAfterFailover.scanning.forEach((node, i) => {
    const healthIcon = node.isHealthy ? '✅' : '❌';
    console.log(`  ${i + 1}. ${healthIcon} ${node.url}`);
    console.log(`     Avg Response: ${node.avgResponseTime}ms | Requests: ${node.requestCount}`);
  });

  // Test 5: Test execution provider (if different from scanning)
  console.log('\n\nTest 5: Testing Execution Provider');
  console.log('----------------------------------');
  const executionProvider = rpcManager.getProvider(RPCUsageType.EXECUTION);
  const executionBlock = await executionProvider.getBlockNumber();
  console.log(`Execution provider block: ${executionBlock}`);

  console.log('\n\n✅ All tests completed successfully!');
  
  // Cleanup
  rpcManager.stop();
  process.exit(0);
}

testRPCManager().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});