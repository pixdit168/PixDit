# Pixgin

Pixgin membuat gambar kampanye dari prompt pengguna dengan Agent Free atau Agent Pro. Backend meneruskan prompt asli ke model Replicate yang dipilih, ditambah parameter teknis seperti rasio aspek, kualitas, gambar produk, dan logo jika diunggah. AI bebas menentukan komposisi dan warna; pilihan Arah Visual dan Pengaturan Lanjutan tidak lagi tampil.

Identitas teknis lama untuk cookie, local storage, tabel, dan bucket Supabase sengaja tetap menggunakan nama `layera` agar sesi dan data yang sudah ada tetap kompatibel setelah pergantian merek. Alamat bantuan lama juga tetap aktif sampai alamat Pixgin yang baru dikonfirmasi.

Di Koleksi, centang desain yang ingin dihapus atau gunakan **Pilih semua**, lalu klik **Hapus terpilih**. Konfirmasi menampilkan jumlah desain yang akan dihapus beserta semua versi editnya. Hasil gambar di proyek tetap tersedia. Penghapusan disimpan sekaligus ke akun sebelum kartu dihilangkan; jika penyimpanan gagal, desain dan pilihannya tetap tersedia untuk dicoba kembali. Tidak ada perubahan schema Supabase yang diperlukan.

Paket Gratis dapat membuat satu gambar; pelanggan Pro dapat memilih satu atau sepuluh variasi dari prompt yang sama. Hasil diberi nama netral `Variasi 01` hingga `Variasi 10`. Edit memakai gambar tersimpan sebagai referensi dan instruksi edit pengguna. Proyek baru dapat mengunggah maksimal lima gambar produk dan satu logo. Logo diberikan sebagai referensi terakhir kepada AI tanpa penghapusan latar otomatis. Hasil baru adalah komposisi utuh tanpa lapisan teks/logo tambahan dari browser; poster lama tetap memakai lapisan sebelumnya.

Setiap halaman Pixgin dibuka ulang, sesi sebelumnya diakhiri dan pengguna diminta masuk kembali. Hasil gambar baru disesuaikan dengan rasio poster tanpa memotong konten sumber; jika model menghasilkan rasio yang berbeda, sisi kosong diisi dengan latar buram dari gambar yang sama. Pratinjau juga menampilkan keseluruhan gambar. Hasil lama yang sudah terpotong saat dibuat tidak dapat dipulihkan otomatis dan perlu digenerasi ulang.

Frontend memakai `index.html`, `public/styles.css`, dan komponen TypeScript terurut di `public/components/`. `public/app.ts` menyediakan helper awal; `tsconfig.browser.json` menggabungkan seluruhnya menjadi satu classic script `public/app.js` saat build. Jangan mengedit JavaScript hasil build secara langsung atau mengubah urutan file komponen tanpa memeriksa inisialisasi browser.

Untuk menjalankan lokal, lihat [NODE-DEPLOYMENT.md](NODE-DEPLOYMENT.md). Jalankan `npm run check`, `npm test`, dan `npm run build` sebelum mengirim perubahan.

Pendaftaran baru membutuhkan kode verifikasi email Supabase sebelum pengguna bisa masuk. Sebelum merilis, aktifkan **Confirm email**, pasang template kode, dan konfigurasi SMTP publik sesuai [panduan verifikasi email](supabase/EMAIL-VERIFICATION.md). Tidak memerlukan SQL tambahan; akun lama tetap bisa masuk seperti biasa.
