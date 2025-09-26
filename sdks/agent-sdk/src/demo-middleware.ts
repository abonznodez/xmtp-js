import { loadEnvFile } from "node:process";
import { Agent, AgentError } from "./core/index.js";
import { NameResolver } from "./middleware/NameResolver.js";
import { getTestUrl } from "./utils/debug.js";
import { createSigner, createUser } from "./utils/user.js";

try {
  loadEnvFile(".env");
  console.info(`Loaded keys from ".env" file.`);
} catch {}

console.log("🚀 Demonstrating NameResolver Middleware\n");

const agent = process.env.XMTP_WALLET_KEY
  ? await Agent.createFromEnv()
  : await Agent.create(createSigner(createUser()), {
      dbPath: null,
    });

// Create NameResolver middleware with custom options
const nameResolver = new NameResolver({
  autoResolve: true, // Automatically resolve @mentions
  replyWithResolution: true, // Reply with resolved addresses
  onNameResolved: async (ctx, name, resolution) => {
    // Custom handler - could log to database, trigger notifications, etc.
    console.log(`🎯 Custom handler: ${name} → ${resolution.address}`);
  },
});

// Add the middleware to the agent
agent.use(nameResolver.middleware());

// Set up other event handlers
agent.on("text", async (ctx) => {
  const content = ctx.message.content.toLowerCase();

  if (content.includes("hello")) {
    await ctx.conversation.send(
      "Hello! 👋 Try mentioning someone with @name.base.eth or @name.eth!",
    );
  }

  if (content.startsWith("/resolve")) {
    const parts = content.split(" ");
    if (parts.length > 1) {
      const nameToResolve = parts[1];
      try {
        console.log(`📝 Manual resolution requested: ${nameToResolve}`);
        const result = await nameResolver.resolveName(nameToResolve);

        if (result.address) {
          await ctx.conversation.send(
            `🔍 **Manual Resolution:**\n${nameToResolve} → \`${result.address}\` (${result.platform})`,
          );
        } else {
          await ctx.conversation.send(`❌ Could not resolve: ${nameToResolve}`);
        }
      } catch (error) {
        await ctx.conversation.send(
          `❌ Error resolving ${nameToResolve}: ${error}`,
        );
      }
    } else {
      await ctx.conversation.send(
        "Usage: /resolve <name.base.eth|name.eth|0x...>",
      );
    }
  }
});

agent.on("start", (ctx) => {
  console.log(`We are online: ${getTestUrl(ctx.client)}`);
  console.log("\n📝 Try these commands:");
  console.log("• Send: 'Hello @bennycode.base.eth!'");
  console.log("• Send: 'Check out @vitalik.eth'");
  console.log("• Send: '/resolve alice.base.eth'");
  console.log(
    "• Send: 'Transfer to @0x1234567890123456789012345678901234567890'",
  );
});

agent.on("unhandledError", (error) => {
  console.error("Unhandled error:", error);
});

await agent.start();
console.log("Agent started with NameResolver middleware! 🎉");
console.log(
  "The agent will automatically resolve any @mentions in messages.\n",
);

// Example: Test the middleware programmatically
console.log("🧪 Testing middleware functionality...");

// Simulate different message scenarios
const testMessages = [
  "Hello @bennycode.base.eth!",
  "Check out @vitalik.eth and @alice.base.eth",
  "Transfer to @0x1234567890123456789012345678901234567890",
  "No mentions in this message",
];

for (const message of testMessages) {
  console.log(`\n📝 Testing message: "${message}"`);

  // Extract potential names (simulate what middleware does)
  const namePattern = /@([a-zA-Z0-9.-]+\.(base\.)?eth|0x[a-fA-F0-9]{40})/g;
  const names = Array.from(message.matchAll(namePattern)).map(
    (match) => match[1],
  );

  if (names.length > 0) {
    console.log(`   Found names: ${names.join(", ")}`);

    // Test resolution
    try {
      const results = await nameResolver.resolveNames(names);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const result = results[i];
        if (result.address) {
          console.log(`   ✅ ${name} → ${result.address} (${result.platform})`);
        } else {
          console.log(`   ❌ ${name} → Could not resolve`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  } else {
    console.log(`   No @mentions found`);
  }
}

console.log("\n🏁 NameResolver middleware demo completed!");
console.log("The agent is still running and will process incoming messages...");

// Keep the process running
process.on("SIGINT", async () => {
  console.log("\n👋 Shutting down gracefully...");
  await agent.stop();
  process.exit(0);
});
