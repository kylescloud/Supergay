/**
 * Multicall Utility
 * Handles batch contract calls using Multicall3 contract
 */

import { ethers, Contract } from 'ethers';
import type { PoolFetchRequest } from './types';

// Multicall3 ABI (minimal interface)
const MULTICALL3_ABI = [
  // Aggregates calls, allowing each call to return either bytes or revert
  'function aggregate((address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)',
  
  // Same as aggregate, but allows setting msg.value per call
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)',
  
  // Returns the blockhash of the latest block
  'function getBlockHash(uint256 blockNumber) view returns (bytes32)',
  
  // Returns the current block number
  'function getBlockNumber() view returns (uint256)',
  
  // Returns the current block's timestamp
  'function getCurrentBlockCoinbase() view returns (address)',
  
  // Returns the current block's difficulty
  'function getCurrentBlockDifficulty() view returns (uint256)',
  
  // Returns the current block's gas limit
  'function getCurrentBlockGasLimit() view returns (uint256)',
  
  // Returns the current block's timestamp
  'function getCurrentBlockTimestamp() view returns (uint256)',
  
  // Returns the ETH balance of the current address
  'function getEthBalance(address addr) view returns (uint256)',
  
  // Returns the last block number
  'function getLastBlockHash() view returns (bytes32)',
];

// Multicall3 contract address (deployed on most chains including Base)
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export class Multicall {
  private multicall: Contract;
  private provider: ethers.Provider;

  constructor(provider: ethers.Provider, multicallAddress?: string) {
    this.provider = provider;
    this.multicall = new Contract(
      multicallAddress || MULTICALL3_ADDRESS,
      MULTICALL3_ABI,
      provider
    );
  }

  /**
   * Execute multiple calls in a single transaction
   * @param calls Array of call requests
   * @returns Array of results
   */
  async aggregate(calls: PoolFetchRequest[]): Promise<Array<{ success: boolean; data: string; error?: string }>> {
    if (calls.length === 0) {
      return [];
    }

    // Split calls into batches of 1000 to avoid block gas limits
    const batchSize = 1000;
    const batches: PoolFetchRequest[][] = [];
    
    for (let i = 0; i < calls.length; i += batchSize) {
      batches.push(calls.slice(i, i + batchSize));
    }

    const results: Array<{ success: boolean; data: string; error?: string }> = [];
    
    for (const batch of batches) {
      try {
        const callData = batch.map(call => ({
          target: call.target,
          callData: call.callData
        }));

        const [, returnData] = await this.multicall.aggregate(callData);

        // Process results
        for (let i = 0; i < batch.length; i++) {
          results.push({
            success: true,
            data: returnData[i]
          });
        }
      } catch (error) {
        // If batch fails, try individual calls
        console.warn(`Batch of ${batch.length} calls failed, retrying individually...`);
        
        for (const call of batch) {
          try {
            const result = await this.provider.call({
              to: call.target,
              data: call.callData
            });
            
            results.push({
              success: true,
              data: result
            });
          } catch (err) {
            results.push({
              success: false,
              data: '0x',
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute calls with failure tolerance (aggregate3)
   * @param calls Array of call requests
   * @returns Array of results
   */
  async aggregate3(calls: PoolFetchRequest[]): Promise<Array<{ success: boolean; data: string; error?: string }>> {
    if (calls.length === 0) {
      return [];
    }

    const batchSize = 1000;
    const batches: PoolFetchRequest[][] = [];
    
    for (let i = 0; i < calls.length; i += batchSize) {
      batches.push(calls.slice(i, i + batchSize));
    }

    const results: Array<{ success: boolean; data: string; error?: string }> = [];
    
    for (const batch of batches) {
      try {
        const callData = batch.map(call => ({
          target: call.target,
          allowFailure: true,
          callData: call.callData
        }));

        const [, returnData] = await this.multicall.aggregate3(callData);

        // Process results - aggregate3 returns bytes which may include success flag
        for (let i = 0; i < batch.length; i++) {
          const data = returnData[i];
          
          // Check if call failed (empty result)
          if (data === '0x' || data.length < 2) {
            results.push({
              success: false,
              data: '0x',
              error: 'Empty response'
            });
          } else {
            results.push({
              success: true,
              data: data
            });
          }
        }
      } catch (error) {
        // Fallback to individual calls
        for (const call of batch) {
          try {
            const result = await this.provider.call({
              to: call.target,
              data: call.callData
            });
            
            results.push({
              success: true,
              data: result
            });
          } catch (err) {
            results.push({
              success: false,
              data: '0x',
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return Number(await this.multicall.getBlockNumber());
  }

  /**
   * Get ETH balance for an address
   */
  async getEthBalance(address: string): Promise<bigint> {
    return await this.multicall.getEthBalance(address);
  }

  /**
   * Decode result using ethers.js
   * @param result The raw result data
   * @param types Array of types to decode
   */
  static decodeResult(result: string, types: string[]): any {
    if (result === '0x' || result.length < 2) {
      throw new Error('Empty result to decode');
    }

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.decode(types, result);
  }
}