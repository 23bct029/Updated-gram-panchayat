# Digital Gram Panchayat Services Portal

A comprehensive web-based platform for digitalizing Gram Panchayat services, enabling citizens to apply for certificates, access government schemes, upload documents, and track application status online.

## Project Overview

This project replaces the traditional manual paperwork system with a modern digital solution that provides:
- Online certificate applications
- Real-time status tracking
- Document upload and management
- Government scheme information
- Transparent and efficient service delivery

## Features

### 1. Citizen Module
- Registration and Login
- Apply for various certificates (Income, Caste, Residence, etc.)
- Upload supporting documents
- Track application status in real-time
- Download approved certificates
- View service history

### 2. Panchayat Staff Module
- Staff authentication
- Application dashboard
- Document verification
- Approve/Reject applications
- Add remarks and update status
- Generate certificate PDFs

### 3. Admin Module
- Manage services (Add/Edit/Delete)
- Manage user and staff accounts
- Configure certificate templates
- View system logs and reports

### 4. Information Module
- Display government schemes
- Document requirements for each service
- Panchayat contact information
- Announcements and notices

### 5. Notification & Status Module
- Email notifications for application updates
- Status dashboard
- Auto-generated acknowledgement receipts

### 6. Document Management Module
- Secure document upload
- Document validation
- Preview functionality
- PDF certificate generation
- Document history tracking

### 7. Payment Module (Optional)
- Display service fees
- Dummy payment gateway integration
- Payment receipt generation
- Payment history

## Technology Stack

**Frontend:**
- HTML5
- CSS3
- JavaScript (Vanilla)

**Backend:**
- Node.js
- Express.js

**Database:**
- MySQL

**Additional Libraries:**
- bcrypt (password hashing)
- jsonwebtoken (authentication)
- multer (file uploads)
- nodemailer (email notifications)
- pdfkit (PDF generation)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd gram-panchayat-portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env` file and update with your credentials
   - Update database connection details
   - Configure email settings for notifications

4. **Set up database**
   ```bash
   mysql -u root -p < database/schema.sql
   ```

5. **Start the server**
   ```bash
   npm start
   ```
   For development with auto-restart:
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Open browser and navigate to: `http://localhost:3000`

## Default Login Credentials

**Citizen:**
- Username: citizen@example.com
- Password: citizen123

**Staff:**
- Username: staff@example.com
- Password: staff123

**Admin:**
- Username: admin@example.com
- Password: admin123

## Project Structure

```
gram-panchayat-portal/
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── uploads/
├── views/
│   ├── citizen/
│   ├── staff/
│   ├── admin/
│   └── common/
├── database/
│   └── schema.sql
├── routes/
│   ├── auth.js
│   ├── citizen.js
│   ├── staff.js
│   └── admin.js
├── middleware/
│   └── auth.js
├── utils/
│   ├── email.js
│   └── pdf.js
├── server.js
├── package.json
└── .env
```

## Usage

### For Citizens:
1. Register for a new account
2. Login to the dashboard
3. Select desired service/certificate
4. Fill application form
5. Upload required documents
6. Submit application
7. Track status from dashboard
8. Download approved certificate

### For Staff:
1. Login with staff credentials
2. View pending applications
3. Verify documents
4. Approve/Reject with remarks
5. Generate and upload certificates

### For Admin:
1. Login with admin credentials
2. Manage services and schemes
3. Manage user accounts
4. View system reports
5. Configure system settings

## Contributing

This is a college project. For any improvements or suggestions, please contact the project team.

## License

This project is created for educational purposes.

## Contact

For any queries, contact your local Gram Panchayat office.
