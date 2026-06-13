// ============================================================
// USER.JS - Halaman Warga/User
// Sistem Pelaporan Sampah Liar
// ============================================================

'use strict';

// ─── User Dashboard ───────────────────────────────────────────
function loadUserDashboard() {
  $('user-name-display').textContent = AppState.currentUser?.name || 'Warga';
  loadUserReportsRealtime();
}

function renderUserReports() {
  renderFilteredUserReports();
}

function userReportCardHTML(r) {
  const statusConfig = {
    pending:      { label: 'Menunggu Petugas',        class: 'badge-pending',      icon: '⏳' },
    progress:     { label: 'Sedang Dibersihkan',       class: 'badge-progress',     icon: '🚛' },
    transporting: { label: 'Mengantarkan ke TPS',      class: 'badge-transporting', icon: '🏭' },
    done:         { label: 'Selesai',                   class: 'badge-done',         icon: '✅' },
  };
  const st = statusConfig[r.status] || statusConfig.pending;

  // Progress tracker: pending=0, progress=33, transporting=66, done=100
  // FIX 2: Gunakan nilai lebih tepat agar garis benar-benar tersambung ke setiap step
  const trackerProgress = { pending: 0, progress: 36, transporting: 68, done: 100 }[r.status] || 0;

  const showOfficerInfo = r.officerName && (r.status === 'progress' || r.status === 'transporting' || r.status === 'done');

  // ── Estimasi countdown (hanya saat status pending) ──────────────────────────
  const estimasiHTML = r.status === 'pending' && r.createdAt
    ? `<div id="countdown-card-${r.id}" class="estimasi-countdown-wrap"></div>`
    : '';

  return `
    <div class="report-card" onclick="openUserReportDetail('${r.id}')">
      ${r.imageBase64 ? `
        <div class="report-card-foto-wrap" id="foto-wrap-${r.id}">
          <button class="btn-lihat-foto" onclick="event.stopPropagation();toggleFotoKartu('${r.id}')">
            Lihat Foto Laporan Sampah
          </button>
          <img class="report-card-img report-card-img-hidden" id="foto-kartu-${r.id}" src="${r.imageBase64}" alt="Foto sampah"
            onclick="event.stopPropagation();openImageViewer(this.src)">
        </div>` : ''}
      <div class="report-card-header">
        <div class="report-card-title">${r.location || 'Lokasi tidak diketahui'}</div>
        <span class="badge ${st.class}">${st.icon} ${st.label}</span>
      </div>
      <div class="report-card-meta">
        <span>👤 ${r.reporterName || 'Anonim'}</span>
        <span>🕐 ${AppUtils.formatTime(r.createdAt)}</span>
        ${r.category ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(78,203,141,0.12);border:1px solid rgba(78,203,141,0.3);border-radius:10px;padding:2px 8px;font-size:11px;color:var(--green-light);font-weight:600">🗂️ ${r.category}</span>` : ''}
        ${showOfficerInfo ? `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(78,203,141,0.07);border:1px solid rgba(78,203,141,0.18);border-radius:8px;margin-top:4px">
            <span style="font-size:14px">👮</span>
            <div>
              <span style="font-size:11px;font-weight:700;color:var(--text-primary)">${r.officerName}</span>
              ${r.officerCategory ? `<span style="font-size:10px;color:var(--green-light);margin-left:5px">· ${r.officerCategory}</span>` : ''}
            </div>
          </div>` : ''}
        ${estimasiHTML}
      </div>

      <!-- TRACKER MODERN (4 langkah) -->
      <div class="modern-tracker">
        <div class="modern-tracker-line">
          <div class="modern-tracker-line-fill" style="width:${trackerProgress}%"></div>
        </div>
        <div class="modern-tracker-steps">
          <!-- Step 1: Dilaporkan -->
          <div class="modern-step done">
            <div class="modern-step-circle">📝</div>
            <div class="modern-step-text">Dilaporkan</div>
          </div>
          <!-- Step 2: Diproses -->
          <div class="modern-step ${r.status === 'progress' || r.status === 'transporting' || r.status === 'done' ? 'done' : ''} ${r.status === 'progress' ? 'active' : ''}">
            <div class="modern-step-circle">🚛</div>
            <div class="modern-step-text">Diproses</div>
          </div>
          <!-- Step 3: Ke TPS -->
          <div class="modern-step ${r.status === 'transporting' || r.status === 'done' ? 'done' : ''} ${r.status === 'transporting' ? 'active' : ''}">
            <div class="modern-step-circle">🏭</div>
            <div class="modern-step-text">Ke TPS</div>
          </div>
          <!-- Step 4: Selesai -->
          <div class="modern-step ${r.status === 'done' ? 'done' : ''}">
            <div class="modern-step-circle">✅</div>
            <div class="modern-step-text">Selesai</div>
          </div>
        </div>
      </div>

      ${r.coords && r.status !== 'done' ? `
        <div class="report-card-footer" style="margin-top:8px">
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openUserMap('${r.id}')">📍 Lihat Peta</button>
          ${r.status === 'progress' ? `<span style="font-size:12px;color:var(--green-light)">🚛 Petugas sedang menuju Lokasi</span>` : ''}
          ${r.status === 'transporting' ? `<span style="font-size:12px;color:#f0c030">🏭 Menuju TPS</span>` : ''}
        </div>` : ''}
    </div>`;
}

function toggleFotoKartu(reportId) {
  const img = document.getElementById('foto-kartu-' + reportId);
  const btn = document.querySelector('#foto-wrap-' + reportId + ' .btn-lihat-foto');
  if (!img || !btn) return;
  const visible = !img.classList.contains('report-card-img-hidden');
  if (visible) {
    img.classList.add('report-card-img-hidden');
    btn.textContent = 'Lihat Foto Laporan Sampah';
  } else {
    img.classList.remove('report-card-img-hidden');
    btn.textContent = ' Sembunyikan Foto';
  }
}

function renderUserStats() {
  const reports = Object.entries(AppState.reports || {})
    .map(([id, r]) => ({ id, ...r }))
    .filter(r => r.reporterUid === AppState.currentUser?.uid);

  const total       = reports.length;
  const pending     = reports.filter(r => r.status === 'pending').length;
  const progress    = reports.filter(r => r.status === 'progress' || r.status === 'transporting').length;
  const done        = reports.filter(r => r.status === 'done').length;

  const totalEl    = document.getElementById('user-stat-total');
  const pendingEl  = document.getElementById('user-stat-pending');
  const progressEl = document.getElementById('user-stat-progress');
  const doneEl     = document.getElementById('user-stat-done');

  if (totalEl)    totalEl.textContent    = total;
  if (pendingEl)  pendingEl.textContent  = pending;
  if (progressEl) progressEl.textContent = progress;
  if (doneEl)     doneEl.textContent     = done;
}

function openUserMap(reportId) {
  const r = AppState.reports[reportId];
  if (!r?.coords) return AppUtils.showToast('Koordinat tidak tersedia', 'warning');
  OfficerApp.initUserMap(r.coords, reportId);
}

// ─── Report Detail (User View) ────────────────────────────────
function openUserReportDetail(reportId) {
  const r = AppState.reports[reportId];
  if (!r) return;

  $('user-detail-location').textContent = r.location || '-';
  $('user-detail-time').textContent     = AppUtils.formatTime(r.createdAt);
  $('user-detail-desc').textContent     = r.description || '-';
  // Foto: sembunyikan dulu, tampilkan hanya saat tombol diklik
  const fotoBtn  = $('user-detail-foto-btn');
  const fotoImg  = $('user-detail-img');
  if (fotoBtn && fotoImg) {
    if (r.imageBase64) {
      fotoImg.src           = r.imageBase64;
      fotoImg.style.display = 'none';
      fotoBtn.style.display = 'flex';
      fotoBtn.textContent   = 'Lihat Foto Laporan Sampah';
      fotoBtn.onclick = () => {
        const visible = fotoImg.style.display !== 'none';
        fotoImg.style.display = visible ? 'none' : 'block';
        fotoBtn.textContent   = visible ? 'Lihat Foto Laporan Sampah' : '🙈 Sembunyikan Foto';
      };
    } else {
      fotoBtn.style.display = 'none';
      fotoImg.style.display = 'none';
    }
  }

  // Info petugas lengkap di modal detail
  const officerEl = $('user-detail-officer');
  if (officerEl) {
    if (r.officerName) {
      officerEl.innerHTML = `
        <span style="font-weight:700">${r.officerName}</span>
        ${r.officerCategory ? `<span style="font-size:11px;color:var(--green-light);margin-left:5px">· ${r.officerCategory}</span>` : ''}`;
    } else {
      officerEl.textContent = 'Belum ada petugas';
    }
  }

  const statusMap = {
    pending:      '⏳ Menunggu Petugas',
    progress:     '🚛 Sedang Dibersihkan',
    transporting: '🏭 Mengantarkan Sampah ke TPS',
    done:         '✅ Selesai Dibersihkan',
  };
  $('user-detail-status').textContent = statusMap[r.status] || statusMap.pending;

  // Estimasi countdown di modal detail (hanya status pending)
  let detailEstEl = document.getElementById('user-detail-estimasi');
  if (!detailEstEl) {
    detailEstEl = document.createElement('div');
    detailEstEl.id = 'user-detail-estimasi';
    const statusEl = $('user-detail-status');
    if (statusEl && statusEl.parentNode) {
      statusEl.parentNode.insertBefore(detailEstEl, statusEl.nextSibling);
    }
  }
  if (r.status === 'pending' && r.createdAt) {
    detailEstEl.style.display = '';
    detailEstEl.innerHTML = `<div id="countdown-modal-${reportId}" class="estimasi-countdown-wrap" style="margin-top:8px"></div>`;
    // Mount countdown ke modal setelah DOM tersedia
    requestAnimationFrame(() => startCountdown(`countdown-modal-${reportId}`, r.createdAt, r.id, true));
  } else {
    detailEstEl.style.display = 'none';
    detailEstEl.innerHTML = '';
  }

  $('user-detail-map-btn').onclick = () => {
    AppUtils.closeModal('user-detail-modal');
    openUserMap(reportId);
  };
  // FIX 4: Sembunyikan tombol peta jika laporan sudah selesai
  $('user-detail-map-btn').style.display = (r.coords && r.status !== 'done') ? 'flex' : 'none';

  AppUtils.showModal('user-detail-modal');
}

// ─── Submit Report ────────────────────────────────────────────
let reportLocation    = null;
let reportImageBase64 = null;

function openReportForm() {
  AppUtils.showPage('page-user-report');
  reportLocation    = null;
  reportImageBase64 = null;
  $('report-location-text').textContent = 'Tekan untuk mendapatkan lokasi';
  $('report-location-text').classList.remove('filled');
  $('report-img-preview').classList.remove('show');
  $('report-form').reset();
}

function getReportLocation() {
  if (!navigator.geolocation) return AppUtils.showToast('GPS tidak tersedia', 'error');

  AppUtils.showLoading('Mendapatkan lokasi Anda...');

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      reportLocation = { lat: latitude, lng: longitude };

      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=id`);
        const data = await res.json();
        const addr  = data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        const short = addr.split(',').slice(0,3).join(', ');
        $('report-location-text').textContent = short;
        $('report-location-text').classList.add('filled');
      } catch {
        $('report-location-text').textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        $('report-location-text').classList.add('filled');
      }

      AppUtils.hideLoading();
      AppUtils.showToast('Lokasi berhasil didapatkan', 'success');
    },
    err => {
      AppUtils.hideLoading();
      AppUtils.showToast('Gagal mendapatkan lokasi: ' + err.message, 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

function handleReportImageCamera() {
  const input = $('report-img-input-camera');
  input.setAttribute('capture', 'environment');
  input.click();
}

function handleReportImageGallery() {
  const input = $('report-img-input-gallery');
  input.removeAttribute('capture');
  input.click();
}

function handleReportImageChange(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const img  = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX    = 800;
      let w = img.width, h = img.height;
      if (w > MAX) { h = h * MAX / w; w = MAX; }
      if (h > MAX) { w = w * MAX / h; h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      reportImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
      $('report-img-preview').src = reportImageBase64;
      $('report-img-preview').classList.add('show');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitReport(e) {
  e.preventDefault();

  const reporterName = document.getElementById('reporter-name').value.trim();
  if (!reporterName) { AppUtils.showToast('Nama wajib diisi', 'warning'); return; }

  localStorage.setItem('guestReporterName', reporterName);

  if (!AppState.currentUser || !AppState.currentUser.uid) {
    // Reuse UID permanen agar laporan selalu muncul di browser yang sama
    let persistentUid = localStorage.getItem('guestUid');
    if (!persistentUid) {
      persistentUid = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2,5);
      localStorage.setItem('guestUid', persistentUid);
    }
    AppState.currentUser = { uid: persistentUid, name: reporterName, role: 'user' };
    localStorage.setItem('currentUser', JSON.stringify(AppState.currentUser));
  }

  const desc     = $('report-desc').value.trim();
  const category = $('report-category').value;
  const locText  = $('report-location-text').textContent;

  if (!category)  return AppUtils.showToast('Pilih kategori sampah', 'warning');
  if (!desc)      return AppUtils.showToast('Tambahkan deskripsi lokasi sampah', 'warning');
  if (!reportLocation) return AppUtils.showToast('Dapatkan lokasi Anda terlebih dahulu', 'warning');

  AppUtils.showLoading('Mengirim laporan...');

  const reportData = {
    reporterUid:      AppState.currentUser.uid,
    reporterName:     reporterName,
    location:         locText,
    description:      desc,
    category:         category,
    coords:           reportLocation,
    status:           'pending',
    createdAt:        Date.now(),
    imageBase64:      reportImageBase64 || null,
    officerName:      null,
    officerCategory:  null,
    officerNavigating:   false,
    officerArrived:      false,
    officerTransporting: false,
  };

  try {
    const newRef = window.APP_CONFIG.db.ref('reports').push();
    await newRef.set(reportData);

    AppUtils.hideLoading();
    AppUtils.showToast('Laporan berhasil dikirim!', 'success');
    AppUtils.showPage('page-user-dashboard');

    reportLocation    = null;
    reportImageBase64 = null;
    $('report-form').reset();
    $('report-location-text').textContent = 'Tekan untuk mendapatkan lokasi';
    $('report-img-preview').classList.remove('show');

  } catch (err) {
    AppUtils.hideLoading();
    console.error(err);
    AppUtils.showToast('Gagal mengirim laporan: ' + err.message, 'error');
  }
}

// ─── Realtime Listener (Warga) ────────────────────────────────
// Menyimpan status event yang sudah dinotifikasikan (key = reportId + event)
// agar notifikasi tidak muncul berkali-kali
const _notifiedEvents = {};

let userRealtimeInitialized = false;

function loadUserReportsRealtime() {
  if (!AppState.currentUser || AppState.currentUser.role !== 'user') return;

  const reportsRef = window.APP_CONFIG.db.ref('reports');
  reportsRef.off();

  reportsRef.on('value', snapshot => {
    const newData   = snapshot.val() || {};
    const oldData   = AppState.reports || {};

    // Simpan data baru
    AppState.reports = newData;

    // Initial load — tidak perlu cek perubahan
    if (!userRealtimeInitialized) {
      userRealtimeInitialized = true;
      renderUserReports();
      renderUserStats();
      return;
    }

    // ──────────────────────────────────────────
    // Cek perubahan HANYA pada laporan MILIK user ini
    // ──────────────────────────────────────────
    const myUid = AppState.currentUser?.uid;

    Object.entries(newData).forEach(([id, report]) => {
      // ← FILTER: abaikan laporan dari pelapor lain
      if (report.reporterUid !== myUid) return;

      const old = oldData[id] || {};

      // Skip laporan yang baru muncul (belum ada di old)
      if (!old.createdAt) return;

      // Helper: cek & tandai event agar tidak duplikat
      const once = (eventKey) => {
        const k = `${id}_${eventKey}`;
        if (_notifiedEvents[k]) return false;
        _notifiedEvents[k] = true;
        return true;
      };

      // ── STATUS BERUBAH ──
      if (old.status !== report.status) {

        if (report.status === 'progress' && once('status_progress')) {
          AppUtils.showToast('🚛 Petugas sedang menuju lokasi Anda', 'success');
          if (report.coords) {
            setTimeout(() => { AppUtils.showPage('page-user-map'); openUserMap(id); }, 1200);
          }
        }

        if (report.status === 'transporting' && once('status_transporting')) {
          AppUtils.showToast('🏭 Petugas sedang mengantarkan sampah ke TPS', 'info', 5000);
        }

        if (report.status === 'done' && once('status_done')) {
          AppUtils.showToast('✅ Laporan selesai dibersihkan!', 'success');
          // Hapus elemen laporan ini dari peta jika sedang terbuka
          if (window.clearMapOnReportDone) {
            window.clearMapOnReportDone(id);
          } else if (window.OfficerApp && AppState.userMapReportId === id) {
            // Fallback: tutup peta jika tidak ada fungsi clear
            setTimeout(() => {
              window.OfficerApp.backFromUserMap && window.OfficerApp.backFromUserMap();
            }, 1500);
          }
        }

        if (report.status === 'pending' && once('status_pending') && old.status) {
          AppUtils.showToast('⏳ Laporan menunggu petugas', 'warning');
        }
      }

      // ── PETUGAS MULAI NAVIGASI (officerNavigating) ──
      if (old.officerNavigating !== report.officerNavigating && report.officerNavigating === true) {
        if (once('nav_started')) {
          AppUtils.showToast('🗺️ Petugas sedang menuju lokasi Anda!', 'success');
          if (report.coords) {
            setTimeout(() => { AppUtils.showPage('page-user-map'); openUserMap(id); }, 1000);
          }
        }
      }

      // ── PETUGAS TIBA (officerArrived) — SATU KALI SAJA ──
      if (old.officerArrived !== report.officerArrived && report.officerArrived === true) {
        if (once('arrived')) {
          AppUtils.showToast('📍 Petugas telah tiba di lokasi!', 'success', 5000);

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('SiLaPah', {
              body: 'Petugas telah tiba di lokasi laporan Anda',
              icon: '/favicon.ico',
            });
          }
        }
      }

      // ── PETUGAS MENGANTARKAN KE TPS (officerTransporting) — SATU KALI ──
      if (old.officerTransporting !== report.officerTransporting && report.officerTransporting === true) {
        if (once('transporting')) {
          AppUtils.showToast('🏭 Sampah sedang diantarkan ke TPS oleh petugas', 'info', 5000);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('SiLaPah', {
              body: `Petugas${report.officerName ? ' ' + report.officerName : ''} sedang mengantarkan sampah ke TPS`,
              icon: '/favicon.ico',
            });
          }
        }
      }
    });

    renderUserReports();   // builds tabs + filtered list
    renderUserStats();
  });
}

function logout() {
  // Bersihkan semua notif event guard
  Object.keys(_notifiedEvents).forEach(k => delete _notifiedEvents[k]);
  userRealtimeInitialized = false;
  stopAllCountdowns();
  localStorage.removeItem('currentUser');
  AppState.currentUser = null;
  AppUtils.showPage('page-home');
}

// ─── Filter State ─────────────────────────────────────────────
let _activeCatFilter = 'semua'; // 'semua' | nama kategori

const CATEGORY_ICONS = {
  'Organik':    '🍃',
  'Anorganik':  '♻️',
  'B3':         '⚗️',
  'Elektronik': '💻',
  'Medis':      '🏥',
  'Konstruksi': '🏗️',
  'Lainnya':    '🗑️',
};

function getUserReports() {
  return Object.entries(AppState.reports || {})
    .map(([id, r]) => ({ ...r, id }))
    .filter(r => r.reporterUid === AppState.currentUser?.uid)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// ─── Status Tab ───────────────────────────────────────────────
function switchUserStatusTab(status) { /* no-op */ }

// ─── Category Dropdown ────────────────────────────────────────
function buildUserCatDropdown() {
  const menu = document.getElementById('user-cat-dropdown-menu');
  if (!menu) return;
  const reports = getUserReports();
  const catCounts = {};
  let total = 0;
  reports.forEach(r => {
    const cat = r.category || 'Lainnya';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    total++;
  });
  const cats = Object.keys(catCounts).sort();
  let html = `<div class="user-cat-dropdown-item ${_activeCatFilter === 'semua' ? 'active' : ''}" onclick="selectUserCatFilter('semua')">
    <span class="cat-item-icon">📋</span><span>Semua Kategori</span><span class="cat-item-count">${total}</span>
  </div>`;
  cats.forEach(cat => {
    const icon = CATEGORY_ICONS[cat] || '🗑️';
    html += `<div class="user-cat-dropdown-item ${_activeCatFilter === cat ? 'active' : ''}" onclick="selectUserCatFilter('${cat}')">
      <span class="cat-item-icon">${icon}</span><span>${cat}</span><span class="cat-item-count">${catCounts[cat]}</span>
    </div>`;
  });
  menu.innerHTML = html;
}

function toggleUserCatDropdown() {
  buildUserCatDropdown();
  const menu = document.getElementById('user-cat-dropdown-menu');
  const btn  = document.getElementById('user-cat-dropdown-btn');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  if (btn) btn.classList.toggle('open', !isOpen);
}

function selectUserCatFilter(cat) {
  _activeCatFilter = cat;
  const label = document.getElementById('user-cat-dropdown-label');
  if (label) label.textContent = cat === 'semua' ? '🗂️ Semua Kategori' : `${CATEGORY_ICONS[cat] || '🗑️'} ${cat}`;
  const menu = document.getElementById('user-cat-dropdown-menu');
  const btn  = document.getElementById('user-cat-dropdown-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.classList.remove('open');
  renderFilteredUserReports();
}

// Tutup dropdown saat klik di luar
document.addEventListener('click', e => {
  const wrap = document.getElementById('user-cat-dropdown-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const menu = document.getElementById('user-cat-dropdown-menu');
    const btn  = document.getElementById('user-cat-dropdown-btn');
    if (menu) menu.classList.remove('open');
    if (btn)  btn.classList.remove('open');
  }
});

// ─── Filtered Render ──────────────────────────────────────────
function renderFilteredUserReports() {
  const container = document.getElementById('user-report-list');
  if (!container) return;

  let reports = getUserReports();

  // Filter kategori
  if (_activeCatFilter !== 'semua') {
    reports = reports.filter(r => (r.category || 'Lainnya') === _activeCatFilter);
  }

  if (reports.length === 0) {
    const icon = _activeCatFilter !== 'semua' ? (CATEGORY_ICONS[_activeCatFilter] || '🗑️') : '📸';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">Tidak Ada Laporan</div>
        <div class="empty-desc">Belum ada laporan yang sesuai dengan filter yang dipilih</div>
      </div>`;
    return;
  }

  container.innerHTML = reports.map(r => userReportCardHTML(r)).join('');
  // Mount hitung mundur ke semua kartu pending
  requestAnimationFrame(() => mountAllCountdowns(reports));
}

// Compat stubs
function setUserReportView() {}
function renderUserReportsByCategory() { renderFilteredUserReports(); }
function switchUserCatTab() {}
function buildUserCatTabs() {}

// ─── Countdown Engine ─────────────────────────────────────────
// Map: containerId → intervalId  (untuk cleanup agar tidak memory-leak)
const _countdownTimers = {};

const ESTIMASI_TARGET_SECS = 20 * 60; // 20 menit dalam detik

/**
 * startCountdown(containerId, createdAt, reportId, isModal)
 * Render & jalankan hitung mundur live di dalam elemen #containerId.
 * Jika waktu habis → tampilkan pesan "petugas mungkin sedang sibuk".
 */
function startCountdown(containerId, createdAt, reportId, isModal = false) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Bersihkan timer lama jika ada
  if (_countdownTimers[containerId]) {
    clearInterval(_countdownTimers[containerId]);
    delete _countdownTimers[containerId];
  }

  function render() {
    // Cek status laporan — jika sudah tidak pending, hentikan
    const report = AppState.reports?.[reportId];
    if (!report || report.status !== 'pending') {
      clearInterval(_countdownTimers[containerId]);
      delete _countdownTimers[containerId];
      if (el) el.innerHTML = '';
      return;
    }

    const elapsedSecs = Math.floor((Date.now() - createdAt) / 1000);
    const sisaSecs    = ESTIMASI_TARGET_SECS - elapsedSecs;

    if (sisaSecs > 0) {
      // ── Masih ada sisa waktu: tampilkan hitung mundur ──
      const m  = Math.floor(sisaSecs / 60);
      const s  = sisaSecs % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(s).padStart(2, '0');

      // Persen kemajuan (0 → 100 seiring waktu berlalu)
      const pct = Math.min(100, Math.round((elapsedSecs / ESTIMASI_TARGET_SECS) * 100));

      // Warna ring berubah: hijau → kuning → oranye (< 5 menit)
      const ringColor = sisaSecs < 5 * 60
        ? '#f07030'   // oranye — hampir habis
        : sisaSecs < 10 * 60
          ? '#f0c030' // kuning
          : '#4ecb8d'; // hijau

      const circumference = 2 * Math.PI * 18; // r=18
      const dash = circumference - (pct / 100) * circumference;

      el.innerHTML = `
        <div style="
          display:flex;align-items:center;gap:10px;
          padding:${isModal ? '10px 12px' : '6px 10px'};
          background:rgba(240,192,48,0.07);
          border:1px solid rgba(240,192,48,0.2);
          border-radius:12px;
          margin-top:${isModal ? '0' : '5px'}
        ">
          <!-- Ring countdown -->
          <div style="position:relative;width:44px;height:44px;flex-shrink:0">
            <svg width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(-90deg)">
              <!-- Track -->
              <circle cx="22" cy="22" r="18"
                fill="none" stroke="rgba(240,192,48,0.15)" stroke-width="3.5"/>
              <!-- Progress -->
              <circle cx="22" cy="22" r="18"
                fill="none"
                stroke="${ringColor}"
                stroke-width="3.5"
                stroke-linecap="round"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${dash}"
                style="transition:stroke-dashoffset 0.9s linear,stroke 0.4s"
              />
            </svg>
            <!-- Teks jam di tengah ring -->
            <div style="
              position:absolute;inset:0;
              display:flex;align-items:center;justify-content:center;
              flex-direction:column;gap:0
            ">
              <span style="
                font-size:${m > 9 ? '9' : '10'}px;
                font-weight:900;
                color:${ringColor};
                line-height:1;
                font-variant-numeric:tabular-nums;
                letter-spacing:-0.5px
              ">${mm}:${ss}</span>
            </div>
          </div>
          <!-- Teks kanan -->
          <div style="flex:1;min-width:0">
            <div style="font-size:${isModal ? '12' : '11'}px;font-weight:700;color:#f0c030;line-height:1.3">
              📬 Estimasi diterima petugas
            </div>
            <div style="font-size:10px;color:var(--text-muted,#8a9a8a);margin-top:2px">
              ${sisaSecs < 5*60
                ? '⚡ Segera direspons petugas'
                : `Laporan dikirim ${Math.floor(elapsedSecs/60)} menit lalu`
              }
            </div>
          </div>
        </div>`;
    } else {
      // ── Waktu habis: pesan informasi ──
      clearInterval(_countdownTimers[containerId]);
      delete _countdownTimers[containerId];

      el.innerHTML = `
        <div style="
          display:flex;align-items:flex-start;gap:10px;
          padding:${isModal ? '10px 12px' : '7px 10px'};
          background:rgba(240,120,48,0.08);
          border:1px solid rgba(240,120,48,0.25);
          border-radius:12px;
          margin-top:${isModal ? '0' : '5px'}
        ">
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:rgba(240,120,48,0.15);
            border:1.5px solid rgba(240,120,48,0.35);
            display:flex;align-items:center;justify-content:center;
            font-size:18px;flex-shrink:0;margin-top:1px
          ">🚛</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:${isModal ? '12' : '11'}px;font-weight:700;color:#f07030;line-height:1.35">
              Petugas mungkin sedang membersihkan sampah yang lain
            </div>
            <div style="font-size:10px;color:var(--text-muted,#8a9a8a);margin-top:3px;line-height:1.4">
              Laporan Anda tetap dalam antrian dan akan segera ditindaklanjuti 🙏
            </div>
          </div>
        </div>`;
    }
  }

  render(); // render pertama seketika
  _countdownTimers[containerId] = setInterval(render, 1000);
}

/**
 * mountAllCountdowns — dipanggil setelah list di-render.
 * Cari semua container countdown kartu dan start timer-nya.
 */
function mountAllCountdowns(reports) {
  reports.forEach(r => {
    if (r.status !== 'pending' || !r.createdAt) return;
    const containerId = `countdown-card-${r.id}`;
    startCountdown(containerId, r.createdAt, r.id, false);
  });
}

/**
 * stopAllCountdowns — cleanup saat user logout / navigasi pergi.
 */
function stopAllCountdowns() {
  Object.entries(_countdownTimers).forEach(([id, timer]) => {
    clearInterval(timer);
    delete _countdownTimers[id];
  });
}


window.UserApp = {
  loadUserDashboard, renderUserReports, openReportForm,
  getReportLocation, handleReportImageCamera, handleReportImageGallery,
  handleReportImageChange, submitReport, openUserReportDetail, openUserMap,
  setUserReportView, renderUserReportsByCategory,
  switchUserStatusTab, toggleUserCatDropdown, selectUserCatFilter, renderFilteredUserReports,
};

window.loadUserDashboard         = loadUserDashboard;
window.openReportForm            = openReportForm;
window.getReportLocation         = getReportLocation;
window.handleReportImageCamera   = handleReportImageCamera;
window.handleReportImageGallery  = handleReportImageGallery;
window.handleReportImageChange   = handleReportImageChange;
window.submitReport              = submitReport;
window.openUserReportDetail      = openUserReportDetail;
window.openUserMap               = openUserMap;
window.renderUserStats           = renderUserStats;
window.loadUserReportsRealtime   = loadUserReportsRealtime;
window.setUserReportView         = setUserReportView;
window.renderUserReportsByCategory = renderUserReportsByCategory;
window.switchUserStatusTab       = switchUserStatusTab;
window.toggleUserCatDropdown     = toggleUserCatDropdown;
window.selectUserCatFilter       = selectUserCatFilter;
window.startCountdown            = startCountdown;
window.stopAllCountdowns         = stopAllCountdowns;
window.mountAllCountdowns        = mountAllCountdowns;
