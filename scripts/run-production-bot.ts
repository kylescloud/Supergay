#!/usr/bin/env npx ts-node

/**
 * Production Bot Runner
 * 
 * Run the production-ready arbitrage bot with all features enabled
 */

import { ethers } from 'ethers';
import { ProductionArbitrageBot, ProductionBotConfig } from '../src/productionBot';
import { TOKENS } from '../src/config/constants';

// Configuration
const config: ProductionBotConfig = {
  // Scanning Configuration
  scanInterval: 30000, // 30 seconds between scans
  refreshPoolsEvery: 10, // Refresh pools every 10 scans
  baseToken: 'WETH',
  loanAmount: BigInt('10000000000000000000'), // 10 WETH
  
  // Execution Configuration
  minProfitThreshold: BigInt('50000000000000000'), // 0.05 ETH minimum profit
  autoExecute: false, // Set to true to enable automatic execution
  maxGasPrice: BigInt('5000000000'), // 5 gwei max gas price
  
  // Logging Configuration
  logDir: './logs',
  
  // Telegram Configuration
  telegramConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  },
  telegramAlertConfig: {
    opportunities: true,
    execution: true,
    errors: true,
    minProfitThreshold: BigInt('10000000000000000'), // 0.01 ETH for alerts
  },
  
  // Performance Monitoring
  enablePerformanceMonitoring: true,
};

/**
 * Main function
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              PRODUCTION ARBITRAGE BOT - BASE BLOCKCHAIN                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Display configuration
  console.log('📋 Configuration:');
  console.log(`   Base Token:          ${config.baseToken}`);
  console.log(`   Loan Amount:         ${ethers.formatEther(config.loanAmount)} ${config.baseToken}`);
  console.log(`   Min Profit Threshold: ${ethers.formatEther(config.minProfitThreshold)} ETH`);
  console.log(`   Auto Execute:        ${config.autoExecute ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   Scan Interval:       ${config.scanInterval / 1000}s`);
  console.log(`   Refresh Pools Every: ${config.refreshPoolsEvery} scans`);
  console.log(`   Telegram Alerts:     ${config.telegramConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   Log Directory:       ${config.logDir}\n`);

  // Create bot instance
  const bot = new ProductionArbitrageBot(config);

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n\n⚠️  Received ${signal}. Shutting down gracefully...`);
    
    bot.printPerformanceMetrics();
    await bot.stop();
    
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start bot
  try {
    await bot.start();
  } catch (error) {
    console.error('Fatal error starting bot:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});