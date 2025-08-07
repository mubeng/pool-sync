import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Load environment variables from .env file
 */
function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            process.env[key.trim()] = cleanValue;
          }
        }
      }
      process.stderr.write('✅ Loaded .env file\n');
    } catch (error) {
      console.warn('⚠️ Failed to load .env file:', error.message);
    }
  } else {
    process.stderr.write('ℹ️ No .env file found, using environment variables\n');
  }
}

// Load environment variables
loadEnv();

/**
 * Configuration for proxy synchronization
 */
export const config = {
  // SQLite Cloud connection string from environment
  sqliteCloudUrl: process.env.SQLITECLOUD_URL || '',
  
  // Path to live.txt file
  liveFilePath: process.env.LIVE_FILE_PATH || './live.txt',
  
  // Retry settings
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'), // milliseconds
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'INFO',
  
  // Batch size for large datasets
  batchSize: parseInt(process.env.BATCH_SIZE || '1000'),
};

/**
 * Logger utility
 */
export class Logger {
  constructor(level = 'INFO') {
    this.level = level;
    this.levels = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
  }
  
  log(level, message, ...args) {
      if (this.levels[level] >= this.levels[this.level]) {
          const now = new Date();
          const timestamp = now.toTimeString().split(' ')[0]; // HH:MM:SS format
          const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ') : '';
          process.stderr.write(`[${timestamp}] ${level}: ${message}${formattedArgs}\n`);
      }
  }
  
  debug(message, ...args) { this.log('DEBUG', message, ...args); }
  info(message, ...args) { this.log('INFO', message, ...args); }
  warn(message, ...args) { this.log('WARNING', message, ...args); }
  error(message, ...args) { this.log('ERROR', message, ...args); }
}

/**
 * Proxy record structure
 */
export class ProxyRecord {
  constructor(data) {
    this.proxy = data.proxy;
    this.protocol = data.protocol;
    this.host = data.host;
    this.port = parseInt(data.port);
    this.ip = data.ip;
    this.country = data.country;
    this.city = data.city;
    this.org = data.org;
    this.region = data.region;
    this.timezone = data.timezone;
    this.loc = data.loc;
    this.hostname = data.hostname;
  }
  
  /**
   * Convert to array for database insertion
   */
  toArray() {
    return [
      this.proxy, this.protocol, this.host, this.port, this.ip,
      this.country, this.city, this.org, this.region, this.timezone,
      this.loc, this.hostname
    ];
  }
  
  /**
   * Validate record data
   */
  isValid() {
    return this.proxy && this.protocol && this.host && 
           !isNaN(this.port) && this.ip;
  }
}
