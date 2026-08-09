# 🎮 Panduan Role: Assassin (Glass Cannon / Stealth Burst)

Pembunuh bayangan lincah ber-damage ekstrem. Assassin memprioritaskan musuh ber-HP tipis (Archer/Mage) dan melancarkan burst kritikal mematikan dari belakang.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Assassin** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **210.000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **15%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.055** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **1.2 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **30.000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **0.56s (35 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **40%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.8x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Rogue berpeci gelap tanpa penutup kepala, memegang belati kembar beracun (Twin Daggers) di kedua tangan. Berjalan sangat cepat.
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Assassin** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Shadow Step (Teleport)
Melakukan teleportasi langsung di belakang punggung target terdekat.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 3.0 unit | Jarak efektif area skill |
| **Cooldown** | 5.60s (350 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Assassin menghilang secara instan dan langsung muncul di belakang target disertai kepulan asap hitam.

### ⚡ Backstab (Execution Burst)
Memberikan damage fisik sangat tinggi jika menyerang musuh dari belakang, atau damage sedang jika menyerang dari depan.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 35.000 | Nilai damage / heal dasar |
| **Base Value** | 18.000 | Nilai damage / heal dasar |
| **Cooldown** | 6.72s (420 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Tebasan belati menyilang berkecepatan tinggi membentuk efek tebasan X tajam berwarna ungu-gelap.

### ⚡ Poison Blade (DoT Poison)
Memberikan efek racun (Poison DoT) yang mencicil HP target setiap tick selama durasi racun aktif.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **damagePerTick** | 5000 | Parameter lainnya |
| **Durasi Efek** | 0.48s (30 ticks) | Durasi status buff/debuff |
| **Cooldown** | 8.80s (550 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Belati assassin memicu gelembung racun hijau pekat bersinar redup di tubuh target.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/8/2026).*
