import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { ensureCoalitionInfrastructure } from "../server/coalition-infrastructure";

// Imported only by the disposable-schema runner, never against application tables.
const schema = (await pool!.query("SELECT current_schema() AS name")).rows[0].name;
assert.match(schema, /^coalition_test_[a-f0-9]{24}$/);
await ensureCoalitionInfrastructure();
await pool!.query(`CREATE TABLE members (
  id varchar PRIMARY KEY, application_reference_id text, application_status text NOT NULL DEFAULT 'pending',
  full_name text NOT NULL, age integer NOT NULL, birthdate timestamp, chapter_id varchar, barangay_id varchar,
  contact_number text NOT NULL, email text, registered_voter boolean NOT NULL DEFAULT false,
  facebook_link text, photo_url text, is_active boolean NOT NULL DEFAULT false,
  household_size integer NOT NULL DEFAULT 1, household_voters integer,
  newsletter_opt_in boolean NOT NULL DEFAULT false, sector text, sector_other text,
  created_at timestamp NOT NULL DEFAULT now()
)`);
const groupUrl = "https://m.me/j/member-test-invitation";
await pool!.query("INSERT INTO coalition_settings (id,group_chat_url) VALUES (1,$1)", [groupUrl]);
const id = crypto.randomUUID();
await storage.createMember({ id, fullName: "Test Member", age: 20, contactNumber: "09000000000", email: "member@example.invalid" });
assert.equal((await pool!.query("SELECT * FROM coalition_email_outbox WHERE member_id=$1", [id])).rowCount, 0);
await Promise.all([
  storage.updateMember(id, { applicationStatus: "approved", isActive: true }, groupUrl),
  storage.updateMember(id, { applicationStatus: "approved", isActive: true }, groupUrl),
]);
let queued = await pool!.query("SELECT * FROM coalition_email_outbox WHERE member_id=$1", [id]);
assert.equal(queued.rowCount, 1, "Concurrent approvals must enqueue only one invitation.");
assert.equal(queued.rows[0].recipient, "member@example.invalid");
assert(queued.rows[0].body.includes(groupUrl));
assert.equal(queued.rows[0].sent_at, null, "Invitation survives as queued mail before delivery.");
await storage.updateMember(id, { applicationStatus: "pending", isActive: false });
await storage.updateMember(id, { applicationStatus: "approved", isActive: true });
assert.equal((await pool!.query("SELECT * FROM coalition_email_outbox WHERE member_id=$1", [id])).rowCount, 1);
// The legacy global setting remains populated: it must never be used as a fallback.
const disabledId = crypto.randomUUID();
await storage.createMember({ id: disabledId, fullName: "Disabled Test", age: 20, contactNumber: "09000000000", email: "disabled@example.invalid" });
await storage.updateMember(disabledId, { applicationStatus: "approved", isActive: true });
assert.equal((await pool!.query("SELECT * FROM coalition_email_outbox WHERE member_id=$1", [disabledId])).rowCount, 0);
const secondId = crypto.randomUUID();
await storage.createMember({ id: secondId, fullName: "Other Member", age: 20, contactNumber: "09000000000", email: "other@example.invalid" });
await storage.updateMember(secondId, { applicationStatus: "approved", isActive: true }, "https://m.me/j/other-member");
const second = (await pool!.query("SELECT body FROM coalition_email_outbox WHERE member_id=$1", [secondId])).rows[0];
assert(second.body.includes("https://m.me/j/other-member"));
assert(!second.body.includes(groupUrl));
await pool!.query("DELETE FROM coalition_email_outbox WHERE member_id IS NOT NULL");
await pool!.query("DELETE FROM coalition_settings");
console.log("Passed: individual approval invitation, concurrent approval deduplication, and disabled invitations.");
