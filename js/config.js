// ============================================================
// CONFIG.JS - Konfigurasi Firebase & Fonnte
// Ganti dengan konfigurasi Firebase Anda
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBdxSOgGe_l32QLqokBCq48fuTjI70VJdg",
  authDomain: "silapah.firebaseapp.com",
  projectId: "silapah",
  storageBucket: "silapah.firebasestorage.app",
  messagingSenderId: "1089851510148",
  appId: "1:1089851510148:web:dc50415359d3976d5ea1d1",
  measurementId: "G-DET72XN67L"
};


// Token API Fonnte (WhatsApp OTP)
const FONNTE_TOKEN = "P8DiNMy2DWgcBNyzUwNL";

// Nomor WhatsApp admin yang menerima OTP (format: 628xxxxxxxxxx)
const ADMIN_WHATSAPP = "6281246251137";

// Inisialisasi Firebase
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();
const auth = firebase.auth();

// Export untuk digunakan di file lain
window.APP_CONFIG = {
  db,
  auth,
  FONNTE_TOKEN,
  ADMIN_WHATSAPP
};
