import dotenv from 'dotenv';
import { rpcManager, RPCUsageType } from '../utils/rpcManager';

dotenv.config();

export const config = {
  // Network Configuration
  chainId: parseInt(process.env.CHAIN_ID || '8453'),
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  
  // RPC Manager Integration
  getScanningProvider() {
    return rpcManager.getProvider(RPCUsageType.SCANNING);
  },
  
  getExecutionProvider() {
    return rpcManager.getProvider(RPCUsageType.EXECUTION);
  },
  
  getBestScanningProvider() {
    return rpcManager.getBestProvider(RPCUsageType.SCANNING);
  },
  
  // Private Key
  privateKey: process.env.PRIVATE_KEY || '',
  
  // Aave Configuration
  aavePool: process.env.AAVE_V3_POOL || '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  
  // Contract Addresses
  flashLoanReceiver: process.env.FLASH_LOAN_RECEIVER || '',
  
  // Bot Configuration
  minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.01'),
  maxGasPrice: parseInt(process.env.MAX_GAS_PRICE || '20000000000'),
  flashLoanPremium: parseFloat(process.env.FLASH_LOAN_PREMIUM || '0.0009'),
  slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.003'),
  
  // MEV Protection
  useFlashbots: process.env.USE_FLASHBOTS === 'true',
  flashbotsRpc: process.env.FLASHBOTS_RPC || 'https://rpc.flashbots.net',
  
  // Monitoring
  enableAlerts: process.env.ENABLE_ALERTS === 'true',
  webhookUrl: process.env.WEBHOOK_URL || '',
  
  // Validation
  validate(): boolean {
    if (!this.privateKey) {
      throw new Error('PRIVATE_KEY is required');
    }
    if (!this.rpcUrl) {
      throw new Error('BASE_RPC_URL is required');
    }
    return true;
  }
};

export default config;