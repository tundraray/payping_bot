# Task: Unit Tests for Balance API

**Task ID**: task-04
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 1.5 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Write comprehensive unit tests for TronGridClient.getUSDTBalance() method. Tests verify correct API call construction, response parsing, error handling, and edge cases.

## Context

The balance API is critical for payout session end detection. Unit tests ensure:
- Correct hex encoding of addresses
- Proper parsing of hex balance responses
- Robust error handling for API failures
- Coverage of edge cases (zero balance, large balance, errors)

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\clients\__tests__\trongrid.client.spec.ts` (or update if exists)

## Dependencies

**Depends On**:
- Task 03 (getUSDTBalance implementation) - must exist to test

**Blocks**:
- Task 05 (PayoutSessionService) - balance API must be tested before integration

## Implementation Steps

### Step 1: Create test file

Create or update `libs/blockchain/src/clients/__tests__/trongrid.client.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TronGridClient } from '../trongrid.client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TronGridClient.getUSDTBalance', () => {
  let client: TronGridClient;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TronGridClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'blockchain.usdtContractAddress') {
                return 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
              }
              if (key === 'blockchain.apiKey') {
                return 'test-api-key';
              }
            }),
          },
        },
      ],
    }).compile();

    client = module.get<TronGridClient>(TronGridClient);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Test cases in following steps
});
```

### Step 2: Test valid balance response

```typescript
it('should parse valid balance response correctly', async () => {
  const mockResponse = {
    data: {
      result: { result: true },
      constant_result: ['0000000000000000000000000000000000000000000000000000012a05f200'],
    },
  };

  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockResolvedValue(mockResponse),
  } as any);

  const balance = await client.getUSDTBalance('TXyz1234...');

  expect(balance).toBe('5000000000'); // 5000.00 USDT
});
```

### Step 3: Test zero balance

```typescript
it('should return "0" for zero balance', async () => {
  const mockResponse = {
    data: {
      result: { result: true },
      constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
    },
  };

  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockResolvedValue(mockResponse),
  } as any);

  const balance = await client.getUSDTBalance('TXyz1234...');

  expect(balance).toBe('0');
});
```

### Step 4: Test large balance (BigInt handling)

```typescript
it('should handle large balances correctly', async () => {
  const mockResponse = {
    data: {
      result: { result: true },
      constant_result: ['00000000000000000000000000000000000000000000000000038d7ea4c68000'],
    },
  };

  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockResolvedValue(mockResponse),
  } as any);

  const balance = await client.getUSDTBalance('TXyz1234...');

  expect(balance).toBe('1000000000000000'); // Very large balance
});
```

### Step 5: Test API error

```typescript
it('should throw TronGridApiError on API failure', async () => {
  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockRejectedValue(new Error('Network error')),
  } as any);

  await expect(
    client.getUSDTBalance('TXyz1234...')
  ).rejects.toThrow('Failed to fetch USDT balance');
});
```

### Step 6: Test timeout

```typescript
it('should throw error on timeout', async () => {
  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 100)
      )
    ),
  } as any);

  await expect(
    client.getUSDTBalance('TXyz1234...')
  ).rejects.toThrow();
});
```

### Step 7: Test invalid response (missing constant_result)

```typescript
it('should throw error when constant_result is missing', async () => {
  const mockResponse = {
    data: {
      result: { result: true },
      constant_result: [],
    },
  };

  mockedAxios.create.mockReturnValue({
    post: jest.fn().mockResolvedValue(mockResponse),
  } as any);

  await expect(
    client.getUSDTBalance('TXyz1234...')
  ).rejects.toThrow('Invalid balance response');
});
```

### Step 8: Test address hex encoding

```typescript
it('should correctly encode address parameter', async () => {
  const postMock = jest.fn().mockResolvedValue({
    data: {
      result: { result: true },
      constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
    },
  });

  mockedAxios.create.mockReturnValue({
    post: postMock,
  } as any);

  await client.getUSDTBalance('TXyz1234...');

  expect(postMock).toHaveBeenCalledWith(
    '/wallet/triggerconstantcontract',
    expect.objectContaining({
      function_selector: 'balanceOf(address)',
      parameter: expect.any(String), // Verify it's a hex string
    }),
    expect.any(Object)
  );
});
```

### Step 9: Run tests

```bash
pnpm test libs/blockchain/src/clients/__tests__/trongrid.client.spec.ts
```

## Acceptance Criteria

- [x] Test valid balance response: hex parsing works
- [x] Test zero balance: returns "0"
- [x] Test large balance: BigInt handles correctly
- [x] Test API error: throws TronGridApiError
- [x] Test timeout: throws error
- [x] Test invalid response: throws error
- [x] Test address encoding: parameter is hex string
- [x] All tests pass: `pnpm test`
- [x] Coverage >= 80% for getUSDTBalance method

## Verification Steps

1. Run tests: `pnpm test libs/blockchain/src/clients`
2. Verify all test cases pass
3. Check coverage report: `pnpm test:cov`
4. Verify coverage >= 80%

## Test Cases Summary

| Test Case | Input | Expected Output | AC Reference |
|-----------|-------|-----------------|--------------|
| Valid balance | hex response | Decimal string | AC-2.1 |
| Zero balance | "0x0..." | "0" | Edge case |
| Large balance | Large hex | Correct BigInt | Edge case |
| API error | Network failure | Throws error | Error handling |
| Timeout | Slow response | Throws error | Error handling |
| Invalid response | Missing field | Throws error | Error handling |
| Address encoding | TRON address | Hex parameter | Implementation |

## Notes

- **Mock axios**: Use jest.mock to avoid real API calls
- **BigInt testing**: Verify large numbers are handled correctly
- **Error messages**: Verify error messages contain context
- **Coverage target**: Aim for 100% on this critical method

## References

- Design Doc: `docs/design/payout-session-notifications-design.md`
- Work Plan: `docs/plans/payout-session-notifications-plan.md` (Task 1.4)
- Testing Principles: Red-Green-Refactor cycle

## Completion Checklist

- [x] Test file created
- [x] All 7+ test cases implemented (18 test cases added)
- [x] Mocks configured correctly
- [x] All tests pass
- [x] Coverage >= 80% (92.08% statements, 85.96% branches)
- [x] Test descriptions clear and descriptive
