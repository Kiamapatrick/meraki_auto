# Meraki Auto Deployment Checklist

## Pre-Deployment Verification (Development)

### Code Review
- [ ] All 10 refactoring tasks completed
- [ ] REFACTORING_SUMMARY.md reviewed
- [ ] DATABASE_MIGRATION.md reviewed
- [ ] Git diff shows only terminology changes (no architecture modifications)
- [ ] No console warnings or errors in code review

### Database Schema
- [ ] Vehicle model created with all fields (dailyPrice, ownerId, category, features, transmission, fuelType)
- [ ] Booking model shows vehicleId and renterPhone fields
- [ ] All foreign key references updated (Review, Reservation, MpesaPendingBooking)
- [ ] Index strategy documented and tested

### Configuration Files
- [ ] server.js database connection points to `meraki_auto`
- [ ] CORS origins include production Meraki Auto URL
- [ ] API keys for M-Pesa, Paystack, Africa's Talking configured
- [ ] Email service (Resend) credentials configured
- [ ] JWT secret configured
- [ ] Rate limiting configured appropriately

## Staging Environment Tests

### API Integration Tests
- [ ] **Vehicle CRUD**: Create, read, update, delete at `/vehicles` endpoint
  - Vehicle name, dailyPrice, category, features, transmission, fuelType
  - Verify ownerId populated correctly
  - Verify status approval flow (pending → approved)

- [ ] **Booking Flow - M-Pesa**:
  - Create booking with vehicleId, startDate, endDate, renterPhone
  - POST `/bookings/mpesa/initiate` initiates STK push
  - Callback from Daraja handles deposit/balance
  - Verify booking transitions through payment states

- [ ] **Booking Flow - Paystack**:
  - Create booking with vehicleId, renterPhone
  - Deposit and balance payment flows working
  - Verify transaction references stored correctly

- [ ] **Booking Flow - Crypto**:
  - Create booking with vehicleId
  - Blockchain reference stored in booking
  - Escrow calculations correct
  - Balance payment after deposit

- [ ] **Access Code Generation**:
  - SMS sent to renterPhone with correct code
  - Code valid for rental period
  - Access code not leaked in API responses

- [ ] **Booking Cancellation**:
  - 24-hour cancellation window enforced
  - Refunds processed correctly
  - Refund amounts calculated (full for deposit, balance not yet paid)

### Business Logic Tests
- [ ] Date overlap prevention working
  - Cannot book if dates conflict with existing rentals
  - Inclusive start date, exclusive end date logic maintained
  - Error messages mention vehicle (not unit)

- [ ] Commission calculations
  - Platform commission deducted correctly
  - Owner receives balance after commission
  - Escrow holds deposits and balances correctly

- [ ] Access code lifecycle
  - Generated on successful payment
  - Sent to renterPhone via SMS
  - Accessible to renter via API
  - Expires at rental end date

- [ ] Review submission
  - Only renter who completed rental can review
  - Reviews reference vehicleId correctly
  - Ratings aggregated for vehicle pages

- [ ] Reservation persistence
  - Reservations block dates correctly
  - Use vehicleId references
  - Admin can manage reservations

### Email/SMS Communication
- [ ] **Verification Email**:
  - Content shows Meraki Auto branding (not Alina)
  - Verification link works
  - HTML template renders correctly

- [ ] **Password Reset Email**:
  - Template shows Meraki Auto branding
  - Reset link functions correctly
  - Email sent to correct address

- [ ] **KYC Approval Email**:
  - Shows Meraki Auto in footer
  - Approval status clear
  - Link to KYC dashboard works

- [ ] **KYC Rejection Email**:
  - Rejection reason displayed
  - Response instructions clear
  - Email reference for support

- [ ] **SMS Access Code**:
  - Message content updated for rental context
  - Sent to correct renterPhone number
  - Code format remains consistent (6 digits)
  - Delivered within reasonable time (~2 seconds)

### Background Jobs
- [ ] **Check-in Notifier**:
  - Cron job runs at scheduled time
  - Queries for upcoming rental starts (24 hours)
  - Uses vehicleId for vehicle data lookup
  - SMS sent to renterPhone with vehicle/location details
  - Handles failures gracefully

- [ ] **Check-in Scheduler**:
  - Alternative reminders (if configured) work
  - renterName pulled from user collection correctly
  - Timing accurate (24 hours before rental start)

### Authentication & Authorization
- [ ] **JWT token generation** unchanged
  - User role assignment works (user, admin)
  - Token payload unparseable and verified

- [ ] **Two-factor authentication** unchanged
  - SMS OTP sent correctly
  - OTP validation enforces timing
  - OTP invalidated after successful login

- [ ] **Role-based access control**:
  - Regular users see only their vehicles/bookings
  - Admins can view all data
  - Admins can approve vehicle listings
  - Owners can manage their vehicles

- [ ] **Middleware chain intact**:
  - Auth middleware validates all protected routes
  - Security middleware applied
  - CORS working correctly

### Admin Functions
- [ ] **KYC Management**:
  - Admin can approve/reject KYCs
  - Email notifications sent with updated branding
  - User eligibility updated correctly

- [ ] **Dispute Resolution**:
  - Admin can view all bookings
  - Can review transaction history
  - Can issue refunds/resolutions
  - Commission tracking visible

- [ ] **Vehicle Approval**:
  - Admin reviews pending vehicles
  - Can approve or request changes
  - Vehicle appears in public listings after approval
  - Status transitions work correctly

### Performance & Load Testing
- [ ] **Booking list queries** performant (< 200ms)
- [ ] **Vehicle search** returns results quickly
- [ ] **Concurrent payments** handled without race conditions
- [ ] **Database indexes** properly utilized
- [ ] **Memory leaks** checked in long-running jobs

## Migration (If from existing Alina database)

### Pre-Migration
- [ ] Full database backup created
- [ ] Backup stored in safe location
- [ ] Downtime window scheduled
- [ ] Migration scripts prepared and tested
- [ ] Rollback procedures documented

### During Migration
- [ ] All data migrated (Unit→Vehicle)
- [ ] Field mappings applied (unitId→vehicleId, guestPhone→renterPhone)
- [ ] Indexes created
- [ ] Verification queries run
- [ ] No orphaned references

### Post-Migration
- [ ] Sample bookings queried and verified
- [ ] User dashboard loads correctly
- [ ] Owner vehicle pages work
- [ ] Admin can see all bookings
- [ ] Payment history intact and accessible

## Production Deployment

### Infrastructure
- [ ] Database replicated and backed up
- [ ] Server instances load-balanced
- [ ] SSL/TLS certificates valid
- [ ] Environment variables set correctly
- [ ] Monitoring/alerting configured
- [ ] Log aggregation enabled

### Application Startup
- [ ] Server starts without errors
- [ ] All routes registered
- [ ] Database connection successful
- [ ] Third-party APIs accessible (M-Pesa, Paystack, Resend, Africa's Talking)
- [ ] Cron jobs enabled

### First Hours Monitoring
- [ ] Error rate abnormal (< 0.1%)
- [ ] Response times normal (< 300ms median)
- [ ] Database performance stable
- [ ] Background jobs completing successfully
- [ ] Email/SMS delivery working
- [ ] No broken references in logs

### 24-Hour Monitoring
- [ ] Booking flow working end-to-end
- [ ] Payments processing correctly
- [ ] Access codes being generated and sent
- [ ] Check-in notifications dispatched
- [ ] No memory leaks or crashes
- [ ] Admin dashboard responsive

## Rollback Plan

### If Critical Issues Found
1. **Stop new bookings** - Set feature flag to reject new bookings
2. **Keep server running** - Maintain existing bookings
3. **Revert to previous code** - Roll back application version
4. **Restore database** - Return to pre-migration state
5. **Test fully** - Verify rollback successful before accepting traffic

### Rollback Triggers
- Payment processing failures
- Booking date conflicts appearing (logic broken)
- Access codes not generating
- Multiple errors in logs
- API response times > 1 second (sustained)

## Post-Deployment (1 Week)

### User Communication
- [ ] Documentation updated for vehicle terminology
- [ ] API docs show vehicleId parameter (not unitId)
- [ ] Admin guide updated with new fields
- [ ] Support team trained on new system

### Data Analysis
- [ ] Booking volume tracking normal
- [ ] Average booking completion rate
- [ ] Payment success rate (target: > 95%)
- [ ] User feedback collected
- [ ] No data integrity issues reported

### System Health
- [ ] Uptime > 99.9%
- [ ] No unhandled errors
- [ ] Database size stable
- [ ] Cache hit rates optimal
- [ ] Third-party API integrations stable

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Development Lead | | | |
| QA Lead | | | |
| DevOps | | | |
| Product Manager | | | |
| CEO/Founder | | | |

## Notes & Observations

```
[Space for deployment notes]
```

## Troubleshooting Quick Reference

| Issue | Cause | Solution |
|-------|-------|----------|
| "vehicleId not found" | Database not migrated | Run migration scripts from DATABASE_MIGRATION.md |
| Bookings failing to create | Old schema still in use | Verify db connection, restart server |
| SMS not sent to renterPhone | Phone field not migrated | Check renterPhone field exists in Booking |
| Tests failing with unitId | Old code still referenced | Run refactoring verification (grep for unitId) |
| Email showing Alina branding | Old template files cached | Clear email template cache, restart |
| Access code 24-hour issue | Timezone confusion | Verify UTC handling in calculateNights() |
| Admin can't see all bookings | Role not updated | Verify admin role has booking:read:all permission |
| Payment callbacks failing | Third-party configuration | Verify M-Pesa/Paystack credentials in env vars |

## Additional Resources

- [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) - Complete refactoring documentation
- [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) - Database migration procedures
- [API Documentation](../API_DOCS.md) - Updated endpoint documentation
- [Architecture Overview](../ARCHITECTURE.md) - System design documentation
