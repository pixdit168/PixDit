import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

async function waitForServer(baseUrl, processOutput) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Node server did not start.\n${processOutput()}`);
}

test("Node backend supports auth, state, account, prompt, and provider contracts", { timeout: 30_000 }, async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layera-server-"));
  const port = 19_000 + Math.floor(Math.random() * 2_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      PUBLIC_ORIGIN: "",
      REPLICATE_API_TOKEN: "",
      GENERATED_DIR: path.join(temporaryRoot, "generated"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.exitCode === null ? child.once("exit", resolve) : resolve());
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  const health = await waitForServer(baseUrl, () => output);
  assert.equal(health.provider, "replicate");
  assert.equal(health.model, "black-forest-labs/flux-2-pro");
  assert.equal(health.configured, false);
  assert.equal(health.deploymentMode, "node");
  assert.equal(health.database, "memory");
  assert.equal(health.auth, "memory");

  let cookie = "";
  let csrfToken = "";
  async function request(pathname, { method = "GET", body, csrf = false } = {}) {
    const headers = { Origin: baseUrl };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (csrf) headers["X-CSRF-Token"] = csrfToken;
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    const payload = await response.json();
    if (payload.csrfToken) csrfToken = payload.csrfToken;
    return { response, payload };
  }

  const registration = await request("/api/auth/register", {
    method: "POST",
    body: {
      displayName: "Ayu Pratama",
      email: "ayu@example.test",
      password: "aman-sekali-123",
      deviceId: "test-device",
    },
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.payload.user.displayName, "Ayu Pratama");
  assert.ok(cookie.startsWith("layera_session="));
  assert.ok(csrfToken.length >= 32);

  const initialState = await request("/api/state");
  assert.equal(initialState.response.status, 200);
  assert.deepEqual(initialState.payload.projects, []);
  assert.deepEqual(initialState.payload.library, []);
  assert.equal(initialState.payload.initialized, true);

  const savedState = await request("/api/state", {
    method: "PUT",
    csrf: true,
    body: { projects: [{ id: "project-1", name: "Kampanye Sepatu" }], library: [] },
  });
  assert.equal(savedState.response.status, 200);

  const enhanced = await request("/api/prompt-enhance", {
    method: "POST",
    csrf: true,
    body: { prompt: "Poster sepatu lari ringan untuk pelari pemula", category: "Fashion" },
  });
  assert.equal(enhanced.response.status, 200);
  assert.match(enhanced.payload.prompt, /sepatu lari/i);
  assert.doesNotMatch(enhanced.payload.prompt, /kopi|gula aren/i);

  const mismatchedCategory = await request("/api/prompt-enhance", {
    method: "POST",
    csrf: true,
    body: { prompt: "Software akuntansi sederhana untuk pemilik usaha jasa", category: "Makanan & Minuman" },
  });
  assert.equal(mismatchedCategory.response.status, 200);
  assert.match(mismatchedCategory.payload.prompt, /software akuntansi/i);
  assert.doesNotMatch(mismatchedCategory.payload.prompt, /Tonjolkan produk, bahan|momen konsumsi/i);
  assert.match(mismatchedCategory.payload.prompt, /jangan menggantinya/i);

  const suggestedHeadline = await request("/api/headline-suggest", {
    method: "POST",
    csrf: true,
    body: { prompt: "Software akuntansi sederhana untuk pemilik usaha jasa", category: "Makanan & Minuman", variation: 1 },
  });
  assert.equal(suggestedHeadline.response.status, 200);
  assert.ok(suggestedHeadline.payload.headline.length > 0 && suggestedHeadline.payload.headline.length <= 100);
  assert.doesNotMatch(suggestedHeadline.payload.headline, /kopi|rasa|makanan|minuman/i);

  const profile = await request("/api/account/profile", {
    method: "PUT",
    csrf: true,
    body: { displayName: "Ayu Santoso", email: "ayu.santoso@example.test", currentPassword: "aman-sekali-123" },
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.user.displayName, "Ayu Santoso");
  assert.equal(profile.payload.user.email, "ayu.santoso@example.test");

  const preferences = await request("/api/account/preferences", {
    method: "PUT",
    csrf: true,
    body: {
      defaultFormat: "Instagram Post · 4:5",
      defaultStyle: "Minimal",
      primaryColor: "#112233",
      startView: "dashboard",
    },
  });
  assert.equal(preferences.response.status, 200);

  const usage = await request("/api/usage");
  assert.equal(usage.response.status, 200);
  assert.equal(usage.payload.usage.plan, "free");
  assert.equal(usage.payload.usage.credits.remaining, 11);

  const generation = await request("/api/generate", {
    method: "POST",
    csrf: true,
    body: {
      prompt: "Poster sepatu lari ringan untuk pelari pemula",
      agentIndexes: [0],
      quality: "1mp",
    },
  });
  assert.equal(generation.response.status, 503);
  assert.equal(generation.payload.error, "missing_api_key");

  const password = await request("/api/account/password", {
    method: "PUT",
    csrf: true,
    body: { currentPassword: "aman-sekali-123", newPassword: "lebih-aman-456" },
  });
  assert.equal(password.response.status, 200);
  assert.ok(password.payload.csrfToken);

  const logout = await request("/api/auth/logout", { method: "POST", csrf: true });
  assert.equal(logout.response.status, 200);

  const unauthorized = await request("/api/state");
  assert.equal(unauthorized.response.status, 401);

  const loginWithNewPassword = await request("/api/auth/login", {
    method: "POST",
    body: { email: "ayu.santoso@example.test", password: "lebih-aman-456", deviceId: "test-device" },
  });
  assert.equal(loginWithNewPassword.response.status, 200);
  assert.equal(loginWithNewPassword.payload.user.displayName, "Ayu Santoso");
});
