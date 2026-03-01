# Installation and Setup Guide

## Digital Gram Panchayat Services Portal

### Prerequisites

Before starting, ensure you have the following installed on your system:

1. **Node.js** (v14 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **MySQL** (v5.7 or higher)
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Verify installation: `mysql --version`

3. **Git** (optional, for version control)
   - Download from: https://git-scm.com/

### Step-by-Step Installation

#### 1. Extract/Clone the Project

If you have a ZIP file, extract it to your desired location.
```bash
cd g:\anju\gram-panchayat-portal
```

#### 2. Install Dependencies

Open PowerShell or Command Prompt in the project directory and run:

```powershell
npm install
```

This will install all required Node.js packages including Express, MySQL, bcrypt, etc.

#### 3. Set Up MySQL Database

**Option A: Using MySQL Workbench (GUI)**
1. Open MySQL Workbench
2. Connect to your local MySQL server
3. Open the file `database/schema.sql`
4. Execute the entire script (click lightning bolt icon)

**Option B: Using Command Line**
```powershell
mysql -u root -p < database/schema.sql
```
Enter your MySQL root password when prompted.

This will:
- Create the database `gram_panchayat_db`
- Create all necessary tables
- Insert sample data (services, admin account, etc.)

#### 4. Configure Environment Variables

1. Open the `.env` file in the root directory
2. Update the following values with your MySQL credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=gram_panchayat_db
DB_PORT=3306

# Server Configuration
PORT=3000

# JWT Secret (change this to a random string)
JWT_SECRET=your_random_secret_key_change_this_in_production

# Session Secret (change this to a random string)
SESSION_SECRET=your_session_secret_change_this

# Email Configuration (Optional - for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_email_app_password
```

**Important Notes:**
- Replace `your_mysql_password_here` with your actual MySQL password
- For Gmail SMTP, you need to use an "App Password" (see Gmail security settings)
- Email configuration is optional; the system will work without it

#### 5. Create Upload Directories

The application will create these automatically, but you can create them manually:

```powershell
New-Item -Path "uploads/documents" -ItemType Directory -Force
New-Item -Path "uploads/certificates" -ItemType Directory -Force
```

#### 6. Start the Server

```powershell
npm start
```

For development with auto-restart on file changes:
```powershell
npm run dev
```

You should see output like:
```
===========================================
Digital Gram Panchayat Services Portal
===========================================
✓ Database connected successfully
✓ Server running on http://localhost:3000
✓ Environment: development
===========================================
```

#### 7. Access the Application

Open your web browser and navigate to:
- **Main Portal**: http://localhost:3000
- **Login Page**: http://localhost:3000/login
- **Register Page**: http://localhost:3000/register

### Default Login Credentials

After database setup, use these credentials to test the system:

**Citizen Account:**
- Email: rajesh.kumar@example.com
- Password: (You'll need to register as a new citizen)

**Staff Account:**
- Email: ramesh.kumar@grampanchayat.gov.in
- Password: staff123 (default - change in database)

**Admin Account:**
- Email: admin@grampanchayat.gov.in
- Password: admin123 (default - change in database)

Note: The sample passwords are hashed. You'll need to either:
1. Register new accounts, OR
2. Update the password hashes in the database using bcrypt

### Creating Admin/Staff Passwords

To create password hashes for admin/staff:

1. Create a temporary file `hash.js`:
```javascript
const bcrypt = require('bcrypt');
const password = 'your_password_here';
bcrypt.hash(password, 10).then(hash => console.log(hash));
```

2. Run it:
```powershell
node hash.js
```

3. Copy the hash and update in MySQL:
```sql
UPDATE admin SET password_hash = 'your_hash_here' WHERE email = 'admin@grampanchayat.gov.in';
```

### Troubleshooting

#### Problem: "Cannot connect to database"
**Solution:**
- Verify MySQL is running: `mysql -u root -p`
- Check DB credentials in `.env` file
- Ensure database `gram_panchayat_db` exists

#### Problem: "Port 3000 already in use"
**Solution:**
- Change PORT in `.env` file to another port (e.g., 3001)
- Or stop the process using port 3000:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

#### Problem: "Module not found"
**Solution:**
- Delete `node_modules` folder
- Run `npm install` again

#### Problem: "File upload not working"
**Solution:**
- Ensure `uploads` directory exists and has write permissions
- Check file size limits (currently 5MB)

### Project Structure

```
gram-panchayat-portal/
├── database/
│   └── schema.sql          # Database schema and sample data
├── middleware/
│   └── auth.js             # Authentication middleware
├── public/
│   ├── css/
│   │   └── style.css       # Main stylesheet
│   └── js/
│       └── citizen-dashboard.js  # Citizen dashboard scripts
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── citizen.js          # Citizen-specific routes
│   ├── staff.js            # Staff-specific routes
│   ├── admin.js            # Admin-specific routes
│   └── common.js           # Public routes
├── utils/
│   ├── email.js            # Email notification utilities
│   └── pdf.js              # PDF generation utilities
├── views/
│   ├── citizen/
│   │   └── dashboard.html  # Citizen dashboard
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   └── register.html       # Registration page
├── uploads/                # File upload directory (created automatically)
├── .env                    # Environment variables
├── .gitignore             # Git ignore file
├── package.json           # Node.js dependencies
├── README.md              # Project documentation
└── server.js              # Main server file
```

### Development Tips

1. **Run in development mode** with auto-restart:
   ```powershell
   npm run dev
   ```

2. **Check server logs** for debugging in the terminal

3. **Test API endpoints** using tools like Postman or Thunder Client

4. **Database changes**: After modifying schema.sql, drop and recreate database:
   ```sql
   DROP DATABASE gram_panchayat_db;
   ```
   Then re-run schema.sql

### Next Steps

1. **Customize**:
   - Update panchayat information in database
   - Add your logo image to `public/images/logo.png`
   - Modify colors in CSS if needed

2. **Secure for Production**:
   - Change all default passwords
   - Update JWT_SECRET and SESSION_SECRET
   - Enable HTTPS
   - Set up proper email server

3. **Add Features**:
   - Payment gateway integration
   - SMS notifications
   - Staff and Admin dashboards (UI)
   - Report generation

### Support

For issues or questions:
1. Check the README.md file
2. Review database schema in `database/schema.sql`
3. Check console logs for error messages

### Important Security Notes

⚠️ **Before deploying to production:**
1. Change all default passwords
2. Update JWT_SECRET and SESSION_SECRET to random strings
3. Use environment-specific .env files
4. Enable HTTPS
5. Set up proper backup systems
6. Review and update CORS settings
7. Implement rate limiting
8. Add input validation and sanitization

---

**Created for educational purposes**
College Project - Digital Gram Panchayat Services Portal
