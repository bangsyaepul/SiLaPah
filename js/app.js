// ============================================================
// APP.JS - Core Application Logic
// Sistem Pelaporan Sampah Liar
// ============================================================

'use strict';

// ─── App State ───────────────────────────────────────────────
const AppState = {
  currentUser: null,       // { uid, name, username, role: 'officer'|'user' }
  currentPage: null,
  notifications: [],
  reports: {},
  officerLocation: null,
  watchId: null,
  navigatingTo: null,      // reportId currently navigating to
  otpCode: null,
  otpExpiry: null,
  pendingOfficerData: null,
};

// ─── Utilities ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function showToast(msg, type = 'info', dur = 3500) {
  const container = $('toast-container');
  const t = document.createElement('div');
  const icons = { success: '🔔', error: '❌', info: '🔔', warning: '⚠️' };
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-text">${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 300);
  }, dur);
}

function showLoading(txt = 'Memproses...') {
  $('loading-text').textContent = txt;
  $('loading-overlay').classList.add('show');
}

function hideLoading() {
  $('loading-overlay').classList.remove('show');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff/60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff/3600)} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ─── Page Navigation ──────────────────────────────────────────
function showPage(pageId) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = $(pageId);
  if (page) {
    page.classList.add('active');
    AppState.currentPage = pageId;
  }
}

// ─── OTP via Fonnte ──────────────────────────────────────────
async function sendOTP() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  AppState.otpCode = code;
  AppState.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 menit

  const { FONNTE_TOKEN, ADMIN_WHATSAPP } = window.APP_CONFIG;
  const msg = `🔐 *OTP Pendaftaran Petugas*\n\nKode OTP Anda: *${code}*\n\nBerlaku selama 10 menit. Jangan berikan kode ini kepada siapapun.`;

  try {
    const fd = new FormData();
    fd.append('target', ADMIN_WHATSAPP);
    fd.append('message', msg);

    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: FONNTE_TOKEN },
      body: fd,
    });

    const data = await res.json();
    if (data.status) {
      showToast('OTP telah dikirim ke WhatsApp Admin', 'success');
      return true;
    } else {
      showToast('Gagal mengirim OTP: ' + (data.reason || 'Error'), 'error');
      return false;
    }
  } catch (e) {
    showToast('Gagal mengirim OTP. Cek koneksi internet.', 'error');
    return false;
  }
}

function verifyOTP(input) {
  if (!AppState.otpCode || !AppState.otpExpiry) return false;
  if (Date.now() > AppState.otpExpiry) {
    showToast('OTP sudah kedaluwarsa. Minta OTP baru.', 'error');
    return false;
  }
  return input === AppState.otpCode;
}

// ─── Auth: Officer Registration ───────────────────────────────
async function handleOfficerRegister(e) {
  e.preventDefault();
  const name = $('reg-name').value.trim();
  const username = $('reg-username').value.trim().toLowerCase();
  const password = $('reg-password').value;
  const confPass = $('reg-confirm-password').value;

  const category = $('reg-category').value;
  if (!name || !username || !password) return showToast('Lengkapi semua field', 'warning');
  if (password !== confPass) return showToast('Password tidak cocok', 'error');
  if (password.length < 6) return showToast('Password minimal 6 karakter', 'warning');
  if (!category) return showToast('Pilih kategori sampah yang akan ditangani', 'warning');

  // Cek username sudah ada
  showLoading('Memeriksa username...');
  const snap = await window.APP_CONFIG.db.ref(`officers/${username}`).once('value');
  hideLoading();

  if (snap.exists()) return showToast('Username sudah digunakan', 'error');

  AppState.pendingOfficerData = { name, username, password, category };

  // Kirim OTP
  showLoading('Mengirim OTP ke Admin...');
  const ok = await sendOTP();
  hideLoading();

  if (ok) showModal('modal-otp');
}

async function handleOTPVerify() {
  const inputs = $$('.otp-input');
  const code = Array.from(inputs).map(i => i.value).join('');

  if (code.length !== 6) return showToast('Masukkan 6 digit OTP', 'warning');

  if (!verifyOTP(code)) return showToast('OTP tidak valid', 'error');

  // Simpan petugas ke Firebase
  const { name, username, password, category } = AppState.pendingOfficerData;
  showLoading('Membuat akun petugas...');

  try {
    // Hash password sederhana (gunakan bcrypt di produksi)
    const passHash = btoa(password + ':salt_sampah_liar');
    await window.APP_CONFIG.db.ref(`officers/${username}`).set({
      name, username,
      passwordHash: passHash,
      category: category || 'Lainnya',
      createdAt: Date.now(),
      isActive: true,
    });

    hideLoading();
    closeModal('modal-otp');
    showToast('Akun petugas berhasil dibuat! Silahkan login.', 'success');
    showPage('page-officer-login');
    AppState.pendingOfficerData = null;
    AppState.otpCode = null;
  } catch (err) {
    hideLoading();
    showToast('Gagal membuat akun: ' + err.message, 'error');
  }
}

// ─── Auth: Officer Login ──────────────────────────────────────
async function handleOfficerLogin(e) {
  e.preventDefault();
  const username = $('login-username').value.trim().toLowerCase();
  const password = $('login-password').value;

  if (!username || !password) return showToast('Lengkapi username dan password', 'warning');

  showLoading('Memverifikasi...');
  try {
    const snap = await window.APP_CONFIG.db.ref(`officers/${username}`).once('value');
    hideLoading();

    if (!snap.exists()) return showToast('Username tidak ditemukan', 'error');

    const officer = snap.val();
    const passHash = btoa(password + ':salt_sampah_liar');

    if (officer.passwordHash !== passHash) return showToast('Password salah', 'error');
    if (!officer.isActive) return showToast('Akun tidak aktif', 'error');

    AppState.currentUser = { uid: username, name: officer.name, username, role: 'officer', category: officer.category || 'Lainnya', photoUrl: officer.photoUrl || null };
    localStorage.setItem('currentUser', JSON.stringify(AppState.currentUser));

    startOfficerApp();
  } catch (err) {
    hideLoading();
    showToast('Login gagal: ' + err.message, 'error');
  }
}

// ─── Auth: User (Warga) ───────────────────────────────────────
function handleUserEnter(e) {
  e.preventDefault();
  const name = $('user-name').value.trim();
  if (!name) return showToast('Masukkan nama Anda', 'warning');

  // Gunakan UID permanen per browser agar laporan lama tetap muncul
  let persistentUid = localStorage.getItem('guestUid');
  if (!persistentUid) {
    persistentUid = 'user_' + generateId();
    localStorage.setItem('guestUid', persistentUid);
  }

  AppState.currentUser = {
    uid: persistentUid,
    name,
    role: 'user',
  };
  localStorage.setItem('currentUser', JSON.stringify(AppState.currentUser));
  startUserApp();
}

// ─── Start Apps ───────────────────────────────────────────────
function startOfficerApp() {
  showPage('page-officer-dashboard');
  loadOfficerDashboard();
  startRealtimeListener();
  startLocationTracking();
}

function startUserApp() {
  showPage('page-user-dashboard');
  loadUserDashboard();
  // Listener dihandle oleh loadUserReportsRealtime() di user.js (dipanggil dari loadUserDashboard)
}

// ─── Logout ───────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  if (AppState.watchId) navigator.geolocation.clearWatch(AppState.watchId);
  AppState.currentUser = null;
  AppState.navigatingTo = null;
  localStorage.removeItem('currentUser');
  // Reset form login
  $('login-username').value = '';
  $('login-password').value = '';
  showPage('page-home');
  showToast('Berhasil keluar', 'success');
}

// ─── Modal ────────────────────────────────────────────────────
function showModal(id) {
  $(id).classList.add('open');
}

function closeModal(id) {
  $(id).classList.remove('open');
}

// ─── In-App Notifications ─────────────────────────────────────
function addNotification(title, body, reportId = null) {
  const notif = { id: generateId(), title, body, reportId, time: Date.now(), read: false };
  AppState.notifications.unshift(notif);
  renderNotifications();

  // Badge
  const badge = $('notif-badge');
  if (badge) {
    badge.classList.add('show');
    badge.textContent = AppState.notifications.filter(n => !n.read).length;
  }

  showToast(`🔔 ${title}: ${body}`, 'info', 4000);
}

function renderNotifications() {
  const list = $('notif-list');
  if (!list) return;

  if (AppState.notifications.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><p class="empty-desc">Belum ada notifikasi</p></div>`;
    return;
  }

  list.innerHTML = AppState.notifications.slice(0, 20).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick('${n.id}','${n.reportId||''}')">
      <div class="notif-dot" style="${n.read ? 'opacity:0' : ''}"></div>
      <div class="notif-content">
        <div class="notif-content-title">${n.title}</div>
        <div class="notif-content-body">${n.body}</div>
      </div>
      <span class="notif-time">${formatTime(n.time)}</span>
    </div>
  `).join('');
}

function handleNotifClick(id, reportId) {
  const n = AppState.notifications.find(n => n.id === id);
  if (n) n.read = true;
  renderNotifications();

  const unreadCount = AppState.notifications.filter(n => !n.read).length;
  const badge = $('notif-badge');
  if (badge) {
    if (unreadCount === 0) badge.classList.remove('show');
    else badge.textContent = unreadCount;
  }

  if (reportId && AppState.currentUser?.role === 'officer') {
    closeNotifPanel();
    openReportDetail(reportId);
  }
}

function toggleNotifPanel() {
  const panel = $('notif-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderNotifications();
}

function closeNotifPanel() {
  $('notif-panel')?.classList.remove('open');
}

function clearAllNotifs() {
  AppState.notifications = [];
  const badge = $('notif-badge');
  if (badge) badge.classList.remove('show');
  renderNotifications();
}

// ─── Firebase Realtime ────────────────────────────────────────
let lastKnownReports = {};

function startRealtimeListener() {
  const reportsRef = window.APP_CONFIG.db.ref('reports');
  reportsRef.on('value', snap => {
    const data = snap.val() || {};
    const isInitialLoad = Object.keys(lastKnownReports).length === 0;

    Object.keys(data).forEach(id => {
      const r    = data[id];
      const prev = lastKnownReports[id];

      // Laporan baru masuk
      if (!prev) {
        if (!isInitialLoad) {
          addNotification('Laporan Baru!', `${r.location || 'Lokasi baru'} dari ${r.reporterName}`, id);
        }
        return;
      }

      // Deteksi perubahan status (hanya untuk petugas yg sudah login)
      if (AppState.currentUser?.role === 'officer' && prev.status !== r.status) {
        const officerCat = AppState.currentUser?.category || '';
        const reportCat  = r.category || '';

        // Laporan kategori BERBEDA diupdate — notifikasi dengan nama pelapor & kategori
        if (reportCat && officerCat && reportCat !== officerCat && officerCat !== 'Lainnya') {
          const statusLabels = {
            progress:     'sedang dibersihkan',
            transporting: 'sedang diantarkan ke TPS',
            done:         'selesai dibersihkan',
          };
          const label = statusLabels[r.status];
          if (label) {
            addNotification(
              `Update Laporan [${reportCat}]`,
              `Laporan dari ${r.reporterName || 'Warga'} (${reportCat}) kini ${label}`,
              id
            );
          }
        }
      }
    });

    lastKnownReports = { ...data };
    AppState.reports = data;
    renderOfficerReports();
    updateOfficerStats();
  });
}

// ─── Location Tracking (Officer) ─────────────────────────────
function startLocationTracking() {
  if (!navigator.geolocation) return;

  AppState.watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      AppState.officerLocation = { lat: latitude, lng: longitude };

      // Update Firebase - lokasi per petugas (dengan ID & kategori)
      const officerId = AppState.currentUser?.uid || 'unknown';
      const officerCategory = AppState.currentUser?.category || 'Lainnya';
      const officerName = AppState.currentUser?.name || 'Petugas';
      const navigatingTo = AppState.navigatingTo;
      
      // Simpan ke node officerLocations/{officerId} (multi-petugas)
      window.APP_CONFIG.db.ref('officerLocations/' + officerId).set({
        lat: latitude,
        lng: longitude,
        timestamp: Date.now(),
        category: officerCategory,
        name: officerName,
        navigatingTo: navigatingTo || null,
        isActive: true,
        photoUrl: AppState.currentUser?.photoUrl || null,
      });
      
      // Legacy: tetap update officerLocation (+ nama & kategori untuk popup warga)
      window.APP_CONFIG.db.ref('officerLocation').set({
        lat: latitude,
        lng: longitude,
        timestamp: Date.now(),
        name: officerName,
        category: officerCategory,
        navigatingTo: navigatingTo || null,
      });

      // Update navigation if active
      if (AppState.navigatingTo) updateNavigation();
    },
    err => console.warn('Geolocation error:', err),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// ─── Navigation Logic ─────────────────────────────────────────
let navInterval = null;

function startNavigation(reportId) {
  const report = AppState.reports[reportId];
  if (!report?.coords) return showToast('Koordinat lokasi tidak tersedia', 'warning');

  AppState.navigatingTo = reportId;
  // Reset guard notifikasi tiba agar selalu fresh saat navigasi baru
  AppState._arrivedNotifiedReport = null;
  AppState._nearlyArrivedNotified = false;

  // Update status di Firebase
  window.APP_CONFIG.db.ref(`reports/${reportId}`).update({
    status: 'progress',
    officerNavigating: true,
    officerArrivedAt: null,
    officerName: AppState.currentUser.name,
  });

  showPage('page-officer-map');
  initOfficerMap(report.coords, reportId);

  // Start interval untuk update navigasi
  if (navInterval) clearInterval(navInterval);
  navInterval = setInterval(updateNavigation, 10000);

  showToast('Navigasi dimulai! Menuju lokasi sampah.', 'success');
}

function stopNavigation() {
  // Hapus data navigasi dari Firebase untuk petugas ini
  const officerId = AppState.currentUser?.uid;
  if (officerId) {
    window.APP_CONFIG.db.ref('officerLocations/' + officerId).update({
      navigatingTo: null,
      isActive: false,
    });
  }
  AppState.navigatingTo = null;
  if (navInterval) { clearInterval(navInterval); navInterval = null; }
}

function updateNavigation() {
  const reportId = AppState.navigatingTo;
  if (!reportId || !AppState.officerLocation) return;

  const report = AppState.reports[reportId];
  if (!report?.coords) return;

  const dist = getDistanceKm(
    AppState.officerLocation.lat, AppState.officerLocation.lng,
    report.coords.lat, report.coords.lng
  );

  const estMinutes = Math.round(dist / 0.5 * 60); // ~30 km/h urban

  $('nav-distance') && ($('nav-distance').textContent = dist < 1
    ? Math.round(dist * 1000) + ' m'
    : dist.toFixed(1) + ' km');

  $('nav-eta') && ($('nav-eta').textContent = estMinutes <= 0 ? 'Sampai' : estMinutes + ' menit');

  // Notifikasi hampir sampai — SATU KALI per laporan (fix bug notif berulang)
  if (dist < 0.1) {
    if (AppState.navigatingTo && AppState._arrivedNotifiedReport !== reportId) {
      AppState._arrivedNotifiedReport = reportId;
      window.APP_CONFIG.db.ref(`reports/${reportId}`).update({
        officerArrived:   true,
        officerArrivedAt: Date.now(),
        officerName:      AppState.currentUser?.name || '',
        officerCategory:  AppState.currentUser?.category || '',
      });
      showToast('📍 Anda telah tiba di lokasi!', 'success');
    }
  } else if (dist < 0.3) {
    if (!AppState._nearlyArrivedNotified) {
      AppState._nearlyArrivedNotified = true;
      showToast('📍 Hampir sampai! ±' + Math.round(dist*1000) + 'm lagi', 'info');
    }
  } else {
    AppState._nearlyArrivedNotified = false;
  }

  // Update officer marker on map
  if (window.officerMapInstance) {
    updateOfficerMapMarker(AppState.officerLocation);
  }
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── OTP Input Handling ───────────────────────────────────────
function initOTPInputs() {
  const inputs = $$('.otp-input');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(-1);
      if (val && i < inputs.length - 1) inputs[i+1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i-1].focus();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'');
      inputs.forEach((inp2, j) => inp2.value = paste[j] || '');
      inputs[Math.min(paste.length, inputs.length-1)].focus();
    });
  });
}

// ─── Session Restore ──────────────────────────────────────────
function restoreSession() {
  const saved = localStorage.getItem('currentUser');
  if (!saved) return false;

  try {
    const user = JSON.parse(saved);
    AppState.currentUser = user;
    // Pastikan guestUid tersinkron dengan UID yang tersimpan di session
    if (user.role === 'user' && user.uid) {
      localStorage.setItem('guestUid', user.uid);
    }
    if (user.role === 'officer') {
      startOfficerApp();
    } else {
      startUserApp();
    }
    return true;
  } catch { return false; }
}

// ─── Image Upload ─────────────────────────────────────────────
function handleImageUpload(inputEl, previewEl) {
  const file = inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    previewEl.src = e.target.result;
    previewEl.classList.add('show');
  };
  reader.readAsDataURL(file);
}

// ─── Export to global ─────────────────────────────────────────
window.AppUtils = {
  showPage, showToast, showLoading, hideLoading,
  showModal, closeModal, formatTime, generateId,
  handleOfficerRegister, handleOTPVerify, handleOfficerLogin,
  handleUserEnter, logout, toggleNotifPanel, closeNotifPanel,
  clearAllNotifs, startNavigation, stopNavigation,
  initOTPInputs, handleImageUpload, addNotification,
};

/* =========================================================
   THEME SWITCHER
========================================================= */

function toggleTheme() {
  document.body.classList.toggle('light-mode');

  const isLight = document.body.classList.contains('light-mode');

  /* simpan tema */
  localStorage.setItem(
    'theme',
    isLight ? 'light' : 'dark'
  );

  updateThemeIcon();
}

/* update icon */
function updateThemeIcon() {
  const btn = document.getElementById('themeToggleBtn');

  if (!btn) return;

  if (document.body.classList.contains('light-mode')) {
    btn.innerHTML = '☀️';
  } else {
    btn.innerHTML = '🌙';
  }
}

/* load theme saat website dibuka */
window.addEventListener('DOMContentLoaded', () => {

  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
  }

  updateThemeIcon();
});

