# 🎮 Panduan Role: Archer (Ranged DPS)

Penyerang jarak jauh konstan dengan DPS fisik stabil. Sangat lincah dan mampu menjaga jarak dari musuh jarak dekat.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Archer** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **240.000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **10%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.025** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **6 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **12.000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **0.64s (40 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **15%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.6x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Ranger.glb berpakaian jubah hijau hutan, memegang busur panah besar (Bow) dengan tas anak panah (Quiver) di punggung.
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Archer** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Double Shot (Single-Target burst)
Memberikan damage fisik beruntun ke satu target dengan jeda tembakan sangat singkat.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 15.000 | Nilai damage / heal dasar |
| **Cooldown** | 6.40s (400 ticks) | Waktu jeda penggunaan kembali |
| **delayBetweenShots** | 120 | Parameter lainnya |


* **Efek Visual**: Archer menembakkan dua anak panah laser kuning bersinar secara cepat berturut-turut.

### ⚡ Evasive Leap (Self-Escape)
Menghindar ke belakang sejauh beberapa unit saat didekati musuh untuk menjaga jarak aman.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 2.5 unit | Jarak efektif area skill |
| **distance** | 4.0 | Parameter lainnya |
| **Cooldown** | 6.08s (380 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Archer melompat mundur secara instan disertai kepulan debu (puff) dan kilatan cahaya putih.

### ⚡ Arrow Volley (Massive AoE)
Memberikan damage fisik area (AoE) yang sangat merusak bagi semua musuh yang berada di dalam radius lingkaran.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 2.5 unit | Jarak efektif area skill |
| **Base Value** | 12.000 | Nilai damage / heal dasar |
| **Cooldown** | 8.80s (550 ticks) | Waktu jeda penggunaan kembali |
| **arrowCount** | 60 | Parameter lainnya |


* **Efek Visual**: Memanggil lingkaran sihir rune emas besar di tanah, lalu menghujani area tersebut dengan 60 anak panah bersinar dari langit.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/8/2026).*
