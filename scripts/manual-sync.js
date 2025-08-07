#!/usr/bin/env node
/**
 * Manual Proxy Sync - One-time synchronization for testing
 * 
 * Usage:
 *   node scripts/manual-sync.js [live_file_path]
 */

import { config, Logger } from '../lib/config.js';
import { ProxySyncEngine } from '../lib/sync-engine.js';
import { existsSync } from 'fs';

async function main() {
  // Get file path from command line or use default
  const liveFilePath = process.argv[2] || config.liveFilePath;
  
  // Override config with command line argument
  const testConfig = { ...config, liveFilePath };
  
  const logger = new Logger(testConfig.logLevel);
  
  try {
    logger.info('=== Manual Proxy Sync Started ===');
    logger.info(`Live file: ${liveFilePath}`);
    logger.info(`Database: ${testConfig.sqliteCloudUrl ? 'Configured' : 'Not configured'}`);
    
    // Validate configuration
    if (!testConfig.sqliteCloudUrl) {
      logger.error('SQLITECLOUD_URL environment variable is required');
      logger.info('Set it in .env file or export SQLITECLOUD_URL="your-connection-string"');
      process.exit(1);
    }
    
    if (!existsSync(liveFilePath)) {
      logger.error(`Live file not found: ${liveFilePath}`);
      process.exit(1);
    }
    
    // Run synchronization
    const syncEngine = new ProxySyncEngine(testConfig, logger);
    const success = await syncEngine.sync();
    
    // Print stats
    const stats = syncEngine.getStats();
    logger.info('=== Manual Sync Stats ===');
    logger.info(JSON.stringify(stats, null, 2));
    
    if (success) {
      logger.info('✅ Manual sync completed successfully!');
      process.exit(0);
    } else {
      logger.error('❌ Manual sync failed!');
      process.exit(1);
    }
    
  } catch (error) {
    logger.error(`Manual sync error: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

main();
