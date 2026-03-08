# Exchange Error Codes Reference

This document contains comprehensive error codes for Binance, Bybit, and other exchanges.

## Binance Error Codes

### General Errors

| Code | Name | Description | Solution |
|------|------|-------------|----------|
| -1000 | UNKNOWN | An unknown error occurred while processing the request | Retry the request |
| -1001 | DISCONNECTED | Internal error; unable to respond | Check connection and retry |
| -1002 | UNAUTHORIZED | Unauthorized request | Check API key permissions |
| -1003 | TOO_MANY_REQUESTS | Rate limit exceeded | Reduce request frequency |
| -1006 | UNEXPECTED_RESP | Unexpected response from exchange | Retry or contact support |
| -1007 | TIMEOUT | Request timeout | Retry with smaller data range |
| -1013 | INVALID_MESSAGE | Invalid message content | Check request format |
| -1014 | UNKNOWN_ORDER_COMPOSITION | Unknown order composition | Check order parameters |
| -1015 | TOO_MANY_ORDERS | Too many new orders | Reduce order frequency |
| -1016 | SERVICE_SHUTTING_DOWN | Service shutting down | Wait and retry |
| -1020 | UNSUPPORTED_OPERATION | Unsupported operation | Check API documentation |
| -1021 | TIMESTAMP_NOT_IN_RECV_WINDOW | Timestamp outside recvWindow | Sync server time |
| -1022 | INVALID_SIGNATURE | Invalid signature | Check signature generation |

### Order Errors

| Code | Name | Description | Solution |
|------|------|-------------|----------|
| -2010 | NEW_ORDER_REJECTED | New order rejected | Check order parameters |
| -2011 | CANCEL_REJECTED | Cancel rejected | Check order status |
| -2013 | NO_SUCH_ORDER | Order does not exist | Check order ID |
| -2014 | BAD_API_KEY_FMT | Bad API key format | Check API key format |
| -2015 | REJECTED_MBX_KEY | Rejected API key | Check API key permissions |
| -2016 | NO_TRADING_WINDOW | No trading window | Wait for trading window |

### Request Errors

| Code | Name | Description | Solution |
|------|------|-------------|----------|
| -1100 | ILLEGAL_CHARS | Illegal characters in request | Remove illegal characters |
| -1101 | TOO_MANY_PARAMETERS | Too many parameters | Reduce parameters |
| -1102 | UNEXPECTED_PARAMS | Unexpected parameters | Check API documentation |
| -1103 | UNKNOWN_PARAM | Unknown parameter | Check parameter name |
| -1104 | UNREAD_PARAMETERS | Unread parameters | Check request format |
| -1105 | PARAM_EMPTY | Required parameter empty | Provide required parameters |
| -1106 | PARAM_NOT_REQUIRED | Parameter not required | Remove parameter |

### Filter Errors

| Code | Name | Description | Solution |
|------|------|-------------|----------|
| -2013 | NO_SUCH_ORDER | Order does not exist | Check order ID |
| -2026 | ORDER_ARCHIVED | Order archived | Order too old to modify |

## Bybit Error Codes (V5 API)

### Common Errors

| Code | Description | Solution |
|------|-------------|----------|
| 0 | OK | Success |
| 10001 | Invalid API key | Check API key format |
| 10002 | Invalid timestamp | Sync server time |
| 10003 | Invalid signature | Check signature generation |
| 10004 | Request timeout | Reduce request size |
| 10005 | Permission denied | Check API key permissions |
| 10006 | Too many requests | Reduce request frequency |
| 10007 | IP not whitelisted | Add IP to whitelist |
| 10010 | Error sign | Check signature algorithm |

### Order Errors

| Code | Description | Solution |
|------|-------------|----------|
| 10001 | Params error | Check request parameters |
| 10015 | Order not found | Check order ID |
| 10016 | Order already cancelled | Order already cancelled |
| 10017 | Order already filled | Order already executed |
| 110007 | Insufficient balance | Check account balance |
| 110009 | Order price out of range | Check price limits |
| 110010 | Order quantity out of range | Check quantity limits |
| 110011 | Position size exceeds limit | Reduce position size |
| 110012 | Order would trigger immediately | Adjust order price |
| 110013 | Order would exceed position limit | Check position limit |
| 110014 | Reduce only order would increase position | Check reduce only setting |
| 110015 | Position not found | Check position exists |
| 110016 | Order not found | Check order ID |
| 110017 | Position status abnormal | Check position status |
| 110018 | Order status abnormal | Check order status |
| 110019 | Risk limit exceeded | Reduce position size |
| 110020 | Risk limit not modified | No change in risk limit |

### Position Errors

| Code | Description | Solution |
|------|-------------|----------|
| 110001 | Position size is zero | Check position quantity |
| 110002 | Position is in liquidation | Position being liquidated |
| 110003 | Position is bankrupt | Position bankrupt |
| 110004 | Position is not modified | No changes to position |
| 110005 | Leverage not modified | Same leverage value |

## OKX Error Codes

### Common Errors

| Code | Name | Description |
|------|------|-------------|
| 0 | Success | Request successful |
| 50001 | Invalid API key | API key invalid or expired |
| 50002 | Invalid timestamp | Timestamp out of sync |
| 50004 | Invalid signature | Signature verification failed |
| 50005 | Invalid passphrase | Wrong passphrase |
| 50011 | User not found | Account does not exist |
| 50013 | Account locked | Account temporarily locked |
| 50014 | Request timeout | Request took too long |
| 50015 | Rate limit exceeded | Too many requests |

### Trading Errors

| Code | Name | Description |
|------|------|-------------|
| 51001 | Order not found | Order ID does not exist |
| 51002 | Order already cancelled | Cannot cancel again |
| 51003 | Order already filled | Order fully executed |
| 51004 | Insufficient balance | Not enough funds |
| 51005 | Order price invalid | Price out of range |
| 51006 | Order size invalid | Size out of range |
| 51007 | Order rejected | Exchange rejected order |
| 51008 | Position limit exceeded | Too many positions |

## Error Handling Best Practices

1. **Always log errors** - Store all error responses for analysis
2. **Implement retries** - For transient errors, implement exponential backoff
3. **Monitor patterns** - Watch for recurring errors that indicate systemic issues
4. **Handle rate limits** - Respect rate limits and implement queuing
5. **Sync time** - Use NTP to keep server time accurate
6. **Validate locally** - Check parameters before sending to reduce errors
7. **Use testnet first** - Test all logic on testnet before mainnet

## Error Response Examples

### Binance Error Response

```json
{
  "code": -2010,
  "msg": "Account has insufficient balance for requested action.",
  "data": {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "type": "LIMIT",
    "quantity": "1.0",
    "price": "50000"
  }
}
```

### Bybit Error Response

```json
{
  "retCode": 110007,
  "retMsg": "Insufficient wallet balance.",
  "result": {}
}
```

### OKX Error Response

```json
{
  "code": "51004",
  "msg": "Insufficient balance",
  "data": []
}
```

## Reference Links

- [Binance Error Codes](https://binance-docs.github.io/apidocs/spot/en/#error-codes-2)
- [Bybit Error Codes](https://bybit-exchange.github.io/docs/v5/error)
- [OKX Error Codes](https://www.okx.com/docs-v5/en/#error-code)
