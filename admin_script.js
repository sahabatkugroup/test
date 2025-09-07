// admin_script.js
import { db, firestoreDb, auth, ADMIN_UID, ref, set, get, onValue, update, remove, collection, doc, onSnapshot, query, orderBy, serverTimestamp, addDoc, signOut } from './firebase_config.js';
import { el, qs, qsa, money, leftPad, showNotification, setActiveTab, downloadCSV } from './common_script.js';

// Redirect if not logged in as admin
if (localStorage.getItem('adminLoggedIn') !== 'true') {
  window.location.href = 'admin_login.html';
}

// Admin Logout
el('adminLogoutBtn').addEventListener('click', doAdminLogout);
async function doAdminLogout() {
  try {
    await signOut(auth); 
    localStorage.removeItem('adminLoggedIn'); // Clear admin login status
    window.location.href = 'index.html';
    showNotification('Admin telah logout.', 'info');
  } catch (error) {
    console.error("Admin logout error:", error);
    showNotification('Gagal logout Admin!', 'error');
  }
}

// Admin Tabs
qsa('#adminDashboard .tabs .btn').forEach(b => b.addEventListener('click', () => {
  setActiveTab('adminDashboard .tabs', b.dataset.tab); // Pass the correct container ID
  // Trigger specific refresh for tabs
  if (b.dataset.tab === 'tabNotaAdmin') loadAllAdminData(); // Refresh admin nota
  if (b.dataset.tab === 'tabRekapAdmin') renderRekapAdmin(); // Refresh admin rekap
  if (b.dataset.tab === 'tabKurirAdmin') fillKurirManageAdmin(); // Refresh admin kurir
  if (b.dataset.tab === 'tabOngkirAdmin') setupOngkirRealtimeAdmin(); // Refresh admin ongkir
}));

let allDataAdmin = {}; // {kurir:{id:nota}}
let kurirSetAdmin = new Set();
let kurirDetailsAdmin = {}; // {username: {password, enabled}}
let ongkirDataAdminRealtime = {}; // Data ongkir dari Realtime DB
let editingNotaAdmin = null; // {user,id,createdAt}

// Load all data on page load
window.addEventListener('load', loadAllAdminData);

async function loadAllAdminData() {
  await Promise.all([loadNotaAdmin(), loadKurirAdmin(), setupOngkirRealtimeAdmin()]);
  buildNoNotaDatalistAdmin();
  renderListAdmin(allDataAdmin);
  fillRekapKurirAdmin();
}

// ====================================================================
// Admin Dashboard: Loaders
// ====================================================================
async function loadNotaAdmin() {
  const snap = await get(ref(db, 'nota'));
  allDataAdmin = snap.exists() ? snap.val() : {};
  Object.keys(allDataAdmin).forEach(k => kurirSetAdmin.add(k));
  fillKurirFilterAdmin();
}

async function loadKurirAdmin() {
  const snap = await get(ref(db, 'kurir'));
  if (snap.exists()) {
    const obj = snap.val();
    kurirDetailsAdmin = obj; // Store full details
    Object.keys(obj).forEach(k => kurirSetAdmin.add(k));
  }
  fillKurirFilterAdmin();
  fillKurirManageAdmin();
  fillKurirDatalistAdmin();
  renderKurirTableAdmin(); // Render the table
}

// ====================================================================
// Admin Dashboard: Kelola Nota
// ====================================================================
function fillKurirFilterAdmin() {
  const sel = el('filterKurir');
  sel.innerHTML = '<option value="">— Semua Kurir —</option>' + [...kurirSetAdmin].sort().map(k => `<option>${k}</option>`).join('');
}

function fillKurirManageAdmin() {
  const selectEl = el('kurirManage');
  selectEl.innerHTML = [...kurirSetAdmin].sort().map(k => `<option>${k}</option>`).join('');
}

function fillKurirDatalistAdmin() {
  el('listKurir').innerHTML = [...kurirSetAdmin].sort().map(k => `<option value="${k}">`).join('');
}

function buildNoNotaDatalistAdmin() {
  const list = el('listNoNota');
  list.innerHTML = '';
  const uniqueNoNotas = new Set();
  Object.values(allDataAdmin).forEach(notes => {
    Object.values(notes).forEach(n => {
      if (n.noNota) { uniqueNoNotas.add(n.noNota); }
    });
  });
  Array.from(uniqueNoNotas).sort().forEach(no => {
    const opt = document.createElement('option');
    opt.value = no;
    list.appendChild(opt);
  });
}

function withinFiltersAdmin(n) {
  const fK = el('filterKurir').value;
  const fD = el('filterTanggal').value; // YYYY-MM-DD
  const fM = el('filterBulan').value; // YYYY-MM
  const fY = el('filterTahun').value; // YYYY

  if (fK && n.kurir !== fK) return false;
  if (fD && (n.createdAt || '').slice(0, 10) !== fD) return false;
  if (fM && (n.createdAt || '').slice(0, 7) !== fM) return false;
  if (fY && (n.createdAt || '').slice(0, 4) !== fY) return false;
  return true;
}

window.applyFilter = () => {
  const cariNota = el('filterCariNota').value.trim();
  let filteredData = {};

  if (cariNota) {
    Object.entries(allDataAdmin).forEach(([k, notes]) => {
      Object.values(notes).forEach(n => {
        if ((n.noNota || '') === cariNota) {
          if (!filteredData[k]) filteredData[k] = {};
          filteredData[k][n.id] = n;
        }
      });
    });
  } else {
    Object.entries(allDataAdmin).forEach(([k, notes]) => {
      Object.values(notes).forEach(n => {
        if (withinFiltersAdmin(n)) {
          if (!filteredData[k]) filteredData[k] = {};
          filteredData[k][n.id] = n;
        }
      });
    });
  }
  renderListAdmin(filteredData);
  showNotification('Filter diterapkan.', 'info');
};

window.clearFilter = () => {
  el('filterKurir').value = '';
  el('filterTanggal').value = '';
  el('filterBulan').value = '';
  el('filterTahun').value = '';
  el('filterCariNota').value = '';
  renderListAdmin(allDataAdmin);
  showNotification('Filter direset.', 'info');
};

function renderListAdmin(data) {
  const wrap = el('notaList');
  wrap.innerHTML = '';
  if (!Object.keys(data || {}).length) { wrap.innerHTML = '<i>Tidak ada data</i>'; return; }
  Object.entries(data).forEach(([user, notes]) => {
    const card = document.createElement('div');
    card.className = 'card';
    const totalUser = Object.values(notes || {}).reduce((s, n) => {
      const tambahanNominal = n.tambahans ? Object.values(n.tambahans).reduce((s2, t) => s2 + (Number(t.nominal) || 0), 0) : (Number(n.tambahan) || 0);
      return s + (Number(n.ongkir) || 0) + tambahanNominal;
    }, 0);

    card.innerHTML = `<h3>Kurir: ${user} — Total: Rp ${money(totalUser)}</h3>`;
    const tbl = document.createElement('table');
    tbl.innerHTML = `<thead><tr><th>No Nota</th><th>Tanggal</th><th>Ongkir</th><th>Tambahan</th><th>Total</th><th>Aksi</th></tr></thead><tbody></tbody>`;
    const tb = tbl.querySelector('tbody');
    Object.values(notes || {}).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).forEach(n => {
      const tr = document.createElement('tr');
      const totalNota = (Number(n.ongkir) || 0) + (n.tambahans ? Object.values(n.tambahans).reduce((s, t) => s + (Number(t.nominal) || 0), 0) : (Number(n.tambahan) || 0));
      tr.innerHTML = `<td>${n.noNota || ''}</td>
                      <td>${n.createdAt ? new Date(n.createdAt).toLocaleString('id-ID') : '-'}</td>
                      <td>Rp ${money(n.ongkir || 0)}</td>
                      <td>Rp ${money(n.tambahans ? Object.values(n.tambahans).reduce((s, t) => s + (Number(t.nominal) || 0), 0) : (Number(n.tambahan) || 0))}</td>
                      <td><b>Rp ${money(totalNota)}</b></td>
                      <td class="flex">
                        <button class="btn secondary" onclick="viewNotaAdmin('${user}','${n.id}')">👁 Lihat</button>
                        <button class="btn" onclick="editNotaAdmin('${user}','${n.id}')">✏️ Edit</button>
                        <button class="btn danger" onclick="delNotaAdmin('${user}','${n.id}')">🗑 Hapus</button>
                      </td>`;
      tb.appendChild(tr);
    });
    card.appendChild(tbl);
    wrap.appendChild(card);
  });
}

window.showAddForm = () => {
  editingNotaAdmin = null;
  el('formTitle').innerText = 'Tambah Nota';
  el('formKurir').value = '';
  el('formNoNota').value = '';
  el('formOngkir').value = 0;
  el('formTambahan').value = 0;
  el('formText').value = '';
  qs('#itemTable tbody').innerHTML = '';
  addItemRowAdmin();
  el('formTotal').innerText = '0';
  el('notaForm').classList.remove('hidden');
  fillKurirDatalistAdmin();
};

window.cancelNota = () => el('notaForm').classList.add('hidden');

function addItemRowAdmin(nama = '', qty = 1, harga = 0) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="iname" value="${nama}"></td>
                  <td><input class="iqty" type="number" value="${qty}"></td>
                  <td><input class="iprice" type="number" value="${harga}"></td>
                  <td><button class="btn danger" onclick="this.closest('tr').remove();calcTotalAdmin()">✖</button></td>`;
  qs('#itemTable tbody').appendChild(tr);
  tr.querySelectorAll('input').forEach(i => i.addEventListener('input', calcTotalAdmin));
  calcTotalAdmin();
}

window.addItemRow = addItemRowAdmin;

function calcTotalAdmin() {
  let total = 0;
  qsa('#itemTable tbody tr').forEach(tr => {
    const q = Number(tr.querySelector('.iqty').value) || 0;
    const h = Number(tr.querySelector('.iprice').value) || 0;
    total += q * h;
  });
  total += Number(el('formOngkir').value || 0);
  total += Number(el('formTambahan').value || 0);
  el('formTotal').innerText = money(total);
}
el('formOngkir').addEventListener('input', calcTotalAdmin);
el('formTambahan').addEventListener('input', calcTotalAdmin);

window.saveNota = async () => {
  const user = el('formKurir').value.trim();
  if (!user) return showNotification('Isi nama kurir', 'warning');
  const noNota = el('formNoNota').value.trim() || ('NN-' + Date.now().toString().slice(-6));
  const items = qsa('#itemTable tbody tr').map(tr => ({
    nama: tr.querySelector('.iname').value,
    qty: Number(tr.querySelector('.iqty').value) || 0,
    harga: Number(tr.querySelector('.iprice').value) || 0,
  }));
  const ongkir = Number(el('formOngkir').value) || 0;
  const tambahanNominal = Number(el('formTambahan').value) || 0;
  const tambahans = tambahanNominal > 0 ? [{ nominal: tambahanNominal, type: "Tambahan Manual" }] : [];
  const text = el('formText').value || '';
  const total = items.reduce((s, it) => s + it.qty * it.harga, 0) + ongkir + tambahans.reduce((s, t) => s + (Number(t.nominal) || 0), 0);
  let id, createdAt;
  if (editingNotaAdmin) { id = editingNotaAdmin.id; createdAt = editingNotaAdmin.createdAt; } else { id = 'nota_' + Date.now(); createdAt = new Date().toISOString(); }

  const data = { id, kurir: user, noNota, createdAt, items, ongkir, tambahans, total, text };
  try {
    await set(ref(db, `nota/${user}/${id}`), data);
    // Ensure kurir exists and is enabled in Realtime DB
    await set(ref(db, `kurir/${user}`), { username: user, enabled: true, password: kurirDetailsAdmin[user]?.password || 'default_password' }); 
    kurirSetAdmin.add(user);
    await loadNotaAdmin();
    buildNoNotaDatalistAdmin();
    renderListAdmin(allDataAdmin);
    el('notaForm').classList.add('hidden');
    showNotification('Nota disimpan.', 'success');
  } catch (error) {
    console.error("Error saving nota admin:", error);
    showNotification('Gagal menyimpan nota: ' + error.message, 'error');
  }
};

window.editNotaAdmin = async (user, id) => {
  const snap = await get(ref(db, `nota/${user}/${id}`));
  if (!snap.exists()) return showNotification('Nota tidak ditemukan', 'error');
  const n = snap.val();
  editingNotaAdmin = { id, createdAt: n.createdAt };
  el('formTitle').innerText = 'Edit Nota';
  el('formKurir').value = user;
  el('formNoNota').value = n.noNota || '';
  el('formOngkir').value = n.ongkir || 0;
  el('formTambahan').value = n.tambahans && n.tambahans.length > 0 ? n.tambahans[0].nominal : (n.tambahan || 0); // Simplified for single manual tambahan
  el('formText').value = n.text || '';
  qs('#itemTable tbody').innerHTML = '';
  (n.items || []).forEach(it => addItemRowAdmin(it.nama, it.qty, it.harga));
  el('notaForm').classList.remove('hidden');
  calcTotalAdmin();
};

window.delNotaAdmin = async (user, id) => {
  if (!confirm('Hapus nota ini?')) return;
  try {
    const notaRef = ref(db, `nota/${user}/${id}`);
    const notaSnap = await get(notaRef);
    const notaData = notaSnap.val();

    await remove(notaRef);
    if (notaData && notaData.noNota) {
      await remove(ref(db, `pelacakByNo/${notaData.noNota}/${id}`));
      const keyDate = notaData.createdAt.slice(0, 10);
      await remove(ref(db, `pelacakByDate/${keyDate}/${id}`));
    }
    await loadNotaAdmin();
    renderListAdmin(allDataAdmin);
    showNotification('Nota dihapus.', 'info');
  } catch (error) {
    console.error("Error deleting nota admin:", error);
    showNotification('Gagal menghapus nota: ' + error.message, 'error');
  }
};

window.viewNotaAdmin = (user, id) => {
  const n = allDataAdmin?.[user]?.[id];
  if (!n) return;
  const w = window.open('', '_blank');
  w.document.write('<title>Nota ' + (n.noNota || '') + '</title><pre style="font-family:ui-monospace,Consolas,monospace">' + JSON.stringify(n, null, 2) + '</pre>');
  w.document.close();
};

window.exportCSV = () => {
  const rows = [["Kurir", "No Nota", "Tanggal", "Ongkir", "Tambahan", "Total"]];
  const cards = qsa('#notaList .card');
  cards.forEach(card => {
    const title = card.querySelector('h3')?.innerText || '';
    const user = title.replace(/^Kurir:\s*/, '').split(' — ')[0];
    card.querySelectorAll('tbody tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      rows.push([user, tds[0].innerText, tds[1].innerText, tds[2].innerText.replace('Rp ', '').replaceAll('.', ''), tds[3].innerText.replace('Rp ', '').replaceAll('.', ''), tds[4].innerText.replace('Rp ', '').replaceAll('.', '')]);
    });
  });
  downloadCSV(rows, 'nota_filtered.csv');
  showNotification('Data nota diekspor ke CSV.', 'success');
};

// ====================================================================
// Admin Dashboard: Rekap & Riwayat
// ====================================================================
function fillRekapKurirAdmin() {
  const sel = el('rekapKurirAdmin');
  sel.innerHTML = '<option value="">— Semua Kurir —</option>' + [...kurirSetAdmin].sort().map(k => `<option>${k}</option>`).join('');
}

window.renderRekapAdmin = async () => {
  const k = el('rekapKurirAdmin').value;
  const m = el('rekapBulanAdmin').value; // YYYY-MM

  let rows = [];
  let total = 0;
  let count = 0;
  let totOngkir = 0;
  let totTambahan = 0;

  const push = (n) => {
    const dt = n.createdAt ? new Date(n.createdAt).toLocaleDateString('id-ID') : '-';
    const tambahanSum = n.tambahans ? Object.values(n.tambahans).reduce((s, t) => s + (Number(t.nominal) || 0), 0) : (Number(n.tambahan) || 0);
    const totalNota = (Number(n.ongkir) || 0) + tambahanSum;

    rows.push([dt, n.noNota || '', n.ongkir || 0, tambahanSum, totalNota]);
    count++;
    total += totalNota;
    totOngkir += (Number(n.ongkir) || 0);
    totTambahan += tambahanSum;
  };

  if (k) {
    const notes = allDataAdmin[k] || {};
    Object.values(notes).forEach(n => {
      if (m) { if ((n.createdAt || '').slice(0, 7) !== m) return; }
      push(n);
    });
  } else {
    Object.values(allDataAdmin).forEach(notes => {
      Object.values(notes).forEach(n => {
        if (m) { if ((n.createdAt || '').slice(0, 7) !== m) return; }
        push(n);
      });
    });
  }

  el('rekapRingkasAdmin').innerHTML = `<div class="card">
    <b>Jumlah Nota:</b> ${count} &nbsp; | &nbsp; <b>Total Ongkir:</b> Rp ${money(totOngkir)}
    &nbsp; | &nbsp; <b>Total Tambahan:</b> Rp ${money(totTambahan)} &nbsp; | &nbsp; <b>Total Penghasilan:</b> Rp ${money(total)}
  </div>`;

  const thead = '<thead><tr><th>Tanggal</th><th>No Nota</th><th>Ongkir</th><th>Tambahan</th><th>Total</th></tr></thead>';
  const tbody = '<tbody>' + rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>Rp ${money(r[2])}</td><td>Rp ${money(r[3])}</td><td><b>Rp ${money(r[4])}</b></td></tr>`).join('') + '</tbody>';
  el('rekapTabelAdmin').innerHTML = `<table>${thead}${tbody}</table>`;
  showNotification('Rekap dimuat.', 'info');
};

window.exportCSVRekapAdmin = () => {
  const rows = [["Tanggal", "No Nota", "Ongkir", "Tambahan", "Total"]];
  el('rekapTabelAdmin').querySelectorAll('tbody tr').forEach(tr => {
    const t = tr.querySelectorAll('td');
    rows.push([t[0].innerText, t[1].innerText, t[2].innerText.replace('Rp ', '').replaceAll('.', ''), t[3].innerText.replace('Rp ', '').replaceAll('.', ''), t[4].innerText.replace('Rp ', '').replaceAll('.', '')]);
  });
  downloadCSV(rows, 'rekap.csv');
  showNotification('Data rekap diekspor ke CSV.', 'success');
};

// ====================================================================
// Admin Dashboard: Manajemen Kurir
// ====================================================================
function renderKurirTableAdmin() {
  const tbody = qs('#tableKurirAdmin tbody');
  tbody.innerHTML = '';
  const sortedKurir = Array.from(kurirSetAdmin).sort();

  sortedKurir.forEach(uname => {
    const details = kurirDetailsAdmin[uname] || { password: 'N/A', enabled: false };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${uname}</td>
      <td>${details.password}</td>
      <td><span class="badge ${details.enabled ? 'on' : 'off'}">${details.enabled ? 'Aktif' : 'Blokir'}</span></td>
      <td>
        <button class="btn-mini secondary" onclick="editKurirPasswordAdmin('${uname}')">Ubah Pass</button>
        <button class="btn-mini ${details.enabled ? 'danger' : 'on'}" onclick="${details.enabled ? `blokirKurirAdmin('${uname}')` : `bukaBlokirKurirAdmin('${uname}')`}">${details.enabled ? 'Blokir' : 'Buka Blokir'}</button>
        <button class="btn-mini danger" onclick="hapusKurirAdminTable('${uname}')">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.tambahKurirAdmin = async () => {
  const uname = el('kurirBaru').value.trim();
  const pass = el('kurirPass').value.trim();
  if (!uname || pass.length < 6) return showNotification('Isi username & password min 6 karakter', 'warning');

  try {
    // Check if kurir already exists in Realtime DB
    const snap = await get(ref(db, 'kurir/' + uname));
    if (snap.exists()) {
      showNotification('Kurir dengan username ini sudah ada!', 'warning');
      return;
    }

    await set(ref(db, 'kurir/' + uname), {
      username: uname,
      password: pass,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    kurirSetAdmin.add(uname);
    kurirDetailsAdmin[uname] = { username: uname, password: pass, enabled: true }; // Update local cache
    fillKurirFilterAdmin();
    fillKurirManageAdmin();
    fillKurirDatalistAdmin();
    renderKurirTableAdmin(); // Refresh the table
    showNotification('Kurir ditambahkan.', 'success');
    el('kurirBaru').value = '';
    el('kurirPass').value = '';
  } catch (error) {
    console.error("Error adding kurir:", error);
    showNotification('Gagal menambah kurir: ' + error.message, 'error');
  }
};

window.hapusKurirAdmin = async () => {
  const uname = el('kurirManage').value;
  if (!uname) return showNotification('Pilih kurir yang akan dihapus.', 'warning');
  hapusKurirAdminTable(uname);
};

window.hapusKurirAdminTable = async (uname) => {
  if (!confirm(`Hapus kurir "${uname}"? Ini akan menghapus akses login dan data kurir ini.`)) return;

  try {
    await remove(ref(db, 'kurir/' + uname));
    kurirSetAdmin.delete(uname);
    delete kurirDetailsAdmin[uname]; // Remove from local cache
    fillKurirFilterAdmin();
    fillKurirManageAdmin();
    fillKurirDatalistAdmin();
    renderKurirTableAdmin(); // Refresh the table
    showNotification('Kurir dihapus.', 'info');
  } catch (error) {
    console.error("Error deleting kurir:", error);
    showNotification('Gagal menghapus kurir: ' + error.message, 'error');
  }
};

window.ubahPasswordKurirAdmin = async () => {
  const uname = el('kurirManage').value;
  if (!uname) return showNotification('Pilih kurir dulu.', 'warning');
  editKurirPasswordAdmin(uname);
};

window.editKurirPasswordAdmin = async (uname) => {
  const newPass = prompt(`Masukkan password baru untuk ${uname}:`, "");
  if (!newPass) return;

  try {
    await update(ref(db, 'kurir/' + uname), { password: newPass });
    kurirDetailsAdmin[uname].password = newPass; // Update local cache
    renderKurirTableAdmin(); // Refresh the table
    showNotification('Password berhasil diubah.', 'success');
  } catch (error) {
    console.error("Error changing password:", error);
    showNotification('Gagal mengubah password: ' + error.message, 'error');
  }
};

window.blokirKurirAdmin = async (uname = el('kurirManage').value) => {
  if (!uname) return showNotification('Pilih kurir dulu.', 'warning');
  if (!confirm(`Yakin ingin memblokir kurir "${uname}"? Ini akan mencegahnya login.`)) return;

  try {
    await update(ref(db, 'kurir/' + uname), { enabled: false });
    kurirDetailsAdmin[uname].enabled = false; // Update local cache
    renderKurirTableAdmin(); // Refresh the table
    showNotification(`Kurir ${uname} diblokir.`, 'info');
  } catch (error) {
    console.error("Error blocking kurir:", error);
    showNotification('Gagal memblokir kurir: ' + error.message, 'error');
  }
};

window.bukaBlokirKurirAdmin = async (uname = el('kurirManage').value) => {
  if (!uname) return showNotification('Pilih kurir dulu.', 'warning');
  if (!confirm(`Yakin ingin membuka blokir kurir "${uname}"?`)) return;

  try {
    await update(ref(db, 'kurir/' + uname), { enabled: true });
    kurirDetailsAdmin[uname].enabled = true; // Update local cache
    renderKurirTableAdmin(); // Refresh the table
    showNotification(`Kurir ${uname} dibuka blokirnya.`, 'info');
  } catch (error) {
    console.error("Error unblocking kurir:", error);
    showNotification('Gagal membuka blokir kurir: ' + error.message, 'error');
  }
};

// ====================================================================
// Admin Dashboard: Manajemen Ongkir
// ====================================================================
function setupOngkirRealtimeAdmin() {
  const ongkirRef = ref(db, 'daftar_ongkir');
  onValue(ongkirRef, (snap) => {
    ongkirDataAdminRealtime = snap.exists() ? snap.val() : {};
    renderOngkirAdmin();
    fillWilayahDatalistAdmin();
  });
}

function renderOngkirAdmin() {
  const div = el('ongkirTabel');
  const rows = Object.entries(ongkirDataAdminRealtime || {}).sort((a, b) => a[1].wilayah.localeCompare(b[1].wilayah));
  if (!rows.length) { div.innerHTML = '<i>Belum ada wilayah.</i>'; return; }

  const thead = '<thead><tr><th>Wilayah</th><th>Ongkir</th><th>Aksi</th></tr></thead>';
  const tbody = '<tbody>' + rows.map(([k, v]) => `
    <tr>
      <td><input value="${v.wilayah}" data-key="${k}" class="wilayahName"></td>
      <td><input type="number" value="${v.ongkir}" class="wilayahHarga"></td>
      <td class="flex">
        <button class="btn" onclick="saveOngkirRowAdmin(this)">💾 Save</button>
        <button class="btn danger" onclick="deleteOngkirRowAdmin(this)">🗑 Hapus</button>
      </td>
    </tr>`).join('') + '</tbody>';

  div.innerHTML = `<table>${thead}${tbody}</table>`;
}

function fillWilayahDatalistAdmin() {
  const dl = el('wilayahList');
  dl.innerHTML = Object.values(ongkirDataAdminRealtime || {}).sort((a, b) => a.wilayah.localeCompare(b.wilayah))
    .map(v => `<option value="${v.wilayah}">`).join('');
}

window.simpanOngkirAdmin = async () => {
  const w = el('wilayahInput').value.trim();
  const h = Number(el('hargaOngkir').value || 0);
  if (!w) return showNotification('Isi wilayah', 'warning');

  try {
    await set(ref(db, 'daftar_ongkir/' + w), { wilayah: w, ongkir: h });
    el('wilayahInput').value = '';
    el('hargaOngkir').value = '';
    showNotification(`Ongkir wilayah "${w}" berhasil disimpan.`, 'success');
  } catch (error) {
    console.error("Error saving ongkir:", error);
    showNotification('Gagal menyimpan ongkir: ' + error.message, 'error');
  }
};

window.hapusOngkirAdmin = async () => {
  const namaWilayah = el('wilayahInput').value.trim();
  if (!namaWilayah) return showNotification('Pilih wilayah', 'warning');

  const key = Object.keys(ongkirDataAdminRealtime).find(k => ongkirDataAdminRealtime[k].wilayah === namaWilayah);
  if (!key) return showNotification('Wilayah tidak ditemukan', 'error');

  if (!confirm(`Hapus wilayah "${namaWilayah}"?`)) return;

  try {
    await remove(ref(db, 'daftar_ongkir/' + key));
    showNotification('Wilayah dihapus.', 'info');
  } catch (error) {
    console.error("Error deleting ongkir:", error);
    showNotification('Gagal menghapus wilayah: ' + error.message, 'error');
  }
};

window.saveOngkirRowAdmin = async (btn) => {
  const tr = btn.closest('tr');
  const key = tr.querySelector('.wilayahName').dataset.key;
  const nama = tr.querySelector('.wilayahName').value.trim();
  const ongkir = Number(tr.querySelector('.wilayahHarga').value || 0);

  if (!nama) return showNotification('Isi nama wilayah', 'warning');
  if (isNaN(ongkir)) return showNotification('Ongkir harus angka', 'warning');

  try {
    await set(ref(db, 'daftar_ongkir/' + key), { wilayah: nama, ongkir });
    showNotification('Disimpan.', 'success');
  } catch (error) {
    console.error("Error saving ongkir row:", error);
    showNotification('Gagal menyimpan perubahan: ' + error.message, 'error');
  }
};

window.deleteOngkirRowAdmin = async (btn) => {
  const tr = btn.closest('tr');
  const key = tr.querySelector('.wilayahName').dataset.key;
  const nama = tr.querySelector('.wilayahName').value.trim();

  if (!confirm(`Hapus wilayah "${nama}"?`)) return;

  try {
    await remove(ref(db, 'daftar_ongkir/' + key));
    showNotification('Dihapus.', 'info');
  } catch (error) {
    console.error("Error deleting ongkir row:", error);
    showNotification('Gagal menghapus: ' + error.message, 'error');
  }
};
