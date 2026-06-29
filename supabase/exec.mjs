// Runs an arbitrary .sql file against the database (direct connection).
// Usage: GG_DB_PASSWORD='...' node exec.mjs migrations/001_session_cap.sql
import { readFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) { console.error("Pass a .sql file path."); process.exit(1); }
const file = isAbsolute(arg) ? arg : join(__dirname, arg);
const sql = readFileSync(file, "utf8");

const password = process.env.GG_DB_PASSWORD;
if (!password) { console.error("Set GG_DB_PASSWORD."); process.exit(1); }

const REF = "ixogmhrlvcrrefbmqmnj";
const candidates = [
  { label: "direct (IPv6)", host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
  { label: "session pooler aws-0", host: "aws-0-us-west-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { label: "session pooler aws-1", host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { label: "transaction pooler aws-0", host: "aws-0-us-west-2.pooler.supabase.com", port: 6543, user: `postgres.${REF}` },
];

for (const c of candidates) {
  const client = new pg.Client({
    host: c.host, port: c.port, user: c.user, password, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
  });
  try {
    process.stdout.write(`→ ${c.label}… `);
    await client.connect();
    await client.query(sql);
    console.log(`connected. ✅ Applied ${arg}`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log("failed (" + e.message + ")");
    try { await client.end(); } catch {}
  }
}
console.error("❌ Could not connect via any route.");
process.exit(1);
