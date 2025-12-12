const Minio = require('minio');

// Initialize MinIO client
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const PROFILE_BUCKET = 'labface-profiles';
const SNAPSHOT_BUCKET = 'labface-snapshots';

/**
 * Upload base64 image to MinIO
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} userId - User ID for filename
 * @param {string} type - Type of image (profile, face-front, face-left, etc.)
 * @returns {Promise<string>} - Public URL of uploaded image
 */
async function uploadBase64ToMinio(base64Data, userId, type) {
    try {
        // Parse base64 data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 data');
        }

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        // Determine file extension from MIME type
        const ext = mimeType.split('/')[1] || 'jpg';
        const filename = `${type}-${userId}-${Date.now()}.${ext}`;

        // Upload to MinIO
        await minioClient.putObject(
            PROFILE_BUCKET,
            filename,
            buffer,
            buffer.length,
            { 'Content-Type': mimeType }
        );

        // Return public URL
        const minioEndpoint = process.env.MINIO_PUBLIC_URL || `http://${process.env.MINIO_ENDPOINT || 'localhost'}:9002`;
        return `${minioEndpoint}/${PROFILE_BUCKET}/${filename}`;
    } catch (error) {
        console.error('MinIO upload error:', error);
        throw error;
    }
}

/**
 * Upload buffer to MinIO
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Filename
 * @param {string} bucket - Bucket name (default: PROFILE_BUCKET)
 * @returns {Promise<string>} - Public URL of uploaded image
 */
async function uploadBufferToMinio(buffer, filename, bucket = PROFILE_BUCKET) {
    try {
        await minioClient.putObject(
            bucket,
            filename,
            buffer,
            buffer.length,
            { 'Content-Type': 'image/jpeg' }
        );

        const minioEndpoint = process.env.MINIO_PUBLIC_URL || `http://${process.env.MINIO_ENDPOINT || 'localhost'}:9002`;
        return `${minioEndpoint}/${bucket}/${filename}`;
    } catch (error) {
        console.error('MinIO upload error:', error);
        throw error;
    }
}

/**
 * Delete object from MinIO
 * @param {string} url - Full URL of the object
 * @returns {Promise<void>}
 */
async function deleteFromMinio(url) {
    try {
        // Extract bucket and filename from URL
        const urlParts = url.split('/');
        const bucket = urlParts[urlParts.length - 2];
        const filename = urlParts[urlParts.length - 1];

        await minioClient.removeObject(bucket, filename);
    } catch (error) {
        console.error('MinIO delete error:', error);
        throw error;
    }
}

module.exports = {
    minioClient,
    uploadBase64ToMinio,
    uploadBufferToMinio,
    deleteFromMinio,
    PROFILE_BUCKET,
    SNAPSHOT_BUCKET
};
