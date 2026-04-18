/**
 * Playwright global teardown: stop the E2E server process.
 */
async function globalTeardown() {
  const pid = (globalThis as Record<string, unknown>).__e2eServerPid as number | undefined;

  if (pid) {
    try {
      process.kill(pid);
    } catch {
      // Process may have already exited
    }
  }
}

export default globalTeardown;
