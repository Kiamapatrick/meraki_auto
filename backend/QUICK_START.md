# Meraki Auto Backend - Quick Start Guide

## For New Developers

### Understanding the Refactoring

This backend has been refactored from **Alina 906 Vibes** (property booking) to **Meraki Auto** (vehicle marketplace). If you're familiar with the original codebase, here's what changed:

**Key Term Substitutions:**
- Property Unit → Vehicle
- Host → Vehicle Owner
- Guest → Renter
- Check-in/Check-out → Rental Start/Rental End
- Price Per Night → Daily Price
- Amenities → Features
- Stay → Rental

**What Stayed the Same:**
- All payment processing (M-Pesa, Paystack, Crypto)
- All authentication and authorization
- All admin controls
- All business logic (booking engine, dates, cancellations)
- All job schedulers
- All notification systems

### Setting Up

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
# Create .env file with:
MONGODB_URI=mongodb://localhost:27017/meraki_auto
JWT_SECRET=your_secret_here
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
PAYSTACK_SECRET_KEY=...
RESEND_API_KEY=...
AFRICA_TALKING_API_KEY=...

# 3. Start the server
npm start

# Server runs on http://localhost:5000
```

## API Quick Reference

### Vehicle Management

```javascript
// GET - List all vehicles
GET /vehicles
Response: { vehicles: [...] }

// POST - Create vehicle (owner only)
POST /vehicles
Body: {
  name: "Toyota Fortuner",
  dailyPrice: 4000,
  category: "premium",
  features: ["Air Conditioning", "Leather Seats"],
  transmission: "automatic",
  fuelType: "diesel"
}
Response: { _id: "...", ...vehicle }

// GET - Specific vehicle
GET /vehicles/:vehicleId
Response: { vehicle: {...} }

// PUT - Update vehicle (owner only)
PUT /vehicles/:vehicleId
Body: { ...updates }

// DELETE - Remove vehicle (owner only)
DELETE /vehicles/:vehicleId
```

### Booking Management

```javascript
// POST - Create rental booking
POST /bookings
Body: {
  vehicleId: "507f1f77bcf86cd799439011",
  startDate: "2026-04-15",
  endDate: "2026-04-17",
  renterPhone: "+254712345678",
  paymentMethod: "mpesa"
}
Response: { _id: "...", ...booking }

// GET - My bookings (authenticated user)
GET /bookings/my
Authorization: Bearer {token}
Response: { bookings: [...] }

// GET - Bookings for a specific vehicle
GET /bookings/vehicle/:vehicleId
Response: { bookings: [...] }

// POST - Cancel booking (within 24 hours)
POST /bookings/cancel/:bookingId
Response: { message: "Booking cancelled", refund: {...} }
```

### Payment Processing

**M-Pesa (Safaricom)**
```javascript
// Initiate STK push for deposit
POST /bookings/mpesa/initiate
Body: {
  vehicleId: "...",
  startDate: "2026-04-15",
  endDate: "2026-04-17",
  renterPhone: "+254712345678"
}
// User receives STK prompt on phone

// Webhook callback from Safaricom
POST /bookings/mpesa/callback
// (Automatically called by Safaricom)

// Initiate balance payment (after deposit paid)
POST /bookings/mpesa/confirm-balance
Body: {
  vehicleId: "...",
  bookingId: "...",
  renterPhone: "+254712345678"
}
```

**Paystack (Visa/Cards)**
```javascript
// Initialize payment for deposit or full amount
POST /paystack/create
Body: {
  vehicleId: "...",
  amount: 2000,  // deposit amount
  email: "user@example.com"
}
Response: { authorizationUrl: "https://checkout.paystack.com/..." }

// Verify payment after redirect
POST /paystack/verify
Body: { reference: "chg_...", bookingId: "..." }
```

**Crypto (Blockchain)**
```javascript
// Create blockchain booking record
POST /bookings/confirm-crypto
Body: {
  vehicleId: "...",
  walletAddress: "0x...",
  transactionHash: "0x...",
  amount: 2000
}
Response: { blockchainBookingId: "...", ...booking }

// Confirm balance payment
POST /bookings/confirm-balance
Body: {
  vehicleId: "...",
  bookingId: "...",
  transactionHash: "0x...",
  amount: 4000  // balance amount
}
```

### Reviews

```javascript
// POST - Submit review (renter only, after rental)
POST /reviews
Body: {
  vehicleId: "507f1f77bcf86cd799439011",
  rating: 5,
  comment: "Excellent vehicle, great service!"
}

// GET - Reviews for a vehicle
GET /reviews/:vehicleId
Response: { reviews: [...], averageRating: 4.8 }

// PUT - Update own review
PUT /reviews/:reviewId
Body: { rating: 4, comment: "Updated review" }

// DELETE - Remove own review
DELETE /reviews/:reviewId
```

## Common Development Tasks

### Add a New Field to Vehicle

```javascript
// 1. Update models/Vehicle.js
const vehicleSchema = new Schema({
  // ... existing fields
  newField: { type: String, required: true }
});

// 2. Update routes/Units.js (CRUD endpoints)
// Ensure POST/PUT handlers accept newField

// 3. Update controllers if business logic affected
// e.g., if it affects pricing: update bookingRoutes.js

// 4. Update database
// db.vehicles.updateMany({}, { $set: { newField: "default" } })

// 5. Test the endpoints
POST /vehicles with newField in body
GET /vehicles/:id to verify it's stored
```

### Update Payment Processing

```javascript
// 1. Update controller: controllers/mpesaController.js
// 2. Update routes: routes/bookingRoutes.js
// 3. Update model: models/Booking.js if new fields needed
// 4. Update tests

// Example: Add new payment status
Booking.js: paymentStatus enum: [..., "processing", "completed"]
mpesaController.js: Update status transitions
Tests: Verify new status workflow
```

### Add New Notification

```javascript
// 1. Create job: jobs/myNotification.js
const cron = require('node-cron');
const Booking = require('../models/Booking');
const smsService = require('../services/smsService');

cron.schedule('0 10 * * *', async () => {
  // Find bookings matching criteria
  const bookings = await Booking.find({...}).populate('vehicleId userId');
  
  // Send notifications
  for (const booking of bookings) {
    await smsService.send(
      booking.renterPhone,
      `Your rental of ${booking.vehicleId.name} starts soon!`
    );
  }
});

// 2. Import in server.js
require('./jobs/myNotification');

// 3. Test the cron execution
```

### Debug a Booking Flow

```javascript
// Use these debug logs to trace the issue

// Check vehicle exists
db.vehicles.findOne({ _id: ObjectId("vehicleId") })

// Check booking created
db.bookings.findOne({ _id: ObjectId("bookingId") })

// Check payment status
db.bookings.findOne(
  { _id: ObjectId("bookingId") },
  { paymentStatus: 1, depositPaid: 1, balancePaid: 1 }
)

// Check SMS sent
db.bookings.findOne(
  { _id: ObjectId("bookingId") },
  { accessCodeSent: 1, accessCodeSentAt: 1, accessCode: 1 }
)

// Check cancellation status
db.bookings.findOne(
  { _id: ObjectId("bookingId") },
  { cancelledAt: 1, refundedAt: 1, refundTxHash: 1 }
)
```

## Common Issues & Solutions

### Issue: "vehicleId not found"
**Cause**: Booking references vehicle that doesn't exist or was deleted
**Solution**: 
```javascript
// Verify vehicle exists
db.vehicles.findOne({ _id: ObjectId("vehicleId") })

// Check for orphaned bookings
db.bookings.aggregate([
  { $lookup: { from: "vehicles", localField: "vehicleId", 
               foreignField: "_id", as: "vehicle" } },
  { $match: { vehicle: { $eq: [] } } }
])
```

### Issue: SMS not sent to renterPhone
**Cause**: 
1. Africa's Talking API key not configured
2. Phone number invalid (must be +254... or 0...)
3. Field name still uses guestPhone

**Solution**:
```javascript
// Verify field name in code
grep -r "guestPhone" routes/  // Should be 0 results

// Verify phone validation
const isValidPhone = (phone) => 
  /^(\+254|0)[0-9]{9}$/.test(phone);

// Check Africa's Talking configuration
console.log(process.env.AFRICA_TALKING_API_KEY); // Should not be undefined
```

### Issue: M-Pesa payment stuck in "pending"
**Cause**: 
1. Safaricom callback not received
2. Network error during callback processing
3. Access token expired

**Solution**:
```javascript
// Check MPesa controller logs for callback errors
// Verify access token generation
// Check M-Pesa balance and status

// Manual verification
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query" \
  -d '{"CheckoutRequestID":"'$CHECKOUT_ID'"}'
```

### Issue: Database connection error
**Cause**: 
1. MongoDB not running
2. Connection string incorrect
3. Database name wrong

**Solution**:
```bash
# Check MongoDB is running
# Linux/Mac:
brew services list  # macOS
systemctl status mongod  # Linux

# Windows:
# Check Services app for MongoDB

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/meraki_auto
#                                       ^^^^^^^^^^^^
#                                       Database name must be 'meraki_auto'

# Test connection
node -e "const mongoose = require('mongoose'); 
mongoose.connect(process.env.MONGODB_URI).then(() => 
console.log('Connected!')).catch(e => console.error(e))"
```

## Testing

### Run Basic Tests
```bash
# Test vehicle endpoints
curl -X POST http://localhost:5000/vehicles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Vehicle","dailyPrice":3000,"category":"everyday"}'

# Test booking creation
curl -X POST http://localhost:5000/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "vehicleId":"507f1f77bcf86cd799439011",
    "startDate":"2026-04-15",
    "endDate":"2026-04-17",
    "renterPhone":"+254712345678",
    "paymentMethod":"mpesa"
  }'

# Get my bookings
curl http://localhost:5000/bookings/my \
  -H "Authorization: Bearer $TOKEN"
```

## Useful Documentation

- [API_CHANGES_REFERENCE.md](API_CHANGES_REFERENCE.md) - All API endpoint changes
- [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) - Detailed refactoring by component
- [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) - Database migration procedures
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Pre-deployment verification

## Code Structure

```
backend/
├── models/              # Mongoose schemas
│   ├── Vehicle.js      # Vehicle listing (NEW)
│   ├── Booking.js      # Rental bookings (UPDATED)
│   ├── User.js         # User accounts
│   ├── Review.js       # Vehicle reviews (UPDATED)
│   └── ...
├── routes/             # Express route handlers
│   ├── Units.js        # /vehicles CRUD (renamed from Units)
│   ├── bookingRoutes.js # /bookings endpoints (UPDATED)
│   ├── mpesaRoutes.js  # M-Pesa payment (UPDATED)
│   └── ...
├── controllers/        # Business logic
│   ├── mpesaController.js    # M-Pesa processing (UPDATED)
│   ├── authController.js     # Authentication (UPDATED)
│   └── ...
├── services/          # Helper services
│   ├── smsService.js  # SMS notifications (UPDATED)
│   └── whatsappService.js
├── jobs/              # Scheduled tasks
│   ├── checkInNotifier.js    # Rental start notifications (UPDATED)
│   └── checkInScheduler.js   # Cron scheduling (UPDATED)
├── middleware/        # Express middleware
│   └── authMiddleware.js
├── templates/         # Email templates
│   ├── verify-email.html        # (UPDATED)
│   ├── reset-password.html      # (UPDATED)
│   ├── kyc-approved.html        # (UPDATED)
│   └── kyc-rejected.html        # (UPDATED)
└── server.js          # Express app setup (UPDATED)
```

## Next Steps

1. **Read the refactoring docs**
   - [README_REFACTORING.md](README_REFACTORING.md) - Overview
   - [API_CHANGES_REFERENCE.md](API_CHANGES_REFERENCE.md) - API changes

2. **Set up your environment**
   - Install Node.js 14+
   - Install MongoDB
   - Configure .env file

3. **Understand the domain**
   - Vehicle marketplace (not property rentals)
   - Vehicle owners list vehicles
   - Renters book vehicles for specified dates
   - Two-phase payment: deposit + balance

4. **Learn the key flows**
   - Vehicle creation and approval
   - Booking session (creation → payment → access code)
   - Payment processing (M-Pesa/Paystack/Crypto)
   - Rental notifications

5. **Make your first change**
   - Add a field to Vehicle
   - Update the CRUD endpoints
   - Test the changes

Happy coding! 🚗
