# Binance API Authentication

This document covers all authentication methods supported by Binance API.

## Table of Contents

1. [API Key Creation](#api-key-creation)
2. [HMAC Authentication](#hmac-authentication)
3. [RSA Authentication](#rsa-authentication)
4. [Ed25519 Authentication](#ed25519-authentication)
5. [Timing Security](#timing-security)
6. [Implementation Examples](#implementation-examples)

## API Key Creation

1. Navigate to [API Management](https://www.binance.com/en/support/faq/360002502072) in your Binance account
2. Create a new API key
3. Configure permissions:
   - **Enable Reading** - For account information
   - **Enable Spot & Margin Trading** - For trading operations
   - **Enable Withdrawals** - Only if needed (use with caution)
4. For RSA/Ed25519: Upload your public key during creation

### Security Best Practices

- Never share API keys or secret keys
- Use separate keys for different purposes (trading vs. monitoring)
- Enable IP whitelist restriction
- Disable unused permissions
- Monitor API key usage regularly

## HMAC Authentication

HMAC is the most common authentication method. It uses a secret key to sign requests.

### How It Works

1. Construct a query string from all parameters
2. Sign the query string using HMAC-SHA256 with your secret key
3. Add the signature as the `signature` parameter
4. Include your API key in the `X-MBX-APIKEY` header

### Signature Generation

```typescript
import crypto from 'crypto';

function generateHmacSignature(params: Record<string, any>, secretKey: string): string {
  // 1. Sort and encode parameters
  const queryString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // 2. Generate HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');

  return signature;
}

// Example usage
const params = {
  symbol: 'LTCBTC',
  side: 'BUY',
  type: 'LIMIT',
  timeInForce: 'GTC',
  quantity: 1,
  price: 0.1,
  recvWindow: 5000,
  timestamp: Date.now()
};

const signature = generateHmacSignature(params, secretKey);
params.signature = signature;
```

### Complete Request Example

```bash
# Example parameters
symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559

# Signature (using secret key: NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j)
signature=c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71

# Complete curl request
curl -H "X-MBX-APIKEY: vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A" \
     -X POST "https://api.binance.com/api/v3/order?symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559&signature=c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71"
```

### Non-ASCII Characters

When the symbol contains non-ASCII characters, you must percent-encode before signing:

```typescript
function percentEncode(str: string): string {
  return encodeURIComponent(str);
}

// Example: symbol with non-ASCII characters
const symbol = '１２３４５６';
const encodedSymbol = percentEncode(symbol); // %EF%BC%91%EF%BC%92%EF%BC%93%EF%BC%94%EF%BC%95%EF%BC%96
```

## RSA Authentication

RSA authentication provides enhanced security through asymmetric key pairs.

### Requirements

- Only PKCS#8 format keys are supported
- Upload the public key to Binance to receive an API key

### Key Generation

```bash
# Generate RSA private key (2048 bits minimum, 4096 recommended)
openssl genrsa -out private_key.pem 4096

# Convert to PKCS#8 format (required by Binance)
openssl pkcs8 -topk8 -inform PEM -outform PEM -in private_key.pem -out private_key_pkcs8.pem -nocrypt

# Extract public key
openssl rsa -in private_key_pkcs8.pem -pubout -out public_key.pem
```

### Signature Generation

```typescript
import crypto from 'crypto';
import fs from 'fs';

function generateRsaSignature(params: Record<string, any>, privateKeyPath: string): string {
  // 1. Construct query string
  const queryString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // 2. Read private key
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

  // 3. Sign with RSASSA-PKCS1-v1_5 + SHA-256
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(queryString)
    .sign(privateKey, 'base64');

  // 4. Percent-encode the base64 signature
  return encodeURIComponent(signature);
}
```

### Complete Request Example

```bash
# Sign the query string
echo -n 'symbol=BTCUSDT&side=SELL&type=LIMIT&timeInForce=GTC&quantity=1&price=0.2&timestamp=1668481559918&recvWindow=5000' | \
  openssl dgst -sha256 -sign ./test-prv-key.pem | \
  openssl enc -base64 -A | tr -d '\n'

# Result: HZ8HOjiJ1s/igS9JA+n7+7Ti/ihtkRF5BIWcPIEluJP6tlbFM/Bf44LfZka/iemtahZAZzcO9TnI5uaXh3++lrqtNonCwp6/245UFWkiW1elpgtVAmJPbogcAv6rSlokztAfWk296ZJXzRDYAtzGH0gq7CgSJKfH+XxaCmR0WcvlKjNQnp12/eKXJYO4tDap8UCBLuyxDnR7oJKLHQHJLP0r0EAVOOSIbrFang/1WOq+Jaq4Efc4XpnTgnwlBbWTmhWDR1pvS9iVEzcSYLHT/fNnMRxFc7u+j3qI//5yuGuu14KR0MuQKKCSpViieD+fIti46sxPTsjSemoUKp0oXA==

# Percent-encode the signature for URL
# Then include in the request
curl -H "X-MBX-APIKEY: CAvIjXy3F44yW6Pou5k8Dy1swsYDWJZLeoK2r8G4cFDnE9nosRppc2eKc1T8TRTQ" \
     -X POST 'https://api.binance.com/api/v3/order?symbol=BTCUSDT&side=SELL&type=LIMIT&timeInForce=GTC&quantity=1&price=0.2&timestamp=1668481559918&recvWindow=5000&signature=HZ8HOjiJ1s%2FigS9JA%2Bn7%2B7Ti%2FihtkRF5BIWcPIEluJP6tlbFM%2FBf44LfZka%2FiemtahZAZzcO9TnI5uaXh3%2B%2BlrqtNonCwp6%2F245UFWkiW1elpgtVAmJPbogcAv6rSlokztAfWk296ZJXzRDYAtzGH0gq7CgSJKfH%2BXxaCmR0WcvlKjNQnp12%2FeKXJYO4tDap8UCBLuyxDnR7oJKLHQHJLP0r0EAVOOSIbrFang%2F1WOq%2BJaq4Efc4XpnTgnwlBbWTmhWDR1pvS9iVEzcSYLHT%2FfNnMRxFc7u%2Bj3qI%2F%2F5yuGuu14KR0MuQKKCSpViieD%2BfIti46sxPTsjSemoUKp0oXA%3D%3D'
```

## Ed25519 Authentication

Ed25519 is the **recommended** authentication method for best performance and security.

### Key Generation

```bash
# Generate Ed25519 private key
openssl genpkey -algorithm ed25519 -out private_key.pem

# Extract public key
openssl pkey -in private_key.pem -pubout -out public_key.pem
```

### Signature Generation (TypeScript)

```typescript
import { createPrivateKey, createSign } from 'crypto';
import { readFileSync } from 'fs';

function generateEd25519Signature(params: Record<string, any>, privateKeyPath: string): string {
  const queryString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const privateKey = readFileSync(privateKeyPath, 'utf8');
  const keyObject = createPrivateKey(privateKey);

  const signature = createSign('sha256')
    .update(queryString)
    .sign(keyObject, 'base64');

  return encodeURIComponent(signature);
}
```

### Python Example

```python
#!/usr/bin/env python3

import base64
import requests
import time
import urllib.parse
from cryptography.hazmat.primitives.serialization import load_pem_private_key

# Configuration
API_KEY = 'your_api_key_here'
PRIVATE_KEY_PATH = 'test-prv-key.pem'

# Load private key
with open(PRIVATE_KEY_PATH, 'rb') as f:
    private_key = load_pem_private_key(data=f.read(), password=None)

# Build request parameters
params = {
    'symbol': 'BTCUSDT',
    'side': 'SELL',
    'type': 'LIMIT',
    'timeInForce': 'GTC',
    'quantity': '1.0000000',
    'price': '0.20',
    'timestamp': int(time.time() * 1000),
    'recvWindow': 5000
}

# Sign the request
payload = urllib.parse.urlencode(params, encoding='UTF-8')
signature = base64.b64encode(private_key.sign(payload.encode('ASCII')))
params['signature'] = signature

# Send the request
headers = {'X-MBX-APIKEY': API_KEY}
response = requests.post(
    'https://api.binance.com/api/v3/order',
    headers=headers,
    data=params
)
print(response.json())
```

## Timing Security

### Timestamp Requirements

- `timestamp` parameter is mandatory for all signed requests
- Can be in milliseconds or microseconds
- Must be within `recvWindow` of server time (default 5000ms)

### recvWindow

```javascript
// Server-side validation logic
serverTime = getCurrentTime()
if (timestamp < (serverTime + 1 second) && (serverTime - timestamp) <= recvWindow) {
  // begin processing request
  serverTime = getCurrentTime()
  if (serverTime - timestamp) <= recvWindow {
    // forward request to Matching Engine
  } else {
    // reject request
  }
} else {
  // reject request
}
```

### Clock Sync

```typescript
async function getServerTime(): Promise<number> {
  const response = await fetch('https://api.binance.com/api/v3/time');
  const data = await response.json();
  return data.serverTime;
}

function getLocalTime(): number {
  return Date.now();
}

async function getClockOffset(): Promise<number> {
  const serverTime = await getServerTime();
  const localTime = getLocalTime();
  return serverTime - localTime;
}

// Adjust timestamp with offset
function getAdjustedTimestamp(offset: number): number {
  return Date.now() + offset;
}
```

## Implementation Examples

### TypeScript Client Class

```typescript
import crypto from 'crypto';

interface BinanceConfig {
  apiKey: string;
  apiSecret?: string; // For HMAC
  privateKey?: string; // For RSA/Ed25519
  baseUrl?: string;
  recvWindow?: number;
}

class BinanceAuthClient {
  private apiKey: string;
  private apiSecret?: string;
  private privateKey?: crypto.KeyObject;
  private baseUrl: string;
  private recvWindow: number;
  private clockOffset: number = 0;

  constructor(config: BinanceConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || 'https://api.binance.com';
    this.recvWindow = config.recvWindow || 5000;

    if (config.privateKey) {
      this.privateKey = crypto.createPrivateKey(config.privateKey);
    }
  }

  async syncClock(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v3/time`);
    const { serverTime } = await response.json();
    this.clockOffset = serverTime - Date.now();
  }

  private getTimestamp(): number {
    return Date.now() + this.clockOffset;
  }

  private sign(queryString: string): string {
    if (this.privateKey) {
      // Ed25519 or RSA
      const signature = crypto
        .createSign('sha256')
        .update(queryString)
        .sign(this.privateKey, 'base64');
      return encodeURIComponent(signature);
    } else if (this.apiSecret) {
      // HMAC
      return crypto
        .createHmac('sha256', this.apiSecret)
        .update(queryString)
        .digest('hex');
    }
    throw new Error('No signing method configured');
  }

  async request(
    method: string,
    endpoint: string,
    params: Record<string, any> = {},
    isPrivate: boolean = false
  ): Promise<any> {
    if (isPrivate) {
      params.timestamp = this.getTimestamp();
      params.recvWindow = this.recvWindow;

      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');

      params.signature = this.sign(queryString);
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.keys(params).forEach(key =>
      url.searchParams.append(key, params[key])
    );

    const headers: Record<string, string> = {};
    if (isPrivate) {
      headers['X-MBX-APIKEY'] = this.apiKey;
    }

    const response = await fetch(url.toString(), {
      method,
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new BinanceApiError(error.code, error.msg, response.status);
    }

    return response.json();
  }
}

class BinanceApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public httpStatus: number
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}
```

### Case Sensitivity Notes

| Key Type | Signature Case Sensitivity |
|----------|---------------------------|
| HMAC | Not case-sensitive |
| RSA | Case-sensitive |
| Ed25519 | Case-sensitive |

Both the secret key and payload are always case-sensitive for all methods.
