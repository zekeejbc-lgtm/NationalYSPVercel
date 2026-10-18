import assert from "node:assert/strict";
import { test } from "node:test";
import type { User } from "@supabase/supabase-js";
import { assertExternalSignInMethod } from "../server/external-auth-policy";

const googleUser = { identities: [{ provider: "google" }] } as Pick<User, "identities">;

test("Google requires an OAuth session and a Google identity", () => {
  assert.doesNotThrow(() => assertExternalSignInMethod(googleUser, [{ method: "oauth" }], "google"));
  assert.throws(() => assertExternalSignInMethod(googleUser, [{ method: "password" }], "google"));
  assert.throws(() => assertExternalSignInMethod({ identities: [] }, [{ method: "oauth" }], "google"));
});

test("Google sessions cannot be relabeled as passkey sign-ins", () => {
  assert.throws(() => assertExternalSignInMethod(googleUser, [{ method: "oauth" }], "passkey"));
  assert.doesNotThrow(() => assertExternalSignInMethod(googleUser, [{ method: "passkey" }], "passkey"));
});

test("missing or malformed authentication methods fail closed", () => {
  for (const amr of [undefined, null, {}, [], [null], ["password"]]) {
    for (const provider of ["google", "passkey"] as const) {
      assert.throws(() => assertExternalSignInMethod(googleUser, amr, provider));
    }
  }
});
