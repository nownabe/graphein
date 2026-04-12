import { boltApp } from "../src/slack/bolt";

const res = await boltApp.client.conversations.history({
  channel: "C0AR8RZMFHC",
  oldest: "1775657454.969249",
  latest: "1775657454.969249",
  inclusive: true,
  limit: 1,
});

console.log(JSON.stringify(res.messages?.[0], null, 2));
process.exit(0);
