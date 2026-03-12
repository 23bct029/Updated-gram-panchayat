const nodemailer = require('nodemailer');

// Create email transporter
const transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Send email notification
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: `"Gram Panchayat Services" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// Send application submission notification
async function sendApplicationSubmittedEmail(userEmail, applicationId, serviceName) {
    const subject = 'Application Submitted Successfully';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #2563A8 0%, #1B4D89 100%); color: white; padding: 20px; text-align: center;">
                <h1>Digital Gram Panchayat</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2>Application Submitted Successfully</h2>
                <p>Dear Citizen,</p>
                <p>Your application for <strong>${serviceName}</strong> has been submitted successfully.</p>
                <p><strong>Application ID:</strong> ${applicationId}</p>
                <p>You can track your application status by logging into your account.</p>
                <p>Thank you for using Digital Gram Panchayat Services Portal.</p>
            </div>
            <div style="background: #1F2937; color: white; padding: 20px; text-align: center; font-size: 12px;">
                <p>&copy; 2024 Digital Gram Panchayat Services Portal. All rights reserved.</p>
            </div>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
}

// Send status update notification
async function sendStatusUpdateEmail(userEmail, applicationId, status, remarks) {
    const subject = `Application Status Update - ${status}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #2563A8 0%, #1B4D89 100%); color: white; padding: 20px; text-align: center;">
                <h1>Digital Gram Panchayat</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2>Application Status Update</h2>
                <p>Dear Citizen,</p>
                <p>Your application <strong>${applicationId}</strong> status has been updated.</p>
                <p><strong>New Status:</strong> ${status}</p>
                ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ''}
                <p>Please login to your account to view more details.</p>
            </div>
            <div style="background: #1F2937; color: white; padding: 20px; text-align: center; font-size: 12px;">
                <p>&copy; 2024 Digital Gram Panchayat Services Portal. All rights reserved.</p>
            </div>
        </div>
    `;
    return await sendEmail(userEmail, subject, html);
}

module.exports = {
    sendEmail,
    sendApplicationSubmittedEmail,
    sendStatusUpdateEmail
};
