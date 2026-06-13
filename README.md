# TrashAlert - Sistem Pelaporan Sampah Liar

## Struktur File
```
/
├── index.html          → Aplikasi utama (semua halaman)
├── css/
│   └── style.css       → Semua style & animasi
├── js/
│   ├── config.js       → Konfigurasi Firebase & Fonnte
│   ├── app.js          → Logic utama (auth, OTP, notifikasi)
│   ├── officer.js      → Halaman & fungsi petugas
│   └── user.js         → Halaman & fungsi warga
├── firebase.json       → Konfigurasi Firebase Hosting
└── README.md
```

## Setup

### 1. Firebase
Edit `js/config.js` dan ganti:
- `apiKey`, `authDomain`, `databaseURL`, dll dengan config Firebase Anda
- Aktifkan **Realtime Database** di Firebase Console
- Set rules database (untuk development):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### 2. Fonnte (WhatsApp OTP)
Edit `js/config.js`:
- `FONNTE_TOKEN` → Token API dari dashboard.fonnte.com
- `ADMIN_WHATSAPP` → Nomor WhatsApp admin format `628xxxxxxxxxx`

### 3. Deploy
**Firebase Hosting:**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

**Netlify / Vercel:**
Upload folder ini langsung ke netlify.com atau vercel.com

## Fitur Lengkap
- ✅ Login petugas (username + password)
- ✅ Daftar petugas dengan OTP WhatsApp via Fonnte ke nomor admin
- ✅ Dashboard petugas (laporan, statistik, filter status)
- ✅ Laporan warga (GPS, kamera/galeri, deskripsi)
- ✅ Peta interaktif Leaflet + OpenStreetMap
- ✅ Navigasi real-time dengan routing OSRM
- ✅ Estimasi jarak & waktu tiba
- ✅ Notifikasi in-app real-time (Firebase listener)
- ✅ Tracking petugas terlihat dari sisi warga
- ✅ Status laporan: Menunggu → Diproses → Selesai
- ✅ Responsive mobile & desktop
- ✅ Session restore (tidak perlu login ulang)
- ✅ Data tersimpan Firebase Realtime Database
