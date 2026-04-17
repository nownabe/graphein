/**
 * Execute SQL against the dev or test database.
 *
 * Usage:
 *   bun run tools/run-sql.ts "SELECT * FROM users LIMIT 5"
 *   bun run tools/run-sql.ts --test "SELECT count(*) FROM users"
 *   bun run tools/run-sql.ts --file path/to/query.sql
 *   bun run tools/run-sql.ts --test --file path/to/query.sql
 */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const DEV_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://graphein:graphein@localhost:15432/graphein";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://graphein_test:graphein_test@localhost:15433/graphein_test";

function usage(): never {
  console.error(`Usage:
  bun run tools/run-sql.ts [--test] <sql>
  bun run tools/run-sql.ts [--test] --file <path>`);
  process.exit(1);
}

const args = process.argv.slice(2);
let useTest = false;
let fromFile = false;
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--test") {
    useTest = true;
  } else if (args[i] === "--file") {
    fromFile = true;
  } else {
    positional.push(args[i]);
  }
}

if (positional.length !== 1) usage();

const query = fromFile ? readFileSync(positional[0], "utf-8").trim() : positional[0];

if (!query) {
  console.error("Error: empty query");
  process.exit(1);
}

const databaseUrl = useTest ? TEST_DATABASE_URL : DEV_DATABASE_URL;
const label = useTest ? "test" : "dev";
console.log(`[${label}] ${databaseUrl.replace(/\/\/.*@/, "//***@")}`);
console.log();

const sql = postgres(databaseUrl);

try {
  const rows = await sql.unsafe(query);
  if (rows.length === 0) {
    console.log("(no rows)");
  } else {
    console.table(rows);
  }
  console.log(`\n${rows.count ?? rows.length} row(s)`);
} catch (err) {
  console.error("Query failed:", (err as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
