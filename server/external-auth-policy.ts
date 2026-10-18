import type { User } from "@supabase/supabase-js";

export function assertExternalSignInMethod(
  user: Pick<User, "identities">,
  amr: unknown,
  provider: "google" | "passkey",
) {
  const methods = Array.isArray(amr)
    ? amr.map((entry) => typeof entry === "string" ? entry : entry?.method)
    : [];
  if (provider === "google") {
    if (!methods.includes("oauth") || !user.identities?.some(identity => identity.provider === "google")) {
      throw new Error("Please authenticate with Google to use Google sign-in.");
    }
  } else if (!methods.includes("passkey")) {
    throw new Error("Please authenticate with a passkey to use passkey sign-in.");
  }
}
