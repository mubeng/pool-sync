import { readFileSync, existsSync } from 'fs';
import { ProxyRecord, Logger } from './config.js';

/**
 * Parser for live.txt file
 */
export class ProxyParser {
  constructor(logger = new Logger()) {
    this.logger = logger;
  }
  
  /**
   * Parse a single line from live.txt
   * Format: proxy|protocol|host|port|ip|country|city|org|region|timezone|loc|hostname
   * fasttemplate syntax: {{proxy}}|{{protocol}}|{{host}}|{{port}}|{{ip}}|{{country}}|{{city}}|{{org}}|{{region}}|{{timezone}}|{{loc}}|{{hostname}}
   */
  parseLine(line, lineNumber = 0) {
    try {
      const parts = line.trim().split('|');
      
      if (parts.length !== 12) {
        this.logger.warn(`Line ${lineNumber}: Expected 12 fields, got ${parts.length}`);
        return null;
      }
      
      const record = new ProxyRecord({
        proxy: parts[0],
        protocol: parts[1],
        host: parts[2],
        port: parts[3],
        ip: parts[4],
        country: parts[5],
        city: parts[6],
        org: parts[7],
        region: parts[8],
        timezone: parts[9],
        loc: parts[10],
        hostname: parts[11]
      });
      
      if (!record.isValid()) {
        this.logger.warn(`Line ${lineNumber}: Invalid record data`);
        return null;
      }
      
      return record;
      
    } catch (error) {
      this.logger.warn(`Line ${lineNumber}: Parse error - ${error.message}`);
      return null;
    }
  }
  
  /**
   * Parse entire live.txt file
   */
  parseFile(filePath) {
    this.logger.info(`Parsing file: ${filePath}`);
    
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const records = [];
      let validCount = 0;
      let invalidCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const record = this.parseLine(lines[i], i + 1);
        if (record) {
          records.push(record);
          validCount++;
        } else {
          invalidCount++;
        }
      }
      
      this.logger.info(`Parsed ${validCount} valid records, ${invalidCount} invalid lines`);
      return records;
      
    } catch (error) {
      this.logger.error(`Failed to read file ${filePath}: ${error.message}`);
      throw error;
    }
  }
}
