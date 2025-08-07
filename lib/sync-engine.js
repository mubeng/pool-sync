import { ProxyParser } from './parser.js';
import { SQLiteCloudClient } from './database.js';
import { Logger } from './config.js';

/**
 * Main synchronization engine
 */
export class ProxySyncEngine {
  constructor(config, logger = new Logger()) {
    this.config = config;
    this.logger = logger;
    this.parser = new ProxyParser(logger);
    this.dbClient = new SQLiteCloudClient(config.sqliteCloudUrl, logger);
    this.stats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastRecordCount: 0,
      lastSyncTime: null,
      lastError: null
    };
  }
  
  /**
   * Perform complete synchronization
   */
  async sync() {
    const startTime = Date.now();
    this.logger.info('Starting proxy synchronization...');
    
    try {
      // Step 1: Parse live.txt file
      this.logger.info(`Parsing live file: ${this.config.liveFilePath}`);
      const records = this.parser.parseFile(this.config.liveFilePath);
      
      if (records.length === 0) {
        this.logger.warn('No valid records found in live.txt');
        this.stats.failedSyncs++;
        return false;
      }
      
      this.logger.info(`Parsed ${records.length} proxy records`);
      
      // Step 2: Connect to database
      if (!(await this.dbClient.connect())) {
        this.logger.error('Failed to connect to database');
        this.stats.failedSyncs++;
        return false;
      }
      
      try {
        // Step 3: Sync data using atomic swap strategy (zero downtime)
        const actualRecordCount = await this.dbClient.syncProxiesWithSwap(records, this.config.batchSize);
        
        // Step 4: Verify results
        const dbCount = await this.dbClient.getProxyCount();
        if (dbCount !== actualRecordCount) {
          this.logger.warn(`Record count mismatch: expected ${actualRecordCount}, got ${dbCount}`);
        }
        
        // Update stats
        this.stats.totalSyncs++;
        this.stats.successfulSyncs++;
        this.stats.lastRecordCount = actualRecordCount;
        this.stats.lastSyncTime = new Date().toISOString();
        this.stats.lastError = null;
        
        const duration = Date.now() - startTime;
        this.logger.info(`Synchronization completed successfully in ${duration}ms`);
        this.logger.info(`Original records: ${records.length}, Unique records: ${actualRecordCount}, Database count: ${dbCount}`);
        
        return true;
        
      } finally {
        await this.dbClient.disconnect();
      }
      
    } catch (error) {
      this.logger.error(`Synchronization failed: ${error.message}`);
      this.stats.totalSyncs++;
      this.stats.failedSyncs++;
      this.stats.lastError = error.message;
      return false;
    }
  }
  
  /**
   * Get synchronization statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalSyncs > 0 
        ? this.stats.successfulSyncs / this.stats.totalSyncs 
        : 0
    };
  }
  
  /**
   * Validate configuration
   */
  validateConfig() {
    const errors = [];
    
    if (!this.config.sqliteCloudUrl) {
      errors.push('SQLITECLOUD_URL is required');
    }
    
    if (!this.config.liveFilePath) {
      errors.push('LIVE_FILE_PATH is required');
    }
    
    return errors;
  }
}
