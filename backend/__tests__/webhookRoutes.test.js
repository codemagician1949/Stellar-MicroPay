/**
 * #279 — webhook registration endpoints (auth-gated, own-account).
 */
"use strict";

// Avoid opening a real Horizon stream when a webhook is registered.
jest.mock("../src/services/stellarService", () => ({
  streamIncomingPayments: jest.fn(() => () => {}),
}));

const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../src/middleware/auth");
const webhookRoutes = require("../src/routes/webhooks");
const webhookService = require("../src/services/webhookService");

const ME = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA";

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/webhooks", webhookRoutes);
  return a;
}
const auth = () => `Bearer ${jwt.sign({ publicKey: ME }, JWT_SECRET, { expiresIn: "1h" })}`;

beforeEach(() => webhookService._reset());

describe("POST /api/webhooks (#279)", () => {
  it("requires authentication", async () => {
    const res = await request(app()).post("/api/webhooks").send({ url: "https://x.test/h", secret: "secret-123" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid url", async () => {
    const res = await request(app())
      .post("/api/webhooks")
      .set("Authorization", auth())
      .send({ url: "not-a-url", secret: "secret-123" });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short secret", async () => {
    const res = await request(app())
      .post("/api/webhooks")
      .set("Authorization", auth())
      .send({ url: "https://x.test/h", secret: "short" });
    expect(res.status).toBe(400);
  });

  it("registers a webhook for the authenticated account", async () => {
    const res = await request(app())
      .post("/api/webhooks")
      .set("Authorization", auth())
      .send({ url: "https://x.test/hook", secret: "supersecret" });
    expect(res.status).toBe(201);
    expect(res.body.account).toBe(ME);
    expect(res.body.url).toBe("https://x.test/hook");
    expect(res.body).not.toHaveProperty("secret");
  });
});

describe("GET/DELETE /api/webhooks (#279)", () => {
  it("lists only the caller's webhooks with secrets redacted", async () => {
    webhookService.registerWebhook({ account: ME, url: "https://x.test/mine", secret: "secret-mine" });
    webhookService.registerWebhook({ account: "GOTHER", url: "https://x.test/other", secret: "secret-other" });
    const res = await request(app()).get("/api/webhooks").set("Authorization", auth());
    expect(res.status).toBe(200);
    expect(res.body.webhooks).toHaveLength(1);
    expect(res.body.webhooks[0]).not.toHaveProperty("secret");
  });

  it("deletes the caller's own webhook", async () => {
    const wh = webhookService.registerWebhook({ account: ME, url: "https://x.test/d", secret: "secret-del" });
    const res = await request(app()).delete(`/api/webhooks/${wh.id}`).set("Authorization", auth());
    expect(res.status).toBe(204);
    expect(webhookService.getWebhook(wh.id)).toBeUndefined();
  });

  it("will not delete another account's webhook", async () => {
    const wh = webhookService.registerWebhook({ account: "GOTHER", url: "https://x.test/o", secret: "secret-oth" });
    const res = await request(app()).delete(`/api/webhooks/${wh.id}`).set("Authorization", auth());
    expect(res.status).toBe(404);
  });
});
