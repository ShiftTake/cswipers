const sgMail = require('@sendgrid/mail');
const { defineSecret } = require('firebase-functions/params');

const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
const sendgridFromEmail = defineSecret('SENDGRID_FROM_EMAIL');

function getRequiredValue(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function getSendgridApiKey() {
  return getRequiredValue(
    sendgridApiKey.value() || process.env.SENDGRID_API_KEY,
    'SENDGRID_API_KEY secret'
  );
}

function getFromEmail() {
  return getRequiredValue(
    sendgridFromEmail.value() || process.env.SENDGRID_FROM_EMAIL,
    'SENDGRID_FROM_EMAIL secret'
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function configureSendgrid() {
  sgMail.setApiKey(getSendgridApiKey());
}

async function sendEmail({ to, from, subject, title, body, text, html, actionUrl, actionLabel = 'View in CardSwipers' }) {
  const recipient = getRequiredValue(to, 'Recipient email');
  const emailSubject = getRequiredValue(subject, 'Email subject');
  const emailTitle = String(title || '').trim();
  const emailBody = String(body || '').trim();
  const safeActionUrl = String(actionUrl || '').trim();
  const safeActionLabel = escapeHtml(actionLabel);
  const plainText = String(text || `${emailTitle}\n\n${emailBody}`).trim();
  const htmlBody = String(html || `<h1>${escapeHtml(emailTitle)}</h1><p>${escapeHtml(emailBody).replace(/\n/g, '<br>')}</p>${safeActionUrl ? `<p><a href="${escapeHtml(safeActionUrl)}">${safeActionLabel}</a></p>` : ''}`).trim();
  if (!plainText) throw new Error('Email text or body is required.');

  configureSendgrid();

  const actionMarkup = safeActionUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(safeActionUrl)}" style="display:inline-block;padding:12px 18px;background:#e50914;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${safeActionLabel}</a></p>`
    : '';

  await sgMail.send({
    to: recipient,
    from: getRequiredValue(from || getFromEmail(), 'Sender email'),
    subject: emailSubject,
    text: plainText,
    html: htmlBody || `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b;max-width:600px"><h1 style="font-size:22px">${escapeHtml(emailTitle)}</h1><p>${escapeHtml(emailBody).replace(/\n/g, '<br>')}</p>${actionMarkup}<p style="font-size:12px;color:#71717a">CardSwipers</p></div>`
  });
}

async function sendTradeNotificationEmail({ to, subject, title, body, actionUrl }) {
  return sendEmail({ to, subject, title, body, actionUrl, actionLabel: 'Review Trade' });
}

async function sendShippingLabelEmail({ to, trackingNumber, pdfUrl }) {
  const tracking = getRequiredValue(trackingNumber, 'Tracking number');
  return sendEmail({
    to,
    subject: 'Your CardSwipers shipping label is ready',
    title: 'Shipping label ready',
    body: `Your shipping label is ready. Tracking number: ${tracking}`,
    actionUrl: pdfUrl,
    actionLabel: 'Open Shipping Label'
  });
}

async function sendEscrowReleaseEmail({ to, amount, transactionId }) {
  const transaction = getRequiredValue(transactionId, 'Transaction ID');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error('Escrow amount must be a non-negative number.');
  }
  return sendEmail({
    to,
    subject: 'Your CardSwipers escrow was released',
    title: 'Escrow released',
    body: `$${numericAmount.toFixed(2)} was released for transaction ${transaction}.`,
    actionUrl: process.env.APP_ORIGIN ? `${process.env.APP_ORIGIN.replace(/\/$/, '')}/wallet` : ''
  });
}

module.exports = {
  sendTradeNotificationEmail,
  sendShippingLabelEmail,
  sendEscrowReleaseEmail,
  sendEmail,
  sendgridApiKey,
  sendgridFromEmail
};
