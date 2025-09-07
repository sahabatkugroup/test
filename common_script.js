// common_script.js
const el = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const money = (n) => (Number(n) || 0).toLocaleString('id-ID');
const leftPad = (num, len = 5) => String(num).padStart(len, '0');

function showNotification(message, type = 'success') {
  const popup = el('notificationPopup');
  popup.textContent = message;
  popup.className = `notification-popup show ${type}`;
  el('notificationSound').play();
  setTimeout(() => {
    popup.classList.remove('show');
  }, 3000);
}

function showSection(id) {
  // This function is primarily for index.html, but kept here for consistency
  // In other pages, elements are directly visible/hidden
  qsa('.container > div').forEach(div => div.classList.add('hidden'));
  el(id).classList.remove('hidden');
}

function setActiveTab(tabContainerId, tabId) {
  qsa(`#${tabContainerId} button`).forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  // Find the parent element that contains both the nav and tabContent elements
  const parentContainer = el(tabContainerId).closest('.tab-container') || el(tabContainerId).parentNode; 
  qsa('.tabContent', parentContainer).forEach(t => t.classList.add('hidden'));
  el(tabId).classList.remove('hidden');
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => {
    const v = (c === undefined || c === null) ? '' : String(c);
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }).join(',')).join('\n'); 
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { el, qs, qsa, money, leftPad, showNotification, showSection, setActiveTab, downloadCSV };
