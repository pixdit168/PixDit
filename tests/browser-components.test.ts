import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const projectRoot = path.resolve(import.meta.dirname, "..");

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
        classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) },
        setAttribute() {}, focus() {},
      });
    }
    return nodes.get(selector);
  };
  const context = vm.createContext({ fetch, setTimeout: () => 0, clearTimeout() {} });
  vm.runInContext(script, context);
  context.document = { querySelector: node };
  vm.runInContext(`
    currentUser = { id: "user-1" };
    csrfToken = "test-csrf";
    accountStateReady = true;
    projects = [{ id: "project-1", generatedImages: [{ url: "/generated/shared.jpg" }] }];
    libraryItems = [
      { id: "delete-me", projectName: "Kopi", conceptIndex: 0, versions: [{ id: "original", url: "/generated/shared.jpg" }, { id: "edit", url: "/generated/edit.jpg" }] },
      { id: "keep-me", projectName: "Teh", versions: [{ id: "keep", url: "/generated/keep.jpg" }] }
    ];
    renderLibrary = () => updateLibraryCount();
    closeLibraryPreview = () => { activeLibraryPreviewId = null; };
    closeRefineDrawer = () => { activeLibraryItemId = null; };
    showToast = () => {};
  `, context);
  return { context, node };
}

test("confirmed collection deletion persists after queued saves and preserves project images", async () => {
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

  vm.runInContext(`openDeleteLibraryModal("delete-me"); closeDeleteLibraryModal();`, context);
  assert.equal(vm.runInContext("libraryItems.length", context), 2);
  assert.equal(writes.length, 0);

  const autosave = vm.runInContext("persistAccountState()", context);
  await firstWrite;
  vm.runInContext(`activeLibraryItemId = "delete-me"; activeLibraryPreviewId = "delete-me"; openDeleteLibraryModal("delete-me");`, context);
  const deletion = vm.runInContext("deletePendingLibraryItem()", context);
  const laterSave = vm.runInContext("persistAccountState()", context);
  assert.equal(writes.length, 1);
  assert.equal(node("#confirm-delete-library").disabled, true);
  releaseFirst();
  await Promise.all([autosave, deletion, laterSave]);

  assert.deepEqual(writes.map((write) => write.library.map((item: any) => item.id)), [["delete-me", "keep-me"], ["keep-me"], ["keep-me"]]);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(libraryItems.map(item => item.id))", context)), ["keep-me"]);
  assert.equal(vm.runInContext("projects[0].generatedImages[0].url", context), "/generated/shared.jpg");
  assert.equal(vm.runInContext("activeLibraryItemId", context), null);
  assert.equal(vm.runInContext("activeLibraryPreviewId", context), null);
  assert.equal(node("#library-count").textContent, "1 desain");
  assert.equal(node("#delete-library-modal").classList.contains("is-hidden"), true);
});

test("failed collection deletion keeps the item and all versions available for retry", async () => {
  let fail = true;
  const { context, node } = await libraryDeletionContext(async () => ({
    ok: !fail, status: fail ? 500 : 200,
    json: async () => fail ? { message: "Penyimpanan gagal" } : { ok: true },
  }));
  vm.runInContext(`openDeleteLibraryModal("delete-me")`, context);
  await vm.runInContext("deletePendingLibraryItem()", context);
  assert.equal(vm.runInContext("libraryItems.length", context), 2);
  assert.equal(vm.runInContext("libraryItems[0].versions.length", context), 2);
  assert.equal(node("#delete-library-modal").classList.contains("is-hidden"), false);
  assert.equal(node("#delete-library-error").textContent, "Penyimpanan gagal");
  assert.equal(node("#confirm-delete-library").disabled, false);
  fail = false;
  await vm.runInContext("deletePendingLibraryItem()", context);
  assert.equal(vm.runInContext("libraryItems.length", context), 1);
});
