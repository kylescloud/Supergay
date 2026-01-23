# Multi-RPC System Documentation

## Overview

The arbitrage bot implements a robust multi-RPC system that mitigates rate limits and ensures reliable operation by combining multiple RPC endpoints.

## Architecture

### Public RPC Nodes (8 nodes)
Used for **scanning and data retrieval**:
- `https://mainnet.base.org` - Official Base RPC
- `https://base.publicnode.com` - PublicNode
- `https://base.meowrpc.com` - MeowRPC
- `https://base.gateway.tenderly.co` - Tenderly Gateway
- `https://rpc.1inch.io/base` - 1inch RPC
- `https://rpc.quicknode.com/base/v1/...` - QuickNode (requires API key)
- `https://base.drpc.org` - DRPC
- `https://base-rpc.publicnode.com` - PublicNode alternative

### Private RPC Nodes (2 nodes)
Used for **execution only** (transaction broadcasting):
- `PRIVATE_RPC_1` - Primary private RPC (user-configured)
- `PRIVATE_RPC_2` - Secondary private RPC (user-configured)

**⚠️ Important**: If no private RPCs are configured, the system will fall back to using public RPCs for execution, but this is not recommended for production use.

## Features

### 1. Round-Robin Load Balancing
- Requests are distributed evenly across all healthy RPC nodes
- Automatic rotation to prevent any single node from being overwhelmed
- Tracks request counts and response times for each node

### 2. Automatic Failover
- When an RPC node fails (timeout, rate limit, error), it's automatically marked as unhealthy
- The system immediately switches to the next healthy node
- Failed nodes are periodically health-checked and restored if they recover

### 3. Health Monitoring
- Continuous health checks every 30 seconds
- Tracks:
  - Node availability
  - Average response time
  - Consecutive failures
  - Request count
- Nodes exceeding 5 consecutive failures are marked unhealthy
- Nodes with response time > 2000ms are marked unhealthy

### 4. Separation of Concerns
- **Scanning RPCs**: Used for reading blockchain data (pool states, prices, etc.)
- **Execution RPCs**: Used exclusively for transaction broadcasting
- This ensures execution transactions get priority and reliability

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Private RPC Nodes (for execution only)
PRIVATE_RPC_1=https://your-private-rpc-1.com
PRIVATE_RPC_2=https://your-private-rpc-2.com
```

### RPC Configuration (in `src/config/constants.ts`)

```typescript
export const RPC_CONFIG = {
  maxRetriesPerNode: 3,           // Max retries per node before switching
  requestTimeout: 10000,          // Request timeout in milliseconds
  healthCheckInterval: 30000,     // Health check interval in milliseconds
  enableHealthChecks: true,       // Enable/disable health checks
  maxResponseTime: 2000,          // Max response time for healthy node (ms)
  maxConsecutiveFailures: 5,      // Max consecutive failures before marking unhealthy
};
```

## Usage

### Basic Usage

The RPC Manager is automatically initialized when the bot starts:

```typescript
import { config } from './config';

// Get provider for scanning (read operations)
const scanningProvider = config.getScanningProvider();

// Get provider for execution (write operations)
const executionProvider = config.getExecutionProvider();
```

### Advanced Usage

```typescript
import { rpcManager, RPCUsageType } from './utils/rpcManager';

// Get best provider (lowest average response time)
const bestProvider = rpcManager.getBestProvider(RPCUsageType.SCANNING);

// Mark a node as unhealthy (manual failover)
rpcManager.markUnhealthy(provider);

// Mark a node as healthy (manual restore)
rpcManager.markHealthy(provider);

// Record request timing for statistics
rpcManager.recordTiming(provider, responseTime);

// Get RPC statistics
const stats = rpcManager.getStatistics();
console.log(stats.scanning);
console.log(stats.execution);

// Reset all nodes to healthy
rpcManager.resetAllNodes();
```

## Monitoring

### View RPC Statistics

Run the status command to see real-time RPC statistics:

```bash
npm run status
```

Output example:
```
📊 RPC Statistics:

🔍 Scanning Nodes:
  1. ✅ https://mainnet.base.org
     Avg Response: 180ms | Requests: 245
  2. ✅ https://base.publicnode.com
     Avg Response: 377ms | Requests: 198
  ...

⚡ Execution Nodes:
  1. ✅ https://your-private-rpc-1.com
     Avg Response: 95ms | Requests: 15
  2. ✅ https://your-private-rpc-2.com
     Avg Response: 120ms | Requests: 8
  ...
```

### Health Check Logs

The system logs health status every 30 seconds:

```
📊 RPC Health Status: {
  scanning: "6/8 healthy",
  execution: "2/2 healthy"
}
```

## Testing

Test the RPC Manager functionality:

```bash
npx ts-node test-rpc-manager.ts
```

This will:
1. Test round-robin load balancing across all nodes
2. Show request distribution and response times
3. Test failover mechanism
4. Display statistics
5. Test execution provider separation

## Best Practices

### 1. Always Use Private RPCs for Execution
- Public RPCs can have rate limits and unreliable transaction inclusion
- Private RPCs provide better performance and reliability for transactions
- Configure at least 2 private RPCs for redundancy

### 2. Monitor RPC Health
- Regularly check the status command
- Watch for nodes marked as unhealthy
- Replace underperforming nodes in the configuration

### 3. Choose Reliable RPC Providers
- For private RPCs, use providers with:
  - High uptime (99.9%+)
  - Low latency
  - No rate limits for your use case
  - Good support for pending transactions

Recommended private RPC providers:
- Alchemy
- Infura
- QuickNode
- Ankr (with API key)
- Chainstack

### 4. Adjust Health Check Settings
If you're experiencing frequent failover, consider:
- Increasing `maxConsecutiveFailures` (default: 5)
- Increasing `maxResponseTime` (default: 2000ms)
- Increasing `requestTimeout` (default: 10000ms)

## Troubleshooting

### All Nodes Marked Unhealthy

**Problem**: All RPC nodes become unhealthy

**Solution**:
```bash
# Reset all nodes to healthy
npx ts-node -e "import { rpcManager } from './src/utils/rpcManager'; rpcManager.resetAllNodes();"
```

### Slow Response Times

**Problem**: High average response times

**Solution**:
1. Check your network connection
2. Remove slow nodes from `PUBLIC_RPC_NODES`
3. Consider adding geographically closer RPC nodes
4. Use private RPCs with better performance

### Rate Limit Errors

**Problem**: Frequent rate limit errors despite multiple nodes

**Solution**:
1. Reduce scan frequency
2. Add more public RPC nodes
3. Use private RPCs for all operations
4. Increase `maxRetriesPerNode` configuration

## Performance Metrics

The RPC Manager tracks the following metrics:

### Per Node
- ✅ Health status (healthy/unhealthy)
- 📊 Average response time (ms)
- 📈 Request count
- ❌ Consecutive failures
- ⏰ Last health check time

### System-wide
- 🔄 Load balancing effectiveness
- 🚦 Failover frequency
- 📡 Overall success rate

## Security Considerations

1. **Never commit private RPC URLs** to version control
2. **Use environment variables** for all private RPC configurations
3. **Rotate private RPC keys** regularly if using API keys
4. **Monitor for unauthorized access** to your private RPC endpoints
5. **Use authenticated RPC endpoints** when available

## Contributing

When adding new public RPC nodes:
1. Test the node for reliability
2. Ensure it supports the required RPC methods
3. Check for rate limits
4. Verify reasonable response times
5. Add to `PUBLIC_RPC_NODES` array in `src/config/constants.ts`

## License

This multi-RPC system is part of the Base Aave V3 Flash Loan Arbitrage Bot project.