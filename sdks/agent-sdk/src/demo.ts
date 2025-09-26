import { loadEnvFile } from "node:process";
import { Agent, AgentError } from "./core/index.js";
import { CommandRouter } from "./middleware/CommandRouter.js";
import { NameResolver } from "./middleware/NameResolver.js";
import { getTestUrl } from "./utils/debug.js";
import { createSigner, createUser } from "./utils/user.js";

try {
  loadEnvFile(".env");
  console.info(`Loaded keys from ".env" file.`);
} catch {}

const agent = process.env.XMTP_WALLET_KEY
  ? await Agent.createFromEnv()
  : await Agent.create(createSigner(createUser()), {
      dbPath: null,
    });

const router = new CommandRouter();

router.command("/version", async (ctx) => {
  await ctx.conversation.send(`v${process.env.npm_package_version}`);
});

// Add NameResolver middleware for automatic name resolution
const nameResolver = new NameResolver({
  autoResolve: true, // Automatically resolve @mentions
  replyWithResolution: false, // Don't auto-reply (keep it clean)
  onNameResolved: (ctx, name, resolution) => {
    console.log(
      `🔍 Resolved: @${name} → ${resolution.address} (${resolution.platform})`,
    );
  },
});

agent.use(router.middleware());
agent.use(nameResolver.middleware());

agent.on("attachment", (ctx) => {
  console.log("Got attachment:", ctx.message.content);
});

agent.on("text", (ctx) => {
  console.log("Got text:", ctx.message.content);
});

agent.on("reaction", (ctx) => {
  console.log("Got reaction:", ctx.message.content);
});

agent.on("reply", (ctx) => {
  console.log("Got reply:", ctx.message.content);
});

agent.on("text", async (ctx) => {
  if (ctx.message.content.startsWith("@agent")) {
    await ctx.conversation.send("How can I help you?");
  }

  // Example: Respond to messages containing Base names
  if (
    ctx.message.content.includes("@") &&
    (ctx.message.content.includes(".base.eth") ||
      ctx.message.content.includes(".eth"))
  ) {
    await ctx.conversation.send(
      "I see you mentioned someone! The NameResolver middleware has automatically resolved their address. 🔍",
    );
  }
});

const errorHandler = (error: unknown) => {
  if (error instanceof AgentError) {
    console.log(`Caught error ID "${error.code}"`, error);
    console.log("Original error", error.cause);
  } else {
    console.log(`Caught error`, error);
  }
};

agent.on("unhandledError", errorHandler);

agent.on("start", (ctx) => {
  console.log(`We are online: ${getTestUrl(ctx.client)}`);
});

agent.on("stop", (ctx) => {
  console.log("Agent stopped", ctx);
});

await agent.start();
console.log("Agent has started.");

// Test both approaches: middleware (automatic) and direct method calls
console.log("\n🧪 Testing middleware approach:");
console.log(
  "The NameResolver middleware will automatically process any @mentions in messages.",
);

console.log("\n🧪 Testing direct method approach:");
console.log("Creating DM with Base name using direct method call...");
const dm = await agent.createDmWithAddress("bennycode.base.eth");
await dm.send(
  "Hello Benny! This message was sent using the direct createDmWithAddress() method. 🎉",
);

console.log("✅ Both middleware and direct method approaches are working!");
console.log(
  "💡 Try sending a message with @bennycode.base.eth to see the middleware in action!",
);
