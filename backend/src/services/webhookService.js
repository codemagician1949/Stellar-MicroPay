/**
 * src/services/webhookService.js
 * Webhook registry + delivery for incoming-payment notifications (#279).
 *
 * Users register a URL + secret for their account; when an incoming payment is
 * detected on Horizon, a JSON payload signed with HMAC-SHA256 is POSTed to the
 * URL so the receiver can verify authenticity.
 *
 * Registry is in-memory (single-process). Swap for a persistent store when the
 * backend is horizontally scaled.
 */
"use strict";

const crypto = require("crypto");
const axios = require("axios");
const { generateWebhookSignature } = require("../utils/webhookSignature");
const logger = require("../utils/logger");

const webhooks = new Map(); // id -> { id, account, url, secret, createdAt }
const watchedAccounts = new Map(); // account -> stream close handle

function registerWebhook({ account, url, secret }) {
  const id = crypto.randomUUID();
  const record = { id, account, url, secret, createdAt: new Date().toISOString() };
  webhooks.set(id, record);
  return record;
}

/** Webhooks for an account, with secrets stripped — safe to return to clients. */
function listWebhooks(account) {
  return [...webhooks.values()]
    .filter((w) => !account || w.account === account)
    .map(({ secret, ...safe }) => safe);
}

function getWebhook(id) {
  return webhooks.get(id);
}

function removeWebhook(id) {
  return webhooks.delete(id);
}

/** Test helper — reset registry and watcher state. */
function _reset() {
  webhooks.clear();
  watchedAccounts.clear();
}

/** POST a signed payload to a single webhook. `client` is injectable for tests. */
async function deliverWebhook(webhook, payload, { client = axios } = {}) {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, webhook.secret);
  return client.post(webhook.url, payload, {
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
    },
    timeout: 5000,
  });
}

/** Deliver an incoming-payment event to every webhook registered for `account`. */
async function notifyIncomingPayment(account, payment, opts = {}) {
  const targets = [...webhooks.values()].filter((w) => w.account === account);
  await Promise.all(
    targets.map((w) =>
      deliverWebhook(w, { type: "payment.received", account, payment }, opts).catch((err) =>
        logger.error({ err: err.message, webhookId: w.id }, "webhook delivery failed"),
      ),
    ),
  );
}

/**
 * Ensure a Horizon payment stream is running for `account` (idempotent). Lazily
 * requires stellarService so this module stays unit-testable without Horizon.
 */
function ensureWatching(account) {
  if (watchedAccounts.has(account)) return;
  // eslint-disable-next-line global-require
  const stellarService = require("./stellarService");
  if (typeof stellarService.streamIncomingPayments !== "function") return;
  const close = stellarService.streamIncomingPayments(account, (payment) =>
    notifyIncomingPayment(account, payment),
  );
  watchedAccounts.set(account, close || (() => {}));
}

module.exports = {
  registerWebhook,
  listWebhooks,
  getWebhook,
  removeWebhook,
  deliverWebhook,
  notifyIncomingPayment,
  ensureWatching,
  _reset,
};
