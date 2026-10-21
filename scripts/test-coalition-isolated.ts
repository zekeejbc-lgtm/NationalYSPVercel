import "dotenv/config";
import crypto from "node:crypto";
import { Pool } from "pg";
import { databaseUrl, pool } from "../server/db";

if (!databaseUrl || !pool) throw new Error("A database connection is required for Coalition integration tests.");
const schema = `coalition_test_${crypto.randomBytes(12).toString("hex")}`;
const admin = new Pool({ ...pool.options, max: 1 });
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN GRANT USAGE ON SCHEMA ${schema} TO anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN GRANT USAGE ON SCHEMA ${schema} TO authenticated; END IF;
  END $$`);
  // Only tables in this disposable schema are visible to the test pool.
  pool.options.options = `-c search_path=${schema}`;
  await import("./test-coalition");
} finally {
  await pool.end().catch(() => {});
  if (!/^coalition_test_[a-f0-9]{24}$/.test(schema)) throw new Error("Invalid test schema.");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
