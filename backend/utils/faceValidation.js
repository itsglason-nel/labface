const axios = require('axios');

/**
 * Validate that an image contains a detectable face
 * @param {string} base64Image - Base64 encoded image data
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateFaceInImage(base64Image) {
    try {
        // Call AI service to detect faces
        const response = await axios.post('http://127.0.0.1:8000/recognize', {
            image: base64Image
        }, {
            timeout: 10000
        });

        // If we get here without error, a face was detected
        // The AI service returns success:false if no face is found
        if (response.data.success === false && response.data.error === 'No face detected') {
            return { valid: false, error: 'No face detected in image' };
        }

        // Face detected (even if not recognized)
        return { valid: true };
    } catch (error) {
        // Check if it's a "no face detected" error
        if (error.response && error.response.data) {
            const errorMsg = error.response.data.error || '';
            if (errorMsg.toLowerCase().includes('no face')) {
                return { valid: false, error: 'No face detected in image' };
            }
        }

        // If AI service is down or other error, log but allow upload
        // (fail open to avoid blocking legitimate uploads)
        console.warn('Face validation service error:', error.message);
        return { valid: true, warning: 'Face validation service unavailable' };
    }
}

/**
 * Validate multiple face photos
 * @param {Object} facePhotos - Object with angle keys and base64 image values
 * @returns {Promise<{valid: boolean, invalidAngles?: string[], error?: string}>}
 */
async function validateFacePhotos(facePhotos) {
    if (!facePhotos || typeof facePhotos !== 'object') {
        return { valid: false, error: 'No face photos provided' };
    }

    const invalidAngles = [];

    for (const [angle, base64Data] of Object.entries(facePhotos)) {
        const result = await validateFaceInImage(base64Data);
        if (!result.valid) {
            invalidAngles.push(angle);
        }
    }

    if (invalidAngles.length > 0) {
        return {
            valid: false,
            invalidAngles,
            error: `No face detected in ${invalidAngles.join(', ')} photo(s)`
        };
    }

    return { valid: true };
}

module.exports = {
    validateFaceInImage,
    validateFacePhotos
};
