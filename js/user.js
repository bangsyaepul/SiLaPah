// ============================================================
// USER.JS - Halaman Warga/User
// Sistem Pelaporan Sampah Liar
// ============================================================

'use strict';

// ─── User Dashboard ───────────────────────────────────────────
function loadUserDashboard() {

  $('user-name-display').textContent = 'Warga';

  loadUserReportsRealtime();
}

function renderUserReports() {
  const container = $('user-report-list');
  if (!container) return;

  const userReports = Object.entries(AppState.reports || {})
    .map(([id, r]) => ({ ...r, id }))
    .filter(r => r.reporterUid === AppState.currentUser?.uid)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (userReports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📸</div>
        <div class="empty-title">Belum Ada Laporan</div>
        <div class="empty-desc">Laporkan sampah liar di sekitar Anda untuk lingkungan yang lebih bersih</div>
      </div>`;
    return;
  }

  container.innerHTML = userReports.map(r => userReportCardHTML(r)).join('');
}

function userReportCardHTML(r) {
  const statusConfig = {
    pending: { label: 'Menunggu Petugas', class: 'badge-pending', icon: '⏳' },
    progress: { label: 'Sedang Dibersihkan', class: 'badge-progress', icon: '🚛' },
    done: { label: 'Selesai', class: 'badge-done', icon: '✅' },
  };
  const st = statusConfig[r.status] || statusConfig.pending;

  const trackerProgress = { pending: 0, progress: 50, done: 100 }[r.status] || 0;

  return `
    <div class="report-card" onclick="openUserReportDetail('${r.id}')">
      ${r.imageBase64 ? `<img class="report-card-img" src="${r.imageBase64}" alt="Foto sampah">` : ''}
      <div class="report-card-header">
        <div class="report-card-title">${r.location || 'Lokasi tidak diketahui'}</div>
        <span class="badge ${st.class}">${st.icon} ${st.label}</span>
      </div>
      <div class="report-card-meta">
  <span>👤 ${r.reporterName || 'Anonim'}</span>

  <span>
    🗂️ ${r.category || '-'}
  </span>

  <span>
    🕐 ${AppUtils.formatTime(r.createdAt)}
  </span>

  ${r.officerName
    ? `<span>👮 ${r.officerName}</span>`
    : ''
  }
</div>

      <!-- TRACKER MODERN -->
<div class="modern-tracker">

  <div class="modern-tracker-line">
    <div 
      class="modern-tracker-line-fill"
      style="width:${trackerProgress}%">
    </div>
  </div>

  <div class="modern-tracker-steps">

    <!-- Step 1 -->
    <div class="modern-step done">
      <div class="modern-step-circle">
        📝
      </div>
      <div class="modern-step-text">
        Dilaporkan
      </div>
    </div>

    <!-- Step 2 -->
    <div class="modern-step 
      ${r.status === 'progress' || r.status === 'done' ? 'done' : ''}
      ${r.status === 'progress' ? 'active' : ''}">
      
      <div class="modern-step-circle">
        🚛
      </div>

      <div class="modern-step-text">
        Diproses
      </div>
    </div>

    <!-- Step 3 -->
    <div class="modern-step 
      ${r.status === 'done' ? 'done' : ''}">
      
      <div class="modern-step-circle">
        ✅
      </div>

      <div class="modern-step-text">
        Selesai
      </div>
    </div>

  </div>
</div>

      ${r.coords ? `
        <div class="report-card-footer" style="margin-top:8px">
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openUserMap('${r.id}')">📍 Lihat Peta</button>
          ${r.status === 'progress' ? `<span style="font-size:12px;color:var(--green-light)">🚛 Petugas sedang menuju Lokasi</span>` : ''}
        </div>` : ''}
    </div>`;
}

// ============================================================
// RENDER USER STATS
// ============================================================

// ============================================================
// RENDER USER STATS
// ============================================================

function renderUserStats() {

  // ambil semua laporan user
  const reports = Object.entries(AppState.reports || {})
    .map(([id, r]) => ({
      id,
      ...r
    }))
    .filter(r =>
      r.reporterUid === AppState.currentUser?.uid
    );

  // hitung statistik
  const total = reports.length;

  const pending = reports.filter(r =>
    r.status === 'pending'
  ).length;

  const progress = reports.filter(r =>
    r.status === 'progress'
  ).length;

  const done = reports.filter(r =>
    r.status === 'done'
  ).length;

  // ambil element
  const totalEl =
    document.getElementById('user-stat-total');

  const pendingEl =
    document.getElementById('user-stat-pending');

  const progressEl =
    document.getElementById('user-stat-progress');

  const doneEl =
    document.getElementById('user-stat-done');

  // update UI
  if (totalEl) {
    totalEl.textContent = total;
  }

  if (pendingEl) {
    pendingEl.textContent = pending;
  }

  if (progressEl) {
    progressEl.textContent = progress;
  }

  if (doneEl) {
    doneEl.textContent = done;
  }
}

function openUserMap(reportId) {

  const r = AppState.reports[reportId];

  if (!r?.coords) {

    return AppUtils.showToast(
      'Koordinat tidak tersedia',
      'warning'
    );
  }

  // buka map
  OfficerApp.initUserMap(
    r.coords,
    reportId
  );

  // realtime lokasi petugas
  listenOfficerLocations(
    reportId,
    r.category
  );
}

let officerMarkers = {};

function listenOfficerLocations(
  reportId,
  reportCategory
) {

  const map = AppState.userMap;

  if (!map) return;

  const officerRef =
    window.APP_CONFIG.db.ref(
      'officer_locations'
    );

  officerRef.off();

  officerRef.on('value', snapshot => {

    const data = snapshot.val() || {};

    // hapus marker lama
    Object.values(officerMarkers)
      .forEach(marker => {
        map.removeLayer(marker);
      });

    officerMarkers = {};

    let html = '';

    Object.entries(data).forEach(([id, loc]) => {

      // hanya kategori sama
      if (
        loc.category !== reportCategory
      ) return;

      // buat marker
      const marker = L.marker([
        loc.lat,
        loc.lng
      ])
      .addTo(map)
      .bindPopup(
        `🚛 ${loc.officerName}`
      );

      officerMarkers[id] = marker;

      // tampil realtime list
      html += `
        <div style="
          background:rgba(255,255,255,0.05);
          padding:10px;
          border-radius:10px;
          border:1px solid rgba(255,255,255,0.08)
        ">
          🚛 ${loc.officerName}
          <br>
          <small>
            ${loc.category}
          </small>
        </div>
      `;
    });

    const listEl =
      document.getElementById(
        'live-officer-list'
      );

    if (listEl) {

      listEl.innerHTML =
        html ||
        `
        <div style="
          font-size:12px;
          color:var(--text-muted)
        ">
          Belum ada petugas menuju lokasi
        </div>
        `;
    }

  });
}


// ─── Report Detail (User View) ────────────────────────────────
function openUserReportDetail(reportId) {
  const r = AppState.reports[reportId];
  if (!r) return;

  $('user-detail-location').textContent = r.location || '-';
  $('user-detail-time').textContent = AppUtils.formatTime(r.createdAt);
  $('user-detail-desc').textContent = r.description || '-';
  $('user-detail-category').textContent = r.category || '-';
  $('user-detail-img').style.display = r.imageBase64 ? 'block' : 'none';
  if (r.imageBase64) $('user-detail-img').src = r.imageBase64;
  $('user-detail-officer').textContent = r.officerName || 'Belum ada petugas';

  const statusMap = {
    pending: '⏳ Menunggu Petugas',
    progress: '🚛 Sedang Dibersihkan',
    done: '✅ Selesai Dibersihkan'
  };
  $('user-detail-status').textContent = statusMap[r.status] || statusMap.pending;

  $('user-detail-map-btn').onclick = () => {
    AppUtils.closeModal('user-detail-modal');
    openUserMap(reportId);
  };
  $('user-detail-map-btn').style.display = r.coords ? 'flex' : 'none';

  AppUtils.showModal('user-detail-modal');
}

// ─── Submit Report ────────────────────────────────────────────
let reportLocation = null;
let reportImageBase64 = null;

function openReportForm() {
  AppUtils.showPage('page-user-report');
  reportLocation = null;
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

      // Reverse geocode
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=id`);
        const data = await res.json();
        const addr = data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
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
    // Compress image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 800;
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

  const reporterName = document
    .getElementById('reporter-name')
    .value
    .trim();

  if (!reporterName) {
    AppUtils.showToast('Nama wajib diisi', 'warning');
    return;
  }

  // Simpan nama terakhir
  localStorage.setItem('guestReporterName', reporterName);

  // Buat user guest jika belum ada
if (!AppState.currentUser || !AppState.currentUser.uid) {
  AppState.currentUser = {
    uid: 'guest-user',
    name: reporterName,
    role: 'user'
  };

    localStorage.setItem(
      'currentUser',
      JSON.stringify(AppState.currentUser)
    );
  }

  const desc = $('report-desc').value.trim();
  const category = $('report-category').value;
  const locText = $('report-location-text').textContent;
  if (!category) {
  return AppUtils.showToast(
    'Pilih kategori sampah',
    'warning'
  );
}

  if (!desc) {
    return AppUtils.showToast(
      'Tambahkan deskripsi lokasi sampah',
      'warning'
    );
  }

  if (!reportLocation) {
    return AppUtils.showToast(
      'Dapatkan lokasi Anda terlebih dahulu',
      'warning'
    );
  }

  AppUtils.showLoading('Mengirim laporan...');

  const reportData = {
    reporterUid: AppState.currentUser.uid,
    reporterName: reporterName,
    location: locText,
    description: desc,
    category: category,
    coords: reportLocation,
    status: 'pending',
    createdAt: Date.now(),
    imageBase64: reportImageBase64 || null,
    officerName: null,
    officerNavigating: false,
    officerArrived: false,
  };

  try {
    const newRef = window.APP_CONFIG.db
      .ref('reports')
      .push();

    await newRef.set(reportData);

    AppUtils.hideLoading();

    AppUtils.showToast(
      'Laporan berhasil dikirim!',
      'success'
    );

    AppUtils.showPage('page-user-dashboard');

    // reset form
    reportLocation = null;
    reportImageBase64 = null;

    $('report-form').reset();

    $('report-location-text').textContent =
      'Tekan untuk mendapatkan lokasi';

    $('report-img-preview').classList.remove('show');

  } catch (err) {
    AppUtils.hideLoading();

    console.error(err);

    AppUtils.showToast(
      'Gagal mengirim laporan: ' + err.message,
      'error'
    );
  }
}

  let userRealtimeInitialized = false;
function loadUserReportsRealtime() {

  // hanya user login
  if (
    !AppState.currentUser ||
    AppState.currentUser.role !== 'user'
  ) return;

  const reportsRef =
    window.APP_CONFIG.db.ref('reports');

  reportsRef.off();

  reportsRef.on('value', snapshot => {

    const oldReports = AppState.reports || {};

    AppState.reports =
      snapshot.val() || {};

    // ================================
    // INITIAL LOAD
    // ================================
    if (!userRealtimeInitialized) {

      renderUserReports();
      renderUserStats();

      userRealtimeInitialized = true;

      return;
    }

    // ================================
    // CEK PERUBAHAN
    // ================================
    Object.entries(AppState.reports).forEach(([id, report]) => {

      // hanya laporan milik user ini
      if (
        report.reporterUid !==
        AppState.currentUser?.uid
      ) return;

      const oldReport = oldReports[id];

      // skip jika laporan baru pertama muncul
      if (!oldReport) return;

      // =========================================
      // STATUS BERUBAH
      // =========================================
      if (oldReport.status !== report.status) {

        // progress
        if (report.status === 'progress') {

          AppUtils.showToast(
            '🚛 Petugas sedang menuju lokasi Anda',
            'success'
          );

          // buka map otomatis
          if (report.coords) {

            setTimeout(() => {

              AppUtils.showPage(
                'page-user-map'
              );

              openUserMap(id);

            }, 1200);
          }
        }

        // selesai
        if (report.status === 'done') {

          AppUtils.showToast(
            '✅ Laporan selesai dibersihkan',
            'success'
          );
        }

        // pending
        if (report.status === 'pending') {

          AppUtils.showToast(
            '⏳ Laporan menunggu petugas',
            'warning'
          );
        }
      }

      // =========================================
      // PETUGAS MULAI NAVIGASI
      // =========================================
      if (
        oldReport.officerNavigating !==
        report.officerNavigating
      ) {

        if (report.officerNavigating) {

          AppUtils.showToast(
            '🗺️ Petugas sedang menuju lokasi',
            'success'
          );

          if (report.coords) {

            setTimeout(() => {

              AppUtils.showPage(
                'page-user-map'
              );

              openUserMap(id);

            }, 1000);
          }
        }
      }

      // =========================================
// PETUGAS TIBA
// =========================================
let arrivedNotificationShown = {};

if (
  oldReport.officerArrived !==
  report.officerArrived
) {

  // hanya jika benar-benar tiba
  if (report.officerArrived === true) {

    // notif hanya sekali
    if (!arrivedNotificationShown[id]) {

      arrivedNotificationShown[id] = true;

      // cek halaman aktif
      const currentPage =
        document.querySelector('.page.active');

      const allowedPages = [
        'page-user-dashboard',
        'page-user-map'
      ];

      if (
        currentPage &&
        allowedPages.includes(currentPage.id)
      ) {

        AppUtils.showToast(
          '📍 Petugas telah tiba di lokasi',
          'success'
        );

        // browser notification
        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {

          new Notification(
            "SiLaPah",
            {
              body:
                "Petugas telah tiba di lokasi laporan Anda"
            }
          );
        }
      }
    }
  }
}

    });

    renderUserReports();
    renderUserStats();
  });
}

// ─── Export ───────────────────────────────────────────────────
window.UserApp = {
  loadUserDashboard, renderUserReports, openReportForm,
  getReportLocation, handleReportImageCamera, handleReportImageGallery,
  handleReportImageChange, submitReport, openUserReportDetail, openUserMap,
};

// Global onclick handlers
window.loadUserDashboard = loadUserDashboard;
window.openReportForm = openReportForm;
window.getReportLocation = getReportLocation;
window.handleReportImageCamera = handleReportImageCamera;
window.handleReportImageGallery = handleReportImageGallery;
window.handleReportImageChange = handleReportImageChange;
window.submitReport = submitReport;
window.openUserReportDetail = openUserReportDetail;
window.openUserMap = openUserMap;
window.renderUserStats = renderUserStats;
window.loadUserReportsRealtime = loadUserReportsRealtime;

