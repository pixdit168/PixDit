import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function authStartupContext(fetch: (...args: any[]) => Promise<any>) {
  const script = await fs.readFile(path.join(projectRoot, "public", "app.js"), "utf8");
  const nodes = new Map<string, any>();
  const node = (selector: string) => {
    if (!nodes.has(selector)) {
      const classes = new Set(["is-hidden"]);
      const listeners = new Map<string, ((event: any) => any)[]>();
      nodes.set(selector, {
        value: "", textContent: "", disabled: false, style: {},
        classList: {
          add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name),
          toggle(name: string, force?: boolean) { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); return enabled; },
        },
        setAttribute() {}, focus() {}, reset() {}, querySelectorAll: () => [],
        addEventListener(type: string, handler: (event: any) => any) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
        dispatch(type: string) { return Promise.all((listeners.get(type) || []).map((handler) => handler({ preventDefault() {}, target: this, currentTarget: this }))); },
      });
    }
    return nodes.get(selector);
  };
  const context = vm.createContext({ fetch, setTimeout: () => 0, clearTimeout() {}, window: { addEventListener() {} }, navigator: { userAgent: "test-browser", language: "id-ID" }, localStorage: { removeItem() {}, getItem: () => "test-device-identity" } });
  // Install the DOM after evaluating, so tests can explicitly start and await bootstrap.
  vm.runInContext(script, context);
  context.document = { querySelector: node, querySelectorAll: () => [], addEventListener() {}, body: { appendChild() {} }, documentElement: { dataset: {} } };
  vm.runInContext(`
    closeDeleteLibraryModal = closeAccountMenu = closeAgentMenu = closeAllProjectsModal = closeHelpModal = closeAccountModal = () => {};
    updateCharacterCount = () => {};
    showToast = () => {};
    enterApp = async (session) => { currentUser = session.user; csrfToken = session.csrfToken; closeAuthPanel(); $("#app-shell").classList.remove("is-hidden"); };
  `, context);
  const startup = vm.runInContext("bootstrap()", context);
  return { context, node, startup };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));
const authResponse = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("website always generates direct posters, including previously opted-in projects", async () => {
  const html = await fs.readFile(path.join(projectRoot, "index.html"), "utf8");
  assert.doesNotMatch(html, /id="generation-mode"|id="generation-wording"|Desain editable/);
  const { context, startup } = await authStartupContext(async () => authResponse(401, {message:"Signed out"}));
  await startup;
  vm.runInContext('activeProject = {id:"old-project",generationMode:"editable",editableGenerationOptIn:true}; editableDesignAvailable = true;', context);
  assert.equal(vm.runInContext("selectedGenerationMode()",context),"poster");
  vm.runInContext('activeProject = {id:"new-project"}; editableDesignAvailable = false;', context);
  assert.equal(vm.runInContext("selectedGenerationMode()",context),"poster");
});

test("usage UI shows remaining credits and Pro generation costs", async () => {
  const { context, node, startup } = await authStartupContext(async () => authResponse(401, {message:"Signed out"}));
  await startup;
  vm.runInContext(`currentUser={plan:"free"};usageState={plan:"free",generation:{remaining:0},refinement:{remaining:3}};updatePlanInterface();`, context);
  assert.match(node("#sidebar-plan-usage").textContent, /11 dari 11 kredit tersisa/);
  assert.match(node("#generation-cost-note").textContent, /0 gambar dan 3 edit/);
  vm.runInContext(`currentUser={plan:"premium"};usageState={plan:"premium",isPremium:true,credits:{limit:200,remaining:146,used:54,unlimited:false}};updatePlanInterface();openUpgradeModal();`, context);
  assert.equal(node("#sidebar-plan-usage").textContent, "146 dari 200 kredit tersisa");
  assert.equal(node("#plan-card .plan-progress i").style.width,"73%");
  assert.match(node("#generation-cost-note").textContent, /2 kredit.*146 tersisa/);
  assert.match(node("#upgrade-modal-message").textContent, /200 kredit per bulan/);
  assert.doesNotMatch(node("#upgrade-modal-title").textContent, /habis/);
  assert.match(node("#upgrade-modal-message").textContent, /Rp139\.000\/bulan/);
});

for (const entryButton of ["#hero-login", "#auth-open"]) {
  test(`${entryButton} opens on the first click and stays open through delayed previous-session logout`, async () => {
    const me = deferred<any>();
    const logout = deferred<any>();
    const calls: any[] = [];
    const { context, node, startup } = await authStartupContext(async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/auth/me") return me.promise;
      if (url === "/api/auth/logout") return logout.promise;
      throw new Error(`Unexpected request ${url}`);
    });
    await node(entryButton).dispatch("click");
    assert.equal(node("#auth-panel").classList.contains("is-hidden"), false);
    await node("#show-register").dispatch("click");
    node("#register-name").value = "Keep this name";
    me.resolve(authResponse(200, { csrfToken: "previous-session-token", user: { id: "old-user" } }));
    await flushMicrotasks();
    assert.equal(calls[1].url, "/api/auth/logout");
    assert.equal(calls[1].options.headers["X-CSRF-Token"], "previous-session-token");
    assert.equal(node("#auth-panel").classList.contains("is-hidden"), false);
    logout.resolve(authResponse(200, { ok: true }));
    await startup;
    assert.equal(node("#auth-panel").classList.contains("is-hidden"), false);
    assert.equal(node("#register-form").classList.contains("is-hidden"), false);
    assert.equal(node("#register-name").value, "Keep this name");
    assert.equal(node("#app-shell").classList.contains("is-hidden"), true);
    assert.equal(vm.runInContext("currentUser", context), null);
    assert.equal(vm.runInContext("csrfToken", context), "");
  });
}

for (const [form, event, route] of [
  ["#login-form", "submit", "/api/auth/login"],
  ["#register-form", "submit", "/api/auth/register"],
  ["#verification-form", "submit", "/api/auth/verify-email"],
  ["#resend-verification", "click", "/api/auth/resend-verification"],
]) {
  test(`${route} waits until old-session cleanup finishes`, async () => {
    const logout = deferred<any>();
    const calls: string[] = [];
    const { context, node, startup } = await authStartupContext(async (url) => {
      calls.push(url);
      if (url === "/api/auth/me") return authResponse(200, { csrfToken: "old-csrf" });
      if (url === "/api/auth/logout") return logout.promise;
      assert.equal(url, route);
      if (route.endsWith("register")) return authResponse(202, { email: "new@example.test", resendAfterSeconds: 60 });
      return authResponse(200, { user: { id: "new-user" }, csrfToken: "new-csrf", resendAfterSeconds: 60 });
    });
    await node("#hero-login").dispatch("click");
    node("#email").value = node("#register-email").value = "new@example.test";
    node("#register-name").value = "New User";
    node("#password").value = node("#register-password").value = node("#register-confirm").value = "test-password";
    node("#verification-code").value = "123456";
    vm.runInContext(`verificationEmail = "new@example.test"`, context);
    const submission = node(form).dispatch(event);
    await flushMicrotasks();
    assert.deepEqual(calls, ["/api/auth/me", "/api/auth/logout"]);
    logout.resolve(authResponse(200, { ok: true }));
    await Promise.all([startup, submission]);
    assert.deepEqual(calls, ["/api/auth/me", "/api/auth/logout", route]);
    if (route.endsWith("login") || route.endsWith("verify-email")) {
      assert.equal(vm.runInContext("csrfToken", context), "new-csrf");
      assert.equal(node("#app-shell").classList.contains("is-hidden"), false);
    }
  });
}

for (const status of [401, 500]) {
  test(`a delayed startup ${status} response does not reset a form opened by the user`, async () => {
    const me = deferred<any>();
    const { node, startup } = await authStartupContext(async () => me.promise);
    await node("#auth-open").dispatch("click");
    await node("#show-register").dispatch("click");
    node("#register-email").value = "keep@example.test";
    me.resolve(authResponse(status, { message: "Temporary account service error" }));
    await startup;
    assert.equal(node("#auth-panel").classList.contains("is-hidden"), false);
    assert.equal(node("#register-form").classList.contains("is-hidden"), false);
    assert.equal(node("#register-email").value, "keep@example.test");
    assert.equal(node("#auth-error").classList.contains("is-hidden"), status === 401);
  });
}

test("a failed previous-session logout preserves the open form and allows a fresh login attempt", async () => {
  const logout = deferred<any>();
  const { node, startup } = await authStartupContext(async (url) => {
    if (url === "/api/auth/me") return authResponse(200, { csrfToken: "old-csrf" });
    if (url === "/api/auth/logout") return logout.promise;
    assert.equal(url, "/api/auth/login");
    return authResponse(200, { user: { id: "new-user" }, csrfToken: "new-csrf" });
  });
  await node("#hero-login").dispatch("click");
  node("#email").value = "keep@example.test";
  node("#password").value = "test-password";
  logout.resolve(authResponse(503, { message: "Try again shortly" }));
  await startup;
  assert.equal(node("#auth-panel").classList.contains("is-hidden"), false);
  assert.equal(node("#email").value, "keep@example.test");
  assert.equal(node("#auth-error").textContent, "Try again shortly");
  await node("#login-form").dispatch("submit");
  assert.equal(node("#app-shell").classList.contains("is-hidden"), false);
});

test("compiled classic browser script preserves image gallery helpers without a DOM", async () => {
  const script = await fs.readFile(path.join(projectRoot, "public", "app.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(script, context);

  const result = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const first = "data:image/png;base64,AA==";
    const second = "data:image/png;base64,AQ==";
    const project = { productImage: first, brandLogos: [first, second] };
    addProductImages(project, [second]);
    setProjectLogoPosition(project, 0, { x: 0.1, y: 0.2, width: 0.2 }, 0);
    setProjectLogoPosition(project, 0, { x: 0.6, y: 0.5, width: 0.2 }, 1);
    const posterBeforeRemoval = getPosterCopy(project);
    removeProductImage(project, 0);
    removeBrandLogo(project, 0);
    return {
      legacyProduct: getProductImages({ productImage: first }),
      legacyLogo: getBrandLogos({ brandLogo: first }),
      legacyPosterLogo: getPosterLogos({ logo: first, logoPosition: { x: 0.2, y: 0.3, width: 0.2 } }),
      posterLogos: posterBeforeRemoval.logos,
      posterMarkup: posterCopyMarkup(posterBeforeRemoval),
      aiPosterMarkup: posterCopyMarkup(getPosterCopy({ name: "Brand lama", brandLogo: first, generatedImages: [{ compositionMode: "ai" }] })),
      remainingProduct: getProductImages(project),
      remainingLogos: getBrandLogos(project),
      remainingLogoPosition: getProjectLogoPosition(project, 0, 0),
      productCard: sourceImageCardMarkup(first, 0, "product"),
      logoCard: sourceImageCardMarkup(second, 1, "logo"),
    };
  })())`, context));

  assert.deepEqual(result.legacyProduct, ["data:image/png;base64,AA=="]);
  assert.deepEqual(result.legacyLogo, ["data:image/png;base64,AA=="]);
  assert.equal(result.legacyPosterLogo[0].image, "data:image/png;base64,AA==");
  assert.deepEqual(result.posterLogos.map((logo: { image: string }) => logo.image), ["data:image/png;base64,AA==", "data:image/png;base64,AQ=="]);
  assert.equal(result.posterLogos[0].position.x, 0.1);
  assert.equal(result.posterLogos[1].position.x, 0.6);
  assert.equal((result.posterMarkup.match(/class="poster-brand-logo"/g) || []).length, 2);
  assert.equal(result.aiPosterMarkup, "");
  assert.deepEqual(result.remainingProduct, ["data:image/png;base64,AQ=="]);
  assert.deepEqual(result.remainingLogos, ["data:image/png;base64,AQ=="]);
  assert.equal(result.remainingLogoPosition.x, 0.6);
  assert.match(result.productCard, />Gambar 1</);
  assert.doesNotMatch(result.productCard, /Referensi visual agent/);
  assert.match(result.logoCard, />Logo 2</);
  assert.match(result.logoCard, /data-remove-brand-logo="1"/);
});

test("new projects accept five product images and one logo while preserving older multi-logo projects", async () => {
  const script = await fs.readFile(path.join(projectRoot, "public", "app.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(script, context);

  const result = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const image = "data:image/png;base64,AA==";
    const project = {};
    addProductImages(project, Array(5).fill(image));
    addBrandLogos(project, [image]);
    let sixthProductError = "";
    let secondLogoError = "";
    try { addProductImages(project, [image]); } catch (error) { sixthProductError = error.message; }
    try { addBrandLogos(project, [image]); } catch (error) { secondLogoError = error.message; }
    return {
      productCount: getProductImages(project).length,
      logoCount: getBrandLogos(project).length,
      legacyLogoCount: getBrandLogos({ brandLogos: [image, image] }).length,
      sixthProductError,
      secondLogoError,
    };
  })())`, context));

  assert.equal(result.productCount, 5);
  assert.equal(result.logoCount, 1);
  assert.equal(result.legacyLogoCount, 2);
  assert.match(result.sixthProductError, /Maksimal 5 gambar produk/);
  assert.match(result.secondLogoError, /Maksimal 1 logo/);
});

async function libraryDeletionContext(fetch: (...args: any[]) => Promise<any>) {
  const script = await fs.readFile(path.join(projectRoot, "public", "app.js"), "utf8");
  const nodes = new Map<string, any>();
  const node = (selector: string) => {
    if (!nodes.has(selector)) {
      const classes = new Set(["is-hidden"]);
      nodes.set(selector, {
        textContent: "", disabled: false,
        classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name), toggle: (name: string, force?: boolean) => { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); return enabled; } },
        setAttribute() {}, focus() {},
      });
    }
    return nodes.get(selector);
  };
  const context = vm.createContext({ fetch, setTimeout: () => 0, clearTimeout() {} });
  vm.runInContext(script, context);
  context.document = { querySelector: node, querySelectorAll: () => [] };
  vm.runInContext(`
    currentUser = { id: "user-1" };
    csrfToken = "test-csrf";
    accountStateReady = true;
    projects = [{ id: "project-1", generatedImages: [{ url: "/generated/shared.jpg" }] }];
    libraryItems = [
      { id: "delete-me", projectName: "Kopi", conceptIndex: 0, versions: [{ id: "original", url: "/generated/shared.jpg" }, { id: "edit", url: "/generated/edit.jpg" }] },
      { id: "delete-too", projectName: "Roti", conceptIndex: 1, versions: [{ id: "bread", url: "/generated/bread.jpg" }] },
      { id: "keep-me", projectName: "Teh", versions: [{ id: "keep", url: "/generated/keep.jpg" }] }
    ];
    renderLibrary = () => { updateLibraryCount(); updateLibrarySelectionInterface(); };
    closeLibraryPreview = () => { activeLibraryPreviewId = null; };
    closeRefineDrawer = () => { activeLibraryItemId = null; };
    showToast = () => {};
  `, context);
  return { context, node };
}

test("account saves stay pending until acknowledged and reload restores saved Koleksi", async () => {
  const gate=deferred<any>();
  let saved:any;
  const {context}=await libraryDeletionContext(async (_url,options)=>{
    if(options.method==="PUT") {
      saved=JSON.parse(options.body);
      return gate.promise;
    }
    return authResponse(200,{...saved,initialized:true});
  });
  vm.runInContext(`accountStateSavedSnapshot=JSON.stringify({projects,library:libraryItems});libraryItems.unshift({id:"new-poster",versions:[{id:"v1",url:"/generated/job/variation-01.png"}]});`,context);
  const saving=vm.runInContext("persistAccountState()",context);
  await flushMicrotasks();
  assert.equal(vm.runInContext("hasUnsavedAccountState()",context),true);
  gate.resolve(authResponse(200,{ok:true}));
  assert.equal(await saving,true);
  assert.equal(vm.runInContext("hasUnsavedAccountState()",context),false);
  vm.runInContext("libraryItems=[];projects=[];",context);
  await vm.runInContext("loadAccountState()",context);
  assert.equal(vm.runInContext("libraryItems[0].id",context),"new-poster");
  assert.equal(vm.runInContext("libraryItems[0].versions[0].url",context),"/generated/job/variation-01.png");
  assert.equal(vm.runInContext("hasUnsavedAccountState()",context),false);
});

test("a failed save retains local Koleksi and reports failure; edits made during a save remain pending", async () => {
  let fail=true;
  const {context}=await libraryDeletionContext(async()=>{
    if(fail)return authResponse(413,{message:"Data proyek akun terlalu besar."});
    vm.runInContext('libraryItems.push({id:"changed-during-save"})',context);
    return authResponse(200,{ok:true});
  });
  assert.equal(await vm.runInContext("persistAccountState()",context),false);
  assert.equal(vm.runInContext("libraryItems.length",context),3);
  assert.equal(vm.runInContext("hasUnsavedAccountState()",context),true);
  fail=false;
  assert.equal(await vm.runInContext("persistAccountState()",context),true);
  assert.equal(vm.runInContext("hasUnsavedAccountState()",context),true);
});

test("confirmed bulk deletion removes only the confirmed selection after queued saves", async () => {
  const writes: any[] = [];
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const firstWrite = new Promise<void>((resolve) => { firstStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const { context, node } = await libraryDeletionContext(async (url, options) => {
    assert.equal(url, "/api/state");
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["X-CSRF-Token"], "test-csrf");
    writes.push(JSON.parse(options.body));
    if (writes.length === 1) { firstStarted(); await firstGate; }
    return { ok: true, json: async () => ({ ok: true }) };
  });

  vm.runInContext(`toggleLibrarySelection("delete-me", true); toggleLibrarySelection("delete-too", true); openDeleteLibraryModal(); closeDeleteLibraryModal();`, context);
  assert.equal(vm.runInContext("libraryItems.length", context), 3);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 2);
  assert.equal(writes.length, 0);

  const autosave = vm.runInContext("persistAccountState()", context);
  await firstWrite;
  vm.runInContext(`activeLibraryItemId = "delete-too"; activeLibraryPreviewId = "delete-me"; openDeleteLibraryModal(); toggleLibrarySelection("keep-me", true);`, context);
  assert.equal(node("#delete-library-title").textContent, "Hapus 2 desain?");
  const deletion = vm.runInContext("deletePendingLibraryItems()", context);
  const laterSave = vm.runInContext("persistAccountState()", context);
  assert.equal(writes.length, 1);
  assert.equal(node("#confirm-delete-library").disabled, true);
  releaseFirst();
  await Promise.all([autosave, deletion, laterSave]);

  assert.deepEqual(writes.map((write) => write.library.map((item: any) => item.id)), [["delete-me", "delete-too", "keep-me"], ["keep-me"], ["keep-me"]]);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(libraryItems.map(item => item.id))", context)), ["keep-me"]);
  assert.equal(vm.runInContext("projects[0].generatedImages[0].url", context), "/generated/shared.jpg");
  assert.equal(vm.runInContext("activeLibraryItemId", context), null);
  assert.equal(vm.runInContext("activeLibraryPreviewId", context), null);
  assert.equal(node("#library-count").textContent, "1 desain");
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify([...selectedLibraryIds])", context)), ["keep-me"]);
  assert.equal(node("#delete-library-modal").classList.contains("is-hidden"), true);
});

test("failed bulk deletion keeps every selected item and its versions available for retry", async () => {
  let fail = true;
  const { context, node } = await libraryDeletionContext(async () => ({
    ok: !fail, status: fail ? 500 : 200,
    json: async () => fail ? { message: "Penyimpanan gagal" } : { ok: true },
  }));
  vm.runInContext(`toggleLibrarySelection("delete-me", true); toggleLibrarySelection("delete-too", true); openDeleteLibraryModal()`, context);
  await vm.runInContext("deletePendingLibraryItems()", context);
  assert.equal(vm.runInContext("libraryItems.length", context), 3);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 2);
  assert.equal(vm.runInContext("libraryItems[0].versions.length", context), 2);
  assert.equal(node("#delete-library-modal").classList.contains("is-hidden"), false);
  assert.equal(node("#delete-library-error").textContent, "Penyimpanan gagal");
  assert.equal(node("#confirm-delete-library").disabled, false);
  fail = false;
  await vm.runInContext("deletePendingLibraryItems()", context);
  assert.equal(vm.runInContext("libraryItems.length", context), 1);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 0);
});

test("collection selection supports select all, clear, stale IDs, and deleting all items in one save", async () => {
  const writes: any[] = [];
  const { context, node } = await libraryDeletionContext(async (_url, options) => {
    writes.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vm.runInContext("updateLibrarySelectionInterface(); openDeleteLibraryModal()", context);
  assert.equal(node("#library-delete-selected").disabled, true);
  assert.equal(vm.runInContext("pendingDeleteLibraryIds.length", context), 0);
  vm.runInContext("selectAllLibraryItems(true)", context);
  assert.equal(node("#library-select-all").checked, true);
  assert.equal(node("#library-selection-count").textContent, "3 dipilih");
  vm.runInContext(`toggleLibrarySelection("keep-me", false); toggleLibrarySelection("missing-id", true); renderLibrary()`, context);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 2);
  assert.equal(node("#library-select-all").indeterminate, true);
  vm.runInContext(`selectedLibraryIds.add("stale-id"); renderLibrary()`, context);
  assert.equal(vm.runInContext("selectedLibraryIds.has('stale-id')", context), false);
  vm.runInContext("selectAllLibraryItems(false)", context);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 0);
  assert.equal(node("#library-delete-selected").disabled, true);
  assert.equal(writes.length, 0);
  vm.runInContext("selectAllLibraryItems(true); openDeleteLibraryModal()", context);
  await vm.runInContext("deletePendingLibraryItems()", context);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].library, []);
  assert.equal(vm.runInContext("libraryItems.length", context), 0);
  assert.equal(vm.runInContext("selectedLibraryIds.size", context), 0);
  assert.equal(node("#library-selection-toolbar").classList.contains("is-hidden"), true);
  assert.equal(node("#library-select-all").indeterminate, false);
});
