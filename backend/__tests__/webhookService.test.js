/**
 * #279 — webhook registry + signed delivery.
 */
"use strict";

const webhookService = require("../src/services/webhookService");
const { verifyWebhookSignature } = require("../src/utils/webhookSignature");

const ACCOUNT = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA";

beforeEach(() => webhookService._reset());

describe("webhook registry", () => {
  it("registers and lists webhooks without exposing the secret", () => {
    webhookService.registerWebhook({ account: ACCOUNT, url: "https://x.test/hook", secret: "supersecret" });
    const list = webhookService.listWebhooks(ACCOUNT);
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe("https://x.test/hook");
    expect(list[0]).not.toHaveProperty("secret");
  });

  it("scopes listing to the account and supports removal", () => {
    const a = webhookService.registerWebhook({ account: ACCOUNT, url: "https://x.test/a", secret: "secret-aaa" });
    webhookService.registerWebhook({ account: "GOTHER", url: "https://x.test/b", secret: "secret-bbb" });
    expect(webhookService.listWebhooks(ACCOUNT)).toHaveLength(1);
    expect(webhookService.removeWebhook(a.id)).toBe(true);
    expect(webhookService.listWebhooks(ACCOUNT)).toHaveLength(0);
  });
});

describe("signed delivery", () => {
  it("POSTs the payload with a verifiable HMAC signature header", async () => {
    const wh = { url: "https://x.test/hook", secret: "supersecret" };
    const payload = { type: "payment.received", amount: "10" };
    const client = { post: jest.fn().mockResolvedValue({ status: 200 }) };

    await webhookService.deliverWebhook(wh, payload, { client });

    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, sentPayload, opts] = client.post.mock.calls[0];
    expect(url).toBe(wh.url);
    expect(sentPayload).toEqual(payload);
    const sig = opts.headers["X-Webhook-Signature"];
    expect(verifyWebhookSignature(JSON.stringify(payload), wh.secret, sig)).toBe(true);
  });

  it("delivers an incoming payment to every webhook for the account", async () => {
    webhookService.registerWebhook({ account: ACCOUNT, url: "https://x.test/1", secret: "secret-111" });
    webhookService.registerWebhook({ account: ACCOUNT, url: "https://x.test/2", secret: "secret-222" });
    const client = { post: jest.fn().mockResolvedValue({ status: 200 }) };

    await webhookService.notifyIncomingPayment(ACCOUNT, { id: "p1", amount: "5" }, { client });

    expect(client.post).toHaveBeenCalledTimes(2);
  });
});
