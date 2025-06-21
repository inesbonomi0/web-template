# Mercado Pago Integration Plan

_(White-Label Checkout API)_

_Last updated: 2025-06-21_

---

## 0 Overview

We are replacing the existing Stripe implementation in Sharetribe's web-template with Mercado Pago
**Checkout API (white-label)** so buyers complete payment inside the marketplace while funds are
split automatically between provider and platform.

Key objectives:

1. Associate each provider (seller) account with Mercado Pago via OAuth.
2. Display Mercado Pago's embedded card form when a buyer checks out.
3. Create, capture, refund and reconcile payments through Mercado Pago APIs and webhooks.
4. Remove all Stripe-specific code, env-vars and flows.

---

## 1 Environment & Configuration

| Variable              | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `MP_APP_ID`           | Mercado Pago application ID                   |
| `MP_APP_SECRET`       | Application secret (for OAuth token exchange) |
| `MP_WEBHOOK_SECRET`   | HMAC secret to verify webhook payloads        |
| `MP_PLATFORM_FEE_PCT` | Marketplace commission (percentage)           |
| _Other_               | Remove unused Stripe variables                |

Decide on a secure storage strategy (e.g. `.env`, CI secrets, Vercel project vars).

---

## 2 Phases & Task Breakdown

### Phase 1 — Provider Onboarding (OAuth)

- [ ] Add "Connect Mercado Pago" button in **ProfileSettingsPage**.
- [ ] Redirect provider to Mercado Pago OAuth (`/authorization`) with required scopes.
- [ ] Backend endpoint `/api/mp/oauth/callback`:
  - Validate `state`, exchange `code` → `access_token`, `public_key`, `refresh_token`.
  - Persist credentials in Sharetribe `protectedData` for the user.
  - Schedule token-refresh job.
- [ ] Prevent listing publication until MP is connected.

### Phase 2 — Customer Checkout

- [ ] Replace Stripe payment form with `<MercadoPagoCardForm>` in **CheckoutPage**.
- [ ] Initialise MercadoPago.js with the provider's `public_key`.
- [ ] Tokenise card → obtain `card_token`.
- [ ] POST to backend `/api/mp/charge` with `{ cardToken, transactionId }`.
- [ ] Backend creates payment via `POST /v1/payments` using provider `access_token` and sets
      `application_fee`.
- [ ] On `approved` → call Sharetribe privileged transition `confirm-payment`.
- [ ] Handle `pending/in_process` → mark pending transition.

### Phase 3 — Provider Accept / Reject

- [ ] Capture or void payments depending on transaction process (if authorisation + capture pattern
      is chosen).

### Phase 4 — Refunds

- [ ] Endpoint `/api/mp/refund` that calls `POST /v1/payments/{id}/refunds`.
- [ ] Trigger from custom Sharetribe transition.

### Phase 5 — Payouts & Reconciliation

- [ ] Rely on MP automatic split payout.
- [ ] Poll or receive webhook events to surface payout status in UI.

### Phase 6 — Webhooks

- [ ] Expose `/api/mp/webhook` and verify HMAC signature.
- [ ] Map `payment.updated` and `merchant_order.updated` to transaction state changes.
- [ ] Implement idempotent processing & retry strategy.

### Phase 7 — Admin & Support UI Enhancements

- [ ] Show provider MP connection status.
- [ ] Display `payment_id`, fee and payout timeline in TransactionPage.
- [ ] Manual refund button for admins.

### Phase 8 — Stripe-specific account pages

- [ ] Removed Stripe-specific account pages when Stripe key is absent
- [ ] Updated `showPaymentDetailsForUser` to hide Payout & Payment Methods tabs if no Stripe key.

---

## 3 Code Touchpoints Checklist

**Backend (server/)**

- `auth.js` – remove Stripe helpers.
- `api/` – add `mp/` directory with `oauth.js`, `charge.js`, `webhook.js`, `refund.js`.
- `apiRouter.js` – mount new MP routes.

**Frontend (src/)**

- Replace Stripe components with `MercadoPagoCardForm`.
- Update `CheckoutPage` flow.
- Add utility helpers in `util/payment.js`.
- Remove unused Stripe assets and configs.

---

## 4 Compliance Notes

Using MercadoPago.js keeps raw card data out of your servers → qualifies for PCI SAQ A. Ensure
HTTPS, do not log tokens or PII.

---

## 5 Testing Matrix

| Scenario                    | Expected Outcome                               |
| --------------------------- | ---------------------------------------------- |
| Provider connects via OAuth | Credentials saved, status shown as "Connected" |
| Buyer pays with test card   | Payment created, transaction confirmed         |
| Payment failure             | Error surfaced, transaction not confirmed      |
| Provider declines           | Payment voided/refunded                        |
| Admin refund                | Refund succeeds, transaction state updated     |
| Webhook duplicates          | Handled idempotently                           |

---

## 6 Progress Log

| Date       | Completed                                                                                                                     | Notes                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 2025-06-21 | ✅ Phase 1: Added backend OAuth callback endpoint (`server/api/mp/oauth-callback.js`) and registered route in `apiRouter.js`. | Created token exchange with MP and profile persistence.                                     |
| 2025-06-21 | ✅ Phase 1: Added front-end Mercado Pago connect workflow (ProfileSettingsPage)                                               | New component `MercadoPagoConnectSection` with OAuth popup & postMessage refresh            |
| 2025-06-21 | ✅ Removed Stripe-specific account pages when Stripe key is absent                                                            | Updated `showPaymentDetailsForUser` to hide Payout & Payment Methods tabs if no Stripe key. |
