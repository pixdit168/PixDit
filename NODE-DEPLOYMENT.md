# Layera Node.js — Replicate + 9Router

Backend aktif Layera adalah `app-backend.js`. Backend menyajikan frontend, akun, sesi, proyek, kredit, file hasil, image generation, dan image editing.

Provider dipilih oleh server berdasarkan plan akun:

- Paket Gratis: 9Router, 1 gambar per permintaan, kualitas 1MP.
- Layera Pro: Replicate Flux 2 Pro, pilihan 1 atau 10 gambar, kualitas 1MP/2MP/4MP.

Strategi visual tetap dibuat beragam di backend. Pengguna tidak lagi memilih agent satu per satu.

## Menjalankan secara lokal

Gunakan Node.js 20.9 atau lebih baru.

1. Salin `.env.example` menjadi `.env` dan isi secret yang diperlukan.
2. Untuk provider gratis, isi `NINEROUTER_IMAGE_MODEL` setelah model ditentukan. API key saja belum cukup karena endpoint 9Router mewajibkan nama model.
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
GENERATED_DIR=/data/generated

REPLICATE_API_TOKEN=secret_replicate
REPLICATE_MODEL=black-forest-labs/flux-2-pro

NINEROUTER_API_KEY=secret_9router
NINEROUTER_URL=https://api.9router.com
NINEROUTER_IMAGE_MODEL=provider/nama-model-gambar

SUPABASE_URL=https://project-ref-anda.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_key_anda
SUPABASE_SECRET_KEY=secret_server_supabase
```

`PUBLIC_ORIGIN` wajib pada production dan harus sama persis dengan origin browser. `TRUST_PROXY=true` hanya digunakan di belakang reverse proxy tepercaya. `GENERATED_DIR` harus menunjuk ke persistent disk/volume.

Model 9Router dapat ditemukan melalui `GET $NINEROUTER_URL/v1/models/image`. Layera mengirim generasi ke endpoint OpenAI-compatible `/v1/images/generations`; nama model sengaja tidak diberi default agar tidak memilih provider yang salah.

## Pemeriksaan

```text
npm run check
npm test
```

`GET /api/health` menampilkan provider yang berlaku untuk akun aktif dan status kedua provider tanpa membocorkan token.
