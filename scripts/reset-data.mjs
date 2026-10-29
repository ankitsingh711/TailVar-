// Deletes all policies, claims, sessions and login failures, keeping the demo users.
// Used to hand reviewers a clean environment after running tests against it.
//   DATABASE_URL=... npm run db:reset-data -- --yes
import pg from "pg";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes (this deletes all policies and claims).");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("TRUNCATE claims, policies, sessions, login_failures RESTART IDENTITY");
await client.end();
console.log("Policies, claims and sessions cleared.");
