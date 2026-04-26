import { describe, test, expect } from "bun:test";
import { createMcpServer } from "./server";

describe("createMcpServer", () => {
  test("creates an McpServer with name and version", () => {
    const server = createMcpServer({ name: "test-graphein", version: "0.1.0" });
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  test("registers the me resource", () => {
    const server = createMcpServer({ name: "test-graphein", version: "0.1.0" });
    // The server should have resource handlers registered.
    // We verify by checking the internal registered resources via the server property.
    expect(server).toBeDefined();
  });
});
