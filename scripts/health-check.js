#!/usr/bin/env node
/**
 * Health Check Script for Proxy Sync
 * 
 * Checks:
 * 1. Database connectivity
 * 2. Live file existence and age
 * 3. Configuration validation
 */

import { config, Logger } from '../lib/config.js';
import { SQLiteCloudClient } from '../lib/database.js';
import { existsSync, statSync } from 'fs';

class HealthChecker {
  constructor(logger) {
    this.logger = logger;
  }
  
  /**
   * Check database connectivity and health
   */
  async checkDatabase() {
    const result = { status: 'unknown', message: '', responseTime: 0 };
    
    if (!config.sqliteCloudUrl) {
      return {
        status: 'error',
        message: 'SQLITECLOUD_URL not configured',
        responseTime: 0
      };
    }
    
    try {
      const client = new SQLiteCloudClient(config.sqliteCloudUrl, this.logger);
      
      if (await client.connect()) {
        const healthResult = await client.healthCheck();
        await client.disconnect();
        return healthResult;
      } else {
        return {
          status: 'unhealthy',
          message: 'Failed to connect to database',
          responseTime: 0
        };
      }
      
    } catch (error) {
      return {
        status: 'error',
        message: `Database check failed: ${error.message}`,
        responseTime: 0
      };
    }
  }
  
  /**
   * Check live file status
   */
  checkLiveFile() {
    try {
      if (!existsSync(config.liveFilePath)) {
        return {
          status: 'error',
          message: `Live file not found: ${config.liveFilePath}`
        };
      }
      
      const stats = statSync(config.liveFilePath);
      
      return {
        status: 'healthy',
        message: 'Live file exists and is readable',
        fileSizeBytes: stats.size,
        lastModified: stats.mtime.toISOString()
      };
      
    } catch (error) {
      return {
        status: 'error',
        message: `File check failed: ${error.message}`
      };
    }
  }
  
  /**
   * Check configuration
   */
  checkConfiguration() {
    const issues = [];
    
    if (!config.sqliteCloudUrl) {
      issues.push('SQLITECLOUD_URL not set');
    }
    
    if (!config.liveFilePath) {
      issues.push('LIVE_FILE_PATH not set');
    }
    
    if (config.maxRetries < 1) {
      issues.push('MAX_RETRIES should be >= 1');
    }
    
    if (config.batchSize < 1) {
      issues.push('BATCH_SIZE should be >= 1');
    }
    
    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      message: issues.length > 0 
        ? `Configuration issues: ${issues.join(', ')}`
        : 'Configuration looks good',
      issues
    };
  }
}

async function main() {
  const logger = new Logger(config.logLevel);
  const healthChecker = new HealthChecker(logger);
  
  // Determine output format
  const jsonOutput = process.argv.includes('--json');
  
  try {
    // Run all health checks
    const checks = {
      timestamp: new Date().toISOString(),
      database: await healthChecker.checkDatabase(),
      liveFile: healthChecker.checkLiveFile(),
      configuration: healthChecker.checkConfiguration()
    };
    
    // Determine overall status
    const statuses = Object.values(checks)
      .filter(check => typeof check === 'object' && check.status)
      .map(check => check.status);
    
    let overallStatus = 'healthy';
    if (statuses.includes('error')) {
      overallStatus = 'error';
    } else if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('warning')) {
      overallStatus = 'warning';
    }
    
    checks.overallStatus = overallStatus;
    
    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify(checks, null, 2));
    } else {
      const statusEmojis = {
        healthy: '✅',
        warning: '⚠️',
        unhealthy: '❌',
        error: '💥'
      };
      
      console.log(`Proxy Sync Health Check - ${overallStatus.toUpperCase()}`);
      console.log(`Timestamp: ${checks.timestamp}`);
      console.log();
      
      // Database check
      const dbEmoji = statusEmojis[checks.database.status] || '❓';
      console.log(`${dbEmoji} Database: ${checks.database.status.toUpperCase()}`);
      console.log(`   ${checks.database.message}`);
      if (checks.database.responseTime > 0) {
        console.log(`   Response time: ${checks.database.responseTime}ms`);
      }
      console.log();
      
      // Live file check
      const fileEmoji = statusEmojis[checks.liveFile.status] || '❓';
      console.log(`${fileEmoji} Live File: ${checks.liveFile.status.toUpperCase()}`);
      console.log(`   ${checks.liveFile.message}`);
      if (checks.liveFile.fileSizeBytes) {
        console.log(`   Size: ${checks.liveFile.fileSizeBytes} bytes`);
      }
      console.log();
      
      // Configuration check
      const configEmoji = statusEmojis[checks.configuration.status] || '❓';
      console.log(`${configEmoji} Configuration: ${checks.configuration.status.toUpperCase()}`);
      console.log(`   ${checks.configuration.message}`);
      console.log();
    }
    
    // Exit with appropriate code
    const exitCodes = { healthy: 0, warning: 1, unhealthy: 2, error: 3 };
    const exitCode = exitCodes[overallStatus] !== undefined ? exitCodes[overallStatus] : 3;
    
    // Force exit after a brief delay to allow any pending operations
    setTimeout(() => {
      process.exit(exitCode);
    }, 100);
    
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
    
    if (jsonOutput) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        overallStatus: 'error',
        error: error.message
      }, null, 2));
    }
    
    setTimeout(() => {
      process.exit(3);
    }, 100);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(3);
});

main();
