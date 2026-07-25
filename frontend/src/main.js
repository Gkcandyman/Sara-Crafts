const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:5050' : '';
const LANDING_ENTRY_KEY = 'saraCraftsEnteredWebsite';
const LOADER_MIN_DURATION = 1300;
const PAYMENT_QR_IMAGE_SRC = 'assets/images/google-pay-qr.jpeg';
const loaderStartedAt = Date.now();

if (shouldReturnToLanding()) {
  window.location.replace('land.html');
}

window.addEventListener('load', () => {
  const remainingDelay = Math.max(0, LOADER_MIN_DURATION - (Date.now() - loaderStartedAt));
  window.setTimeout(() => {
    document.body.classList.add('loaded');
  }, remainingDelay);
});

const adminModal = document.getElementById('adminLoginModal');
const adminPass = localStorage.getItem('adminPassword') || 'saracrafts123';

document.addEventListener('DOMContentLoaded', () => {
  restoreTheme();
  setupScrollState();
  setupPaymentQrImage();
  setupBusinessForms();
  setupGooglePayQrForm();
  setupPaymentQrPopup();
  setupThankYouModal();
});

function shouldReturnToLanding() {
  const navigationEntry = performance.getEntriesByType('navigation')[0];
  const isReload = navigationEntry?.type === 'reload' || performance.navigation?.type === 1;

  if (isReload) {
    sessionStorage.removeItem(LANDING_ENTRY_KEY);
    return true;
  }

  if (window.location.hash) {
    sessionStorage.removeItem(LANDING_ENTRY_KEY);
    return false;
  }

  const hasLandingPass = sessionStorage.getItem(LANDING_ENTRY_KEY) === 'true';
  const cameFromLanding = (() => {
    if (!document.referrer) return false;

    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === window.location.origin
        && ['/', '/land.html', '/index.html'].includes(referrer.pathname);
    } catch (error) {
      return false;
    }
  })();

  sessionStorage.removeItem(LANDING_ENTRY_KEY);

  return !hasLandingPass && !cameFromLanding;
}

function setupScrollState() {
  const backToTopButton = document.getElementById('backToTop');
  const navLinks = document.querySelectorAll('.nav-link');

  function handleScroll() {
    const fromTop = window.scrollY + 120;
    backToTopButton.style.display = window.scrollY > 300 ? 'block' : 'none';

    navLinks.forEach(link => {
      const section = document.querySelector(link.getAttribute('href'));
      if (section && section.offsetTop <= fromTop && section.offsetTop + section.offsetHeight > fromTop) {
        navLinks.forEach(item => item.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', handleScroll);
  handleScroll();
}

function setupBusinessForms() {
  bindForm('orderForm', '/api/orders', 'orderStatus', 'Order request received. We will contact you shortly.', 'Order request');
  bindForm('appointmentForm', '/api/appointments', 'appointmentStatus', 'Appointment request received. We will confirm availability shortly.', 'Appointment request');
  bindForm('paymentForm', '/api/payments', 'paymentStatus', 'Payment received successfully. We will verify and update you shortly.', 'Payment');
  bindForm('enquiryForm', '/api/enquiries', 'enquiryStatus', 'Enquiry received. We will reply soon.', 'Enquiry');
}

function bindForm(formId, endpoint, statusId, successMessage, requestType) {
  const form = document.getElementById(formId);
  const status = document.getElementById(statusId);
  if (!form || !status) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.classList.remove('error');
    status.textContent = 'Submitting...';

    setSubmitState(form, true);

    try {
      const payload = await buildFormPayload(form, formId);
      payload.source = formId;

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || errorPayload.errors?.join(', ') || 'Request failed');
      }

      const result = await response.json();
      const referenceId = result.record?.requestId || result.record?.id || 'SC-NEW';

      form.reset();
      status.textContent = successMessage;
      showThankYou({
        requestType,
        referenceId,
        message: successMessage,
      });
    } catch (error) {
      status.classList.add('error');
      status.textContent = `Could not submit right now: ${error.message}. Please try again in a moment.`;
    } finally {
      setSubmitState(form, false);
    }
  });
}

async function buildFormPayload(form, formId) {
  const formData = new FormData(form);
  const payload = {};

  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) {
      payload[key] = value;
    }
  }

  if (formId === 'paymentForm') {
    const screenshot = formData.get('screenshot');

    if (!(screenshot instanceof File) || !screenshot.name) {
      throw new Error('Upload the payment screenshot before submitting proof');
    }

    if (!screenshot.type.startsWith('image/')) {
      throw new Error('Payment proof must be an image screenshot');
    }

    if (screenshot.size > 4 * 1024 * 1024) {
      throw new Error('Payment screenshot must be under 4 MB');
    }

    payload.screenshotName = screenshot.name;
    payload.screenshotType = screenshot.type;
    payload.screenshotData = await readFileAsDataUrl(screenshot);
  }

  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected screenshot'));
    reader.readAsDataURL(file);
  });
}

function setupPaymentQrImage() {
  const qrImage = document.getElementById('paymentQrImage');
  if (!qrImage) return;

  const updateImageState = () => {
    qrImage.dataset.loaded = qrImage.naturalWidth > 0 ? 'true' : 'false';
  };

  qrImage.addEventListener('load', () => {
    qrImage.dataset.loaded = 'true';
  });
  qrImage.addEventListener('error', () => {
    qrImage.dataset.loaded = 'false';
    qrImage.alt = 'Payment QR image is unavailable';
  });

  if (qrImage.getAttribute('src') !== PAYMENT_QR_IMAGE_SRC) {
    qrImage.src = PAYMENT_QR_IMAGE_SRC;
  }

  if (qrImage.complete) {
    updateImageState();
  }
}

function setupGooglePayQrForm() {
  const form = document.getElementById('googlePayQrForm');
  const status = document.getElementById('googlePayQrStatus');
  if (!form || !status) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.classList.remove('error');
    const payload = Object.fromEntries(new FormData(form).entries());

    if (!payload.name || String(payload.name).trim().length < 2) {
      status.classList.add('error');
      status.textContent = 'Enter the payer name before opening the QR.';
      return;
    }

    if (!payload.phone || String(payload.phone).replace(/\D/g, '').length < 10) {
      status.classList.add('error');
      status.textContent = 'Enter a valid phone number before opening the QR.';
      return;
    }

    if (!payload.amount || Number(payload.amount) <= 0) {
      status.classList.add('error');
      status.textContent = 'Enter a valid amount before opening the QR.';
      return;
    }

    showPaymentQrPopup(payload);
    status.textContent = 'QR opened. After paying, upload the payment screenshot below.';
  });
}

function showPaymentQrPopup(payload) {
  const popup = document.getElementById('paymentQrPopup');
  const amount = document.getElementById('popupPaymentAmount');
  const status = document.getElementById('googlePayQrStatus');
  const qrImage = document.getElementById('paymentQrImage');

  if (!popup || !amount) return;

  if (qrImage && qrImage.dataset.loaded === 'false') {
    if (status) {
      status.classList.add('error');
      status.textContent = 'Payment QR image is unavailable. Please use the UPI ID below.';
    }
    return;
  }

  amount.textContent = `Rs.${Number(payload.amount).toFixed(2)}`;
  popup.classList.add('is-visible');
  popup.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePaymentQrPopup() {
  const popup = document.getElementById('paymentQrPopup');
  if (!popup) return;

  popup.classList.remove('is-visible');
  popup.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function continueToPaymentProof() {
  const qrForm = document.getElementById('googlePayQrForm');
  const paymentForm = document.getElementById('paymentForm');
  const status = document.getElementById('googlePayQrStatus');

  if (qrForm && paymentForm) {
    const payload = Object.fromEntries(new FormData(qrForm).entries());
    ['name', 'phone', 'amount', 'purpose'].forEach(field => {
      const input = paymentForm.querySelector(`[name="${field}"]`);
      if (input && payload[field]) input.value = payload[field];
    });
  }

  closePaymentQrPopup();
  if (status) status.textContent = 'Now upload the payment screenshot below. No proof is saved until that form is submitted.';
  paymentForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    paymentForm?.querySelector('[name="screenshot"]')?.focus();
  }, 350);
}

function setupPaymentQrPopup() {
  const popup = document.getElementById('paymentQrPopup');
  if (!popup) return;

  popup.addEventListener('click', event => {
    if (event.target === popup) {
      closePaymentQrPopup();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && popup.classList.contains('is-visible')) {
      closePaymentQrPopup();
    }
  });
}

function setSubmitState(form, isSubmitting) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  submitButton.disabled = isSubmitting;
  submitButton.dataset.originalText = submitButton.dataset.originalText || submitButton.textContent;
  submitButton.textContent = isSubmitting ? 'Submitting...' : submitButton.dataset.originalText;
}

function selectService(service, target) {
  const sectionId = target === 'appointment' ? 'appointment' : 'order';
  const section = document.getElementById(sectionId);
  const select = section.querySelector('select[name="service"]');

  if (select) {
    select.value = service;
  }

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showThankYou({ requestType, referenceId, message }) {
  const modal = document.getElementById('thankYouModal');
  if (!modal) return;

  document.getElementById('thankYouTitle').textContent = requestType === 'Payment'
    ? 'Payment Received Successfully'
    : `${requestType} received`;
  document.getElementById('thankYouMessage').textContent = message;
  document.getElementById('thankYouRef').textContent = referenceId;
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
}

function closeThankYou() {
  const modal = document.getElementById('thankYouModal');
  if (!modal) return;

  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
}

function setupThankYouModal() {
  const modal = document.getElementById('thankYouModal');
  if (!modal) return;

  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeThankYou();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
      closeThankYou();
    }
  });
}

function openAdminLogin() {
  adminModal.classList.remove('hidden');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('adminLoginInput').value = '';
}

function closeAdminLogin() {
  adminModal.classList.add('hidden');
}

function submitAdminLogin() {
  const input = document.getElementById('adminLoginInput').value;
  if (input === adminPass) {
    localStorage.setItem('adminLoggedIn', 'true');
    window.location.href = 'admin.html';
  } else {
    document.getElementById('loginError').classList.remove('hidden');
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
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
  if (!btn) return;

  btn.innerText = document.body.classList.contains('dark') ? 'Sun' : 'Moon';
}
