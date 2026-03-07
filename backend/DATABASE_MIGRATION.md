# Database Migration Guide - Alina to Meraki Auto

## Overview
This guide provides steps to migrate from the Alina property booking database to the Meraki Auto vehicle marketplace database.

## Schema Changes

### NEW: Vehicle Collection
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  image: String,
  dailyPrice: Number,        // Previously: pricePerNight
  deposit: Number,
  ownerId: ObjectId,         // Previously: owner (string)
  location: String,
  city: String,
  area: String,
  country: String,
  latitude: Number,
  longitude: Number,
  category: String,          // NEW: premium|everyday|matatu|bus
  features: [String],        // NEW: vehicle features
  transmission: String,      // NEW: manual|automatic
  fuelType: String,          // NEW: petrol|diesel|electric|hybrid
  status: String,            // NEW: pending|approved|rejected
  isComingSoon: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### UPDATED: Booking Collection
```javascript
{
  _id: ObjectId,
  vehicleId: ObjectId,       // Previously: unitId
  userId: ObjectId,
  startDate: Date,
  endDate: Date,
  accessCode: String,
  accessCodeSent: Boolean,
  accessCodeSentAt: Date,
  totalPrice: Number,
  nights: Number,
  paymentMethod: String,     // mpesa|visa|crypto
  paymentStatus: String,     // pending|confirmed|cancelled|refunded|completed
  bookingId: String,
  merchantRequestId: String,
  checkoutRequestId: String,
  mpesaReceiptNumber: String,
  renterPhone: String,       // Previously: guestPhone
  blockchainBookingId: String,
  blockchainTx: String,
  walletAddress: String,
  paystackDepositRef: String,
  paystackBalanceRef: String,
  cancelledAt: Date,
  refundedAt: Date,
  refundTxHash: String,
  depositPaid: Boolean,
  depositAmount: Number,
  depositTxHash: String,
  depositPaidAt: Date,
  balancePaid: Boolean,
  balanceAmount: Number,
  balanceTxHash: String,
  balancePaidAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### UPDATED: Review Collection
```javascript
{
  _id: ObjectId,
  vehicleId: ObjectId,       // Previously: unitId (ref updated to Vehicle)
  userId: ObjectId,
  userName: String,
  rating: Number,
  comment: String,
  createdAt: Date,
  updatedAt: Date
}
// Index: { vehicleId: 1, userId: 1 } (unique)
```

### UPDATED: Reservation Collection
```javascript
{
  _id: ObjectId,
  vehicleId: ObjectId,       // Previously: unitId (ref updated to Vehicle)
  startDate: Date,
  endDate: Date,
  paymentMethod: String,
  totalPrice: Number,
  status: String,
  createdAt: Date,
  updatedAt: Date
}
```

### UNCHANGED: User Collection
- No changes to User schema
- Role system unchanged (admin ability maintained)

### REMOVED: Unit Collection
- Deprecated in favor of Vehicle collection
- Can be archived or deleted after migration

## Migration Steps

### Option 1: Fresh Start (Recommended for new deployment)
1. Create new MongoDB database: `meraki_auto`
2. Deploy code
3. All collections created automatically by Mongoose
4. No data migration needed if starting fresh

### Option 2: Data Migration (For existing Alina data)

```javascript
// MongoDB script to migrate Unit → Vehicle
db.units.aggregate([
  {
    $project: {
      _id: 1,
      name: 1,
      description: 1,
      image: 1,
      dailyPrice: "$pricePerNight",
      deposit: 1,
      ownerId: {
        $function: {
          body: "function(owner) { return ObjectId(owner); }",
          args: ["$owner"],
          lang: "js"
        }
      },
      location: 1,
      city: 1,
      area: 1,
      country: 1,
      latitude: 1,
      longitude: 1,
      category: { $literal: "everyday" },
      features: { $literal: [] },
      transmission: { $literal: null },
      fuelType: { $literal: null },
      status: { $literal: "approved" },
      isComingSoon: 1,
      createdAt: 1,
      updatedAt: 1
    }
  }
]).forEach(doc => {
  db.vehicles.insertOne(doc);
});
```

```javascript
// MongoDB script to migrate Bookings
db.bookings.updateMany(
  {},
  [
    {
      $set: {
        vehicleId: "$unitId",
        renterPhone: "$guestPhone"
      }
    },
    {
      $unset: ["unitId", "guestPhone"]
    }
  ]
);
```

```javascript
// MongoDB script to migrate Reviews
db.reviews.updateMany(
  {},
  [
    {
      $set: {
        vehicleId: "$unitId"
      }
    },
    {
      $unset: ["unitId"]
    }
  ]
);
```

```javascript
// MongoDB script to migrate Reservations
db.reservations.updateMany(
  {},
  [
    {
      $set: {
        vehicleId: "$unitId"
      }
    },
    {
      $unset: ["unitId"]
    }
  ]
);
```

```javascript
// MongoDB script to migrate MpesaPendingBookings
db.mpesapendingbookings.updateMany(
  {},
  [
    {
      $set: {
        vehicleId: "$unitId",
        renterPhone: "$guestPhone"
      }
    },
    {
      $unset: ["unitId", "guestPhone"]
    }
  ]
);
```

### Post-Migration Verification

```javascript
// Check Vehicle count
db.vehicles.countDocuments()

// Check Booking references valid
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
]).count()  // Should return 0

// Check Review references valid
db.reviews.aggregate([
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
]).count()  // Should return 0
```

## Index Maintenance

Ensure the following indexes are created:

### Booking Indexes
```javascript
db.bookings.createIndex({ userId: 1, createdAt: -1 })
db.bookings.createIndex({ vehicleId: 1, startDate: 1, endDate: 1 })
db.bookings.createIndex({ walletAddress: 1 })
db.bookings.createIndex({ blockchainBookingId: 1 }, { unique: true, sparse: true })
db.bookings.createIndex({ depositTxHash: 1 })
db.bookings.createIndex({ userId: 1, depositPaid: 1, balancePaid: 1 })
db.bookings.createIndex({ paystackDepositRef: 1 })
db.bookings.createIndex({ paystackBalanceRef: 1 })
```

### Vehicle Indexes
```javascript
db.vehicles.createIndex({ createdAt: -1 })
db.vehicles.createIndex({ city: 1 })
db.vehicles.createIndex({ ownerId: 1 })
```

### Review Indexes
```javascript
db.reviews.createIndex({ vehicleId: 1, userId: 1 }, { unique: true })
```

## Rollback Plan

If migration needs to be reversed:

1. **Keep Unit collection** - Do not delete until fully verified
2. **Maintain old references** - Keep old field mappings documented
3. **Version control** - Tag MongoDB collections by date

```javascript
// Create backup before migration
db.units.aggregate([]).toArray().forEach(doc => {
  db.units_backup_2026_03_01.insertOne(doc);
});
```

## Validation Checklist

- [ ] New Vehicle collection created
- [ ] All Units migrated to Vehicles
- [ ] Bookings updated with vehicleId
- [ ] Phone fields renamed to renterPhone
- [ ] No orphaned references (verified above)
- [ ] Indexes created and optimized
- [ ] Sample queries tested
- [ ] Application tested with real bookings
- [ ] Rental flow verified end-to-end
- [ ] Admin panel accessible

## Troubleshooting

### Issue: "vehicleId not found"
**Cause**: Migration incomplete
**Solution**: Verify migration script ran successfully, check for null values

### Issue: "Duplicate key error on unique index"
**Cause**: Already migrated data
**Solution**: Check if vehicles already exist, skip duplicate entries

### Issue: "References broken after migration"
**Cause**: ObjectId conversion failed
**Solution**: Verify ObjectId format, re-run migration with proper casting

## Timeline

- Development: Refactoring complete
- Testing: Verify in staging
- Backup: Create database snapshot
- Migration: Run during maintenance window
- Verification: Check all collections
- Deployment: Push to production
- Monitoring: Watch error logs

## Support

For migration issues:
1. Check REFACTORING_SUMMARY.md
2. Review database logs
3. Verify all scripts executed
4. Check application logs for references
