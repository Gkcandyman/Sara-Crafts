const fs = require('fs');
const path = require('path');
const { getPool } = require('./config/database');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'frontend', 'public');
const srcDir = path.join(rootDir, 'frontend', 'src');
const dataDir = path.join(__dirname, 'data');

const collectionRoutes = {
  '/api/orders': {
    table: 'orders',
    file: 'orders.json',
    type: 'Order',
    insert: async payload => {
      const db = await getPool();
      const record = buildRecord(payload);
      await db.query(
        `INSERT INTO orders
          (request_id, name, phone, service, budget, needed_by, details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.requestId,
          record.name,
          record.phone,
          record.service,
          record.budget || null,
          record.neededBy || null,
          record.details || null,
          'new',
        ],
      );
      return record;
    },
    select: 'request_id AS requestId, name, phone, service, budget, needed_by AS neededBy, details, status, created_at AS createdAt',
  },
  '/api/appointments': {
    table: 'appointments',
    file: 'appointments.json',
    type: 'Appointment',
    insert: async payload => {
      const db = await getPool();
      const record = buildRecord(payload);
      await db.query(
        `INSERT INTO appointments
          (request_id, name, phone, service, preferred_date, preferred_time, location, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.requestId,
          record.name,
          record.phone,
          record.service,
          record.date || null,
          record.time || null,
          record.location || null,
          record.notes || null,
          'new',
        ],
      );
      return record;
    },
    select: 'request_id AS requestId, name, phone, service, preferred_date AS date, preferred_time AS time, location, notes, status, created_at AS createdAt',
  },
  '/api/enquiries': {
    table: 'enquiries',
    file: 'enquiries.json',
    type: 'Enquiry',
    insert: async payload => {
      const db = await getPool();
      const record = buildRecord(payload);
      await db.query(
        `INSERT INTO enquiries
          (request_id, name, phone, message, status)
         VALUES (?, ?, ?, ?, ?)`,
        [record.requestId, record.name, record.phone, record.message, 'new'],
      );
      return record;
    },
    select: 'request_id AS requestId, name, phone, message, status, created_at AS createdAt',
  },
  '/api/payments': {
    table: 'payments',
    file: 'payments.json',
    type: 'Payment',
    insert: async payload => {
      const db = await getPool();
      const record = buildRecord(payload);
      await db.query(
        `INSERT INTO payments
          (request_id, name, phone, amount, reference_id, purpose, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          record.requestId,
          record.name,
          record.phone,
          Number(record.amount || 0),
          record.reference,
          record.purpose || null,
          'pending_verification',
        ],
      );
      return record;
    },
    select: 'request_id AS requestId, name, phone, amount, reference_id AS reference, purpose, status, created_at AS createdAt',
  },
};

async function app(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (url.pathname === '/health') {
    const storage = await getStorageStatus();
    sendJson(res, 200, { status: 'ok', service: 'sara-crafts-backend', storage });
    return;
  }

  if (url.pathname === '/api/payments/upi-qr') {
    await handleCreateUpiQr(req, res);
    return;
  }

  if (collectionRoutes[url.pathname]) {
    await handleCollection(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
}

async function handleCreateUpiQr(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const upiId = process.env.CLIENT_UPI_ID || process.env.GOOGLE_PAY_UPI_ID || process.env.UPI_ID;
  const payeeName = process.env.CLIENT_PAYEE_NAME || process.env.PAYMENT_PAYEE_NAME || 'Sara Crafts';

  if (!upiId) {
    sendJson(res, 503, { error: 'Client UPI ID is not configured yet' });
    return;
  }

  const payload = sanitizePayload(JSON.parse((await readBody(req)) || '{}'));
  const errors = validateUpiPayment(payload);

  if (errors.length) {
    sendJson(res, 400, { errors });
    return;
  }

  const transactionRef = createId();
  const amount = Number(payload.amount).toFixed(2);
  const paymentUri = buildUpiPaymentUri({
    upiId,
    payeeName,
    amount,
    transactionRef,
    note: payload.purpose || 'Sara Crafts payment',
  });

  sendJson(res, 201, {
    upiId,
    payeeName,
    amount,
    currency: 'INR',
    transactionRef,
    paymentUri,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(paymentUri)}`,
  });
}

async function handleCollection(req, res, pathname) {
  const route = collectionRoutes[pathname];

  if (req.method === 'GET') {
    const rows = await readRecords(route);
    sendJson(res, 200, rows);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const payload = JSON.parse((await readBody(req)) || '{}');
  const errors = validatePayload(pathname, payload);

  if (errors.length) {
    sendJson(res, 400, { errors });
    return;
  }

  const record = await saveRecord(route, sanitizePayload(payload));
  const notification = await createNotification(route, record);
  sendJson(res, 201, { message: 'Saved successfully', record, notification });
}

async function saveRecord(route, payload) {
  if (isJsonStorage()) {
    const record = {
      ...buildRecord(payload),
      createdAt: new Date().toISOString(),
      status: route.table === 'payments' ? 'pending_verification' : 'new',
      storage: 'json',
    };
    const records = readJson(route.file);
    records.unshift(record);
    writeJson(route.file, records);
    return record;
  }

  try {
    const record = await route.insert(payload);
    return {
      ...record,
      createdAt: new Date().toISOString(),
      status: record.status || 'new',
      storage: 'mysql',
    };
  } catch (error) {
    console.warn(`MySQL save failed for ${route.table}; using JSON fallback: ${error.message}`);
    const record = {
      ...buildRecord(payload),
      createdAt: new Date().toISOString(),
      status: route.table === 'payments' ? 'pending_verification' : 'new',
      storage: 'json',
    };
    const records = readJson(route.file);
    records.unshift(record);
    writeJson(route.file, records);
    return record;
  }
}

async function readRecords(route) {
  if (isJsonStorage()) {
    return readJson(route.file);
  }

  try {
    const db = await getPool();
    const [rows] = await db.query(`SELECT ${route.select} FROM ${route.table} ORDER BY created_at DESC`);
    return mergeRecords(rows, readJson(route.file));
  } catch (error) {
    console.warn(`MySQL read failed for ${route.table}; using JSON fallback: ${error.message}`);
    return readJson(route.file);
  }
}

function mergeRecords(primaryRecords, fallbackRecords) {
  const seen = new Set();
  return [...primaryRecords, ...fallbackRecords]
    .filter(record => {
      const key = record.requestId || record.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function getStorageStatus() {
  if (isJsonStorage()) {
    return { primary: 'json', mysql: 'disabled', reason: 'STORAGE_DRIVER=json' };
  }

  try {
    await getPool();
    return { primary: 'mysql', fallback: 'json', mysql: 'connected' };
  } catch (error) {
    return { primary: 'json', fallback: 'json', mysql: 'unavailable', reason: error.message };
  }
}

function isJsonStorage() {
  return String(process.env.STORAGE_DRIVER || 'json').toLowerCase() === 'json';
}

async function createNotification(route, record) {
  const formatted = formatNotification(route, record);
  const notification = {
    id: createId(),
    requestId: record.requestId,
    type: route.type,
    createdAt: new Date().toISOString(),
    ownerEmail: process.env.OWNER_EMAIL || process.env.CLIENT_EMAIL || '',
    ownerWhatsApp: process.env.OWNER_WHATSAPP || process.env.CLIENT_WHATSAPP || '919791315227',
    emailStatus: process.env.OWNER_EMAIL || process.env.CLIENT_EMAIL ? 'ready_for_provider' : 'missing_email_config',
    whatsappStatus: process.env.WHATSAPP_ACCESS_TOKEN ? 'ready_for_provider' : 'missing_whatsapp_api_config',
    subject: `${route.type} received - ${record.requestId}`,
    message: formatted,
  };

  const notifications = readJson('notifications.json');
  notifications.unshift(notification);
  writeJson('notifications.json', notifications);
  return notification;
}

function formatNotification(route, record) {
  const lines = [
    `Sara Crafts ${route.type} Received`,
    `Reference: ${record.requestId}`,
    `Name: ${record.name || '-'}`,
    `Phone: ${record.phone || '-'}`,
  ];

  if (record.service) lines.push(`Service: ${record.service}`);
  if (record.budget) lines.push(`Budget: ${record.budget}`);
  if (record.neededBy) lines.push(`Needed By: ${record.neededBy}`);
  if (record.date) lines.push(`Preferred Date: ${record.date}`);
  if (record.time) lines.push(`Preferred Time: ${record.time}`);
  if (record.location) lines.push(`Location: ${record.location}`);
  if (record.amount) lines.push(`Amount: Rs.${record.amount}`);
  if (record.reference) lines.push(`Payment Reference: ${record.reference}`);
  if (record.purpose) lines.push(`Purpose: ${record.purpose}`);
  if (record.details) lines.push(`Details: ${record.details}`);
  if (record.notes) lines.push(`Notes: ${record.notes}`);
  if (record.message) lines.push(`Message: ${record.message}`);

  lines.push(`Submitted: ${record.createdAt || new Date().toISOString()}`);
  return lines.join('\n');
}

function readJson(fileName) {
  ensureDataDir();
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
}

function writeJson(fileName, records) {
  ensureDataDir();
  fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(records, null, 2));
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function validatePayload(pathname, payload) {
  const errors = [];

  if (!payload.name || String(payload.name).trim().length < 2) {
    errors.push('Name is required');
  }

  if (!payload.phone || String(payload.phone).replace(/\D/g, '').length < 10) {
    errors.push('Valid phone number is required');
  }

  if ((pathname === '/api/orders' || pathname === '/api/appointments') && !payload.service) {
    errors.push('Service is required');
  }

  if (pathname === '/api/enquiries' && !payload.message) {
    errors.push('Message is required');
  }

  if (pathname === '/api/payments') {
    if (!payload.amount || Number(payload.amount) <= 0) {
      errors.push('Valid payment amount is required');
    }
    if (!payload.reference) {
      errors.push('Payment reference is required');
    }
  }

  return errors;
}

function validateUpiPayment(payload) {
  const errors = [];

  if (!payload.name || String(payload.name).trim().length < 2) {
    errors.push('Name is required');
  }

  if (!payload.phone || String(payload.phone).replace(/\D/g, '').length < 10) {
    errors.push('Valid phone number is required');
  }

  if (!payload.amount || Number(payload.amount) <= 0) {
    errors.push('Valid payment amount is required');
  }

  return errors;
}

function buildUpiPaymentUri({ upiId, payeeName, amount, transactionRef, note }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount,
    cu: 'INR',
    tr: transactionRef,
    tn: note,
  });

  return `upi://pay?${params.toString()}`;
}

function sanitizePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim().slice(0, 1000) : value,
    ]),
  );
}

function buildRecord(payload) {
  return {
    requestId: createId(),
    ...payload,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let filePath;

  if (pathname === '/') {
    filePath = path.join(publicDir, 'land.html');
  } else if (pathname.startsWith('/src/')) {
    filePath = path.join(srcDir, pathname.replace('/src/', ''));
  } else {
    filePath = path.join(publicDir, decodeURIComponent(pathname));
  }

  const normalizedPath = path.normalize(filePath);
  const allowed = normalizedPath.startsWith(publicDir) || normalizedPath.startsWith(srcDir);

  if (!allowed || !fs.existsSync(normalizedPath) || fs.statSync(normalizedPath).isDirectory()) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  res.writeHead(200, { 'Content-Type': getContentType(normalizedPath) });
  fs.createReadStream(normalizedPath).pipe(res);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  return types[ext] || 'application/octet-stream';
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  if (statusCode !== 204) {
    res.end(JSON.stringify(payload));
  } else {
    res.end();
  }
}

function createId() {
  return `SC-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

module.exports = app;
