import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";

const config = loadConfig();
const app = await buildApp(config, createStore(config));
await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async () => { await app.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
