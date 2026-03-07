# Meraki Auto API Changes Reference

## Terminology Mapping

| Alina Term | Meraki Auto Term | Where Changed |
|------------|------------------|---------------|
| Unit | Vehicle | Models, routes, controllers |
| unitId | vehicleId | Bookings, reviews, reservations |
| guestPhone | renterPhone | Bookings, M-Pesa, SMS notifications |
| pricePerNight | dailyPrice | Vehicle model, booking calculations |
| owner (string) | ownerId (ObjectId) | Vehicle model references |
| Unit schema fields | Vehicle schema + new fields | Models/Vehicle.js |
| Check-in | Rental Start | Job schedulers, SMS messages |
| Check-out | Rental End | Job schedulers, notifications |
| Amenities | Features | Vehicle model |
| Guest | Renter | SMS/Email messaging |
| Host | Vehicle Owner | Documentation, admin UI |
| Stay | Rental | Business logic, messaging |

## Route Changes

### Vehicle Management (formerly Units)

| Method | Old Route | New Route | Changes |
|--------|-----------|-----------|---------|
| POST | `/units` | `/vehicles` | Creates vehicle with dailyPrice, category, features, transmission, fuelType |
| GET | `/units` | `/vehicles` | Returns vehicles with new schema |
| GET | `/units/:id` | `/vehicles/:id` | Returns single vehicle |
| PUT | `/units/:id` | `/vehicles/:id` | Updates vehicle fields |
| DELETE | `/units/:id` | `/vehicles/:id` | Deletes vehicle |

### Booking Routes

| Method | Route | Key Parameters | Changes |
|--------|-------|-----------------|---------|
| POST | `/bookings` | vehicleId, renterPhone, startDate, endDate | Was unitId, guestPhone |
| GET | `/bookings/my` | - | Returns user's rentals with vehicleId |
| GET | `/bookings/vehicle/:vehicleId` | vehicleId | Returns confirmed bookings for vehicle |
| POST | `/bookings/mpesa/initiate` | vehicleId, renterPhone, ... | M-Pesa deposit init |
| POST | `/bookings/mpesa/callback` | - | Updates booking with vehicleId |
| POST | `/bookings/mpesa/confirm-balance` | vehicleId, renterPhone, ... | Balance payment init |
| POST | `/bookings/confirm-crypto` | vehicleId, walletAddress, ... | Crypto deposit confirm |
| POST | `/bookings/confirm-balance` | vehicleId, walletAddress | Crypto balance confirm |
| POST | `/bookings/cancel/:id` | - | Cancel rental (24-hour window) |
| GET | `/bookings/crypto/:bookingId` | bookingId | Query crypto status |

### Payment Routes

| Method | Route | Changes |
|--------|-------|---------|
| POST | `/mpesa/initiate` | Uses vehicleId, renterPhone validation |
| POST | `/mpesa/daraja-callback` | Updates booking with vehicleId |
| POST | `/mpesa/initiate-balance` | Uses vehicleId, renterPhone |
| POST | `/paystack/create` | Uses vehicleId in booking |
| POST | `/paystack/verify` | References vehicleId on booking update |

### Review Routes

| Method | Route | Changes |
|--------|-------|---------|
| POST | `/reviews` | vehicleId parameter (was unitId) |
| GET | `/reviews/:vehicleId` | vehicleId in URL |
| PUT | `/reviews/:id` | Updates review with vehicleId |
| DELETE | `/reviews/:id` | Deletes review |

### Reservation Routes

| Method | Route | Changes |
|--------|-------|---------|
| POST | `/reservations` | vehicleId parameter |
| GET | `/reservations/:vehicleId` | vehicleId in URL |
| PUT | `/reservations/:id` | Updates reservation vehicleId |
| DELETE | `/reservations/:id` | Deletes reservation |

## Request/Response Examples

### Create Booking (NEW)
```javascript
// Request
POST /bookings
{
  "vehicleId": "507f1f77bcf86cd799439011",
  "startDate": "2026-04-15",
  "endDate": "2026-04-17",
  "renterPhone": "+254712345678",
  "paymentMethod": "mpesa"
}

// Response
{
  "_id": "507f1f77bcf86cd799439012",
  "vehicleId": "507f1f77bcf86cd799439011",
  "userId": "507f1f77bcf86cd799439010",
  "startDate": "2026-04-15T00:00:00Z",
  "endDate": "2026-04-17T00:00:00Z",
  "renterPhone": "+254712345678",
  "totalPrice": 8000,
  "nights": 2,
  "paymentStatus": "pending",
  "paymentMethod": "mpesa"
}
```

### Create Vehicle (NEW)
```javascript
// Request
POST /vehicles
{
  "name": "Toyota Fortuner 2023",
  "description": "Premium 4WD SUV",
  "dailyPrice": 4000,
  "deposit": 2000,
  "location": "Westlands, Nairobi",
  "city": "Nairobi",
  "area": "Westlands",
  "country": "Kenya",
  "category": "premium",
  "features": ["Air Conditioning", "Leather Seats", "Backup Camera"],
  "transmission": "automatic",
  "fuelType": "diesel"
}

// Response
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Toyota Fortuner 2023",
  "description": "Premium 4WD SUV",
  "dailyPrice": 4000,
  "deposit": 2000,
  "location": "Westlands, Nairobi",
  "city": "Nairobi",
  "area": "Westlands",
  "country": "Kenya",
  "ownerId": "507f1f77bcf86cd799439010",
  "category": "premium",
  "features": ["Air Conditioning", "Leather Seats", "Backup Camera"],
  "transmission": "automatic",
  "fuelType": "diesel",
  "status": "pending",
  "createdAt": "2026-03-01T10:00:00Z",
  "updatedAt": "2026-03-01T10:00:00Z"
}
```

### Get My Bookings (UPDATED)
```javascript
// Request
GET /bookings/my
Authorization: Bearer {token}

// Response
{
  "bookings": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "vehicleId": "507f1f77bcf86cd799439011",
      "vehicle": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Toyota Fortuner 2023",
        "dailyPrice": 4000,
        "image": "..."
      },
      "startDate": "2026-04-15T00:00:00Z",
      "endDate": "2026-04-17T00:00:00Z",
      "renterPhone": "+254712345678",
      "totalPrice": 8000,
      "nights": 2,
      "paymentStatus": "confirmed",
      "accessCode": "123456"
    }
  ]
}
```

## Field Validation Rules

### Vehicle Create/Update
| Field | Type | Rules | Example |
|-------|------|-------|---------|
| name | String | Required, 3-100 chars | "Toyota Fortuner 2023" |
| dailyPrice | Number | Required, > 0 | 4000 |
| deposit | Number | Required, > 0 | 2000 |
| category | Enum | "premium", "everyday", "matatu", "bus" | "premium" |
| features | Array | Optional, string items | ["Air Conditioning", "Leather Seats"] |
| transmission | String | Optional, "manual" or "automatic" | "automatic" |
| fuelType | String | Optional, "petrol", "diesel", "electric", "hybrid" | "diesel" |
| city | String | Required, 2-50 chars | "Nairobi" |
| ownerId | ObjectId | Populated by system | - |

### Booking Create
| Field | Type | Rules | Example |
|-------|------|-------|---------|
| vehicleId | ObjectId | Required, must exist | "507f1f77bcf86cd799439011" |
| startDate | Date | Required, ISO 8601, >= today | "2026-04-15" |
| endDate | Date | Required, ISO 8601, > startDate | "2026-04-17" |
| renterPhone | String | Required, valid Kenya number | "+254712345678" or "0712345678" |
| paymentMethod | Enum | "mpesa", "visa", "crypto" | "mpesa" |

## SMS Message Updates

### Access Code - OLD
```
Welcome to {{unitName}} 🏡

Your access code is: {{accessCode}}
Valid today only!

Enjoy your stay!
```

### Access Code - NEW
```
Welcome to Meraki Auto 🚗

Your rental access code for {{vehicleName}}: {{accessCode}}

Valid for your rental period ({{startDate}} - {{endDate}})

Safe travels!
```

### Check-in Reminder - OLD
```
Don't forget to check in to {{unitName}} today!
Check-in time: 2:00 PM
```

### Check-in Reminder - NEW
```
⏰ Your Meraki Auto rental starts tomorrow!
Vehicle: {{vehicleName}}
Location: {{location}}
Pick-up: {{rentalStartDate}} at 2:00 PM

Reply with any questions.
```

## Email Template Changes

All email templates updated with:
- "Alina 906 Vibes" → "Meraki Auto"
- Footer copyright updated
- "Property" references → "Vehicle"
- "Check-in" references → "Rental start"

Templates updated:
- verify-email.html
- reset-password.html
- kyc-approved.html
- kyc-rejected.html

## Database Query Changes

### MongoDB Collections

**Old:**
```javascript
db.units
db.bookings (unitId field)
db.reviews (unitId field)
db.reservations (unitId field)
```

**New:**
```javascript
db.vehicles        // Replaces units
db.bookings        // Updated schema
db.reviews         // Updated schema
db.reservations    // Updated schema
```

### Sample Queries

**Find all rentals for a vehicle (OLD):**
```javascript
db.bookings.find({ unitId: ObjectId("...") })
```

**Find all rentals for a vehicle (NEW):**
```javascript
db.bookings.find({ vehicleId: ObjectId("...") })
```

**Find renter's phone numbers (OLD):**
```javascript
db.bookings.find({}, { guestPhone: 1 })
```

**Find renter's phone numbers (NEW):**
```javascript
db.bookings.find({}, { renterPhone: 1 })
```

**Get vehicle with bookings (OLD):**
```javascript
db.units.aggregate([
  { $match: { _id: ObjectId("...") } },
  { $lookup: { from: "bookings", localField: "_id", foreignField: "unitId", as: "bookings" } }
])
```

**Get vehicle with bookings (NEW):**
```javascript
db.vehicles.aggregate([
  { $match: { _id: ObjectId("...") } },
  { $lookup: { from: "bookings", localField: "_id", foreignField: "vehicleId", as: "bookings" } }
])
```

## Frontend Integration Checklist

- [ ] API base URL updated (if changed)
- [ ] POST `/vehicles` endpoint integrated for vehicle creation
- [ ] GET `/vehicles` returns new vehicle schema with dailyPrice
- [ ] Booking form captures renterPhone instead of guestPhone
- [ ] Booking creation POSTs vehicleId instead of unitId
- [ ] My bookings displays vehicle details from populated vehicleId
- [ ] Review form references vehicleId in URL
- [ ] Reservation management uses vehicleId
- [ ] SMS messages display Meraki Auto branding
- [ ] Email notifications show Meraki Auto branding
- [ ] Vehicle listing shows category, features, transmission, fuelType
- [ ] Admin vehicle approval form updated

## Version Compatibility

- **API Version**: 2.0.0 (Breaking changes from 1.x)
- **Database**: Migrated from alina906vibes → meraki_auto
- **SDK Updates Required**: Yes, field names changed
- **Backward Compatibility**: Not available (full domain refactor)
- **Deprecation Policy**: Alina 1.x no longer supported

## Support & Troubleshooting

**"Unknown field vehicleId"**
- Check database is meraki_auto, not alina906vibes
- Verify Booking schema loaded from models/Booking.js

**"vehicleId not found"**
- Migrated data correctly? Run verification queries
- Vehicle deleted? Check MongoDB

**"Invalid renterPhone format"**
- Must be "+254..." format or "0..." format
- Validation function: `isValidKenyanPhone()`

**"Booking dates conflict"**
- Dates already booked for this vehicle
- Try different dates or different vehicle

For more details, see [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)
