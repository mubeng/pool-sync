#!/usr/bin/env node
/**
 * Main Proxy Synchronization Script
 * 
 * Synchronizes live.txt with database
 */

import { config, Logger } from '../lib/config.js';
import { ProxySyncEngine } from '../lib/sync-engine.js';
import { existsSync } from 'fs';

async function main() {
  const logger = new Logger(config.logLevel);
  
  try {
    logger.info('=== Proxy Pool Synchronization Started ===');
    logger.info(`Live file: ${config.liveFilePath}`);
    logger.info(`Database: ${config.sqliteCloudUrl ? 'Connected' : 'Not configured'}`);
    
    const syncEngine = new ProxySyncEngine(config, logger);
    const configErrors = syncEngine.validateConfig();
    
    if (configErrors.length > 0) {
      logger.error('Configuration errors:');
      configErrors.forEach(error => logger.error(`  - ${error}`));
      process.exit(1);
    }
    
    if (!existsSync(config.liveFilePath)) {
      logger.error(`Live file not found: ${config.liveFilePath}`);
      process.exit(1);
    }
    
    const success = await syncEngine.sync();
    
    const stats = syncEngine.getStats();
    logger.info('=== Synchronization Stats ===');
    logger.info(`Total syncs: ${stats.totalSyncs}`);
    logger.info(`Successful: ${stats.successfulSyncs}`);
    logger.info(`Failed: ${stats.failedSyncs}`);
    logger.info(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
    logger.info(`Last record count: ${stats.lastRecordCount}`);
    logger.info(`Last sync: ${stats.lastSyncTime}`);
    
    if (stats.lastError) {
      logger.error(`Last error: ${stats.lastError}`);
    }
    
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::set-output name=success::${success}`);
      console.log(`::set-output name=record_count::${stats.lastRecordCount}`);
      console.log(`::set-output name=sync_time::${stats.lastSyncTime}`);
    }
    
    if (success) {
      logger.info('=== Synchronization Completed Successfully ===');
      process.exit(0);
    } else {
      logger.error('=== Synchronization Failed ===');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();
