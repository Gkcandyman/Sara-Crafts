const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:5050' : '';

const state = {
  activeSection: 'dashboard',
  statusTimer: null,
  collections: {
    orders: [],
    appointments: [],
    enquiries: [],
    payments: [],
  },
};

const collectionConfig = {
  orders: {
    endpoint: '/api/orders',
    label: 'Order',
    statuses: ['new', 'in_progress', 'completed', 'cancelled'],
  },
  appointments: {
    endpoint: '/api/appointments',
    label: 'Appointment',
    statuses: ['new', 'in_progress', 'completed', 'cancelled'],
  },
  enquiries: {
    endpoint: '/api/enquiries',
    label: 'Enquiry',
    statuses: ['new', 'in_progress', 'completed', 'cancelled'],
  },
  payments: {
    endpoint: '/api/payments',
    label: 'Payment',
    statuses: ['pending_verification', 'verified', 'rejected'],
  },
};

const hiddenDetailFields = new Set([
  'storage',
  'source',
  'screenshotData',
  'screenshotType',
]);

document.addEventListener('DOMContentLoaded', () => {
  const loggedIn = localStorage.getItem('adminLoggedIn');
  if (!loggedIn) {
    window.location.href = 'land.html';
    return;
  }

  restoreTheme();
  bindAdminEvents();
  loadDashboard();
});

function bindAdminEvents() {
  document.querySelectorAll('.sidebar-link').forEach(button => {
    button.addEventListener('click', () => switchSection(button.dataset.section));
  });

  document.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    const { action, collection, id } = actionButton.dataset;
    if (action === 'view') {
      openRecordModal(collection, id);
    }
    if (action === 'view-service') {
      openServiceModal(id);
    }
    if (action === 'delete') {
      deleteAdminRecord(collection, id);
    }
  });

  document.addEventListener('change', event => {
    const select = event.target.closest('[data-status-select]');
    if (!select) return;

    updateRecordStatus(select.dataset.collection, select.dataset.id, select.value, select);
  });

  const modal = document.getElementById('recordModal');
  if (modal) {
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        closeRecordModal();
      }
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeRecordModal();
    }
  });
}

async function loadDashboard() {
  setAdminStatus('Loading admin data...');

  try {
    const [orders, appointments, enquiries, payments] = await Promise.all([
      fetchCollection('orders'),
      fetchCollection('appointments'),
      fetchCollection('enquiries'),
      fetchCollection('payments'),
    ]);

    state.collections = { orders, appointments, enquiries, payments };
    renderAdmin();
    setAdminStatus('Admin data loaded.');
  } catch (error) {
    setAdminStatus(`Could not load saved requests: ${error.message}`);
    renderAdmin();
  }
}

async function reloadAdminData(message = '') {
  const [orders, appointments, enquiries, payments] = await Promise.all([
    fetchCollection('orders'),
    fetchCollection('appointments'),
    fetchCollection('enquiries'),
    fetchCollection('payments'),
  ]);

  state.collections = { orders, appointments, enquiries, payments };
  renderAdmin();
  setAdminStatus(message);
}

function refreshDashboard() {
  loadDashboard();
}

async function fetchCollection(collection) {
  const response = await fetch(`${API_BASE}${collectionConfig[collection].endpoint}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${collection}`);
  }
  return response.json();
}

function renderAdmin() {
  renderMetrics();
  renderRecentList();
  renderStatusOverview();
  renderDashboardCharts();
  renderOrders();
  renderRecordList('appointmentList', 'appointments');
  renderRecordList('enquiryList', 'enquiries');
  renderRecordList('paymentList', 'payments');
  renderServiceSummary();
  updateTotals();
}

function switchSection(section) {
  state.activeSection = section;

  document.querySelectorAll('.sidebar-link').forEach(button => {
    button.classList.toggle('is-active', button.dataset.section === section);
  });

  document.querySelectorAll('.admin-section').forEach(panel => {
    const panelName = panel.id.replace('Section', '');
    panel.classList.toggle('is-active', panelName === section);
  });

  const activePanel = document.querySelector('.admin-section.is-active');
  document.getElementById('sectionTitle').textContent = activePanel?.dataset.title || 'Dashboard';
  document.getElementById('sectionSubtitle').textContent = activePanel?.dataset.subtitle || '';
}

function renderMetrics() {
  const { orders, appointments, enquiries, payments } = state.collections;
  const total = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  setText('orderCount', orders.length);
  setText('appointmentCount', appointments.length);
  setText('enquiryCount', enquiries.length);
  setText('totalProfit', total.toFixed(2));
}

function renderRecentList() {
  const records = getAllRecords()
    .sort((a, b) => new Date(b.record.createdAt || 0) - new Date(a.record.createdAt || 0))
    .slice(0, 6);
  const container = document.getElementById('recentList');
  if (!container) return;

  setText('recentCount', `${records.length} items`);

  if (!records.length) {
    container.innerHTML = '<p class="empty-state">No requests yet.</p>';
    return;
  }

  container.innerHTML = records.map(({ collection, record }) => `
    <article class="record-item compact">
      <div>
        <strong>${escapeHtml(collectionConfig[collection].label)} - ${escapeHtml(record.name || 'Unknown')}</strong>
        <span>${escapeHtml(record.service || record.purpose || record.message || 'New request')}</span>
      </div>
      <span class="status-pill ${statusClass(record.status)}">${formatStatus(record.status)}</span>
    </article>
  `).join('');
}

function renderStatusOverview() {
  const container = document.getElementById('statusOverview');
  if (!container) return;

  const counts = getAllRecords().reduce((summary, item) => {
    const status = item.record.status || defaultStatus(item.collection);
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {});

  const entries = Object.entries(counts);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No status data yet.</p>';
    return;
  }

  container.innerHTML = entries.map(([status, count]) => `
    <div class="status-orbit-card">
      <span class="status-dot ${statusClass(status)}"></span>
      <div>
        <strong>${formatStatus(status)}</strong>
        <span>${count} live records</span>
      </div>
      <i style="--value: ${(count / max) * 100}%">${count}</i>
    </div>
  `).join('');
}

function renderDashboardCharts() {
  renderOrderWiseChart();
  renderAmountPercentageChart();
  renderServiceActivityChart();
}

function renderOrderWiseChart() {
  const container = document.getElementById('orderWiseChart');
  if (!container) return;

  const orders = state.collections.orders;
  const counts = groupByCount(orders, order => order.service || 'Unassigned');
  const entries = sortEntriesByValue(counts);
  const total = orders.length;

  setText('orderChartTotal', `${total} orders`);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No order data yet.</p>';
    return;
  }

  container.innerHTML = entries.map(([service, count]) => {
    const percentage = getPercentage(count, total);
    return `
      <article class="ring-card">
        <div class="ring-meter" style="--value: ${percentage}%">
          <strong>${percentage}%</strong>
        </div>
        <div>
          <strong>${escapeHtml(service)}</strong>
          <span>${count} orders</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderAmountPercentageChart() {
  const container = document.getElementById('amountPercentageChart');
  if (!container) return;

  const payments = state.collections.payments;
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const amounts = payments.reduce((summary, payment) => {
    const status = payment.status || defaultStatus('payments');
    summary[status] = (summary[status] || 0) + Number(payment.amount || 0);
    return summary;
  }, {});
  const entries = sortEntriesByValue(amounts);

  setText('amountChartTotal', `Rs.${total.toFixed(2)}`);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No payment amount data yet.</p>';
    return;
  }

  container.innerHTML = entries.map(([status, amount]) => {
    const percentage = getPercentage(amount, total);
    return `
      <article class="payment-orbit-card">
        <div class="payment-orbit" style="--value: ${percentage}%">
          <strong>${percentage}%</strong>
        </div>
        <div>
          <strong>${formatStatus(status)}</strong>
          <span>Rs.${amount.toFixed(2)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderServiceActivityChart() {
  const container = document.getElementById('serviceActivityChart');
  if (!container) return;

  const summary = Object.values(buildServiceSummary())
    .sort((a, b) => (b.orders + b.appointments) - (a.orders + a.appointments));
  const max = Math.max(...summary.map(item => item.orders + item.appointments), 1);

  setText('serviceActivityTotal', `${summary.length} services`);

  if (!summary.length) {
    container.innerHTML = '<p class="empty-state">No service activity yet.</p>';
    return;
  }

  container.innerHTML = summary.map(item => {
    const total = item.orders + item.appointments;
    const activityWidth = total ? (total / max) * 100 : 0;
    const orderShare = total ? (item.orders / total) * 100 : 0;
    const appointmentShare = total ? (item.appointments / total) * 100 : 0;

    return `
      <article class="service-art-card">
        <div class="stacked-label">
          <strong>${escapeHtml(item.service)}</strong>
          <span>${total} total</span>
        </div>
        <div class="service-art-track" aria-label="${escapeHtml(item.service)} activity">
          <span style="width: ${activityWidth}%"></span>
        </div>
        <div class="stacked-track" aria-label="${escapeHtml(item.service)} split">
          <span class="stack-orders" style="width: ${orderShare}%"></span>
          <span class="stack-appointments" style="width: ${appointmentShare}%"></span>
        </div>
        <div class="stacked-meta">
          <span>${item.orders} orders</span>
          <span>${item.appointments} appointments</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderChartRow({ label, value, meta, width }) {
  return `
    <div class="chart-row">
      <div class="chart-row-top">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(value)}</span>
      </div>
      <div class="bar-track"><span style="width: ${width}%"></span></div>
      <small>${escapeHtml(meta)}</small>
    </div>
  `;
}

function renderOrders() {
  const table = document.getElementById('orderTable');
  if (!table) return;

  const orders = state.collections.orders;

  if (!orders.length) {
    table.innerHTML = '<tr><td colspan="6">No orders yet.</td></tr>';
    return;
  }

  table.innerHTML = orders.map(order => `
    <tr>
      <td>${formatDate(order.createdAt)}</td>
      <td>
        <strong>${escapeHtml(order.name)}</strong>
        <span>${escapeHtml(order.phone)}</span>
      </td>
      <td>${escapeHtml(order.service)}</td>
      <td>${escapeHtml(order.budget || '-')}</td>
      <td>${renderStatusSelect('orders', order)}</td>
      <td>${renderActions('orders', order.requestId)}</td>
    </tr>
  `).join('');
}

function renderRecordList(containerId, collection) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const records = state.collections[collection];

  if (!records.length) {
    container.innerHTML = '<p class="empty-state">No records yet.</p>';
    return;
  }

  container.innerHTML = records.map(record => `
    <article class="record-item">
      <div class="record-main">
        <div>
          <strong>${escapeHtml(getRecordTitle(collection, record))}</strong>
          <span>${escapeHtml(getRecordSubtitle(collection, record))}</span>
          <small>${formatDate(record.createdAt)}</small>
        </div>
        <div class="record-controls">
          ${renderStatusSelect(collection, record)}
          ${renderActions(collection, record.requestId)}
        </div>
      </div>
    </article>
  `).join('');
}

function renderStatusSelect(collection, record) {
  const currentStatus = record.status || defaultStatus(collection);
  const options = collectionConfig[collection].statuses.map(status => `
    <option value="${status}" ${status === currentStatus ? 'selected' : ''}>${formatStatus(status)}</option>
  `).join('');

  return `
    <select class="status-select ${statusClass(currentStatus)}" data-status-select data-collection="${collection}" data-id="${escapeHtml(record.requestId)}">
      ${options}
    </select>
  `;
}

function renderActions(collection, requestId) {
  const id = escapeHtml(requestId);
  return `
    <div class="action-group">
      <button type="button" class="ghost-button" data-action="view" data-collection="${collection}" data-id="${id}">View</button>
      <button type="button" class="danger-button" data-action="delete" data-collection="${collection}" data-id="${id}">Delete</button>
    </div>
  `;
}

function renderServiceSummary() {
  const container = document.getElementById('serviceSummary');
  if (!container) return;

  const summary = buildServiceSummary();
  const entries = Object.values(summary).sort((a, b) => (b.orders + b.appointments + b.amount) - (a.orders + a.appointments + a.amount));
  const maxActivity = Math.max(...entries.map(item => item.orders + item.appointments), 1);

  setText('serviceTotal', `${entries.length} services`);

  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No service data yet.</p>';
    return;
  }

  container.innerHTML = entries.map(item => `
    <article class="service-row">
      <div class="service-row-top">
        <strong>${escapeHtml(item.service)}</strong>
        <span>Rs.${item.amount.toFixed(2)}</span>
      </div>
      <div class="service-metrics">
        <span>${item.orders} orders</span>
        <span>${item.appointments} appointments</span>
      </div>
      <div class="bar-track"><span style="width: ${((item.orders + item.appointments) / maxActivity) * 100}%"></span></div>
      <div class="action-group">
        <button type="button" class="ghost-button" data-action="view-service" data-id="${escapeHtml(item.service)}">View Service Data</button>
      </div>
    </article>
  `).join('');
}

function buildServiceSummary() {
  const summary = {};

  state.collections.orders.forEach(order => {
    addServiceSummary(summary, order.service, 'orders');
  });

  state.collections.appointments.forEach(appointment => {
    addServiceSummary(summary, appointment.service, 'appointments');
  });

  state.collections.payments.forEach(payment => {
    const service = inferPaymentService(payment);
    if (service && summary[service]) {
      summary[service].amount += Number(payment.amount || 0);
    }
  });

  return summary;
}

function addServiceSummary(summary, service, key) {
  const serviceName = service || 'Unassigned';
  summary[serviceName] = summary[serviceName] || {
    service: serviceName,
    orders: 0,
    appointments: 0,
    amount: 0,
  };
  summary[serviceName][key] += 1;
}

function inferPaymentService(payment) {
  const text = String(payment.purpose || payment.reference || '').toLowerCase();
  return Object.keys(buildKnownServices()).find(service => text.includes(service.toLowerCase()));
}

function buildKnownServices() {
  return [...state.collections.orders, ...state.collections.appointments].reduce((services, record) => {
    if (record.service) {
      services[record.service] = true;
    }
    return services;
  }, {});
}

function groupByCount(records, keyFactory) {
  return records.reduce((summary, record) => {
    const key = keyFactory(record);
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

function sortEntriesByValue(summary) {
  return Object.entries(summary).sort(([, a], [, b]) => b - a);
}

function getPercentage(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total || 0)) * 100);
}

function updateTotals() {
  setText('ordersTotal', `${state.collections.orders.length} records`);
  setText('appointmentsTotal', `${state.collections.appointments.length} records`);
  setText('enquiriesTotal', `${state.collections.enquiries.length} records`);
  setText('paymentsTotal', `${state.collections.payments.length} records`);
}

async function updateRecordStatus(collection, requestId, status, select) {
  const previous = findRecord(collection, requestId)?.status || defaultStatus(collection);
  select.disabled = true;
  setAdminStatus('Saving status...');

  try {
    const response = await fetch(`${API_BASE}${collectionConfig[collection].endpoint}/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || errorPayload.errors?.join(', ') || 'Status update failed');
    }

    await response.json();
    await reloadAdminData('Status updated.');
  } catch (error) {
    select.value = previous;
    setAdminStatus(`Could not update status: ${error.message}`);
  } finally {
    select.disabled = false;
  }
}

async function deleteAdminRecord(collection, requestId) {
  const record = findRecord(collection, requestId);
  const label = record?.name || requestId;

  if (!window.confirm(`Delete ${collectionConfig[collection].label.toLowerCase()} for ${label}?`)) {
    return;
  }

  setAdminStatus('Deleting record...');

  try {
    const response = await fetch(`${API_BASE}${collectionConfig[collection].endpoint}/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Delete failed');
    }

    await reloadAdminData('');
  } catch (error) {
    setAdminStatus(`Could not delete record: ${error.message}`);
  }
}

function openRecordModal(collection, requestId) {
  const record = findRecord(collection, requestId);
  if (!record) return;

  const modal = document.getElementById('recordModal');
  const details = document.getElementById('recordDetails');
  const proof = document.getElementById('paymentProofPreview');
  document.getElementById('recordModalType').textContent = collectionConfig[collection].label;
  document.getElementById('recordModalTitle').textContent = getRecordTitle(collection, record);

  details.innerHTML = getVisibleDetailEntries(record)
    .map(([key, value]) => `
      <dt>${formatKey(key)}</dt>
      <dd>${escapeHtml(formatDetailValue(key, value))}</dd>
    `).join('');
  proof.innerHTML = collection === 'payments' ? renderPaymentProof(record) : '';

  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
}

function openServiceModal(serviceName) {
  const service = serviceName;
  const orders = state.collections.orders.filter(record => (record.service || 'Unassigned') === service);
  const appointments = state.collections.appointments.filter(record => (record.service || 'Unassigned') === service);
  const payments = state.collections.payments.filter(payment => inferPaymentService(payment) === service);
  const amount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const modal = document.getElementById('recordModal');
  const details = document.getElementById('recordDetails');
  const proof = document.getElementById('paymentProofPreview');

  document.getElementById('recordModalType').textContent = 'Service';
  document.getElementById('recordModalTitle').textContent = service;
  details.innerHTML = [
    ['orders', orders.length],
    ['appointments', appointments.length],
    ['linkedPayments', payments.length],
    ['linkedPaymentAmount', amount],
    ['latestActivity', getLatestServiceActivity([...orders, ...appointments, ...payments])],
  ].map(([key, value]) => `
    <dt>${formatKey(key)}</dt>
    <dd>${escapeHtml(formatDetailValue(key, value))}</dd>
  `).join('');
  proof.innerHTML = renderServiceRecords(orders, appointments, payments);

  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeRecordModal() {
  const modal = document.getElementById('recordModal');
  if (!modal) return;

  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
}

function getVisibleDetailEntries(record) {
  return Object.entries(record).filter(([key, value]) => (
    !hiddenDetailFields.has(key)
    && value !== undefined
    && value !== null
    && value !== ''
  ));
}

function renderPaymentProof(record) {
  const screenshotData = String(record.screenshotData || '');
  if (screenshotData.length > 2000 && screenshotData.startsWith('data:image/')) {
    return `
      <section class="proof-panel">
        <div>
          <p class="eyebrow">Payment Proof</p>
          <h3>${escapeHtml(record.screenshotName || 'Uploaded Screenshot')}</h3>
        </div>
        <img src="${escapeHtml(record.screenshotData)}" alt="Payment proof screenshot" />
      </section>
    `;
  }

  return `
    <section class="proof-panel proof-panel-empty">
      <p class="eyebrow">Payment Proof</p>
      <h3>No screenshot preview available</h3>
      <p>${escapeHtml(record.screenshotName || record.reference || 'The payment proof image was not saved with this record.')}</p>
    </section>
  `;
}

function renderServiceRecords(orders, appointments, payments) {
  const rows = [
    ...orders.map(record => ['Order', record]),
    ...appointments.map(record => ['Appointment', record]),
    ...payments.map(record => ['Payment', record]),
  ].sort((a, b) => new Date(b[1].createdAt || 0) - new Date(a[1].createdAt || 0));

  if (!rows.length) {
    return '<section class="proof-panel proof-panel-empty"><h3>No linked service records yet</h3></section>';
  }

  return `
    <section class="linked-records">
      <p class="eyebrow">Linked Records</p>
      ${rows.map(([type, record]) => `
        <article>
          <strong>${escapeHtml(type)} - ${escapeHtml(record.name || record.requestId)}</strong>
          <span>${escapeHtml(getRecordSubtitle(type.toLowerCase() === 'payment' ? 'payments' : `${type.toLowerCase()}s`, record))}</span>
          <small>${formatDate(record.createdAt)} · ${formatStatus(record.status || 'new')}</small>
        </article>
      `).join('')}
    </section>
  `;
}

function getLatestServiceActivity(records) {
  const latest = records
    .map(record => record.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return latest || '-';
}

function getAllRecords() {
  return Object.entries(state.collections).flatMap(([collection, records]) => (
    records.map(record => ({ collection, record }))
  ));
}

function findRecord(collection, requestId) {
  return state.collections[collection]?.find(record => record.requestId === requestId);
}

function getRecordTitle(collection, record) {
  if (collection === 'payments') {
    return `${record.name || 'Payment'} - Rs.${Number(record.amount || 0).toFixed(2)}`;
  }

  return `${record.name || 'Customer'} - ${record.service || collectionConfig[collection].label}`;
}

function getRecordSubtitle(collection, record) {
  if (collection === 'orders') {
    return [record.phone, record.budget, record.details].filter(Boolean).join(' | ');
  }
  if (collection === 'appointments') {
    return [record.phone, record.date, record.time, record.location].filter(Boolean).join(' | ');
  }
  if (collection === 'payments') {
    return [record.phone, record.reference || record.screenshotName, record.purpose].filter(Boolean).join(' | ');
  }
  return [record.phone, record.message].filter(Boolean).join(' | ');
}

function defaultStatus(collection) {
  return collection === 'payments' ? 'pending_verification' : 'new';
}

function statusClass(status = '') {
  return `status-${String(status).replace(/_/g, '-')}`;
}

function formatStatus(status = '') {
  return String(status || 'new')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, letter => letter.toUpperCase());
}

function formatDetailValue(key, value) {
  if (key.toLowerCase().includes('date') || key === 'createdAt' || key === 'updatedAt') {
    return formatDate(value);
  }
  if (key.toLowerCase().includes('amount')) {
    return `Rs.${Number(value || 0).toFixed(2)}`;
  }
  if (key === 'status') {
    return formatStatus(value);
  }
  return String(value);
}

function setAdminStatus(message, options = {}) {
  window.clearTimeout(state.statusTimer);
  setText('adminStatus', message);

  if (!message) {
    return;
  }

  const isError = message.toLowerCase().includes('could not');
  const timeout = options.timeout ?? (isError ? 9000 : 2200);
  state.statusTimer = window.setTimeout(() => {
    setText('adminStatus', '');
  }, timeout);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

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

function saveNewPassword() {
  const input = document.getElementById('newPassword');
  const newPass = input.value;
  if (newPass.trim()) {
    localStorage.setItem('adminPassword', newPass);
    input.value = '';
    setAdminStatus('Password changed successfully.');
  }
}

function logoutAdmin() {
  const btn = document.querySelector('.logout-button');
  btn.innerText = 'Logging out...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  setTimeout(() => {
    localStorage.removeItem('adminLoggedIn');
    window.location.href = 'land.html';
  }, 500);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
