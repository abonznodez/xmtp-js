import type { AgentMiddleware } from "@/core/Agent.js";
import type { MessageContext } from "@/core/MessageContext.js";
import { filter } from "@/utils/filter.js";
import {
  resolveName,
  type NameResolutionResult,
} from "@/utils/nameResolver.js";

export interface NameResolverOptions {
  /**
   * Whether to automatically resolve names mentioned in messages
   * Names should be prefixed with @ (e.g., "@alice.base.eth")
   * @default true
   */
  autoResolve?: boolean;

  /**
   * Custom pattern to match names in messages
   * @default /@([a-zA-Z0-9.-]+\.(base\.)?eth|0x[a-fA-F0-9]{40})/g
   */
  namePattern?: RegExp;

  /**
   * Whether to reply with resolved addresses
   * @default false
   */
  replyWithResolution?: boolean;

  /**
   * Custom handler for resolved names
   */
  onNameResolved?: (
    ctx: MessageContext,
    originalName: string,
    resolution: NameResolutionResult,
  ) => Promise<void> | void;
}

export class NameResolver<ContentTypes = unknown> {
  private options: Required<Omit<NameResolverOptions, "onNameResolved">> &
    Pick<NameResolverOptions, "onNameResolved">;

  constructor(options: NameResolverOptions = {}) {
    this.options = {
      autoResolve: options.autoResolve ?? true,
      namePattern:
        options.namePattern ??
        /@([a-zA-Z0-9.-]+\.(base\.)?eth|0x[a-fA-F0-9]{40})/g,
      replyWithResolution: options.replyWithResolution ?? false,
      onNameResolved: options.onNameResolved,
    };
  }

  /**
   * Extracts names from a message text
   */
  private extractNames(text: string): string[] {
    const matches = Array.from(text.matchAll(this.options.namePattern));
    return matches
      .map((match) => match[1])
      .filter((name, index, arr) => arr.indexOf(name) === index);
  }

  /**
   * Resolves all names mentioned in a message
   */
  private async resolveNamesInMessage(
    ctx: MessageContext,
    messageText: string,
  ): Promise<void> {
    const names = this.extractNames(messageText);

    if (names.length === 0) {
      return;
    }

    console.log(
      `🔍 Found ${names.length} name(s) to resolve: ${names.join(", ")}`,
    );

    const resolutions = await Promise.allSettled(
      names.map(async (name) => ({
        name,
        resolution: await resolveName(name),
      })),
    );

    const resolved: Array<{ name: string; resolution: NameResolutionResult }> =
      [];
    const failed: string[] = [];

    for (const result of resolutions) {
      if (result.status === "fulfilled") {
        const { name, resolution } = result.value;
        if (resolution.address) {
          resolved.push({ name, resolution });
          console.log(
            `✅ ${name} → ${resolution.address} (${resolution.platform})`,
          );

          // Call custom handler if provided
          if (this.options.onNameResolved) {
            await this.options.onNameResolved(ctx, name, resolution);
          }
        } else {
          failed.push(name);
          console.log(`❌ ${name} → Could not resolve`);
        }
      } else {
        const name =
          names.find((n) => result.reason?.toString().includes(n)) || "unknown";
        failed.push(name);
        console.log(`❌ ${name} → Error: ${result.reason}`);
      }
    }

    // Send resolution results if requested
    if (
      this.options.replyWithResolution &&
      (resolved.length > 0 || failed.length > 0)
    ) {
      let reply = "";

      if (resolved.length > 0) {
        reply += "🔍 **Name Resolutions:**\n";
        for (const { name, resolution } of resolved) {
          const platform =
            resolution.platform === "basenames"
              ? "🔵 Base"
              : resolution.platform === "ens"
                ? "🟣 ENS"
                : "📝 Address";
          reply += `• @${name} → \`${resolution.address}\` (${platform})\n`;
        }
      }

      if (failed.length > 0) {
        reply += failed.length > 0 && resolved.length > 0 ? "\n" : "";
        reply += "❌ **Could not resolve:**\n";
        for (const name of failed) {
          reply += `• @${name}\n`;
        }
      }

      if (reply) {
        await ctx.conversation.send(reply.trim());
      }
    }
  }

  /**
   * Returns the middleware function
   */
  middleware(): AgentMiddleware<ContentTypes> {
    return async (ctx, next) => {
      // Only process text messages if auto-resolve is enabled
      if (this.options.autoResolve && filter.isText(ctx.message)) {
        try {
          await this.resolveNamesInMessage(ctx, ctx.message.content);
        } catch (error) {
          console.warn("NameResolver middleware error:", error);
        }
      }

      // Continue to next middleware
      await next();
    };
  }

  /**
   * Manually resolve a single name
   */
  async resolveName(name: string): Promise<NameResolutionResult> {
    return resolveName(name);
  }

  /**
   * Manually resolve multiple names
   */
  async resolveNames(names: string[]): Promise<NameResolutionResult[]> {
    const results = await Promise.allSettled(names.map(resolveName));
    return results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : {
            address: null,
            platform: null,
            displayName: null,
          },
    );
  }
}
