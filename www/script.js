const KEY = 'eggtrack-data';
// 1. Point this to your backend server (change localhost to your IP if testing on a real phone)
const API_URL = 'http://localhost:3000/api/sync';
const API_KEY = 'eggtrack-secret-key-2026';

let data = JSON.parse(localStorage.getItem(KEY)) || { stock: 0, log: [] };

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function formatDate(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${date} • ${time}`;
}

function show(id, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('title').textContent = btn.querySelector('span').textContent;
}

// 2. Updated function to send ALL data to the dashboard
async function syncToBackend() {
  // FIX: Find old records missing IDs and give them one
  let changed = false;
  data.log.forEach(log => {
    if (!log.id) {
      log.id = crypto.randomUUID();
      changed = true;
    }
  });
  if (changed) save();

  // Map local data to the backend's expected format
  const stockData = data.log.filter(x => x.type === 'stock').map(x => ({
    id: x.id,
    qty: x.qty,
    created_at: new Date(x.time).toISOString()
  }));

  const salesData = data.log.filter(x => x.type === 'sale').map(x => ({
    id: x.id,
    qty: x.qty,
    // FIX: Calculate price_per_egg for older sales that didn't have it
    price_per_egg: x.price_per_egg || (x.total / x.qty), 
    total: x.total,
    created_at: new Date(x.time).toISOString()
  }));

  if (stockData.length === 0 && salesData.length === 0) return;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ stock: stockData, sales: salesData })
    });

    if (response.ok) {
      console.log('✅ Synced with Dashboard successfully');
    }
  } catch (error) {
    console.log('❌ Offline or Backend unreachable. Data saved locally.');
  }
}

function addStock() {
  const qty = parseInt(document.getElementById('addQty').value);
  if (!qty || qty < 1) return;
  data.stock += qty;
  data.log.unshift({ id: crypto.randomUUID(), type: 'stock', qty, total: 0, time: Date.now() });
  document.getElementById('addQty').value = '';
  save();
  render();
  syncToBackend(); 
}

function quickAdd(n) {
  data.stock += n;
  data.log.unshift({ id: crypto.randomUUID(), type: 'stock', qty: n, total: 0, time: Date.now() });
  save();
  render();
  syncToBackend(); 
}

function recordSale() {
  const qty = parseInt(document.getElementById('saleQty').value);
  const price = parseFloat(document.getElementById('salePrice').value);
  const msg = document.getElementById('msg');

  if (!qty || !price) { msg.textContent = 'Enter quantity and price.'; return; }
  if (qty > data.stock) { msg.textContent = 'Not enough stock.'; return; }

  msg.textContent = '';
  data.stock -= qty;
  data.log.unshift({ 
    id: crypto.randomUUID(), 
    type: 'sale', 
    qty, 
    price_per_egg: price,
    total: qty * price, 
    time: Date.now() 
  });
  
  document.getElementById('saleQty').value = '';
  document.getElementById('salePrice').value = '';
  save();
  render();
  syncToBackend(); 
}

function resetData() {
  if (!confirm('Clear all records?')) return;
  data = { stock: 0, log: [] };
  save();
  render();
}

function row(e) {
  return `
    <li>
      <div class="badge ${e.type}">${e.type === 'sale' ? '🛒' : '📦'}</div>
      <div class="info">
        <strong>${e.type === 'sale' ? 'Sale' : 'Stock Added'} · ${e.qty} eggs</strong>
        <small>${formatDate(e.time)}</small>
      </div>
      <div class="amount ${e.type === 'stock' ? 'in' : ''}">
        ${e.type === 'sale' ? '₱' + e.total.toFixed(2) : '+' + e.qty}
      </div>
    </li>`;
}

function render() {
  const sales = data.log.filter(e => e.type === 'sale');
  const totalSold = sales.reduce((sum, e) => sum + e.qty, 0);
  const revenue = sales.reduce((sum, e) => sum + e.total, 0);

  document.getElementById('stock').textContent = data.stock;
  document.getElementById('totalSold').textContent = totalSold;
  document.getElementById('revenue').textContent = '₱' + revenue.toFixed(2);
  document.getElementById('count').textContent = data.log.length;

  document.getElementById('history').innerHTML =
    data.log.length ? data.log.map(row).join('') : '<p class="empty">No records yet.</p>';

  const recent = data.log.slice(0, 3);
  document.getElementById('recent').innerHTML =
    recent.length ? recent.map(row).join('') : '<p class="empty">No activity yet.</p>';
}

// Initial Sync when app loads
document.addEventListener('DOMContentLoaded', () => {
  render();
  syncToBackend();
});