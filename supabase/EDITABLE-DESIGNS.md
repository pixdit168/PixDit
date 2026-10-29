# Setup editor desain Pixgin

Editor baru menyimpan dokumen dan aset terpisah dari JSONB akun. Setup ini diperlukan sekali; server tidak menjalankan migrasi otomatis.

1. Buka proyek Supabase yang digunakan website, lalu **SQL Editor → New query**.
2. Jika proyek baru, jalankan `supabase/schema.sql` lebih dahulu untuk state akun dan bucket privat.
3. Salin seluruh isi [designs.sql](designs.sql), lalu **Run**. Script dibungkus transaksi dan dapat dijalankan ulang. Jangan mengganti atau menghapus tabel lama.
4. Periksa tabel `pixgin_design_assets`, `pixgin_designs`, dan `pixgin_design_versions`. RLS aktif; `anon`/`authenticated` tidak diberi akses langsung. Hanya backend dengan `SUPABASE_SECRET_KEY` mengakses data ini setelah pemeriksaan sesi dan kepemilikan.
5. Tambahkan environment server opsional pada Vercel jika ingin mengganti model hapus latar:

   ```text
   REPLICATE_BG_REMOVE_MODEL=bria/remove-background
   ```

   Model ini memakai `REPLICATE_API_TOKEN` yang sama dengan Agent Free/Pro. Perubahan environment Vercel membutuhkan deployment baru. Jangan menaruh token di frontend.

6. Buka `/api/health`: `editableDesigns.available` harus `true`. Hasil probe disimpan hingga 15 detik. Jika `false`, periksa hasil SQL dan izin key server. Website tetap dapat membuat **Poster utuh**; mode editable mengembalikan error setup tanpa memulai AI.

Dokumen draf memakai revisi yang diperiksa secara atomik saat autosave. Original dan versi tersimpan tidak ditimpa; hanya preview pertama untuk suatu versi yang boleh ditambahkan. Konflik revisi ditampilkan di editor dengan pilihan memuat server atau menyimpan salinan. Tidak perlu mengubah tabel state lama atau menjalankan skrip migrasi akun.

File tetap berada pada bucket privat `layera-generated`. URL `/api/design-assets/:id` memerlukan sesi akun pemilik; URL ini bukan public Storage URL. Dokumen menyimpan ID aset, bukan base64. Penghapusan kartu Koleksi masih menghapus referensi dari Koleksi; dokumen/aset dapat tetap dirujuk proyek dan versi lain, sehingga tidak dihapus fisik secara otomatis.

Mode editable menyusun layer secara lokal dan memanggil model gambar hanya sekali per variasi, tanpa planner Replicate/Llama. Kolom teks eksplisit dipertahankan persis, termasuk kolom kosong. Jika kolom tidak diaktifkan, hanya teks dalam tanda kutip di brief yang dibuat menjadi layer teks; teks lain dapat ditambahkan di editor. `REPLICATE_LAYOUT_MODEL` lama tidak dipakai lagi. Biaya kredit aplikasi untuk generate tetap mengikuti kualitas/jumlah yang sudah ada. Biaya provider mencakup gambar latar dan proses AI yang dibatalkan. Edit manual, simpan, preview, dan ekspor tidak memanggil AI. Hapus latar bersifat opsional, memerlukan konfirmasi pengguna, dan memakai 3 kredit aplikasi saat berhasil. Upload asli tetap tersedia untuk dipulihkan.

Default website adalah **Poster utuh**, yang langsung memakai Agent Free/Pro tanpa Llama/planner. Pengguna harus memilih mode editable secara eksplisit untuk alur editable di atas. Layer editor tetap bisa dipakai pada Poster utuh setelah setup tabel desain, dengan gambar asli sebagai satu layer.

Pengujian rutin memakai provider mock. Setup hosted ini dan kualitas visual model nyata belum diverifikasi melalui generasi berbayar; lakukan pemeriksaan live terpisah bila diperlukan.
