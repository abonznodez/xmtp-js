import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNameResolutionCache,
  configureNameResolver,
  evictFromNameResolutionCache,
  getNameResolutionCacheStats,
  getNameResolverConfig,
  resolveName,
  resolveNames,
} from "./nameResolver.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("nameResolver", () => {
  beforeEach(() => {
    mockFetch.mockReset(); // Use mockReset instead of mockClear for a cleaner state
    clearNameResolutionCache(); // Clear cache before each test
    // Reset configuration to defaults
    configureNameResolver({
      web3BioApiKey: "",
      batchSize: 30,
      cacheMaxSize: 1000,
      cacheTTL: 15 * 60 * 1000,
    });
  });

  describe("resolveName", () => {
    it("should return address directly if input is already an Ethereum address", async () => {
      const address = "0x1234567890123456789012345678901234567890";
      const result = await resolveName(address);

      expect(result).toEqual({
        address,
        platform: "ethereum",
        displayName: null,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should resolve Base names successfully", async () => {
      const baseName = "test.base.eth";
      const expectedAddress = "0x1234567890123456789012345678901234567890";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ address: expectedAddress }],
      });

      const result = await resolveName(baseName);

      expect(result).toEqual({
        address: expectedAddress,
        platform: "basenames",
        displayName: baseName,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.web3.bio/ns/${encodeURIComponent(baseName)}`,
        expect.objectContaining({
          method: "GET",
          headers: {},
        }),
      );
    });

    it("should resolve ENS names successfully", async () => {
      const ensName = "vitalik.eth";
      const expectedAddress = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ address: expectedAddress }],
      });

      const result = await resolveName(ensName);

      expect(result).toEqual({
        address: expectedAddress,
        platform: "ens",
        displayName: ensName,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.web3.bio/ns/${encodeURIComponent(ensName)}`,
        expect.objectContaining({
          method: "GET",
          headers: {},
        }),
      );
    });

    it("should handle failed resolution gracefully", async () => {
      const baseName = "nonexistent.base.eth";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await resolveName(baseName);

      expect(result).toEqual({
        address: null,
        platform: null,
        displayName: null,
      });
    });

    it("should handle network errors gracefully", async () => {
      const baseName = "test.base.eth";

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await resolveName(baseName);

      expect(result).toEqual({
        address: null,
        platform: null,
        displayName: null,
      });
    });

    it("should handle invalid input format", async () => {
      const invalidInput = "invalid-input";

      const result = await resolveName(invalidInput);

      expect(result).toEqual({
        address: null,
        platform: null,
        displayName: null,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should normalize input by trimming and lowercasing", async () => {
      const address = "  0x1234567890123456789012345678901234567890  ";
      const expectedNormalized = "0x1234567890123456789012345678901234567890";

      const result = await resolveName(address);

      expect(result.address).toBe(expectedNormalized);
    });
  });

  describe("resolveNames", () => {
    it("should resolve multiple names in parallel", async () => {
      const inputs = [
        "0x1234567890123456789012345678901234567890",
        "test.base.eth",
        "vitalik.eth",
      ];

      // Mock batch response for the names that need resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            identity: "test.base.eth",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            identity: "vitalik.eth",
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      });

      const results = await resolveNames(inputs);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        address: "0x1234567890123456789012345678901234567890",
        platform: "ethereum",
        displayName: null,
      });
      expect(results[1]).toEqual({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "test.base.eth",
      });
      expect(results[2]).toEqual({
        address: "0x2222222222222222222222222222222222222222",
        platform: "ens",
        displayName: "vitalik.eth",
      });

      // Should only make one batch API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("caching", () => {
    it("should cache successful resolutions", async () => {
      const baseName = "test.base.eth";
      const expectedAddress = "0x1234567890123456789012345678901234567890";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ address: expectedAddress }],
      });

      // First call - should make API request
      const result1 = await resolveName(baseName);
      expect(result1.address).toBe(expectedAddress);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await resolveName(baseName);
      expect(result2.address).toBe(expectedAddress);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional API calls
    });

    it("should cache failed resolutions to avoid repeated API calls", async () => {
      const baseName = "nonexistent.base.eth";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // First call - should make API request
      const result1 = await resolveName(baseName);
      expect(result1.address).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await resolveName(baseName);
      expect(result2.address).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional API calls
    });

    it("should not cache Ethereum addresses (direct returns)", async () => {
      const address = "0x1234567890123456789012345678901234567890";

      // First call
      const result1 = await resolveName(address);
      expect(result1.address).toBe(address);

      // Second call
      const result2 = await resolveName(address);
      expect(result2.address).toBe(address);

      // No API calls should be made for direct addresses
      expect(mockFetch).not.toHaveBeenCalled();

      // Cache should contain the result
      const stats = getNameResolutionCacheStats();
      expect(stats.size).toBe(1);
    });

    it("should handle cache eviction", async () => {
      const baseName = "test.base.eth";
      const expectedAddress = "0x1234567890123456789012345678901234567890";

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ address: expectedAddress }],
      });

      // First call - populates cache
      await resolveName(baseName);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Evict from cache
      const evicted = evictFromNameResolutionCache(baseName);
      expect(evicted).toBe(true);

      // Second call - should make new API request
      await resolveName(baseName);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should provide cache statistics", async () => {
      const initialStats = getNameResolutionCacheStats();
      expect(initialStats.size).toBe(0);
      expect(initialStats.maxSize).toBe(1000);

      const address = "0x1234567890123456789012345678901234567890";
      await resolveName(address);

      const updatedStats = getNameResolutionCacheStats();
      expect(updatedStats.size).toBe(1);
    });

    it("should clear all cache entries", async () => {
      const address1 = "0x1234567890123456789012345678901234567890";
      const address2 = "0x0987654321098765432109876543210987654321";

      await resolveName(address1);
      await resolveName(address2);

      let stats = getNameResolutionCacheStats();
      expect(stats.size).toBe(2);

      clearNameResolutionCache();

      stats = getNameResolutionCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("configuration", () => {
    it("should allow setting API key", () => {
      const apiKey = "test-api-key-123";

      configureNameResolver({ web3BioApiKey: apiKey });

      const config = getNameResolverConfig();
      expect(config.web3BioApiKey).toBe(apiKey);
    });

    it("should use API key in requests when configured", async () => {
      const apiKey = "test-api-key-123";
      const baseName = "test.base.eth";

      configureNameResolver({ web3BioApiKey: apiKey });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { address: "0x1234567890123456789012345678901234567890" },
        ],
      });

      await resolveName(baseName);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.web3.bio/ns/${encodeURIComponent(baseName)}`,
        expect.objectContaining({
          method: "GET",
          headers: {
            "X-API-KEY": `Bearer ${apiKey}`,
          },
        }),
      );
    });

    it("should allow configuring batch size", () => {
      const batchSize = 50;

      configureNameResolver({ batchSize });

      const config = getNameResolverConfig();
      expect(config.batchSize).toBe(batchSize);
    });

    it("should allow configuring cache settings", () => {
      const cacheMaxSize = 500;
      const cacheTTL = 30 * 60 * 1000; // 30 minutes

      configureNameResolver({ cacheMaxSize, cacheTTL });

      const config = getNameResolverConfig();
      expect(config.cacheMaxSize).toBe(cacheMaxSize);
      expect(config.cacheTTL).toBe(cacheTTL);
    });
  });

  describe("batching", () => {
    it("should resolve multiple names efficiently", async () => {
      const inputs = ["test1.base.eth", "test2.base.eth", "vitalik.eth"];

      // Mock batch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            identity: "test1.base.eth",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            identity: "test2.base.eth",
            address: "0x2222222222222222222222222222222222222222",
          },
          {
            identity: "vitalik.eth",
            address: "0x3333333333333333333333333333333333333333",
          },
        ],
      });

      const results = await resolveNames(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(results[1].address).toBe(
        "0x2222222222222222222222222222222222222222",
      );
      expect(results[2].address).toBe(
        "0x3333333333333333333333333333333333333333",
      );

      // Should only make one batch API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/ns/batch/"),
        expect.objectContaining({
          method: "GET",
          headers: {},
        }),
      );
    });

    it("should handle mixed input types (addresses and names)", async () => {
      const inputs = [
        "0x1234567890123456789012345678901234567890", // address
        "test.base.eth", // base name
        "vitalik.eth", // ens name
      ];

      // Mock batch response for names only
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            identity: "test.base.eth",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            identity: "vitalik.eth",
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      });

      const results = await resolveNames(inputs);

      expect(results).toHaveLength(3);

      // Address should be returned as-is
      expect(results[0]).toEqual({
        address: "0x1234567890123456789012345678901234567890",
        platform: "ethereum",
        displayName: null,
      });

      // Names should be resolved via batch
      expect(results[1].address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(results[2].address).toBe(
        "0x2222222222222222222222222222222222222222",
      );

      // Should only make one batch API call (addresses don't need API calls)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should preserve input order in results", async () => {
      const inputs = ["vitalik.eth", "test.base.eth"];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            identity: "test.base.eth",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            identity: "vitalik.eth",
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      });

      const results = await resolveNames(inputs);

      expect(results[0].displayName).toBe("vitalik.eth");
      expect(results[1].displayName).toBe("test.base.eth");
    });

    it("should deduplicate inputs while preserving order", async () => {
      const inputs = ["test.base.eth", "vitalik.eth", "test.base.eth"]; // duplicate

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            identity: "test.base.eth",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            identity: "vitalik.eth",
            address: "0x2222222222222222222222222222222222222222",
          },
        ],
      });

      const results = await resolveNames(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].displayName).toBe("test.base.eth");
      expect(results[1].displayName).toBe("vitalik.eth");
      expect(results[2].displayName).toBe("test.base.eth"); // duplicate preserved

      // Should only make one API call despite duplicates
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
