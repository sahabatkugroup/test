// kurir_script.js
import { db, firestoreDb, auth, ref, set, get, onValue, update, remove, collection, doc, onSnapshot, query, orderBy, serverTimestamp, addDoc } from './firebase_config.js';
import { el, qs, qsa, money, leftPad, showNotification, setActiveTab } from './common_script.js';

let currentUser = localStorage.getItem('currentUser');
let lastNoNota = 0;
let notaCounterLoaded = false;
let currentViewedNota = null; // To store the nota object being viewed

// Redirect if not logged in
if (!currentUser) {
  window.location.href = 'kurir_login.html';
} else {
  el('curUser').innerText = currentUser;
  el('kurirName').value = currentUser;
  ensureCounter().then(updateNextNotaLabel);
  refreshNotaHistory();
}

// Logout button
el('kurirLogoutBtn').addEventListener('click', doKurirLogout);
function doKurirLogout() {
  localStorage.removeItem('currentUser');
  currentUser = null;
  window.location.href = 'index.html';
  showNotification('Anda telah logout.', 'info');
}

// Tab switching for Kurir Dashboard
const kurirTabs = el('kurirNavTabs');
if(kurirTabs){
  kurirTabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTab('kurirNavTabs', btn.dataset.tab);
      // Trigger specific refresh for tabs
      if (btn.dataset.tab === 'riwayatTab') refreshNotaHistory();
      if (btn.dataset.tab === 'rekapTab') el('btnLoadRekap').click(); // Auto-load rekap
      if (btn.dataset.tab === 'pelacakTab') loadPelacakData(); // Load data for pelacak tab
      if (btn.dataset.tab === 'cekOngkirModule') el('tujuanInput').focus(); // Focus on input
      if (btn.dataset.tab === 'absensiKurirModule') absensiQuickSync(); // Refresh absensi
    });
  });
}

// ====================================================================
// Kurir Dashboard: Nota Tab
// ====================================================================
const itemsArea = el('itemsArea');
const tambahanArea = el('tambahanArea');

el('btnAddItem').addEventListener('click', () => addItemUI());
el('btnClearItems').addEventListener('click', () => { itemsArea.innerHTML = ''; addItemUI(); updateTotals(); });
el('btnAddTambahan').addEventListener('click', () => addTambahanUI());
el('ongkir').addEventListener('input', updateTotals);
el('btnSaveForm').addEventListener('click', saveNoteToFirebase);
el('btnExportPreview').addEventListener('click', savePreviewAsImage);
el('btnSharePreview').addEventListener('click', sharePreviewImage);
el('btnClearAll').addEventListener('click', clearAllNotaForm);

// Default one item and one additional field
addItemUI();
addTambahanUI();

function addItemUI(pref = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'line-card';
  wrap.innerHTML = `
    <div><label class="small">Nama Item</label><input class="iname" type="text" value="${pref.name || ''}" placeholder="Nama menu / barang"></div>
    <div><label class="small">Qty</label><input class="iqty" type="number" min="1" value="${pref.qty || 1}"></div>
    <div><label class="small">Harga (Rp)</label><input class="iprice" type="number" min="0" value="${pref.price || 0}"></div>
    <div><label class="small">Subtotal</label><div class="sub isub">0</div></div>
    <div><button class="btn danger mini-btn removeBtn">Hapus</button></div>
  `;
  itemsArea.appendChild(wrap);
  wrap.querySelectorAll('input').forEach(i => i.addEventListener('input', updateTotals));
  wrap.querySelector('.removeBtn').addEventListener('click', () => { wrap.remove(); updateTotals(); });
  updateTotals();
}

function addTambahanUI(pref = {}) {
  const row = document.createElement('div');
  row.className = 'line-card-tambahan';
  row.innerHTML = `
    <div><label class="small">Jenis Tambahan</label><select class="t-type">
      <option ${!pref.type ? 'selected' : ''} value="">-- Pilih --</option>
      <option ${pref.type === 'Tambahan Ojeg' ? 'selected' : ''} value="Tambahan Ojeg">Tambahan Ojeg</option>
      <option ${pref.type === 'Tambahan Malam' ? 'selected' : ''} value="Tambahan Malam">Tambahan Malam</option>
      <option ${pref.type === 'Tambahan Tempat' ? 'selected' : ''} value="Tambahan Tempat">Tambahan Tempat</option>
      <option ${pref.type === 'Tambahan Hujan' ? 'selected' : ''} value="Tambahan Hujan">Tambahan Hujan</option>
      <option ${pref.type === 'Tambahan Parkir' ? 'selected' : ''} value="Tambahan Parkir">Tambahan Parkir</option>
      <option ${pref.type === 'Tambahan Melebihi Kapasitas' ? 'selected' : ''} value="Tambahan Melebihi Kapasitas">Tambahan Melebihi Kapasitas</option>
      <option ${pref.type === 'Tambahan Cash Minuman' ? 'selected' : ''} value="Tambahan Cash Minuman">Tambahan Cash Minuman</option>
      <option ${pref.type === 'Lainnya' ? 'selected' : ''} value="Lainnya">Lainnya</option>
    </select></div>
    <div><label class="small">Nominal (Rp)</label><input class="t-nom" type="number" min="0" value="${pref.nominal || 0}"></div>
    <div><button class="btn secondary mini-btn t-remove">Hapus</button></div>
  `;
  tambahanArea.appendChild(row);
  row.querySelector('.t-nom').addEventListener('input', updateTotals);
  row.querySelector('.t-type').addEventListener('change', updateTotals);
  row.querySelector('.t-remove').addEventListener('click', () => { row.remove(); updateTotals(); });
  updateTotals();
}

function updateTotals() {
  let total = 0;
  itemsArea.querySelectorAll('.line-card').forEach(c => {
    const qty = Number(c.querySelector('.iqty').value) || 0;
    const price = Number(c.querySelector('.iprice').value) || 0;
    const sub = qty * price;
    c.querySelector('.isub').innerText = sub.toLocaleString('id-ID');
    total += sub;
  });
  const ong = Number(el('ongkir').value) || 0;
  total += ong;
  let t = 0;
  tambahanArea.querySelectorAll('.t-nom').forEach(n => t += Number(n.value) || 0);
  total += t;
  el('totalPesanan').innerText = 'Rp ' + total.toLocaleString('id-ID');
  updatePreviewFilename();
  return total;
}

function clearAllNotaForm() {
  if (!confirm('Yakin ingin membersihkan semua input nota?')) return;
  el('custPhone').value = '';
  el('ongkir').value = 0;
  itemsArea.innerHTML = '';
  tambahanArea.innerHTML = '';
  addItemUI();
  addTambahanUI();
  updateTotals();
  showNotification('Form nota dibersihkan.', 'info');
}

function updatePreviewFilename() {
  const noNota = leftPad((lastNoNota || 0) + 1);
  const filename = `${currentUser || 'User'}_nota_${noNota}.jpg`;
  el('previewFilename').innerText = filename;
  return filename;
}

function buildNotaObject() {
  const items = [];
  let subtotal = 0;
  itemsArea.querySelectorAll('.line-card').forEach((c) => {
    const name = (c.querySelector('.iname').value || '').trim();
    const qty = Number(c.querySelector('.iqty').value) || 0;
    const price = Number(c.querySelector('.iprice').value) || 0;
    const sub = qty * price;
    subtotal += sub;
    if (name && (qty > 0 || price > 0)) items.push({ name, qty, price, subtotal: sub });
  });

  const tambahans = [];
  let tambahTotal = 0;
  tambahanArea.querySelectorAll('.line-card-tambahan').forEach(r => {
    const type = (r.querySelector('.t-type').value || '').trim();
    const nominal = Number(r.querySelector('.t-nom').value) || 0;
    if (type && nominal > 0) {
      tambahans.push({ type, nominal });
      tambahTotal += nominal;
    }
  });

  const ongkir = Number(el('ongkir').value) || 0;
  const custPhone = (el('custPhone').value || '').replace(/\D/g, '');
  const kurir = currentUser || '';

  const total = subtotal + ongkir + tambahTotal;
  const noNota = leftPad((lastNoNota || 0) + 1);
  const createdAt = new Date().toISOString();

  const lines = [];
  lines.push('🧾 NOTA SAHABATKU DELIVERY');
  lines.push('==========================');
  lines.push(`Kurir  : ${kurir}`);
  lines.push(`No     : ${noNota}`);
  lines.push(`Tanggal: ${new Date(createdAt).toLocaleString('id-ID')}`);
  if (custPhone) lines.push(`WA     : ${custPhone}`);
  lines.push('--------------------------');
  if (items.length === 0) {
    lines.push('Tidak ada item.');
  } else {
    items.forEach((it, i) => lines.push(`${i + 1}. ${it.name} (${it.qty} x Rp ${it.price.toLocaleString('id-ID')}) = Rp ${it.subtotal.toLocaleString('id-ID')}`));
  }
  lines.push('--------------------------');
  lines.push(`Ongkir   : Rp ${ongkir.toLocaleString('id-ID')}`);
  if (tambahans.length > 0) {
    tambahans.forEach(t => lines.push(`${t.type}: Rp ${Number(t.nominal).toLocaleString('id-ID')}`));
  }
  lines.push(`TOTAL    : Rp ${total.toLocaleString('id-ID')}`);
  lines.push('');
  lines.push('Terima kasih sudah menggunakan Sahabatku Delivery 🙏');

  const text = lines.join('\n');
  el('notaPreview').innerText = text;

  return {
    kurir, noNota, createdAt,
    items, tambahans, ongkir, total, custPhone, text
  };
}

// ====================================================================
// Counter No Nota per user
// ====================================================================
async function ensureCounter() {
  if (!currentUser) return;
  if (notaCounterLoaded) return;
  const cRef = ref(db, `counters/${currentUser}`);
  const snap = await get(cRef);
  if (!snap.exists()) {
    await set(cRef, { lastNoNota: 0 });
    lastNoNota = 0;
  } else {
    lastNoNota = Number(snap.val().lastNoNota) || 0;
  }
  notaCounterLoaded = true;
}

async function increaseCounter() {
  await ensureCounter();
  lastNoNota = (Number(lastNoNota) || 0) + 1;
  await update(ref(db, `counters/${currentUser}`), { lastNoNota });
  updateNextNotaLabel();
  return lastNoNota;
}

function updateNextNotaLabel() {
  el('nextNota').innerText = leftPad((lastNoNota || 0) + 1);
}

// ====================================================================
// Save Nota to Firebase
// ====================================================================
async function saveNoteToFirebase() {
  if (!currentUser) { showNotification('Login dulu.', 'error'); return; }
  const data = buildNotaObject();
  if (data.items.length === 0 && data.ongkir === 0 && data.tambahans.length === 0) {
    showNotification('Nota kosong, tidak bisa disimpan.', 'warning');
    return;
  }

  const curNo = await increaseCounter();
  data.noNota = leftPad(curNo);

  const noteId = 'nota_' + Date.now();
  const noteObj = { id: noteId, ...data };

  try {
    await set(ref(db, `nota/${currentUser}/${noteId}`), noteObj);
    await set(ref(db, `pelacakByNo/${data.noNota}/${noteId}`), {
      username: currentUser, createdAt: data.createdAt, total: data.total
    });
    const keyDate = data.createdAt.slice(0, 10);
    await set(ref(db, `pelacakByDate/${keyDate}/${noteId}`), {
      username: currentUser, noNota: data.noNota, total: data.total
    });

    showNotification(`Nota Tersimpan ✅ (No Nota ${data.noNota})`, 'success');
    clearAllNotaForm(); // Clear form after successful save
    refreshNotaHistory();
    updatePreviewFilename();
  } catch (error) {
    console.error("Error saving note:", error);
    showNotification('Gagal menyimpan nota: ' + error.message, 'error');
  }
}

// ====================================================================
// Kurir Dashboard: Riwayat Tab
// ====================================================================
function refreshNotaHistory() {
  if (!currentUser) return;
  const listEl = el('notaHistory');
  listEl.innerHTML = 'Memuat...';
  const notesRef = ref(db, `nota/${currentUser}`);
  onValue(notesRef, (snap) => {
    const val = snap.val() || {};
    const arr = Object.values(val).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (arr.length === 0) { listEl.innerHTML = '<p class="small">Belum ada nota.</p>'; return; }
    let html = '<div class="list-v">';
    arr.forEach(n => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #eef6ff;padding:12px;border-radius:12px;background:#fff;gap:8px">
        <div style="flex:1">
          <div class="small">${new Date(n.createdAt).toLocaleString('id-ID')}</div>
          <div style="font-weight:800">No: ${n.noNota} • Total: Rp ${(Number(n.total) || 0).toLocaleString('id-ID')}</div>
          <div class="small">${(n.items || []).length} item • Ongkir Rp ${(Number(n.ongkir) || 0).toLocaleString('id-ID')}</div>
        </div>
        <div class="btnbar">
          <button class="btn secondary" onclick="viewNote('${n.id}')">Lihat</button>
          <button class="btn danger" onclick="hapusNote('${n.id}')">Hapus</button>
        </div>
      </div>`;
    });
    html += '</div>';
    listEl.innerHTML = html;
  });
}

window.viewNote = async (id) => {
  const snap = await get(ref(db, `nota/${currentUser}/${id}`));
  if (!snap.exists()) { showNotification('Nota tidak ditemukan', 'error'); return; }
  const n = snap.val();
  currentViewedNota = n; // Store the nota object

  // Display nota as image in overlay
  const notaPreviewNode = document.createElement('div');
  notaPreviewNode.style.whiteSpace = 'pre-wrap';
  notaPreviewNode.style.fontFamily = 'Courier New, Courier, monospace';
  notaPreviewNode.style.background = '#f5faff';
  notaPreviewNode.style.padding = '18px 20px';
  notaPreviewNode.style.borderRadius = '14px';
  notaPreviewNode.style.border = '1.5px solid #c9dbf8';
  notaPreviewNode.style.minHeight = '140px';
  notaPreviewNode.style.color = 'var(--text-primary)';
  notaPreviewNode.style.fontSize = '0.9rem';
  notaPreviewNode.style.boxShadow = 'inset 0 0 8px #dbeeff';
  notaPreviewNode.style.lineHeight = '1.4';
  notaPreviewNode.textContent = n.text || '';

  // Temporarily append to body to render for html2canvas
  document.body.appendChild(notaPreviewNode);

  try {
    const canvas = await html2canvas(notaPreviewNode, { scale: 2, backgroundColor: '#fff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    el('notaPhotoImage').src = imgData;
    el('notaPhotoOverlay').classList.add('show');
  } catch (e) {
    console.error("Error generating image for view:", e);
    showNotification('Gagal menampilkan nota sebagai gambar.', 'error');
  } finally {
    notaPreviewNode.remove(); // Remove the temporary node
  }
};

el('closePhotoOverlay').addEventListener('click', () => {
  el('notaPhotoOverlay').classList.remove('show');
  el('notaPhotoImage').src = ''; // Clear image
  currentViewedNota = null; // Clear viewed nota
});

el('savePhotoBtn').addEventListener('click', async () => {
  if (!currentViewedNota) { showNotification('Tidak ada nota untuk disimpan.', 'warning'); return; }
  try {
    const imgData = el('notaPhotoImage').src;
    const filename = `${currentViewedNota.kurir}_nota_${currentViewedNota.noNota}.jpg`;
    const a = document.createElement('a');
    a.href = imgData;
    a.download = filename;
    a.click();
    showNotification('Foto nota diunduh.', 'success');
  } catch (e) {
    console.error("Error saving photo:", e);
    showNotification('Gagal menyimpan foto nota.', 'error');
  }
});

el('shareTextBtn').addEventListener('click', () => {
  if (!currentViewedNota) { showNotification('Tidak ada nota untuk dibagikan.', 'warning'); return; }
  const textToShare = currentViewedNota.text;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(textToShare)}`;
  window.open(whatsappUrl, '_blank');
  showNotification('Teks nota dibagikan ke WhatsApp.', 'info');
});

window.hapusNote = async (id) => {
  if (!confirm('Hapus nota ini dari Firebase?')) return;
  try {
    const notaRef = ref(db, `nota/${currentUser}/${id}`);
    const notaSnap = await get(notaRef);
    const notaData = notaSnap.val();

    await remove(notaRef);
    if (notaData && notaData.noNota) {
      await remove(ref(db, `pelacakByNo/${notaData.noNota}/${id}`));
      const keyDate = notaData.createdAt.slice(0, 10);
      await remove(ref(db, `pelacakByDate/${keyDate}/${id}`));
    }
    showNotification('Nota terhapus.', 'info');
    // No need to decrease counter, as it's an incremental ID, not a count of existing notes.
    // The next nota number will still be based on the last generated number.
  } catch (error) {
    console.error("Error deleting note:", error);
    showNotification('Gagal menghapus nota: ' + error.message, 'error');
  }
};

// ====================================================================
// Kurir Dashboard: Rekap Tab
// ====================================================================
el('btnLoadRekap').addEventListener('click', async () => {
  if (!currentUser) { showNotification('Login dulu.', 'error'); return; }
  const ym = el('rekapMonth').value;
  if (!ym) { showNotification('Pilih bulan.', 'warning'); return; }
  const [year, month] = ym.split('-').map(Number);

  const snap = await get(ref(db, `nota/${currentUser}`));
  const val = snap.val() || {};
  const arr = Object.values(val);
  const byDate = {};

  arr.forEach(n => {
    const d = new Date(n.createdAt);
    if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
      const key = n.createdAt.slice(0, 10);
      if (!byDate[key]) byDate[key] = { count: 0, ongkir: 0, tambahan: 0, total: 0, ids: [] };
      byDate[key].count++;
      byDate[key].ongkir += Number(n.ongkir) || 0;
      const t = Array.isArray(n.tambahans) ? n.tambahans.reduce((s, x) => s + (Number(x.nominal) || 0), 0) : 0;
      byDate[key].tambahan += t;
      byDate[key].total += (Number(n.ongkir) || 0) + t; // Total di rekap hanya ongkir + tambahan
      byDate[key].ids.push(n.id || n._id || n.key);
    }
  });

  const tbody = el('rekapBody');
  tbody.innerHTML = '';
  let sumNota = 0, sumO = 0, sumT = 0, sumTot = 0;

  Object.keys(byDate).sort().forEach(k => {
    const v = byDate[k];
    const totalHarian = v.ongkir + v.tambahan;

    const tr = document.createElement('tr');
    const tdTanggal = document.createElement('td');
    tdTanggal.innerText = new Date(k).toLocaleDateString('id-ID');
    tdTanggal.style.cursor = 'pointer';
    tdTanggal.title = 'Klik untuk ubah tanggal (fitur admin)'; // Note: this feature is for admin panel
    tr.appendChild(tdTanggal);
    tr.innerHTML += `
      <td>${v.count}</td>
      <td>${v.ongkir.toLocaleString('id-ID')}</td>
      <td>${v.tambahan.toLocaleString('id-ID')}</td>
      <td>${totalHarian.toLocaleString('id-ID')}</td>
    `;
    tbody.appendChild(tr);

    sumNota += v.count;
    sumO += v.ongkir;
    sumT += v.tambahan;
    sumTot += totalHarian;
  });

  el('sumNota').innerText = sumNota;
  el('sumOngkir').innerText = sumO.toLocaleString('id-ID');
  el('sumTambahan').innerText = sumT.toLocaleString('id-ID');
  el('sumTotal').innerText = sumTot.toLocaleString('id-ID');
});

// ====================================================================
// Kurir Dashboard: Pelacak Tab
// ====================================================================
let allPelacakData = {}; // Cache for all pelacak data

async function loadPelacakData() {
  const snapNo = await get(ref(db, 'pelacakByNo'));
  const snapDate = await get(ref(db, 'pelacakByDate'));
  const snapKurir = await get(ref(db, 'kurir'));

  const pelacakByNo = snapNo.exists() ? snapNo.val() : {};
  const pelacakByDate = snapDate.exists() ? snapDate.val() : {};
  const kurirList = snapKurir.exists() ? snapKurir.val() : {};

  allPelacakData = { pelacakByNo, pelacakByDate, kurirList };

  // Populate datalists
  const listTrackNoNota = el('listTrackNoNota');
  listTrackNoNota.innerHTML = '';
  Object.keys(pelacakByNo).forEach(no => {
    const opt = document.createElement('option');
    opt.value = no;
    listTrackNoNota.appendChild(opt);
  });

  const listTrackKurir = el('listTrackKurir');
  listTrackKurir.innerHTML = '';
  Object.keys(kurirList).forEach(kurir => {
    const opt = document.createElement('option');
    opt.value = kurir;
    listTrackKurir.appendChild(opt);
  });
}

el('btnCariNota').addEventListener('click', async () => {
  const no = (el('trackNoNota').value || '').trim();
  const date = (el('trackDate').value || '').trim();
  const kurir = (el('trackKurir').value || '').trim();
  const hasilEl = el('pelacakHasil');
  hasilEl.innerHTML = 'Mencari...';

  let html = '';
  let results = [];

  if (no) {
    const s = allPelacakData.pelacakByNo[no];
    if (s) {
      Object.entries(s).forEach(([id, v]) => {
        results.push({ id, ...v, type: 'noNota' });
      });
    }
  } else if (date) {
    const s2 = allPelacakData.pelacakByDate[date];
    if (s2) {
      Object.entries(s2).forEach(([id, v]) => {
        results.push({ id, ...v, type: 'date' });
      });
    }
  } else if (kurir) {
    // If searching by kurir, we need to iterate through all notes for that kurir
    const snap = await get(ref(db, `nota/${kurir}`));
    const notes = snap.exists() ? snap.val() : {};
    Object.values(notes).forEach(n => {
      results.push({ id: n.id, username: n.kurir, createdAt: n.createdAt, total: n.total, noNota: n.noNota, type: 'kurir' });
    });
  }

  // Filter results further if multiple criteria are provided (though UI only allows one main search)
  // For simplicity, if multiple inputs are filled, prioritize noNota > date > kurir
  if (no) {
    results = results.filter(r => r.noNota === no);
  } else if (date) {
    results = results.filter(r => (r.createdAt || '').startsWith(date));
  } else if (kurir) {
    results = results.filter(r => r.username === kurir);
  }

  if (results.length > 0) {
    results.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    html += `<h4>Hasil Pencarian</h4>`;
    results.forEach(n => {
      html += `<div class="card" style="padding:10px">
        <div><b>${new Date(n.createdAt).toLocaleString('id-ID')}</b> — Kurir: ${n.username} — No: ${n.noNota || '-'}</div>
        <div>Total: Rp ${(Number(n.total) || 0).toLocaleString('id-ID')}</div>
      </div>`;
    });
  } else {
    html += `<p class="small">Tidak ada catatan ditemukan untuk kriteria ini.</p>`;
  }

  if (!no && !date && !kurir) { html = '<p class="small">Isi No Nota, Tanggal, atau Nama Kurir untuk mencari.</p>'; }
  hasilEl.innerHTML = html;
});

el('btnCariReset').addEventListener('click', () => {
  el('trackNoNota').value = '';
  el('trackDate').value = '';
  el('trackKurir').value = '';
  el('pelacakHasil').innerHTML = '';
  showNotification('Filter pelacak direset.', 'info');
});

// ====================================================================
// Kurir Dashboard: Export / Share Image (Web)
// ====================================================================
function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise(res => canvas.toBlob(b => res(b), type, quality));
}

async function getNotaBlob() {
  const node = el('notaPreview');
  if (!node.innerText.trim()) { buildNotaObject(); }
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#fff' });
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  return blob;
}

async function savePreviewAsImage() {
  try {
    const nota = buildNotaObject();
    const blob = await getNotaBlob();
    const filename = `${currentUser || 'User'}_nota_${nota.noNota}.jpg`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Foto nota diunduh. Cek folder Downloads/Galeri anda.', 'success');
  } catch (e) {
    console.error(e);
    showNotification('Gagal simpan foto nota', 'error');
  }
}

async function sharePreviewImage() {
  try {
    const nota = buildNotaObject();
    const blob = await getNotaBlob();
    const filename = `${currentUser || 'User'}_nota_${nota.noNota}.jpg`;
    const file = new File([blob], filename, { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Nota Sahabatku Delivery',
        text: `No Nota ${nota.noNota} — Kurir ${currentUser}`
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Browser tidak support share langsung. File sudah diunduh, silakan bagikan via WhatsApp dari Galeri/Downloads.', 'info');
    }
  } catch (e) {
    console.error(e);
    showNotification('Gagal share nota.', 'error');
  }
}

// ====================================================================
// Kurir Dashboard: Cek Ongkir Module
// ====================================================================
const ongkirData = [
  { lokasi: "JATIBARANG", ongkir: 6000 }, { lokasi: "JATIBARANG BARU", ongkir: 6000 }, { lokasi: "GAJAH ASRI", ongkir: 7000 }, { lokasi: "PILANGSARI", ongkir: 7000 }, { lokasi: "BINTARA", ongkir: 7000 }, { lokasi: "GG PROYEK", ongkir: 8000 }, { lokasi: "JL PANTURA", ongkir: 9000 }, { lokasi: "BALDES PILANGSARI", ongkir: 10000 }, { lokasi: "POM BENSIN PANTURA", ongkir: 11000 }, { lokasi: "COMO", ongkir: 12000 }, { lokasi: "SUKALILA", ongkir: 13000 }, { lokasi: "SUKAWERA", ongkir: 13000 }, { lokasi: "KLIWED", ongkir: 14000 }, { lokasi: "JL. KERTASMAYA (TELADAN)", ongkir: 16000 }, { lokasi: "KERTASMAYA", ongkir: 18000 }, { lokasi: "TULUNGAGUNG", ongkir: 20000 }, { lokasi: "BINARIA", ongkir: 22000 }, { lokasi: "JL RAYA KERTASMAYA", ongkir: 25000 }, { lokasi: "CANDANGPINGGANG", ongkir: 32000 }, { lokasi: "TERSANA", ongkir: 26000 }, { lokasi: "JENGKOK", ongkir: 30000 }, { lokasi: "JAMBE", ongkir: 35000 }, { lokasi: "BTN SAPHIRE", ongkir: 7000 }, { lokasi: "KEBULEN", ongkir: 8000 }, { lokasi: "BANTARAGUNG", ongkir: 8000 }, { lokasi: "PAWIDEAN", ongkir: 9000 }, { lokasi: "JATISAWIT", ongkir: 10000 }, { lokasi: "JATISAWIT LOR", ongkir: 12000 }, { lokasi: "POM BENSIN JATISAWIT", ongkir: 13000 }, { lokasi: "KRASAK", ongkir: 14000 }, { lokasi: "KALIMATI", ongkir: 16000 }, { lokasi: "LOBENER", ongkir: 18000 }, { lokasi: "TELUKAGUNG", ongkir: 20000 }, { lokasi: "PLUMBON", ongkir: 25000 }, { lokasi: "DUKUH", ongkir: 28000 }, { lokasi: "PEKANDANGAN JAYA", ongkir: 32000 }, { lokasi: "PEKANDANGAN", ongkir: 35000 }, { lokasi: "SINDANG", ongkir: 40000 }, { lokasi: "INDRAMAYU", ongkir: 40000 }, { lokasi: "INDRAMAYU KOTA", ongkir: 45000 }, { lokasi: "KARANGSONG", ongkir: 50000 }, { lokasi: "WIDASARI", ongkir: 7000 }, { lokasi: "KONGSI", ongkir: 8000 }, { lokasi: "UJUNGARIS", ongkir: 9000 }, { lokasi: "UJUNG JAYA", ongkir: 10000 }, { lokasi: "RS MITRA", ongkir: 10000 }, { lokasi: "PONDOK SHIDIQ", ongkir: 11000 }, { lokasi: "UJUNG PENDOK", ongkir: 12000 }, { lokasi: "KESESIH", ongkir: 12000 }, { lokasi: "LEUWIGEDE", ongkir: 13000 }, { lokasi: "SLAUR", ongkir: 14000 }, { lokasi: "LEGOK SLAUR", ongkir: 16000 }, { lokasi: "JL LEGOK", ongkir: 18000 }, { lokasi: "BOJONG SLAWI", ongkir: 17000 }, { lokasi: "POLINDRA", ongkir: 18000 }, { lokasi: "LOHBENER", ongkir: 25000 }, { lokasi: "PAMAYAHAN", ongkir: 28000 }, { lokasi: "BANGKIR", ongkir: 32000 }, { lokasi: "RAMBATAN WETAN", ongkir: 33000 }, { lokasi: "PANYINDANGAN", ongkir: 35000 }, { lokasi: "TERUSAN SINDANG", ongkir: 40000 }, { lokasi: "CELENG", ongkir: 22000 }, { lokasi: "LARANGAN", ongkir: 26000 }, { lokasi: "LANGUT", ongkir: 28000 }, { lokasi: "KASMARAN", ongkir: 20000 }, { lokasi: "JL WARU - KASMARAN", ongkir: 24000 }, { lokasi: "WARU", ongkir: 28000 }, { lokasi: "JL LARANGAN - LELEA", ongkir: 30000 }, { lokasi: "LELEA", ongkir: 31000 }, { lokasi: "PASAR LELEA", ongkir: 31000 }, { lokasi: "TAMANSARI LELEA", ongkir: 33000 }, { lokasi: "PENGAUBAN", ongkir: 35000 }, { lokasi: "NUNUK", ongkir: 22000 }, { lokasi: "TUGU LELEA", ongkir: 37000 }, { lokasi: "JAMBAK", ongkir: 42000 }, { lokasi: "CIKEDUNG", ongkir: 45000 }, { lokasi: "TERISI", ongkir: 50000 }, { lokasi: "POLSEK/BTN LAMA", ongkir: 7000 }, { lokasi: "BTN LAMA", ongkir: 7000 }, { lokasi: "KECAMATAN", ongkir: 7000 }, { lokasi: "BULAK", ongkir: 8000 }, { lokasi: "SLEMAN", ongkir: 9000 }, { lokasi: "TAMBI", ongkir: 10000 }, { lokasi: "POM PERUM TAMBI", ongkir: 11000 }, { lokasi: "TOANG TAMBI", ongkir: 13000 }, { lokasi: "BLOK KASMARAN", ongkir: 16000 }, { lokasi: "JL MANGIR", ongkir: 20000 }, { lokasi: "MANGIR", ongkir: 23000 }, { lokasi: "POLSEK SLIYEG", ongkir: 20000 }, { lokasi: "SUDIKAMPIRAN", ongkir: 22000 }, { lokasi: "JAYALAKSANA", ongkir: 24000 }, { lokasi: "SEGERAN", ongkir: 34000 }, { lokasi: "MUNDU", ongkir: 36000 }, { lokasi: "JL RAYA KARANGAMPEL", ongkir: 40000 }, { lokasi: "KARANGAMPEL", ongkir: 45000 }, { lokasi: "MAJASARI", ongkir: 14000 }, { lokasi: "MAJASIH", ongkir: 15000 }, { lokasi: "JL MAJASIH - SLIYEG", ongkir: 18000 }, { lokasi: "SLIYEG", ongkir: 20000 }, { lokasi: "SLIYEG LOR", ongkir: 22000 }, { lokasi: "GADINGAN", ongkir: 24000 }, { lokasi: "TUGU SLIYEG", ongkir: 25000 }, { lokasi: "SUDIMAMPIR", ongkir: 30000 }, { lokasi: "CANGKINGAN", ongkir: 34000 }, { lokasi: "KEDOKANBUNDER", ongkir: 40000 }, { lokasi: "JUNTINYUAT", ongkir: 52000 }, { lokasi: "LIMBANGAN", ongkir: 56000 }, { lokasi: "BALONGAN", ongkir: 60000 }, { lokasi: "BABADAN", ongkir: 24000 }, { lokasi: "TENAJAR", ongkir: 26000 }, { lokasi: "BANGKALOA ILIR", ongkir: 8000 }, { lokasi: "GINCU", ongkir: 9000 }, { lokasi: "BANGKRONG", ongkir: 10000 }, { lokasi: "PESONA ASRI/SYIFA", ongkir: 10000 }, { lokasi: "CURUG TEGALGIRANG", ongkir: 12000 }, { lokasi: "TEGALGIRANG", ongkir: 13000 }, { lokasi: "KARANGGETAS", ongkir: 14000 }, { lokasi: "WANASARI", ongkir: 15000 }, { lokasi: "CANGKRUNG", ongkir: 16000 }, { lokasi: "TOANG LAJER", ongkir: 17000 }, { lokasi: "BOJONG MELATI", ongkir: 18000 }, { lokasi: "JL BOJONG MELATI", ongkir: 22000 }, { lokasi: "JL BANGODUA - SUKADANA", ongkir: 25000 }, { lokasi: "LAJER", ongkir: 18000 }, { lokasi: "JL LAJER - TUKDANA", ongkir: 20000 }, { lokasi: "TUKDANA", ongkir: 22000 }, { lokasi: "KARANGKERTA", ongkir: 25000 }, { lokasi: "KERTICALA", ongkir: 26000 }, { lokasi: "SUKADANA", ongkir: 25000 }, { lokasi: "SUKAPERNA", ongkir: 28000 }, { lokasi: "CANGKO", ongkir: 30000 }, { lokasi: "RANCAJAWAT", ongkir: 32000 }, { lokasi: "GADEL", ongkir: 34000 }, { lokasi: "BODAS", ongkir: 36000 }, { lokasi: "PERBATESAN MAJALENGKA", ongkir: 40000 }, { lokasi: "PERTIGAAN WIDASARI-CBG", ongkir: 7000 }, { lokasi: "KRANYAR CIBOGOR", ongkir: 8000 }, { lokasi: "TERUSAN CIBOGOR", ongkir: 9000 }, { lokasi: "CIBOGOR", ongkir: 10000 }, { lokasi: "BALDES WIDASARI", ongkir: 12000 }, { lokasi: "CIDENG", ongkir: 13000 }, { lokasi: "JIMPRET", ongkir: 16000 }, { lokasi: "JEMBATAN MAJU", ongkir: 18000 }, { lokasi: "KALENSARI", ongkir: 18000 }, { lokasi: "MALANGSARI", ongkir: 20000 }
];

function findOngkirByName(input) {
  if (!input) return null;
  const q = input.trim().toLowerCase();
  if (!q) return null;
  let exact = ongkirData.find(x => x.lokasi.toLowerCase() === q);
  if (exact) return exact;
  let starts = ongkirData.find(x => x.lokasi.toLowerCase().startsWith(q));
  if (starts) return starts;
  let inc = ongkirData.find(x => x.lokasi.toLowerCase().includes(q));
  return inc || null;
}

function attachAutocomplete(inputEl, dropdownEl, dataList) {
  let items = [];
  let active = -1;

  function highlight(txt, query) {
    const i = txt.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return txt;
    return txt.substring(0, i) + "<mark>" + txt.substring(i, i + query.length) + "</mark>" + txt.substring(i + query.length);
  }

  function render(list, query) {
    dropdownEl.innerHTML = "";
    list.slice(0, 12).forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 's-item';
      div.innerHTML = `
        <div class="s-icon"><i class="fa-solid fa-location-dot"></i></div>
        <div class="s-text">
          <div class="s-name">${highlight(it.lokasi, query)}</div>
          <div class="s-price">${money(it.ongkir)}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        inputEl.value = it.lokasi;
        hide();
        hitungOngkir(); // Recalculate after selection
      });
      dropdownEl.appendChild(div);
    });
    dropdownEl.style.display = list.length ? 'block' : 'none';
    active = -1;
  }

  function hide() { dropdownEl.style.display = 'none'; }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    if (q.length < 1) { hide(); return; }
    const list = dataList
      .filter(x => x.lokasi.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.lokasi.localeCompare(b.lokasi));
    items = list;
    render(items, q);
  });

  inputEl.addEventListener('keydown', (e) => {
    const visible = dropdownEl.style.display === 'block';
    if (!visible) return;
    const count = dropdownEl.children.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % count; updateActive(); } else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + count) % count; updateActive(); } else if (e.key === 'Enter') {
      if (active >= 0 && dropdownEl.children[active]) {
        e.preventDefault();
        dropdownEl.children[active].click();
      }
    } else if (e.key === 'Escape') { hide(); }
  });

  function updateActive() {
    [...dropdownEl.children].forEach((el, i) => {
      el.classList.toggle('active', i === active);
      if (i === active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  document.addEventListener('click', (e) => {
    if (!dropdownEl.contains(e.target) && e.target !== inputEl) { hide(); }
  });

  return { hide };
}

const asalInput = el('asalInput');
const tujuanInput = el('tujuanInput');
const asalSuggest = el('asalSuggest');
const tujuanSuggest = el('tujuanSuggest');
const normalHarga = el('normalHarga');
const normalKet = el('normalKeterangan');
const ruteHarga = el('ruteHarga');
const ruteKet = el('ruteKeterangan');
const ruteFormula = el('ruteFormula');
const ongkirResults = el('ongkirResults');

const { hide: hideAsal } = attachAutocomplete(asalInput, asalSuggest, ongkirData);
const { hide: hideTujuan } = attachAutocomplete(tujuanInput, tujuanSuggest, ongkirData);

el('clearAsal').addEventListener('click', () => { asalInput.value = ''; hideAsal(); hitungOngkir(); });
el('clearTujuan').addEventListener('click', () => { tujuanInput.value = ''; hideTujuan(); hitungOngkir(); });
el('bersihkanBtn').addEventListener('click', () => {
  asalInput.value = '';
  tujuanInput.value = '';
  hideAsal();
  hideTujuan();
  ongkirResults.style.display = 'none';
  showNotification('Form ongkir dibersihkan.', 'info');
});
el('cekBtn').addEventListener('click', hitungOngkir);
[asalInput, tujuanInput].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); hitungOngkir(); }
  });
});

function hitungOngkir() {
  const asalText = asalInput.value.trim();
  const tujuanText = tujuanInput.value.trim();

  const asalObj = asalText ? findOngkirByName(asalText) : null;
  const tujuanObj = tujuanText ? findOngkirByName(tujuanText) : null;

  if (!asalObj && !tujuanObj) {
    ongkirResults.style.display = 'none';
    showNotification('Masukkan minimal salah satu lokasi (Asal atau Tujuan) sesuai daftar.', 'warning');
    return;
  }
  if (asalText && !asalObj) { showNotification('Lokasi Asal tidak ditemukan di daftar.', 'error'); return; }
  if (tujuanText && !tujuanObj) { showNotification('Lokasi Tujuan tidak ditemukan di daftar.', 'error'); return; }

  let normalCalcObj = tujuanObj || asalObj;
  normalHarga.textContent = money(normalCalcObj.ongkir);
  normalKet.textContent = `Lokasi: ${normalCalcObj.lokasi}`;

  if (asalObj && tujuanObj) {
    const total = Math.max(0, (asalObj.ongkir + tujuanObj.ongkir) - 6000);
    ruteHarga.textContent = money(total);
    ruteKet.textContent = `Asal: ${asalObj.lokasi} (${money(asalObj.ongkir)}) • Tujuan: ${tujuanObj.lokasi} (${money(tujuanObj.ongkir)})`;
    ruteFormula.textContent = `${money(asalObj.ongkir)} + ${money(tujuanObj.ongkir)} − ${money(6000)} = ${money(total)}`;
    ruteFormula.style.display = 'inline-block';
  } else {
    ruteHarga.textContent = '—';
    ruteKet.textContent = 'Isi Asal & Tujuan untuk menghitung ongkir rute.';
    ruteFormula.style.display = 'none';
  }
  ongkirResults.style.display = 'grid';
}

// ====================================================================
// Kurir Dashboard: Absensi Kurir Module
// ====================================================================
const MASTER_DOC = collection(firestoreDb, 'appdata');
const JADWAL_COLLECTION = collection(firestoreDb, 'jadwal_off');
const PENGAJUAN_COLLECTION = collection(firestoreDb, 'pengajuan_off');

let kurirListAbsensi = ["Sonia", "Pitri", "Hambali", "Alfan", "Gilang", "Hafiz", "Kardi", "Robi", "Ulum", "Eblek", "Nandar"]; // Fallback
let jadwalDataAbsensi = {};
let isAbsensiAdmin = false; // Status admin absensi (will be false for kurir)
let unsubJadwalAbsensi = null;
let pengajuanCacheAbsensi = [];
const idDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const absensiMonthPick = el('monthPick');
absensiMonthPick.value = new Date().toISOString().slice(0, 7);

// Absensi UI elements (admin elements will be hidden by CSS/JS)
const absensiAdminBar = el('absensiAdminBar');
const btnAbsensiTab = el('btn-absensi-tab');
const btnApprovalTab = el('btn-approval-tab');

// Absensi Pengajuan Form
const pengajuanTanggal = el('pengajuanTanggal');
const penggantiKurir = el('penggantiKurir');
const tanggalTukar = el('tanggalTukar');
const btnAjukan = el('btnAjukan');

// Absensi Tabs
qsa('#absensiTopbar .btn[data-tab]').forEach(b => {
  b.onclick = () => {
    qsa('#absensiKurirModule .tab').forEach(t => t.classList.remove('active'));
    qsa('#absensiTopbar .btn[data-tab]').forEach(bb => bb.classList.remove('active'));
    el(b.dataset.tab).classList.add('active');
    b.classList.add('active');
    if (b.dataset.tab === 'tab-jadwal') renderJadwalAbsensi(absensiMonthPick.value);
    if (b.dataset.tab === 'tab-absensi') renderAbsensi(absensiMonthPick.value);
    if (b.dataset.tab === 'tab-rekap') renderRekapAbsensi(absensiMonthPick.value);
    if (b.dataset.tab === 'tab-approval') renderApprovalAbsensi();
  };
});

// For kurir, admin UI elements should always be hidden
absensiAdminBar.style.display = 'none';
btnAbsensiTab.style.display = 'none';
btnApprovalTab.style.display = 'none';

// Absensi Data & Renderers
function generateFairOffForMonth(ym) {
  const [y, m] = ym.split('-').map(Number), year = y, month = m - 1;
  const days = new Date(year, month + 1, 0).getDate();
  const pool = kurirListAbsensi.slice();
  if (pool.length === 0) { jadwalDataAbsensi[ym] = []; return; }
  const counts = Object.fromEntries(pool.map(k => [k, 0]));
  const arr = [];
  for (let d = 1; d <= days; d++) {
    const minV = Math.min(...Object.values(counts));
    const cands = pool.filter(k => counts[k] === minV);
    const pick = cands[Math.floor(Math.random() * cands.length)];
    counts[pick] += 1;
    const dt = new Date(year, month, d);
    arr.push({ tanggal: `${year}-${leftPad(month + 1, 2)}-${leftPad(d, 2)}`, off: pick, pengganti: '' });
  }
  jadwalDataAbsensi[ym] = arr;
}

function renderJadwalAbsensi(ym) {
  const tbody = document.querySelector('#tableJadwal tbody');
  tbody.innerHTML = '';
  if (!jadwalDataAbsensi[ym]) return;

  jadwalDataAbsensi[ym].forEach(it => {
    const d = new Date(it.tanggal);
    const hari = idDays[d.getDay()];
    const tr = document.createElement('tr');

    const tdTanggal = document.createElement('td'); tdTanggal.textContent = it.tanggal;
    const tdHari = document.createElement('td'); tdHari.textContent = hari;

    const tdOff = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = it.off ? 'badge off' : 'badge on';
    badge.textContent = it.off || 'Semua On';
    badge.style.cursor = 'pointer';
    badge.title = 'Klik untuk mengajukan tukar off';
    badge.onclick = () => {
      pengajuanTanggal.value = it.tanggal;
      setupFormPengajuanAbsensi();
      showNotification('Tanggal dipilih. Silakan lengkapi form pengajuan.', 'info');
    };
    tdOff.appendChild(badge);

    const tdPeng = document.createElement('td');
    tdPeng.textContent = it.pengganti || '—';

    tr.append(tdTanggal, tdHari, tdOff, tdPeng);
    tbody.appendChild(tr);
  });
}

function renderAbsensi(ym) {
  const tbody = document.querySelector('#tableAbsensi tbody');
  tbody.innerHTML = '';
  if (!jadwalDataAbsensi[ym]) return;
  jadwalDataAbsensi[ym].forEach(it => {
    kurirListAbsensi.forEach(async k => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.tanggal}</td><td>${k}</td>`;
      let status = (k === it.off) ? 'Off' : 'On';
      const tdS = document.createElement('td');
      const span = document.createElement('span');
      span.className = 'badge ' + (status === 'On' ? 'on' : 'off');
      span.textContent = status;
      tdS.appendChild(span);
      tr.appendChild(tdS);
      tbody.appendChild(tr);
    });
  });
}

function renderRekapAbsensi(ym) {
  const tbody = document.querySelector('#tableRekap tbody');
  tbody.innerHTML = '';
  if (!jadwalDataAbsensi[ym]) return;
  const arr = jadwalDataAbsensi[ym];
  const sum = Object.fromEntries(kurirListAbsensi.map(k => [k, { on: 0, off: 0 }]));
  arr.forEach(it => { kurirListAbsensi.forEach(k => { if (k === it.off) sum[k].off++; else sum[k].on++; }); });
  kurirListAbsensi.forEach(k => {
    const { on, off } = sum[k];
    const total = on + off || 1;
    const skor = Math.round((on / total) * 100);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td>${on}</td><td>${off}</td><td>${skor}%</td>`;
    tbody.appendChild(tr);
  });
}

function renderApprovalAbsensi() {
  const tbody = document.querySelector('#tableApproval tbody');
  tbody.innerHTML = '';
  // Kurir should only see their own pending requests
  const filteredRequests = pengajuanCacheAbsensi.filter(item => item.asal === currentUser);

  filteredRequests.forEach(item => {
    const tr = document.createElement('tr');
    const createdAtDate = item.created ? new Date(item.created.toDate ? item.created.toDate() : item.created).toLocaleString('id-ID') : '-';
    tr.innerHTML = `<td>${createdAtDate}</td><td>${item.asal}</td><td>${item.pengganti}</td><td>${item.status}</td>`;
    tr.appendChild(document.createElement('td')); // Empty Aksi column for kurir
    tbody.appendChild(tr);
  });
}

function absensiQuickSync() {
  const ym = absensiMonthPick.value;
  renderJadwalAbsensi(ym);
  renderAbsensi(ym);
  renderRekapAbsensi(ym);
  renderApprovalAbsensi();
}

function setupFormPengajuanAbsensi() {
  pengajuanTanggal.innerHTML = '';
  penggantiKurir.innerHTML = '';
  tanggalTukar.innerHTML = '';
  const ym = absensiMonthPick.value;

  if (!jadwalDataAbsensi[ym]) return;

  jadwalDataAbsensi[ym].forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.tanggal;
    opt.textContent = it.tanggal + (it.off ? ` (Off: ${it.off})` : ' (Semua On)');
    pengajuanTanggal.appendChild(opt);
  });

  kurirListAbsensi.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    penggantiKurir.appendChild(opt);
  });

  function refreshTanggalTukar() {
    const kurir = penggantiKurir.value;
    tanggalTukar.innerHTML = '';
    jadwalDataAbsensi[ym].forEach(it => {
      if (it.off === kurir) {
        const opt = document.createElement('option');
        opt.value = it.tanggal;
        opt.textContent = it.tanggal;
        tanggalTukar.appendChild(opt);
      }
    });
    if (!tanggalTukar.children.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Kurir ini tidak punya OFF di bulan ini)';
      tanggalTukar.appendChild(opt);
    }
  }

  pengajuanTanggal.onchange = refreshTanggalTukar;
  penggantiKurir.onchange = refreshTanggalTukar;
  refreshTanggalTukar();
}

// Absensi Firestore I/O (Kurir only needs to read and add pengajuan)
async function saveFirestoreJadwalAbsensi(ym) {
  // Kurir cannot save jadwal, only admin
  showNotification('Anda tidak memiliki izin untuk menyimpan jadwal.', 'error');
}

async function saveKurirListAbsensi() {
  // Kurir cannot save kurir list, only admin
  showNotification('Anda tidak memiliki izin untuk menyimpan daftar kurir.', 'error');
}

// Absensi Realtime Listeners
function listenMasterKurirAbsensi() {
  onSnapshot(doc(MASTER_DOC, 'master'), docSnap => {
    if (docSnap.exists()) {
      kurirListAbsensi = Array.isArray(docSnap.data().kurirList) ? docSnap.data().kurirList : [];
      absensiQuickSync();
      setupFormPengajuanAbsensi();
    } else {
      absensiQuickSync();
      setupFormPengajuanAbsensi();
    }
  });
}

function listenJadwalAbsensi(ym) {
  if (unsubJadwalAbsensi) { unsubJadwalAbsensi(); unsubJadwalAbsensi = null; }
  unsubJadwalAbsensi = onSnapshot(doc(JADWAL_COLLECTION, ym), async docSnap => {
    if (docSnap.exists()) {
      jadwalDataAbsensi[ym] = docSnap.data().data || [];
      absensiQuickSync();
      setupFormPengajuanAbsensi();
    } else {
      // If no jadwal exists, kurir cannot generate it. Admin must.
      showNotification('Jadwal OFF belum tersedia untuk bulan ini. Harap hubungi admin.', 'warning');
      jadwalDataAbsensi[ym] = []; // Clear existing data
      absensiQuickSync();
    }
  });
}

function listenPengajuanAbsensi() {
  onSnapshot(query(PENGAJUAN_COLLECTION, orderBy('created', 'desc')), snap => {
    pengajuanCacheAbsensi = [];
    snap.forEach(doc => {
      const d = doc.data();
      pengajuanCacheAbsensi.push({ id: doc.id, ...d });
    });
    renderApprovalAbsensi();
  });
}

// Absensi Pengajuan
btnAjukan.addEventListener('click', async () => {
  const tanggal = pengajuanTanggal.value;
  const pengganti = penggantiKurir.value;
  const tukarTanggal = tanggalTukar.value;
  if (!tanggal || !pengganti || !tukarTanggal) { showNotification('Pilih tanggal, kurir pengganti & tanggal tukar.', 'warning'); return; }

  const ym = tanggal.slice(0, 7);
  const row = (jadwalDataAbsensi[ym] || []).find(it => it.tanggal === tanggal);
  if (!row || row.off !== currentUser) { showNotification('Anda tidak sedang OFF pada tanggal ini.', 'warning'); return; }
  if (row.off === pengganti) { showNotification('Tidak bisa tukar dengan diri sendiri.', 'warning'); return; }

  try {
    await addDoc(PENGAJUAN_COLLECTION, { // Use addDoc for new document with auto-generated ID
      tanggal,
      tukarTanggal,
      asal: currentUser,
      pengganti,
      status: 'Pending',
      created: serverTimestamp(), // Use serverTimestamp for accurate time
      uid: auth.currentUser ? auth.currentUser.uid : null,
      email: auth.currentUser ? auth.currentUser.email : null
    });
    showNotification('Pengajuan terkirim. Tunggu approval admin.', 'info');
  } catch (e) { showNotification('Gagal mengirim pengajuan: ' + e.message, 'error'); }
});

// Absensi Init
absensiMonthPick.addEventListener('change', () => listenJadwalAbsensi(absensiMonthPick.value));
listenMasterKurirAbsensi();
listenPengajuanAbsensi();
listenJadwalAbsensi(absensiMonthPick.value); // Initial load for absensi
