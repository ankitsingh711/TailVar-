// Applies db/schema.sql and seeds the three demo accounts. Safe to run repeatedly:
// the schema is idempotent and existing users are left untouched.
//   DATABASE_URL=... npm run db:migrate
import { readFile } from "node:fs/promises";
import pg from "pg";
import bcrypt from "bcryptjs";

// Fictional demo accounts defined by the assignment brief (not infrastructure secrets).
const DEMO_USERS = [
  { username: "customer1", password: "Customer1@Demo26", role: "customer", displayName: "Customer One" },
  { username: "customer2", password: "Customer2@Demo26", role: "customer", displayName: "Customer Two" },
  { username: "admin", password: "Admin@Demo26", role: "admin", displayName: "Administrator" },
];

export async function migrate(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(727274)"); // serialise concurrent migrations
    await client.query(schema);
    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name)
         VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.role, u.displayName],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url)
    .then(() => console.log("Migration complete; demo users present."))
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exit(1);
    });
}
