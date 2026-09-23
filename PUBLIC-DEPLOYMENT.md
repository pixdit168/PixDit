# Layera Public Deployment (Node.js)

## Arsitektur

```text
Browser -> HTTPS hosting -> app-backend.js -> 9Router (Paket Gratis)
                                      |----> Replicate Flux 2 Pro (Layera Pro)
                                      |----> Supabase Auth + Postgres
                                      `----> persistent generated images
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
- `REPLICATE_API_TOKEN`, `NINEROUTER_API_KEY`, dan `SUPABASE_SECRET_KEY` hanya berada di environment server.
- `NINEROUTER_IMAGE_MODEL` sudah diisi dengan model gambar yang dipilih untuk akun gratis.
- `GENERATED_DIR` berada di persistent disk atau hasil dipindahkan ke object storage.
- `GET /api/health` menampilkan provider sesuai plan akun dan `configured: true`.
- Backup Supabase dan hasil gambar dijalankan secara berkala.
- CAPTCHA atau verifikasi email dipasang kembali sebelum peluncuran komersial.

State Layera saat ini di-cache oleh adapter sebagai satu dokumen JSONB dan cocok untuk satu instance/private beta. Sebelum horizontal scaling, normalisasi state atau tambahkan locking/transaksi, pindahkan file ke private object storage, gunakan shared rate-limit store, dan jalankan generation melalui background job queue.

Panduan environment dan testing tersedia di [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md).
