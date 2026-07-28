Berikut adalah kumpulan *prompt* yang sudah disesuaikan agar kamu bisa langsung *copy-paste* ke AI (seperti ChatGPT, Claude, atau Gemini) untuk membuat efek WebGPU di Three.js.

Saya juga telah menyiapkan satu draf penjelasan mekanik bergaya bahasa awam yang kasual namun sangat terstruktur.

### 1. Prompt Three.js WebGPU (Vertex Effects)

Kamu bisa menyalin *prompt* di bawah ini untuk meminta AI membuatkan kode shader Three.js menggunakan **TSL (Three.js Shading Language / Node Material)** yang merupakan standar untuk WebGPU di versi Three.js terbaru.

**Prompt untuk Efek Tank (Iron Fortitude Shield & Bash Shockwave):**

```text
Tolong buatkan material Three.js WebGPU menggunakan TSL (Node Material) untuk karakter Tank. 
Saya butuh dua efek manipulasi vertex dan warna:
1. "Iron Fortitude": Saat dipicu (uniform isShieldActive = true), mesh karakter sedikit membesar (vertex normal displacement) dan warnanya bertransisi menjadi Emas/Kuning Berkilau (0xffd700) dengan efek glowing/emissive.
2. "Shield Bash Shockwave": Buatkan efek vertex yang beriak (ripple/sine wave displacement) menjauhi karakter utama pada mesh lantai (ground) untuk mensimulasikan efek pentalan sejauh 2.5 unit.

Berikan kode lengkapnya menggunakan `MeshStandardNodeMaterial` dan manipulasi `positionNode` serta `colorNode`.

```

**Prompt untuk Efek Archer (Evasive Leap Motion & Arrow Volley):**

```text
Tolong buatkan skrip Three.js WebGPU untuk efek karakter Archer:
1. "Evasive Leap Trail": Menggunakan TSL, buatkan efek vertex stretching di mana saat karakter melompat mundur (uniform kecepatan tinggi), vertex bagian depan mesh sedikit memanjang atau tertinggal (motion blur berbasis vertex) ke arah berlawanan dari pergerakan.
2. "Arrow Volley": Buatkan implementasi `InstancedMesh` dengan WebGPU TSL di mana ratusan instance anak panah jatuh dari atas (Y-axis displacement) secara acak dalam radius melingkar 3.5 unit. Anak panah harus menghilang atau memicu partikel kecil saat menyentuh Y=0.

Tolong berikan contoh kode Node Material yang mengontrol `instanceMatrix` dan posisi vertexnya.

```

**Prompt untuk Efek Mage (Frost Nova & Chain Lightning):**

```text
Tolong buatkan material Three.js WebGPU (TSL/Node Material) untuk efek sihir Mage:
1. "Frost Nova Freeze": Saat musuh terkena beku, ubah warna mesh menjadi Biru Muda Es (0x33aaff). Tambahkan manipulasi vertex menggunakan noise (misalnya simplex noise pada positionNode) agar permukaan mesh terlihat tajam/runcing seperti kristal es yang tumbuh keluar.
2. "Chain Lightning": Buatkan shader untuk mesh berbentuk silinder/garis yang menghubungkan 3 posisi Vector3 (Mage -> Target 1 -> Target 2). Gunakan fungsi noise pada vertex shader (TSL) agar garis tersebut bergerak zig-zag tidak beraturan seperti sambaran petir sungguhan.

Sertakan setup `MeshBasicNodeMaterial` untuk petir dan `MeshStandardNodeMaterial` untuk efek es.

```

---

### 2. Penjelasan Mekanik untuk Orang Awam

Gunakan *prompt* atau teks di bawah ini jika kamu ingin menjelaskan mekanisme ketiga role tersebut kepada pemain, desainer, atau audiens umum tanpa menggunakan istilah teknis yang memusingkan.

```markdown
# 🎮 Panduan Singkat: 3 Tipe Jagoan Kita!

Biar gampang bayanginnya, ini tugas dan cara kerja masing-masing karakter di medan tempur:

**🛡️ 1. TANK (Si Tembok Berjalan)**
Ini karakter yang posisinya paling depan. Tugasnya cuma satu: pasang badan biar temannya nggak digebukin.
*   **Darahnya paling tebal.** Udah gitu, semua pukulan musuh rasanya cuma separuh doang.
*   **Punya mode krisis.** Kalau darahnya udah mau habis (di bawah 60%), dia bakal langsung nyala warna emas, nyembuhin diri sendiri, dan badannya jadi jauh lebih keras selama 2 detik. 
*   **Bisa ngejek musuh.** Kalau ada musuh yang mau nyerang teman di belakang, Tank bakal teriak dan bikin musuh itu kepancing buat mukul dia aja.
*   **Tukang pukul mundur.** Dia bisa ngehantam musuh pakai tameng sampai musuhnya kepental mundur, bikin formasi musuh berantakan.

**🏹 2. ARCHER (Si Lincah Jarak Jauh)**
Penembak jitu yang larinya paling cepat dan nembaknya paling jauh. Tapi hati-hati, badannya lembek.
*   **Tembakan ganda.** Sekali serang langsung meluncurkan dua panah super cepat ke satu musuh.
*   **Otomatis kabur.** Kalau ada musuh yang berhasil nyamperin dan jaraknya terlalu dekat, Archer bakal otomatis melompat mundur ke belakang buat jaga jarak aman. Nggak perlu disuruh!
*   **Hujan Panah.** Dia bisa nembakin panah ke langit, dan panahnya bakal turun kayak hujan di satu area. Musuh yang lagi ngumpul di situ bakal kena *damage* barengan.

**🧙‍♂️ 3. MAGE (Si Tukang Sihir Mematikan)**
Posisinya di belakang. Darahnya paling tipis dan gampang mati, tapi serangannya paling ngeri dan bikin musuh repot.
*   **Bola Api Raksasa.** Lemparan bola api yang serangannya sakit banget ke satu musuh. Cocok buat ngabisin musuh dengan cepat.
*   **Kutukan Es (Freeze).** Dia bisa ngebekuin musuh utama. Musuh yang kena bakal berubah warna jadi biru muda dan jadi patung selama 1 detik (nggak bisa jalan, nggak bisa nyerang, apalagi ngeluarin skill).
*   **Petir Nyetrum.** Serangan petir yang pintar. Kalau kena satu musuh, petirnya bakal langsung loncat nyetrum ke 2 musuh lain yang ada di dekatnya. Cocok buat ngelawan musuh yang berbaris rapat!

```