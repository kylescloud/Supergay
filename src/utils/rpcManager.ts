import { ethers, JsonRpcProvider } from 'ethers';
import { PUBLIC_RPC_NODES, PRIVATE_RPC_NODES, RPC_CONFIG, BASE_CHAIN_ID } from '../config/constants';

/**
 * RPC Node Health Status
 */
interface RPCNode {
  url: string;
  provider: JsonRpcProvider;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastHealthCheck: number;
  averageResponseTime: number;
  requestCount: number;
}

/**
 * RPC Usage Type
 */
export enum RPCUsageType {
  SCANNING = 'scanning', // Public RPCs for reading data
  EXECUTION = 'execution', // Private RPCs for transactions
}

/**
 * RPC Manager
 * 
 * Manages multiple RPC nodes with:
 * - Round-robin load balancing
 * - Automatic failover
 * - Health checking
 * - Separate pools for scanning and execution
 */
export class RPCManager {
  private scanningNodes: RPCNode[] = [];
  private executionNodes: RPCNode[] = [];
  private currentScanningIndex: number = 0;
  private currentExecutionIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeNodes();
    this.startHealthChecks();
  }

  /**
   * Initialize RPC nodes
   */
  private initializeNodes(): void {
    // Initialize public scanning nodes
    for (const url of PUBLIC_RPC_NODES) {
      this.scanningNodes.push({
        url,
        provider: new JsonRpcProvider(url, BASE_CHAIN_ID),
        isHealthy: true,
        consecutiveFailures: 0,
        lastHealthCheck: 0,
        averageResponseTime: 0,
        requestCount: 0,
      });
    }

    // Initialize private execution nodes (only if configured)
    for (const url of PRIVATE_RPC_NODES) {
      if (url && url.trim() !== '') {
        this.executionNodes.push({
          url,
          provider: new JsonRpcProvider(url, BASE_CHAIN_ID),
          isHealthy: true,
          consecutiveFailures: 0,
          lastHealthCheck: 0,
          averageResponseTime: 0,
          requestCount: 0,
        });
      }
    }

    // If no private RPCs configured, fall back to public RPCs for execution
    if (this.executionNodes.length === 0) {
      console.warn('⚠️  No private RPC nodes configured. Using public RPCs for execution.');
      this.executionNodes = [...this.scanningNodes];
    }

    console.log(`✅ RPC Manager initialized:`);
    console.log(`   - Scanning nodes: ${this.scanningNodes.length}`);
    console.log(`   - Execution nodes: ${this.executionNodes.length}`);
  }

  /**
   * Get a provider for the specified usage type
   * Implements round-robin load balancing with failover
   */
  getProvider(usageType: RPCUsageType = RPCUsageType.SCANNING): JsonRpcProvider {
    const nodes = usageType === RPCUsageType.SCANNING ? this.scanningNodes : this.executionNodes;

    if (nodes.length === 0) {
      throw new Error(`No available RPC nodes for usage type: ${usageType}`);
    }

    // Find the next healthy node using round-robin
    const startIndex = usageType === RPCUsageType.SCANNING ? this.currentScanningIndex : this.currentExecutionIndex;
    let attempts = 0;
    let healthyNode: RPCNode | null = null;

    while (attempts < nodes.length) {
      const index = (startIndex + attempts) % nodes.length;
      const node = nodes[index];

      if (node.isHealthy) {
        healthyNode = node;
        // Update the current index for next time
        if (usageType === RPCUsageType.SCANNING) {
          this.currentScanningIndex = (index + 1) % nodes.length;
        } else {
          this.currentExecutionIndex = (index + 1) % nodes.length;
        }
        break;
      }

      attempts++;
    }

    if (!healthyNode) {
      // If no healthy nodes, reset all nodes to healthy and use the first one
      console.warn(`⚠️  No healthy ${usageType} nodes, resetting all nodes to healthy`);
      nodes.forEach(node => {
        node.isHealthy = true;
        node.consecutiveFailures = 0;
      });
      healthyNode = nodes[0];
    }

    return healthyNode.provider;
  }

  /**
   * Get the best provider (lowest average response time)
   */
  getBestProvider(usageType: RPCUsageType = RPCUsageType.SCANNING): JsonRpcProvider {
    const nodes = usageType === RPCUsageType.SCANNING ? this.scanningNodes : this.executionNodes;
    const healthyNodes = nodes.filter(node => node.isHealthy);

    if (healthyNodes.length === 0) {
      return this.getProvider(usageType);
    }

    // Sort by average response time
    healthyNodes.sort((a, b) => a.averageResponseTime - b.averageResponseTime);

    return healthyNodes[0].provider;
  }

  /**
   * Mark an RPC node as unhealthy
   */
  markUnhealthy(provider: JsonRpcProvider): void {
    const allNodes = [...this.scanningNodes, ...this.executionNodes];
    const node = allNodes.find(n => n.provider === provider);

    if (node) {
      node.consecutiveFailures++;
      
      if (node.consecutiveFailures >= RPC_CONFIG.maxConsecutiveFailures) {
        console.warn(`⚠️  Marking RPC node as unhealthy: ${node.url}`);
        node.isHealthy = false;
      }
    }
  }

  /**
   * Mark an RPC node as healthy
   */
  markHealthy(provider: JsonRpcProvider): void {
    const allNodes = [...this.scanningNodes, ...this.executionNodes];
    const node = allNodes.find(n => n.provider === provider);

    if (node) {
      node.isHealthy = true;
      node.consecutiveFailures = 0;
    }
  }

  /**
   * Record request timing for a node
   */
  recordTiming(provider: JsonRpcProvider, responseTime: number): void {
    const allNodes = [...this.scanningNodes, ...this.executionNodes];
    const node = allNodes.find(n => n.provider === provider);

    if (node) {
      node.requestCount++;
      // Exponential moving average for response time
      node.averageResponseTime = node.averageResponseTime === 0
        ? responseTime
        : node.averageResponseTime * 0.9 + responseTime * 0.1;
    }
  }

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    if (!RPC_CONFIG.enableHealthChecks) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllNodesHealth();
    }, RPC_CONFIG.healthCheckInterval);
  }

  /**
   * Check health of all RPC nodes
   */
  private async checkAllNodesHealth(): Promise<void> {
    const allNodes = [...this.scanningNodes, ...this.executionNodes];

    for (const node of allNodes) {
      try {
        const startTime = Date.now();
        const blockNumber = await Promise.race([
          node.provider.getBlockNumber(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), RPC_CONFIG.requestTimeout)
          )
        ]);

        const responseTime = Date.now() - startTime;

        if (typeof blockNumber === 'number') {
          node.isHealthy = responseTime <= RPC_CONFIG.maxResponseTime;
          node.consecutiveFailures = 0;
          node.lastHealthCheck = Date.now();
        } else {
          throw new Error('Invalid block number');
        }
      } catch (error) {
        console.error(`Health check failed for ${node.url}:`, error instanceof Error ? error.message : error);
        node.consecutiveFailures++;
        node.lastHealthCheck = Date.now();

        if (node.consecutiveFailures >= RPC_CONFIG.maxConsecutiveFailures) {
          node.isHealthy = false;
        }
      }
    }

    this.logHealthStatus();
  }

  /**
   * Log current health status
   */
  private logHealthStatus(): void {
    const healthyScanning = this.scanningNodes.filter(n => n.isHealthy).length;
    const healthyExecution = this.executionNodes.filter(n => n.isHealthy).length;

    console.log(`📊 RPC Health Status:`, {
      scanning: `${healthyScanning}/${this.scanningNodes.length} healthy`,
      execution: `${healthyExecution}/${this.executionNodes.length} healthy`,
    });
  }

  /**
   * Get RPC statistics
   */
  getStatistics(): {
    scanning: Array<{ url: string; isHealthy: boolean; avgResponseTime: number; requestCount: number }>;
    execution: Array<{ url: string; isHealthy: boolean; avgResponseTime: number; requestCount: number }>;
  } {
    return {
      scanning: this.scanningNodes.map(node => ({
        url: node.url,
        isHealthy: node.isHealthy,
        avgResponseTime: Math.round(node.averageResponseTime),
        requestCount: node.requestCount,
      })),
      execution: this.executionNodes.map(node => ({
        url: node.url,
        isHealthy: node.isHealthy,
        avgResponseTime: Math.round(node.averageResponseTime),
        requestCount: node.requestCount,
      })),
    };
  }

  /**
   * Reset all nodes to healthy status
   */
  resetAllNodes(): void {
    [...this.scanningNodes, ...this.executionNodes].forEach(node => {
      node.isHealthy = true;
      node.consecutiveFailures = 0;
    });
    console.log('✅ All RPC nodes reset to healthy');
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Export singleton instance
export const rpcManager = new RPCManager();