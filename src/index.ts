import { env } from "./env";
import app from "./app";
import { boltApp } from "./slack/bolt";

// Start Bolt (Socket Mode connects via WebSocket, HTTP mode is no-op)
await boltApp.start();
console.log(
  `Bolt app started (${env.SLACK_SOCKET_MODE ? "Socket Mode" : "HTTP Mode"})`,
);

console.log(`Starting Graphein on port ${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
