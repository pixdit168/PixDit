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
