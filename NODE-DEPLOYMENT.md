# Layera Node.js — Replicate Agents

Backend aktif Layera adalah `app-backend.js`. Backend menyajikan frontend, akun, sesi, proyek, kredit, file hasil, image generation, dan image editing.

Kedua agent berjalan melalui Replicate dan dipilih dari workspace:

- Agent Free: `sourceful/riverflow-2.0-pro`, tersedia untuk semua plan.
- Agent Pro: `black-forest-labs/flux-2-pro`, khusus Layera Pro.
- Paket Gratis: 1 gambar per permintaan dan kualitas 1MP.
- Layera Pro: Agent Free atau Agent Pro, pilihan 1 atau 10 gambar, kualitas 1MP/2MP/4MP.

Pengguna juga dapat memulai sepenuhnya dari prompt atau mengunggah gambar produk. Gambar produk di-resize di browser dan dinormalisasi ulang oleh server sebelum dikirim ke Replicate.

## Menjalankan secara lokal

Gunakan Node.js 20.9 atau lebih baru.

1. Salin `.env.example` menjadi `.env` dan isi secret yang diperlukan.
2. Isi `REPLICATE_API_TOKEN`. Nama model mempunyai default dan dapat diubah melalui `REPLICATE_FREE_MODEL` serta `REPLICATE_PRO_MODEL`.
3. Jalankan:

   ```text
   npm install
   npm start
   ```

4. Buka `http://localhost:8000`.

Token dan secret hanya dibaca oleh proses Node. File `.env` diabaikan Git; jangan menaruh secret di `public/app.js`, `index.html`, atau repository.

Supabase Auth menangani registrasi, login, perubahan email, nama profil, dan kata sandi. State proyek, kredit, sesi Layera, dan metadata file disimpan di Supabase Postgres. Jalankan `supabase/schema.sql` sebelum server pertama kali dimulai.

## Environment production

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=8000
PUBLIC_ORIGIN=https://app.domainanda.com
TRUST_PROXY=true

REPLICATE_API_TOKEN=secret_replicate
REPLICATE_FREE_MODEL=sourceful/riverflow-2.0-pro
REPLICATE_PRO_MODEL=black-forest-labs/flux-2-pro
REPLICATE_TIMEOUT_MS=600000

SUPABASE_URL=https://project-ref-anda.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_key_anda
SUPABASE_SECRET_KEY=secret_server_supabase
SUPABASE_IMAGE_BUCKET=layera-generated
```

`PUBLIC_ORIGIN` wajib pada production dan harus sama persis dengan origin browser. `TRUST_PROXY=true` hanya digunakan di belakang reverse proxy tepercaya. Gambar hasil disimpan privat di Supabase Storage; bucket dibuat otomatis oleh backend bila belum ada.

## Pemeriksaan

```text
npm run check
npm test
```

`GET /api/health` menampilkan status Agent Free dan Agent Pro tanpa membocorkan token. Backend tetap memvalidasi plan meskipun request API dimodifikasi secara manual.
