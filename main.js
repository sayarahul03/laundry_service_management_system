// Shared helpers used by every page

const PAGES = [
  ['index.html', 'Home'], ['dashboard.html', 'Dashboard'], ['customers.html', 'Customers'],
  ['services.html', 'Services'], ['orders.html', 'Orders'], ['payments.html', 'Payments']
];
const ORDER_STATUSES = ['Pending', 'Processing', 'Ready', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
const PAYMENT_METHODS = ['Cash', 'UPI', 'Card'];

function renderNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.getElementById('navbar').innerHTML = `
    <nav class="navbar"><div class="container">
      <a class="brand" href="index.html">FreshFold</a>
      <div class="nav-links">${PAGES.map(([href, label]) =>
        `<a href="${href}" class="${href === current ? 'active' : ''}">${label}</a>`).join('')}</div>
    </div></nav>`;
  document.getElementById('footer').innerHTML =
    `<footer class="footer"><div class="container">© ${new Date().getFullYear()} FreshFold Laundry Services</div></footer>`;
}

async function api(url, options = {}) {
  const res = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(message, isError = false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

const rupees = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = s => `<span class="badge ${esc(s)}">${esc(s)}</span>`;

// Popup form used by every add/edit action.
// fields: [{name, label, type: text|number|email|select, options: [{value,label}], step, required}]
// note(values): optional function returning text shown under the form (e.g. a live total)
function openForm({ title, fields, values = {}, note, onSave }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      ${fields.map(f => `
        <label for="f_${f.name}">${esc(f.label)}</label>
        ${f.type === 'select'
          ? `<select id="f_${f.name}">${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`
          : `<input id="f_${f.name}" type="${f.type || 'text'}" step="${f.step || ''}" ${f.required ? 'required' : ''}>`}`).join('')}
      ${note ? '<div class="summary"><span id="formNote"></span></div>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="mCancel">Cancel</button>
        <button type="button" class="btn" id="mSave">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const get = () => Object.fromEntries(fields.map(f => [f.name, overlay.querySelector('#f_' + f.name).value.trim()]));
  fields.forEach(f => { if (values[f.name] != null) overlay.querySelector('#f_' + f.name).value = values[f.name]; });
  const refresh = () => { if (note) overlay.querySelector('#formNote').innerHTML = note(get()); };
  overlay.addEventListener('input', refresh);
  refresh();

  const close = () => overlay.remove();
  overlay.querySelector('#mCancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#mSave').onclick = async () => {
    try { await onSave(get()); close(); } catch (e) { toast(e.message, true); }
  };
  overlay.querySelector('input, select').focus();
}

document.addEventListener('DOMContentLoaded', renderNav);
