import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAuth, SupabaseAuth } from "../lib/supabase.js";

function mockAuth(auth: Record<string, any>) {
  const adapter = new SupabaseAuth({ url: "https://example.supabase.co", publishableKey: "test-public", secretKey: "test-secret" });
  adapter.createPublicClient = () => ({ auth }) as any;
  adapter.admin = { auth: { admin: { createUser() { throw new Error("Website signup must not auto-confirm via admin"); } } } };
  return adapter;
}

test("website signup, verification, and resend use Supabase public confirmation APIs", async () => {
  const calls: any[] = [];
  const confirmed = { id: "new-user", email: "new@example.test", email_confirmed_at: new Date().toISOString() };
  const auth = mockAuth({
    signUp: async (input) => { calls.push(input); return { data: { user: { ...confirmed, email_confirmed_at: null, identities: [{ id: "identity" }] }, session: null } }; },
    verifyOtp: async (input) => { calls.push(input); return { data: { user: confirmed } }; },
    resend: async (input) => { calls.push(input); return { error: null }; },
  });
  const input = { email: confirmed.email, password: "test-password", displayName: "New User" };
  const signup = await auth.signUp(input);
  assert.equal(signup.confirmationRequired, true);
  assert.deepEqual(calls[0], { email: input.email, password: input.password, options: { data: { display_name: input.displayName } } });
  assert.equal(await auth.verifyEmail(input.email, "123456"), confirmed);
  assert.deepEqual(calls[1], { email: input.email, token: "123456", type: "email" });
  await auth.resendVerification(input.email);
  assert.deepEqual(calls[2], { email: input.email, type: "signup" });
});

test("auto-confirm configuration and obfuscated existing users cannot be treated as pending signup", async () => {
  const auth = mockAuth({ signUp: async () => ({ data: { user: { id: "user", identities: [{}], email_confirmed_at: new Date().toISOString() }, session: { access_token: "not-an-app-session" } } }) });
  assert.equal((await auth.signUp({ email: "a@example.test", password: "password", displayName: "User" })).confirmationRequired, false);
  auth.createPublicClient = () => ({ auth: { signUp: async () => ({ data: { user: { id: "fake-id", identities: [] } } }) } }) as any;
  await assert.rejects(auth.signUp({ email: "a@example.test", password: "password", displayName: "User" }), { code: "email_exists" });
});

test("Supabase rejects invalid or expired codes and preserves delivery errors", async () => {
  const error = { message: "Token expired", code: "otp_expired", status: 403 };
  const auth = mockAuth({
    verifyOtp: async () => ({ error }),
    resend: async () => ({ error: { message: "Email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 } }),
    signUp: async () => ({ error: { message: "Email address not authorized", code: "email_address_not_authorized", status: 403 } }),
  });
  await assert.rejects(auth.verifyEmail("a@example.test", "123456"), { code: "otp_expired", status: 403 });
  await assert.rejects(auth.resendVerification("a@example.test"), { code: "over_email_send_rate_limit", status: 429 });
  await assert.rejects(auth.signUp({ email: "a@example.test", password: "password", displayName: "User" }), { code: "email_address_not_authorized" });
});

test("test-only memory auth requires an unexpired, single-use OTP; legacy admin accounts remain confirmed", async () => {
  const auth = new MemoryAuth();
  const input = { email: "new@example.test", password: "test-password", displayName: "New User" };
  const signup = await auth.signUp(input);
  assert.equal(signup.user.email_confirmed_at, null);
  await assert.rejects(auth.signIn(input.email, input.password), { code: "email_not_confirmed" });
  await assert.rejects(auth.verifyEmail(input.email, "999999"));
  auth.pendingCodes.get(input.email)!.expiresAt = Date.now() - 1;
  await assert.rejects(auth.verifyEmail(input.email, "123456"));
  await auth.resendVerification(input.email);
  assert.ok((await auth.verifyEmail(input.email, "123456")).email_confirmed_at);
  await assert.rejects(auth.verifyEmail(input.email, "123456"));
  assert.equal((await auth.signIn(input.email, input.password)).id, signup.user.id);
  const legacy = await auth.createUser({ ...input, email: "legacy@example.test" });
  assert.equal((await auth.signIn(legacy.email, input.password)).id, legacy.id);
});
