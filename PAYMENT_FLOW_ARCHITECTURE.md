# LuxerSuites Payment Flow Architecture

## Overview

This document describes the complete payment flow architecture for the LuxerSuites booking platform, including the transition from M-Pesa Daraja to Paystack (supporting both M-Pesa and Visa/Card), and from Smart Contracts (Web3) to NowPayments (Crypto/USDT).

---

## Current Payment Methods Supported

| Method | Backend Controller | Frontend Label | Payment Type |
|--------|-------------------|----------------|--------------|
| **M-Pesa** | `mpesaController.js` | `mpesa` | STK Push (Safaricom Daraja) |
| **Paystack (Card/Visa)** | `paystackController.js` | `visa` / `paystack` | Card payments via Paystack |
| **NowPayments (USDT/Crypto)** | `nowPaymentsController.js` | `nowpayments` | Crypto via NowPayments checkout |

---

## 1. M-Pesa Daraja → Paystack Transition

### Old Flow (M-Pesa Daraja Only)
```
Frontend → /api/payments/mpesa/initiate → STK Push → /api/payments/mpesa/callback → Booking created
```

### New Flow (Paystack - supports M-Pesa + Visa)
```
Frontend → /api/payments/paystack/init → Paystack Initializes Transaction → Redirect to Paystack Checkout
                                                                           ↓
                                                    User pays via Card OR M-Pesa on Paystack
                                                                           ↓
                                                    Paystack Webhook → /api/webhooks/paystack → Updates Booking
```

### Key Changes in `paystackController.js`

- Single endpoint `/api/payments/paystack/init` handles **both** deposit and balance payments
- `type` field in request body distinguishes: `"deposit"` or `"balance"`
- Paystack handles M-Pesa **and** Card payments on their checkout page
- Webhook at `/api/webhooks/paystack` processes `charge.success` events
- Stores `paystackDepositRef` and `paystackBalanceRef` on booking

### Frontend Integration (`booking.js`)

```javascript
// Line 1464-1524: handlePaystackPayment()
// Sends: backendBookingId, amount, type: 'deposit', email, unitId, startDate, endDate, totalPrice
// Redirects to: data.authorization_url
// Stores in localStorage: 'pendingPaystackBooking' for callback verification
```

---

## 2. Smart Contracts (Web3) → NowPayments Transition

### Old Flow (Smart Contracts)
- User connects MetaMask/wallet
- Direct blockchain transaction to smart contract
- Contract handles deposit/balance logic on-chain
- Complex: gas fees, network switching, contract deployment

### New Flow (NowPayments)
```
Frontend → /api/payments/nowpayments/create → NowPayments Creates Invoice → Redirect to NowPayments Checkout
                                                                                 ↓
                                                       User pays with USDT (TRC-20/ERC-20/etc)
                                                                                 ↓
                                                       NowPayments IPN → /api/payments/nowpayments/ipn → Updates Booking
```

### Key Changes in `nowPaymentsController.js`

- **No wallet connection needed** - user just pays on NowPayments hosted page
- Converts KES → USD using live exchange rate (fallback: 1 USD = 130 KES)
- Validates against NowPayments minimum amounts per crypto currency
- `createInvoice` handles both deposit (`paymentType: 'deposit'`) and balance (`paymentType: 'balance'`)
- IPN webhook verifies HMAC-SHA512 signature with sorted payload keys
- Stores: `nowInvoiceId`, `nowInvoiceUrl`, `nowPaymentStatus`, `walletAddress`, `cryptoAmount`, `cryptoCurrency`, `paymentNetwork`

### Frontend Integration (`app.js`, `booking.js`)

```javascript
// app.js: createNowPaymentsInvoice(), showNowPaymentsModal()
// booking.js: handleNowPaymentsPayment() - calls API, shows modal, redirects
// Deposit amount for NowPayments is HIGHER (KES 3000) to meet crypto minimums
```

---

## 3. Complete Booking & Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BOOKING CREATION FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER SELECTS DATES on booking.html
   → Calendar checks availability via /api/calendar/:unitId
   → Calculates nights, fullAmount, depositAmount, balanceAmount

2. USER SELECTS PAYMENT METHOD (pay-method-card)
   → Options: M-Pesa | Card (Paystack) | USDT (NowPayments)
   → Updates hidden <select id="paymentMethod"> value
   → Deposit amount varies: M-Pesa/Card=KES 250, NowPayments=KES 3000

3. USER CLICKS "Pay KES X"
   → createBooking() in booking.js validates KYC, dates, conflicts
   → Routes to payment handler based on paymentMethod:

   ┌─────────────┬──────────────────────────────────────────────────────┐
   │ M-Pesa      │ handleMpesaPayment() → /api/payments/mpesa/initiate  │
   │             │ → STK Push sent → Poll /status/:bookingId           │
   ├─────────────┼──────────────────────────────────────────────────────┤
   │ Paystack    │ handlePaystackPayment() → /api/payments/paystack/init│
   │ (Card/Visa) │ → Redirect to Paystack → Webhook updates booking    │
   ├─────────────┼──────────────────────────────────────────────────────┤
   │ NowPayments │ handleNowPaymentsPayment() → /api/payments/nowpay-  │
   │ (USDT)      │   ments/create → Redirect → IPN updates booking     │
   └─────────────┴──────────────────────────────────────────────────────┘

4. DEPOSIT CONFIRMED
   → Booking created with: depositPaid=true, balancePaid=false
   → paymentStatus='pending' (or 'confirmed' if full payment)
   → User sees success modal with booking details

5. BALANCE PAYMENT (at check-in or anytime before)
   → User clicks "Pay Balance" in my_booking.html or booking.html
   → balance-payment.js opens modal with SAME payment method as deposit
   → Calls appropriate balance endpoint:
      - M-Pesa: /api/payments/mpesa/balance
      - Paystack: /api/payments/paystack/init (type: 'balance')
      - NowPayments: /api/payments/nowpayments/balance
   → On success: balancePaid=true, paymentStatus='confirmed', accessCode generated
```

---

## 4. Two-Phase Payment Data Model (Booking.js)

```javascript
// Key fields for two-phase payments:
depositPaid: Boolean,        // Has deposit been paid?
depositAmount: Number,       // Deposit amount (KES)
depositTxHash: String,       // Transaction reference (M-Pesa receipt / Paystack ref / NowPayments payment_id)
depositPaidAt: Date,

balancePaid: Boolean,        // Has balance been paid?
balanceAmount: Number,       // Remaining balance (KES)
balanceTxHash: String,       // Balance transaction reference
balancePaidAt: Date,

paymentMethod: String,       // 'mpesa' | 'visa' | 'nowpayments' | 'paystack'
paymentStatus: String,       // 'pending' | 'confirmed' | 'cancelled' | etc.

// Payment-specific refs:
mpesaReceiptNumber: String,
paystackDepositRef: String,
paystackBalanceRef: String,
nowInvoiceId: String,
nowPaymentId: String,
walletAddress: String,       // Crypto wallet address from NowPayments
```

---

## 5. Webhook Endpoints Summary

| Provider | Webhook URL | Handler |
|----------|-------------|---------|
| **M-Pesa (Daraja)** | `/api/payments/mpesa/callback` | `mpesaController.darajaCallback` |
| **Paystack** | `/api/webhooks/paystack` | `paystackController.handlePaystackWebhook` |
| **NowPayments** | `/api/payments/nowpayments/ipn` | `nowPaymentsController.handleIPN` |
| **Legacy M-Pesa/Visa** | `/api/webhooks/mpesa`, `/api/webhooks/visa` | `webhookRoutes.js` (older implementation) |

---

## 6. Key Implementation Details for New App

### Environment Variables Needed

```env
# Paystack
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_WEBHOOK_SECRET=whsec_xxx

# M-Pesa (Daraja)
DARAJA_CONSUMER_KEY=xxx
DARAJA_CONSUMER_SECRET=xxx
DARAJA_SHORTCODE=174379
DARAJA_PASSKEY=xxx
DARAJA_BASE_URL=https://sandbox.safaricom.co.ke
MPESA_CALLBACK_URL=https://yourdomain.com/api/payments/mpesa/callback

# NowPayments
NOWPAYMENTS_API_KEY=xxx
NOWPAYMENTS_IPN_SECRET=xxx
NOWPAYMENTS_SANDBOX=true
NOWPAYMENTS_PAY_CURRENCY=usdttrc20  # Optional: lock to specific crypto
NOWPAYMENTS_MIN_KES=500
KES_TO_USD_FALLBACK=0.00769

# General
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
MONGO_URI=mongodb://...
```

### Frontend Payment Method Selection

```html
<!-- booking.html - Pay Method Cards -->
<div class="pay-method-grid">
  <label class="pay-method-card active" data-method="paystack">
    <img src="img/logo/mpesa-icon.png" alt="M-Pesa">
    <span>M-Pesa</span>
  </label>
  <label class="pay-method-card" data-method="visa">
    <img src="img/logo/visa-icon.png" alt="Visa">
    <span>Card</span>
  </label>
  <label class="pay-method-card" data-method="nowpayments">
    <img src="img/logo/usdt-icon.svg" alt="USDT">
    <span>USDT</span>
  </label>
</div>
<!-- Hidden select for form submission -->
<select id="paymentMethod" style="display:none;">
  <option value="paystack" selected>M-Pesa</option>
  <option value="visa">Card</option>
  <option value="nowpayments">USDT (NowPayments)</option>
</select>
```

### Critical: Webhook Body Parsing (server.js)

```javascript
// MUST come BEFORE bodyParser.json()
app.use("/api/webhooks/paystack", express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.post("/api/payments/nowpayments/ipn", express.json()); // For HMAC verification
```

### Balance Payment Reusability

The `balance-payment.js` is a **self-contained module** that can be dropped into any page:

```javascript
import { openBalancePayment } from './js/balance-payment.js';

// Call with booking object from your bookings list
openBalancePayment(booking);
// booking must have: bookingId, unitId, paymentMethod, balanceAmount, guestPhone, depositPaid, balancePaid
```

---

## 7. Migration Checklist (Old → New)

| Component | Old (Smart Contracts) | New (Paystack + NowPayments) |
|-----------|----------------------|------------------------------|
| **Crypto Payments** | Direct Web3 tx to contract | NowPayments hosted checkout |
| **Card Payments** | Not supported | Paystack (Visa/Mastercard) |
| **M-Pesa** | Direct Daraja STK Push | Paystack (M-Pesa) OR Direct Daraja |
| **Deposit/Balance** | Contract logic | Backend-controlled, two-phase |
| **Webhooks** | Contract events | Paystack IPN / NowPayments IPN / Daraja Callback |
| **KYC** | On-chain verification | Backend KYC (Didit) before balance payment |
| **Access Codes** | Contract-generated | Backend-generated (6-digit) |

---

## 8. Testing Endpoints

```bash
# Test Paystack init
curl -X POST https://api.yourdomain.com/api/payments/paystack/init \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"backendBookingId":"test-123","amount":250,"type":"deposit","email":"test@test.com","unitId":"...","startDate":"2025-01-15","endDate":"2025-01-17","totalPrice":5000}'

# Test M-Pesa initiate
curl -X POST https://api.yourdomain.com/api/payments/mpesa/initiate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"...","startDate":"2025-01-15","endDate":"2025-01-17","totalPrice":5000,"paymentType":"DEPOSIT","guestPhone":"+254712345678"}'

# Test NowPayments create
curl -X POST https://api.yourdomain.com/api/payments/nowpayments/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"unitId":"...","startDate":"2025-01-15","endDate":"2025-01-17","guestPhone":"+254712345678","amount":3000,"paymentType":"deposit"}'
```

---

## File Structure Reference

### Backend Controllers
```
luxersuites-backend/
├── controllers/
│   ├── mpesaController.js      # M-Pesa Daraja STK Push
│   ├── paystackController.js   # Paystack (Card + M-Pesa)
│   └── nowPaymentsController.js # NowPayments (USDT/Crypto)
├── routes/
│   ├── mpesaRoutes.js
│   ├── paystackRoutes.js
│   ├── nowPaymentsRoutes.js
│   └── webhookRoutes.js        # Legacy M-Pesa/Visa webhooks
└── models/
    ├── Booking.js              # Unified booking model
    └── MpesaPendingBooking.js  # Pending M-Pesa transactions
```

### Frontend Modules
```
luxersuites-frontend/
├── js/
│   ├── booking.js              # Main booking flow
│   ├── balance-payment.js      # Reusable balance payment modal
│   ├── app.js                  # NowPayments utilities
│   └── my_booking.js           # User bookings dashboard
├── booking.html                # Booking page with payment method cards
└── css/
    └── booking2.css            # Payment method card styles
```

---

## Architecture Benefits

1. **Unified Booking Model** - Single `Booking` collection tracks all payment methods
2. **Two-Phase Payments** - Deposit → Balance flow works identically across all providers
3. **Provider Abstraction** - Frontend routes to correct handler based on `paymentMethod` field
4. **Webhook Reliability** - Each provider has dedicated webhook with signature verification
5. **Fallback Support** - Direct M-Pesa Daraja still available alongside Paystack M-Pesa
6. **KYC Integration** - Balance payments require approved KYC (enforced server-side)
7. **Access Codes** - Generated on full payment confirmation, sent via SMS/email

---

This architecture provides **three payment rails** with a **unified two-phase booking model** (deposit → balance), all tracked in a single `Booking` collection with payment-method-specific fields. The frontend dynamically routes to the correct handler based on the `paymentMethod` stored on the booking.