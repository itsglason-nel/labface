const faceapi = require('face-api.js');
const canvas = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Patch face-api.js to use node-canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Load face detection models
let modelsLoaded = false;

async function loadModels() {
    if (modelsLoaded) return;

    const modelPath = path.join(__dirname, '../models');

    try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        modelsLoaded = true;
        console.log('Face detection models loaded successfully');
    } catch (error) {
        console.error('Error loading face detection models:', error);
        throw new Error('Failed to load face detection models');
    }
}

/**
 * Detect face in image
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Object>} - Face detection result
 */
async function detectFace(imagePath) {
    await loadModels();

    try {
        const img = await canvas.loadImage(imagePath);
        const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            return { detected: false, message: 'No face detected in image' };
        }

        return {
            detected: true,
            descriptor: Array.from(detection.descriptor),
            landmarks: detection.landmarks,
            box: detection.detection.box
        };
    } catch (error) {
        console.error('Face detection error:', error);
        return { detected: false, message: error.message };
    }
}

/**
 * Compare two face descriptors
 * @param {Array} descriptor1 - First face descriptor
 * @param {Array} descriptor2 - Second face descriptor
 * @returns {Object} - Comparison result with similarity score
 */
function compareFaces(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) {
        return { match: false, similarity: 0, message: 'Invalid descriptors' };
    }

    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    const similarity = Math.max(0, 1 - distance);
    const threshold = 0.6; // 60% similarity threshold

    return {
        match: similarity >= threshold,
        similarity: (similarity * 100).toFixed(2),
        distance: distance.toFixed(4),
        threshold: threshold * 100
    };
}

/**
 * Verify if two images contain the same person
 * @param {string} image1Path - Path to first image
 * @param {string} image2Path - Path to second image
 * @returns {Promise<Object>} - Verification result
 */
async function verifyFaceMatch(image1Path, image2Path) {
    try {
        const face1 = await detectFace(image1Path);
        const face2 = await detectFace(image2Path);

        if (!face1.detected) {
            return { verified: false, message: 'No face detected in first image' };
        }

        if (!face2.detected) {
            return { verified: false, message: 'No face detected in second image' };
        }

        const comparison = compareFaces(face1.descriptor, face2.descriptor);

        return {
            verified: comparison.match,
            similarity: comparison.similarity,
            distance: comparison.distance,
            threshold: comparison.threshold,
            message: comparison.match
                ? `Faces match with ${comparison.similarity}% similarity`
                : `Faces do not match (${comparison.similarity}% similarity, threshold: ${comparison.threshold}%)`
        };
    } catch (error) {
        console.error('Face verification error:', error);
        return { verified: false, message: error.message };
    }
}

/**
 * Extract and save face descriptor from image
 * @param {string} imagePath - Path to image
 * @returns {Promise<Array>} - Face descriptor array
 */
async function extractFaceDescriptor(imagePath) {
    const result = await detectFace(imagePath);
    if (!result.detected) {
        throw new Error(result.message);
    }
    return result.descriptor;
}

module.exports = {
    loadModels,
    detectFace,
    compareFaces,
    verifyFaceMatch,
    extractFaceDescriptor
};
