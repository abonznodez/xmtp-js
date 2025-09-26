import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageContext } from "@/core/MessageContext.js";
import { filter } from "@/utils/filter.js";
import { resolveName } from "@/utils/nameResolver.js";
import { NameResolver } from "./NameResolver.js";

// Mock the nameResolver utility
vi.mock("@/utils/nameResolver.js", () => ({
  resolveName: vi.fn(),
}));

// Mock the filter utility
vi.mock("@/utils/filter.js", () => ({
  filter: {
    isText: vi.fn(),
  },
}));

const mockResolveName = vi.mocked(resolveName);
const mockFilter = vi.mocked(filter);

describe("NameResolver", () => {
  let nameResolver: NameResolver;
  let mockCtx: MessageContext;
  let mockNext: () => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    nameResolver = new NameResolver();
    mockNext = vi.fn().mockResolvedValue(undefined);

    // Create a mock context
    mockCtx = {
      message: {
        content: "",
        contentType: { typeId: "text" },
      },
      conversation: {
        send: vi.fn(),
      },
    } as any;

    mockFilter.isText.mockReturnValue(true);
  });

  describe("name extraction", () => {
    it("should extract Base names from messages", async () => {
      mockCtx.message.content = "Hello @alice.base.eth and @bob.base.eth!";

      mockResolveName
        .mockResolvedValueOnce({
          address: "0x1111111111111111111111111111111111111111",
          platform: "basenames",
          displayName: "alice.base.eth",
        })
        .mockResolvedValueOnce({
          address: "0x2222222222222222222222222222222222222222",
          platform: "basenames",
          displayName: "bob.base.eth",
        });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).toHaveBeenCalledTimes(2);
      expect(mockResolveName).toHaveBeenCalledWith("alice.base.eth");
      expect(mockResolveName).toHaveBeenCalledWith("bob.base.eth");
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should extract ENS names from messages", async () => {
      mockCtx.message.content = "Check out @vitalik.eth's latest post!";

      mockResolveName.mockResolvedValueOnce({
        address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        platform: "ens",
        displayName: "vitalik.eth",
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).toHaveBeenCalledWith("vitalik.eth");
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should extract Ethereum addresses from messages", async () => {
      mockCtx.message.content =
        "Send to @0x1234567890123456789012345678901234567890";

      mockResolveName.mockResolvedValueOnce({
        address: "0x1234567890123456789012345678901234567890",
        platform: "ethereum",
        displayName: null,
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).toHaveBeenCalledWith(
        "0x1234567890123456789012345678901234567890",
      );
    });

    it("should deduplicate repeated names", async () => {
      mockCtx.message.content =
        "Hello @alice.base.eth! How are you @alice.base.eth?";

      mockResolveName.mockResolvedValueOnce({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).toHaveBeenCalledTimes(1);
      expect(mockResolveName).toHaveBeenCalledWith("alice.base.eth");
    });

    it("should not extract names without @ prefix", async () => {
      mockCtx.message.content = "Hello alice.base.eth and vitalik.eth!";

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("options", () => {
    it("should respect autoResolve: false", async () => {
      nameResolver = new NameResolver({ autoResolve: false });
      mockCtx.message.content = "Hello @alice.base.eth!";

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should call custom onNameResolved handler", async () => {
      const onNameResolved = vi.fn();
      nameResolver = new NameResolver({ onNameResolved });

      mockCtx.message.content = "Hello @alice.base.eth!";
      mockResolveName.mockResolvedValueOnce({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(onNameResolved).toHaveBeenCalledWith(mockCtx, "alice.base.eth", {
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });
    });

    it("should reply with resolution when replyWithResolution: true", async () => {
      nameResolver = new NameResolver({ replyWithResolution: true });

      mockCtx.message.content = "Hello @alice.base.eth!";
      mockResolveName.mockResolvedValueOnce({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockCtx.conversation.send).toHaveBeenCalledWith(
        expect.stringContaining("🔍 **Name Resolutions:**"),
      );
      expect(mockCtx.conversation.send).toHaveBeenCalledWith(
        expect.stringContaining("alice.base.eth"),
      );
      expect(mockCtx.conversation.send).toHaveBeenCalledWith(
        expect.stringContaining("0x1111111111111111111111111111111111111111"),
      );
    });
  });

  describe("error handling", () => {
    it("should handle resolution failures gracefully", async () => {
      mockCtx.message.content = "Hello @nonexistent.base.eth!";
      mockResolveName.mockResolvedValueOnce({
        address: null,
        platform: null,
        displayName: null,
      });

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      // Should not throw and should continue to next middleware
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should handle network errors gracefully", async () => {
      mockCtx.message.content = "Hello @alice.base.eth!";
      mockResolveName.mockRejectedValueOnce(new Error("Network error"));

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      // Should not throw and should continue to next middleware
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should skip non-text messages", async () => {
      mockFilter.isText.mockReturnValue(false);
      mockCtx.message.content = "Hello @alice.base.eth!";

      const middleware = nameResolver.middleware();
      await middleware(mockCtx, mockNext);

      expect(mockResolveName).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("manual resolution methods", () => {
    it("should provide manual resolveName method", async () => {
      mockResolveName.mockResolvedValueOnce({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });

      const result = await nameResolver.resolveName("alice.base.eth");

      expect(result).toEqual({
        address: "0x1111111111111111111111111111111111111111",
        platform: "basenames",
        displayName: "alice.base.eth",
      });
    });

    it("should provide manual resolveNames method", async () => {
      mockResolveName
        .mockResolvedValueOnce({
          address: "0x1111111111111111111111111111111111111111",
          platform: "basenames",
          displayName: "alice.base.eth",
        })
        .mockResolvedValueOnce({
          address: "0x2222222222222222222222222222222222222222",
          platform: "ens",
          displayName: "bob.eth",
        });

      const results = await nameResolver.resolveNames([
        "alice.base.eth",
        "bob.eth",
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].address).toBe(
        "0x1111111111111111111111111111111111111111",
      );
      expect(results[1].address).toBe(
        "0x2222222222222222222222222222222222222222",
      );
    });
  });
});
