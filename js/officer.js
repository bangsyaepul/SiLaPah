// ============================================================
// OFFICER.JS - Halaman Petugas
// Sistem Pelaporan Sampah Liar
// ============================================================

'use strict';

// ─── Officer Dashboard ────────────────────────────────────────
function loadOfficerDashboard() {
  $('officer-name-display').textContent = AppState.currentUser?.name || 'Petugas';
  setOfficerTab('all');
  renderOfficerReports();
  updateOfficerStats();
}

function setOfficerTab(tab) {
  AppState.officerCurrentTab = tab;
  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderOfficerReports();
}

function renderOfficerReports() {
  const container = $('officer-report-list');
  if (!container) return;

  let reports = Object.entries(
  AppState.reports || {}
)
.map(([id, r]) => ({
  ...r,
  id
}));

// =====================================
// FILTER BERDASARKAN KATEGORI PETUGAS
// =====================================

const officerCategory =
  AppState.currentUser?.category;

if (officerCategory) {

  reports = reports.filter(r =>

    r.category === officerCategory
  );
}

  // Filter by tab
  const tab = AppState.officerCurrentTab || 'all';
  if (tab === 'pending')
  reports = reports.filter(r =>
    !r.status || r.status === 'pending'
  );
  else if (tab === 'progress') reports = reports.filter(r => r.status === 'progress');
  else if (tab === 'done') reports = reports.filter(r => r.status === 'done');

  // Sort by newest
  reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">Tidak Ada Laporan</div>
        <div class="empty-desc">Belum ada laporan${tab !== 'all' ? ' dengan status ini' : ''}</div>
      </div>`;
    return;
  }

  container.innerHTML = `
  <div class="report-list-wrapper">
    ${reports.map(r => reportCardHTML(r)).join('')}
  </div>
`;
}

function reportCardHTML(r) {
  const statusConfig = {
    pending: { label: 'Belum Dibersihkan', class: 'badge-pending', icon: '⏳' },
    progress: { label: 'Sedang Dibersihkan', class: 'badge-progress', icon: '🚛' },
    done: { label: 'Selesai', class: 'badge-done', icon: '✅' },
  };
  const st = statusConfig[r.status] || statusConfig.pending;

  return `
    <div class="report-card" onclick="openReportDetail('${r.id}')">
      ${r.imageBase64 ? `<img class="report-card-img" src="${r.imageBase64}" alt="Foto sampah">` : ''}
      <div class="report-card-header">
        <div class="report-card-title">${r.location || 'Lokasi tidak diketahui'}</div>
        <span class="badge ${st.class}">${st.icon} ${st.label}</span>
      </div>
      <div class="report-card-meta">

  <span>
    👤 ${r.reporterName || 'Anonim'}
  </span>

  <span>
    🗂️ ${r.category || '-'}
  </span>

  <span>
    🕐 ${AppUtils.formatTime(r.createdAt)}
  </span>
        ${r.description ? `<span style="margin-top:4px;color:var(--text-primary);font-size:12px">${r.description.slice(0,60)}${r.description.length>60?'…':''}</span>` : ''}
      </div>
      <div class="report-card-footer">
        ${r.coords ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();viewOnMap('${r.id}')">📍 Lihat Peta</button>` : '<span></span>'}
        ${r.status !== 'done' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openReportDetail('${r.id}')">Kelola ›</button>` : ''}
      </div>
    </div>`;
}

function updateOfficerStats() {

  const reports =
    Object.values(AppState.reports || {});

  $('stat-total').textContent =
    reports.length;

  // pending termasuk status kosong
  $('stat-pending').textContent =
    reports.filter(r =>
      !r.status || r.status === 'pending'
    ).length;

  $('stat-progress').textContent =
    reports.filter(r =>
      r.status === 'progress'
    ).length;

  $('stat-done').textContent =
    reports.filter(r =>
      r.status === 'done'
    ).length;
}

// ─── Report Detail Modal ──────────────────────────────────────
function openReportDetail(reportId) {
  const r = AppState.reports[reportId];
  if (!r) return;

  $('detail-location').textContent = r.location || '-';
  $('detail-reporter').textContent = r.reporterName || 'Anonim';
  $('detail-time').textContent = AppUtils.formatTime(r.createdAt);
  $('detail-desc').textContent = r.description || '-';
  $('detail-category').textContent = r.category || '-';
  $('detail-img').style.display = r.imageBase64 ? 'block' : 'none';
  if (r.imageBase64) $('detail-img').src = r.imageBase64;

  // Status select
  $('detail-status').value = r.status || 'pending';

  // Simpan reportId aktif
  $('detail-modal').dataset.reportId = reportId;

  // Navigate button
  const navBtn = $('btn-navigate');
  if (r.coords && r.status !== 'done') {
    navBtn.style.display = 'flex';
    navBtn.onclick = () => {
      AppUtils.closeModal('detail-modal');
      AppUtils.startNavigation(reportId);
    };
  } else {
    navBtn.style.display = 'none';
  }

  AppUtils.showModal('detail-modal');
}

async function saveReportStatus() {

  const reportId =
    $('detail-modal').dataset.reportId;

  const status =
    $('detail-status').value;

  AppUtils.showLoading(
    'Menyimpan status...'
  );

  try {

    // data update
    const updateData = {
      status,
      officerName:
        AppState.currentUser.name,

      updatedAt: Date.now(),

      // realtime navigasi
      officerNavigating:
        status === 'progress',

      officerArrived:
        status === 'done',
    };

    // simpan ke firebase
    await window.APP_CONFIG.db
      .ref(`reports/${reportId}`)
      .update(updateData);

    // ====================================
    // JIKA STATUS PROGRESS
    // ====================================
    if (status === 'progress') {

      AppUtils.showToast(
        '🚛 Navigasi menuju lokasi dimulai',
        'success'
      );

      // buka map petugas otomatis
      const report =
        AppState.reports[reportId];

      if (report?.coords) {

        AppUtils.closeModal(
          'detail-modal'
        );

        // arahkan ke map petugas
        AppUtils.showPage(
          'page-officer-map'
        );

        // simpan report aktif
        AppState.navigatingTo =
          reportId;

        // mulai map navigasi
        initOfficerMap(
          report.coords,
          reportId
        );
      }
    }

    // ====================================
    // STATUS DONE
    // ====================================
    if (status === 'done') {

      await window.APP_CONFIG.db
  .ref(
    `officer_locations/${AppState.currentUser.uid}`
  )
  .remove();

      AppUtils.showToast(
        ' Laporan selesai dibersihkan',
        'success'
      );
    }

    AppUtils.closeModal(
      'detail-modal'
    );

    AppUtils.hideLoading();

  } catch (err) {

    AppUtils.hideLoading();

    AppUtils.showToast(
      'Gagal menyimpan: ' +
      err.message,
      'error'
    );
  }
}

// ─── Officer Map ──────────────────────────────────────────────
let officerMapInstance = null;
let officerMarker = null;
let targetMarker = null;
let routeControl = null;

function initOfficerMap(targetCoords, reportId) {
  const mapEl = $('officer-map-container');

  if (officerMapInstance) {
    officerMapInstance.remove();
    officerMapInstance = null;
  }

  officerMapInstance = L.map('officer-map-container', { zoomControl: false }).setView(
    [targetCoords.lat, targetCoords.lng], 15
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(officerMapInstance);

  // Target marker (sampah)
  const trashIcon = L.divIcon({
    html: `<div style="background:#e63946;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🗑️</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
  targetMarker = L.marker([targetCoords.lat, targetCoords.lng], { icon: trashIcon })
    .addTo(officerMapInstance)
    .bindPopup('📍 Lokasi Sampah Liar');

  // Officer marker
  if (AppState.officerLocation) {
    const officerIcon = L.divIcon({
      html: `<div style="background:#4ecb8d;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.4);animation:officer-pulse 1.5s ease infinite">🚛</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18],
    });
    officerMarker = L.marker(
      [AppState.officerLocation.lat, AppState.officerLocation.lng],
      { icon: officerIcon }
    ).addTo(officerMapInstance).bindPopup('🚛 Posisi Anda');

    // Draw route
    drawRoute(AppState.officerLocation, targetCoords);

    // Fit bounds
    const bounds = L.latLngBounds(
      [AppState.officerLocation.lat, AppState.officerLocation.lng],
      [targetCoords.lat, targetCoords.lng]
    );
    officerMapInstance.fitBounds(bounds, { padding: [40, 40] });
  }

  window.officerMapInstance = officerMapInstance;
  $('nav-report-location').textContent = AppState.reports[reportId]?.location || 'Lokasi Sampah';
  updateNavigation();
}

async function drawRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      if (window.routeLayer) officerMapInstance.removeLayer(window.routeLayer);
      window.routeLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4ecb8d', weight: 4, opacity: 0.8, dashArray: '10,5' }
      }).addTo(officerMapInstance);

      // ETA from OSRM
      const duration = Math.round(data.routes[0].duration / 60);
      const distKm = (data.routes[0].distance / 1000).toFixed(1);
      $('nav-distance') && ($('nav-distance').textContent = distKm < 1 ? Math.round(distKm*1000) + ' m' : distKm + ' km');
      $('nav-eta') && ($('nav-eta').textContent = duration + ' menit');
    }
  } catch (e) {
    // Fallback ke garis lurus
    if (window.routeLayer) officerMapInstance.removeLayer(window.routeLayer);
    window.routeLayer = L.polyline([
      [from.lat, from.lng], [to.lat, to.lng]
    ], { color: '#4ecb8d', weight: 4, dashArray: '10,5' }).addTo(officerMapInstance);
  }
}

function updateOfficerMapMarker(loc) {

  if (!officerMapInstance ||
      !officerMarker) return;

  officerMarker.setLatLng([
    loc.lat,
    loc.lng
  ]);

  // =================================
  // KIRIM POSISI PETUGAS REALTIME
  // =================================
  window.APP_CONFIG.db
  .ref(
    `officer_locations/${AppState.currentUser.uid}`
  )
  .set({

    officerId:
      AppState.currentUser.uid,

    officerName:
      AppState.currentUser.name,

    category:
      AppState.currentUser.category,

    reportId:
      AppState.navigatingTo,

    lat: loc.lat,
    lng: loc.lng,

    updatedAt: Date.now()
  });

  // redraw route
  const reportId =
    AppState.navigatingTo;

  if (
    reportId &&
    AppState.reports[reportId]?.coords
  ) {

    drawRoute(
      loc,
      AppState.reports[reportId].coords
    );
  }
}

function viewOnMap(reportId) {
  const r = AppState.reports[reportId];
  if (!r?.coords) return AppUtils.showToast('Koordinat tidak tersedia', 'warning');

  AppUtils.showPage('page-officer-map');
  initOfficerMap(r.coords, reportId);
  AppState.navigatingTo = reportId;
}

function backFromOfficerMap() {
  AppUtils.showPage('page-officer-dashboard');
}

// ─── User Map ─────────────────────────────────────────────────
let userMapInstance = null;
let userOfficerMarker = null;

function initUserMap(coords, reportId) {
  AppUtils.showPage('page-user-map');

  if (userMapInstance) {
    userMapInstance.remove();
    userMapInstance = null;
  }

  userMapInstance = L.map('user-map-container', { zoomControl: false }).setView(
    [coords.lat, coords.lng], 15
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(userMapInstance);

  // Trash marker
  const trashIcon = L.divIcon({
    html: `<div style="background:#e63946;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🗑️</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
  L.marker([coords.lat, coords.lng], { icon: trashIcon })
    .addTo(userMapInstance)
    .bindPopup('📍 Lokasi Sampah Anda');


  AppState.userMapInstance = userMapInstance;
  window.userMapInstance = userMapInstance;
  AppState.userMap = userMapInstance;

  // =====================================
// REALTIME PETUGAS BERDASARKAN REPORT
// =====================================

window.APP_CONFIG.db
  .ref('officer_locations')
  .on('value', snap => {

    const officers = snap.val();

    if (!officers) return;

    Object.values(officers).forEach(officer => {

      // hanya tampilkan petugas
      // yang menangani laporan ini
      if (officer.reportId !== reportId)
        return;

      // update marker realtime
      updateOfficerMarkerOnUserMap({
        lat: officer.lat,
        lng: officer.lng
      });

      // tampilkan nama petugas
      $('user-map-status').textContent =
        `🚛 ${officer.officerName} sedang menuju lokasi`;

    });

  });

  // Info card
  // simpan laporan aktif warga
  AppState.activeUserReportId = reportId;
  const r = AppState.reports[reportId];
  $('user-map-location').textContent = r?.location || 'Lokasi Laporan';
  const status = r?.status || 'pending';
  const stLabels = { pending: '⏳ Menunggu Petugas', progress: '🚛 Petugas Sedang Menuju Lokasi', done: ' Selesai Dibersihkan' };
  $('user-map-status').textContent = stLabels[status] || stLabels.pending;
}

function updateOfficerMarkerOnUserMap(loc) {
  if (!userMapInstance) return;

  const officerIcon = L.divIcon({
    html: `<div style="background:#4ecb8d;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🚛</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });

  if (userOfficerMarker) {
    userOfficerMarker.setLatLng([loc.lat, loc.lng]);
  } else {
    userOfficerMarker = L.marker([loc.lat, loc.lng], { icon: officerIcon })
      .addTo(userMapInstance)
      .bindPopup('🚛 Posisi Petugas');
  }
}

function backFromUserMap() {
  AppUtils.showPage('page-user-dashboard');
}

// ─── Export ───────────────────────────────────────────────────
window.OfficerApp = {
  loadOfficerDashboard, setOfficerTab, renderOfficerReports,
  openReportDetail, saveReportStatus, viewOnMap,
  backFromOfficerMap, backFromUserMap,
  initOfficerMap, initUserMap, updateOfficerMarkerOnUserMap,
};

// Make global for onclick handlers
window.loadOfficerDashboard = loadOfficerDashboard;
window.setOfficerTab = setOfficerTab;
window.openReportDetail = openReportDetail;
window.saveReportStatus = saveReportStatus;
window.viewOnMap = viewOnMap;
window.backFromOfficerMap = backFromOfficerMap;
window.backFromUserMap = backFromUserMap;
