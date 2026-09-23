# Layera Node.js + Replicate Flux 2 Pro

Backend aktif Layera adalah `server.js`. Backend ini menyajikan frontend, akun, sesi, proyek, kredit, file hasil, image generation, dan image editing dengan Replicate sebagai satu-satunya provider gambar.

## Menjalankan secara lokal

Gunakan Node.js 20.9 atau lebih baru.

1. Buka file `.env`.
2. Isi token Replicate pada baris berikut:

   ```text
   REPLICATE_API_TOKEN=isi_di_environment_vercel
   ```

3. Jalankan:

   ```text
   npm install
   npm start
   ```

   Pada Windows, setelah dependensi terpasang, `start-node.cmd` juga dapat digunakan sebagai launcher.

4. Buka `http://localhost:8000`.

Token dan secret key hanya dibaca oleh proses Node melalui environment variable atau file `.env` yang diabaikan Git. Jangan menaruhnya di `app.js`, `index.html`, atau repository.

Supabase Auth menangani registrasi, login, perubahan email, nama profil, dan kata sandi. State proyek, kredit, sesi Layera, dan metadata file disimpan di Supabase Postgres. Jalankan `supabase/schema.sql` sekali sebelum server pertama kali dimulai; `npm run configure:supabase` dapat melakukan setup awal bila `SUPABASE_ACCESS_TOKEN` dan `SUPABASE_PROJECT_REF` diberikan hanya pada proses tersebut.

## Integrasi Flux 2 Pro

Model default adalah `black-forest-labs/flux-2-pro`. Layera mengirim `prompt`, aspect ratio, resolusi 1/2/4 MP, output JPG, dan safety tolerance. Untuk edit, gambar Library diperkecil terlebih dahulu menjadi sekitar 1 MP dan di bawah 1 MB, kemudian dikirim melalui `input_images` sebagai data URI.

Hasil dari Replicate langsung diunduh ke `GENERATED_DIR`. Ini wajib karena file prediction API Replicate tidak disimpan permanen oleh Replicate.

## Environment production

Atur variabel berikut melalui secret/environment settings milik hosting provider:

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

`PUBLIC_ORIGIN` wajib pada production dan harus sama persis dengan origin browser. Gunakan HTTPS. `TRUST_PROXY=true` hanya bila aplikasi benar-benar berada di belakang reverse proxy milik platform hosting.

`SUPABASE_SECRET_KEY` hanya boleh tersedia di backend. `GENERATED_DIR` harus menunjuk ke persistent disk/volume; akun, proyek, dan penggunaan tetap berada di Supabase, tetapi file gambar akan hilang ketika container di-redeploy jika direktori ini tidak persisten.

## Deployment dengan Docker

```text
docker build -t layera .
docker run --env-file .env.production -p 8000:8000 -v layera-data:/data layera
```

Jangan memasukkan `.env.production` ke Git. Domain publik sebaiknya masuk melalui HTTPS load balancer atau reverse proxy dari hosting provider.

## Penyimpanan dan batas production

Backend Node memakai Supabase Auth dan Supabase Postgres. State aplikasi saat ini disimpan sebagai satu dokumen JSONB yang di-cache proses Node; konfigurasi ini cocok untuk satu instance/private beta. Untuk banyak instance atau trafik komersial, normalisasi data menjadi tabel per entitas atau tambahkan locking/transaksi, serta pindahkan file hasil ke object storage seperti Supabase Storage/S3/R2.

File database lokal lama tidak lagi dibaca oleh backend Node. `data/node-store.json` hanya dipertahankan sebagai salinan sumber migrasi lokal.

CAPTCHA masih dinonaktifkan sesuai keputusan sebelumnya. Rate limit login/signup, batas akun per perangkat, cookie HttpOnly/SameSite, CSRF, origin check, pembatasan body, dan proteksi file hasil per akun tetap aktif.

## Pemeriksaan

```text
npm run check
npm test
```
