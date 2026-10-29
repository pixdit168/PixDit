let projects = [];
let libraryItems = [];
let activeProject = null;
let activeLibraryItemId = null;
let activeLibraryPreviewId = null;
let libraryPreviewZoom = 1;
let selectedConcept = null;
let selectedCategory = "Lainnya";
let generatedImages = [];
let generationInProgress = false;
let generationAbortController = null;
let generationCancelRequested = false;
let saveTimer = null;
let accountStateTimer = null;
let accountStateWriteQueue: Promise<void> = Promise.resolve();
let accountStateReady = false;
let accountStateSavedSnapshot = "";
let currentUser = null;
let accountPreferences = null;
let accountMenuTrigger = null;
let apiHealth = { online: false, configured: false, model: null, agents: {} };
let usageState = null;
let selectedGenerationCount = 1;
let selectedAgentTier = "free";
let pendingDeleteProjectId = null;
const selectedLibraryIds = new Set<string>();
let pendingDeleteLibraryIds: string[] = [];
let libraryDeletionInProgress = false;
let csrfToken = "";
let authStartup: Promise<void> = Promise.resolve();
function cloneInspirationProjects() {
  return JSON.parse(JSON.stringify(inspirationProjects));
}

function loadLegacyArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

async function requestJson(path, options: any = {}): Promise<any> {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers,
  });
  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.message || `Permintaan gagal (${response.status}).`) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function getSignupDeviceIdentity() {
  let deviceId = localStorage.getItem("layera_device_id");
  if (!deviceId) {
    deviceId = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("layera_device_id", deviceId);
  }
  const screenValue = globalThis.screen ? `${screen.width}x${screen.height}x${screen.colorDepth}` : "screen-unknown";
  return {
    deviceId,
    deviceFingerprint: [navigator.userAgent, navigator.language, screenValue, Intl.DateTimeFormat().resolvedOptions().timeZone].join("|"),
  };
}

function queueAccountStateWrite(write: () => Promise<void>): Promise<void> {
  const account = currentUser;
  const sessionToken = csrfToken;
  const pendingWrite = accountStateWriteQueue.then(async () => {
    if (!accountStateReady || !account || currentUser !== account || csrfToken !== sessionToken) {
      throw new Error("Sesi akun telah berubah. Silakan coba kembali.");
    }
    await write();
  });
  accountStateWriteQueue = pendingWrite.catch(() => {});
  return pendingWrite;
}

async function persistAccountState() {
  if (!accountStateReady || !currentUser) return false;
  clearTimeout(accountStateTimer);
  const account = currentUser;
  const sessionToken = csrfToken;
  try {
    await queueAccountStateWrite(async () => {
      const snapshot = JSON.stringify({ projects, library: libraryItems });
      await requestJson("/api/state", {
        method: "PUT",
        body: snapshot,
      });
      if (currentUser === account && csrfToken === sessionToken) accountStateSavedSnapshot = snapshot;
    });
    return currentUser === account && csrfToken === sessionToken;
  } catch (error) {
    if (error.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      return false;
    }
    showToast("Penyimpanan tertunda", error.message || "Data akun belum dapat disimpan.", "!");
    return false;
  }
}

function hasUnsavedAccountState() {
  return Boolean(accountStateReady && currentUser && JSON.stringify({ projects, library: libraryItems }) !== accountStateSavedSnapshot);
}

function scheduleAccountStateSave() {
  if (!accountStateReady || !currentUser) return;
  clearTimeout(accountStateTimer);
  accountStateTimer = setTimeout(persistAccountState, 250);
}

function saveProjects() {
  scheduleAccountStateSave();
}

function saveLibrary() {
  updateLibraryCount();
  scheduleAccountStateSave();
}

async function loadAccountState() {
  accountStateReady = false;
  const state = await requestJson("/api/state");
  if (state.initialized) {
    projects = Array.isArray(state.projects) ? state.projects : [];
    libraryItems = Array.isArray(state.library) ? state.library : [];
    accountStateSavedSnapshot = JSON.stringify({ projects, library: libraryItems });
  } else {
    const legacyProjects = loadLegacyArray(LEGACY_STORAGE.projects);
    const legacyLibrary = loadLegacyArray(LEGACY_STORAGE.library);
    projects = legacyProjects || [];
    libraryItems = legacyLibrary || [];
    accountStateReady = true;
    if (await persistAccountState()) {
      localStorage.removeItem(LEGACY_STORAGE.projects);
      localStorage.removeItem(LEGACY_STORAGE.library);
    }
  }
  accountStateReady = true;
}

function updateLibraryCount() {
  const count = libraryItems.length;
  if ($("#library-nav-count")) $("#library-nav-count").textContent = count;
  if ($("#library-count")) $("#library-count").textContent = `${count} desain`;
}

function isSubscriber() {
  return Boolean(usageState?.isPremium || usageState?.isSubscriber || ["premium", "subscriber"].includes(currentUser?.plan));
}

async function refreshUsage() {
  if (!currentUser || window.location.protocol === "file:") return;
  try {
    const data = await requestJson("/api/usage");
    usageState = data.usage;
    currentUser.plan = usageState.plan;
    updatePlanInterface();
  } catch (error) {
    if (error.status === 401) showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
  }
}

function updatePlanInterface() {
  const subscriber = isSubscriber();
  const planLabel = usageState?.planLabel || (subscriber ? "Pixgin Pro" : "Paket Gratis");
  $("#sidebar-plan-name").textContent = planLabel;
  $("#account-menu-plan").textContent = planLabel;
  const generationsRemaining = usageState?.generation?.remaining ?? 1;
  const editsRemaining = usageState?.refinement?.remaining ?? 3;
  $("#sidebar-plan-usage").textContent = subscriber ? "Buat & edit gambar tanpa batas" : `${generationsRemaining} gambar · ${editsRemaining} edit tersisa minggu ini`;
  const progress = $("#plan-card .plan-progress i");
  if (progress) progress.style.width = `${subscriber ? 100 : Math.max(0, Math.min(100, ((generationsRemaining + editsRemaining) / 4) * 100))}%`;
  if (!subscriber && selectedGenerationCount === 10) selectedGenerationCount = 1;
  if (!subscriber && selectedAgentTier === "pro") selectedAgentTier = "free";
  const qualitySelect = $("#quality-select");
  if (qualitySelect) {
    $$("option", qualitySelect).forEach((option) => { option.disabled = !subscriber && option.value !== "1mp"; });
    if (!subscriber && qualitySelect.value !== "1mp") qualitySelect.value = "1mp";
    $("#quality-plan-note").textContent = subscriber ? "Pilih kualitas Standar, Detail, atau Maksimal. Resolusi akhir bergantung pada model." : "Paket Gratis mendukung kualitas Standar.";
  }
  renderGenerationCountSelector();
  renderAgentSelector();
  updateGenerationControls();
}

function updateGenerationControls() {
  const count = selectedGenerationCount === 10 ? 10 : 1;
  const subscriber = isSubscriber();
  const quality = $("#quality-select")?.value || "1mp";
  $("#generate-button-label").textContent = `Buat ${count} gambar`;
  $("#generation-count-plan-note").textContent = subscriber ? `Pixgin Pro: ${count} gambar dipilih` : "Paket gratis: 1 gambar";
  const note = $("#generation-cost-note");
  if (!note) return;
  const qualityLabel = { "1mp": "Standar", "2mp": "Detail", "4mp": "Maksimal" }[quality] || "Standar";
  note.textContent = subscriber ? `${qualityLabel} · tanpa batas` : `Standar · ${usageState?.generation?.remaining ?? 1} gambar dan ${usageState?.refinement?.remaining ?? 3} edit gratis tersisa minggu ini`;
}

function showToast(title, message, icon = "✓") {
  const toast = $("#toast");
  $("span", toast).textContent = icon;
  $("strong", toast).textContent = title;
  $("small", toast).textContent = message;
  toast.classList.add("show");
  const toastFunction = showToast as typeof showToast & { timer?: number };
  clearTimeout(toastFunction.timer);
  toastFunction.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function checkApiHealth() {
  const status = $("#api-status");
  if (!status) return;

  if (window.location.protocol === "file:") {
    apiHealth = { online: false, configured: false, model: null, agents: {} };
    status.className = "private-note api-status offline";
    status.innerHTML = "<span>●</span> Jalankan npm start untuk mengaktifkan AI.";
    return;
  }

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Health check gagal");
    const data = await response.json();
    apiHealth = { online: true, configured: Boolean(data.configured), model: data.model, agents: data.agents || {} };
    editableDesignAvailable=data.editableDesigns?.available===true;
    updateGenerationControls();
    renderAgentSelector();
  } catch {
    apiHealth = { online: false, configured: false, model: null, agents: {} };
    status.className = "private-note api-status offline";
    status.innerHTML = "<span>●</span> Server AI tidak terhubung.";
  }
}

function getUserInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "KN").toUpperCase();
}

function updateUserInterface() {
  if (!currentUser) return;
  const initials = getUserInitials(currentUser.displayName);
  const firstName = currentUser.displayName.trim().split(/\s+/)[0] || "Kreator";
  $("#user-avatar").textContent = initials;
  $("#mobile-avatar").textContent = initials;
  $("#account-menu-avatar").textContent = initials;
  $("#account-menu-mini-avatar").textContent = initials;
  $("#user-name").textContent = currentUser.displayName;
  $("#user-email").textContent = currentUser.email;
  $("#account-menu-name").textContent = currentUser.displayName;
  $("#account-menu-current-name").textContent = currentUser.displayName;
  $("#account-menu-email").textContent = currentUser.email;
  $("#welcome-title").textContent = `Selamat Datang, ${firstName}.`;
}

function setAuthError(message = "") {
  const error = $("#auth-error");
  error.textContent = message;
  error.classList.toggle("is-hidden", !message);
}

let verificationEmail = "";
let verificationResendUntil = 0;
let verificationResendTimer: ReturnType<typeof setTimeout>;

function updateVerificationResend() {
  clearTimeout(verificationResendTimer);
  const remaining = Math.max(0, Math.ceil((verificationResendUntil - Date.now()) / 1000));
  const button = $("#resend-verification");
  button.disabled = remaining > 0;
  button.textContent = remaining ? `Kirim ulang dalam ${remaining} detik` : "Kirim ulang kode";
  if (remaining) verificationResendTimer = setTimeout(updateVerificationResend, 1000);
}

function showEmailVerification(email: string, cooldown = 0) {
  verificationEmail = email;
  $("#verification-email").textContent = email;
  $("#verification-code").value = "";
  $("#verification-status").textContent = "Periksa kotak masuk dan folder spam. Jangan bagikan kode ini kepada siapa pun.";
  if (cooldown) verificationResendUntil = Date.now() + cooldown * 1000;
  updateVerificationResend();
  showAuthMode("verify");
}

function showAuthMode(mode = "login") {
  const registering = mode === "register";
  const verifying = mode === "verify";
  $("#login-heading").classList.toggle("is-hidden", registering || verifying);
  $("#login-form").classList.toggle("is-hidden", registering || verifying);
  $("#register-heading").classList.toggle("is-hidden", !registering);
  $("#register-form").classList.toggle("is-hidden", !registering);
  $("#verification-heading").classList.toggle("is-hidden", !verifying);
  $("#verification-form").classList.toggle("is-hidden", !verifying);
  setAuthError();
  if (!$("#auth-panel").classList.contains("is-hidden")) setTimeout(() => $(verifying ? "#verification-code" : registering ? "#register-name" : "#email").focus(), 50);
}

function openAuthPanel(mode = "login") {
  $("#auth-panel").classList.remove("is-hidden");
  showAuthMode(mode);
}

function closeAuthPanel() {
  $("#auth-panel").classList.add("is-hidden");
  setAuthError();
}

async function clearPreviousSession() {
  try {
    const session = await requestJson("/api/auth/me");
    // Keep the previous session's token local; it must never replace a new login's token.
    await requestJson("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": session.csrfToken || "" } });
  } catch (error) {
    const message = error.status && error.status !== 401 ? error.message : "";
    if (message) {
      // Startup may finish after the user has opened or started filling out a form.
      if ($("#auth-panel").classList.contains("is-hidden")) openAuthPanel();
      setAuthError(message);
    }
  }
}

function showAuthScreen(message = "") {
  if(typeof window!=="undefined")(window as any).PixginDesignEditor?.close(true);
  closeDeleteLibraryModal({ force: true });
  selectedLibraryIds.clear();
  clearTimeout(accountStateTimer);
  accountStateReady = false;
  currentUser = null;
  accountPreferences = null;
  usageState = null;
  csrfToken = "";
  selectedGenerationCount = 1;
  selectedAgentTier = "free";
  projects = [];
  libraryItems = [];
  accountStateSavedSnapshot = "";
  activeProject = null;
  generatedImages = [];
  closeAccountMenu();
  closeAgentMenu();
  closeAllProjectsModal();
  closeHelpModal();
  closeAccountModal();
  $("#app-shell").classList.add("is-hidden");
  $("#auth-screen").classList.remove("is-hidden");
  closeAuthPanel();
  showAuthMode("login");
  if (message) {
    openAuthPanel("login");
    setAuthError(message);
  }
}

async function enterApp(sessionData, { loadState = true } = {}) {
  closeAuthPanel();
  currentUser = sessionData.user;
  csrfToken = sessionData.csrfToken || "";
  accountPreferences = sessionData.preferences || {
    defaultFormat: "Instagram Post · 4:5",
    defaultStyle: "Eksploratif",
    primaryColor: "#5a3529",
    startView: "dashboard",
  };
  updateUserInterface();
  if (loadState) await loadAccountState();
  $("#auth-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  renderProjects();
  renderLibrary();
  renderInspirations();
  updatePlanInterface();
  showView(accountPreferences.startView === "library" ? "library" : "dashboard");
  await refreshUsage();
  checkApiHealth();
}

function populateAccountModal() {
  if (!currentUser) return;
  $("#account-name").value = currentUser.displayName;
  $("#account-email").value = currentUser.email;
  $("#preference-format").value = accountPreferences.defaultFormat;
  $("#preference-style").value = accountPreferences.defaultStyle;
  $("#preference-color").value = accountPreferences.primaryColor;
  $("#preference-start-view").value = accountPreferences.startView;
}

function switchAccountTab(name) {
  $$(".account-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.accountTab === name));
  $$(".account-panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.accountPanel !== name));
}

function closeAccountMenu({ restoreFocus = false } = {}) {
  const popover = $("#account-popover");
  if (!popover) return;
  const trigger = accountMenuTrigger;
  popover.classList.add("is-hidden");
  popover.classList.remove("mobile-anchor");
  popover.setAttribute("aria-hidden", "true");
  ["#profile-button", "#mobile-profile-button"].forEach((selector) => {
    $(selector)?.setAttribute("aria-expanded", "false");
  });
  $("#profile-button")?.classList.remove("menu-open");
  accountMenuTrigger = null;
  if (restoreFocus) trigger?.focus();
}

function toggleAccountMenu(trigger) {
  if (!currentUser) return;
  const popover = $("#account-popover");
  const isOpen = !popover.classList.contains("is-hidden");
  if (isOpen) {
    closeAccountMenu();
    return;
  }

  accountMenuTrigger = trigger;
  popover.classList.toggle("mobile-anchor", trigger.id === "mobile-profile-button");
  popover.classList.remove("is-hidden");
  popover.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");
  if (trigger.id === "profile-button") trigger.classList.add("menu-open");
}

function openAccountModal(tab = "profile") {
  if (!currentUser) return;
  closeAccountMenu();
  populateAccountModal();
  switchAccountTab(tab);
  $("#account-modal").classList.remove("is-hidden");
  const focusTarget = {
    profile: "#account-name",
    preferences: "#preference-format",
    security: "#current-password",
  }[tab];
  setTimeout(() => $(focusTarget || "#account-name").focus(), 60);
}

function closeAccountModal() {
  $("#account-modal")?.classList.add("is-hidden");
  $("#password-form")?.reset();
}

async function performLogout() {
  closeAccountMenu();
  closeAccountModal();
  try {
    clearTimeout(accountStateTimer);
    await persistAccountState();
    await requestJson("/api/auth/logout", { method: "POST" });
  } catch {
    // Sesi lokal tetap ditutup meskipun server sedang tidak tersedia.
  }
  showAuthScreen();
  showToast("Kamu sudah keluar", "Sampai jumpa di sesi kreatif berikutnya.", "→");
}
