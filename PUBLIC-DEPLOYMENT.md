# Layera Public Deployment (Node.js)

Layera dijalankan oleh `server.js` dan menggunakan Replicate Flux 2 Pro sebagai satu-satunya provider gambar.

## Arsitektur

```text
Browser -> HTTPS hosting/reverse proxy -> Node.js server.js -> Replicate Flux 2 Pro
                                      -> Supabase Auth + Postgres
                                      -> persistent generated images
```

## Environment wajib

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=8000
PUBLIC_ORIGIN=https://app.domainanda.com
TRUST_PROXY=true
REPLICATE_API_TOKEN=isi_di_environment_vercel
REPLICATE_MODEL=black-forest-labs/flux-2-pro
SUPABASE_URL=https://project-ref-anda.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_key_anda
SUPABASE_SECRET_KEY=isi_secret_server_di_environment_vercel
GENERATED_DIR=/data/generated
```

Masukkan token melalui menu secret/environment milik hosting provider. Jangan commit file `.env`.

## Build dan start

Tanpa Docker:

```text
npm ci
npm start
```

Dengan Docker:

```text
docker build -t layera .
docker run --env-file .env.production -p 8000:8000 -v layera-data:/data layera
```

Pastikan platform menyediakan persistent disk yang dipasang pada `/data`. Replicate menghapus output API setelah waktu terbatas, sehingga Node langsung menyimpan salinannya ke `GENERATED_DIR`.

## Checklist sebelum publik

- Domain publik memakai HTTPS.
- `PUBLIC_ORIGIN` sama persis dengan domain publik, tanpa trailing slash.
- `TRUST_PROXY=true` hanya jika reverse proxy platform mengatur forwarded headers dengan benar.
- `REPLICATE_API_TOKEN` hanya tersimpan sebagai secret server.
- `SUPABASE_SECRET_KEY` hanya tersimpan sebagai secret server dan tidak dikirim ke browser.
- `GENERATED_DIR` berada di persistent disk.
- `GET /api/health` menampilkan `provider: replicate`, model Flux 2 Pro, `database: supabase`, `auth: supabase`, dan `configured: true`.
- Backup Supabase dan hasil gambar dijalankan secara berkala.
- CAPTCHA atau verifikasi email dipasang kembali sebelum peluncuran komersial.

## Batasan private beta

State Layera sudah berada di Supabase Postgres, tetapi adapter saat ini meng-cache satu dokumen JSONB dan ditujukan untuk satu instance Node. Sebelum horizontal scaling, normalisasi state atau tambahkan locking/transaksi, pindahkan file ke private object storage, rate limit ke shared store, dan generation ke background job queue.

Panduan lengkap environment, testing, dan catatan migrasi tersedia di [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md).
