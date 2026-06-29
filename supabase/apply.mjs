// Applies schema.sql to a Postgres database.
// Usage: DATABASE_URL="postgresql://...:[PWD]@...:5432/postgres" npm run apply
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");

const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error(
    "Set DATABASE_URL to your Supabase connection string.\n" +
      'Example: DATABASE_URL="postgresql://postgres.xxxx:[PWD]@aws-0-...pooler.supabase.com:5432/postgres" npm run apply'
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log("✅ Schema applied successfully.");
} catch (e) {
  console.error("❌ Failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
