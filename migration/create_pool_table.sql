-- Create pool table for proxy information
CREATE TABLE IF NOT EXISTS pool (
    proxy TEXT PRIMARY KEY,          -- Full proxy URL (e.g., http://192.0.2.10:8080)
    protocol TEXT NOT NULL,          -- Protocol type (http, socks4, socks5)
    host TEXT NOT NULL,              -- Hostname/IP address
    port INTEGER NOT NULL,           -- Port number
    ip TEXT NOT NULL,                -- IP address
    country TEXT,                    -- Country code (e.g., ID, IN, DE, US)
    city TEXT,                       -- City name
    org TEXT,                        -- Organization/ISP information
    region TEXT,                     -- State/Province/Region
    timezone TEXT,                   -- Timezone (e.g., Asia/Jakarta)
    loc TEXT,                        -- Location coordinates (latitude,longitude)
    hostname TEXT,                   -- Hostname/Domain name (can be empty)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pool_protocol ON pool(protocol);
CREATE INDEX IF NOT EXISTS idx_pool_country ON pool(country);
CREATE INDEX IF NOT EXISTS idx_pool_city ON pool(city);
CREATE INDEX IF NOT EXISTS idx_pool_host ON pool(host);
CREATE INDEX IF NOT EXISTS idx_pool_region ON pool(region);
CREATE INDEX IF NOT EXISTS idx_pool_hostname ON pool(hostname);

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_pool_timestamp 
    AFTER UPDATE ON pool
    FOR EACH ROW
BEGIN
    UPDATE pool SET updated_at = CURRENT_TIMESTAMP WHERE proxy = NEW.proxy;
END;
