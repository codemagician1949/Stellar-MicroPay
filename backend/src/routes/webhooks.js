/**
 * src/routes/webhooks.js
 * Webhook registration endpoints (#279). All routes require a SEP-10 JWT and
 * operate only on the authenticated account.
 */
"use strict";

const express = require("express");
const router = express.Router();
const { strictLimiter } = require("../middleware/rateLimit");
const { verifyJWT } = require("../middleware/auth");
const webhookService = require("../services/webhookService");

const URL_RE = /^https?:\/\/.+/i;

// POST /api/webhooks — register a webhook URL + secret for the caller's account.
router.post("/", strictLimiter, verifyJWT, (req, res) => {
  const { url, secret } = req.body || {};
  if (typeof url !== "string" || !URL_RE.test(url)) {
    return res.status(400).json({ error: "A valid http(s) url is required" });
  }
  if (typeof secret !== "string" || secret.length < 8) {
    return res.status(400).json({ error: "A secret of at least 8 characters is required" });
  }

  const record = webhookService.registerWebhook({ account: req.user.publicKey, url, secret });
  // Begin watching this account's incoming payments on Horizon.
  webhookService.ensureWatching(req.user.publicKey);

  res.status(201).json({
    id: record.id,
    account: record.account,
    url: record.url,
    createdAt: record.createdAt,
  });
});

// GET /api/webhooks — list the caller's webhooks (secrets redacted).
router.get("/", strictLimiter, verifyJWT, (req, res) => {
  res.json({ webhooks: webhookService.listWebhooks(req.user.publicKey) });
});

// DELETE /api/webhooks/:id — remove one of the caller's webhooks.
router.delete("/:id", strictLimiter, verifyJWT, (req, res) => {
  const existing = webhookService.getWebhook(req.params.id);
  if (!existing || existing.account !== req.user.publicKey) {
    return res.status(404).json({ error: "Webhook not found" });
  }
  webhookService.removeWebhook(req.params.id);
  res.status(204).end();
});

module.exports = router;
