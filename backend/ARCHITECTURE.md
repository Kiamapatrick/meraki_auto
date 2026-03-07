# Meraki Auto Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Client)                         │
│  Web App / Mobile App (Vue/React/etc)                           │
└────────────────┬──────────────────────────────────────────────┘
                 │ HTTP/HTTPS Requests
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS API SERVER                         │
│                  (routes/*.js + controllers/)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Routes:                                                          │
│  ├─ POST /vehicles ...................... Create vehicle         │
│  ├─ GET /vehicles ....................... List vehicles          │
│  ├─ PUT /vehicles/:id ................... Update vehicle         │
│  ├─ DELETE /vehicles/:id ................ Delete vehicle         │
│  │                                                                │
│  ├─ POST /bookings ...................... Create rental           │
│  ├─ GET /bookings/my .................... My rentals             │
│  ├─ GET /bookings/vehicle/:vehicleId ... Vehicle bookings       │
│  ├─ POST /bookings/mpesa/initiate ...... M-Pesa deposit         │
│  ├─ POST /bookings/mpesa/callback ...... Safaricom callback    │
│  ├─ POST /bookings/mpesa/confirm-balance M-Pesa balance        │
│  ├─ POST /bookings/confirm-crypto ...... Crypto deposit        │
│  ├─ POST /bookings/confirm-balance .... Crypto balance        │
│  ├─ POST /bookings/cancel/:id .......... Cancel rental         │
│  │                                                                │
│  ├─ POST /reviews ....................... Submit review           │
│  ├─ GET /reviews/:vehicleId ............ Vehicle reviews        │
│  │                                                                │
│  ├─ POST /auth/register ................. New user               │
│  ├─ POST /auth/login .................... User login             │
│  ├─ POST /auth/verify-otp .............. 2FA verification       │
│  └─ POST /auth/reset-password .......... Password reset         │
│                                                                   │
│  Middleware:                                                      │
│  ├─ authMiddleware.js .................. JWT verification       │
│  ├─ CORS handling ....................... Cross-origin requests  │
│  └─ Error handling ....................... Error responses       │
│                                                                   │
└────────┬───────────────────────────────┬────────────────────────┘
         │                               │
         ▼                               ▼
┌──────────────────────┐      ┌──────────────────────────────────┐
│   MONGODB DATABASE   │      │   EXTERNAL SERVICES              │
│   (meraki_auto)      │      └──────────────────────────────────┘
├──────────────────────┤
│ Collections:         │      ┌─ M-PESA (Safaricom)
│ ├─ users            │      │  ├─ Daraja API (OAuth)
│ ├─ vehicles (NEW)   │      │  ├─ STK Push for payment
│ ├─ bookings         │      │  └─ Callback webhooks
│ ├─ reviews          │      │
│ ├─ reservations     │      ├─ PAYSTACK
│ ├─ mpesapending...  │      │  ├─ Payment initialization
│ ├─ sessions         │      │  └─ Payment verification
│ └─ ...other        │      │
└──────────────────────┘      ├─ RESEND (Email Service)
                              │  ├─ Verification emails
                              │  ├─ Password reset
                              │  └─ KYC notifications
                              │
                              ├─ AFRICA'S TALKING (SMS)
                              │  ├─ Access codes
                              │  ├─ Reminders
                              │  └─ Notifications
                              │
                              └─ BLOCKCHAIN (Crypto)
                                 ├─ Transaction verification
                                 └─ Smart contract calls
```

## Data Flow Diagram - Vehicle Rental Booking

```
RENTER                          BACKEND                         OWNER/ADMIN
   │                               │                               │
   │  1. Browse vehicles          │                               │
   ├──────────────────────────────>│                               │
   │    GET /vehicles              │                               │
   │                               │  Query vehicles from DB       │
   │                               ├──────────────────────────────>│
   │                               │  (show vehicle details)       │
   │  2. Create booking            │                               │
   ├──────────────────────────────>│                               │
   │    POST /bookings             │                               │
   │    {vehicleId, startDate,    │                               │
   │     endDate, renterPhone}    │                               │
   │                               │  Validate dates               │
   │                               │  Create booking record        │
   │                               ├──────────────────────────────>│
   │  3. Initiate M-Pesa Payment   │  (notify owner)               │
   ├──────────────────────────────>│                               │
   │    POST /bookings/mpesa/      │                               │
   │    initiate                   │                               │
   │                               │  Generate STK prompt          │
   │                               ├──────────────────────────────>│
   │                               │  M-PESA STK PUSH              │
   │  4. Enter M-Pesa PIN          │                               │
   │                               │                               │
   │  5. M-Pesa Sends Callback      │                               │
   │                               │<──────────────────────────────┤
   │                               │  Safaricom confirms payment   │
   │                               │  Update booking status        │
   │  6. SMS Access Code Sent      │  Generate access code        │
   ├──────────────────────────────>│                               │
   │    (via Africa's Talking)     │  Send SMS to renterPhone      │
   │    "Access code: 123456"      │                               │
   │                               │  Notify owner                 │
   │  7. Pick up vehicle           │                               │
   │                               ├──────────────────────────────>│
   │                               │  Match booking dates         │
   │                               │  (rental begins)             │
   │                               │                               │
   │  8. Rental active             │  Cron job monitors           │
   │     (vehicle in use)          │  Start date reached          │
   │                               │                               │
   │  9. Return vehicle            │                               │
   │     (rental ends)             │  End date reached            │
   │                               │  Escrow released             │
   │  10. Leave review             │                               │
   ├──────────────────────────────>│                               │
   │     POST /reviews             │  Update vehicle rating        │
   │     {vehicleId, rating,      │                               │
   │      comment}                 │  Notify owner                 │
   │                               ├──────────────────────────────>│
   │                               │                               │
```

## Booking State Machine

```
┌─────────────┐
│   PENDING   │  Booking created, awaiting payment
└──────┬──────┘
       │
       │ Payment initiated
       ▼
┌─────────────────────┐
│  AWAITING_PAYMENT  │  M-Pesa/Paystack STK, user enters PIN
└──────┬──────────────┘
       │
       │ Deposit paid
       ▼
┌─────────────┐
│  CONFIRMED  │  Deposit confirmed, balance due
└──────┬──────┘
       │
       ├─ If full payment upfront:
       │  Balance already paid on creation
       │
       ├─ If two-phase payment:
       │  Balance payment required before/during rental
       │
       ▼
┌─────────────┐
│   ACTIVE    │  Rental period ongoing
└──────┬──────┘
       │
       │ End date reached
       ▼
┌─────────────┐
│ COMPLETED   │  Rental finished, escrow released to owner
└─────────────┘

CANCELLATION PATH:
┌──────────────────────────────────────┐
│ If cancelled within 24 hours:        │
│ • Refund full amount                 │
│ • Status: CANCELLED                  │
│ • Send refund SMS                    │
└──────────────────────────────────────┘
```

## Database Schema Relationship Diagram

```
┌──────────────────┐
│     USERS        │
├──────────────────┤
│ _id (ObjectId)   │
│ email            │
│ phone            │
│ name             │
│ role (admin|user)│
│ kycStatus        │
│ createdAt        │
└────────┬─────────┘
         │
         │ owns  ╔══════════════════════════════════╗
         └─────>║      VEHICLES (NEW)              ║
                ║══════════════════════════════════║
    ╔───────────┬─────┐
    │           | ownerId (ref User)
    │           | name
    │ has many  | description
    │ ┌─────────┼────────────────────┐
    │ │         | dailyPrice         │
    │ │         | category           │
    ▼ ▼         | features []        │
┌──────────────────┐ │         | transmission
│    BOOKINGS      │ │         | fuelType
├──────────────────┤ │         | location
│ _id              │ │         | city
│ vehicleId (────┼─┘          | area
│ userId (──┐    │            | status
│ startDate │    │            └────────────┐
│ endDate   │    │                         │
│ renterPhone   │                         │
│ totalPrice    │  ┌────────────────────┐ │
│ nights        │  │     REVIEWS        │ │
│ paymentMethod │  ├────────────────────┤ │
│ paymentStatus │  │ _id                │ │
│ depositPaid   │  │ vehicleId ────────────┘
│ balancePaid   │  │ userId (────┐
│ accessCode    │  │ rating      │
│ createdAt     │  │ comment     │
└┬──────────────┘  │ createdAt   │
 │                 └────────────┘│
 │                               │
 ▼                               │
┌──────────────────┐             │
│   RESERVATIONS   │<────────────┘
├──────────────────┤
│ _id              │
│ vehicleId        │
│ startDate        │
│ endDate          │
│ status           │
└──────────────────┘
```

## Cron Job Scheduling Diagram

```
NODE-CRON SCHEDULER
│
├─ checkInScheduler.js
│  ├─ Runs: Daily at 10:00 AM
│  ├─ Task: Query bookings starting in 24 hours
│  ├─ Action: Trigger checkInNotifier
│  └─ Result: SMS sent to renters
│
├─ checkInNotifier.js
│  ├─ Runs: Scheduled by checkInScheduler
│  ├─ Task: Find rentals starting in next 24 hours
│  ├─ Action: 
│  │  1. Populate vehicleId (get vehicle details)
│  │  2. Populate userId (get renter name)
│  │  3. Prepare SMS message
│  │  4. Send SMS to renterPhone via Africa's Talking
│  └─ Result: SMS delivered to renter phone
│
└─ Other potential jobs:
   ├─ Daily balance reconciliation
   ├─ Weekly owner payouts
   ├─ Monthly revenue reports
   └─ Cleanup of expired access codes
```

## Payment Processing Flow Diagram

```
PAYMENT FLOWS (All preserved from original)

M-PESA FLOW:
┌──────────────────────────────────────┐
│ 1. Backend gets Daraja access token  │
│    (OAuth2 M-Pesa Daraja API)        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. STK Push initiated                │
│    - Amount: deposit or balance      │
│    - Phone: renterPhone              │
│    - Till number: Meraki Auto ID     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. User sees STK on phone            │
│    Enters M-Pesa PIN                 │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 4. Safaricom processes payment       │
│    Sends callback to webhook        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 5. Backend webhook handler:          │
│    - Update booking status           │
│    - Create access code             │
│    - Send SMS with code             │
│    - Calculate commission            │
│    - Create escrow entry            │
└──────────────────────────────────────┘

PAYSTACK FLOW:
┌──────────────────────────────────────┐
│ 1. Frontend initializes Paystack      │
│    - Amount, email, booking ID       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. User completes payment on website │
│    Card details tokenized at Paystack│
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. Backend verifies payment          │
│    Query Paystack API with ref       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 4. Backend updates booking           │
│    (Same as M-Pesa - create code,   │
│     send SMS, escrow, etc)          │
└──────────────────────────────────────┘

CRYPTO FLOW:
┌──────────────────────────────────────┐
│ 1. Frontend initiates smart contract  │
│    - Transfer deposit to escrow       │
│    - Wallet address sent to backend   │
│    - Transaction hash provided        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. Backend confirms blockchain data  │
│    - Verify transaction on chain      │
│    - Verify amount matches           │
│    - Create blockchainBookingId      │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. Backend creates booking           │
│    (Same as fiat - code, SMS, etc)   │
│    But stores blockchain ref         │
└──────────────────────────────────────┘
```

## Security Architecture

```
AUTHENTICATION LAYER
        │
        ▼
┌─────────────────────────────────┐
│  User Credentials (email/phone) │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Password Hash (bcrypt)         │
│  Stored securely in DB          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  2-Factor Authentication (OTP)  │
│  SMS sent to registered phone   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  JWT Token Generated            │
│  Signed with JWT_SECRET         │
│  Includes user ID, role         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Authorization Middleware       │
│  Verifies JWT on each request   │
│  Checks user role (admin/user)  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Route Handler Execution        │
│  Only authenticated users pass  │
└─────────────────────────────────┘
```

## Key Components Interaction

```
1. VEHICLE OWNERS
   ├─ Create vehicles at POST /vehicles
   │  ├─ Set dailyPrice
   │  ├─ Set category (premium/everyday/matatu/bus)
   │  ├─ Add features
   │  └─ Submit for admin approval
   │
   ├─ View bookings for their vehicles
   │  └─ GET /bookings/vehicle/:vehicleId
   │
   └─ Receive payouts after rental completion
      └─ Automatic escrow release

2. RENTERS
   ├─ Browse available vehicles
   │  └─ GET /vehicles with filters
   │
   ├─ Create booking
   │  ├─ Select vehicle, dates
   │  ├─ Provide renterPhone
   │  └─ Choose payment method
   │
   ├─ Complete payment
   │  ├─ M-Pesa STK prompt
   │  ├─ Paystack web checkout
   │  └─ Blockchain transaction
   │
   ├─ Receive access code
   │  └─ SMS sent after deposit confirmed
   │
   ├─ Pick up vehicle
   │  └─ Use access code
   │
   └─ Leave review after rental
      └─ Rate and comment on vehicle

3. ADMIN/PLATFORM
   ├─ Approve vehicles (change status)
   │  └─ POST /admin/vehicles/:id/approve
   │
   ├─ Process KYC verification
   │  ├─ Review documents
   │  └─ Send approval/rejection email
   │
   ├─ Handle disputes
   │  ├─ Review booking details
   │  ├─ Issue refunds
   │  └─ Freeze accounts if needed
   │
   └─ Monitor system health
      ├─ Payment processing
      ├─ Escrow balances
      └─ System performance
```

## Scalability Architecture

```
SCALABLE COMPONENTS (Preserved from original):

1. MULTI-OWNER SYSTEM
   ├─ Each vehicle has ownerId
   ├─ Owners operate independently
   ├─ No single owner bottleneck
   └─ Commissions directed correctly

2. MODULAR ROUTE SYSTEM
   ├─ /vehicles for CRUD
   ├─ /bookings for rentals
   ├─ /reviews for ratings
   ├─ /auth for users
   └─ Easy to add more routes

3. PAYMENT ISOLATION
   ├─ M-Pesa, Paystack, Crypto separate
   ├─ Can disable/enable independently
   ├─ No interdependencies
   └─ Easy to add more payment methods

4. JOB SCHEDULING
   ├─ Runs independently of API
   ├─ Can be scaled to separate server
   ├─ Uses MongoDB for state persistence
   └─ Idempotent operations

5. DATABASE DESIGN
   ├─ Collections separated by domain
   ├─ Proper indexing for performance
   ├─ References (not denormalized)
   └─ Supports horizontal scaling

6. STATELESS API
   ├─ No local session storage
   ├─ JWT tokens for auth
   ├─ Can run multiple instances
   ├─ Load balancer friendly
   └─ Database is single source of truth
```

---

## Summary

The Meraki Auto backend maintains the **identical architecture** of the original Alina platform, with all components scaled for vehicle marketplace domain. The refactoring changed only:

- **Models**: Added vehicle-specific fields, renamed identity references
- **Routes**: Updated to `/vehicles` endpoint with new terminology
- **Services**: Updated messaging from property to vehicle context
- **Database**: Schema updated for vehicle instead of property

All core systems for payment, authentication, authorization, scheduling, and scalability remain completely unchanged.

This architecture supports:
✅ Multiple vehicle owners operating independently
✅ Multiple payment methods (M-Pesa, Paystack, Crypto)
✅ Secure authentication with 2FA
✅ Automated scheduled tasks (reminders, notifications)
✅ Horizontal scaling with stateless API design
✅ Escrow-based commission management
✅ Admin approval/KYC workflows
✅ Real-time access code generation
✅ Review and rating system
✅ Full audit trail via database timestamps
