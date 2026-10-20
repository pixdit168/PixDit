# Layera

Layera membuat gambar kampanye dari prompt pengguna dengan Agent Free atau Agent Pro. Backend meneruskan prompt asli ke model Replicate yang dipilih, ditambah parameter teknis seperti rasio aspek, kualitas, gambar produk, dan logo jika diunggah. AI bebas menentukan komposisi dan warna; pilihan Arah Visual dan Pengaturan Lanjutan tidak lagi tampil.

Paket Gratis dapat membuat satu gambar; pelanggan Pro dapat memilih satu atau sepuluh variasi dari prompt yang sama. Hasil diberi nama netral `Variasi 01` hingga `Variasi 10`. Edit memakai gambar tersimpan sebagai referensi dan instruksi edit pengguna. Proyek baru dapat mengunggah maksimal lima gambar produk dan satu logo. Logo diberikan sebagai referensi terakhir kepada AI tanpa penghapusan latar otomatis. Hasil baru adalah komposisi utuh tanpa lapisan teks/logo tambahan dari browser; poster lama tetap memakai lapisan sebelumnya.

Frontend memakai `index.html`, `public/styles.css`, dan komponen TypeScript terurut di `public/components/`. `public/app.ts` menyediakan helper awal; `tsconfig.browser.json` menggabungkan seluruhnya menjadi satu classic script `public/app.js` saat build. Jangan mengedit JavaScript hasil build secara langsung atau mengubah urutan file komponen tanpa memeriksa inisialisasi browser.

Untuk menjalankan lokal, lihat [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md). Jalankan `npm run check`, `npm test`, dan `npm run build` sebelum mengirim perubahan.
