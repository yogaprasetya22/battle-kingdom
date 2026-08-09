# 🎮 Panduan Role: Mage (Magic Burst/AoE Specialist)

Penyihir elemen dengan jangkauan serang terjauh. Menghasilkan damage ledakan (burst) sihir area terbesar namun sangat rentan mati jika didekati.

---

## 📊 Atribut Dasar (Statistik Unit)

Berikut adalah data numerik dasar unit **Mage** yang diambil langsung dari konfigurasi balancing game:

| Statistik | Nilai Dasar | Deskripsi |
| :--- | :--- | :--- |
| **Darah Maksimal (HP)** | **210,000 HP** | Kapasitas nyawa maksimal unit |
| **Pertahanan (Armor)** | **0%** | Persentase pengurangan damage fisik yang diterima |
| **Kecepatan Gerak** | **0.02** | Kecepatan unit berpindah tempat per frame |
| **Jangkauan Serang** | **12 unit** | Jarak maksimal untuk melancarkan serangan dasar |
| **Damage Dasar** | **4,000** | Nilai damage dasar serangan normal |
| **Interval Serangan** | **0.96s (60 ticks)** | Jeda waktu antar serangan dasar |
| **Critical Rate (Peluang)** | **10%** | Peluang serangan dasar menghasilkan damage kritikal |
| **Critical Damage (Multiplier)** | **1.5x** | Pengali damage saat serangan kritikal berhasil dipicu |

---

## 🗡️ Counter & Sinergi

> Bagian ini menjelaskan hubungan taktis antar unit: siapa yang dilawan, siapa yang melawan, dan siapa teman satu tim terbaik — berdasarkan logika targeting engine dan mekanik skill.

| Hubungan | Unit | Alasan |
| :--- | :--- | :--- |
| **⚔️ Counter** | **Barbarian** | Magic damage bypass armor 20%. Frost Nova stun mencegah Barbarian charge. Fireball splash bunuh Barbarian. |
| **⚔️ Counter** | **Knight** | Magic damage bypass armor 35% Knight. Taunt tidak efektif vs AoE. Frost Nova stun mengunci Knight. |
| **🛡️ Di-counter** | **Assassin** | Shadow Step langsung menusuk backline, armor 0% tidak bertahan. |
| **🛡️ Di-counter** | **Gunslinger** | Smoke Bomb stealth dekati tanpa terdeteksi. High Noon execute. |
| **🤝 Sinergi** | **Knight** | Knight tank di depan mengumpulkan musuh, Mage hancurkan dengan AoE. |

---

## 🎨 Deskripsi Visual & Gaya Bertarung

* **Desain Karakter**: Menggunakan model Mage.glb berjubah biru penyihir, memegang tongkat sihir kayu berkristal biru bersinar (Staff).
* **Gaya Bertarung**: Bergerak maju mendekati target sesuai jangkauan serangnya. Menggunakan interval attack dasar untuk mencicil musuh sebelum merapalkan skill aktif apabila cooldown selesai.

---

## 🔮 Mekanisme & Efek Visual Skill

Unit **Mage** memiliki beberapa skill aktif bersyarat dengan visualisasi khusus:

### ⚡ Frost Nova (AoE CC/Stun)
Memberikan damage sihir dan membekukan (Stun/Freeze) semua musuh di sekitarnya sehingga tidak bisa bergerak selama beberapa ticks.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 12,000 | Nilai damage / heal dasar |
| **Jangkauan/Radius** | 1.5 unit | Jarak efektif area skill |
| **Durasi Efek** | 0.64s (40 ticks) | Durasi status buff/debuff |
| **Cooldown** | 8.80s (550 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Ledakan cincin es berwarna biru muda di tanah disertai pecahan serpihan es tajam melayang di udara.

### ⚡ Chain Lightning (Multi-Target bounce)
Memberikan damage sihir besar pada target utama, lalu memantul ke target sekunder terdekat dengan damage yang sedikit berkurang.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 22,000 | Nilai damage / heal dasar |
| **Base Value** | 15,000 | Nilai damage / heal dasar |
| **maxChains** | 4 | Parameter lainnya |
| **Jangkauan/Radius** | 5.0 unit | Jarak efektif area skill |
| **Cooldown** | 11.20s (700 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Kilatan petir biru instan yang menyambar lurus dan memantul meliuk-liuk di antara beberapa unit musuh.

### ⚡ Fireball (Huge AoE Burst)
Memberikan damage sihir langsung (Direct Damage) yang sangat masif pada target utama, serta damage ledakan tambahan (Splash Damage) dalam radius ledakan.

| Atribut Skill | Nilai | Deskripsi |
| :--- | :--- | :--- |
| **Base Value** | 60,000 | Nilai damage / heal dasar |
| **Base Value** | 25,000 | Nilai damage / heal dasar |
| **Jangkauan/Radius** | 3.5 unit | Jarak efektif area skill |
| **Cooldown** | 17.60s (1100 ticks) | Waktu jeda penggunaan kembali |


* **Efek Visual**: Mage meluncurkan meteor api besar menyala merah-jingga yang meninggalkan ekor bara api (embers), lalu meledak hebat saat menyentuh target.


---
*Dokumen ini dibuat secara otomatis dari konfigurasi engine terbaru (8/10/2026).*
