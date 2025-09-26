/**
 * Comprehensive Base Name Resolution Examples
 *
 * This file demonstrates multiple ways to use Base name resolution
 * in the XMTP Agent SDK:
 *
 * 1. Direct method calls (createDmWithAddress, createGroupWithAddresses)
 * 2. NameResolver middleware for automatic @mention processing
 * 3. Manual name resolution utilities
 */

import { loadEnvFile } from "node:process";
import { Agent } from "./core/index.js";
import { NameResolver } from "./middleware/NameResolver.js";
import { resolveName } from "./utils/nameResolver.js";
import { createSigner, createUser } from "./utils/user.js";

try {
  loadEnvFile(".env");
  console.info("✅ Loaded environment variables from .env file");
} catch {
  console.info("⚠️  No .env file found, using default settings");
}

console.log("🚀 XMTP Agent SDK - Base Name Resolution Examples\n");

// Initialize agent
const agent = process.env.XMTP_WALLET_KEY
  ? await Agent.createFromEnv()
  : await Agent.create(createSigner(createUser()), { dbPath: null });

console.log("=== EXAMPLE 1: Direct Method Calls ===\n");

try {
  console.log("Creating DM with Base name...");
  const dm = await agent.createDmWithAddress("bennycode.base.eth");
  await dm.send("🎉 Hello! This DM was created using direct name resolution!");
  console.log("✅ DM created and message sent successfully");

  console.log("\nCreating group with mixed name types...");
  const group = await agent.createGroupWithAddresses([
    "alice.base.eth", // Base name
    "vitalik.eth", // ENS name
    "0x1234567890123456789012345678901234567890", // Address
  ]);
  await group.send("👋 Welcome to our group created with mixed name types!");
  console.log("✅ Group created with mixed name types");
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.log(`⚠️  Direct method example failed: ${errorMessage}`);
  console.log(
    "   This is normal if the resolved addresses don't have XMTP accounts yet",
  );
}

console.log("\n=== EXAMPLE 2: NameResolver Middleware ===\n");

// Create and configure NameResolver middleware
const nameResolver = new NameResolver({
  autoResolve: true,
  replyWithResolution: false, // Set to true to auto-reply with resolutions
  onNameResolved: async (ctx, name, resolution) => {
    console.log(
      `🔍 Middleware resolved: @${name} → ${resolution.address} (${resolution.platform})`,
    );

    // Custom logic: You could store resolutions, trigger notifications, etc.
    // Example: Log to database, send to analytics, etc.
  },
});

// Add middleware to agent
agent.use(nameResolver.middleware());

// Set up message handlers
agent.on("text", async (ctx) => {
  const content = ctx.message.content;

  // Example commands
  if (content.startsWith("/resolve")) {
    const parts = content.split(" ");
    if (parts.length > 1) {
      const name = parts[1];
      try {
        const result = await nameResolver.resolveName(name);
        if (result.address) {
          await ctx.conversation.send(
            `🔍 **Resolution Result:**\n` +
              `${name} → \`${result.address}\`\n` +
              `Platform: ${result.platform}`,
          );
        } else {
          await ctx.conversation.send(`❌ Could not resolve: ${name}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await ctx.conversation.send(`❌ Error: ${errorMessage}`);
      }
    }
    return;
  }

  if (content.toLowerCase().includes("help")) {
    await ctx.conversation.send(
      "🤖 **Base Name Resolution Agent**\n\n" +
        "I can resolve:\n" +
        "• Base names: @username.base.eth\n" +
        "• ENS names: @username.eth\n" +
        "• Addresses: @0x123...\n\n" +
        "Try:\n" +
        "• 'Hello @bennycode.base.eth!'\n" +
        "• '/resolve alice.base.eth'\n" +
        "• 'Check out @vitalik.eth'",
    );
    return;
  }

  // The middleware automatically processes @mentions in any message
  if (
    content.includes("@") &&
    (content.includes(".eth") || content.includes("0x"))
  ) {
    await ctx.conversation.send(
      "👀 I noticed you mentioned someone! " +
        "Check the console to see the automatic name resolution in action.",
    );
  }
});

console.log("=== EXAMPLE 3: Manual Name Resolution ===\n");

const testNames = [
  "bennycode.base.eth",
  "vitalik.eth",
  "0x1234567890123456789012345678901234567890",
  "nonexistent.base.eth",
];

console.log("Testing manual name resolution...");
for (const name of testNames) {
  try {
    const result = await resolveName(name);
    if (result.address) {
      console.log(`✅ ${name} → ${result.address} (${result.platform})`);
    } else {
      console.log(`❌ ${name} → Could not resolve`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`❌ ${name} → Error: ${errorMessage}`);
  }
}

console.log("\n=== EXAMPLE 4: Batch Resolution ===\n");

console.log("Testing batch resolution...");
const batchResults = await nameResolver.resolveNames([
  "alice.base.eth",
  "bob.eth",
  "charlie.base.eth",
]);

batchResults.forEach((result, index) => {
  const name = ["alice.base.eth", "bob.eth", "charlie.base.eth"][index];
  if (result.address) {
    console.log(`✅ ${name} → ${result.address} (${result.platform})`);
  } else {
    console.log(`❌ ${name} → Could not resolve`);
  }
});

// Start the agent
await agent.start();
console.log("\n🎉 Agent started! All examples completed successfully.");
console.log("\n📱 The agent is now running and will:");
console.log("   • Automatically resolve @mentions in messages");
console.log("   • Respond to /resolve commands");
console.log("   • Help users understand name resolution");

console.log("\n💡 Key Features Demonstrated:");
console.log("   ✅ Direct method calls with name resolution");
console.log("   ✅ Middleware for automatic @mention processing");
console.log("   ✅ Manual resolution utilities");
console.log("   ✅ Batch resolution capabilities");
console.log("   ✅ Error handling and fallbacks");
console.log("   ✅ Support for Base names, ENS names, and addresses");

// Keep process running
process.on("SIGINT", async () => {
  console.log("\n👋 Shutting down...");
  await agent.stop();
  process.exit(0);
});
