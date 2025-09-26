import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveName, resolveNames } from "./nameResolver.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("nameResolver", () => {
  beforeEach(() => {
    mockFetch.mockClear();
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

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { address: "0x1111111111111111111111111111111111111111" },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { address: "0x2222222222222222222222222222222222222222" },
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
    });
  });
});
