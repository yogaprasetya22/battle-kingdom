# 🎮 Panduan Role: Barbarian (Tank (Offensive))

Petarung jarak dekat (melee) yang memiliki HP tinggi, pertahanan sedang, dan output damage tinggi. Kelas ini berfokus pada serangan ofensif brutal.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Barbarian** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **500,000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **20%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.038** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **1.8 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **12,000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **0.96s (60 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **8%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.6x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🗡️ Counter & Sinergi

> Bagian ini menjelaskan hubungan taktis antar unit: siapa yang dilawan, siapa yang melawan, dan siapa teman satu tim terbaik — berdasarkan logika targeting engine dan mekanik skill.

| Hubungan | Unit | Alasan |
| :--- | :--- | :--- |
| **⚔️ Counter** | **Knight** | Rage immune menetralisir Taunt + Shield Bash Knight. DPS Barbarian melampaui sustain Knight. |
| **🛡️ Di-counter** | **Mage** | Magic damage bypass armor. Frost Nova stun, Fireball splash AoE hancurkan Barbarian. |
| **🛡️ Di-counter** | **Archer** | Kite dari jarak jauh. Arrow Volley AoE susah dihindari oleh unit melee lambat. |
| **🤝 Sinergi** | **Healer** | Healer Divine Shield + Rejuvenation menjaga Barbarian tetap hidup di garis depan. |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Barbarian.glb berpakaian baju zirah besi merah, membawa kapak dua tangan raksasa (Axe 2-Handed). Gerakannya agresif dengan tebasan melingkar besar.
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Barbarian** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Rage (Self-Buff)
Memberikan imunitas penuh kepada diri sendiri (Immunity Ticks), mencegah segala jenis damage masuk.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Durasi Efek** | 0.48s (30 ticks) | Durasi status buff/debuff |
| **Cooldown** | 9.60s (600 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Barbarian mengeluarkan aura kemarahan membara (suar api merah-oranye) di sekujur tubuhnya.

### ⚡ Axe Cleave (Melee Cleave)
Memberikan damage fisik besar ke musuh di depan dalam jangkauan tebasannya.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 1.8 unit | Jarak efektif area skill |
| **Base Value** | 18,000 | Nilai damage / heal dasar |
| **Cooldown** | 6.40s (400 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Tebasan kapak horizontal menyapu dengan efek garis tebasan merah tebal berkecepatan tinggi.

### ⚡ Battle Cry (AoE Debuff/Buff)
Memberikan teriakan perang yang meredam nyali musuh dalam radius jangkauan.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Jangkauan/Radius** | 4.0 unit | Jarak efektif area skill |
| **Cooldown** | 8.00s (500 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Mengeluarkan riak gelombang suara melingkar berwarna merah yang membesar dari kaki Barbarian.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/10/2026).*
