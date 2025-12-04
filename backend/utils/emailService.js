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

module.exports = { sendOTP };
