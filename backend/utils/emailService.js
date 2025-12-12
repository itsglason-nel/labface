const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'support@labface.site',
        pass: 'glason27'
    }
});

transporter.verify(function (error, success) {
    if (error) {
        console.error('SMTP Connection Error:', error);
    } else {
        console.log('SMTP Server is ready to take our messages');
    }
});

const sendOTP = async (email, otp) => {
    const mailOptions = {
        from: '"LabFace Support" <support@labface.site>',
        to: email,
        subject: 'Password Reset OTP - LabFace',
        text: `Your password reset code is: ${otp}. It expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                    <h1 style="color: #0f172a; margin: 0;">LabFace</h1>
                    <p style="color: #64748b; margin: 5px 0 0;">Smart Attendance System</p>
                </div>
                <div style="padding: 30px 20px; text-align: center;">
                    <h2 style="color: #334155; margin-top: 0;">Password Reset Request</h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        We received a request to reset your password. Use the verification code below to complete the process.
                    </p>
                    <div style="margin: 30px 0;">
                        <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6; background-color: #eff6ff; padding: 15px 30px; border-radius: 8px; border: 1px solid #dbeafe;">
                            ${otp}
                        </span>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">
                        This code will expire in <strong>10 minutes</strong>.
                    </p>
                    <p style="color: #64748b; font-size: 14px;">
                        If you didn't request this, you can safely ignore this email.
                    </p>
                </div>
                <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #94a3b8; font-size: 12px;">
                    <p>&copy; ${new Date().getFullYear()} LabFace. All rights reserved.</p>
                    <p>Polytechnic University of the Philippines</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendApprovalEmail = async (email, firstName, lastName) => {
    const mailOptions = {
        from: '"LabFace Support" <support@labface.site>',
        to: email,
        subject: 'Professor Account Approved - LabFace',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                    <h1 style="color: #0f172a; margin: 0;">LabFace</h1>
                    <p style="color: #64748b; margin: 5px 0 0;">Smart Attendance System</p>
                </div>
                <div style="padding: 30px 20px;">
                    <h2 style="color: #10b981; margin-top: 0;">✓ Account Approved!</h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        Dear Professor ${firstName} ${lastName},
                    </p>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        Great news! Your professor account has been approved by the Laboratory Head. You can now login and start using LabFace.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://www.labface.site/login" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            Login Now
                        </a>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">
                        If you have any questions, please contact the Laboratory Head.
                    </p>
                </div>
                <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #94a3b8; font-size: 12px;">
                    <p>&copy; ${new Date().getFullYear()} LabFace. All rights reserved.</p>
                    <p>Polytechnic University of the Philippines</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendRejectionEmail = async (email, firstName, lastName, reason) => {
    const mailOptions = {
        from: '"LabFace Support" <support@labface.site>',
        to: email,
        subject: 'Professor Account Registration Update - LabFace',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                    <h1 style="color: #0f172a; margin: 0;">LabFace</h1>
                    <p style="color: #64748b; margin: 5px 0 0;">Smart Attendance System</p>
                </div>
                <div style="padding: 30px 20px;">
                    <h2 style="color: #ef4444; margin-top: 0;">Registration Update</h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        Dear Professor ${firstName} ${lastName},
                    </p>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        We regret to inform you that your professor account registration was not approved.
                    </p>
                    ${reason ? `
                    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
                        <p style="color: #991b1b; margin: 0; font-weight: bold;">Reason:</p>
                        <p style="color: #7f1d1d; margin: 5px 0 0;">${reason}</p>
                    </div>
                    ` : ''}
                    <p style="color: #64748b; font-size: 14px;">
                        If you believe this is an error or have questions, please contact the Laboratory Head for assistance.
                    </p>
                </div>
                <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #94a3b8; font-size: 12px;">
                    <p>&copy; ${new Date().getFullYear()} LabFace. All rights reserved.</p>
                    <p>Polytechnic University of the Philippines</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendLabHeadNotification = async (professorFirstName, professorLastName, professorEmail, professorId) => {
    const mailOptions = {
        from: '"LabFace System" <support@labface.site>',
        to: 'admin@labface.local', // Laboratory Head email
        subject: '🔔 New Professor Registration - Action Required',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                    <h1 style="color: #0f172a; margin: 0;">LabFace</h1>
                    <p style="color: #64748b; margin: 5px 0 0;">Laboratory Head Dashboard</p>
                </div>
                <div style="padding: 30px 20px;">
                    <h2 style="color: #3b82f6; margin-top: 0;">🔔 New Professor Registration</h2>
                    <p style="color: #475569; font-size: 16px; line-height: 1.5;">
                        A new professor has registered and is awaiting your approval.
                    </p>
                    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                        <p style="color: #1e40af; margin: 0; font-weight: bold;">Professor Details:</p>
                        <p style="color: #1e3a8a; margin: 5px 0 0;"><strong>Name:</strong> ${professorFirstName} ${professorLastName}</p>
                        <p style="color: #1e3a8a; margin: 5px 0 0;"><strong>Email:</strong> ${professorEmail}</p>
                        <p style="color: #1e3a8a; margin: 5px 0 0;"><strong>Professor ID:</strong> ${professorId}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://www.labface.site/admin/dashboard" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            Review Registration
                        </a>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">
                        Please review the professor's credentials and approve or reject their registration.
                    </p>
                </div>
                <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #94a3b8; font-size: 12px;">
                    <p>&copy; ${new Date().getFullYear()} LabFace. All rights reserved.</p>
                    <p>Polytechnic University of the Philippines</p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { sendOTP, sendApprovalEmail, sendRejectionEmail, sendLabHeadNotification };
