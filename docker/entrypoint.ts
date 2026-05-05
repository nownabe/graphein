const migrate = Bun.spawn(["bun", "run", "db:migrate"], {
  stdout: "inherit",
  stderr: "inherit",
});

const code = await migrate.exited;
if (code !== 0) process.exit(code);

await import("../src/index.ts");
