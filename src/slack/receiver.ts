import type { Receiver, ReceiverEvent, App as BoltApp } from "@slack/bolt";
import type { Context } from "hono";
import { env } from "../env";
import crypto from "node:crypto";

type EventHandler = (event: ReceiverEvent) => Promise<void>;

export class HonoReceiver implements Receiver {
  private eventHandler: EventHandler | null = null;

  init(app: BoltApp): void {
    this.eventHandler = app.processEvent.bind(app);
  }

  start(): Promise<unknown> {
    return Promise.resolve();
  }

  stop(): Promise<unknown> {
    return Promise.resolve();
  }

  async handleRequest(c: Context): Promise<Response> {
    const rawBody = await c.req.text();
    const timestamp = c.req.header("x-slack-request-timestamp") ?? "";
    const signature = c.req.header("x-slack-signature") ?? "";

    if (!this.verifySignature(rawBody, timestamp, signature)) {
      return c.text("Invalid signature", 401);
    }

    // Interactions are form-encoded with a "payload" field
    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, unknown>;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      body = JSON.parse(params.get("payload") ?? "{}");
    } else {
      body = JSON.parse(rawBody);
    }

    // URL verification challenge
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    if (!this.eventHandler) {
      return c.text("Not initialized", 500);
    }

    const event: ReceiverEvent = {
      body,
      ack: async (response) => response,
    };

    try {
      await this.eventHandler(event);
    } catch (err) {
      console.error("Error handling Slack event:", err);
    }

    return c.text("ok", 200);
  }

  private verifySignature(body: string, timestamp: string, signature: string): boolean {
    if (!timestamp || !signature) return false;

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (Number(timestamp) < fiveMinutesAgo) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac("sha256", env.SLACK_SIGNING_SECRET);
    hmac.update(sigBasestring);
    const mySignature = `v0=${hmac.digest("hex")}`;

    try {
      return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
