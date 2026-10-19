# Layera

Layera membuat gambar kampanye dari prompt pengguna dengan Agent Free atau Agent Pro. Backend meneruskan prompt asli ke model Replicate yang dipilih, ditambah parameter teknis seperti rasio aspek, kualitas, dan gambar produk jika diunggah. Pilihan gaya dan warna hanya menambahkan petunjuk bila dipilih pengguna.

Paket Gratis dapat membuat satu gambar; pelanggan Pro dapat memilih satu atau sepuluh variasi dari prompt yang sama. Hasil diberi nama netral `Variasi 01` hingga `Variasi 10`. Edit memakai gambar tersimpan sebagai referensi dan instruksi edit pengguna. Teks poster dan logo ditambahkan setelah gambar dihasilkan.

Untuk menjalankan lokal, lihat [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md). Jalankan `npm run check`, `npm test`, dan `npm run build` sebelum mengirim perubahan.
