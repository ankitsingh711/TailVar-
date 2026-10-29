import { migrate } from "../scripts/migrate.mts";

// Applies the schema and demo users to the test database before the suite runs.
export default async function setup() {
  await migrate(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/tailvar_test");
}
