# mubeng Proxy Pool Synchronization

Automatically synchronize mubeng live proxy data.

## Overview

This tool keeps mubeng pool database in sync every 5 minutes.

## Data Format

Your `live.txt` should contain pipe-separated values:

```
proxy|protocol|host|port|ip|country|city|org|region|timezone|loc|hostname
```

Example:
```
http://192.0.2.10:8080|http|192.0.2.10|8080|192.0.2.10|US|New York|AS12345 Example ISP Inc|New York|America/New_York|40.7128,-74.0060|
socks4://198.51.100.5:1080|socks4|198.51.100.5|1080|198.51.100.5|GB|London|AS67890 Demo Provider Ltd|England|Europe/London|51.5074,-0.1278|proxy.example.com
```

## Scripts

### Available Commands

```bash
# Run main synchronization
npm run sync

# Manual sync for testing
npm run manual [file_path]

# Health check
npm run health [--json]

# Test connection
npm run test

# Install dependencies
npm install
```

### Manual Testing

```bash
# Test with specific file
npm run manual ./test-proxies.txt

# Test with default live.txt
npm run manual

# Check health in JSON format
npm run health -- --json

# Test connection only
npm run test
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLITECLOUD_URL` | - | SQLite Cloud connection string (required) |
| `LIVE_FILE_PATH` | `./live.txt` | Path to live proxy file |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `MAX_RETRIES` | `3` | Retry attempts for failed operations |
| `RETRY_DELAY` | `5000` | Delay between retries (milliseconds) |
| `BATCH_SIZE` | `1000` | Batch size for bulk operations |

### GitHub Actions Secrets

Set these in your repository secrets:

- `SQLITECLOUD_URL`: Your SQLite Cloud connection string

## Monitoring

### Health Checks

```bash
# Simple health check
npm run health

# JSON output for automation
npm run health -- --json
```

Health check validates:

- Database connectivity and response time
- Live file existence and readability
- Configuration correctness
- Proxy count in database

### Performance Tuning

For large proxy lists (>10k proxies):

1. **Increase Batch Size**: Set `BATCH_SIZE=5000` for faster bulk inserts
2. **Adjust Timeouts**: Increase `RETRY_DELAY` for slower connections
4. **Split Processing**: Consider splitting very large files

## License

This project is provided under the MIT license. See the [LICENSE](/LICENSE) file for details.