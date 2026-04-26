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
    // Access internal _registeredResources to verify registration
    const registeredResources = (
      server as unknown as { _registeredResources: Record<string, unknown> }
    )._registeredResources;
    expect(registeredResources).toBeDefined();
    expect(registeredResources["graphein://me"]).toBeDefined();
  });

  test("does not register duplicate resources across calls", () => {
    const server1 = createMcpServer({ name: "a", version: "0.1.0" });
    const server2 = createMcpServer({ name: "b", version: "0.1.0" });
    // Each call returns an independent server instance
    expect(server1).not.toBe(server2);
  });
});
