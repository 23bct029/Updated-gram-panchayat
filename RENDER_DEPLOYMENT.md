# Render Deployment Guide

## Digital Gram Panchayat Services Portal

### Prerequisites
- GitHub account with repository: https://github.com/Guruganeshkannan/gram-panchayat-portal
- Render account (free tier available)

---

## Deployment Steps

### 1. Connect to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `Guruganeshkannan/gram-panchayat-portal`

### 2. Configure Web Service

**Basic Settings:**
- **Name**: `gram-panchayat-portal` (or your preferred name)
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Root Directory**: Leave empty (root of repo)
- **Runtime**: `Node`

**Build & Deploy:**
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: Free (or upgrade for better performance)

### 3. Environment Variables

Add these environment variables in Render dashboard:

```
NODE_ENV=production
PORT=10000
JWT_SECRET=your_random_jwt_secret_key_change_this
SESSION_SECRET=your_random_session_secret_change_this
```

**To generate secure secrets, run in terminal:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (usually 2-5 minutes)
3. Your app will be available at: `https://your-app-name.onrender.com`

---

## Important Notes

### Database
- Uses SQLite (file-based database)
- Database file: `database/gram_panchayat.db`
- **Note**: Render's free tier may reset the database on sleep/restart
- For production, consider upgrading or using PostgreSQL

### Free Tier Limitations
- Service spins down after 15 minutes of inactivity
- First request after sleep may take 30-60 seconds
- Database resets on service restart

### Persistent Storage (Optional)
If you need persistent database on free tier:
1. Use Render Disks (paid feature)
2. Or migrate to PostgreSQL (free with Render)
3. Or use external database service

---

## Testing Your Deployment

1. **Access Landing Page**: `https://your-app-name.onrender.com`
2. **Register**: `https://your-app-name.onrender.com/register`
3. **Login**: `https://your-app-name.onrender.com/login`

### Default Test Accounts
Check the database initialization script for default credentials.

---

## Troubleshooting

### Issue: API calls failing with ERR_BLOCKED_BY_CLIENT
**Solution**: Already fixed! The app now uses relative URLs that work in production.

### Issue: Database empty after deployment
**Solution**: The SQLite database is initialized automatically on first run.

### Issue: 404 errors
**Solution**: Ensure all routes are properly configured in `server.js`

### Issue: CORS errors
**Solution**: Already configured! CORS allows all origins for now.

### Issue: Service not starting
**Check Render logs for errors:**
- Go to your service dashboard
- Click "Logs"
- Look for errors in startup

---

## Updating Your Deployment

After making code changes:

```bash
git add .
git commit -m "Your commit message"
git push origin main
```

Render will automatically detect changes and redeploy.

---

## Custom Domain (Optional)

1. Go to your service settings
2. Click "Custom Domain"
3. Add your domain
4. Configure DNS according to Render's instructions

---

## Monitoring

- **Logs**: Available in Render dashboard
- **Metrics**: CPU, Memory usage visible in dashboard
- **Health Checks**: Render pings your service periodically

---

## Upgrading from Free Tier

For production use, consider:
- **Starter Plan** ($7/month): No sleeping, better performance
- **Add a Disk**: Persistent storage for SQLite
- **PostgreSQL**: Free managed database (better than SQLite for production)

---

## Support

- Render Documentation: https://render.com/docs
- GitHub Issues: https://github.com/Guruganeshkannan/gram-panchayat-portal/issues
- Render Community: https://community.render.com/

---

## Security Checklist

- [x] CORS configured
- [x] JWT secrets set in environment variables
- [x] Session secrets set
- [ ] Enable HTTPS (automatic on Render)
- [ ] Update default admin passwords
- [ ] Configure email SMTP (optional)
- [ ] Review and restrict CORS origins for production

---

## Next Steps

1. Test all functionality on deployed site
2. Create admin account
3. Add services and schemes
4. Invite staff members
5. Share with citizens for testing
