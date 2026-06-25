// ============================================================
// OFFICER.JS - Halaman Petugas
// Sistem Pelaporan Sampah Liar
// ============================================================

'use strict';

// ─── Registry Akun Petugas (Fix Bug Marker Hantu) ──────────────
// Node 'officerLocations' menyimpan posisi & status aktif petugas,
// TAPI tidak otomatis terhapus saat akun petugas dihapus langsung dari
// node 'officers' (misal dihapus manual lewat Firebase Console).
// Akibatnya marker petugas yang akunnya sudah dihapus bisa "menggantung"
// (tetap muncul di peta) karena isActive masih bernilai true.
//
// Solusi: dengarkan node 'officers' sebagai SATU-SATUNYA sumber kebenaran
// akun yang valid. Setiap kali render marker dari 'officerLocations',
// saring entri yang username-nya sudah tidak ada di 'officers'. Entri
// yang tidak valid tersebut juga langsung dibersihkan dari database agar
// tidak menggantung selamanya.
let _validOfficerIds        = null;   // null = belum termuat, object = siap dipakai
const _cleanedGhostOfficers = new Set();

window.APP_CONFIG.db.ref('officers').on('value', snap => {
  _validOfficerIds = snap.val() || {};
});

// Saring object officerLocations agar hanya berisi akun petugas yang masih
// valid (ada di node 'officers'). Entri yatim (akun sudah dihapus) akan
// dihapus juga dari Firebase supaya tidak terus "menggantung".
function _filterValidOfficerLocations(rawOfficerLocations) {
  if (!_validOfficerIds) return rawOfficerLocations; // registry belum siap, jangan filter dulu

  const filtered = {};
  Object.entries(rawOfficerLocations || {}).forEach(([officerId, data]) => {
    if (_validOfficerIds[officerId]) {
      filtered[officerId] = data;
    } else if (!_cleanedGhostOfficers.has(officerId)) {
      // Akun sudah dihapus tapi entri lokasinya masih ada → bersihkan
      _cleanedGhostOfficers.add(officerId);
      window.APP_CONFIG.db.ref('officerLocations/' + officerId).remove().catch(() => {});
    }
  });
  return filtered;
}

// ─── Officer Dashboard ────────────────────────────────────────
function loadOfficerDashboard() {
  $('officer-name-display').textContent = AppState.currentUser?.name || 'Petugas';
  _officerActiveCatFilter = 'semua';
  const lbl = document.getElementById('officer-cat-dropdown-label');
  if (lbl) lbl.textContent = ' Semua Kategori';
  
  const categoryBadge = $('officer-category-badge');
  if (categoryBadge) {
    const cat = AppState.currentUser?.category || 'Semua';
    categoryBadge.textContent = '♻ ' + cat;
  }
  
  setOfficerTab('all');
  renderOfficerReports();
  updateOfficerStats();
}

function setOfficerTab(tab) {
  AppState.officerCurrentTab = tab;
  document.querySelectorAll('#officer-stats-grid .stat-card').forEach(card => {
    card.classList.toggle('active', card.dataset.tab === tab);
  });
  renderOfficerReports();
}

function renderOfficerReports() {
  const container = $('officer-report-list');
  if (!container) return;

  let reports = Object.entries(AppState.reports || {}).map(([id, r]) => ({ ...r, id }));

  const officerCategory = AppState.currentUser?.category;
  if (officerCategory && officerCategory !== 'Lainnya') {
    reports = reports.filter(r => r.category === officerCategory || !r.category);
  }

  // Filter kategori dropdown
  if (_officerActiveCatFilter && _officerActiveCatFilter !== 'semua') {
    reports = reports.filter(r => (r.category || 'Lainnya') === _officerActiveCatFilter);
  }

  const tab = AppState.officerCurrentTab || 'all';
  if (tab === 'pending')
    reports = reports.filter(r => !r.status || r.status === 'pending');
  else if (tab === 'progress') reports = reports.filter(r => r.status === 'progress' || r.status === 'transporting');
  else if (tab === 'done') reports = reports.filter(r => r.status === 'done');

  reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
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
    pending:      { label: 'Belum Dibersihkan',      class: 'badge-pending',      icon: '⏳' },
    progress:     { label: 'Sedang Dibersihkan',      class: 'badge-progress',     icon: '🚛' },
    transporting: { label: 'Mengantarkan ke TPS',     class: 'badge-transporting', icon: '🏭' },
    done:         { label: 'Selesai',                  class: 'badge-done',         icon: '✅' },
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
        <span><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${r.reporterName || 'Anonim'}</span>
        <span><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${AppUtils.formatTime(r.createdAt)}</span>
        ${r.category ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(78,203,141,0.12);border:1px solid rgba(78,203,141,0.3);border-radius:10px;padding:2px 8px;font-size:11px;color:var(--green-light);font-weight:600;margin-top:4px">${r.category}</span>` : ''}
        ${r.description ? `<span style="margin-top:4px;color:var(--text-primary);font-size:12px">${r.description.slice(0,60)}${r.description.length>60?'…':''}</span>` : ''}
      </div>
      <div class="report-card-footer">
        ${r.coords ? `<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();viewOnMap('${r.id}')">📍 Lihat Peta</button>` : '<span></span>'}
        ${r.status !== 'done' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openReportDetail('${r.id}')">Kelola ›</button>` : ''}
      </div>
    </div>`;
}

function updateOfficerStats() {
  const reports = Object.values(AppState.reports || {});

  $('stat-total').textContent = reports.length;

  $('stat-pending').textContent =
    reports.filter(r => !r.status || r.status === 'pending').length;

  $('stat-progress').textContent =
    reports.filter(r => r.status === 'progress' || r.status === 'transporting').length;

  $('stat-done').textContent =
    reports.filter(r => r.status === 'done').length;
}

// ─── Report Detail Modal ──────────────────────────────────────
function openReportDetail(reportId) {
  const r = AppState.reports[reportId];
  if (!r) return;

  $('detail-location').textContent = r.location || '-';
  $('detail-reporter').textContent = r.reporterName || 'Anonim';
  
  const catEl = $('detail-category');
  if (catEl) {
    catEl.innerHTML = r.category 
      ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(78,203,141,0.15);border:1px solid rgba(78,203,141,0.4);border-radius:10px;padding:3px 10px;font-size:12px;color:var(--green-light);font-weight:600">${r.category}</span>`
      : '<span style="color:var(--text-muted)">Tidak dikategorikan</span>';
    
    const officerCat = AppState.currentUser?.category;
    if (officerCat && r.category && officerCat !== r.category && officerCat !== 'Lainnya') {
      catEl.innerHTML += `<div style="margin-top:4px;font-size:11px;color:#f0c030">⚠️ Bukan kategori Anda (${officerCat})</div>`;
    }
  }
  
  $('detail-time').textContent = AppUtils.formatTime(r.createdAt);
  $('detail-desc').textContent = r.description || '-';
  $('detail-img').style.display = r.imageBase64 ? 'block' : 'none';
  if (r.imageBase64) $('detail-img').src = r.imageBase64;

  // Isi status select (termasuk transporting)
  const statusSel = $('detail-status');
  statusSel.value = r.status || 'pending';

  $('detail-modal').dataset.reportId = reportId;

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
  const reportId = $('detail-modal').dataset.reportId;
  const status   = $('detail-status').value;

  AppUtils.showLoading('Menyimpan status...');

  try {
    const officerName     = AppState.currentUser.name;
    const officerCategory = AppState.currentUser?.category || '';
    const officerUsername = AppState.currentUser?.username || '';
    const officerPhotoUrl = AppState.currentUser?.photoUrl || null;

    const updateData = {
      status,
      officerName,
      officerCategory,
      officerUsername,
      officerPhotoUrl,
      updatedAt: Date.now(),
      officerNavigating: status === 'progress',
      officerArrived:    status === 'done',
      officerTransporting: status === 'transporting',
    };

    await window.APP_CONFIG.db.ref(`reports/${reportId}`).update(updateData);

    if (status === 'progress') {
      AppUtils.showToast('🚛 Navigasi menuju lokasi dimulai', 'success');
      const report = AppState.reports[reportId];
      if (report?.coords) {
        AppUtils.closeModal('detail-modal');
        AppUtils.showPage('page-officer-map');
        AppState.navigatingTo = reportId;
        initOfficerMap(report.coords, reportId);
      }
    } else if (status === 'transporting') {
      AppUtils.showToast('🏭 Status diperbarui: Mengantarkan ke TPS', 'success');
      AppUtils.closeModal('detail-modal');
    } else if (status === 'done') {
      AppUtils.showToast('✅ Laporan selesai dibersihkan', 'success');
      AppUtils.closeModal('detail-modal');
      // Buat salinan reports dengan laporan ini sudah berstatus 'done'
      // agar clearMapOnReportDone bisa cek stillActive secara akurat
      // tanpa harus menunggu listener Firebase menerima data baru
      const freshReports = { ...AppState.reports, [reportId]: { ...AppState.reports[reportId], status: 'done' } };
      clearMapOnReportDone(reportId, freshReports);
    } else {
      AppUtils.closeModal('detail-modal');
    }

    AppUtils.hideLoading();

  } catch (err) {
    AppUtils.hideLoading();
    AppUtils.showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

// ─── Bersihkan peta untuk laporan yang selesai ───────────────
// Dipanggil setelah Firebase update selesai (data sudah di-commit).
// Laporan lain yang masih progress/transporting TIDAK tersentuh.
// Hanya marker sampah + marker petugas + garis navigasi dari laporan yang
// diselesaikan oleh petugas tersebut saja yang dihapus.
function clearMapOnReportDone(reportId, freshReports) {
  // freshReports: snapshot terbaru laporan (sebelum AppState terupdate)
  const allReports = freshReports || AppState.reports || {};
  const doneReport = allReports[reportId] || {};
  const doneCategory = doneReport.category || null;
  // UID petugas yang menyelesaikan laporan ini
  const completingOfficerId = AppState.currentUser?.uid;

  // ── 1. Peta Petugas sendiri: tampilkan marker hijau lalu hapus marker & rute laporan yang selesai ──
  // (officerMarker, targetMarker, routeLayer adalah marker PETUGAS INI SENDIRI)
  if (officerMapInstance) {
    // Tampilkan marker sampah hijau (selesai) sebelum dihapus
    if (targetMarker) {
      targetMarker.setIcon(buildTrashMarkerIcon('done', 'lg'));
      targetMarker.bindPopup('<b>✅ Laporan Selesai!</b>').openPopup();
    }
    // Hapus rute & marker petugas segera, marker sampah ditunda agar hijau terlihat
    if (officerMarker)      { officerMapInstance.removeLayer(officerMarker);      officerMarker     = null; }
    if (window.routeLayer)  { officerMapInstance.removeLayer(window.routeLayer);  window.routeLayer = null; }
    if (routeGlowLayer)     { officerMapInstance.removeLayer(routeGlowLayer);     routeGlowLayer    = null; }
    // Hapus marker sampah setelah 2.5 detik (tunjukkan warna hijau dulu)
    setTimeout(() => {
      if (officerMapInstance && targetMarker) {
        officerMapInstance.removeLayer(targetMarker);
        targetMarker = null;
      }
    }, 2500);
  }

  // ── 2. Peta Warga: hapus HANYA elemen milik petugas yang menyelesaikan laporan ini ──
  // userOfficerMarker = marker petugas utama (yang menangani laporan saya)
  // userTrashMarker   = marker sampah laporan utama saya
  // Keduanya hanya dihapus jika ini adalah laporan yang sedang saya pantau (userMapReportId)
  // DAN petugas yang menyelesaikan = petugas yang sedang menangani laporan saya
  if (userMapInstance) {
    const myWatchedReportId = AppState.userMapReportId;
    const isMyWatchedReport = myWatchedReportId === reportId;

    // Cek apakah masih ada laporan LAIN (selain laporan ini, kategori sama) yang belum selesai di peta
    const stillHasOtherActiveReports = Object.entries(allReports).some(([id, r]) => {
      if (id === reportId) return false; // laporan yang baru selesai ini
      if (doneCategory && r.category !== doneCategory) return false; // hanya kategori sama
      if (r.status === 'done' || !r.status || r.status === 'pending') return false;
      return true; // ada laporan lain yang masih aktif
    });

    if (isMyWatchedReport) {
      // Marker sampah laporan utama: tampilkan hijau dulu lalu hapus jika tidak ada laporan aktif lain
      if (!stillHasOtherActiveReports) {
        if (userTrashMarker && userMapInstance) {
          // Tampilkan marker hijau sebelum dihapus
          userTrashMarker.setIcon(buildTrashMarkerIcon('done', 'lg'));
          userTrashMarker.bindPopup('<b>✅ Laporan Selesai!</b>').openPopup();
          setTimeout(() => {
            if (userMapInstance && userTrashMarker) {
              userMapInstance.removeLayer(userTrashMarker);
              userTrashMarker = null;
            }
          }, 2500);
        }
      }
      // Marker & rute petugas utama selalu dihapus (petugas sudah selesai)
      if (userOfficerMarker) {
        userMapInstance.removeLayer(userOfficerMarker);
        userOfficerMarker = null;
      }
      if (userRouteLayer)     { userMapInstance.removeLayer(userRouteLayer);     userRouteLayer     = null; }
      if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
    }

    // Marker sampah laporan lain: hapus hanya laporan ini, jika tidak ada laporan aktif lain
    // (jika masih ada laporan aktif, marker tetap tampil; hapus nanti saat semua selesai)
    if (userReportMarkers[reportId] && !stillHasOtherActiveReports) {
      userMapInstance.removeLayer(userReportMarkers[reportId]);
      delete userReportMarkers[reportId];
    }

    // Hapus marker & rute petugas lain yang menangani laporan INI (jika ada di userOtherOfficerMarkers)
    // Petugas "lain" yang navigatingTo === reportId seharusnya tidak ada (karena satu laporan = satu petugas)
    // tapi kita tetap bersihkan untuk keamanan
    Object.keys(userOtherOfficerMarkers).forEach(oid => {
      const officerData = allReports[reportId]; // cek via laporan
      // Cari officer di Firebase data — kita tidak punya referensi langsung, 
      // jadi hanya hapus jika officerId === completingOfficerId (sudah ditangani lewat userOfficerMarker)
      // Marker petugas LAIN yang sedang menangani laporan LAIN tidak disentuh sama sekali
    });
  }

  // ── 3. Reset state navigasi petugas yang menyelesaikan ──
  if (AppState.navigatingTo === reportId) AppState.navigatingTo = null;

  // ── 4. Firebase: nonaktifkan lokasi petugas yang menyelesaikan laporan ini ──
  const oid = AppState.currentUser?.uid;
  if (oid) {
    window.APP_CONFIG.db.ref('officerLocations/' + oid).update({
      isActive: false, navigatingTo: null, eta: null,
    });
  }

  // ── 5. Tutup peta PETUGAS (officerMapInstance) — selalu saat petugas ini selesai ──
  setTimeout(() => {
    window.APP_CONFIG.db.ref('officerLocation').off();

    if (officerMapInstance) { officerMapInstance.remove(); officerMapInstance = null; }

    const myRole = AppState.currentUser?.role;
    if (myRole === 'officer') {
      AppUtils.showPage('page-officer-dashboard');
      renderOfficerReports();
      updateOfficerStats();
    }
  }, 1500);

  // ── 6. Peta WARGA (userMapInstance): JANGAN ditutup dari sini ──
  // Penutupan peta warga dikelola SEPENUHNYA oleh listenAllOfficersUserMap di sisi warga.
  // Kondisinya: laporan utama warga X sudah 'done' DAN tidak ada petugas aktif tersisa.
  // Menutup peta warga dari clearMapOnReportDone akan menyebabkan peta warga X tertutup
  // hanya karena petugas Z menyelesaikan laporan warga F (laporan yang berbeda).
  // Jika masih ada laporan aktif → peta tetap terbuka, hanya elemen laporan selesai yang dihapus (sudah dilakukan di langkah 2)
}

// ─── Officer Map ──────────────────────────────────────────────
let officerMapInstance = null;
let officerMarker      = null;
let targetMarker       = null;
let routeControl       = null;
let routeGlowLayer     = null;   // glow layer rute petugas (ref agar bisa dihapus)

// Guard: agar notif "tiba" hanya muncul SEKALI per laporan per sesi navigasi
let _arrivedNotifiedForReport = null;

// ─── Officer Pin Builder (Universal, Presisi) ─────────────────
// Semua marker petugas (di halaman petugas MAUPUN warga) memakai builder yang
// sama. Anchor SELALU jatuh tepat di tengah lingkaran kecil paling bawah, yang
// merepresentasikan koordinat GPS sebenarnya — bukan tanda panah lancip yang
// ukurannya berubah-ubah tergantung ada/tidaknya label ETA, sehingga sering
// meleset dari ujung garis navigasi.
const PIN_LABEL_H = 22;  // tinggi pill nama/label (fixed, tidak tergantung font)
const PIN_ETA_H   = 19;  // tinggi pill ETA (fixed)
const PIN_GAP     = 3;   // jarak antar elemen (label/eta/avatar)
const PIN_DOT     = 12;  // diameter lingkaran kecil penanda titik GPS
const PIN_DOT_GAP = 1;   // jarak avatar → lingkaran kecil (dibuat presisi: tidak terlalu jauh/dekat)

// Hitung iconSize & iconAnchor secara deterministik berdasarkan komponen yang
// benar-benar dirender (label, eta opsional, avatar, dot) — bukan angka statis
// yang bisa berbeda dari tinggi konten asli.
function officerPinDims(avatarWrapSize, hasEta, width = 90) {
  let h = PIN_LABEL_H;
  if (hasEta) h += PIN_GAP + PIN_ETA_H;
  h += PIN_GAP + avatarWrapSize;
  h += PIN_DOT_GAP + PIN_DOT;
  return { width, height: h, anchorX: width / 2, anchorY: h - PIN_DOT / 2 };
}

function buildOfficerPinHTML({
  label, labelColor = '#4ecb8d', labelBorder = 'rgba(78,203,141,0.6)',
  etaText, sonarHtml, avatarHtml, avatarWrapSize, dotColor = '#4ecb8d',
}) {
  const etaHTML = etaText
    ? `<div style="height:${PIN_ETA_H}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;margin-top:${PIN_GAP}px;background:rgba(6,26,18,0.96);color:#f0c030;font-size:9px;font-weight:800;padding:0 9px;border-radius:20px;border:1px solid rgba(240,192,48,0.55);white-space:nowrap;backdrop-filter:blur(10px);box-shadow:0 2px 10px rgba(0,0,0,0.5);letter-spacing:0.2px">⏱ ${etaText}</div>`
    : '';
  // Lingkaran kecil presisi di titik GPS asli — pengganti tanda panah lancip
  const dot = `<div style="width:${PIN_DOT}px;height:${PIN_DOT}px;margin-top:${PIN_DOT_GAP}px;border-radius:50%;background:${dotColor};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`;
  return `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="height:${PIN_LABEL_H}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:rgba(6,26,18,0.96);color:${labelColor};font-size:10px;font-weight:800;padding:0 11px;border-radius:20px;border:1px solid ${labelBorder};white-space:nowrap;backdrop-filter:blur(10px);box-shadow:0 3px 12px rgba(0,0,0,0.5);letter-spacing:0.3px">${label}</div>
    ${etaHTML}
    <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${avatarWrapSize}px;height:${avatarWrapSize}px;margin-top:${PIN_GAP}px">
      ${sonarHtml}
      ${avatarHtml}
    </div>
    ${dot}
  </div>`;
}

// Sonar ring hijau standar (dipakai marker "Anda" / petugas utama)
function greenSonarHtml(ringSize = 46) {
  return `
      <div style="position:absolute;width:${ringSize}px;height:${ringSize}px;border-radius:50%;background:rgba(78,203,141,0.38);animation:sonar-green-1 1.8s ease-out infinite;animation-delay:0s"></div>
      <div style="position:absolute;width:${ringSize}px;height:${ringSize}px;border-radius:50%;background:rgba(78,203,141,0.26);animation:sonar-green-2 1.8s ease-out infinite;animation-delay:0.55s"></div>
      <div style="position:absolute;width:${ringSize}px;height:${ringSize}px;border-radius:50%;background:rgba(78,203,141,0.16);animation:sonar-green-3 1.8s ease-out infinite;animation-delay:1.1s"></div>`;
}

// ─── Officer Marker Builder (dengan ETA + Foto Profil) ────────
// Dipakai untuk marker "Anda" di halaman petugas sendiri.
function buildOfficerMarkerHTML(label, etaText, photoUrl) {
  const avatarHTML = photoUrl
    ? `<img src="${photoUrl}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 3px 10px rgba(78,203,141,0.5);position:relative;z-index:2" />`
    : `<div style="background:linear-gradient(135deg,#4ecb8d,#2ea868);color:#fff;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #fff;box-shadow:0 3px 10px rgba(78,203,141,0.5);position:relative;z-index:2">🚛</div>`;
  return buildOfficerPinHTML({
    label, etaText, avatarWrapSize: 54,
    sonarHtml: greenSonarHtml(46), avatarHtml: avatarHTML, dotColor: '#4ecb8d',
  });
}

// ─── SVG Icon Bak Sampah ─────────────────────────────────────────────────────
// Dipakai di semua marker sampah (aktif/statis, besar/kecil)
const TRASH_SVG_LG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  <path d="M10 11v6M14 11v6"/>
  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
</svg>`;

const TRASH_SVG_SM = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  <path d="M10 11v6M14 11v6"/>
  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
</svg>`;

/**
 * Marker sampah berdasarkan status laporan:
 *   status='pending'      → Merah + pulse sonar (belum dibersihkan)
 *   status='progress'     → Biru + sonar (sedang dibersihkan)
 *   status='transporting' → Biru + sonar (sedang dibersihkan)
 *   status='done'         → Hijau + centang (selesai, akan dihapus setelah animasi)
 *
 * Signature lama (active, size) tetap didukung untuk kompatibilitas:
 *   active=true  → diperlakukan sebagai 'progress'
 *   active=false → diperlakukan sebagai 'pending'
 */
function buildTrashMarkerIcon(activeOrStatus, size = 'lg') {
  const svgIcon = size === 'lg' ? TRASH_SVG_LG : TRASH_SVG_SM;

  // Normalisasi argumen: bisa berupa boolean (lama) atau string status (baru)
  let status;
  if (activeOrStatus === true)       status = 'progress';
  else if (activeOrStatus === false) status = 'pending';
  else                               status = activeOrStatus || 'pending';

  // ── Selesai (Hijau) ──────────────────────────────────────────
  if (status === 'done') {
    const outer = size === 'lg' ? 60 : 42;
    const inner = size === 'lg' ? 42 : 28;
    const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${size === 'lg' ? 20 : 13}" height="${size === 'lg' ? 20 : 13}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    return L.divIcon({
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${outer}px;height:${outer}px">
        <div style="background:#22c55e;color:#fff;width:${inner}px;height:${inner}px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 6px 22px rgba(34,197,94,0.65);position:relative;z-index:2">${CHECK_SVG}</div>
      </div>`,
      iconSize: [outer, outer], iconAnchor: [outer/2, outer/2], className: "",
    });
  }

  // ── Sedang Dibersihkan (Biru) ────────────────────────────────
  if (status === 'progress' || status === 'transporting') {
    const outer = size === 'lg' ? 60 : 42;
    const inner = size === 'lg' ? 42 : 28;
    const ring  = size === 'lg' ? 44 : 30;
    const dur   = size === 'lg' ? '1.8s' : '2s';
    return L.divIcon({
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${outer}px;height:${outer}px">
        <div style="position:absolute;width:${ring}px;height:${ring}px;border-radius:50%;background:rgba(59,130,246,0.38);animation:sonar-red-1 ${dur} ease-out infinite;animation-delay:0s"></div>
        <div style="position:absolute;width:${ring}px;height:${ring}px;border-radius:50%;background:rgba(59,130,246,0.26);animation:sonar-red-2 ${dur} ease-out infinite;animation-delay:0.55s"></div>
        <div style="position:absolute;width:${ring}px;height:${ring}px;border-radius:50%;background:rgba(59,130,246,0.16);animation:sonar-red-3 ${dur} ease-out infinite;animation-delay:1.1s"></div>
        <div style="background:#3b82f6;color:#fff;width:${inner}px;height:${inner}px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 6px 22px rgba(59,130,246,0.65);position:relative;z-index:2;animation:trash-beat ${dur} ease infinite">${svgIcon}</div>
      </div>`,
      iconSize: [outer, outer], iconAnchor: [outer/2, outer/2], className: "",
    });
  }

  // ── Belum Dibersihkan (Merah + Pulse) ───────────────────────
  // status === 'pending' atau tidak dikenali
  if (size === 'sm') {
    return L.divIcon({
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(230,57,70,0.25);animation:pulse-badge 1.5s ease infinite"></div>
        <div style="background:#e63946;color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 4px 14px rgba(230,57,70,0.4);position:relative;z-index:1">${svgIcon}</div>
      </div>`,
      iconSize: [38, 38], iconAnchor: [19, 19], className: "",
    });
  }
  return L.divIcon({
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;width:52px;height:52px;border-radius:50%;background:rgba(230,57,70,0.25);animation:pulse-badge 1.5s ease infinite"></div>
      <div style="position:absolute;width:62px;height:62px;border-radius:50%;background:rgba(230,57,70,0.12);animation:pulse-badge 1.5s ease infinite;animation-delay:0.4s"></div>
      <div style="background:#e63946;color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 6px 20px rgba(230,57,70,0.5);position:relative;z-index:1">${svgIcon}</div>
    </div>`,
    iconSize: [62, 62], iconAnchor: [31, 31], className: "",
  });
}

function initOfficerMap(targetCoords, reportId) {
  // Reset arrived guard saat mulai navigasi baru
  _arrivedNotifiedForReport = null;
  // Reset route state
  _currentRouteCoords = null;
  _lastRouteFrom = null;
  _lastRouteDrawTime = 0;

  // Sinkronkan tombol & label "Mengantarkan ke TPA" sesuai status laporan saat ini
  _syncTransportButtonState(reportId);

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

  // Cek apakah laporan sudah selesai — jika ya, jangan tampilkan marker & rute
  const reportStatusForMap = AppState.reports[reportId]?.status || 'pending';
  if (reportStatusForMap !== 'done') {
    // Gunakan warna berdasarkan status: merah=pending, biru=progress/transporting
    const trashIcon = buildTrashMarkerIcon(reportStatusForMap, 'lg');
    targetMarker = L.marker([targetCoords.lat, targetCoords.lng], { icon: trashIcon })
      .addTo(officerMapInstance)
      .bindPopup('<b>📍 Lokasi Sampah Liar</b>');
  }

  if (AppState.officerLocation) {
    // Marker petugas di halaman petugas: selalu tampilkan "Anda" (bukan nama) + foto profil sendiri
    const officerSelfLabel = 'Anda';
    const officerCategory = AppState.currentUser?.category || 'Rumah Tangga';
    const officerPhotoUrl = AppState.currentUser?.photoUrl || null;
    const _selfDims0 = officerPinDims(54, false);
    const officerIcon = L.divIcon({
      html: buildOfficerMarkerHTML(officerSelfLabel, null, officerPhotoUrl),
      iconSize: [_selfDims0.width, _selfDims0.height],
      iconAnchor: [_selfDims0.anchorX, _selfDims0.anchorY],
      className: "",
    });
    const officerSelfPopupAvatarHtml = officerPhotoUrl
      ? `<img src="${officerPhotoUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(78,203,141,0.4);flex-shrink:0" />`
      : `<span style="font-size:20px">👮</span>`;
    const officerPopupHtml = `
      <div style="font-family:sans-serif;min-width:160px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          ${officerSelfPopupAvatarHtml}
          <div>
            <div style="font-weight:800;font-size:13px">${officerSelfLabel}</div>
            <div style="font-size:11px;color:#2d9c6e;font-weight:600">🗂️ ${officerCategory}</div>
          </div>
        </div>
        <div id="officer-self-popup-eta" style="font-size:11px;color:#d4a800;border-top:1px solid #eee;padding-top:4px">⏱ Menghitung ETA...</div>
      </div>`;
    officerMarker = L.marker(
      [AppState.officerLocation.lat, AppState.officerLocation.lng],
      { icon: officerIcon }
    ).addTo(officerMapInstance).bindPopup(officerPopupHtml);

    drawRoute(AppState.officerLocation, targetCoords);

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

// ─── Route Deviation Detection ────────────────────────────────
// Simpan koordinat rute saat ini untuk deteksi deviasi
let _currentRouteCoords = null;
let _lastRouteFrom = null;
let _rerouteThresholdMeters = 80; // reroute jika menyimpang >80m dari rute

function isOfficerOffRoute(officerLoc) {
  if (!_currentRouteCoords || _currentRouteCoords.length < 2) return false;
  // Hitung jarak minimum dari posisi petugas ke segmen rute
  let minDist = Infinity;
  for (let i = 0; i < _currentRouteCoords.length - 1; i++) {
    const d = distToSegmentMeters(officerLoc, _currentRouteCoords[i], _currentRouteCoords[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist > _rerouteThresholdMeters;
}

function distToSegmentMeters(p, a, b) {
  // Jarak titik p ke segmen a-b dalam meter (aproksimasi datar)
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const lat = toRad(p.lat), lng = toRad(p.lng);
  const alat = toRad(a.lat), alng = toRad(a.lng);
  const blat = toRad(b.lat), blng = toRad(b.lng);
  const ax = Math.cos(alat) * alng, ay = alat;
  const bx = Math.cos(blat) * blng, by = blat;
  const px = Math.cos(lat) * lng,   py = lat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  let t = lenSq > 0 ? ((px-ax)*dx + (py-ay)*dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t*dx, ny = ay + t*dy;
  const dlng = (px - nx) * Math.cos((lat + ny) / 2);
  const dlat = py - ny;
  return Math.sqrt(dlng*dlng + dlat*dlat) * R;
}

async function drawRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      if (window.routeLayer) officerMapInstance.removeLayer(window.routeLayer);
      if (routeGlowLayer)   { officerMapInstance.removeLayer(routeGlowLayer); routeGlowLayer = null; }
      window.routeLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4ecb8d', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
      }).addTo(officerMapInstance);
      routeGlowLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4ecb8d', weight: 10, opacity: 0.2, lineCap: 'round' }
      }).addTo(officerMapInstance);

      // Simpan koordinat rute untuk deteksi deviasi
      const coords = data.routes[0].geometry.coordinates;
      _currentRouteCoords = coords.map(c => ({ lat: c[1], lng: c[0] }));
      _lastRouteFrom = { ...from };

      const duration = Math.round(data.routes[0].duration / 60);
      const distKm   = (data.routes[0].distance / 1000).toFixed(1);
      $('nav-distance') && ($('nav-distance').textContent = distKm < 1 ? Math.round(distKm*1000) + ' m' : distKm + ' km');
      $('nav-eta')      && ($('nav-eta').textContent      = duration + ' menit');

      const etaLabel = duration <= 0 ? 'Tiba' : duration + ' mnt';
      AppState.officerETA = etaLabel;
      const oid = AppState.currentUser?.uid;
      if (oid) window.APP_CONFIG.db.ref('officerLocations/' + oid).update({ eta: etaLabel });

      if (officerMarker) {
        const officerPhotoUrl = AppState.currentUser?.photoUrl || null;
        const _selfDims = officerPinDims(54, false);
        const newIcon = L.divIcon({
          html: buildOfficerMarkerHTML('Anda', null, officerPhotoUrl),
          iconSize: [_selfDims.width, _selfDims.height],
          iconAnchor: [_selfDims.anchorX, _selfDims.anchorY],
          className: "",
        });
        officerMarker.setIcon(newIcon);
        const etaEl = document.getElementById('officer-self-popup-eta');
        if (etaEl) etaEl.textContent = `⏱ ETA: ${etaLabel}`;
      }
    }
  } catch (e) {
    if (window.routeLayer) officerMapInstance.removeLayer(window.routeLayer);
    window.routeLayer = L.polyline(
      [[from.lat, from.lng], [to.lat, to.lng]],
      { color: '#4ecb8d', weight: 4, dashArray: '10,5' }
    ).addTo(officerMapInstance);

    // Fallback jika OSRM gagal/tidak terjangkau: tampilkan estimasi kasar
    // dari jarak garis lurus, dengan rumus yang benar (~30 km/h → 2 menit/km),
    // supaya panel tidak menampilkan nilai basi/kosong.
    const distKmStraight = getDistanceKm(from.lat, from.lng, to.lat, to.lng);
    const estMinutes = Math.max(1, Math.round(distKmStraight * 2)); // 30 km/h ≈ 2 menit/km
    $('nav-distance') && ($('nav-distance').textContent = distKmStraight < 1
      ? Math.round(distKmStraight * 1000) + ' m'
      : distKmStraight.toFixed(1) + ' km');
    $('nav-eta') && ($('nav-eta').textContent = estMinutes + ' menit (perkiraan)');

    const etaLabel = estMinutes + ' mnt';
    AppState.officerETA = etaLabel;
    const oid = AppState.currentUser?.uid;
    if (oid) window.APP_CONFIG.db.ref('officerLocations/' + oid).update({ eta: etaLabel });
  }
}

function updateOfficerMapMarker(loc) {
  if (!officerMapInstance || !officerMarker) return;

  // Pindahkan marker petugas ke posisi GPS realtime
  officerMarker.setLatLng([loc.lat, loc.lng]);

  // Pan peta agar selalu mengikuti posisi petugas
  officerMapInstance.panTo([loc.lat, loc.lng], { animate: true, duration: 0.8 });

  window.APP_CONFIG.db.ref('officerLocation').set({
    lat: loc.lat, lng: loc.lng, updatedAt: Date.now()
  });

  const officerId = AppState.currentUser?.uid;
  if (officerId) {
    window.APP_CONFIG.db.ref('officerLocations/' + officerId).update({
      lat: loc.lat, lng: loc.lng, updatedAt: Date.now(),
      navigatingTo: AppState.navigatingTo || null,
      isActive: true,
    });
  }

  const reportId = AppState.navigatingTo;
  if (reportId && AppState.reports[reportId]?.coords) {
    // Selalu gambar ulang rute dari posisi REALTIME petugas ke lokasi sampah
    // Jika petugas menyimpang dari rute (memilih jalan lain), rute akan otomatis berubah
    const targetCoords = AppState.reports[reportId].coords;

    // Cek apakah petugas menyimpang dari rute yang sudah ada
    const offRoute = isOfficerOffRoute(loc);
    if (offRoute || !_currentRouteCoords) {
      // Gambar ulang rute dari posisi petugas saat ini ke lokasi sampah
      drawRoute(loc, targetCoords);
    } else {
      // Hanya update ETA tanpa menggambar ulang rute (hemat request)
      // Gambar ulang rute setiap 15 detik untuk menjaga akurasi
      if (!_lastRouteDrawTime || Date.now() - _lastRouteDrawTime > 15000) {
        _lastRouteDrawTime = Date.now();
        drawRoute(loc, targetCoords);
      }
    }
  }
}

// Timestamp terakhir rute digambar
let _lastRouteDrawTime = 0;

function viewOnMap(reportId) {
  const r = AppState.reports[reportId];
  if (!r?.coords) return AppUtils.showToast('Koordinat tidak tersedia', 'warning');

  AppUtils.showPage('page-officer-map');
  initOfficerMap(r.coords, reportId);
  AppState.navigatingTo = reportId;
}

function backFromOfficerMap() {
  // Reset map fullscreen state jika aktif
  const wrap = document.getElementById('officer-map-wrap');
  const panel = document.getElementById('nav-info-card');
  if (wrap && wrap.classList.contains('map-only-fullscreen')) {
    wrap.classList.remove('map-only-fullscreen');
    if (panel) { panel.style.display = ''; panel.classList.remove('panel-map-hidden'); }
  }
  AppUtils.showPage('page-officer-dashboard');
}

// ─── Sinkronisasi tombol "Mengantarkan ke TPA" di panel navigasi petugas ──
// Dipanggil saat peta navigasi dibuka, agar tombol mencerminkan status
// laporan yang sebenarnya (mis. saat petugas membuka kembali peta setelah
// sebelumnya menekan tombol ini).
function _syncTransportButtonState(reportId) {
  const btn   = document.getElementById('officer-transport-btn');
  const label = document.getElementById('nav-report-location-label');
  const status = AppState.reports[reportId]?.status;

  if (status === 'transporting' || status === 'done') {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('nav-action-btn--done-state');
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sedang Menuju TPA';
    }
    if (label) label.textContent = 'Mengantarkan ke TPA';
  } else {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('nav-action-btn--done-state');
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3z"/><path d="M14 11h4l3 3v1h-7z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/></svg> Mengantarkan ke TPA';
    }
    if (label) label.textContent = 'Menuju Lokasi Sampah';
  }
}

// ─── User Map ─────────────────────────────────────────────────
// ─── User Map Variables ───────────────────────────────────────
let userMapInstance         = null;
let userOfficerMarker       = null;
let userRouteLayer          = null;
let userRouteGlowLayer      = null;   // glow layer rute peta warga (ref agar bisa dihapus)
let userTrashMarker         = null;   // marker sampah laporan UTAMA (simpan ref agar bisa dihapus)
let userOtherOfficerMarkers = {};     // officerId → marker
let userOtherOfficerRoutes  = {};     // officerId → routeLayer
let userReportMarkers       = {};     // reportId  → marker (laporan sampah lain)

// Palette warna untuk membedakan setiap petugas di peta
const OFFICER_COLORS = [
  '#f0c030', // kuning
  '#60a8f5', // biru langit
  '#f56060', // merah muda
  '#c060f5', // ungu
  '#f5a030', // oranye
  '#30d4f5', // cyan
  '#f530a8', // pink
  '#a8f530', // hijau muda
];
const _officerColorMap = {}; // officerId → warna
let _officerColorIndex = 0;

function getOfficerColor(officerId) {
  if (!_officerColorMap[officerId]) {
    _officerColorMap[officerId] = OFFICER_COLORS[_officerColorIndex % OFFICER_COLORS.length];
    _officerColorIndex++;
  }
  return _officerColorMap[officerId];
}

// Track reportId yang sedang didengarkan oleh listener status, agar bisa di-off saat ganti laporan
let _activeStatusListenerReportId = null;

function initUserMap(coords, reportId) {
  AppUtils.showPage('page-user-map');

  if (userMapInstance) {
    window.APP_CONFIG.db.ref('officerLocation').off();
    window.APP_CONFIG.db.ref('officerLocations').off();
    // ROOT CAUSE FIX: matikan listener status laporan LAMA sebelum pasang yang baru.
    // Tanpa ini, listener laporan X tetap aktif saat peta beralih ke laporan Y,
    // sehingga saat laporan X done, userTrashMarker laporan Y ikut berubah hijau.
    if (_activeStatusListenerReportId) {
      window.APP_CONFIG.db.ref('reports/' + _activeStatusListenerReportId + '/status').off();
      _activeStatusListenerReportId = null;
    }
    userMapInstance.remove();
    userMapInstance         = null;
    userOfficerMarker       = null;
    userTrashMarker         = null;
    userRouteLayer          = null;
    userRouteGlowLayer      = null;
    userOtherOfficerMarkers = {};
    userOtherOfficerRoutes  = {};
    userReportMarkers       = {};
  }

  userMapInstance = L.map('user-map-container', { zoomControl: false }).setView(
    [coords.lat, coords.lng], 15
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(userMapInstance);

  // Tampilkan marker sampah & simpan ref agar bisa dihapus saat selesai
  const currentReportStatus = AppState.reports[reportId]?.status;
  userTrashMarker = null; // reset dulu
  if (currentReportStatus !== 'done') {
    // Gunakan warna berdasarkan status: merah=pending, biru=progress/transporting
    const trashIcon = buildTrashMarkerIcon(currentReportStatus || 'pending', 'lg');
    const _trashPopupLabel = { pending: '⏳ Belum Dibersihkan', progress: '🔵 Sedang Dibersihkan', transporting: '🔵 Mengantarkan ke TPS' }[currentReportStatus] || '⏳ Belum Dibersihkan';
    // Simpan referensi ke variabel agar bisa dihapus lewat clearMapOnReportDone
    userTrashMarker = L.marker([coords.lat, coords.lng], { icon: trashIcon })
      .addTo(userMapInstance)
      .bindPopup('<b>📍 Lokasi Sampah Anda</b><br><small>' + _trashPopupLabel + '</small>');
  }

  // Gunakan officerLocations (multi-petugas) sebagai SATU-SATUNYA sumber kebenaran
  // Tidak lagi bergantung pada officerLocation (legacy tunggal) yang hanya simpan 1 petugas
  const report         = AppState.reports[reportId];
  const reportCategory = report?.category || null;
  listenAllOfficersUserMap(coords, reportId, reportCategory);

  // ── Listener status laporan: update tampilan peta saat status berubah ──
  // Catatan: KEPUTUSAN MENUTUP PETA diserahkan sepenuhnya ke listenAllOfficersUserMap
  // agar peta warga X tidak tertutup hanya karena laporan WARGA F selesai —
  // peta baru ditutup setelah SEMUA petugas aktif yang muncul di peta ini sudah selesai.
  _activeStatusListenerReportId = reportId;
  window.APP_CONFIG.db.ref('reports/' + reportId + '/status').on('value', statusSnap => {
    const status = statusSnap.val();
    if (!userMapInstance) return;

    if (status === 'done') {
      // Laporan ini selesai — tampilkan marker HIJAU dulu, lalu hapus setelah delay.
      // Keputusan tutup peta diserahkan ke listenAllOfficersUserMap.
      window.APP_CONFIG.db.ref('reports/' + reportId + '/status').off();
      _activeStatusListenerReportId = null;

      // BUG #1 FIX: Tampilkan hijau HANYA untuk marker sampah laporan SENDIRI (userTrashMarker).
      // userReportMarkers berisi laporan warga LAIN — JANGAN diubah hijau dari sini.
      if (userTrashMarker && userMapInstance) {
        userTrashMarker.setIcon(buildTrashMarkerIcon('done', 'lg'));
        userTrashMarker.bindPopup('<b>\u2705 Laporan Selesai!</b>').openPopup();
      }

      // BUG #2 FIX: Hapus marker petugas hanya setelah konfirmasi via Firebase
      // bahwa tidak ada petugas aktif tersisa untuk laporan ini.
      // Ini mencegah marker petugas Y hilang hanya karena petugas Z update laporan LAIN ke done.
      setTimeout(() => {
        if (!userMapInstance) return;

        window.APP_CONFIG.db.ref('officerLocations').once('value', officerSnap => {
          if (!userMapInstance) return;
          const latestOfficers = _filterValidOfficerLocations(officerSnap.val() || {});

          // Hapus marker petugas HANYA jika tidak ada petugas aktif yang masih menangani laporan ini
          const stillHasOfficer = Object.values(latestOfficers).some(
            d => d.navigatingTo === reportId && d.isActive && d.lat
          );
          if (!stillHasOfficer) {
            if (userOfficerMarker) {
              userMapInstance.removeLayer(userOfficerMarker);
              userOfficerMarker = null;
            }
            if (userRouteLayer)     { userMapInstance.removeLayer(userRouteLayer);     userRouteLayer     = null; }
            if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
          }

          // Hapus marker sampah laporan utama jika tidak ada laporan lain (kategori sama) yang aktif
          const myReportCategory = AppState.reports[reportId]?.category || null;
          const stillOtherActive = Object.entries(AppState.reports || {}).some(([id, r]) => {
            if (id === reportId) return false;
            if (myReportCategory && r.category !== myReportCategory) return false;
            return r.status === 'progress' || r.status === 'transporting';
          });
          if (!stillOtherActive) {
            if (userTrashMarker) {
              userMapInstance.removeLayer(userTrashMarker);
              userTrashMarker = null;
            }
          }
          // userReportMarkers (laporan warga lain) dibersihkan oleh renderAllReportMarkersOnUserMap
        });
      }, 2500); // tampilkan hijau selama 2.5 detik sebelum dihapus
      // listenAllOfficersUserMap akan mendeteksi tidak ada petugas aktif tersisa
      // dan menutup peta + kembali ke dashboard jika memang sudah selesai semua.
    }
  });

  AppState.userMapInstance = userMapInstance;
  window.userMapInstance   = userMapInstance;

  const r = AppState.reports[reportId];
  $('user-map-location').textContent = r?.location || 'Lokasi Laporan';

  const catBadge = $('user-map-category-badge');
  if (catBadge) {
    if (r?.category) {
      catBadge.textContent    = r.category;
      catBadge.style.display  = 'inline-flex';
    } else {
      catBadge.style.display = 'none';
    }
  }

  // Status label + info petugas
  _updateUserMapStatusInfo(r);

  AppState.userMapReportId = reportId;
}

// Helper: update status & info petugas di peta warga
function _updateUserMapStatusInfo(r) {
  if (!r) return;
  // Refresh marker laporan lain di peta setiap status berubah
  const currentId  = AppState.userMapReportId;
  const currentCat = r.category;
  if (currentId && currentCat && userMapInstance) {
    renderAllReportMarkersOnUserMap(currentId, currentCat);
  }
  const status = r.status || 'pending';

  // Update ikon marker sampah utama secara realtime saat status berubah
  if (userTrashMarker && userMapInstance) {
    userTrashMarker.setIcon(buildTrashMarkerIcon(status, 'lg'));
    // Update popup content sesuai status terbaru
    const _trashPopupMap = { pending: '⏳ Belum Dibersihkan', progress: '🔵 Sedang Dibersihkan', transporting: '🔵 Mengantarkan ke TPS', done: '✅ Selesai Dibersihkan' };
    userTrashMarker.setPopupContent('<b>📍 Lokasi Sampah Anda</b><br><small>' + (_trashPopupMap[status] || '⏳ Belum Dibersihkan') + '</small>');
  }

  const stLabels = {
    pending:      '⏳ Menunggu Petugas',
    progress:     '🚛 Petugas Sedang Menuju Lokasi',
    transporting: '🏭 Petugas Mengantarkan ke TPS',
    done:         '✅ Selesai Dibersihkan',
  };
  const statusEl = $('user-map-status');
  if (statusEl) statusEl.textContent = stLabels[status] || stLabels.pending;

  // Tampilkan nama petugas & kategori sampah yang dibersihkan
  const officerInfoEl = $('user-map-officer-info');
  if (officerInfoEl) {
    if (r.officerName && (status === 'progress' || status === 'transporting' || status === 'done')) {
      officerInfoEl.style.display = 'block';
      const _officerAvatar = r.officerPhotoUrl
        ? `<img src="${r.officerPhotoUrl}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid rgba(78,203,141,0.4);flex-shrink:0" />`
        : `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#4ecb8d,#2ea868);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(78,203,141,0.3);flex-shrink:0">👮</div>`;
      officerInfoEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(78,203,141,0.06);border:1px solid rgba(78,203,141,0.2);border-radius:14px;margin:8px 0">
          ${_officerAvatar}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800;color:var(--text-primary)">${r.officerName}</div>
            ${r.officerCategory ? `<div style="font-size:11px;color:var(--green-light);margin-top:1px;font-weight:600">🗂️ ${r.officerCategory}</div>` : ''}
          </div>
          <div style="font-size:10px;font-weight:700;color:var(--green-light);background:rgba(78,203,141,0.12);border:1px solid rgba(78,203,141,0.25);border-radius:20px;padding:4px 9px;white-space:nowrap">${status === 'done' ? '✅ Selesai' : '🚛 Aktif'}</div>
        </div>`;
    } else {
      officerInfoEl.style.display = 'none';
    }
  }

  // ── Panel Jarak + Estimasi Tiba ──
  // Tampil hanya saat ada petugas yang sedang menangani laporan ini.
  // Begitu petugas TIBA di lokasi sampah (status berubah dari 'progress'
  // ke 'transporting'/'done'), jarak & estimasi dipaksa jadi "0 km"/"0 menit".
  if (status === 'progress' || status === 'transporting' || status === 'done') {
    _showUserNavStats(true);
    if (status !== 'progress') _markUserNavStatsArrived();
  } else {
    _showUserNavStats(false);
  }
}

// ─── Panel Jarak + Estimasi Tiba di Peta Warga ─────────────────
// Menampilkan jarak & ETA petugas menuju lokasi sampah, sama seperti
// panel navigasi di halaman petugas. Begitu petugas TIBA di lokasi
// (status laporan berubah dari 'progress', atau rute OSRM sudah ≈0),
// jarak & estimasi otomatis dipaksa menjadi "0 km" / "0 menit".
function _showUserNavStats(show) {
  const row = document.getElementById('user-nav-stats-row');
  if (row) row.style.display = show ? 'flex' : 'none';
}

function _setUserNavStats(distanceText, etaText) {
  const distEl = document.getElementById('user-nav-distance');
  const etaEl  = document.getElementById('user-nav-eta');
  if (distEl) distEl.textContent = distanceText;
  if (etaEl)  etaEl.textContent  = etaText;
}

// Tandai panel jarak/ETA sebagai "petugas sudah tiba" di lokasi sampah
function _markUserNavStatsArrived() {
  _setUserNavStats('0 km', '0 menit');
}

// Hitung ETA petugas utama ke lokasi laporan — tanpa menggambar garis rute
// Hasilnya dipakai untuk update label di atas marker petugas di peta warga
let _etaFetchTimeout = null;
async function fetchOfficerETAForUserMap(officerLoc, targetCoords, reportId) {
  // Debounce: jangan spam request tiap detik saat posisi berubah kecil
  if (_etaFetchTimeout) return;
  _etaFetchTimeout = setTimeout(() => { _etaFetchTimeout = null; }, 8000);

  try {
    const url  = `https://router.project-osrm.org/route/v1/driving/${officerLoc.lng},${officerLoc.lat};${targetCoords.lng},${targetCoords.lat}?geometries=geojson&overview=false`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const mins    = Math.round(data.routes[0].duration / 60);
      const etaText = mins <= 0 ? 'Tiba' : mins + ' mnt';

      // Simpan ke Firebase agar selalu terbaru (legacy officerLocation node)
      const officerData = AppState.reports[reportId];
      const oid = officerData?.officerUid || null;

      // Update marker via updateOfficerMarkerOnUserMap dengan eta di-inject ke loc
      const locWithEta = { ...officerLoc, eta: etaText };
      updateOfficerMarkerOnUserMap(locWithEta);

      // Update panel jarak + estimasi tiba di peta warga
      if (mins <= 0) {
        _markUserNavStatsArrived();
      } else {
        const distKm = data.routes[0].distance / 1000;
        const distanceText = distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km';
        _setUserNavStats(distanceText, mins + ' menit');
      }
    }
  } catch (e) {
    // Jika OSRM gagal, gunakan estimasi sederhana dari jarak lurus
    const R = 6371;
    const dLat = (targetCoords.lat - officerLoc.lat) * Math.PI / 180;
    const dLng = (targetCoords.lng - officerLoc.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(officerLoc.lat*Math.PI/180)*Math.cos(targetCoords.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const mins = Math.round(distKm / 0.5 * 60);
    const etaText = mins <= 0 ? 'Tiba' : mins + ' mnt';
    updateOfficerMarkerOnUserMap({ ...officerLoc, eta: etaText });

    if (mins <= 0) {
      _markUserNavStatsArrived();
    } else {
      const distanceText = distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km';
      _setUserNavStats(distanceText, mins + ' menit (perkiraan)');
    }
  }
}

async function drawUserRouteToOfficer(officerLoc, targetCoords) {
  if (!userMapInstance) return;
  try {
    const url  = `https://router.project-osrm.org/route/v1/driving/${officerLoc.lng},${officerLoc.lat};${targetCoords.lng},${targetCoords.lat}?geometries=geojson&overview=full`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      // Gambar rute hijau-biru (warna berbeda dari jalur sungai)
      if (userRouteLayer)     userMapInstance.removeLayer(userRouteLayer);
      if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
      userRouteLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4ecb8d', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
      }).addTo(userMapInstance);
      userRouteGlowLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#4ecb8d', weight: 12, opacity: 0.15, lineCap: 'round' }
      }).addTo(userMapInstance);
      // Sekaligus update ETA di marker petugas
      const mins    = Math.round(data.routes[0].duration / 60);
      const etaText = mins <= 0 ? 'Tiba' : mins + ' mnt';
      updateOfficerMarkerOnUserMap({ ...officerLoc, eta: etaText });

      // Update panel jarak + estimasi tiba di peta warga
      const currentStatus = AppState.reports[AppState.userMapReportId]?.status;
      if (mins <= 0 || currentStatus !== 'progress') {
        _markUserNavStatsArrived();
      } else {
        const distKm = data.routes[0].distance / 1000;
        const distanceText = distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km';
        _setUserNavStats(distanceText, mins + ' menit');
      }
    }
  } catch (e) {
    if (userRouteLayer) userMapInstance.removeLayer(userRouteLayer);
    userRouteLayer = L.polyline(
      [[officerLoc.lat, officerLoc.lng], [targetCoords.lat, targetCoords.lng]],
      { color: '#4ecb8d', weight: 3, dashArray: '8,5', opacity: 0.7 }
    ).addTo(userMapInstance);

    // Fallback estimasi jarak lurus untuk panel jika OSRM gagal
    const currentStatus = AppState.reports[AppState.userMapReportId]?.status;
    if (currentStatus !== 'progress') {
      _markUserNavStatsArrived();
    } else {
      const distKm = getDistanceKm(officerLoc.lat, officerLoc.lng, targetCoords.lat, targetCoords.lng);
      const estMinutes = Math.max(1, Math.round(distKm * 2));
      const distanceText = distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km';
      _setUserNavStats(distanceText, estMinutes + ' menit (perkiraan)');
    }
  }
}

// Gambar rute tipis untuk petugas lain menuju laporan mereka
async function drawOtherOfficerRoute(officerId, from, toCoords) {
  if (!userMapInstance) return;
  // Hapus rute lama jika ada
  if (userOtherOfficerRoutes[officerId]) {
    userOtherOfficerRoutes[officerId].forEach(l => userMapInstance.removeLayer(l));
  }
  const color = getOfficerColor(officerId); // warna unik per petugas
  try {
    const url  = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${toCoords.lng},${toCoords.lat}?geometries=geojson&overview=full`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const glow = L.geoJSON(data.routes[0].geometry, {
        style: { color, weight: 8, opacity: 0.15, lineCap: 'round' }
      }).addTo(userMapInstance);
      const line = L.geoJSON(data.routes[0].geometry, {
        style: { color, weight: 3, opacity: 0.75, lineCap: 'round', dashArray: '6,5' }
      }).addTo(userMapInstance);
      userOtherOfficerRoutes[officerId] = [glow, line];

      // Hitung & simpan ETA untuk panel
      const mins = Math.round(data.routes[0].duration / 60);
      return mins <= 0 ? 'Tiba' : mins + ' mnt';
    }
  } catch(e) {
    const line = L.polyline([[from.lat, from.lng],[toCoords.lat, toCoords.lng]],
      { color, weight: 2, opacity: 0.5, dashArray: '6,5' }).addTo(userMapInstance);
    userOtherOfficerRoutes[officerId] = [line];
  }
  return null;
}

// Tampilkan marker untuk setiap laporan sampah aktif (kategori sama) di peta warga
function renderAllReportMarkersOnUserMap(currentReportId, reportCategory) {
  if (!userMapInstance) return;

  const allReports = AppState.reports || {};

  Object.entries(allReports).forEach(([rId, r]) => {
    // Hanya laporan dengan kategori sama, ada koordinat, bukan milik sendiri, belum selesai
    if (rId === currentReportId) return;
    if (!r.coords) return;
    if (r.category !== reportCategory) return;
    if (r.status === 'done') return;
    // Hanya tampilkan laporan yang sedang aktif ditangani petugas (bukan pending)
    if (!r.status || r.status === 'pending') return;

    // Gunakan warna berdasarkan status: merah=pending, biru=progress/transporting
    // BUG #1 FIX: Marker laporan warga LAIN tidak boleh pernah berubah hijau dari fungsi ini.
    // Hanya clearMapOnReportDone / status listener laporan SENDIRI yang boleh set warna hijau.
    const safeStatus = (r.status === 'done') ? 'progress' : (r.status || 'pending');
    const otherTrashIcon = buildTrashMarkerIcon(safeStatus, 'sm');

    const locLabel = r.location ? r.location.split(',')[0] : 'Laporan lain';
    if (userReportMarkers[rId]) {
      // Update ikon marker yang sudah ada (status mungkin berubah)
      userReportMarkers[rId].setIcon(otherTrashIcon);
      userReportMarkers[rId].setPopupContent(`<b>🗑️ ${locLabel}</b><br><small>Pelapor: ${r.reporterName || '-'}</small><br><small>Status: ${r.status || 'pending'}</small>`);
      return;
    }

    userReportMarkers[rId] = L.marker([r.coords.lat, r.coords.lng], { icon: otherTrashIcon })
      .addTo(userMapInstance)
      .bindPopup(`<b>🗑️ ${locLabel}</b><br><small>Pelapor: ${r.reporterName || '-'}</small><br><small>Status: ${r.status || 'pending'}</small>`);
  });

  // Setiap marker berubah warna berdasarkan STATUS-NYA SENDIRI secara independen:
  //   progress/transporting → biru (sudah di-handle di forEach atas)
  //   done                  → hijau sebentar lalu dihapus
  //   pending / hilang      → hapus dari peta
  // Tidak ada ketergantungan antar laporan — X hijau saat X done, Y hijau saat Y done, dst.
  Object.keys(userReportMarkers).forEach(rId => {
    const r = allReports[rId];

    // Hapus jika laporan hilang dari database
    if (!r) {
      userMapInstance.removeLayer(userReportMarkers[rId]);
      delete userReportMarkers[rId];
      return;
    }
    // Hapus jika ini laporan utama yang sedang dipantau (punya marker sendiri: userTrashMarker)
    if (rId === currentReportId) {
      userMapInstance.removeLayer(userReportMarkers[rId]);
      delete userReportMarkers[rId];
      return;
    }
    // Hapus jika laporan bukan kategori yang sama
    if (r.category !== reportCategory) {
      userMapInstance.removeLayer(userReportMarkers[rId]);
      delete userReportMarkers[rId];
      return;
    }
    // Hapus jika laporan kembali ke pending
    if (!r.status || r.status === 'pending') {
      userMapInstance.removeLayer(userReportMarkers[rId]);
      delete userReportMarkers[rId];
      return;
    }
    // Jika laporan ini selesai: tampilkan hijau lalu hapus — INDEPENDEN dari laporan lain
    if (r.status === 'done') {
      if (userReportMarkers[rId] && !userReportMarkers[rId]._doneAnimating) {
        userReportMarkers[rId]._doneAnimating = true;
        userReportMarkers[rId].setIcon(buildTrashMarkerIcon('done', 'sm'));
        const markerRef = userReportMarkers[rId];
        setTimeout(() => {
          if (userMapInstance && markerRef) userMapInstance.removeLayer(markerRef);
          delete userReportMarkers[rId];
        }, 2500);
      }
      return;
    }
  });
}

// ─── Unified: semua petugas aktif di peta warga ──────────────
// Menggantikan listener officerLocation (legacy) + listenOtherOfficersUserMap
// Sumber tunggal: officerLocations (multi-petugas)
function listenAllOfficersUserMap(targetCoords, currentReportId, reportCategory) {
  window.APP_CONFIG.db.ref('officerLocations').on('value', async snap => {
    if (!userMapInstance) return;
    // BUG FIX: saring entri officerLocations milik akun petugas yang sudah
    // dihapus (lihat _filterValidOfficerLocations di atas file ini), agar
    // marker petugas yang sudah tidak ada tidak ikut tampil di peta warga.
    const allOfficers = _filterValidOfficerLocations(snap.val() || {});

    // Selalu render marker sampah lain
    renderAllReportMarkersOnUserMap(currentReportId, reportCategory);

    const reportStatus = AppState.reports[currentReportId]?.status;

    // BUG #2 FIX: Gunakan officerLocations sebagai sumber kebenaran utama.
    // Jika masih ada petugas yang navigatingTo === currentReportId dan isActive,
    // perlakukan laporan sebagai aktif meskipun AppState.reports belum terupdate.
    // Ini mencegah marker petugas Y hilang saat petugas Z update laporan BERBEDA ke done.
    const mainOfficerStillActive = Object.values(allOfficers).some(
      d => d.navigatingTo === currentReportId && d.isActive && d.lat
    );
    const reportActive = mainOfficerStillActive ||
      reportStatus === 'progress' || reportStatus === 'transporting';

    // ── Cek: apakah peta warga sudah boleh ditutup? ──
    // Syarat tutup peta warga X:
    //   1. Laporan UTAMA warga ini (currentReportId) sudah berstatus 'done', DAN
    //   2. Tidak ada satupun petugas lain yang masih aktif navigasi di peta ini.
    // Artinya: jika petugas Z update laporan warga F jadi 'done', tapi petugas Y
    // yang menangani laporan WARGA X belum selesai → peta warga X TIDAK ditutup.
    const anyActiveOfficer = Object.values(allOfficers).some(
      d => d.isActive && d.lat && d.navigatingTo &&
           AppState.reports[d.navigatingTo]?.status !== 'done'
    );

    // Peta hanya ditutup jika laporan utama sudah done DAN semua petugas sudah nonaktif
    if (reportStatus === 'done' && !anyActiveOfficer) {
      // Bersihkan semua elemen peta
      if (userOfficerMarker)  { userMapInstance.removeLayer(userOfficerMarker); userOfficerMarker = null; }
      if (userRouteLayer)     { userMapInstance.removeLayer(userRouteLayer);    userRouteLayer    = null; }
      if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
      if (userTrashMarker)    { userMapInstance.removeLayer(userTrashMarker);   userTrashMarker   = null; }
      Object.keys(userOtherOfficerMarkers).forEach(id => {
        userMapInstance.removeLayer(userOtherOfficerMarkers[id]);
        delete userOtherOfficerMarkers[id];
      });
      Object.keys(userOtherOfficerRoutes).forEach(id => {
        userOtherOfficerRoutes[id].forEach(l => userMapInstance.removeLayer(l));
        delete userOtherOfficerRoutes[id];
      });
      window.APP_CONFIG.db.ref('officerLocations').off();

      // Tutup peta & kembali ke dashboard warga setelah jeda singkat
      if (reportStatus === 'done') {
        AppUtils.showToast('✅ Laporan selesai dibersihkan!', 'success');
      }
      setTimeout(() => {
        if (userMapInstance) {
          userMapInstance.remove();
          userMapInstance    = null;
          userOfficerMarker  = null;
          userTrashMarker    = null;
          userRouteLayer     = null;
          userRouteGlowLayer = null;
          userOtherOfficerMarkers = {};
          userOtherOfficerRoutes  = {};
          userReportMarkers       = {};
        }
        _showUserNavStats(false);
        _setUserNavStats('—', '—');
        AppState.userMapReportId = null;
        AppUtils.showPage('page-user-dashboard');
      }, 2000);
      return;
    }

    // Jika laporan belum aktif: sembunyikan semua marker petugas
    if (!reportActive) {
      if (userOfficerMarker)  { userMapInstance.removeLayer(userOfficerMarker); userOfficerMarker = null; }
      if (userRouteLayer)     { userMapInstance.removeLayer(userRouteLayer);    userRouteLayer    = null; }
      if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
      Object.keys(userOtherOfficerMarkers).forEach(id => {
        userMapInstance.removeLayer(userOtherOfficerMarkers[id]);
        delete userOtherOfficerMarkers[id];
      });
      Object.keys(userOtherOfficerRoutes).forEach(id => {
        userOtherOfficerRoutes[id].forEach(l => userMapInstance.removeLayer(l));
        delete userOtherOfficerRoutes[id];
      });
      updateOtherOfficersPanel([], reportCategory);
      _showUserNavStats(false);
      return;
    }

    const seenIds     = new Set();
    const otherActive = [];

    for (const [officerId, data] of Object.entries(allOfficers)) {
      if (!data.isActive || !data.lat) continue;
      if (!data.navigatingTo) continue;
      const theirReportDone = AppState.reports[data.navigatingTo]?.status === 'done';
      if (theirReportDone) continue;

      const isMainOfficer = data.navigatingTo === currentReportId;

      if (isMainOfficer) {
        // ── Petugas yang menangani laporan WARGA INI ──
        seenIds.add(officerId);
        const locWithMeta = {
          lat: data.lat, lng: data.lng,
          name: data.name || 'Petugas',
          category: data.category || 'Lainnya',
          eta: data.eta || null,
          photoUrl: data.photoUrl || null,
        };
        // Gambar rute dari posisi petugas ke lokasi sampah warga
        updateOfficerMarkerOnUserMap(locWithMeta);
        drawUserRouteToOfficer({ lat: data.lat, lng: data.lng }, targetCoords);
      } else {
        // ── Petugas lain yang menuju laporan berbeda ──
        const officerCat   = data.category || 'Lainnya';
        const sameCategory = !reportCategory || officerCat === reportCategory || officerCat === 'Lainnya';
        if (!sameCategory) continue;

        seenIds.add(officerId);
        const theirReport  = AppState.reports[data.navigatingTo];
        let etaText = data.eta || null;

        if (theirReport?.coords) {
          const freshEta = await drawOtherOfficerRoute(
            officerId,
            { lat: data.lat, lng: data.lng },
            theirReport.coords
          );
          if (freshEta) etaText = freshEta;
        }

        const markerColor   = getOfficerColor(officerId);
        const shortName     = (data.name || 'Petugas').split(' ')[0];
        const otherPhotoUrl = data.photoUrl || null;
        const otherAvatarHtml = otherPhotoUrl
          ? `<img src="${otherPhotoUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2.5px solid #fff;box-shadow:0 3px 10px ${markerColor}80;position:relative;z-index:1;" />`
          : `<div style="background:${markerColor};color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid #fff;box-shadow:0 3px 10px ${markerColor}80;position:relative;z-index:1">🚛</div>`;
        const otherSonarHtml = `
              <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:${markerColor};opacity:0.38;animation:sonar-other-1 1.8s ease-out infinite;animation-delay:0s"></div>
              <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:${markerColor};opacity:0.26;animation:sonar-other-2 1.8s ease-out infinite;animation-delay:0.55s"></div>
              <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:${markerColor};opacity:0.16;animation:sonar-other-3 1.8s ease-out infinite;animation-delay:1.1s"></div>`;

        const _otherDims = officerPinDims(40, false);
        const icon = L.divIcon({
          html: buildOfficerPinHTML({
            label: shortName, labelColor: markerColor, labelBorder: `${markerColor}99`,
            etaText: null, sonarHtml: otherSonarHtml, avatarHtml: otherAvatarHtml,
            avatarWrapSize: 40, dotColor: markerColor,
          }),
          iconSize: [_otherDims.width, _otherDims.height],
          iconAnchor: [_otherDims.anchorX, _otherDims.anchorY],
          className: "",
          popupAnchor: [0, -(_otherDims.height + 4)],
        });

        const locLabel         = theirReport?.location ? theirReport.location.split(',')[0] : 'Laporan lain';
        const theirTrashCat    = data.category || 'Lainnya';
        const otherPopupAvatar = otherPhotoUrl
          ? `<img src="${otherPhotoUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.4);flex-shrink:0" />`
          : `<div style="width:36px;height:36px;border-radius:50%;background:${markerColor};display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(255,255,255,0.4);flex-shrink:0">👮</div>`;

        const popupHtml = `
          <div style="font-family:sans-serif;min-width:170px;max-width:220px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              ${otherPopupAvatar}
              <div>
                <div style="font-weight:800;font-size:14px;color:#111">${data.name || 'Petugas'}</div>
                <div style="font-size:11px;color:#888;margin-top:1px">▶ ${locLabel}</div>
              </div>
            </div>
            <div style="border-top:1px solid #eee;padding-top:7px;display:flex;flex-direction:column;gap:5px">
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#444">
                <span style="font-size:13px">🗂️</span>
                <span><b>Kategori:</b> ${theirTrashCat}</span>
              </div>
              ${etaText ? `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#d4a800;font-weight:700">
                <span style="font-size:13px">⏱</span><span>ETA: ${etaText}</span>
              </div>` : ''}
            </div>
          </div>`;

        if (userOtherOfficerMarkers[officerId]) {
          userOtherOfficerMarkers[officerId].setLatLng([data.lat, data.lng]);
          userOtherOfficerMarkers[officerId].setIcon(icon);
          userOtherOfficerMarkers[officerId].setPopupContent(popupHtml);
        } else {
          userOtherOfficerMarkers[officerId] = L.marker([data.lat, data.lng], { icon })
            .addTo(userMapInstance)
            .bindPopup(popupHtml);
        }
        otherActive.push({ ...data, etaText });
      }
    }

    // Bersihkan marker petugas yang sudah tidak ada / tidak aktif
    Object.keys(userOtherOfficerMarkers).forEach(id => {
      if (!seenIds.has(id)) {
        userMapInstance.removeLayer(userOtherOfficerMarkers[id]);
        delete userOtherOfficerMarkers[id];
        if (userOtherOfficerRoutes[id]) {
          userOtherOfficerRoutes[id].forEach(l => userMapInstance.removeLayer(l));
          delete userOtherOfficerRoutes[id];
        }
      }
    });

    // Hapus marker petugas utama jika dia sudah tidak ada di officerLocations
    const mainOfficerExists = Object.entries(allOfficers).some(
      ([, d]) => d.navigatingTo === currentReportId && d.isActive && d.lat
    );
    if (!mainOfficerExists && userOfficerMarker) {
      userMapInstance.removeLayer(userOfficerMarker); userOfficerMarker = null;
      if (userRouteLayer)     { userMapInstance.removeLayer(userRouteLayer);     userRouteLayer     = null; }
      if (userRouteGlowLayer) { userMapInstance.removeLayer(userRouteGlowLayer); userRouteGlowLayer = null; }
    }

    updateOtherOfficersPanel(otherActive, reportCategory);
  });
}

// Alias untuk kompatibilitas (dipanggil dari clearMapOnReportDone dll)
function listenOtherOfficersUserMap(targetCoords, currentReportId, reportCategory) {
  listenAllOfficersUserMap(targetCoords, currentReportId, reportCategory);
}
function updateOtherOfficersPanel(officers, category) {
  const panel = $('user-map-other-officers');
  const list  = $('user-map-other-officers-list');
  if (!panel || !list) return;

  if (officers.length === 0) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  list.innerHTML = officers.map(o => {
    const theirReport  = o.navigatingTo ? AppState.reports[o.navigatingTo] : null;
    const destLabel    = theirReport?.location ? theirReport.location.split(',')[0] : 'Laporan lain';
    const etaText      = o.etaText || o.eta || null;
    const _panelAvatar = o.photoUrl
      ? `<img src="${o.photoUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(240,192,48,0.4);flex-shrink:0" />`
      : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f0c030,#d4a820);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(240,192,48,0.3);flex-shrink:0">🚛</div>`;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(240,192,48,0.05);border:1px solid rgba(240,192,48,0.18);border-radius:14px">
      ${_panelAvatar}
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:800;color:var(--text-primary)">${o.name}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">▶ ${destLabel}</div>
      </div>
      ${etaText
        ? `<div style="font-size:10px;font-weight:800;color:#f0c030;background:rgba(240,192,48,0.1);border:1px solid rgba(240,192,48,0.3);border-radius:20px;padding:3px 8px;white-space:nowrap">⏱ ${etaText}</div>`
        : `<div style="width:8px;height:8px;border-radius:50%;background:#f0c030;animation:pulse-badge 1.5s ease infinite;flex-shrink:0"></div>`
      }
    </div>`
  }).join('');
}

function updateOfficerMarkerOnUserMap(loc) {
  if (!userMapInstance) return;

  const reportId  = AppState.userMapReportId;
  const report    = reportId ? AppState.reports[reportId] : null;
  const name      = loc.name  || report?.officerName     || 'Petugas';
  const trashCategory = loc.category || report?.officerCategory || 'Lainnya';
  const etaText   = loc.eta || null;
  const shortName = name.split(' ')[0];
  // Foto profil petugas (dari loc atau report)
  const photoUrl  = loc.photoUrl || report?.officerPhotoUrl || null;

  // Avatar: foto profil atau emoji default
  const avatarHtml = photoUrl
    ? `<img src="${photoUrl}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 3px 10px rgba(78,203,141,0.5);position:relative;z-index:1;" />`
    : `<div style="background:linear-gradient(135deg,#4ecb8d,#2ea868);color:#fff;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;border:3px solid #fff;box-shadow:0 3px 10px rgba(78,203,141,0.5);position:relative;z-index:1">🚛</div>`;

  // Catatan: label nama TETAP ditampilkan di atas marker, hanya pill
  // "estimasi tiba" (ETA) yang dihapus dari atas marker — ETA tetap
  // ditampilkan di panel bawah peta warga (#user-nav-eta).
  const _mainDims = officerPinDims(54, false);
  const officerIcon = L.divIcon({
    html: buildOfficerPinHTML({
      label: shortName, etaText: null, sonarHtml: greenSonarHtml(46),
      avatarHtml, avatarWrapSize: 54, dotColor: '#4ecb8d',
    }),
    iconSize:   [_mainDims.width, _mainDims.height], className: "",
    iconAnchor: [_mainDims.anchorX, _mainDims.anchorY],
    popupAnchor:[0, -(_mainDims.height + 4)],
  });

  // Foto di popup: besar + info lengkap
  const popupAvatarHtml = photoUrl
    ? `<img src="${photoUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgba(78,203,141,0.4);flex-shrink:0" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#4ecb8d,#2ea868);display:flex;align-items:center;justify-content:center;font-size:24px;border:2px solid rgba(78,203,141,0.4);flex-shrink:0">👮</div>`;

  const popupHtml = `
    <div style="font-family:sans-serif;min-width:170px;max-width:220px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${popupAvatarHtml}
        <div>
          <div style="font-weight:800;font-size:14px;color:#111">${name}</div>
          <div style="font-size:11px;color:#2d9c6e;font-weight:600;margin-top:1px">🚛 Sedang bertugas</div>
        </div>
      </div>
      <div style="border-top:1px solid #eee;padding-top:7px;display:flex;flex-direction:column;gap:5px">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#444">
          <span style="font-size:13px">🗂️</span>
          <span><b>Kategori Sampah:</b> ${trashCategory}</span>
        </div>
        ${etaText ? `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#d4a800;font-weight:700">
          <span style="font-size:13px">⏱</span>
          <span>ETA: ${etaText}</span>
        </div>` : ''}
      </div>
    </div>`;

  if (userOfficerMarker) {
    userOfficerMarker.setLatLng([loc.lat, loc.lng]);
    userOfficerMarker.setIcon(officerIcon);
    userOfficerMarker.setPopupContent(popupHtml);
  } else {
    userOfficerMarker = L.marker([loc.lat, loc.lng], { icon: officerIcon })
      .addTo(userMapInstance)
      .bindPopup(popupHtml);
  }
}

function backFromUserMap() {
  window.APP_CONFIG.db.ref('officerLocation').off();
  window.APP_CONFIG.db.ref('officerLocations').off();
  // Matikan listener status laporan jika ada
  const rid = AppState.userMapReportId;
  if (rid) window.APP_CONFIG.db.ref('reports/' + rid + '/status').off();
  if (_activeStatusListenerReportId) {
    window.APP_CONFIG.db.ref('reports/' + _activeStatusListenerReportId + '/status').off();
    _activeStatusListenerReportId = null;
  }
  // Reset map fullscreen state jika aktif
  const wrap = document.getElementById('user-map-outer-wrap');
  const panel = document.getElementById('user-nav-panel');
  if (wrap && wrap.classList.contains('map-only-fullscreen')) {
    wrap.classList.remove('map-only-fullscreen');
    if (panel) { panel.style.display = ''; panel.classList.remove('panel-map-hidden'); }
  }
  if (userMapInstance) {
    userMapInstance.remove();
    userMapInstance         = null;
    userOfficerMarker       = null;
    userTrashMarker         = null;
    userRouteLayer          = null;
    userRouteGlowLayer      = null;
    userOtherOfficerMarkers = {};
    userOtherOfficerRoutes  = {};
    userReportMarkers       = {};
  }
  _showUserNavStats(false);
  _setUserNavStats('—', '—');
  AppState.userMapReportId = null;
  AppUtils.showPage('page-user-dashboard');
}

// ─── Officer Category Dropdown ────────────────────────────────

let _officerActiveCatFilter = 'semua';

const OFFICER_CATEGORY_ICONS = {
  'Organik':    '🍃',
  'Anorganik':  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/></svg>',
  'B3':         '⚗️',
  'Elektronik': '💻',
  'Medis':      '🏥',
  'Konstruksi': '🏗️',
  'Lainnya':    '🗑️',
};

function buildOfficerCatDropdown() {
  const menu = document.getElementById('officer-cat-dropdown-menu');
  if (!menu) return;

  let reports = Object.entries(AppState.reports || {}).map(([id, r]) => ({ ...r, id }));
  const officerCategory = AppState.currentUser?.category;
  if (officerCategory && officerCategory !== 'Lainnya') {
    reports = reports.filter(r => r.category === officerCategory || !r.category);
  }

  const catCounts = {};
  let total = 0;
  reports.forEach(r => {
    const cat = r.category || 'Lainnya';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    total++;
  });

  const cats = Object.keys(catCounts).sort();
  let html = `<div class="user-cat-dropdown-item ${_officerActiveCatFilter === 'semua' ? 'active' : ''}" onclick="selectOfficerCatFilter('semua')">
    <span class="cat-item-icon">📋</span><span>Semua Kategori</span><span class="cat-item-count">${total}</span>
  </div>`;
  cats.forEach(cat => {
    const icon = OFFICER_CATEGORY_ICONS[cat] || '🗑️';
    html += `<div class="user-cat-dropdown-item ${_officerActiveCatFilter === cat ? 'active' : ''}" onclick="selectOfficerCatFilter('${cat}')">
      <span class="cat-item-icon">${icon}</span><span>${cat}</span><span class="cat-item-count">${catCounts[cat]}</span>
    </div>`;
  });
  menu.innerHTML = html;
}

function toggleOfficerCatDropdown() {
  buildOfficerCatDropdown();
  const menu = document.getElementById('officer-cat-dropdown-menu');
  const btn  = document.getElementById('officer-cat-dropdown-btn');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  if (btn) btn.classList.toggle('open', !isOpen);
}

function selectOfficerCatFilter(cat) {
  _officerActiveCatFilter = cat;
  const label = document.getElementById('officer-cat-dropdown-label');
  if (label) label.innerHTML = cat === 'semua' ? '🗂️ Semua Kategori' : `${OFFICER_CATEGORY_ICONS[cat] || '🗑️'} ${cat}`;
  const menu = document.getElementById('officer-cat-dropdown-menu');
  const btn  = document.getElementById('officer-cat-dropdown-btn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.classList.remove('open');
  renderOfficerReports();
}

// Tutup dropdown saat klik di luar
document.addEventListener('click', e => {
  const wrap = document.getElementById('officer-cat-dropdown-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const menu = document.getElementById('officer-cat-dropdown-menu');
    const btn  = document.getElementById('officer-cat-dropdown-btn');
    if (menu) menu.classList.remove('open');
    if (btn)  btn.classList.remove('open');
  }
});

// ─── Export ───────────────────────────────────────────────────
window.OfficerApp = {
  loadOfficerDashboard, setOfficerTab, renderOfficerReports,
  openReportDetail, saveReportStatus, viewOnMap,
  backFromOfficerMap, backFromUserMap,
  initOfficerMap, initUserMap, updateOfficerMarkerOnUserMap,
  drawUserRouteToOfficer, listenOtherOfficersUserMap, updateOtherOfficersPanel,
  toggleOfficerCatDropdown, selectOfficerCatFilter,
  _syncTransportButtonState,
};


window.drawUserRouteToOfficer     = drawUserRouteToOfficer;
window.listenOtherOfficersUserMap = listenOtherOfficersUserMap;
window.updateOtherOfficersPanel   = updateOtherOfficersPanel;
window.backFromUserMap            = backFromUserMap;
window.loadOfficerDashboard       = loadOfficerDashboard;
window.setOfficerTab              = setOfficerTab;
window.openReportDetail           = openReportDetail;
window.saveReportStatus           = saveReportStatus;
window.viewOnMap                  = viewOnMap;
window.backFromOfficerMap         = backFromOfficerMap;
window.backFromUserMap            = backFromUserMap;
window.toggleOfficerCatDropdown = toggleOfficerCatDropdown;
window.selectOfficerCatFilter    = selectOfficerCatFilter;
window.clearMapOnReportDone      = clearMapOnReportDone;
