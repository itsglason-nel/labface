// Add these face matching routes to adminRoutes.js
// Insert before module.exports

const { verifyFaceMatch, detectFace } = require('../services/faceMatchingService');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// ==================== FACE MATCHING ROUTES ====================

/**
 * Verify professor ID photo matches registration photo
 * POST /api/admin/verify-face/:professorId
 */
router.post('/verify-face/:professorId', authenticateToken, requireLabHead, async (req, res) => {
    const { professorId } = req.params;

    try {
        // Get professor's ID photo and registration photo paths
        const [professor] = await pool.query(
            'SELECT id_photo, photo FROM users WHERE user_id = ? AND role = "professor"',
            [professorId]
        );

        if (professor.length === 0) {
            return res.status(404).json({ message: 'Professor not found' });
        }

        if (!professor[0].id_photo || !professor[0].photo) {
            return res.status(400).json({ message: 'Missing photos for verification' });
        }

        // Verify face match
        const result = await verifyFaceMatch(professor[0].id_photo, professor[0].photo);

        // Log verification attempt
        await pool.query(
            'INSERT INTO verification_logs (user_id, verification_type, verification_status, confidence_score) VALUES (?, ?, ?, ?)',
            [professor[0].id, 'face_match', result.verified ? 'verified' : 'failed', result.similarity]
        );

        // Log admin action
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason) VALUES (?, ?, ?, ?)',
            [req.user.id, 'face_verification', professor[0].id, `Similarity: ${result.similarity}%`]
        );

        res.json({
            verified: result.verified,
            similarity: result.similarity,
            threshold: result.threshold,
            message: result.message
        });
    } catch (error) {
        console.error('Face verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Detect face in uploaded image
 * POST /api/admin/detect-face
 */
router.post('/detect-face', authenticateToken, requireLabHead, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image uploaded' });
        }

        const result = await detectFace(req.file.path);

        // Clean up uploaded file
        const fs = require('fs').promises;
        await fs.unlink(req.file.path);

        res.json(result);
    } catch (error) {
        console.error('Face detection error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Bulk verify all pending professors
 * POST /api/admin/bulk-verify-faces
 */
router.post('/bulk-verify-faces', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [professors] = await pool.query(
            'SELECT id, user_id, id_photo, photo FROM users WHERE role = "professor" AND approval_status = "pending"'
        );

        const results = [];

        for (const prof of professors) {
            if (prof.id_photo && prof.photo) {
                try {
                    const verification = await verifyFaceMatch(prof.id_photo, prof.photo);
                    results.push({
                        professorId: prof.user_id,
                        verified: verification.verified,
                        similarity: verification.similarity
                    });

                    // Log verification
                    await pool.query(
                        'INSERT INTO verification_logs (user_id, verification_type, verification_status, confidence_score) VALUES (?, ?, ?, ?)',
                        [prof.id, 'face_match', verification.verified ? 'verified' : 'failed', verification.similarity]
                    );
                } catch (error) {
                    results.push({
                        professorId: prof.user_id,
                        verified: false,
                        error: error.message
                    });
                }
            }
        }

        res.json({
            total: professors.length,
            results
        });
    } catch (error) {
        console.error('Bulk face verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get face verification statistics
 * GET /api/admin/face-verification-stats
 */
router.get('/face-verification-stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_verifications,
                SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN verification_status = 'failed' THEN 1 ELSE 0 END) as failed,
                AVG(CAST(confidence_score AS DECIMAL(5,2))) as avg_confidence
            FROM verification_logs
            WHERE verification_type = 'face_match'
        `);

        const [recent] = await pool.query(`
            SELECT vl.*, u.user_id, u.first_name, u.last_name, u.email
            FROM verification_logs vl
            JOIN users u ON vl.user_id = u.id
            WHERE vl.verification_type = 'face_match'
            ORDER BY vl.created_at DESC
            LIMIT 20
        `);

        res.json({
            stats: stats[0],
            recentVerifications: recent
        });
    } catch (error) {
        console.error('Face verification stats error:', error);
        res.status(500).json({ error: error.message });
    }
});
