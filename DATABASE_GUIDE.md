# Database Management & Enhanced Dashboard Guide

## 📊 Database System Overview

### Current Setup
Your **Gram Panchayat Portal** uses **SQLite3** as the database system (NOT Superbase or cloud-based):

```
Database Type:     SQLite3 (Local file-based)
Database File:     /database/gram_panchayat.db
NPM Package:       sqlite3 v5.1.7
Storage:           Local file system (no external server)
Connection Model:  Direct file-based (in-process)
```

### Why SQLite3?
✅ **Advantages:**
- No separate server needed
- Data stored locally
- Lightweight and fast
- Perfect for college projects and learning
- Easy to backup (just copy the .db file)
- No additional infrastructure costs

❌ **When to migrate to Superbase/PostgreSQL:**
- When you need cloud synchronization
- Multiple servers sharing the same database
- High-concurrency applications (100+ simultaneous users)
- Disaster recovery and automatic backups

---

## 📁 Database Schema

### Core Tables

#### **applications** (Main Table)
```
application_id    INTEGER (Primary Key)
user_id           INTEGER (Foreign Key → users)
service_id        INTEGER (Foreign Key → services)
application_data  TEXT (Stores JSON data)
status            TEXT (Pending, Verification, Under Review, Verified, Approved, Rejected)
assigned_to       INTEGER (Staff ID)
remarks           TEXT
priority          TEXT
created_at        TIMESTAMP (Automatically set to CURRENT_TIMESTAMP)
updated_at        TIMESTAMP
```

#### **users** (Citizens)
```
user_id           INTEGER (Primary Key)
full_name         TEXT
email             TEXT (UNIQUE)
phone             TEXT
aadhar_number     TEXT (UNIQUE)
password_hash     TEXT
address           TEXT
village           TEXT
block             TEXT
district          TEXT
state             TEXT
pincode           TEXT
date_of_birth     DATE
gender            TEXT
is_active         BOOLEAN
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

#### **staff** (Staff Members)
```
staff_id          INTEGER (Primary Key)
full_name         TEXT
email             TEXT (UNIQUE)
phone             TEXT
password_hash     TEXT
role              TEXT
employee_id       TEXT (UNIQUE)
department        TEXT
panchayat_name    TEXT
is_active         BOOLEAN
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

#### **services** (Available Services)
```
service_id        INTEGER (Primary Key)
service_name      TEXT
service_type      TEXT
description       TEXT
required_documents TEXT
processing_time    TEXT
fee               DECIMAL
is_active         BOOLEAN
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

#### **documents** (Application Documents)
```
document_id       INTEGER (Primary Key)
application_id    INTEGER (Foreign Key)
document_type     TEXT
document_name     TEXT
file_path         TEXT
file_size         INTEGER
is_verified       BOOLEAN
verified_by       INTEGER (Staff ID)
verified_on       TIMESTAMP
uploaded_on       TIMESTAMP
```

#### **status_history** (Application Status Changes)
```
history_id        INTEGER (Primary Key)
application_id    INTEGER (Foreign Key)
old_status        TEXT
new_status        TEXT
changed_by        INTEGER (Staff ID)
user_type         TEXT
remarks           TEXT
changed_at        TIMESTAMP
```

---

## 🚀 How Data Flows (Citizen Submits Application)

```
1. CITIZEN SUBMITS APPLICATION
   ↓
2. INSERT INTO applications (user_id, service_id, status='Pending', created_at=NOW())
   ↓
3. API Response: application_id returned
   ↓
4. STAFF SEES IN DASHBOARD (Applications Tab)
   ↓
5. COUNTS IN STATISTICS CARDS:
   - Pending Count
   - Under Review Count
   - Approved Count
   ↓
6. STAFF VERIFIES DOCUMENTS
   ↓
7. UPDATE applications SET status='Verification', assigned_to=staff_id
   ↓
8. INSERT INTO status_history (old_status='Pending', new_status='Verification')
   ↓
9. STAFF APPROVES APPLICATION
   ↓
10. UPDATE applications SET status='Verified'
    Generate Certificate PDF
    INSERT INTO certificates table
   ↓
11. APPLICATION SHOWN IN "APPROVED" TAB
```

---

## 📊 Enhanced Dashboard Features

### 1. Time Period Selection
- **Today** - Applications submitted today
- **Yesterday** - Previous day's applications
- **Last 7 Days** - Weekly view
- **Monthly** - Last 30 days
- **Yearly** - Year-to-date (Jan 1 - Today)
- **All Time** - Complete history

### 2. Summary Statistics Cards
Shows 3 key metrics:
- **Pending** - Applications awaiting verification (Orange)
- **Under Review** - Being verified by staff (Blue)
- **Approved** - Completed with certificate (Green)

### 3. Three Interactive Charts
Each chart shows application counts with multiple view options:

#### Chart Views:
- **Daily** - Last 7 days (shows Mon, Tue, Wed, etc.)
- **Monthly** - Last 12 months (Jan'24, Feb'24, etc. with year label)
- **Yearly** - Last 5 years (2022, 2023, 2024, 2025, 2026)

#### Chart Types:
1. **Pending Applications Chart** (Amber/Orange bars)
2. **Under Review Chart** (Blue bars)
3. **Approved Applications Chart** (Green bars)

### 4. Application List Pages
- **Applications Tab** - Pending applications with full details
- **Verify Tab** - Applications ready for verification
- **Approve Tab** - Verified applications ready for approval

---

## 🔧 API Endpoints Used

### Staff Routes (`/api/staff/`)

#### Get All Applications
```
GET /staff/applications
Headers: Authorization: Bearer {token}
Response: Array of applications with joined data (service_name, citizen_name, phone, email)
```

#### Get Statistics
```
GET /staff/statistics
Headers: Authorization: Bearer {token}
Response: {
  total: number,
  pending: number,
  verification: number,
  approved: number,
  rejected: number
}
```

#### Update Application Status
```
PUT /staff/application/:id/status
Body: { status: "Verification", remarks: "..." }
Headers: Authorization: Bearer {token}
```

#### Approve Application
```
POST /staff/application/:id/approve
Headers: Authorization: Bearer {token}
Response: Certificate PDF generated and returned
```

---

## 💾 Data Persistence

### How Data is Stored
1. All data is stored in `gram_panchayat.db` (SQLite binary file)
2. Located at: `/database/gram_panchayat.db`
3. File size grows with more records

### Backup
```bash
# Backup database
cp /database/gram_panchayat.db /database/gram_panchayat.db.backup

# Restore from backup
cp /database/gram_panchayat.db.backup /database/gram_panchayat.db
```

### Reset Database
```bash
# Delete database file to reset (will recreate on next server start)
rm /database/gram_panchayat.db
npm start  # Server will recreate with seed data
```

---

## 🔑 Default Credentials

| User Type | Email | Password |
|-----------|-------|----------|
| Citizen | citizen@example.com | citizen123 |
| Staff | staff@example.com | staff123 |
| Admin | admin@example.com | admin123 |

---

## 📈 Dashboard Statistics Calculation

### Time Period Filtering Logic

```javascript
// Today
startDate = new Date();
startDate.setHours(0, 0, 0, 0);  // 00:00:00

// Yesterday
yesterday.toDateString() === appDate.toDateString()

// Last 7 Days
startDate = today - 7 days

// Monthly (30 days)
startDate = today - 30 days

// Yearly
startDate = Jan 1 of current year

// All Time
No filtering
```

### Aggregation Examples

#### Daily View (Bar Chart)
```
Mon 12: 5 new applications
Tue 13: 3 new applications
Wed 14: 8 new applications
...
Sun 18: 2 new applications
```

#### Monthly View (12 months)
```
Oct '25: 45 applications
Nov '25: 52 applications
Dec '25: 38 applications
Jan '26: 15 applications (partial month)
```

#### Yearly View (5 years)
```
2022: 280 total applications
2023: 456 total applications
2024: 623 total applications
2025: 545 total applications (partial year)
2026: 128 total applications (few days)
```

---

## 🛠️ Troubleshooting

### Dashboard Shows Empty/No Data

**Problem:** Statistics cards show 0

**Solutions:**
1. Check if server is running:
   ```bash
   curl http://localhost:3000/staff/dashboard
   ```

2. Check if applications exist in database:
   ```bash
   sqlite3 /database/gram_panchayat.db
   sqlite> SELECT COUNT(*) FROM applications;
   ```

3. Verify token is valid (check browser console)

4. Check network requests in DevTools → Network tab

### Charts Not Loading

**Problem:** Charts show "No data available"

**Solutions:**
1. Press F12 → Console tab
2. Check for JavaScript errors
3. Verify Chart.js library loaded:
   ```bash
   curl http://localhost:3000/staff/dashboard | grep "Chart.js"
   ```

### Database File Too Large

**Problem:** `gram_panchayat.db` growing large

**Solutions:**
1. Archive old data and delete:
   ```bash
   # Export to CSV for archive
   sqlite3 -header -csv /database/gram_panchayat.db \
     "SELECT * FROM applications WHERE created_at < date('now', '-1 month');" > archive.csv
   
   # Delete old records
   sqlite3 /database/gram_panchayat.db \
     "DELETE FROM applications WHERE created_at < date('now', '-6 months');"
   ```

2. Vacuum database to reclaim space:
   ```bash
   sqlite3 /database/gram_panchayat.db "VACUUM;"
   ```

---

## 📚 When to Upgrade to Superbase/PostgreSQL

### Consider migration when:
- ✅ Multiple panchayats on one platform
- ✅ More than 100 concurrent users
- ✅ Need cloud sync across regions
- ✅ Automatic daily backups required
- ✅ Data replication needed

### Migration Path:
1. Export SQLite to CSV
2. Create PostgreSQL schema
3. Import CSV data
4. Update connection string in server.js
5. Change database wrapper from sqlite3 to pg

---

## 📞 Quick Reference

### Start Server
```bash
cd gram-panchayat-portal-main
npm start
```

### Access Dashboard
```
Citizen:  http://localhost:3000/views/login.html
Staff:    http://localhost:3000/views/login.html → Select "Staff"
Admin:    http://localhost:3000/views/login.html → Select "Admin"
```

### View Database
```bash
sqlite3 /database/gram_panchayat.db
sqlite> .schema applications
sqlite> SELECT * FROM applications LIMIT 5;
sqlite> .quit
```

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Enhanced Dashboard v1.0 - Production Ready
