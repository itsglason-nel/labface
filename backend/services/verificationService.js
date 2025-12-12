const pool = require('../config/db');
const ocrService = require('./ocrService');

/**
 * Document Verification Service
 * Handles verification of student COR and professor ID documents
 */
class VerificationService {
    /**
     * Verify student documents (COR + Face Photos)
     * @param {Object} studentData - Student registration data
     * @param {string} corImage - Base64 encoded COR image
     * @returns {Promise<Object>} Verification result
     */
    async verifyStudentDocuments(studentData, corImage) {
        try {
            // 1. Verify COR using OCR
            const corVerification = await ocrService.verifyCOR(corImage, {
                studentId: studentData.studentId,
                firstName: studentData.firstName,
                middleName: studentData.middleName,
                lastName: studentData.lastName,
                course: studentData.course,
                yearLevel: studentData.yearLevel
            });

            // 2. Log verification attempt
            if (studentData.userId) {
                await this.logVerification(
                    studentData.userId,
                    'cor',
                    corVerification.valid ? 'pass' : 'fail',
                    corVerification.details,
                    corVerification.confidence,
                    corVerification.reason
                );
            }

            return corVerification;
        } catch (error) {
            console.error('Student document verification error:', error);
            return {
                valid: false,
                reason: 'Verification service error: ' + error.message
            };
        }
    }

    /**
     * Log verification attempt to database
     * @param {number} userId - User ID
     * @param {string} type - Verification type ('cor', 'id', 'manual')
     * @param {string} result - Result ('pass' or 'fail')
     * @param {Object} extractedData - Data extracted during verification
     * @param {number} confidenceScore - Confidence score (0-1)
     * @param {string} errorMessage - Error message if failed
     */
    async logVerification(userId, type, result, extractedData = null, confidenceScore = null, errorMessage = null) {
        try {
            await pool.query(
                `INSERT INTO verification_logs 
                (user_id, verification_type, verification_result, extracted_data, confidence_score, error_message) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    type,
                    result,
                    extractedData ? JSON.stringify(extractedData) : null,
                    confidenceScore,
                    errorMessage
                ]
            );
        } catch (error) {
            console.error('Failed to log verification:', error);
            // Don't throw - logging failure shouldn't break verification
        }
    }

    /**
     * Get verification history for a user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Verification logs
     */
    async getVerificationHistory(userId) {
        try {
            const [logs] = await pool.query(
                `SELECT * FROM verification_logs 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 10`,
                [userId]
            );
            return logs;
        } catch (error) {
            console.error('Failed to get verification history:', error);
            return [];
        }
    }

    /**
     * Get verification statistics
     * @returns {Promise<Object>} Statistics
     */
    async getVerificationStats() {
        try {
            const [stats] = await pool.query(`
                SELECT 
                    verification_type,
                    verification_result,
                    COUNT(*) as count,
                    AVG(confidence_score) as avg_confidence
                FROM verification_logs
                GROUP BY verification_type, verification_result
            `);
            return stats;
        } catch (error) {
            console.error('Failed to get verification stats:', error);
            return [];
        }
    }
}

module.exports = new VerificationService();
