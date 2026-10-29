import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const STORE_ROW_ID = "primary";
const DEFAULT_IMAGE_BUCKET = "layera-generated";

export type StoreData = {
  version: number;
  users: Record<string, any>;
  sessions: Record<string, any>;
  usageEvents: any[];
  accountBrands: Record<string, any>;
  signupSignals: any[];
  securityEvents: any[];
  generatedFiles: Record<string, any>;
};

function createEmptyStore(): StoreData {
  return {
    version: 1,
    users: {},
    sessions: {},
    usageEvents: [],
    accountBrands: {},
    signupSignals: [],
    securityEvents: [],
    generatedFiles: {},
  };
}

export function normalizeStore(value: any): StoreData {
  const empty = createEmptyStore();
  const data = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    users: data.users && typeof data.users === "object" ? data.users : empty.users,
    sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : empty.sessions,
    usageEvents: Array.isArray(data.usageEvents) ? data.usageEvents : empty.usageEvents,
    accountBrands: data.accountBrands && typeof data.accountBrands === "object" ? data.accountBrands : empty.accountBrands,
    signupSignals: Array.isArray(data.signupSignals) ? data.signupSignals : empty.signupSignals,
    securityEvents: Array.isArray(data.securityEvents) ? data.securityEvents : empty.securityEvents,
    generatedFiles: data.generatedFiles && typeof data.generatedFiles === "object" ? data.generatedFiles : empty.generatedFiles,
  };
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
}

function operationError(error, fallback) {
  const wrapped = new Error(error?.message || fallback) as Error & { code?: string; status?: number };
  wrapped.code = error?.code || "supabase_error";
  wrapped.status = Number(error?.status) || 500;
  return wrapped;
}

export class SupabaseStore {
  client: any;
  data: StoreData;
  imageBucket: string;
  writeQueue: Promise<any>;
  static async connect({ url, secretKey, imageBucket = process.env.SUPABASE_IMAGE_BUCKET || DEFAULT_IMAGE_BUCKET }) {
    const client = createClient(url, secretKey, clientOptions());
    const { data, error } = await client
      .from("layera_app_store")
      .select("payload")
      .eq("id", STORE_ROW_ID)
      .maybeSingle();
    if (error) throw operationError(error, "Data Pixgin tidak dapat dibaca dari Supabase.");
    const store = new SupabaseStore(client, normalizeStore(data?.payload), imageBucket);
    if (!data) await store.mutate(() => {});
    await store.ensureImageBucket();
    await store.cleanup();
    return store;
  }

  constructor(client, data, imageBucket = DEFAULT_IMAGE_BUCKET) {
    this.client = client;
    this.data = data;
    this.imageBucket = imageBucket;
    this.writeQueue = Promise.resolve();
  }

  async ensureImageBucket() {
    const { data, error } = await this.client.storage.getBucket(this.imageBucket);
    if (data && !error) return;
    const lookupStatuses = [Number(error?.status), Number(error?.statusCode)].filter(Number.isFinite);
    const missingBucket = lookupStatuses.includes(404) || /bucket not found|not found/i.test(error?.message || "");
    if (error && !missingBucket) throw operationError(error, "Penyimpanan gambar Supabase tidak dapat diperiksa.");
    const { error: createError } = await this.client.storage.createBucket(this.imageBucket, {
      public: false,
      fileSizeLimit: 25 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    const createStatuses = [Number(createError?.status), Number(createError?.statusCode)].filter(Number.isFinite);
    if (createError && !createStatuses.includes(409) && !/already exists/i.test(createError.message || "")) {
      throw operationError(createError, "Penyimpanan gambar Supabase tidak dapat dibuat.");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeQueue.then(operation);
    this.writeQueue = pending.catch(() => {});
    return pending;
  }

  private async readSnapshot() {
    const { data, error } = await this.client.from("layera_app_store")
      .select("payload, updated_at").eq("id", STORE_ROW_ID).maybeSingle();
    if (error) throw operationError(error, "Data Pixgin tidak dapat dibaca dari Supabase.");
    return data;
  }

  async refresh() {
    return this.enqueue(async () => {
      const row = await this.readSnapshot();
      this.data = normalizeStore(row?.payload);
    });
  }

  async mutate<T>(mutator: (data: StoreData) => T): Promise<T> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const row = await this.readSnapshot();
        const snapshot = normalizeStore(structuredClone(row?.payload));
        // Callbacks only change this draft: a rejected write never changes the cache.
        const result = mutator(snapshot);
        const updatedAt = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
        const value = { payload: snapshot, updated_at: updatedAt };
        const table = this.client.from("layera_app_store");
        const { data, error } = row
          ? await table.update(value).eq("id", STORE_ROW_ID).eq("updated_at", row.updated_at).select("updated_at").maybeSingle()
          : await table.insert({ id: STORE_ROW_ID, ...value }).select("updated_at").maybeSingle();
        if (error) {
          if (!row && error.code === "23505") continue;
          throw operationError(error, "Data Pixgin tidak dapat disimpan ke Supabase.");
        }
        if (!data) continue; // Another instance won; reapply this mutation to its state.
        this.data = snapshot;
        return result;
      }
      throw Object.assign(new Error("Penyimpanan akun sedang sibuk. Data lokal tetap tersedia; coba simpan lagi."), { statusCode: 409 });
    });
  }

  async replace(value) {
    await this.mutate((data) => Object.assign(data, normalizeStore(value)));
  }

  async cleanup() {
    const now = Date.now();
    const securityCutoff = now - 7 * 24 * 60 * 60 * 1000;
    const signalCutoff = now - 90 * 24 * 60 * 60 * 1000;
    await this.mutate((data) => {
      for (const [tokenHash, session] of Object.entries(data.sessions)) {
        if (!session?.expiresAt || Date.parse(session.expiresAt) <= now) delete data.sessions[tokenHash];
      }
      data.securityEvents = data.securityEvents.filter((event) => Date.parse(event.createdAt) >= securityCutoff);
      data.signupSignals = data.signupSignals.filter((signal) => Date.parse(signal.createdAt) >= signalCutoff);
    });
  }

  async saveImage(id, userId, buffer, mimeType) {
    const objectPath = `${userId}/${id}`;
    const { error } = await this.client.storage
      .from(this.imageBucket)
      .upload(objectPath, buffer, { contentType: mimeType, cacheControl: "31536000", upsert: true });
    if (error) throw operationError(error, "Gambar tidak dapat disimpan ke Supabase Storage.");
  }

  async getImage(id, userId) {
    if (!userId) return null;
    const objectPath = `${userId}/${id}`;
    const { data, error } = await this.client.storage.from(this.imageBucket).download(objectPath);
    if (error || !data) return null;
    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      mimeType: data.type || "image/jpeg",
      userId,
    };
  }
}

export class SupabaseAuth {
  url: string;
  publishableKey: string;
  admin: any;
  constructor({ url, publishableKey, secretKey }) {
    this.url = url;
    this.publishableKey = publishableKey;
    this.admin = createClient(url, secretKey, clientOptions());
  }

  createPublicClient() {
    return createClient(this.url, this.publishableKey, clientOptions());
  }

  // Website signup must use Supabase's confirmation flow, not admin auto-confirm.
  async signUp({ email, password, displayName }) {
    const { data, error } = await this.createPublicClient().auth.signUp({
      email, password, options: { data: { display_name: displayName } },
    });
    if (error) throw operationError(error, "Email verifikasi belum dapat dikirim. Coba lagi nanti.");
    if (!data.user || data.user.identities?.length === 0) {
      throw operationError({ code: "email_exists", status: 409 }, "Email tersebut sudah terdaftar.");
    }
    return { user: data.user, confirmationRequired: !data.session && !data.user.email_confirmed_at };
  }

  async verifyEmail(email, token) {
    const { data, error } = await this.createPublicClient().auth.verifyOtp({ email, token, type: "email" });
    if (error) throw operationError(error, "Kode tidak valid atau sudah kedaluwarsa.");
    return data.user;
  }

  async resendVerification(email) {
    const { error } = await this.createPublicClient().auth.resend({ type: "signup", email });
    if (error) throw operationError(error, "Email verifikasi belum dapat dikirim ulang.");
  }

  async createUser({ email, password, displayName }) {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw operationError(error, "User tidak dapat dibuat di Supabase Auth.");
    return data.user;
  }

  async deleteUser(userId) {
    const { error } = await this.admin.auth.admin.deleteUser(userId);
    if (error) throw operationError(error, "User Supabase tidak dapat dihapus.");
  }

  async signIn(email, password) {
    const client = this.createPublicClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw operationError(error, "Email atau kata sandi tidak cocok.");
    return data.user;
  }

  async updateUser(userId, attributes) {
    const { data, error } = await this.admin.auth.admin.updateUserById(userId, attributes);
    if (error) throw operationError(error, "Detail login tidak dapat diperbarui di Supabase Auth.");
    return data.user;
  }

  async findUserByEmail(email) {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await this.admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw operationError(error, "Daftar user Supabase tidak dapat dibaca.");
      const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (match) return match;
      if (data.users.length < 1000) return null;
    }
    return null;
  }
}

export class MemoryStore {
  data: StoreData;
  images: Map<string, any>;
  constructor() {
    this.data = createEmptyStore();
    this.images = new Map();
  }

  async mutate(mutator) {
    return mutator(this.data);
  }

  async persist() {}

  async saveImage(id, userId, buffer, mimeType) {
    this.images.set(id, { buffer, mimeType, userId });
  }

  async getImage(id, userId = "") {
    const image = this.images.get(id) || null;
    return image && (!userId || image.userId === userId) ? image : null;
  }
}

export class MemoryAuth {
  users: Map<string, any>;
  pendingCodes = new Map<string, { token: string; expiresAt: number }>();
  // This adapter is instantiated only by NODE_ENV=test. Never used for real email.
  testOtp = "123456";
  constructor() {
    this.users = new Map();
  }

  async createUser({ email, password, displayName }) {
    if ([...this.users.values()].some((user) => user.email === email)) {
      const error = new Error("Email tersebut sudah terdaftar.") as Error & { code?: string };
      error.code = "email_exists";
      throw error;
    }
    const user = { id: randomUUID(), email, password, email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: displayName } };
    this.users.set(user.id, user);
    return user;
  }

  async signUp(input) {
    const user = await this.createUser(input);
    user.email_confirmed_at = null;
    await this.resendVerification(user.email);
    return { user, confirmationRequired: true };
  }

  async resendVerification(email) {
    const user = await this.findUserByEmail(email);
    if (user && !user.email_confirmed_at) this.pendingCodes.set(email, { token: this.testOtp, expiresAt: Date.now() + 10 * 60_000 });
  }

  async verifyEmail(email, token) {
    const code = this.pendingCodes.get(email);
    if (!code || code.token !== token || code.expiresAt <= Date.now()) throw new Error("Kode tidak valid atau sudah kedaluwarsa.");
    this.pendingCodes.delete(email);
    const user = await this.findUserByEmail(email);
    user.email_confirmed_at = new Date().toISOString();
    return user;
  }

  async deleteUser(userId) {
    this.users.delete(userId);
  }

  async signIn(email, password) {
    const user = [...this.users.values()].find((candidate) => candidate.email === email && candidate.password === password);
    if (!user) throw new Error("Email atau kata sandi tidak cocok.");
    if (!user.email_confirmed_at) throw operationError({ code: "email_not_confirmed", status: 403 }, "Verifikasi email terlebih dahulu.");
    return user;
  }

  async updateUser(userId, attributes) {
    const user = this.users.get(userId);
    if (!user) throw new Error("User tidak ditemukan.");
    if (attributes.password) user.password = attributes.password;
    if (attributes.email) user.email = attributes.email;
    if (attributes.user_metadata) user.user_metadata = { ...user.user_metadata, ...attributes.user_metadata };
    return user;
  }

  async findUserByEmail(email) {
    return [...this.users.values()].find((user) => user.email === email) || null;
  }
}
