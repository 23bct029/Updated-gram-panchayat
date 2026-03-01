# 📊 Staff Dashboard Architecture & Data Flow

## Visual Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  STAFF DASHBOARD                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  📊 Analytics Dashboard                                                             │
│  View application statistics and trends                                             │
│                                                                                       │
│  Select Period:                                                                      │
│  [Today] [Yesterday] [Last 7 Days] [Monthly] [Yearly] [All Time]                   │
│                                                                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                         SUMMARY STATISTICS CARDS                                     │
├─────────────────┬──────────────────┬──────────────────────────────────────────────┤
│                 │                  │                                              │
│  🟠 PENDING     │  🔵 UNDER REVIEW │  🟢 APPROVED                                │
│  Awaiting       │  Being Verified  │  Completed                                  │
│  Verification   │                  │                                              │
│                 │                  │                                              │
│  COUNT: 45      │  COUNT: 12       │  COUNT: 38                                   │
│                 │                  │                                              │
├─────────────────┴──────────────────┴──────────────────────────────────────────────┤
│                                                                                       │
│  APPLICATION TRENDS                                                                  │
│                                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  PENDING APPS        │  │  UNDER REVIEW        │  │  APPROVED APPS           │ │
│  │                      │  │                      │  │                          │ │
│  │   ▲                  │  │   ▲                  │  │   ▲                      │ │
│  │   │                  │  │   │                  │  │   │                      │ │
│  │   │  ░░░              │  │   │  ░░░              │  │   │  ░░░                 │ │
│  │   │  ░░░  ░░░         │  │   │  ░░░  ░░░         │  │   │  ░░░  ░░░            │ │
│  │   │  ░░░  ░░░ ░░░     │  │   │  ░░░  ░░░ ░░░     │  │   │  ░░░  ░░░ ░░░       │ │
│  │   └──────────────────┤  │   └──────────────────┤  │   └──────────────────────┤ │
│  │   M T W T F S S      │  │   M T W T F S S      │  │   M T W T F S S         │ │
│  │                      │  │                      │  │                          │ │
│  │ [Daily] [Mo] [Year]  │  │ [Daily] [Mo] [Year]  │  │ [Daily] [Mo] [Year]      │ │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────────┘ │
│                                                                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                         QUICK ACTIONS                                               │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────────┐  │
│  │  📥 View Apps     │  │  ✓ Verify Docs    │  │  ✔ Approve Applications      │  │
│  └───────────────────┘  └───────────────────┘  └───────────────────────────────┘  │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Time Period & Data Aggregation

### Period Selection Flow

```
USER CLICKS TIME PERIOD
│
├─ TODAY
│  └─ Filter: created_at = today's date → Show only 5 apps from today
│
├─ YESTERDAY
│  └─ Filter: created_at = yesterday's date → Show only 3 apps from yesterday
│
├─ LAST 7 DAYS
│  └─ Filter: created_at >= (today - 7 days) → Show 25 apps from last week
│
├─ MONTHLY (30 days)
│  └─ Filter: created_at >= (today - 30 days) → Show 78 apps from last month
│
├─ YEARLY
│  └─ Filter: created_at >= Jan 1 of current year → Show 234 apps YTD
│
└─ ALL TIME
   └─ No filter → Show all 892 applications ever submitted
```

## Chart Data Aggregation Examples

### DAILY VIEW (Last 7 Days)
```
Pending Applications Chart (Last 7 Days)

           12 ┤
              │
           10 ┤  
              │      
            8 ┤      ░░░      
              │  ░░░ ░░░ ░░░
            6 ┤  ░░░ ░░░ ░░░ ░░░
              │  ░░░ ░░░ ░░░ ░░░
            4 ┤  ░░░ ░░░ ░░░ ░░░ ░░░
              │  ░░░ ░░░ ░░░ ░░░ ░░░
            2 ┤  ░░░ ░░░ ░░░ ░░░ ░░░ ░░░  
              │  ░░░ ░░░ ░░░ ░░░ ░░░ ░░░
            0 ├──┴───┴───┴───┴───┴───┴───┴──
              Mon Tue Wed Thu Fri Sat Sun

Data:
- Monday        5 applications
- Tuesday       8 applications  
- Wednesday    12 applications ← Peak
- Thursday      7 applications
- Friday        3 applications
- Saturday      6 applications
- Sunday        4 applications
```

### MONTHLY VIEW (Last 12 Months)
```
Pending Applications (Last 12 Months)

           ▲
           │
        45 ┤
           │
        40 ┤  
           │      
        35 ┤            ░░░
           │            ░░░
        30 ┤      ░░░   ░░░
           │  ░░░ ░░░   ░░░ ░░░
        25 ┤  ░░░ ░░░   ░░░ ░░░ ░░░
           │  ░░░ ░░░   ░░░ ░░░ ░░░
        20 ┤  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░
           │  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░
        15 ┤  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░
           │  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░
        10 ┤  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░ ░░░
           │  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░ ░░░
         5 ┤  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░
           │  ░░░ ░░░   ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░
         0 └──┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴────
           Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan
           '25 '25 '25 '25 '25 '25 '25 '25 '25 '25 '25 '26

Data (with year labels):
- Feb '25      15 applications
- Mar '25      22 applications
- Apr '25      18 applications
- May '25      25 applications
- Jun '25      28 applications
- Jul '25      35 applications ← Peak
- Aug '25      30 applications
- Sep '25      26 applications
- Oct '25      32 applications
- Nov '25      38 applications
- Dec '25      42 applications
- Jan '26      12 applications (partial month)
```

### YEARLY VIEW (Last 5 Years)
```
Pending Applications (Last 5 Years)

           ▲
           │
        600 ┤
            │
        500 ┤  ░░░
            │  ░░░
        400 ┤  ░░░ ░░░
            │  ░░░ ░░░
        300 ┤  ░░░ ░░░ ░░░
            │  ░░░ ░░░ ░░░
        200 ┤  ░░░ ░░░ ░░░ ░░░
            │  ░░░ ░░░ ░░░ ░░░
        100 ┤  ░░░ ░░░ ░░░ ░░░ ░░░
            │  ░░░ ░░░ ░░░ ░░░ ░░░
          0 └──┴───┴───┴───┴───┴────
            2022 2023 2024 2025 2026

Data:
- 2022:  280 total applications (20% growth)
- 2023:  456 total applications (63% growth)
- 2024:  623 total applications (37% growth) ← Peak year
- 2025:  545 total applications (-13%, partial year)
- 2026:  128 total applications (few days only)

Insights:
→ Applications growing year over year
→ 2024 was busiest year
→ 2026 just started
```

## Database Query Execution Timeline

```
STAFF MEMBER NAVIGATES TO DASHBOARD
│
├─ Client loads dashboard HTML & JavaScript
├─ Browser sends JWT token in Authorization header
│
▼
REQUEST TO /staff/applications API
│
├─ Server validates JWT token
├─ Confirms user is staff member
│
▼
DATABASE QUERY EXECUTED
│
├─ SQL: SELECT a.*, s.service_name, u.full_name as citizen_name, u.phone, u.email
       FROM applications a
       JOIN services s ON a.service_id = s.service_id
       JOIN users u ON a.user_id = u.user_id
       ORDER BY a.created_at DESC
│
├─ SQLite file (gram_panchayat.db) loaded into memory
├─ All 892 application records fetched
├─ Joined with service and user data
│
▼
RESPONSE SENT TO CLIENT
│
├─ JSON array with all applications
├─ Size: ~500KB to 5MB depending on data
│
▼
JAVASCRIPT PROCESSES DATA
│
├─ Filters by status (Pending, Verification, Verified)
├─ Calculates statistics for selected period
├─ Aggregates data by day/month/year
├─ Groups applications for each table
│
▼  
DASHBOARD UPDATES
│
├─ Statistics cards update with counts
├─ Charts render with aggregated data
├─ Tables populate with filtered applications
└─ All animations play smoothly
```

## Status Progression Workflow

```
NEW APPLICATION SUBMITTED
│
├─ Initial Status: PENDING
│  └─ Appears in: Applications Tab
│  └─ Shown in: Pending chart
│  └─ Staff action: Review documents
│
▼
STAFF MARKS FOR VERIFICATION
│
├─ Status Changes: PENDING → VERIFICATION
│  └─ Appears in: Verify Tab
│  └─ Shown in: Under Review chart
│  └─ Staff action: Verify documents
│
▼
DOCUMENTS VERIFIED
│
├─ Status Changes: VERIFICATION → VERIFIED
│  └─ Appears in: Approve Tab
│  └─ Shown in: Still in Under Review chart
│  └─ Staff action: Generate certificate
│
▼
FINAL APPROVAL
│
├─ Status Changes: VERIFIED → APPROVED
│  └─ Appears in: Approved Tab
│  └─ Shown in: Approved chart
│  └─ Citizen receives: Digital certificate
│
▼
APPLICATION COMPLETE
│
└─ Final status: APPROVED
   └─ Stored in history: status_history table
   └─ Certificate ready: Can be downloaded
```

## Performance Metrics

### Data Load Time
```
API Response Time:
- 0-100 apps:    < 100ms
- 100-500 apps:  100-300ms
- 500-1000 apps: 300-800ms
- 1000+ apps:    > 1 second

Recommendation:
When apps exceed 2000, implement pagination
or filter older records to archive database
```

### Chart Rendering
```
Daily View (7 days):
- Data Points: 7
- Render Time: < 200ms
- File Size: ~5KB

Monthly View (12 months):
- Data Points: 12
- Render Time: < 300ms
- File Size: ~8KB

Yearly View (5 years):
- Data Points: 5
- Render Time: < 150ms
- File Size: ~4KB
```

### Browser Compatibility
```
✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+

Note: Older browsers may show degraded charts
```

## API Endpoints Used

```
GET /staff/applications
├─ Purpose: Fetch all applications with related data
├─ Response: JSON array of 892 records
├─ Fields: application_id, user_id, service_id, status, 
│          created_at, citizen_name, service_name, phone, email
├─ Time: ~300-800ms depending on data volume
└─ Used by: Dashboard statistics, charts, tables

GET /staff/statistics
├─ Purpose: Get aggregated counts
├─ Response: { total, pending, verification, approved, rejected }
├─ Time: ~50-100ms
└─ Fallback: Calculated locally if needed

PUT /staff/application/:id/status
├─ Purpose: Update application status
├─ Body: { status: "Verification", remarks: "..." }
├─ Response: { success: true, message: "..." }
└─ Used by: Change status dropdown
```

---

## 🎯 Key Numbers

| Metric | Value |
|--------|-------|
| Database Size | ~5MB (for 1000 apps) |
| API Response | 100-800ms |
| Chart Render | 150-300ms |
| Page Load | < 3 seconds |
| CSS Size | ~50KB |
| Chart.js Size | ~75KB |

## 🎨 Color Scheme

```
Pending Applications:  #f59e0b (Amber/Orange)
Under Review:          #3b82f6 (Blue)
Approved:              #10b981 (Green)

Borders:               #e5e7eb (Light Gray)
Text:                  #374151 (Dark Gray)
Background:            #ffffff (White)
```

---

**Diagram Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Complete
