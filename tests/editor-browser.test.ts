// Optional real-browser acceptance test: npm run test:editor (Chrome required).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { baseObject, type DesignObject } from "../shared/design-document.js";
import { createDecoration, layerEntries } from "../shared/design-layers.js";

const pause = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
test(
  "desktop and mobile editor preserve independent elements, exports and failed/conflicting drafts",
  { timeout: 90_000 },
  async (context) => {
    const chromePath =
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    await fs.access(chromePath);
    const profile = await fs.mkdtemp(
      path.join(os.tmpdir(), "pixgin-editor-browser-"),
    );
    const port = 25000 + Math.floor(Math.random() * 1000),
      debugPort = port + 1000,
      base = `http://127.0.0.1:${port}`;
    const server = spawn(
      process.execPath,
      ["--import", "./tests/design-provider-fixture.js", "app-backend.js"],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          PORT: String(port),
          HOST: "127.0.0.1",
          PUBLIC_ORIGIN: base,
          COOKIE_SECURE: "false",
          REPLICATE_API_TOKEN: "browser-fixture-only",
          REPLICATE_FREE_MODEL: "sourceful/riverflow-2.0-pro",
        },
        stdio: "ignore",
      },
    );
    let ws: WebSocket | undefined, chrome: ReturnType<typeof spawn> | undefined;
    let send: (method: string, params?: any) => Promise<any>;
    context.after(async () => {
      if (ws?.readyState === WebSocket.OPEN) {
        await send("Browser.close").catch(() => {});
        ws.close();
      }
      if (server.exitCode === null) server.kill();
      if (chrome?.exitCode === null) chrome.kill();
      await pause(400);
      const relative = path.relative(os.tmpdir(), profile);
      if (
        !relative.startsWith("..") &&
        path.basename(profile).startsWith("pixgin-editor-browser-")
      )
        await fs.rm(profile, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 300,
        });
    });
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await pause(50);
    }
    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--window-size=1440,1000",
        base,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    let pages: any[] = [];
    for (let i = 0; i < 100; i++) {
      try {
        pages = await (
          await fetch(`http://127.0.0.1:${debugPort}/json`)
        ).json();
        if (pages.some((page) => page.type === "page")) break;
      } catch {}
      await pause(100);
    }
    const page = pages.find((value) => value.type === "page");
    assert.ok(page, "Chrome debugging page not available");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve) =>
      ws.addEventListener("open", () => resolve(), { once: true }),
    );
    let serial = 0;
    const pending = new Map<
        number,
        { resolve: (value: any) => void; reject: (error: any) => void }
      >(),
      exceptions: string[] = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error)
          request?.reject(new Error(JSON.stringify(message.error)));
        else request?.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown")
        exceptions.push(JSON.stringify(message.params.exceptionDetails));
      if (
        message.method === "Runtime.consoleAPICalled" &&
        message.params.type === "error"
      )
        exceptions.push(JSON.stringify(message.params.args));
    });
    send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        ws!.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression: string) => {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const until = async (expression: string) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await pause(80);
      }
      throw new Error(
        "Timed out: " +
          expression +
          "\n" +
          exceptions.join("\n") +
          "\n" +
          (await evaluate(
            "document.querySelector('.design-workspace')?.outerHTML || document.body.innerText.slice(-1000)",
          )),
      );
    };
    const click = async (text: string) => {
      assert.ok(
        await evaluate(
          `(()=>{const button=[...document.querySelectorAll('.pixgin-design-editor button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)return false;button.click();return true;})()`,
        ),
        "Missing enabled button: " + text,
      );
      await pause();
    };
    const setInput = async (selector: string, value: string, blur = true) =>
      evaluate(
        `(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Input missing');const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));${blur ? "input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));" : ""}})()`,
      );
    const screenshot = async (name: string) => {
      if (process.env.PIXGIN_EDITOR_SCREENSHOTS !== "1") return;
      const result = await send("Page.captureScreenshot", { format: "png" });
      const target = path.join(os.tmpdir(), `pixgin-editor-${name}.png`);
      await fs.writeFile(target, Buffer.from(result.data, "base64"));
      console.info(target);
    };
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await until(
      "typeof loadDesignEditor==='function' && document.documentElement.dataset.appReady==='true'",
    );
    const pixel = await sharp({
      create: { width: 100, height: 100, channels: 4, background: "#ed86b9" },
    })
      .png()
      .toBuffer();
    const upload = `data:image/png;base64,${pixel.toString("base64")}`;
    // The normal website path generates a complete image directly and still opens in the layer editor.
    await evaluate(`(async()=>{
      await requestJson('/api/auth/register',{method:'POST',body:JSON.stringify({displayName:'Direct Test',email:'direct@example.test',password:'test-password-123',deviceId:'direct-device'})});
      const session=await requestJson('/api/auth/verify-email',{method:'POST',body:JSON.stringify({email:'direct@example.test',token:'123456'})});await enterApp(session);await checkApiHealth();
      projects=[{id:'direct-project',name:'Direct',category:'Makanan & Minuman',status:'Draf',prompt:'Iklan kopi untuk suasana pagi yang hangat',generationMode:'editable'}];openProject('direct-project');
      if(selectedGenerationMode()!=='poster')throw Error('An inherited planner preference must not run Llama');await startGeneration();
      if(!generatedImages[0]?.url?.startsWith('/generated/')||generatedImages[0]?.designId)throw Error('Default generation must return the direct model image');
      await openDesignForResult(0);const id=getCurrentLibraryVersion(libraryItems[0]).editorDesignId;const design=(await requestJson('/api/designs/'+id)).design;
      if(design.document.objects.length!==1||design.document.objects[0].type!=='image')throw Error('Direct result must import as one flattened image layer');
    })()`);
    await until("document.querySelector('.design-artboard canvas') && !document.querySelector('.design-loading')");
    await evaluate("window.PixginDesignEditor.close(true)");
    await until("!document.querySelector('.pixgin-design-editor')");
    await evaluate("(async()=>{clearTimeout(accountStateTimer);await persistAccountState();await requestJson('/api/auth/logout',{method:'POST'});showAuthScreen();})()");
    await evaluate(`(async()=>{
    await requestJson('/api/auth/register',{method:'POST',body:JSON.stringify({displayName:'Browser Test',email:'browser@example.test',password:'test-password-123',deviceId:'browser-device'})});
    const session=await requestJson('/api/auth/verify-email',{method:'POST',body:JSON.stringify({email:'browser@example.test',token:'123456'})});await enterApp(session);
    window.reviewApi=async(url,method='GET',body)=>{const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;};
    await checkApiHealth();projects=[{id:'browser-project',name:'Kopi',category:'Makanan & Minuman',status:'Draf',prompt:'Iklan kopi dengan dua produk independen',creationMode:'product',productImages:[${JSON.stringify(upload)},${JSON.stringify(upload)}],brandLogos:[${JSON.stringify(upload)}],designWordingManual:true,designWording:{headline:'Kopi Pilihan',brand:'',body:'',cta:''}}];openProject('browser-project');
    if(selectedGenerationMode()!=='poster')throw Error('Direct image generation must be the default');document.querySelector('#generation-mode').value='editable';document.querySelector('#generation-mode').dispatchEvent(new Event('change'));if(!activeProject.editableGenerationOptIn)throw Error('Editable layers must be explicitly enabled');await startGeneration();const image=generatedImages[0];if(!image?.designId||!image.designVersionId)throw Error(JSON.stringify(image));window.reviewImage=image;image.document=(await reviewApi('/api/designs/'+image.designId)).design.document;
    window.reviewEditor=await loadDesignEditor();window.reviewToken=session.csrfToken;await openDesignForResult(0);
  })()`);
    await until(
      "document.querySelector('.design-artboard canvas') && !document.querySelector('.design-loading')",
    );
    const doc = async () =>
      evaluate(
        "reviewApi('/api/designs/'+reviewImage.designId).then(r=>r.design)",
      );
    const initial = await doc();
    const logo = initial.document.objects.find((node) => node.name === "Logo");
    await click("Logo");
    await screenshot("desktop");
    const point = await evaluate(
      `(()=>{const r=document.querySelector('.design-artboard').getBoundingClientRect();return {x:r.left+${logo.x + logo.width / 2}*.5,y:r.top+${logo.y + logo.height / 2}*.5};})()`,
    );
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x - 45,
      y: point.y + 60,
      button: "left",
      buttons: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x - 45,
      y: point.y + 60,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await until(
      "document.querySelector('.design-toolbar [role=status]').textContent==='Draf tersimpan'",
    );
    await pause(1200);
    const moved = await doc();
    assert.notEqual(
      moved.document.objects.find((node) => node.id === logo.id).x,
      logo.x,
    );
    assert.equal(
      moved.document.objects.filter((node) => node.name === "Logo").length,
      1,
    );
    assert.deepEqual(
      moved.document.objects.filter((node) => node.name.startsWith("Produk")),
      initial.document.objects.filter((node) => node.name.startsWith("Produk")),
    );
    await click("Produk 1");
    await evaluate(
      "document.querySelector('[aria-label=\"Pilih Produk 2\"]').click()",
    );
    await click("Grup");
    await pause(1200);
    const grouped = (await doc()).document.objects.find(
      (node) => node.type === "group",
    );
    assert.equal(grouped.children.length, 2);
    await click("Lepas grup");
    await pause(1200);
    assert.deepEqual(
      (await doc()).document.objects
        .filter((node) => node.name.startsWith("Produk"))
        .map((node) => [node.id, node.x, node.y]),
      initial.document.objects
        .filter((node) => node.name.startsWith("Produk"))
        .map((node) => [node.id, node.x, node.y]),
    );
    await click("headline");
    await click("Edit teks di kanvas");
    await setInput(".design-inline-text", "Teks diubah tanpa AI", false);
    await evaluate(
      "document.querySelector('.design-inline-text').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}))",
    );
    await pause(1300);
    assert.equal(
      (await doc()).document.objects.find((node) => node.type === "text").text,
      "Teks diubah tanpa AI",
    );
    await click("Simpan versi");
    await until("document.querySelectorAll('.design-version').length===2");
    const versions = await evaluate(
      "reviewApi('/api/designs/'+reviewImage.designId+'/versions').then(r=>r.versions)",
    );
    assert.equal(
      versions[0].document.objects.find((node) => node.id === logo.id).x,
      logo.x,
    );
    const pngData = await evaluate(
      "reviewEditor.renderPreview(reviewImage.document)",
    );
    const exported = Buffer.from(pngData.split(",")[1], "base64"),
      meta = await sharp(exported).metadata();
    assert.equal(meta.width, 640);
    assert.equal(meta.height, 800);
    assert.equal(
      (await sharp(exported).raw().toBuffer({ resolveWithObject: true })).info
        .channels,
      4,
    );
    // Export with selection is identical to export without selection: no controls are baked in.
    const beforeSelection = await evaluate(
      "reviewApi('/api/designs/'+reviewImage.designId).then(r=>reviewEditor.renderPreview(r.design.document))",
    );
    const sample = async (data: string) => {
      const { data: pixels, info } = await sharp(
        Buffer.from(data.split(",")[1], "base64"),
      )
        .raw()
        .toBuffer({ resolveWithObject: true });
      const offset =
        (Math.round(logo.y + logo.height / 2) * info.width +
          Math.round(logo.x + logo.width / 2)) *
        info.channels;
      return [...pixels.subarray(offset, offset + 3)];
    };
    assert.deepEqual(await sample(pngData), [237, 134, 185]);
    assert.notDeepEqual(
      await sample(beforeSelection),
      [237, 134, 185],
      "moving the logo must clear its original pixels",
    );
    await click("Logo");
    assert.equal(
      await evaluate(
        "reviewApi('/api/designs/'+reviewImage.designId).then(r=>reviewEditor.renderPreview(r.design.document))",
      ),
      beforeSelection,
    );
    // A transient HTTP failure retains the edit and exposes an explicit retry.
    await evaluate(
      "window.reviewFetch=window.fetch;window.fetch=(url,options)=>options?.method==='PATCH'?Promise.resolve(new Response(JSON.stringify({message:'Simulasi offline'}),{status:503,headers:{'Content-Type':'application/json'}})):reviewFetch(url,options)",
    );
    await click("headline");
    await setInput(".design-properties textarea", "Teks lokal tetap aman");
    await until(
      "document.querySelector('.design-toolbar [role=status]').textContent.startsWith('Gagal')",
    );
    await evaluate("window.fetch=reviewFetch");
    await click("Coba simpan lagi");
    await until(
      "document.querySelector('.design-toolbar [role=status]').textContent==='Draf tersimpan'",
    );
    assert.equal(
      (await doc()).document.objects.find((node) => node.type === "text").text,
      "Teks lokal tetap aman",
    );
    // Simulate another browser saving first, then preserve the conflicting local edit.
    await evaluate(
      "(async()=>{const r=await reviewApi('/api/designs/'+reviewImage.designId);await reviewApi('/api/designs/'+reviewImage.designId,'PATCH',{expectedRevision:r.design.revision,document:r.design.document});})()",
    );
    await setInput(".design-properties textarea", "Perubahan saat konflik");
    await until(
      "document.querySelector('.design-toolbar [role=status]').textContent.startsWith('Konflik')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.design-properties textarea').value",
      ),
      "Perubahan saat konflik",
    );
    await click("Simpan salinan");
    await until(
      "document.querySelector('.design-toolbar [role=status]').textContent==='Draf tersimpan'",
    );
    await pause(200);
    assert.equal(
      await evaluate(
        "document.querySelector('.design-toolbar h2').textContent.endsWith('salinan')",
      ),
      true,
    );
    // Mobile: controls stay reachable and touch drag commits a completed edit.
    await evaluate("reviewEditor.close(true)");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await evaluate(
      "reviewEditor.open({designId:reviewImage.designId,csrfToken:reviewToken})",
    );
    await until(
      "document.querySelector('.design-artboard canvas') && !document.querySelector('.design-loading')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.pixgin-design-editor').scrollWidth<=390",
      ),
      true,
    );
    await screenshot("mobile");
    const mobilePoint = await evaluate(
      `(()=>{const r=document.querySelector('.design-artboard').getBoundingClientRect();return{x:r.left+${moved.document.objects.find((node) => node.id === logo.id).x + logo.width / 2}*.25,y:r.top+${moved.document.objects.find((node) => node.id === logo.id).y + logo.height / 2}*.25};})()`,
    );
    await send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...mobilePoint, id: 1 }],
    });
    await pause();
    await send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: mobilePoint.x - 15, y: mobilePoint.y + 20, id: 1 }],
    });
    await pause();
    await send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await pause(1300);
    assert.notEqual(
      (await doc()).document.objects.find((node) => node.id === logo.id).y,
      moved.document.objects.find((node) => node.id === logo.id).y,
    );
    await evaluate("reviewEditor.close(true)");
    await pause();
    await evaluate(
      "reviewEditor.open({designId:reviewImage.designId,csrfToken:reviewToken})",
    );
    await until(
      "document.querySelector('.design-artboard canvas') && !document.querySelector('.design-loading')",
    );
    // A flattened AI image stays one image layer, with a dynamic mixed design above it.
    await evaluate("reviewEditor.close(true)");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    const imageAsset = initial.document.objects.find(
      (node) => node.name === "Logo",
    ).assetId;
    const mixed: DesignObject[] = Array.from({ length: 100 }, (_, i) => {
      const x = (i % 10) * 62 + 2,
        y = Math.floor(i / 10) * 78 + 2,
        id = `mixed-${i}`;
      if (i % 4 === 0)
        return {
          ...createDecoration(
            i % 8 === 0 ? "badge" : "sticker",
            156.25,
            416.667,
            randomUUID,
          ),
          id,
          x,
          y,
          name: `Group ${i}`,
        };
      if (i % 4 === 1)
        return {
          ...baseObject(id, "image", `Photo ${i}`, x, y, 50, 50),
          assetId: imageAsset,
          fit: "contain",
        };
      if (i % 4 === 2)
        return {
          ...baseObject(id, "text", `Text ${i}`, x, y, 50, 50),
          text: `T${i}`,
          fontSize: 12,
          fontFamily: "Arial",
          color: "#ffffff",
        };
      return {
        ...baseObject(id, "shape", `Shape ${i}`, x, y, 50, 50),
        shape: "ellipse",
        fill: "#bb99ff",
      };
    });
    mixed.unshift({
      ...initial.document.objects[0],
      name: "Flattened AI original",
    });
    const total = layerEntries(mixed).length;
    assert.ok(total > 128);
    await evaluate(
      `(async()=>{window.reviewStress=(await reviewApi('/api/designs','POST',{title:'Mixed object acceptance',document:{...reviewImage.document,objects:${JSON.stringify(mixed)}}})).design;window.reviewStressUsage=await reviewApi('/api/usage');window.reviewStressStart=performance.now();await reviewEditor.open({designId:reviewStress.id,csrfToken:reviewToken});})()`,
    );
    await until(
      `document.querySelectorAll('[data-layer-id]').length===${total} && !document.querySelector('.design-loading')`,
    );
    const renderMs = await evaluate("performance.now()-reviewStressStart");
    console.info(
      `Mixed design: ${total} objects rendered in ${Math.round(renderMs)} ms`,
    );
    assert.ok(
      renderMs < 10_000,
      "mixed design should remain usable in a practical browser",
    );
    const row = (id: string, suffix: string) =>
      `[data-layer-id="${id}"] ${suffix}`;
    const rowClick = async (id: string, suffix: string) => {
      await evaluate(
        `document.querySelector(${JSON.stringify(row(id, suffix))}).click()`,
      );
      await pause();
    };
    const stress = () =>
      evaluate("reviewApi('/api/designs/'+reviewStress.id).then(r=>r.design)");
    // Clicking a real canvas object highlights its panel row.
    const hit = await evaluate(
      "(()=>{const r=document.querySelector('.design-artboard').getBoundingClientRect();return {x:r.left+89*.5,y:r.top+27*.5};})()",
    );
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...hit,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...hit,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await until(
      "document.querySelector('[data-layer-id=\"mixed-1\"]').dataset.selected==='true'",
    );
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    // Resize with an actual Transformer handle, then rotate using the property control.
    const resize = await evaluate(
      "(()=>{const r=document.querySelector('.design-artboard').getBoundingClientRect();return{x:r.left+114*.5,y:r.top+52*.5};})()",
    );
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...resize,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: resize.x + 8,
      y: resize.y + 8,
      button: "left",
      buttons: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: resize.x + 8,
      y: resize.y + 8,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await pause(1200);
    const resized = (await stress()).document.objects.find(
      (node) => node.id === "mixed-1",
    );
    assert.ok(resized.scaleX > 1.1, JSON.stringify(resized));
    await setInput(".design-property-grid label:nth-child(5) input", "15");
    await pause(1200);
    const rotated = (await stress()).document.objects.find(
      (node) => node.id === "mixed-1",
    );
    assert.equal(rotated.rotation, 15);
    // Multi-selection dragging moves both independent images by the same artboard delta.
    await rowClick("mixed-5", "input[type=checkbox]");
    const start = await evaluate(
      `(()=>{const r=document.querySelector('.design-artboard').getBoundingClientRect();const angle=${rotated.rotation}*Math.PI/180;return{x:r.left+(${rotated.x}+25*${rotated.scaleX}*(Math.cos(angle)-Math.sin(angle)))*.5,y:r.top+(${rotated.y}+25*${rotated.scaleY}*(Math.sin(angle)+Math.cos(angle)))*.5};})()`,
    );
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...start,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: start.x + 10,
      y: start.y + 10,
      button: "left",
      buttons: 1,
    });
    await pause();
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: start.x + 10,
      y: start.y + 10,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await pause(1200);
    const dragged = (await stress()).document.objects;
    assert.ok(
      Math.abs(
        dragged.find((node) => node.id === "mixed-1").x - rotated.x - 20,
      ) < 1,
    );
    assert.ok(
      Math.abs(
        dragged.find((node) => node.id === "mixed-5").x -
          mixed.find((node) => node.id === "mixed-5").x -
          20,
      ) < 1,
    );
    await rowClick("mixed-3", ".design-layer-select");
    assert.equal(
      await evaluate(
        "document.querySelector('.design-properties h4').textContent",
      ),
      "Shape 3",
    );
    await rowClick("mixed-1", "[aria-label^='Sembunyikan ']");
    assert.equal(
      await evaluate(
        "document.querySelector('[data-layer-id=\"mixed-1\"]').classList.contains('is-muted')",
      ),
      true,
    );
    await rowClick("mixed-1", "[aria-label^='Tampilkan ']");
    await rowClick("mixed-1", ".design-layer-select");
    await rowClick("mixed-1", "[aria-label^='Kunci ']");
    await evaluate(
      "document.querySelector('.pixgin-design-editor').focus();document.querySelector('.pixgin-design-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))",
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('[data-layer-id]').length`),
      total,
    );
    await rowClick("mixed-1", "[aria-label^='Buka kunci ']");
    await rowClick("mixed-1", "[aria-label^='Ubah nama ']");
    await setInput(".design-layer-name", "Photo renamed");
    await rowClick("mixed-1", "[aria-label^='Ke depan ']");
    await pause(1200);
    assert.equal((await stress()).document.objects[3].id, "mixed-1");
    await click("Photo renamed");
    await click("Duplikat");
    assert.equal(
      await evaluate("document.querySelectorAll('[data-layer-id]').length"),
      total + 1,
    );
    await click("Hapus");
    assert.equal(
      await evaluate("document.querySelectorAll('[data-layer-id]').length"),
      total,
    );
    // Nested badge text is editable; a parent's lock also protects its descendants.
    const badge = mixed.find((object) => object.id === "mixed-0"),
      badgeText = badge.children[1];
    await rowClick(badgeText.id, ".design-layer-select");
    await setInput(".design-properties textarea", "Promo editable");
    await rowClick(badge.id, "[aria-label^='Kunci ']");
    assert.equal(
      await evaluate(
        "document.querySelector('.design-properties fieldset').disabled",
      ),
      true,
    );
    await rowClick(badge.id, "[aria-label^='Buka kunci ']");
    await rowClick(badgeText.id, "[aria-label^='Ke belakang ']");
    await pause(1200);
    const persisted = await stress();
    assert.equal(
      persisted.document.objects.find((node) => node.id === badge.id)
        .children[0].text,
      "Promo editable",
    );
    assert.equal(persisted.document.objects[0].name, "Flattened AI original");
    assert.equal(
      persisted.document.objects.filter(
        (node) => node.name === "Flattened AI original",
      ).length,
      1,
    );
    await click("Simpan versi");
    await until("document.querySelectorAll('.design-version').length===2");
    const jpg = await evaluate(
      "reviewApi('/api/designs/'+reviewStress.id).then(r=>reviewEditor.renderPreview(r.design.document,false,'jpeg'))",
    );
    const jpgMeta = await sharp(
      Buffer.from(jpg.split(",")[1], "base64"),
    ).metadata();
    assert.equal(jpgMeta.format, "jpeg");
    assert.equal(jpgMeta.width, 640);
    assert.equal(jpgMeta.height, 800);
    await screenshot("mixed-layers");
    await evaluate("reviewEditor.close(true)");
    await pause();
    await evaluate(
      "reviewEditor.open({designId:reviewStress.id,csrfToken:reviewToken})",
    );
    await until(
      `document.querySelectorAll('[data-layer-id]').length===${total} && !document.querySelector('.design-loading')`,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[data-layer-id=\"mixed-1\"] .design-layer-select').textContent",
      ),
      "Photo renamed",
    );
    assert.deepEqual(
      await evaluate("reviewApi('/api/usage')"),
      await evaluate("reviewStressUsage"),
      "manual layer operations and exports must not consume AI credits",
    );
    assert.equal(exceptions.length, 0, exceptions.join("\n"));
  },
);
