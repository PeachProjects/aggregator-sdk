/**
 * Unit tests for ApiClient and ApiError.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ApiClient, ApiError } from '../../src';

describe('ApiError', () => {
  it('should create error with message and code', () => {
    const error = new ApiError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.code).toBe(404);
    expect(error.name).toBe('ApiError');
  });

  it('should be instance of Error', () => {
    const error = new ApiError('Test error', 500);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ApiClient', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should use DEFAULT_API_URL when no baseUrl provided', () => {
      const client = new ApiClient();
      expect(client.getBaseUrl()).toBe('https://api.peach.ag');
    });

    it('should use DEFAULT_API_URL when baseUrl is empty', () => {
      const client = new ApiClient({ baseUrl: '' });
      expect(client.getBaseUrl()).toBe('https://api.peach.ag');
    });

    it('should create client with custom baseUrl', () => {
      const client = new ApiClient({ baseUrl: 'https://api.example.com' });
      expect(client.getBaseUrl()).toBe('https://api.example.com');
    });
  });

  describe('setBaseUrl', () => {
    it('should update base URL', () => {
      const client = new ApiClient({ baseUrl: 'https://old.com' });
      client.setBaseUrl('https://new.com');
      expect(client.getBaseUrl()).toBe('https://new.com');
    });
  });

  describe('getBaseUrl', () => {
    it('should return current base URL', () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });
      expect(client.getBaseUrl()).toBe('https://api.test.com');
    });
  });

  describe('findRoutes', () => {
    it('should call API with correct parameters', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          code: 200,
          msg: 'success',
          data: {
            request_id: 'test-123',
            amount_in: '1000000000000000000',
            amount_out: '2000000000000000000',
            deviation_ratio: '0.001',
            paths: [{ pool: '0x123', provider: 'PANCAKEV3', adapter: '0x456', token_in: '0xAAA', token_out: '0xBBB', direction: true, fee_rate: '0.0005', amount_in: '1000000000000000000', amount_out: '2000000000000000000' }],
            contracts: { router: '0x789', adapters: { PANCAKEV3: '0x456' } },
            gas: 150000,
          },
        }),
      });

      const result = await client.findRoutes({
        from: '0xAAA',
        target: '0xBBB',
        amount: 1000000000000000000n,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('https://api.test.com/router/find_routes');
      expect(url).toContain('from=0xAAA');
      expect(url).toContain('target=0xBBB');
      expect(url).toContain('amount=1000000000000000000');
      expect(result.paths).toHaveLength(1);
    });

    it('should throw ApiError on non-200 response', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.findRoutes({
        from: '0xAAA',
        target: '0xBBB',
        amount: 1000n,
      })).rejects.toThrow(ApiError);
    });

    it('should throw ApiError when no routes found', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          code: 200,
          msg: 'success',
          data: { paths: [] },
        }),
      });

      await expect(client.findRoutes({
        from: '0xAAA',
        target: '0xBBB',
        amount: 1000n,
      })).rejects.toThrow('No routes found');
    });

    it('should throw ApiError on API error code', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          code: 400,
          msg: 'Invalid parameters',
          data: null,
        }),
      });

      await expect(client.findRoutes({
        from: '0xAAA',
        target: '0xBBB',
        amount: 1000n,
      })).rejects.toThrow('Invalid parameters');
    });
  });

  describe('getStatus', () => {
    it('should return status data', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          code: 200,
          msg: 'success',
          data: {
            providers: ['PANCAKEV3'],
            chainflows: [{ provider: 'PANCAKEV3', tx_cursor: null, version: { latest_block_number: 123, latest_transaction_index: 0 }, update_at: Date.now() }],
          },
        }),
      });

      const result = await client.getStatus();
      expect(result.providers).toEqual(['PANCAKEV3']);
      expect(result.chainflows).toHaveLength(1);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of providers', async () => {
      const client = new ApiClient({ baseUrl: 'https://api.test.com' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          code: 200,
          msg: 'success',
          data: {
            providers: ['PANCAKEV3', 'PANCAKEV2'],
            chainflows: [],
          },
        }),
      });

      const providers = await client.getAvailableProviders();
      expect(providers).toEqual(['PANCAKEV3', 'PANCAKEV2']);
    });
  });
});

describe('ApiClient Timeout', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should throw timeout error when request times out', async () => {
    const client = new ApiClient({ baseUrl: 'https://api.test.com', timeout: 100 });

    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(client.findRoutes({
      from: '0xA',
      target: '0xB',
      amount: 1000n,
    })).rejects.toThrow('API request timeout');
  });
});
