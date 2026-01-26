import { ethers } from 'ethers';
import { PUBLIC_RPC_NODES } from '../src/config/constants.js';

interface RPCTestResult {
  url: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
}

async function testRPC(url: string): Promise<RPCTestResult> {
  const startTime = Date.now();
  
  try {
    const provider = new ethers.JsonRpcProvider(url);
    await provider.getBlockNumber();
    const responseTime = Date.now() - startTime;
    
    return {
      url,
      healthy: true,
      responseTime
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      url,
      healthy: false,
      responseTime,
      error: error.message
    };
  }
}

async function main() {
  console.log('🔍 Testing RPC Health...\n');
  
  const results: RPCTestResult[] = [];
  
  for (const url of PUBLIC_RPC_NODES) {
    console.log(`Testing ${url}...`);
    const result = await testRPC(url);
    results.push(result);
    
    const status = result.healthy ? '✅' : '❌';
    const time = result.responseTime;
    console.log(`${status} ${result.url} - ${time}ms`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log();
  }
  
  const healthyCount = results.filter(r => r.healthy).length;
  const totalCount = results.length;
  const avgResponseTime = results
    .filter(r => r.healthy)
    .reduce((sum, r) => sum + r.responseTime, 0) / healthyCount;
  
  console.log('\n📊 Summary:');
  console.log(`Healthy RPCs: ${healthyCount}/${totalCount}`);
  console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
  
  if (healthyCount === totalCount) {
    console.log('\n✅ All RPC nodes are healthy!');
  } else {
    console.log('\n⚠️  Some RPC nodes are unhealthy');
  }
}

main().catch(console.error);