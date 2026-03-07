# 📋 Meraki Auto - Quick Reference Card

## 🔄 Terminology Quick Reference

### Common Substitutions (Copy/Paste)

```
OLD                     →  NEW
Unit                    →  Vehicle
unitId                  →  vehicleId
guestPhone              →  renterPhone
pricePerNight           →  dailyPrice
owner (string)          →  ownerId (ObjectId)
Check-in/Check-out      →  Rental Start/Rental End
Amenities               →  Features
Guest                   →  Renter
Host                    →  Vehicle Owner
Stay                    →  Rental
Alina 906 Vibes         →  Meraki Auto
```

---

## 🛣️ API Routes Quick Lookup

### Vehicle Management
```
POST   /vehicles                Get: Create vehicle (owner)
GET    /vehicles                List all vehicles
GET    /vehicles/:vehicleId     Get specific vehicle
PUT    /vehicles/:vehicleId     Update vehicle (owner)
DELETE /vehicles/:vehicleId     Delete vehicle (owner)
```

### Booking Management
```
POST   /bookings                        Create booking (renter)
GET    /bookings/my                     My rentals (renter)
GET    /bookings/vehicle/:vehicleId     Vehicle rentals
POST   /bookings/cancel/:id             Cancel rental
```

### Payment Processing
```
POST   /bookings/mpesa/initiate              M-Pesa deposit
POST   /bookings/mpesa/callback              Safaricom webhook
POST   /bookings/mpesa/confirm-balance       M-Pesa balance
POST   /bookings/confirm-crypto              Crypto deposit
POST   /bookings/confirm-balance             Crypto balance
```

### Reviews
```
POST   /reviews                 Submit review
GET    /reviews/:vehicleId      Get reviews
PUT    /reviews/:id             Update review
DELETE /reviews/:id             Delete review
```

### Authentication
```
POST   /auth/register           Register user
POST   /auth/login              Login
POST   /auth/verify-otp         2FA verification
POST   /auth/reset-password     Password reset
```

---

## 💾 Database Schema Quick Reference

### Vehicle Collection
```javascript
{
  _id: ObjectId,
  name: String,
  dailyPrice: Number,       // ← Key change
  category: String,         // NEW
  features: [String],       // NEW
  transmission: String,     // NEW
  fuelType: String,         // NEW
  ownerId: ObjectId,        // ← Changed from owner: String
  location: String,
  city: String,
  status: String,           // pending|approved|rejected
  createdAt: Date
}
```

### Booking Collection
```javascript
{
  _id: ObjectId,
  vehicleId: ObjectId,      // ← Changed from unitId
  userId: ObjectId,
  startDate: Date,
  endDate: Date,
  renterPhone: String,      // ← Changed from guestPhone
  totalPrice: Number,
  nights: Number,
  paymentStatus: String,    // pending|confirmed|completed|refunded
  accessCode: String,
  depositPaid: Boolean,
  balancePaid: Boolean,
  createdAt: Date
}
```

---

## 🚀 Key Endpoints for Testing

### Create Vehicle
```bash
curl -X POST http://localhost:5000/vehicles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "name": "Toyota Fortuner",
    "dailyPrice": 4000,
    "category": "premium",
    "features": ["Air Conditioning", "Leather Seats"],
    "transmission": "automatic",
    "fuelType": "diesel"
  }'
```

### Create Booking
```bash
curl -X POST http://localhost:5000/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "vehicleId": "507f1f77bcf86cd799439011",
    "startDate": "2026-04-15",
    "endDate": "2026-04-17",
    "renterPhone": "+254712345678",
    "paymentMethod": "mpesa"
  }'
```

### Get My Bookings
```bash
curl -X GET http://localhost:5000/bookings/my \
  -H "Authorization: Bearer TOKEN"
```

---

## 🔍 Common Grep Searches (Verification)

```bash
# Verify no unitId remaining (except comments)
grep -r "unitId" --include="*.js" backend/

# Verify no guestPhone remaining (except comments)
grep -r "guestPhone" --include="*.js" backend/

# Verify no pricePerNight remaining
grep -r "pricePerNight" --include="*.js" backend/

# Verify vehicleId exists in bookingRoutes
grep -r "vehicleId" backend/routes/bookingRoutes.js

# Count Vehicle references
grep -r "Vehicle" --include="*.js" backend/models/
```

---

## 📊 Database Verification Queries

### Check Booking-Vehicle References
```javascript
// Find bookings with missing vehicle reference
db.bookings.aggregate([
  {
    $lookup: {
      from: "vehicles",
      localField: "vehicleId",
      foreignField: "_id",
      as: "vehicle"
    }
  },
  {
    $match: { vehicle: { $eq: [] } }
  }
]).count()  // Should be 0 for all bookings
```

### Check Vehicle ownership
```javascript
// Find vehicles with valid owners
db.vehicles.find({
  ownerId: { $exists: true, $ne: null }
}).count()

// Find vehicles without owner
db.vehicles.find({
  $or: [
    { ownerId: { $exists: false } },
    { ownerId: null }
  ]
}).count()  // Should be 0
```

### Check Booking phone fields
```javascript
// Count bookings with renterPhone
db.bookings.find({
  renterPhone: { $exists: true, $ne: null }
}).count()

// Find bookings missing renterPhone
db.bookings.find({
  $or: [
    { renterPhone: { $exists: false } },
    { renterPhone: null }
  ]
}).count()  // Should be 0 for new bookings
```

---

## 📝 File Reference Quick Guide

| Need | File | Location |
|------|------|----------|
| Terminology list | QUICK_START.md | Lines 5-15 |
| API endpoints | API_CHANGES_REFERENCE.md | Routes section |
| DB schema | DATABASE_MIGRATION.md | Schema Changes section |
| Deployment steps | DEPLOYMENT_CHECKLIST.md | Production Deployment section |
| Migration scripts | DATABASE_MIGRATION.md | Migration Steps section |
| Dev setup | QUICK_START.md | Setting Up section |
| Architecture diagram | ARCHITECTURE.md | System Architecture section |
| Troubleshooting | QUICK_START.md | Common Issues section |

---

## ✅ Pre-Deployment Quick Checklist

```
CODE VERIFICATION
☐ grep 'unitId' returns 0 (except comments)
☐ grep 'guestPhone' returns 0 (except comments)
☐ grep 'pricePerNight' returns 0
☐ Vehicle.js has all new fields
☐ Booking.js uses vehicleId and renterPhone

DATABASE
☐ MongoDB running and accessible
☐ meraki_auto database exists (or will be created)
☐ Migration scripts prepared (if migrating from Alina)
☐ Indexes created or will auto-create

CONFIGURATION
☐ .env has MONGODB_URI=mongodb://localhost:27017/meraki_auto
☐ JWT_SECRET configured
☐ MPESA credentials configured
☐ PAYSTACK credentials configured
☐ RESEND_API_KEY configured
☐ AFRICA_TALKING_API_KEY configured

TESTING
☐ Test POST /vehicles (create)
☐ Test POST /bookings (create)
☐ Test GET /bookings/my (retrieve)
☐ Test email template rendering
☐ Test SMS sending to renterPhone
☐ Test M-Pesa flow
☐ Test access code generation

DOCUMENTATION
☐ Team read README_REFACTORING.md
☐ Developers reviewed QUICK_START.md
☐ QA reviewed DEPLOYMENT_CHECKLIST.md
☐ DevOps reviewed DATABASE_MIGRATION.md
```

---

## 🚨 Common Issues & Quick Fixes

### "vehicleId not found"
```
Cause: Booking created with vehicleId that doesn't exist
Fix: Verify vehicle exists in DB
    db.vehicles.findOne({ _id: ObjectId("...") })
```

### SMS not sent to renterPhone
```
Cause: Field name still using guestPhone OR Africa's Talking config missing
Fix: Verify field name: grep 'guestPhone' routes/
    Verify config: echo $AFRICA_TALKING_API_KEY
```

### Bookings fail with "unit not found"
```
Cause: Old code still running or database not migrated
Fix: Verify server restarted after code deployment
    Verify database migration completed
```

### Payment callback not received
```
Cause: Webhook URL not configured OR firewall blocking
Fix: Verify M-Pesa callback URL in Daraja dashboard
    Check server logs for incoming requests
    Verify MPESA credentials
```

---

## 🔐 Security Checklist

```
AUTHENTICATION
☐ JWT tokens generated correctly
☐ 2FA OTP sent to registered phone
☐ Token expiration enforced
☐ User password hashed (bcrypt)

AUTHORIZATION
☐ Users can only see their bookings
☐ Owners can only manage their vehicles
☐ Admins can see everything
☐ Role-based access enforced

DATA PROTECTION
☐ No sensitive data in logs
☐ No credentials in code (use .env)
☐ HTTPS enforced in production
☐ CORS properly configured
☐ Rate limiting enabled
```

---

## 📱 SMS/Email Template Variables

### SMS Access Code
```
Variables: {{vehicleName}}, {{accessCode}}, {{startDate}}, {{endDate}}
Example: "Your rental access code for Toyota Fortuner: 123456
          Valid: 2026-04-15 to 2026-04-17"
```

### Check-in Reminder
```
Variables: {{vehicleName}}, {{location}}, {{rentalStartDate}}
Example: "Your Meraki Auto rental starts tomorrow!
          Vehicle: Toyota Fortuner
          Location: Westlands, Nairobi
          Pick-up: 2026-04-15 at 2:00 PM"
```

### Email Verification
```
Subject: Verify your Meraki Auto account
Variables: {{userName}}, {{verificationLink}}
```

### Password Reset
```
Subject: Reset your Meraki Auto password
Variables: {{resetLink}}, {{userName}}
```

---

## 🔄 Deployment Workflow

```
1. PRE-DEPLOYMENT (1 hour)
   ├─ Review README_REFACTORING.md
   ├─ Run verification grep commands
   ├─ Check database backup exists
   ├─ Review DEPLOYMENT_CHECKLIST.md
   └─ Prepare rollback plan

2. DATABASE SETUP (30 mins)
   ├─ Create/backup database
   ├─ Run migration scripts (if needed)
   ├─ Verify references
   ├─ Create indexes
   └─ Run verification queries

3. DEPLOYMENT (15 mins)
   ├─ Update code from repo
   ├─ Update .env (database name, URLs)
   ├─ Stop old server
   ├─ Start new server
   └─ Verify logs for errors

4. SMOKE TEST (30 mins)
   ├─ Create test vehicle
   ├─ Create test booking
   ├─ Process test payment
   ├─ Send test SMS
   ├─ Send test email
   └─ Check admin dashboard

5. MONITORING (Ongoing)
   ├─ Watch error logs
   ├─ Monitor API response times
   ├─ Check database performance
   ├─ Verify email/SMS delivery
   └─ Monitor payment processing
```

---

## 📚 Document Index (One-Line Summaries)

| File | Purpose |
|------|---------|
| **README_REFACTORING.md** | What was refactored and why (10 min read) |
| **QUICK_START.md** | Developer setup and common tasks (15 min read) |
| **API_CHANGES_REFERENCE.md** | All endpoint and database changes (20 min read) |
| **DATABASE_MIGRATION.md** | Database migration scripts and procedures (20 min read) |
| **DEPLOYMENT_CHECKLIST.md** | Complete pre/during/post deployment tests (30 min read) |
| **REFACTORING_SUMMARY.md** | Detailed changes by file component (25 min read) |
| **ARCHITECTURE.md** | System design and data flow diagrams (20 min read) |
| **DOCUMENTATION_INDEX.md** | Guide to finding relevant documentation (10 min read) |
| **COMPLETION_SUMMARY.md** | Final status and next steps (15 min read) |
| **QUICK_REFERENCE.md** | This file - quick lookups (5 min read) |

---

## ⏱️ Time Estimates

| Task | Time |
|------|------|
| Read all docs | 2-3 hours |
| Development setup | 15-30 min |
| Run pre-deployment tests | 2-4 hours |
| Database migration (if needed) | 1-2 hours |
| Deploy to production | 30 min - 1 hour |
| Smoke testing | 30 min |
| First week monitoring | Ongoing |

---

## 🎯 Success Criteria

✅ **Infrastructure**
- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] All external APIs accessible

✅ **Functionality**
- [ ] Create vehicle works at /vehicles
- [ ] Create booking works with vehicleId
- [ ] M-Pesa/Paystack/Crypto payments process
- [ ] Access codes generated and sent
- [ ] Rental start notifications sent

✅ **Data Integrity**
- [ ] No orphaned references
- [ ] All bookings reference valid vehicles
- [ ] All reviews reference valid vehicles
- [ ] All SMS sent to correct renterPhone

✅ **Monitoring**
- [ ] Error rate < 0.1%
- [ ] API response time < 300ms median
- [ ] No memory leaks
- [ ] Scheduled jobs complete

---

**Ready to deploy? Start with [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)**

Good luck! 🚀
