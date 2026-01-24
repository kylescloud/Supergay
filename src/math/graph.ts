import { BigNumber } from 'bignumber.js';
import { PoolState, Token, SwapRoute, Cycle } from '../types';
import { transformToLogSpace } from './effectiveRate';

/**
 * Graph node representing a token
 */
export class GraphNode {
  public address: string;
  public symbol: string;
  public edges: GraphEdge[];

  constructor(token: Token) {
    this.address = token.address;
    this.symbol = token.symbol;
    this.edges = [];
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }
}

/**
 * Graph edge representing a swap route between tokens
 */
export class GraphEdge {
  public from: GraphNode;
  public to: GraphNode;
  public pool: PoolState;
  public weight: number; // Log-space weight
  public effectiveRate: number;
  public gasEstimate: number;

  constructor(from: GraphNode, to: GraphNode, pool: PoolState, effectiveRate: number, gasEstimate: number) {
    this.from = from;
    this.to = to;
    this.pool = pool;
    this.effectiveRate = effectiveRate;
    this.weight = transformToLogSpace(effectiveRate);
    this.gasEstimate = gasEstimate;
  }
}

/**
 * Directed graph representing the token exchange network
 * 
 * Nodes = tokens
 * Edges = swap routes (one per DEX/pool/fee tier)
 * 
 * Multiple edges allowed between same nodes (different DEXs or fee tiers)
 */
export class ExchangeGraph {
  private nodes: Map<string, GraphNode>;
  private edges: GraphEdge[];

  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  /**
   * Get or create a node for a token
   */
  getOrCreateNode(token: Token): GraphNode {
    let node = this.nodes.get(token.address.toLowerCase());
    if (!node) {
      node = new GraphNode(token);
      this.nodes.set(token.address.toLowerCase(), node);
    }
    return node;
  }

  /**
   * Add a directed edge representing a swap route
   */
  addEdge(tokenIn: Token, tokenOut: Token, pool: PoolState, effectiveRate: number, gasEstimate: number): void {
    const fromNode = this.getOrCreateNode(tokenIn);
    const toNode = this.getOrCreateNode(tokenOut);
    const edge = new GraphEdge(fromNode, toNode, pool, effectiveRate, gasEstimate);
    fromNode.addEdge(edge);
    this.edges.push(edge);
  }

  /**
   * Build graph from pool states and calculate effective rates
   */
  buildFromPools(pools: PoolState[], loanAmount: bigint): void {
    for (const pool of pools) {
      try {
        // Add edge for token0 -> token1
        const rate1 = this.calculatePoolRate(pool, pool.token0, pool.token1, loanAmount);
        if (rate1.rate > 0) {
          this.addEdge(pool.token0, pool.token1, pool, rate1.rate, rate1.gasEstimate);
        } else {
          console.log(`Skipping edge ${pool.token0.symbol} -> ${pool.token1.symbol}: rate is ${rate1.rate}`);
        }
      } catch (error: any) {
        console.error(`Error calculating rate for ${pool.token0.symbol} -> ${pool.token1.symbol}: ${error.message}`);
      }

      try {
        // Add edge for token1 -> token0
        const rate2 = this.calculatePoolRate(pool, pool.token1, pool.token0, loanAmount);
        if (rate2.rate > 0) {
          this.addEdge(pool.token1, pool.token0, pool, rate2.rate, rate2.gasEstimate);
        } else {
          console.log(`Skipping edge ${pool.token1.symbol} -> ${pool.token0.symbol}: rate is ${rate2.rate}`);
        }
      } catch (error: any) {
        console.error(`Error calculating rate for ${pool.token1.symbol} -> ${pool.token0.symbol}: ${error.message}`);
      }
    }
  }

  /**
   * Calculate effective rate for a pool swap
   */
  private calculatePoolRate(pool: PoolState, tokenIn: Token, tokenOut: Token, amountIn: bigint): any {
    // Import dynamically to avoid circular dependency
    const { calculateEffectiveRate } = require('./effectiveRate');
    return calculateEffectiveRate(pool, tokenIn, tokenOut, amountIn);
  }

  /**
   * Find negative cycles using Bellman-Ford algorithm
   * 
   * A negative cycle in log-space corresponds to a profitable arbitrage cycle:
   * Σ(-ln(rate)) < 0  <=>  Π(rate) > 1
   * 
   * @param startToken - Token to start cycle detection from
   * @param maxHops - Maximum number of hops in cycle
   * @returns List of profitable cycles
   */
  findNegativeCycles(startToken: Token, maxHops: number = 4): Cycle[] {
    const startNode = this.nodes.get(startToken.address.toLowerCase());
    if (!startNode) {
      return [];
    }

    const cycles: Cycle[] = [];
    const distances = new Map<string, number>();
    const predecessors = new Map<string, { node: GraphNode; edge: GraphEdge } | null>();

    // Initialize distances
    for (const [address] of this.nodes) {
      distances.set(address, Infinity);
      predecessors.set(address, null);
    }
    distances.set(startNode.address, 0);

    // Relax edges up to maxHops times
    for (let i = 0; i < maxHops; i++) {
      let updated = false;
      for (const edge of this.edges) {
        const u = edge.from;
        const v = edge.to;
        
        if (distances.get(u.address)! !== Infinity && 
            distances.get(u.address)! + edge.weight < distances.get(v.address)!) {
          distances.set(v.address, distances.get(u.address)! + edge.weight);
          predecessors.set(v.address, { node: u, edge });
          updated = true;
        }
      }
      if (!updated) break;
    }

    // Check for negative cycles
    for (const edge of this.edges) {
      const u = edge.from;
      const v = edge.to;
      
      if (distances.get(u.address)! !== Infinity && 
          distances.get(u.address)! + edge.weight < distances.get(v.address)!) {
        // Found a negative cycle - reconstruct the path
        const cycle = this.reconstructCycle(v, startNode);
        if (cycle.path.length <= maxHops && cycle.path.length >= 2) {
          cycles.push(cycle);
        }
      }
    }

    // Remove duplicate cycles
    return this.removeDuplicateCycles(cycles);
  }

  /**
   * Reconstruct cycle from predecessors
   */
  private reconstructCycle(endNode: GraphNode, startNode: GraphNode): Cycle {
    const path: string[] = [];
    let current = endNode;
    const visited = new Set<string>();

    // Follow predecessors until we find a cycle
    while (current && !visited.has(current.address)) {
      visited.add(current.address);
      path.push(current.symbol);
      const pred = this.getPredecessor(current);
      if (!pred) break;
      current = pred.node;
    }

    // Extract the cycle (from when we first visited current)
    const cycleStart = path.indexOf(current.symbol);
    const cyclePath = path.slice(cycleStart);
    cyclePath.push(cyclePath[0]); // Close the cycle

    // Calculate total weight
    let totalWeight = 0;
    let effectiveRate = 1;
    for (let i = 0; i < cyclePath.length - 1; i++) {
      const node = this.findNodeBySymbol(cyclePath[i]);
      const nextNode = this.findNodeBySymbol(cyclePath[i + 1]);
      if (node && nextNode) {
        const edge = node.edges.find(e => e.to === nextNode);
        if (edge) {
          totalWeight += edge.weight;
          effectiveRate *= edge.effectiveRate;
        }
      }
    }

    // Profit potential (in log space, negative = profitable)
    const profitPotential = -totalWeight;

    return {
      path: cyclePath,
      totalWeight,
      effectiveRate,
      profitPotential,
    };
  }

  /**
   * Get predecessor for a node
   */
  private getPredecessor(node: GraphNode): { node: GraphNode; edge: GraphEdge } | null {
    // This would be implemented with a predecessors map in a full implementation
    // For now, return null
    return null;
  }

  /**
   * Find node by token symbol
   */
  private findNodeBySymbol(symbol: string): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.symbol === symbol) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Remove duplicate cycles (same path, different rotation)
   */
  private removeDuplicateCycles(cycles: Cycle[]): Cycle[] {
    const seen = new Set<string>();
    const unique: Cycle[] = [];

    for (const cycle of cycles) {
      const normalized = this.normalizeCyclePath(cycle.path);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(cycle);
      }
    }

    return unique;
  }

  /**
   * Normalize cycle path to canonical form
   */
  private normalizeCyclePath(path: string[]): string {
    // Find the lexicographically smallest rotation
    let best = path.join(',');
    for (let i = 1; i < path.length - 1; i++) {
      const rotated = [...path.slice(i), ...path.slice(0, i)].join(',');
      if (rotated < best) {
        best = rotated;
      }
    }
    return best;
  }

  /**
   * Get all nodes
   */
  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getEdges(): GraphEdge[] {
    return this.edges;
  }

  /**
   * Get node by address
   */
  getNode(address: string): GraphNode | undefined {
    return this.nodes.get(address.toLowerCase());
  }

  /**
   * Clear graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges = [];
  }

  /**
   * Get graph statistics
   */
  getStats(): { nodes: number; edges: number; density: number } {
    const nodes = this.nodes.size;
    const edges = this.edges.length;
    const maxEdges = nodes * (nodes - 1);
    const density = maxEdges > 0 ? edges / maxEdges : 0;
    return { nodes, edges, density };
  }
}