# 🎮 Panduan Role: Knight (Tank (Defensive/Protector))

Pelindung garis depan dengan armor terkuat di game. Knight berfokus pada pengendalian pertempuran (crowd control) dan melindungi rekan satu tim.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Knight** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **450,000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **35%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.033** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **1.8 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **9,000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **1.12s (70 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **5%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.5x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🗡️ Counter & Sinergi

> Bagian ini menjelaskan hubungan taktis antar unit: siapa yang dilawan, siapa yang melawan, dan siapa teman satu tim terbaik — berdasarkan logika targeting engine dan mekanik skill.

| Hubungan | Unit | Alasan |
| :--- | :--- | :--- |
| **⚔️ Counter** | **Assassin** | Taunt memaksa Assassin menyerang Knight, Bulwark Stance menyerap burst Backstab. Shield Bash knockback menghentikan combo. |
| **⚔️ Counter** | **Archer** | Taunt mengganggu fokus Archer. Armor 35% meredam 60 anak panah Arrow Volley. |
| **🛡️ Di-counter** | **Barbarian** | Rage menetralisir semua CC Knight. DPS out-sustain. |
| **🛡️ Di-counter** | **Mage** | Magic damage bypass armor 35%. Knight tidak bisa menahan burst sihir. |
| **🤝 Sinergi** | **Mage** | Knight Taunt kumpulkan musuh, Mage follow-up dengan AoE burst (Fireball/Frost Nova). |
| **🤝 Sinergi** | **Archer** | Knight tank di depan, Archer DPS aman dari jarak jauh. Taunt lindungi Archer dari dive. |
| **🤝 Sinergi** | **Healer** | Knight armor 35% + Healer heal = hampir immortal. Divine Shield berlapis. |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Knight.glb berarmor perak penuh dengan tameng besar (Shield) dan pedang satu tangan (Sword).
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Knight** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Bulwark Stance (Self-Block)
Menepis semua serangan musuh (Shield Block) dengan durasi imunitas yang sangat lama (Immune Ticks).

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Durasi Efek** | 0.80s (50 ticks) | Durasi status buff/debuff |
| **Cooldown** | 7.20s (450 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Knight memicu pelindung tameng emas bersinar redup di sekeliling tubuhnya.

### ⚡ Taunt (Area Aggro)
Memaksa semua musuh dalam radius jangkauan untuk menyerang Knight, mengalihkan perhatian mereka dari Archer/Mage.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 5.0 unit | Jarak efektif area skill |
| **Cooldown** | 6.40s (400 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Memunculkan simbol kemarahan merah berkedip di atas kepala musuh di sekitar Knight.

### ⚡ Shield Bash (Melee CC/Knockback)
Memberikan damage sedang dan memukul mundur (Knockback) target sejauh beberapa unit.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 1.8 unit | Jarak efektif area skill |
| **Base Value** | 14,000 | Nilai damage / heal dasar |
| **knockback** | 1.5 | Parameter lainnya |
| **Cooldown** | 8.00s (500 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: knight menghantamkan tamengnya ke depan dengan efek kilatan sparks putih terang.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/10/2026).*
