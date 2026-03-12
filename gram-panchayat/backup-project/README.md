# 🚀 Gram Panchayat – 10 New Features Integration Guide

## Files Provided

```
gram-panchayat-upgrade/
├── routes/
│   ├── citizen.js          ← Replace your existing routes/citizen.js
│   ├── staff.js            ← Replace your existing routes/staff.js
│   ├── admin.js            ← Replace your existing routes/admin.js
│   └── common.js           ← NEW: Add this file (public QR verification)
├── views/
│   ├── citizen/dashboard.html  ← Replace your existing citizen dashboard
│   ├── staff/dashboard.html    ← Replace your existing staff dashboard
│   ├── admin/dashboard.html    ← Replace your existing admin dashboard
│   └── verify.html             ← NEW: Add this file (public verify page)
├── database/
│   └── migrate-new-features.js ← Run this ONCE to add new DB tables
└── SERVER_PATCH.js             ← Instructions to patch server.js
```

---

## Step-by-Step Integration

### Step 1: Run Database Migration
```bash
node database/migrate-new-features.js
```
This creates all new tables and adds new columns. It is **safe to run multiple times** – it skips existing tables.

### Step 2: Replace Route Files
```bash
cp gram-panchayat-upgrade/routes/citizen.js routes/citizen.js
cp gram-panchayat-upgrade/routes/staff.js   routes/staff.js
cp gram-panchayat-upgrade/routes/admin.js   routes/admin.js
cp gram-panchayat-upgrade/routes/common.js  routes/common.js   # NEW
```

### Step 3: Replace View Files
```bash
cp gram-panchayat-upgrade/views/citizen/dashboard.html views/citizen/dashboard.html
cp gram-panchayat-upgrade/views/staff/dashboard.html   views/staff/dashboard.html
cp gram-panchayat-upgrade/views/admin/dashboard.html   views/admin/dashboard.html
cp gram-panchayat-upgrade/views/verify.html            views/verify.html            # NEW
```

### Step 4: Patch server.js
Add the two lines marked `✅ NEW` from `SERVER_PATCH.js` into your `server.js`:

```js
// Add this import:
const commonRoutes = require('./routes/common');

// Add this route (after all other app.use() calls):
app.use('/', commonRoutes);
```

### Step 5: Restart Server
```bash
npm start
# or for development:
npm run dev
```

---

## ✅ Features Implemented

| # | Feature | Location | Status |
|---|---------|----------|--------|
| 1 | Smart Application Correction System | Citizen: "Corrections" tab; Staff: "Request Correction" button | ✅ |
| 2 | Certificate Renewal System | Citizen: "Renewals" tab | ✅ |
| 3 | Certificate Hash Security | Auto-generated SHA256 hash on approval | ✅ |
| 4 | QR Code on Certificates | Merged into "My Certificates" tab | ✅ |
| 5 | Multi-Certificate Requests | Citizen: "Multi-Application" tab | ✅ |
| 6 | Citizen Service Timeline | Citizen: "My Timeline" tab | ✅ |
| 7 | Village Demographics Dashboard | Admin: "Demographics" tab | ✅ |
| 8 | Service Usage Insights | Admin: "Insights" tab | ✅ |
| 9 | Fair Application Processing Queue | Staff: Priority queue + "Get Next" button | ✅ |
| 10 | Staff Workload Distribution | Admin: "Workload Distribution" tab | ✅ |

---

## New API Endpoints

### Citizen
```
GET  /api/citizen/corrections                  → List correction requests
POST /api/citizen/corrections/:id/resubmit     → Resubmit corrected application
GET  /api/citizen/certificates/renewable       → List certificates eligible for renewal
POST /api/citizen/certificates/:id/renew       → Submit renewal application
GET  /api/citizen/certificates/:id/verify      → Verify certificate
POST /api/citizen/multi-application            → Submit multi-cert request
GET  /api/citizen/multi-application            → List multi-cert requests
GET  /api/citizen/multi-application/:id        → Get multi-cert detail
GET  /api/citizen/timeline                     → Get citizen timeline
```

### Staff
```
POST /api/staff/applications/:id/request-correction → Request correction
GET  /api/staff/corrections/pending                 → Pending resubmissions
POST /api/staff/corrections/:id/approve             → Approve correction
GET  /api/staff/queue/next                          → Get next in queue
GET  /api/staff/workload                            → Own workload stats
```

### Admin
```
GET  /api/admin/demographics                → Live demographics data
POST /api/admin/demographics/snapshot       → Save demographic snapshot
GET  /api/admin/insights/services           → Service usage analytics
GET  /api/admin/insights/usage-trends       → Monthly application trends
GET  /api/admin/workload/all               → All staff workload
POST /api/admin/rebalance                  → Auto-rebalance workload
```

### Public (No Auth Required)
```
GET /verify/:hash                          → Certificate verification page
GET /api/verify/certificate/:id           → Verify by certificate ID (JSON)
GET /api/verify/hash/:hash                → Verify by SHA256 hash (JSON)
```

---

## Important Notes

- **No existing features are broken** – all new routes are additions
- **No CSS was changed** – same color scheme (`#2563eb`, grayscale neutrals)
- **QR codes** appear automatically on issued certificates using `qrcodejs`
- **Timeline events** are auto-recorded whenever applications are submitted/approved/corrected
- **Hash generation** happens automatically when applications are approved
- The **demographics page** computes live data from the `users` table and also supports saved snapshots

---

## Troubleshooting

**Q: QR code not showing?**
A: Ensure CDN access to `cdnjs.cloudflare.com` is available. The QR library is loaded from CDN.

**Q: "renewable" endpoint returns empty?**  
A: Certificates need `expiry_date` set. This is set automatically when new certs are issued after migration. Existing certs without expiry dates won't appear.

**Q: Demographics shows zeros?**  
A: The `gender` and `dob` columns are new. Existing users won't have these values. The total citizen count will still work correctly.

**Q: Staff workload not updating?**  
A: Make sure `staff_workload` table exists (run migration) and that staff users have rows seeded. The migration script does this automatically.