/**
 * Enhanced RPC Manager with Rate Limiting and Intelligent Retry
 * 
 * Features:
 * - Request rate limiting per RPC node
 * - Intelligent retry with exponential backoff
 * - Fallback mechanism for failed requests
 * - Request queuing and prioritization
 * - Health monitoring with adaptive timeouts
 * - Circuit breaker pattern for unhealthy nodes
 */

import { ethers } from 'ethers';

interface RPCNode {
  url: string;
  isPrivate: boolean;
  priority: number;
  lastUsed: number;
  requestCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastFailureTime: number;
  isHealthy: boolean;
  circuitBreakerUntil: number;
  averageResponseTime: number;
}

interface RequestConfig {
  maxRetries: number;
  retryDelay: number;
  retryBackoffMultiplier: number;
  maxRetryDelay: number;
  timeout: number;
  rateLimitPerSecond: number;
  rateLimitBurst: number;
}

interface QueuedRequest {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: number;
  retries: number;
}

export class EnhancedRPCManager {
  private nodes: Map<string, RPCNode>;
  private requestQueue: QueuedRequest[] = [];
  private requestTimers: Map<string, number[]> = new Map();
  private isProcessing = false;
  private config: RequestConfig;
  private circuitBreakerThreshold = 5;
  private circuitBreakerCooldown = 60000; // 1 minute
  private healthCheckInterval = 30000; // 30 seconds

  constructor(rpcUrls: string[], config: Partial<RequestConfig> = {}) {
    this.nodes = new Map();
    
    // Default configuration
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      retryBackoffMultiplier: config.retryBackoffMultiplier ?? 2,
      maxRetryDelay: config.maxRetryDelay ?? 10000,
      timeout: config.timeout ?? 10000,
      rateLimitPerSecond: config.rateLimitPerSecond ?? 10,
      rateLimitBurst: config.rateLimitBurst ?? 20
    };

    // Initialize RPC nodes
    rpcUrls.forEach((url, index) => {
      this.nodes.set(url, {
        url,
        isPrivate: url.includes('PRIVATE_RPC'),
        priority: url.includes('PRIVATE_RPC') ? 100 : index,
        lastUsed: 0,
        requestCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        isHealthy: true,
        circuitBreakerUntil: 0,
        averageResponseTime: 0
      });
    });

    // Start request queue processor
    this.startQueueProcessor();
    
    // Start health check
    this.startHealthCheck();
  }

  /**
   * Get the best available RPC node for a request
   */
  private selectBestNode(): RPCNode | null {
    const now = Date.now();
    const availableNodes = Array.from(this.nodes.values()).filter(node => {
      // Skip unhealthy nodes
      if (!node.isHealthy) return false;
      
      // Skip nodes in circuit breaker
      if (node.circuitBreakerUntil > now) return false;
      
      // Check rate limits
      const recentRequests = this.requestTimers.get(node.url) || [];
      const recentCount = recentRequests.filter(
        time => now - time < 1000
      ).length;
      
      return recentCount < this.config.rateLimitPerSecond;
    });

    if (availableNodes.length === 0) {
      return null;
    }

    // Sort by priority (private nodes first, then by least used)
    availableNodes.sort((a, b) => {
      if (a.isPrivate && !b.isPrivate) return -1;
      if (!a.isPrivate && b.isPrivate) return 1;
      return a.requestCount - b.requestCount;
    });

    return availableNodes[0];
  }

  /**
   * Execute a request with intelligent retry logic
   */
  async executeRequest<T>(
    requestFn: (provider: ethers.JsonRpcProvider) => Promise<T>,
    options: {
      priority?: number;
      allowPrivateNodes?: boolean;
    } = {}
  ): Promise<T> {
    const { priority = 0, allowPrivateNodes = true } = options;

    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({
        execute: async () => {
          const node = this.selectBestNode();
          if (!node) {
            throw new Error('No healthy RPC nodes available');
          }

          // Check if we should use private nodes
          if (!allowPrivateNodes && node.isPrivate) {
            throw new Error('Private nodes not allowed for this request');
          }

          const provider = new ethers.JsonRpcProvider(node.url);
          const startTime = Date.now();

          try {
            // Execute with timeout
            const result = await Promise.race([
              requestFn(provider),
              this.timeoutPromise(this.config.timeout)
            ]);

            // Record success
            this.recordSuccess(node, Date.now() - startTime);
            return result;

          } catch (error) {
            // Record failure
            this.recordFailure(node);
            throw error;
          }
        },
        resolve,
        reject,
        timestamp: Date.now(),
        priority,
        retries: 0
      });

      // Sort queue by priority
      this.requestQueue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Execute a request with retry logic
   */
  async executeWithRetry<T>(
    requestFn: (provider: ethers.JsonRpcProvider) => Promise<T>,
    options: {
      maxRetries?: number;
      priority?: number;
      allowPrivateNodes?: boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = this.config.maxRetries,
      priority = 0,
      allowPrivateNodes = true
    } = options;

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest(requestFn, {
          priority,
          allowPrivateNodes
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          // Calculate exponential backoff delay
          const delay = Math.min(
            this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, attempt),
            this.config.maxRetryDelay
          );
          
          console.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          console.warn(`Error: ${lastError.message}`);
          
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute multiple requests in parallel with rate limiting
   */
  async executeBatch<T>(
    requestFns: Array<(provider: ethers.JsonRpcProvider) => Promise<T>>,
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
      priority?: number;
    } = {}
  ): Promise<T[]> {
    const {
      batchSize = 10,
      delayBetweenBatches = 100,
      priority = 0
    } = options;

    const results: T[] = [];

    for (let i = 0; i < requestFns.length; i += batchSize) {
      const batch = requestFns.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(fn => this.executeRequest(fn, { priority }))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Batch request ${i + index} failed:`, result.reason);
        }
      });

      // Delay between batches
      if (i + batchSize < requestFns.length) {
        await this.sleep(delayBetweenBatches);
      }
    }

    return results;
  }

  /**
   * Record a successful request
   */
  private recordSuccess(node: RPCNode, responseTime: number): void {
    node.requestCount++;
    node.lastUsed = Date.now();
    node.consecutiveFailures = 0;
    
    // Update average response time
    node.averageResponseTime = node.averageResponseTime === 0
      ? responseTime
      : (node.averageResponseTime * 0.9 + responseTime * 0.1);

    // Record request timestamp for rate limiting
    const now = Date.now();
    const timestamps = this.requestTimers.get(node.url) || [];
    timestamps.push(now);
    
    // Keep only recent timestamps (within last 10 seconds)
    this.requestTimers.set(
      node.url,
      timestamps.filter(t => now - t < 10000)
    );
  }

  /**
   * Record a failed request
   */
  private recordFailure(node: RPCNode): void {
    node.failureCount++;
    node.consecutiveFailures++;
    node.lastFailureTime = Date.now();

    // Check if circuit breaker should be triggered
    if (node.consecutiveFailures >= this.circuitBreakerThreshold) {
      node.isHealthy = false;
      node.circuitBreakerUntil = Date.now() + this.circuitBreakerCooldown;
      console.error(`Circuit breaker triggered for node: ${node.url}`);
    }
  }

  /**
   * Start the request queue processor
   */
  private startQueueProcessor(): void {
    const processQueue = async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;

      while (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift()!;
        
        try {
          const result = await request.execute();
          request.resolve(result);
        } catch (error) {
          // Retry logic
          if (request.retries < this.config.maxRetries) {
            request.retries++;
            this.requestQueue.unshift(request);
            
            // Exponential backoff
            const delay = Math.min(
              this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, request.retries),
              this.config.maxRetryDelay
            );
            
            await this.sleep(delay);
          } else {
            request.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }

      this.isProcessing = false;
    };

    // Process queue every 10ms
    setInterval(processQueue, 10);
  }

  /**
   * Start health check for all nodes
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      const now = Date.now();
      
      for (const [url, node] of this.nodes.entries()) {
        // Check if circuit breaker should be reset
        if (!node.isHealthy && node.circuitBreakerUntil <= now) {
          // Test node health
          try {
            const provider = new ethers.JsonRpcProvider(url);
            await provider.getBlockNumber();
            
            node.isHealthy = true;
            node.consecutiveFailures = 0;
            console.log(`Node ${url} is now healthy`);
          } catch (error) {
            console.error(`Node ${url} is still unhealthy:`, error);
            node.circuitBreakerUntil = now + this.circuitBreakerCooldown;
          }
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Create a timeout promise
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics for all nodes
   */
  getStatistics(): Array<{
    url: string;
    isPrivate: boolean;
    isHealthy: boolean;
    requestCount: number;
    failureCount: number;
    averageResponseTime: number;
  }> {
    return Array.from(this.nodes.values()).map(node => ({
      url: node.url,
      isPrivate: node.isPrivate,
      isHealthy: node.isHealthy,
      requestCount: node.requestCount,
      failureCount: node.failureCount,
      averageResponseTime: node.averageResponseTime
    }));
  }

  /**
   * Get a provider for immediate use (bypasses queue)
   */
  getProvider(usePrivate: boolean = false): ethers.JsonRpcProvider | null {
    const node = this.selectBestNode();
    if (!node) return null;
    
    if (usePrivate && !node.isPrivate) return null;
    
    return new ethers.JsonRpcProvider(node.url);
  }

  /**
   * Manually mark a node as unhealthy
   */
  markUnhealthy(url: string): void {
    const node = this.nodes.get(url);
    if (node) {
      node.isHealthy = false;
      node.circuitBreakerUntil = Date.now() + this.circuitBreakerCooldown;
    }
  }

  /**
   * Manually mark a node as healthy
   */
  markHealthy(url: string): void {
    const node = this.nodes.get(url);
    if (node) {
      node.isHealthy = true;
      node.consecutiveFailures = 0;
      node.circuitBreakerUntil = 0;
    }
  }
}