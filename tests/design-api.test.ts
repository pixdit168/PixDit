import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

test("Free renews weekly; Pro renews monthly and enforces the 200-credit cap", { timeout: 30_000 }, async (context) => {
  const base = `http://127.0.0.1:${28000 + Math.floor(Math.random() * 1000)}`;
  let output = "";
  const child = spawn(process.execPath, ["--import", "./tests/design-provider-fixture.js", "app-backend.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, NODE_ENV:"test", PIXGIN_USAGE_FIXTURE:"1", HOST:"127.0.0.1", PORT:new URL(base).port, PUBLIC_ORIGIN:base, COOKIE_SECURE:"false", REPLICATE_API_TOKEN:"quota-fixture-only", REPLICATE_FREE_MODEL:"sourceful/riverflow-2.0-pro", REPLICATE_PRO_MODEL:"openai/gpt-image-2" },
    stdio:["ignore","pipe","pipe"],
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill();
    await new Promise<void>(resolve => child.exitCode === null ? child.once("exit", () => resolve()) : resolve());
  });
  let ready = false;
  for (let i=0;i<80;i++) {
    try { ready=(await fetch(base+"/api/health")).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.ok(ready,output);
  const client = () => {
    let cookie="", token="";
    return async (url:string, body?:any) => {
      const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{Origin:base,Cookie:cookie,"X-CSRF-Token":token,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
      if(response.headers.has("set-cookie"))cookie=response.headers.get("set-cookie").split(";",1)[0];
      const data=response.headers.get("content-type")?.includes("ndjson")?(await response.text()).trim().split("\n").map(line=>JSON.parse(line)):await response.json();
      if(data.csrfToken)token=data.csrfToken;
      return {status:response.status,data};
    };
  };
  const signIn=async (request:ReturnType<typeof client>,email:string) => {
    assert.equal((await request("/api/auth/register",{email,displayName:"Quota Test",password:"quota-password-123",deviceId:email})).status,202);
    assert.equal((await request("/api/auth/verify-email",{email,token:"123456"})).status,200);
  };
  const free=client();
  await signIn(free,"free-quota@example.test");
  const renewed=(await free("/api/usage")).data.usage;
  assert.equal(renewed.generation.remaining,1,"last week's generation must not consume this week's allowance");
  assert.equal(renewed.refinement.remaining,3);
  assert.equal(new Date(renewed.generation.resetAt).getUTCDay(),1);
  const input={prompt:"Poster promosi kopi asli dengan suasana pagi",projectName:"Quota",imageCount:1,quality:"1mp"};
  const generated=await free("/api/generate",input);
  assert.equal(generated.status,200,JSON.stringify(generated.data));
  const image=generated.data.find(event=>event.type==="image");
  assert.ok(image?.url);
  assert.equal(generated.data.at(-1).usage.generation.remaining,0);
  assert.equal(generated.data.at(-1).usage.refinement.remaining,3);
  const blocked=await free("/api/generate",input);
  assert.equal(blocked.status,429);
  assert.match(blocked.data.upgradeLabel,/139\.000/);
  const invalid=await free("/api/refine",{sourceUrl:"/generated/not-owned",refinement:"Ganti latar menjadi biru"});
  assert.equal(invalid.status,502);
  assert.equal((await free("/api/usage")).data.usage.refinement.remaining,3,"failed edits must not consume the allowance");
  for(let i=0;i<3;i++) {
    const edit=await free("/api/refine",{sourceUrl:image.url,refinement:"Ganti latar menjadi biru"});
    assert.equal(edit.status,200,JSON.stringify(edit.data));
    assert.equal(edit.data.usage.refinement.remaining,2-i);
    image.url=edit.data.url;
  }
  assert.equal((await free("/api/refine",{sourceUrl:image.url,refinement:"Ganti latar menjadi biru"})).status,429);
  const pro=client();
  await signIn(pro,"pro-quota@example.test");
  const before=(await pro("/api/usage")).data.usage;
  assert.equal(before.credits.used,0,"last month must not consume this month?s 200 credits");
  assert.equal(before.credits.limit,200);
  assert.equal(new Date(before.credits.resetAt).getUTCDate(),1);
  assert.equal(before.credits.unlimited,false);
  assert.equal(before.credits.remaining,200);
  assert.equal(before.generation.exhausted,false);
  assert.equal(before.refinement.exhausted,false);
  let proImage;
  for(let i=0;i<2;i++) {
    const batch=await pro("/api/generate",{...input,imageCount:10,quality:"4mp",agentTier:"pro"});
    assert.equal(batch.status,200,JSON.stringify(batch.data));
    assert.equal(batch.data.at(-1).success,10);
    proImage=batch.data.find(event=>event.type==="image");
  }
  for(let i=0;i<4;i++) assert.equal((await pro("/api/refine",{sourceUrl:proImage.url,agentTier:"pro",refinement:"Ganti latar menjadi biru"})).status,200);
  const after=(await pro("/api/usage")).data.usage;
  assert.equal(after.credits.used,172);
  assert.equal(after.credits.remaining,28);
  const tooExpensive=await pro("/api/generate",{...input,imageCount:10,quality:"4mp",agentTier:"pro"});
  assert.equal(tooExpensive.status,429);
  assert.equal(tooExpensive.data.requiredCredits,80);
  assert.equal(tooExpensive.data.upgradeRequired,false);
  assert.match(tooExpensive.data.message,/200 kredit/);
  assert.equal((await pro("/api/usage")).data.usage.credits.remaining,28);
  for(let i=0;i<3;i++) assert.equal((await pro("/api/generate",{...input,quality:"4mp",agentTier:"pro"})).status,200);
  assert.equal((await pro("/api/generate",{...input,quality:"2mp",agentTier:"pro"})).status,200);
  const exhausted=(await pro("/api/usage")).data.usage;
  assert.equal(exhausted.credits.used,200);
  assert.equal(exhausted.credits.remaining,0);
  assert.equal(exhausted.generation.exhausted,true);
  assert.equal(exhausted.refinement.exhausted,true);
  assert.equal((await pro("/api/generate",input)).status,429);
  assert.equal((await pro("/api/refine",{sourceUrl:proImage.url,refinement:"Ganti latar menjadi biru"})).status,429);
  const historical=client();
  await signIn(historical,"pro-exhausted@example.test");
  const historicalUsage=(await historical("/api/usage")).data.usage;
  assert.equal(historicalUsage.credits.used,240);
  assert.equal(historicalUsage.credits.remaining,0,"existing usage must count without returning negative credits");
  assert.equal((await historical("/api/generate",input)).status,429);
});

test(
  "editable generation, private assets, revisions, versions and legacy import work over HTTP",
  { timeout: 30_000 },
  async (context) => {
    const baseUrl = `http://127.0.0.1:${22000 + Math.floor(Math.random() * 2000)}`;
    let output = "";
    const child = spawn(
      process.execPath,
      ["--import", "./tests/design-provider-fixture.js", "app-backend.js"],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          PORT: new URL(baseUrl).port,
          HOST: "127.0.0.1",
          PUBLIC_ORIGIN: baseUrl,
          COOKIE_SECURE: "false",
          REPLICATE_API_TOKEN: "local-fixture-only",
          REPLICATE_FREE_MODEL: "sourceful/riverflow-2.0-pro",
          REPLICATE_PRO_MODEL: "openai/gpt-image-2",
          REPLICATE_BG_REMOVE_MODEL: "bria/remove-background",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    context.after(async () => {
      if (child.exitCode === null) child.kill();
      await new Promise<void>((resolve) =>
        child.exitCode === null
          ? child.once("exit", () => resolve())
          : resolve(),
      );
    });
    let healthy = false;
    for (let i = 0; i < 80; i++) {
      try {
        healthy = (await fetch(`${baseUrl}/api/health`)).ok;
        if (healthy) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(healthy, output);
    const agent = () => {
      let cookie = "",
        token = "";
      return async (url: string, method = "GET", body?: any, csrf = true) => {
        const response = await fetch(baseUrl + url, {
          method,
          headers: {
            Origin: baseUrl,
            Cookie: cookie,
            ...(csrf ? { "X-CSRF-Token": token } : {}),
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.headers.has("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";", 1)[0];
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("ndjson")
          ? (await response.text())
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : contentType.includes("json")
            ? await response.json()
            : Buffer.from(await response.arrayBuffer());
        if (data.csrfToken) token = data.csrfToken;
        return { status: response.status, data, response };
      };
    };
    const request = agent(),
      outsider = agent();
    const register = async (
      client: ReturnType<typeof agent>,
      email: string,
    ) => {
      assert.equal(
        (
          await client("/api/auth/register", "POST", {
            displayName: "Editor Test",
            email,
            password: "test-password-123",
            deviceId: email,
          })
        ).status,
        202,
      );
      assert.equal(
        (
          await client("/api/auth/verify-email", "POST", {
            email,
            token: "123456",
          })
        ).status,
        200,
      );
    };
    assert.equal((await request("/api/designs/status")).status, 401);
    await register(request, "editor@example.test");
    assert.equal((await request("/api/designs/status")).data.available, true);
    for (const name of ["editor.js", "editor.css"])
      assert.equal((await request(`/${name}`)).status, 200);
    const png = await sharp({
      create: { width: 100, height: 100, channels: 4, background: "#c99aff" },
    })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    assert.equal(
      (await request("/api/design-assets", "POST", { dataUrl }, false)).status,
      403,
    );
    const generated = await request("/api/generate", "POST", {
      prompt: "Iklan kopi premium di studio ungu",
      projectName: "Kopi",
      agentTier: "free",
      creationMode: "product",
      generationMode: "editable",
      productImages: [dataUrl, dataUrl],
      brandLogo: dataUrl,
      imageCount: 1,
      quality: "1mp",
      wording: {
        headline: "Kopi Asli — Rp 12.000!",
        brand: "",
        body: "",
        cta: "",
      },
    });
    assert.equal(generated.status, 200);
    const image = generated.data.find((event) => event.type === "image");
    assert.ok(image?.designId, JSON.stringify(generated.data));
    assert.equal(image.compositionMode, "editable");
    assert.equal(generated.data.at(-1).success, 1);
    const generationCalls = output.split("\n").filter(line => line.includes('"fixture":true')).map(line => JSON.parse(line));
    assert.equal(generationCalls.length, 1, "editable generation creates exactly one image prediction, with no planner");
    assert.match(generationCalls[0].path, /sourceful\/riverflow-2\.0-pro\/predictions$/);

    const document = image.document;
    assert.equal(
      document.objects.filter((node) => node.type === "image").length,
      4,
    );
    assert.deepEqual(
      document.objects
        .filter((node) => node.type === "text")
        .map((node) => node.text),
      ["Kopi Asli — Rp 12.000!"],
    );
    const backgroundCall = output
      .split("\n")
      .find(
        (line) => line.includes('"fixture":true') && line.includes("riverflow"),
      );
    assert.ok(backgroundCall, output);
    assert.equal(JSON.parse(backgroundCall).hasReferences, false);
    const logo = document.objects.find((node) => node.name === "Logo"),
      product = document.objects.find((node) => node.name === "Produk 1");
    const logoUrl = document.assets[logo.assetId].url;
    assert.equal((await outsider(logoUrl)).status, 401);
    await register(outsider, "stranger@example.test");
    assert.equal((await outsider(logoUrl)).status, 404);
    assert.equal(
      (await outsider(`/api/designs/${image.designId}`)).status,
      404,
    );
    const storedLogo = await request(logoUrl);
    assert.deepEqual(storedLogo.data, png);
    assert.equal(
      storedLogo.response.headers.get("cache-control"),
      "private, no-store",
    );
    const preview = await sharp({
      create: {
        width: document.width,
        height: document.height,
        channels: 3,
        background: "#44305d",
      },
    })
      .webp()
      .toBuffer();
    const previewData = `data:image/webp;base64,${preview.toString("base64")}`;
    const original = await request(
      `/api/designs/${image.designId}/preview`,
      "POST",
      { expectedRevision: 1, preview: previewData },
    );
    assert.equal(original.status, 200);
    assert.equal(original.data.version.original, true);
    const beforeUsage = (await request("/api/usage")).data;
    const edited = structuredClone(document);
    edited.objects.find((node) => node.id === logo.id).x += 20;
    edited.objects.find((node) => node.type === "text").text =
      "Teks diubah tanpa AI";
    const saved = await request(`/api/designs/${image.designId}`, "PATCH", {
      expectedRevision: 1,
      document: edited,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.design.revision, 2);
    assert.deepEqual(
      saved.data.design.document.objects.find((node) => node.id === product.id),
      product,
    );
    assert.equal(
      saved.data.design.document.objects.filter((node) => node.id === logo.id)
        .length,
      1,
    );
    assert.equal(
      (
        await request(`/api/designs/${image.designId}`, "PATCH", {
          expectedRevision: 1,
          document,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`/api/designs/${image.designId}`, "PATCH", {
          expectedRevision: 2,
          document: { ...edited, schemaVersion: 9 },
        })
      ).status,
      400,
    );
    const version = await request(
      `/api/designs/${image.designId}/versions`,
      "POST",
      { expectedRevision: 2, preview: previewData },
    );
    assert.equal(version.status, 200);
    assert.equal(version.data.version.number, 2);
    const versions = (await request(`/api/designs/${image.designId}/versions`))
      .data.versions;
    assert.equal(versions.length, 2);
    assert.equal(
      versions[0].document.objects.find((node) => node.id === logo.id).x,
      logo.x,
    );
    assert.equal(
      (
        await request(`/api/designs/${image.designId}`)
      ).data.design.document.objects.find((node) => node.type === "text").text,
      "Teks diubah tanpa AI",
    );
    assert.deepEqual((await request("/api/usage")).data, beforeUsage);
    assert.equal(
      (
        await request(
          `/api/design-assets/${logo.assetId}/remove-background`,
          "POST",
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/generate", "POST", {
          prompt: "Iklan kopi premium poster utuh lengkap",
          projectName: "Kopi",
          imageCount: 1,
          agentTier: "free",
        })
      ).status,
      429,
      "existing free-generation limits still apply",
    );
    const legacy = await outsider("/api/generate", "POST", {
      prompt: "Iklan kopi premium poster utuh lengkap",
      projectName: "Kopi",
      imageCount: 1,
      agentTier: "free",
      compositionMode: "ai",
    });
    assert.equal(legacy.status, 200, JSON.stringify(legacy.data));
    const oldImage = legacy.data.find((event) => event.type === "image");
    assert.ok(oldImage?.url?.startsWith("/generated/"));
    const imported = await outsider("/api/designs", "POST", {
      sourceUrl: oldImage.url,
      title: "Legacy",
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.data.design.document.objects.length, 1);
    assert.equal(imported.data.design.document.objects[0].locked, true);
    assert.equal(
      (await request("/api/designs", "POST", { sourceUrl: oldImage.url }))
        .status,
      404,
    );
    const events = output
      .split("\n")
      .filter((line) => line.includes('"fixture":true'))
      .map((line) => JSON.parse(line));
    assert.equal(
      events.filter((event) => event.path.includes("meta-llama")).length,
      0,
      "generation, manual edits and legacy imports must not call a planner",
    );
  },
);
