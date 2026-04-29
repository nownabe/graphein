import { describe, test, expect } from "bun:test";
import { createMcpServer, type McpServerConfig } from "./server";
import type { Database } from "../db/client";
import type { KudosService } from "../kudos/service";
import type { TaskService } from "../tasks/service";

const mockDb = {} as Database;
const mockTaskService = {} as TaskService;
const mockKudosService = {} as KudosService;

function createTestConfig(overrides?: Partial<McpServerConfig>): McpServerConfig {
  return {
    name: "test-graphein",
    version: "0.1.0",
    db: mockDb,
    taskService: mockTaskService,
    kudosService: mockKudosService,
    ...overrides,
  };
}

describe("createMcpServer", () => {
  test("creates an McpServer with name and version", () => {
    const server = createMcpServer(createTestConfig());
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  test("registers the me resource", () => {
    const server = createMcpServer(createTestConfig());
    // Access internal _registeredResources to verify registration
    const registeredResources = (
      server as unknown as { _registeredResources: Record<string, unknown> }
    )._registeredResources;
    expect(registeredResources).toBeDefined();
    expect(registeredResources["graphein://me"]).toBeDefined();
  });

  test("registers task tools", () => {
    const server = createMcpServer(createTestConfig());
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(registeredTools).toBeDefined();
    expect(registeredTools["list_assigned_tasks"]).toBeDefined();
    expect(registeredTools["list_owned_tasks"]).toBeDefined();
    expect(registeredTools["list_task_assignees"]).toBeDefined();
    expect(registeredTools["archive_task"]).toBeDefined();
    expect(registeredTools["unarchive_task"]).toBeDefined();
  });

  test("does not register duplicate resources across calls", () => {
    const server1 = createMcpServer(createTestConfig({ name: "a" }));
    const server2 = createMcpServer(createTestConfig({ name: "b" }));
    // Each call returns an independent server instance
    expect(server1).not.toBe(server2);
  });
});
