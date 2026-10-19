# Agent guide for Layera

This file is for coding agents working in this repository. Read the user's current request first, then inspect the relevant files and `git status` before editing. Preserve unrelated work and explain any consequential assumptions.

## Project at a glance

Layera is an Indonesian-language campaign image generator. It is a TypeScript/Node.js ESM application with a browser frontend, Replicate image generation, and Supabase for authentication, application data, and private generated images. Node.js 20.9 or newer is required.

- `app-backend.ts`: HTTP server and API; authentication, sessions, plans, credits, prompts, generation, refinement, and authenticated image serving.
- `api/index.ts` and `vercel.json`: Vercel entry point and routes. `/generated/*` must reach the backend, not the SPA fallback. `npm run vercel-build` compiles TypeScript and packages only the public assets in ignored `dist/`; Vercel publishes that directory through `@vercel/static-build`.
- `index.html`, `public/app.ts`, `public/components/*.ts`, `public/styles.css`: browser UI and interaction. The ordered component files compile into the same classic `public/app.js`; most user-facing copy is Indonesian.
- `lib/replicate.ts`: Replicate model inputs, polling, image download, reference-image resizing, and prediction cancellation.
- `lib/image-prompt.ts` and `lib/generation-jobs.ts`: prompt-first model instructions and neutral one/ten-image job slots.
- `lib/supabase.ts` and `supabase/schema.sql`: Supabase Auth, application state, and the private `layera-generated` Storage bucket.
- `tests/`: backend contracts, model adapter, prompt-first generation jobs, and storage tests.
- `README.md`, `.env.example`, `NODE-DEPLOYMENT.md`, `PUBLIC-DEPLOYMENT.md`: project overview, configuration, and deployment guidance.

## Current behavior to preserve

- Agent Free uses `sourceful/riverflow-2.0-pro`; Agent Pro uses `openai/gpt-image-2`. The environment overrides are `REPLICATE_FREE_MODEL` and `REPLICATE_PRO_MODEL`. The UI labels are Agent Free and Agent Pro.
- Image generation passes the user's original prompt first, with only explicitly selected optional style/color hints. Ten-image jobs use the same prompt and neutral `Variasi 01`–`Variasi 10` labels; no behavioral creative agents are involved.
- Image refinement uses the stored source image and the user's edit request, not historical creative-agent metadata. Older projects may retain that metadata without affecting new generation or editing.
- Free accounts may generate one image at the standard quality tier per request. Subscribers may choose one or ten images and the standard, detail, or maximum quality tiers. The internal tier keys remain `1mp`, `2mp`, and `4mp`; actual pixel dimensions depend on the selected model. Keep plan and credit enforcement on the server.
- Users may start from a written prompt or upload up to three product images. The browser resizes each image, and the server normalizes them again before sending all references to image-capable Replicate models. `prunaai/z-image-turbo` is text-only; product-image mode must clearly reject it rather than silently ignoring references.
- Generated images are stored in a private Supabase Storage bucket and served through authenticated `/generated/*` requests. Edits read their source image from that storage, not a local directory.
- The Generate progress panel has a Cancel button. Browser cancellation aborts the request; after Replicate returns a prediction ID, the adapter requests cancellation from Replicate. Results completed before cancellation can remain available.
- Poster text and all uploaded brand logos (up to three) are added by the app after the image is generated. Each logo has an independent position and size, and its light/dark backing is chosen from local pixel contrast, not a separate AI call. Do not silently put default brand text into a user's blank fields.

## Local workflow

1. Inspect `git status --short` and the relevant code before changing it. Do not discard user changes.
2. Copy `.env.example` to `.env` only when local configuration is needed. Keep real keys in `.env` or the hosting environment; never commit or print them.
3. Run `npm install` if dependencies are missing; installation builds TypeScript automatically. Use `npm start` for a local server or `npm run dev` to watch TypeScript and restart the server. The default origin is `http://localhost:8000`; the local `.env` may set another port.
4. Edit `.ts`/`.mts` sources, never generated `.js`/`.mjs` output. `npm run build` emits Node output beside its source and bundles ordered `public/components/*.ts` into `public/app.js`; generated JavaScript is ignored by Git. Run `npm run check` and `npm test` after code changes. Add or update focused tests for behavior that can regress, especially generation, cancellation, plan enforcement, and storage.
   The browser build intentionally keeps `public/app.js` a non-module, non-strict classic script; preserve the order in `tsconfig.browser.json` and do not remove that compatibility setting without checking browser behavior.
5. For a live Supabase Storage check, `npm run verify:supabase-storage` uploads a temporary image, verifies the downloaded bytes, then removes that test object. Use it only when a live external check is appropriate.

## Deployment and data cautions

- Vercel environment variables are separate from the local `.env`. A local setting change does not update the deployed site.
- `SUPABASE_SECRET_KEY` and `REPLICATE_API_TOKEN` are server-only. Never expose them in HTML, frontend JavaScript, logs, screenshots, or commits.
- `supabase/schema.sql` sets up the application table and private image bucket. Review existing project state before running migration scripts or changing production data.
- The Supabase application state currently lives in one JSONB document and is cached by the server adapter. Take care with concurrent writes; do not assume it is ready for broad horizontal scaling.
- Avoid real Replicate generations in tests unless the user specifically requests a live check; they may consume credits. Prefer mocked provider responses for routine verification.
- Do not push, deploy, change hosted environment variables, or modify live account data unless the user has requested that action.
