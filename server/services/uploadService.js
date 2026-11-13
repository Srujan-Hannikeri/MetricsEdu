const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

async function saveUploadedFile(file, folder) {
  if (!file?.buffer) throw new Error('Uploaded file data is missing.');
  const extension = path.extname(file.originalname || '').toLowerCase();
  const filename = `${folder}_${Date.now()}_${crypto.randomUUID()}${extension}`;

  // If Vercel Blob token is configured, prioritize storing in Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = require('@vercel/blob');
      const blob = await put(`${folder}/${filename}`, file.buffer, {
        access: 'public',
        contentType: file.mimetype || 'application/octet-stream',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      return blob.url;
    } catch (blobError) {
      console.warn('Vercel Blob upload failed, falling back to data URL:', blobError.message);
    }
  }

  // If on Vercel (or any serverless env where filesystem is read-only)
  // or if Blob is not available, safely store as Base64 Data URI
  if (process.env.VERCEL) {
    const mime = file.mimetype || 'application/octet-stream';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }

  // Local development fallback: save to uploads directory
  try {
    const uploadDirectory = path.join(__dirname, '..', 'uploads', folder);
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(path.join(uploadDirectory, filename), file.buffer);
    return `/uploads/${folder}/${filename}`;
  } catch (fsError) {
    console.warn('Filesystem write failed, falling back to data URL:', fsError.message);
    const mime = file.mimetype || 'application/octet-stream';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }
}

module.exports = { saveUploadedFile };
