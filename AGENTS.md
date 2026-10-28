# Agent guide for Pixgin

This file is for coding agents working in this repository. Read the user's current request first, then inspect the relevant files and `git status` before editing. Preserve unrelated work and explain any consequential assumptions.

## Project at a glance

Pixgin is an Indonesian-language campaign image generator. It is a TypeScript/Node.js ESM application with a browser frontend, Replicate image generation, and Supabase for authentication, application data, and private generated images. Node.js 20.9 or newer is required.

- `app-backend.ts`: HTTP server and API; authentication, sessions, plans, credits, prompts, generation, refinement, and authenticated image serving.
- `api/index.ts` and `vercel.json`: Vercel entry point and routes. `/generated/*` must reach the backend, not the SPA fallback. `npm run vercel-build` compiles TypeScript and packages only the public assets in ignored `dist/`; Vercel publishes that directory through `@vercel/static-build`.
- `index.html`, `public/app.ts`, `public/components/*.ts`, `public/styles.css`: browser UI and interaction. The ordered component files compile into the same classic `public/app.js`; most user-facing copy is Indonesian.
- `lib/replicate.ts`: Replicate model inputs, polling, image download, reference-image resizing, and prediction cancellation.
- `editor/`: lazy React/react-konva editor; its CSS is scoped to the editor. `shared/design-document.ts` is the framework-independent schema and history reducer. `lib/design-ai.ts`, `lib/design-store.ts`, and `lib/design-api.ts` supply planning, private assets, CAS saves, and immutable versions. Setup: `supabase/designs.sql` and `supabase/EDITABLE-DESIGNS.md`.
- `shared/design-layers.ts`: dynamic layer traversal and nested operations, inherited locks/visibility, grouping, and editable badge/sticker presets. Do not impose a fixed object count; retain document-byte, nesting-depth, artboard, and asset validation limits. Layer arrays define sibling stacking order. Selection must exclude descendants of selected ancestors when transforming a group.
- `lib/image-prompt.ts` and `lib/generation-jobs.ts`: prompt-first model instructions and neutral one/ten-image job slots.
- `lib/supabase.ts` and `supabase/schema.sql`: Supabase Auth, application state, and the private `layera-generated` Storage bucket.
- `supabase/EMAIL-VERIFICATION.md` and `supabase/templates/confirm-signup.html`: required hosted email confirmation/SMTP settings and the signup OTP template. Website signup uses public Supabase Auth; only legacy migration uses admin auto-confirm. Never grant pending accounts an app session before OTP verification.
- `tests/`: backend contracts, model adapter, prompt-first generation jobs, and storage tests.
- `README.md`, `.env.example`, `NODE-DEPLOYMENT.md`, `PUBLIC-DEPLOYMENT.md`: project overview, configuration, and deployment guidance.

## Current behavior to preserve

- The user-facing brand is Pixgin. Existing technical identifiers (`layera_session`, `layera_device_id`, `layera_app_store`, and `layera-generated`) remain unchanged for session and stored-data compatibility; do not rename them as part of a visual rebrand.
- Agent Free uses `sourceful/riverflow-2.0-pro`; Agent Pro uses `openai/gpt-image-2`. The environment overrides are `REPLICATE_FREE_MODEL` and `REPLICATE_PRO_MODEL`. The UI labels are Agent Free and Agent Pro.
- Image generation passes the user's original prompt first, with only explicitly selected optional style/color hints. Ten-image jobs use the same prompt and neutral `Variasi 01`–`Variasi 10` labels; no behavioral creative agents are involved.
- Image refinement uses the stored source image and the user's edit request, not historical creative-agent metadata. Older projects may retain that metadata without affecting new generation or editing.
- Free accounts may generate one image at the standard quality tier per request. Subscribers may choose one or ten images and the standard, detail, or maximum quality tiers. The internal tier keys remain `1mp`, `2mp`, and `4mp`; actual pixel dimensions depend on the selected model. Keep plan and credit enforcement on the server.
- Users may start from a written prompt or upload up to five product images. The browser resizes each image, and the server normalizes them again before sending all references to image-capable Replicate models. `prunaai/z-image-turbo` is text-only; product-image mode must clearly reject it rather than silently ignoring references.
- Generated images are stored in a private Supabase Storage bucket and served through authenticated `/generated/*` requests. Edits read their source image from that storage, not a local directory.
- The Generate progress panel has a Cancel button. Browser cancellation aborts the request; after Replicate returns a prediction ID, the adapter requests cancellation from Replicate. Results completed before cancellation can remain available.
- New projects default to editable designs when the new Supabase schema is available: one validated Replicate layout plan, separate supporting artwork, uploaded product/logo assets, native text, and shapes. Explicit wording (including blanks) is authoritative. Poster mode remains a complete AI composition with the logo as the last reference. Old posters import as a single locked background; never automatically extract baked-in objects. Manual editing, autosave, version saves and exports make no AI calls. Optional background removal consumes 3 credits only on success and retains original uploads.
- Design documents/assets/versions live in separate tables, not the cached account JSON. All design APIs require a session, ownership checks and CSRF for mutations. Autosave is revision-checked; preserve local edits on failures/conflicts. Use the same `EditorCanvas` renderer for previews/PNG, awaiting fonts/assets and excluding selection controls. Do not apply the design SQL migration to a hosted database without authorization.
- Loading the website ends any existing server session and presents the login screen; registering or logging in still enters the app in that page load. Generated output is fitted to its requested frame without cropping source pixels, and poster previews use contain. Old files that were previously cropped cannot be reconstructed.

## Local workflow

1. Inspect `git status --short` and the relevant code before changing it. Do not discard user changes.
2. Copy `.env.example` to `.env` only when local configuration is needed. Keep real keys in `.env` or the hosting environment; never commit or print them.
3. Run `npm install` if dependencies are missing; installation builds TypeScript automatically. Use `npm start` for a local server or `npm run dev` to watch TypeScript and restart the server. The default origin is `http://localhost:8000`; the local `.env` may set another port.
4. Edit `.ts`/`.mts` sources, never generated `.js`/`.mjs` output. `npm run build` emits Node output beside its source and bundles ordered `public/components/*.ts` into `public/app.js`; generated JavaScript is ignored by Git. Run `npm run check` and `npm test` after code changes. Add or update focused tests for behavior that can regress, especially generation, cancellation, plan enforcement, and storage.
   The browser build intentionally keeps `public/app.js` a non-module, non-strict classic script; preserve the order in `tsconfig.browser.json` and do not remove that compatibility setting without checking browser behavior.
   The editor has a separate strict TS config and esbuild bundle. `npm run test:editor` runs mocked desktop/mobile Chrome acceptance checks (`CHROME_PATH` can override the executable). Never enable the test preload in production.
5. For a live Supabase Storage check, `npm run verify:supabase-storage` uploads a temporary image, verifies the downloaded bytes, then removes that test object. Use it only when a live external check is appropriate.

## Deployment and data cautions

- Vercel environment variables are separate from the local `.env`. A local setting change does not update the deployed site.
- `SUPABASE_SECRET_KEY` and `REPLICATE_API_TOKEN` are server-only. Never expose them in HTML, frontend JavaScript, logs, screenshots, or commits.
- `supabase/schema.sql` sets up the application table and private image bucket. Review existing project state before running migration scripts or changing production data.
- The Supabase application state currently lives in one JSONB document and is cached by the server adapter. Take care with concurrent writes; do not assume it is ready for broad horizontal scaling.
- Avoid real Replicate generations in tests unless the user specifically requests a live check; they may consume credits. Prefer mocked provider responses for routine verification.
- Do not push, deploy, change hosted environment variables, or modify live account data unless the user has requested that action.
