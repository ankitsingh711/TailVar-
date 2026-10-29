// Applies the schema and demo users to the test database before the suite runs.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/tailvar_test";
  // @ts-expect-error plain JS module without type declarations
  const { migrate } = await import("../scripts/migrate.mjs");
  await migrate(url);
}
