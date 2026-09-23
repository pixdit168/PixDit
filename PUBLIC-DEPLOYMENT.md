# Layera Public Deployment (Node.js)

## Arsitektur

```text
Browser -> HTTPS hosting -> app-backend.js -> Replicate Agent Free
                                      |----> Replicate Agent Pro (Layera Pro)
                                      |----> Supabase Auth + Postgres
                                      `----> Supabase Storage (private images)
```

Masukkan seluruh secret dari `.env.example` melalui menu environment/secret milik hosting. Jangan mengunggah `.env`.

## Build dan start

```text
npm ci
npm start
```

## Checklist sebelum publik

- Domain memakai HTTPS dan `PUBLIC_ORIGIN` sama persis dengan domain tersebut.
- `TRUST_PROXY=true` hanya bila forwarded headers dikelola reverse proxy tepercaya.
- `REPLICATE_API_TOKEN` dan `SUPABASE_SECRET_KEY` hanya berada di environment server.
- `REPLICATE_FREE_MODEL` dan `REPLICATE_PRO_MODEL` menunjuk ke model yang benar.
- `SUPABASE_IMAGE_BUCKET` mengarah ke bucket privat Supabase Storage (default `layera-generated`).
- `GET /api/health` menampilkan Agent Free dan Agent Pro dengan `configured: true`.
- Backup Supabase dan hasil gambar dijalankan secara berkala.
- CAPTCHA atau verifikasi email dipasang kembali sebelum peluncuran komersial.

State Layera saat ini di-cache oleh adapter sebagai satu dokumen JSONB dan cocok untuk satu instance/private beta. Sebelum horizontal scaling, normalisasi state atau tambahkan locking/transaksi, gunakan shared rate-limit store, dan jalankan generation melalui background job queue.

Panduan environment dan testing tersedia di [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md).
