#!/usr/bin/env bun
/**
 * Simple connection test script to debug SQLite Cloud issues
 */

import { Database } from '@sqlitecloud/drivers';

async function testConnection() {
  const connectionString = process.env.SQLITECLOUD_URL;
  
  if (!connectionString) {
    console.error('❌ SQLITECLOUD_URL not set');
    process.exit(1);
  }
  
  console.log('🔍 Testing SQLite Cloud connection...');
  console.log(`📡 Connection: ${connectionString.replace(/apikey=[^&]+/, 'apikey=***')}`);
  
  try {
    console.log('⏳ Creating database instance...');
    const db = new Database(connectionString);
    
    console.log('⏳ Waiting for connection to establish...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('⏳ Testing with simple query...');
    const result = await db.sql`SELECT 1 as test, datetime('now') as timestamp`;
    
    console.log('✅ Connection successful!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    console.log('⏳ Closing connection...');
    await db.close();
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error('📋 Message:', error.message);
    console.error('🔢 Error Code:', error.errorCode || 'Unknown');
    console.error('📚 Stack:', error.stack);
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Verify your SQLite Cloud cluster is running');
    console.log('2. Check your API key is correct and has permissions');
    console.log('3. Ensure the database name exists');
    console.log('4. Try accessing the cluster from SQLite Cloud dashboard');
    console.log('5. Check if your network allows connections to SQLite Cloud');
    
    process.exit(1);
  }
}

testConnection();
