const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';

document.addEventListener('DOMContentLoaded', () => {
  const loggedIn = localStorage.getItem('adminLoggedIn');
  if (!loggedIn) {
    window.location.href = 'land.html';
    return;
  }

  restoreTheme();
  loadDashboard();
});

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeButton();
}

function restoreTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.innerText = document.body.classList.contains('dark') ? 'Sun' : 'Moon';
  }
}

function togglePasswordChange() {
  document.getElementById('passwordChange').classList.toggle('hidden');
}

function saveNewPassword() {
  const newPass = document.getElementById('newPassword').value;
  if (newPass.trim()) {
    localStorage.setItem('adminPassword', newPass);
    alert('Password changed successfully!');
  }
}

async function loadDashboard() {
  try {
    const [orders, appointments, enquiries, payments] = await Promise.all([
      fetchCollection('/api/orders'),
      fetchCollection('/api/appointments'),
      fetchCollection('/api/enquiries'),
      fetchCollection('/api/payments'),
    ]);

    renderMetrics({ orders, appointments, enquiries, payments });
    renderOrders(orders);
    renderList('appointmentList', appointments, item => [
      item.service,
      item.name,
      item.phone,
      [item.date, item.time].filter(Boolean).join(' '),
      item.location,
      item.notes,
    ]);
    renderList('enquiryList', enquiries, item => [item.name, item.phone, item.message]);
    renderList('paymentList', payments, item => [
      item.name,
      item.phone,
      `Rs.${item.amount || 0}`,
      item.reference,
      item.purpose,
    ]);
  } catch (error) {
    document.getElementById('ordersStatus').textContent = 'Start the backend server to load saved requests.';
  }
}

async function fetchCollection(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${endpoint}`);
  }
  return response.json();
}

function renderMetrics({ orders, appointments, enquiries, payments }) {
  const total = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  document.getElementById('orderCount').textContent = orders.length;
  document.getElementById('appointmentCount').textContent = appointments.length;
  document.getElementById('enquiryCount').textContent = enquiries.length;
  document.getElementById('totalProfit').textContent = total.toFixed(2);
}

function renderOrders(orders) {
  const table = document.getElementById('orderTable');
  table.innerHTML = '';

  if (!orders.length) {
    table.innerHTML = '<tr><td colspan="6">No orders yet.</td></tr>';
    return;
  }

  orders
    .slice()
    .reverse()
    .forEach(order => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(order.createdAt)}</td>
        <td>${escapeHtml(order.name)}</td>
        <td>${escapeHtml(order.phone)}</td>
        <td>${escapeHtml(order.service)}</td>
        <td>${escapeHtml(order.budget || '')}</td>
        <td>${escapeHtml(order.details || '')}</td>`;
      table.appendChild(tr);
    });
}

function renderList(containerId, records, fieldsFactory) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!records.length) {
    container.innerHTML = '<p>No records yet.</p>';
    return;
  }

  records
    .slice()
    .reverse()
    .forEach(record => {
      const item = document.createElement('div');
      item.className = 'record-item';
      const fields = fieldsFactory(record).filter(Boolean);
      item.innerHTML = `
        <strong>${formatDate(record.createdAt)}</strong>
        ${fields.map(field => `<span>${escapeHtml(field)}</span>`).join('')}`;
      container.appendChild(item);
    });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function logoutAdmin() {
  const btn = document.querySelector('.logout-button');
  btn.innerText = 'Logging out...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  setTimeout(() => {
    localStorage.removeItem('adminLoggedIn');
    window.location.href = 'land.html';
  }, 700);
}
