import { Database } from '@sqlitecloud/drivers';
import { Logger } from './config.js';

/**
 * SQLite Cloud database client
 */
export class SQLiteCloudClient {
  constructor(connectionString, logger = new Logger()) {
    this.connectionString = connectionString;
    this.logger = logger;
    this.db = null;
  }
  
  /**
   * Connect to SQLite Cloud database
   */
  async connect() {
    try {
      this.logger.debug('Connecting to SQLite Cloud...');
      this.logger.debug(`Connection string: ${this.connectionString.replace(/apikey=[^&]+/, 'apikey=***')}`);
      
      // Create database instance
      this.db = new Database(this.connectionString);
      
      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test connection with a simple query
      const result = await this.db.sql`SELECT 1 as test`;
      this.logger.debug(`Connection test result: ${JSON.stringify(result)}`);
      this.logger.info('Connected to SQLite Cloud successfully');
      return true;
      
    } catch (error) {
      this.logger.error(`Database connection failed: ${error.message}`);
      this.logger.error(`Error code: ${error.errorCode || 'Unknown'}`);
      
      // Check if it's a connection string issue
      if (error.message.includes('Connection error') || error.errorCode === 'ERR_CONNECTION_ERROR') {
        this.logger.error('Possible issues:');
        this.logger.error('1. Check your SQLite Cloud connection string');
        this.logger.error('2. Verify your API key is correct');
        this.logger.error('3. Ensure your cluster is running');
        this.logger.error('4. Check network connectivity');
      }
      
      // Cleanup on failed connection
      if (this.db) {
        try {
          await this.db.close();
        } catch (closeError) {
          this.logger.debug(`Error closing failed connection: ${closeError.message}`);
        }
        this.db = null;
      }
      
      return false;
    }
  }
  
  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.db) {
      try {
        await this.db.close();
        this.db = null;
        this.logger.debug('Disconnected from database');
      } catch (error) {
        this.logger.warn(`Error during disconnect: ${error.message}`);
      }
    }
  }
  
  /**
   * Execute query with retry logic
   */
  async executeWithRetry(queryFn, maxRetries = 3, delay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await queryFn();
      } catch (error) {
        this.logger.warn(`Query attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === maxRetries) {
          this.logger.error(`Query failed after ${maxRetries} attempts`);
          throw error;
        }
        
        // Exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        this.logger.debug(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  /**
   * Swap-based sync to avoid downtime during proxy updates
   * Uses a temporary table to stage new data, then atomically swaps tables
   */
  async syncProxiesWithSwap(records, batchSize = 1000) {
    if (!records || records.length === 0) {
      this.logger.info('No records to sync');
      return 0;
    }

    // Check for duplicates in the input data first
    const uniqueProxies = new Set();
    const duplicatesFound = [];
    const cleanRecords = [];
    
    for (const record of records) {
      if (uniqueProxies.has(record.proxy)) {
        duplicatesFound.push(record.proxy);
      } else {
        uniqueProxies.add(record.proxy);
        cleanRecords.push(record);
      }
    }

    if (duplicatesFound.length > 0) {
      this.logger.warn(`Found ${duplicatesFound.length} duplicate proxies in input data, using first occurrence only`);
      this.logger.debug(`Duplicate proxies: ${duplicatesFound.slice(0, 5).join(', ')}${duplicatesFound.length > 5 ? '...' : ''}`);
    }

    this.logger.info(`Syncing ${cleanRecords.length} unique proxy records using swap strategy...`);
    
    return this.executeWithRetry(async () => {
      const tempTableName = 'pool_temp_' + Date.now();
      
      try {
        // Create temporary table with same structure as pool
        this.logger.debug(`Creating temporary table: ${tempTableName}`);
        const createTableSQL = `
          CREATE TABLE ${tempTableName} (
            proxy TEXT PRIMARY KEY,
            protocol TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            ip TEXT NOT NULL,
            country TEXT,
            city TEXT,
            org TEXT,
            region TEXT,
            timezone TEXT,
            loc TEXT,
            hostname TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;
        await this.db.sql(createTableSQL);

        // Insert data into temporary table in batches
        for (let i = 0; i < cleanRecords.length; i += batchSize) {
          const batch = cleanRecords.slice(i, i + batchSize);
          this.logger.debug(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cleanRecords.length/batchSize)} into temp table (${batch.length} records)`);
          
          await this.db.sql`BEGIN TRANSACTION`;
          
          try {
            for (const record of batch) {
              const insertSQL = `
                INSERT INTO ${tempTableName} (
                  proxy, protocol, host, port, ip, country, city, org, region, timezone, loc, hostname
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;
              await this.db.sql(insertSQL, 
                record.proxy, record.protocol, record.host, record.port,
                record.ip, record.country, record.city, record.org,
                record.region, record.timezone, record.loc, record.hostname
              );
            }
            
            await this.db.sql`COMMIT`;
            
          } catch (error) {
            await this.db.sql`ROLLBACK`;
            throw error;
          }
        }

        // Verify temp table has correct count
        const tempCountSQL = `SELECT COUNT(*) as count FROM ${tempTableName}`;
        const tempCountResult = await this.db.sql(tempCountSQL);
        const tempCount = tempCountResult[0]?.count || 0;
        
        if (tempCount !== cleanRecords.length) {
          throw new Error(`Temp table count mismatch: expected ${cleanRecords.length}, got ${tempCount}`);
        }

        this.logger.info(`Successfully staged ${tempCount} records in temporary table`);

        // Atomic swap: rename tables to switch data instantly
        this.logger.info('Performing atomic table swap...');
        await this.db.sql`BEGIN TRANSACTION`;
        
        try {
          // Rename current pool table to backup
          const backupTableName = 'pool_backup_' + Date.now();
          await this.db.sql(`ALTER TABLE pool RENAME TO ${backupTableName}`);
          
          // Rename temp table to pool (this is the atomic switch)
          await this.db.sql(`ALTER TABLE ${tempTableName} RENAME TO pool`);
          
          await this.db.sql`COMMIT`;
          
          this.logger.info('Table swap completed successfully');
          
          // Recreate indexes for optimal performance
          this.logger.debug('Recreating indexes...');
          try {
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_protocol ON pool(protocol)`);
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_country ON pool(country)`);
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_city ON pool(city)`);
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_host ON pool(host)`);
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_region ON pool(region)`);
            await this.db.sql(`CREATE INDEX IF NOT EXISTS idx_pool_hostname ON pool(hostname)`);
            this.logger.debug('Indexes recreated successfully');
          } catch (indexError) {
            this.logger.warn(`Failed to recreate some indexes: ${indexError.message}`);
          }
          
          // Recreate trigger for updated_at timestamp
          try {
            await this.db.sql(`
              CREATE TRIGGER IF NOT EXISTS update_pool_timestamp 
                  AFTER UPDATE ON pool
                  FOR EACH ROW
              BEGIN
                  UPDATE pool SET updated_at = CURRENT_TIMESTAMP WHERE proxy = NEW.proxy;
              END
            `);
            this.logger.debug('Trigger recreated successfully');
          } catch (triggerError) {
            this.logger.warn(`Failed to recreate trigger: ${triggerError.message}`);
          }
          
          // Clean up old table in background (non-critical)
          try {
            await this.db.sql(`DROP TABLE ${backupTableName}`);
            this.logger.debug(`Cleaned up backup table: ${backupTableName}`);
          } catch (cleanupError) {
            this.logger.warn(`Failed to cleanup backup table: ${cleanupError.message}`);
          }
          
          return cleanRecords.length;
          
        } catch (error) {
          await this.db.sql`ROLLBACK`;
          throw error;
        }
        
      } catch (error) {
        // Cleanup temp table if it exists
        try {
          await this.db.sql(`DROP TABLE IF EXISTS ${tempTableName}`);
          this.logger.debug(`Cleaned up failed temp table: ${tempTableName}`);
        } catch (cleanupError) {
          this.logger.warn(`Failed to cleanup temp table: ${cleanupError.message}`);
        }
        
        this.logger.error(`Swap sync failed: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Clear all records from pool table
   */
  async clearPoolTable() {
    this.logger.info('Clearing existing proxy data...');
    
    return this.executeWithRetry(async () => {
      // Use a transaction to ensure the clear operation is atomic
      await this.db.sql`BEGIN TRANSACTION`;
      
      try {
        const result = await this.db.sql`DELETE FROM pool`;
        this.logger.debug(`Cleared pool table, changes: ${result.changes || 'unknown'}`);
        
        // Verify the table is actually empty
        const countResult = await this.db.sql`SELECT COUNT(*) as count FROM pool`;
        const remainingCount = countResult[0]?.count || 0;
        
        if (remainingCount > 0) {
          this.logger.warn(`Warning: ${remainingCount} records still remain after clear operation`);
        } else {
          this.logger.debug('Pool table successfully cleared');
        }
        
        await this.db.sql`COMMIT`;
        return true;
        
      } catch (error) {
        await this.db.sql`ROLLBACK`;
        throw error;
      }
    });
  }
  
  /**
   * Get current proxy count
   */
  async getProxyCount() {
    try {
      const result = await this.db.sql`SELECT COUNT(*) as count FROM pool`;
      return result[0].count;
    } catch (error) {
      this.logger.error(`Failed to get proxy count: ${error.message}`);
      return -1;
    }
  }
  
  /**
   * Bulk insert proxy records using transactions
   */
  async bulkInsertProxies(records, batchSize = 1000) {
    if (!records || records.length === 0) {
      this.logger.info('No records to insert');
      return 0;
    }
    
    // Check for duplicates in the input data first
    const uniqueProxies = new Set();
    const duplicatesFound = [];
    const cleanRecords = [];
    
    for (const record of records) {
      if (uniqueProxies.has(record.proxy)) {
        duplicatesFound.push(record.proxy);
      } else {
        uniqueProxies.add(record.proxy);
        cleanRecords.push(record);
      }
    }
    
    if (duplicatesFound.length > 0) {
      this.logger.warn(`Found ${duplicatesFound.length} duplicate proxies in input data, using first occurrence only`);
      this.logger.debug(`Duplicate proxies: ${duplicatesFound.slice(0, 5).join(', ')}${duplicatesFound.length > 5 ? '...' : ''}`);
    }
    
    this.logger.info(`Inserting ${cleanRecords.length} unique proxy records in batches of ${batchSize}...`);
    
    return this.executeWithRetry(async () => {
      // Process in batches for better performance
      for (let i = 0; i < cleanRecords.length; i += batchSize) {
        const batch = cleanRecords.slice(i, i + batchSize);
        this.logger.debug(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cleanRecords.length/batchSize)} (${batch.length} records)`);
        
        // Use transaction for each batch
        await this.db.sql`BEGIN TRANSACTION`;
        
        try {
          for (const record of batch) {
            await this.db.sql`
              INSERT INTO pool (
                proxy, protocol, host, port, ip, country, city, 
                org, region, timezone, loc, hostname
              ) VALUES (
                ${record.proxy}, ${record.protocol}, ${record.host}, ${record.port},
                ${record.ip}, ${record.country}, ${record.city}, ${record.org},
                ${record.region}, ${record.timezone}, ${record.loc}, ${record.hostname}
              )
            `;
          }
          
          await this.db.sql`COMMIT`;
          this.logger.debug(`Batch inserted successfully: ${batch.length} records`);
          
        } catch (error) {
          await this.db.sql`ROLLBACK`;
          this.logger.error(`Batch insert failed: ${error.message}`);
          
          // If it's a constraint error, provide more details
          if (error.message.includes('UNIQUE constraint failed')) {
            this.logger.error('This suggests there are still records in the database that were not cleared properly');
            // Get current count to help debug
            try {
              const countResult = await this.db.sql`SELECT COUNT(*) as count FROM pool`;
              const currentCount = countResult[0]?.count || 0;
              this.logger.error(`Current records in database: ${currentCount}`);
            } catch (countError) {
              this.logger.debug(`Could not get current count: ${countError.message}`);
            }
          }
          
          throw error;
        }
      }
      
      this.logger.info(`Successfully inserted ${cleanRecords.length} proxy records`);
      return cleanRecords.length;
    });
  }
  
  /**
   * Execute a raw SQL query
   */
  async query(sql, params = []) {
    try {
      return await this.db.sql(sql, ...params);
    } catch (error) {
      this.logger.error(`Query failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Health check - test database connectivity and get basic stats
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity first
      await this.db.sql`SELECT 1 as test`;
      
      let proxyCount = 0;
      let tableColumns = 0;
      
      try {
        // Try to get proxy count
        const countResult = await this.db.sql`SELECT COUNT(*) as count FROM pool`;
        proxyCount = countResult[0]?.count || 0;
      } catch (error) {
        this.logger.warn(`Could not get proxy count: ${error.message}`);
      }
      
      try {
        // Try to get table info
        const tableInfo = await this.db.sql`PRAGMA table_info(pool)`;
        tableColumns = Array.isArray(tableInfo) ? tableInfo.length : 0;
      } catch (error) {
        this.logger.warn(`Could not get table info: ${error.message}`);
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        proxyCount,
        responseTime,
        tableColumns,
        message: `Database accessible with ${proxyCount} proxies`
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`Health check failed: ${error.message}`);
      
      return {
        status: 'error',
        message: `Health check failed: ${error.message}`,
        responseTime,
        errorCode: error.errorCode || 'Unknown'
      };
    }
  }
}
