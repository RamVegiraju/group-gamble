// Applies schema.sql, trying several connection routes (direct is IPv6-only;
// poolers are IPv4). Password is passed via env so special chars like # are safe.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");

const REF = "ixogmhrlvcrrefbmqmnj";
const password = process.env.GG_DB_PASSWORD;
if (!password) {
  console.error("Set GG_DB_PASSWORD.");
  process.exit(1);
}

// Try in order until one connects.
const candidates = [
  { label: "direct (IPv6)", host: `db.${REF}.supabase.co`, port: 5432, user: "postgres" },
  { label: "session pooler us-west-2 (aws-0)", host: "aws-0-us-west-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { label: "session pooler us-west-2 (aws-1)", host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: `postgres.${REF}` },
  { label: "transaction pooler us-west-2 (aws-0)", host: "aws-0-us-west-2.pooler.supabase.com", port: 6543, user: `postgres.${REF}` },
];

for (const c of candidates) {
  const client = new pg.Client({
    host: c.host,
    port: c.port,
    user: c.user,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    process.stdout.write(`→ trying ${c.label}… `);
    await client.connect();
    console.log("connected.");
    await client.query(sql);
    console.log("✅ Schema applied successfully via " + c.label + ".");
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log("failed (" + e.message + ")");
    try { await client.end(); } catch {}
  }
}

console.error("❌ Could not connect via any route.");
process.exit(1);
