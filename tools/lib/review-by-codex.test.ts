import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import type { CodeReviewResult } from "./review-schema.ts";

const APPROVED_RESULT: CodeReviewResult = {
  schema_version: "1.0",
  status: "approved",
  summary: "All changes look good.",
  comment_markdown: "LGTM",
  reviewed_ref: { base: "main", head: "abc123" },
  findings: [],
};

const CHANGES_REQUESTED_RESULT: CodeReviewResult = {
  schema_version: "1.0",
  status: "changes_requested",
  summary: "Found an issue.",
  comment_markdown: "Please fix the bug.",
  reviewed_ref: { base: "main", head: "def456" },
  findings: [
    {
      title: "SQL injection",
      severity: "high",
      category: "security",
      description: "User input not sanitized.",
      suggested_fix: "Use parameterized queries",
      confidence: "high",
      location: { path: "src/db.ts", line: 42, end_line: 42 },
      snippet: "db.query(`SELECT * FROM users WHERE id = ${id}`)",
    },
  ],
};

// Track output paths written by the mocked spawn so we can create fake output files
let capturedOutputPath: string | null = null;

function mockSpawn(outputContent: string | null, exitCode = 0, stderr = "") {
  return spyOn(Bun, "spawn").mockImplementation((cmd: any) => {
    // Extract the -o flag value to write the fake output file
    const args = cmd as string[];
    const oIdx = args.indexOf("-o");
    if (oIdx !== -1 && oIdx + 1 < args.length) {
      capturedOutputPath = args[oIdx + 1];
      if (outputContent !== null) {
        writeFileSync(capturedOutputPath, outputContent);
      }
    }

    return {
      stdout: new Response("").body,
      stderr: new Response(stderr).body,
      exited: Promise.resolve(exitCode),
      kill: mock(),
    } as any;
  });
}

describe("reviewByCodex", () => {
  let spawnSpy: ReturnType<typeof mockSpawn>;

  afterEach(() => {
    spawnSpy?.mockRestore();
    if (capturedOutputPath && existsSync(capturedOutputPath)) {
      unlinkSync(capturedOutputPath);
    }
    capturedOutputPath = null;
  });

  it("returns parsed review result from output file", async () => {
    spawnSpy = mockSpawn(JSON.stringify(APPROVED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    const result = await reviewByCodex();

    expect(result).toEqual(APPROVED_RESULT);
  });

  it("passes correct arguments to codex CLI", async () => {
    spawnSpy = mockSpawn(JSON.stringify(APPROVED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await reviewByCodex({ base: "develop" });

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][0] as string[];
    expect(args[0]).toBe("codex");
    expect(args[1]).toBe("exec");
    expect(args).toContain("--output-schema");
    expect(args).toContain("-o");
    // The prompt (last positional arg) should contain the base branch
    const lastArg = args[args.length - 1];
    expect(lastArg).toContain("develop");
  });

  it("throws when CLI exits with non-zero code", async () => {
    spawnSpy = mockSpawn(null, 1, "network error");

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await expect(reviewByCodex()).rejects.toThrow("codex CLI exited with code 1: network error");
  });

  it("throws when output file does not exist", async () => {
    // Mock spawn that doesn't write an output file
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () =>
        ({
          stdout: new Response("").body,
          stderr: new Response("").body,
          exited: Promise.resolve(0),
          kill: mock(),
        }) as any,
    );

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await expect(reviewByCodex()).rejects.toThrow("did not produce an output file");
  });

  it("throws when output does not contain valid JSON", async () => {
    spawnSpy = mockSpawn("This is just plain text with no JSON.");

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await expect(reviewByCodex()).rejects.toThrow("does not contain valid JSON");
  });

  it("extracts JSON from output with surrounding text", async () => {
    const outputWithText = `Here is my review:\n${JSON.stringify(APPROVED_RESULT)}\nDone.`;
    spawnSpy = mockSpawn(outputWithText);

    const { reviewByCodex } = await import("./review-by-codex.ts");
    const result = await reviewByCodex();

    expect(result).toEqual(APPROVED_RESULT);
  });

  it("handles changes_requested results with findings", async () => {
    spawnSpy = mockSpawn(JSON.stringify(CHANGES_REQUESTED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    const result = await reviewByCodex();

    expect(result.status).toBe("changes_requested");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe("security");
  });

  it("cleans up temp output file after success", async () => {
    spawnSpy = mockSpawn(JSON.stringify(APPROVED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await reviewByCodex();

    // The output file should have been cleaned up
    if (capturedOutputPath) {
      // Give a tick for the finally block to complete
      await Bun.sleep(10);
      expect(existsSync(capturedOutputPath)).toBe(false);
    }
  });

  it("cleans up temp output file after error", async () => {
    spawnSpy = mockSpawn("no json here");

    const { reviewByCodex } = await import("./review-by-codex.ts");
    try {
      await reviewByCodex();
    } catch {
      // expected
    }

    if (capturedOutputPath) {
      await Bun.sleep(10);
      expect(existsSync(capturedOutputPath)).toBe(false);
    }
  });

  it("includes prompt with base branch in args", async () => {
    spawnSpy = mockSpawn(JSON.stringify(APPROVED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await reviewByCodex();

    const args = spawnSpy.mock.calls[0][0] as string[];
    // The prompt is the last arg and should reference the default base "main"
    const lastArg = args[args.length - 1];
    expect(lastArg).toContain("main");
  });

  it("passes cwd option to spawn", async () => {
    spawnSpy = mockSpawn(JSON.stringify(APPROVED_RESULT));

    const { reviewByCodex } = await import("./review-by-codex.ts");
    await reviewByCodex({ cwd: "/tmp/repo" });

    const spawnOpts = spawnSpy.mock.calls[0][1] as any;
    expect(spawnOpts.cwd).toBe("/tmp/repo");
  });
});
