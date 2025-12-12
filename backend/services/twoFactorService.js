const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Generate 2FA secret for a user
 * @param {string} email - User's email
 * @returns {Object} - Secret and QR code data URL
 */
async function generate2FASecret(email) {
    const secret = speakeasy.generateSecret({
        name: `LabFace (${email})`,
        issuer: 'LabFace',
        length: 32
    });

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

    return {
        secret: secret.base32,
        qrCode: qrCodeDataURL,
        otpauthUrl: secret.otpauth_url
    };
}

/**
 * Verify 2FA token
 * @param {string} token - 6-digit code from authenticator app
 * @param {string} secret - User's 2FA secret
 * @returns {boolean} - True if valid
 */
function verify2FAToken(token, secret) {
    return speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 2 // Allow 2 time steps before/after for clock drift
    });
}

/**
 * Generate backup codes
 * @param {number} count - Number of backup codes to generate
 * @returns {Array<string>} - Array of backup codes
 */
function generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
    }
    return codes;
}

/**
 * Hash backup codes for storage
 * @param {Array<string>} codes - Backup codes
 * @returns {string} - JSON string of hashed codes
 */
function hashBackupCodes(codes) {
    const hashedCodes = codes.map(code => {
        return crypto.createHash('sha256').update(code).digest('hex');
    });
    return JSON.stringify(hashedCodes);
}

/**
 * Verify backup code
 * @param {string} code - Backup code to verify
 * @param {string} hashedCodesJson - JSON string of hashed codes
 * @returns {Object} - { valid: boolean, remainingCodes: string }
 */
function verifyBackupCode(code, hashedCodesJson) {
    const hashedCodes = JSON.parse(hashedCodesJson);
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const index = hashedCodes.indexOf(codeHash);
    if (index === -1) {
        return { valid: false, remainingCodes: hashedCodesJson };
    }

    // Remove used code
    hashedCodes.splice(index, 1);
    return {
        valid: true,
        remainingCodes: JSON.stringify(hashedCodes)
    };
}

module.exports = {
    generate2FASecret,
    verify2FAToken,
    generateBackupCodes,
    hashBackupCodes,
    verifyBackupCode
};
