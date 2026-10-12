const KEY = 'eggtrack-data';
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

function addStock() {
  const qty = parseInt(document.getElementById('addQty').value);
  if (!qty || qty < 1) return;
  data.stock += qty;
  data.log.unshift({ type: 'stock', qty, total: 0, time: Date.now() });
  document.getElementById('addQty').value = '';
  save();
  render();
}

function recordSale() {
  const qty = parseInt(document.getElementById('saleQty').value);
  const price = parseFloat(document.getElementById('salePrice').value);
  const msg = document.getElementById('msg');

  if (!qty || !price) { msg.textContent = 'Enter quantity and price.'; return; }
  if (qty > data.stock) { msg.textContent = 'Not enough stock.'; return; }

  msg.textContent = '';
  data.stock -= qty;
  data.log.unshift({ type: 'sale', qty, total: qty * price, time: Date.now() });
  document.getElementById('saleQty').value = '';
  document.getElementById('salePrice').value = '';
  save();
  render();
}

function resetData() {
  if (!confirm('Clear all records?')) return;
  data = { stock: 0, log: [] };
  save();
  render();
}

function quickAdd(n) {
  data.stock += n;
  data.log.unshift({ type: 'stock', qty: n, total: 0, time: Date.now() });
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