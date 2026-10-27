# Pixgin Canvas

Open **Edit elemen** on a finished result or a saved design in Koleksi. A result is saved to Koleksi before editing so the original remains available. Both new and historical AI-composed posters use this workflow; the generation models and prompts are unchanged.

## Workflow

1. Initially the flattened poster is one **locked** image, not individual objects. You can immediately add editable text or upload a replacement logo/image on top.
2. For embedded objects, choose 4, 6, or 8 layers and click **Pisahkan elemen AI · 3 kredit**. This explicitly calls `qwen/qwen-image-layered` through Replicate. Generation and opening the editor do not trigger this charge. A successful separation consumes one refinement (3 application credits), respecting the Free refinement limit. Saved layers reopen without another prediction or charge.
3. Click an element to select, then drag it. Transparent padding is ignored when selecting. Drag the corner handle to resize proportionally or use properties for independent width/height, rotation, position, and opacity. Use the layer list to reveal/hide or unlock/lock layers, and **Ke depan / Ke belakang** to reorder.
4. Delete an isolated layer, hide it, replace it with native text, or upload a replacement image. Native text supports multiline content, font, size, color, alignment, and bold. Undo/redo retain 40 operations. Arrow keys nudge; Shift+arrow nudges 10 pixels. Delete removes; Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes.
5. **Simpan versi baru** stores a composited preview plus its editable document as a new Koleksi version. The original remains unchanged. Reopen that version to continue editing. PNG export includes the current visible layers, not selection handles. Manual edits, saving, and export do not consume AI credits.

## Reconstruction limitations

- AI decomposition is reconstruction, not recovery of original design files. Fine details can change, objects may remain grouped, and background completion/transparent edges are not guaranteed. Compare with the preserved original before publishing.
- Extracted wording is raster pixels, **not OCR or an editable font**. Select its layer and choose **Ganti elemen ini dengan teks** to hide that layer and type a replacement. If wording remains baked into an inseparable background, deleting another layer cannot remove it. The existing AI refinement feature remains available.
- Old posters' browser text/logo overlays and current grading are composited before separation so they are not silently omitted. New AI-composed posters have no browser overlays.
- Documents allow 32 image/text elements, 8 million canvas pixels (max edge 4096), and 40 undo steps. The existing request and account-state limits still apply. Reduce uploaded asset sizes if saving exceeds those limits.
- Saving is explicit, not a network write per drag. Closing prompts for unsaved changes; navigating away warns about them. Save regularly. A forced logout clears the editor.
- Cancelling aborts the browser request and asks Replicate to cancel after it returns a prediction ID. Completed private assets may remain stored. Failed/cancelled separation does not deduct application credits; Replicate can still bill compute already used.

## Deployment

- Uses existing server-only `REPLICATE_API_TOKEN`. Optional `REPLICATE_LAYER_MODEL=qwen/qwen-image-layered` selects the dedicated adapter; overrides need the same schema, not an arbitrary image model.
- The verified schema takes `image`, `num_layers`, `description: auto`, `go_fast: true`, `output_format: png`, and an enabled safety checker. Outputs are ordered RGBA image layers, not text objects. The adapter waits for terminal success, preserves alpha, checks trusted output hosts, and rejects opaque duplicate posters masquerading as layers.
- `/api/layers/decompose` and `/api/layers/save` require login, same-origin requests, CSRF, and source ownership. Layer PNGs and uploads use the existing private `layera-generated` bucket and authenticated `/generated/*` URLs. Foreign asset URLs, SVG uploads, invalid geometry, and cross-account references are rejected.
- No new SQL, bucket, browser key, or external service is required. Version metadata lives in the existing application JSONB store, with its known multi-instance concurrent-write limitations.
- Automated tests mock provider responses and use memory storage: no paid image generation or production data changes. Run one deliberate live separation after confirming the Vercel token, billing, hosting request-duration limits, and storage configuration. The adapter allows up to 10 minutes; hosting can have a shorter lifetime.

Primary sources: [Replicate schema](https://replicate.com/qwen/qwen-image-layered/api/schema), [Qwen model and limitations](https://github.com/QwenLM/Qwen-Image-Layered).
