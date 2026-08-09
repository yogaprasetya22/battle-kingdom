# 🎮 Panduan Role: Gunslinger (Rapid Ranged DPS)

Penembak jitu berkecepatan tinggi dengan critical rate tinggi. Mampu menyerang sangat cepat dan bersembunyi untuk menyelamatkan diri.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Gunslinger** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **200,000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **5%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.03** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **7 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **22,000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **0.80s (50 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **20%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.8x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🗡️ Counter & Sinergi

> Bagian ini menjelaskan hubungan taktis antar unit: siapa yang dilawan, siapa yang melawan, dan siapa teman satu tim terbaik — berdasarkan logika targeting engine dan mekanik skill.

| Hubungan | Unit | Alasan |
| :--- | :--- | :--- |
| **⚔️ Counter** | **Barbarian** | Smoke Bomb escape aman. High Noon execute single-target tinggi. Barbarian lambat, mudah di-kite. |
| **⚔️ Counter** | **Mage** | Smoke Bomb stealth dekati tanpa terdeteksi. High Noon execute. Fan Fire AoE bunuh Mage saat approach. |
| **⚔️ Counter** | **Healer** | High Noon execute Healer sebelum sempat Divine Shield. Fan Fire membersihkan Healer dari cluster. |
| **🛡️ Di-counter** | **Assassin** | Shadow Step kejar Smoke Bomb. Speed unggul jauh. |
| **🛡️ Di-counter** | **Archer** | Arrow Volley area denial. Evasive Leap jaga jarak aman. |
| 🤝 Sinergi | — | Mandiri / self-sufficient |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Rogue Hooded berpenutup kepala gelap, memegang pistol panah mekanis (Crossbow) di tangan.
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Gunslinger** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ High Noon (Single-Target Execution)
Memberikan damage fisik masif instan ke satu target musuh.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 35,000 | Nilai damage / heal dasar |
| **Cooldown** | 8.00s (500 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Tembakan kilat beruntun berkecepatan tinggi dengan percikan sparks tajam di laras senjata.

### ⚡ Smoke Bomb (Self-Stealth)
Membuat dirinya tidak dapat ditarget musuh (Stealth/Invisible) selama beberapa ticks untuk kabur.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Durasi Efek** | 0.96s (60 ticks) | Durasi status buff/debuff |
| **Cooldown** | 9.60s (600 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Gunslinger melempar bom asap, menciptakan kabut asap hitam pekat berbentuk kubah kecil di posisinya.

### ⚡ Fan Fire (AoE Multi-Hit)
Memberikan damage fisik area (AoE) sebanyak 3 kali hantaman berturut-turut pada semua musuh di dekatnya.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 2.5 unit | Jarak efektif area skill |
| **Base Value** | 18,000 | Nilai damage / heal dasar |
| **hits** | 3 | Parameter lainnya |
| **Cooldown** | 11.20s (700 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Gunslinger berputar menembakkan rentetan panah ke segala arah dalam bentuk kipas melingkar.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/10/2026).*
