# 🎮 Panduan Role: Healer (Acolyte / Support)

Unit pendukung murni (support) yang berfokus memulihkan HP teman, memberikan perlindungan kekebalan, dan meningkatkan daya tahan garis depan.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Healer** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **180.000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **5%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.024** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **22 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **3.000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **1.20s (75 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **5%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.5x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🗡️ Counter & Sinergi

> Bagian ini menjelaskan hubungan taktis antar unit: siapa yang dilawan, siapa yang melawan, dan siapa teman satu tim terbaik — berdasarkan logika targeting engine dan mekanik skill.

| Hubungan | Unit | Alasan |
| :--- | :--- | :--- |
| ⚔️ Counter | — | Tidak ada counter spesifik |
| **🛡️ Di-counter** | **Assassin** | Target prioritas HP terendah. Backstab bunuh sebelum Divine Shield aktif. |
| **🛡️ Di-counter** | **Gunslinger** | High Noon burst sebelum heal sempat cast. Fan Fire bersihkan area. |
| **🤝 Sinergi** | **Barbarian** | Barbarian HP 500K + Healer = regenerasi massive. Divine Shield prevent burst. |
| **🤝 Sinergi** | **Knight** | Kombinasi tank terkuat. Knight armor 35% + heal = wall tak tertembus. |
| **🤝 Sinergi** | **Archer** | Healer proteksi Archer dari dive Assassin. Archer cover Healer dari jarak jauh. |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Mage/Acolyte berjubah putih salju dengan garis emas bersinar, memegang buku mantra terbuka (Spellbook) dan tongkat penyembuh.
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Healer** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Rejuvenation (Single-Target Heal)
Memulihkan HP target dalam jumlah besar secara instan.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 45.000 | Nilai damage / heal dasar |
| **Cooldown** | 4.80s (300 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Menyorotkan pilar sinar hijau zamrud ke arah teman yang terluka disertai bintang penyembuh melayang naik.

### ⚡ Divine Shield (Immunity Shield)
Memberikan status kebal/pengurangan damage drastis pada teman satu tim selama durasi tertentu.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Cooldown** | 6.40s (400 ticks) | Waktu jeda penggunaan kembali |
| **Durasi Efek** | 1.28s (80 ticks) | Durasi status buff/debuff |


* **Efek Visual**: Memasang perisai tabung cahaya kuning emas berkilau mengelilingi tubuh target.

### ⚡ Holy Sanctuary (Mass AoE Heal)
Menyembuhkan hingga 5 teman satu tim yang berada di dalam area lingkaran secara bersamaan.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 5.0 unit | Jarak efektif area skill |
| **Base Value** | 25.000 | Nilai damage / heal dasar |
| **Cooldown** | 9.60s (600 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Menciptakan lingkaran emas besar di tanah dan memunculkan 4 pilar cahaya suci bersinar ke langit.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (10/8/2026).*
