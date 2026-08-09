Berikut adalah cetak biru (*blueprint*) desain ulang untuk ekosistem pertempuran unit. Revisi ini mengintegrasikan penyeimbangan status, logika *Artificial Intelligence* (AI) baru untuk menekan isu *Overpowered* (OP), serta optimalisasi visual menggunakan *InstancedMesh* dan kalkulasi *GLSL shader* agar *FPS* tetap stabil meski ada gelombang *spawning* unit dalam jumlah masif.

---

### 🏹 1. Archer (Ranged DPS)

Penyerang jarak jauh konstan dengan DPS fisik stabil. Karena sangat mengandalkan hitungan *frame* saat bereaksi terhadap penyusup, Archer kini dibekali insting bertahan otomatis.

* **Revisi Mekanik (Auto-Evasion Privilege):** Jika ada musuh yang masuk ke radius mematikan (seperti Assassin yang baru berteleportasi), sistem AI akan memberikan prioritas *frame* eksekusi (0 *cast delay*) untuk **Evasive Leap** pada serangan pertama.


* **Optimalisasi Visual:** Proyektil **Arrow Volley** (60 anak panah) dirender menggunakan *InstancedMesh* agar 10 Archer yang menembakkan area secara serentak (600 panah) hanya dihitung sebagai satu *draw call*.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Assassin:** Dengan mekanik *Auto-Evasion*, Archer dipastikan melompat mundur tepat sebelum *Backstab* mendarat, lalu menghukum posisi Assassin dengan *Arrow Volley*.

| **🛡️ Di-counter** | **Knight:** Walau Archer ahli *kiting*, ketebalan armor Knight (35%) dan efek *Taunt* akan menyerap habis DPS konstan Archer.


---

### 🗡️ 2. Assassin (Stealth Burst)

Pembunuh bayangan lincah ber-damage ekstrem yang memprioritaskan musuh ber-HP tipis. Logika penargetannya dirombak total agar tidak langsung menyapu bersih garis belakang dan tidak memicu *FPS drop* akibat penumpukan *targeting*.

* **Revisi Mekanik (Sector-Radius & Targeting Cap):** AI Assassin tidak lagi memindai seluruh arena. Saat *spawn*, ia hanya membaca radius 15 unit, lalu menargetkan unit prioritas (HP rendah seperti Healer) di dalam sektor tersebut. Terdapat juga **Targeting Cap (Batas Aggro Maksimal = 2)**; jika 1 Assassin sudah dikunci oleh 2 unit garis belakang musuh, unit musuh lainnya akan mengabaikan Assassin ini.


* **Revisi Mekanik (Cast Delay):** Skill **Shadow Step** kini memiliki jeda *cast* 0.5 detik (30 *ticks*) dengan indikator bayangan di bawah target, memberi ruang bagi AI musuh untuk merespons.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Mage & Healer:** Tetap menjadi predator utama bagi Mage (Armor 0%) dan Healer, namun kini membutuhkan penentuan waktu (timing) *spawn* yang lebih taktis untuk menghindari *Targeting Cap* musuh.

| **🛡️ Di-counter** | **Sistem (Diri Sendiri):** HP-nya dibiarkan tipis di 210,000. Jika terjebak di tengah formasi karena penargetan sektor yang salah, ia akan mati seketika oleh ledakan *splash damage* musuh.


---

### 🪓 3. Barbarian (Offensive Tank)

Petarung jarak dekat dengan kapasitas luar biasa yakni 500,000 HP dan armor 20%. Kapasitas ketahanannya harus diseimbangkan agar Mage tidak kehabisan *damage output*.

* **Revisi Mekanik (Rage Nerf):** Durasi imunitas dari skill **Rage** dikurangi (misalnya dari 30 *ticks* menjadi 20 *ticks*), dan *cooldown*-nya diperpanjang. Hal ini menciptakan "jeda kerentanan" di mana Barbarian bisa dihancurkan.


* **Optimalisasi Visual:** Efek aura api merah saat **Rage** aktif sepenuhnya dikalkulasi menggunakan *GLSL shader* kustom pada material karakternya untuk menghindari penggunaan emiter partikel yang berat.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Knight:** Tetap menjadi penghancur Knight terbaik karena kebal terhadap *Taunt* saat *Rage* aktif, dan sanggup menghancurkan pertahanan statis.

| **🛡️ Di-counter** | **Mage:** Karena durasi imunitas *Rage* diperpendek, *Frost Nova* dari Mage kini memiliki peluang besar untuk mengunci Barbarian, dilanjutkan dengan eksekusi *Fireball*.


---

### 🔫 4. Gunslinger (Rapid Ranged DPS)

Penembak jitu berkecepatan tinggi dengan critical rate 20% yang lincah. Deskripsi senjatanya telah dikalibrasi ulang agar sesuai dengan visual mekanis/senjata api.

* **Revisi Visual & Mekanik:** Proyektil **Fan Fire** dan **High Noon** direvisi secara visual dari "rentetan panah" menjadi **rentetan peluru/bolt energi mesiu**. Ini menggunakan kilatan *sparks* ringan dan jejak *trail* instan.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Barbarian & Mage:** Menjadi unit pembersih yang efisien. Menggunakan **Smoke Bomb** untuk menghilangkan *aggro*, lalu menghancurkan Barbarian (saat *Rage* usai) atau Mage menggunakan eksekusi kilat *High Noon*.

| **🛡️ Di-counter** | **Assassin:** Kecepatan gerak Assassin (0.055) tetap melampaui Gunslinger (0.03), membuat *Smoke Bomb* tidak cukup jauh untuk melepaskan diri dari kejaran radius AI Assassin.


---

### 💖 5. Healer (Support)

Unit pendukung murni ber-HP 180,000. Sebagai prioritas target utama bagi para penyusup, AI Healer tidak bisa hanya mengandalkan Knight.

* **Revisi Mekanik (Panic Shield Auto-Trigger):** Skill **Divine Shield** kini dikonfigurasi sebagai respons instan (*auto-cast trigger*). Jika HP Healer turun hingga 30% akibat *burst damage*, AI akan membatalkan semua animasi *healing* lain dan langsung merapalkan *Divine Shield* ke dirinya sendiri. Ini memberikannya peluang bertahan hingga 1.28 detik (80 *ticks*) sambil menunggu bantuan dari Knight atau Mage di dekatnya.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **🤝 Sinergi Maksimal** | Berperan penuh menjaga Barbarian (HP raksasa 500K) dengan **Rejuvenation** dan **Holy Sanctuary**. Sistem *Panic Shield* memastikan ia tidak lagi mati seketika saat formasi bocor.

| **🛡️ Di-counter** | **Gunslinger:** Jika *Panic Shield* sedang *cooldown*, tembakan instan *High Noon* akan memastikan Healer mati sebelum bisa memulihkan diri.


---

### 🛡️ 6. Knight (Defensive Protector)

Pelindung dengan darah 450,000 HP dan armor 35%. AI penargetannya difokuskan untuk memecah formasi musuh.

* **Revisi Mekanik (Taunt Aggro Logic):** **Taunt** tidak lagi menarik semua unit secara tak terbatas. Untuk mencegah Knight di-spam oleh 50 unit musuh hingga mati seketika (dan merusak sistem *pathfinding* unit), *Taunt* kini membatasi pengalihan hingga maksimal 5-7 unit musuh terdekat dalam radius 5.0 unit.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Assassin & Archer:** Menyerap DPS fisik dari Archer dengan mudah berkat armor 35%, serta membatalkan *combo* mematikan Assassin menggunakan *Shield Bash* (*knockback* 1.5 unit).

| **🛡️ Di-counter** | **Barbarian & Mage:** Menjadi unit tak berdaya di depan damage masif *Axe Cleave* milik Barbarian yang kebal CC, atau rentetan sihir Mage yang 100% menembus lapisan armor bajanya.


---

### 🧙‍♀️ 7. Mage (Magic Burst Specialist)

Penyihir penghancur garis depan ber-HP 210,000 dengan armor 0%. Keberadaannya sangat esensial untuk mengatasi *role* berdarah tebal.

* **Revisi Mekanik (Splash Damage Optimization):** Parameter *hit-detection* dari area **Fireball** disederhanakan secara komputasi. Daripada mengecek tabrakan ke setiap karakter, mesin mendeteksi musuh berdasarkan fungsi jarak dari pusat ledakan, memastikan performa stabil saat beberapa Mage meledakkan area secara bersamaan.



| Hubungan | Status Revisi & Detail Counter |
| --- | --- |

| **⚔️ Counter** | **Knight & Barbarian:** Eksekutor absolut untuk garis depan. Serangannya tidak memedulikan ketebalan armor Knight. Dengan durasi imunitas Barbarian yang kini di-*nerf*, kombinasi *Frost Nova* (stun 40 *ticks*) dan *Fireball* akan membakar unit *melee* musuh.

| **🛡️ Di-counter** | **Assassin & Gunslinger:** Pertahanan 0% membuatnya sangat rapuh. Tanpa perlindungan jarak dari unit *tank*, Mage hanya butuh satu tebasan *Backstab* atau tembakan *High Noon* untuk hilang dari arena.
