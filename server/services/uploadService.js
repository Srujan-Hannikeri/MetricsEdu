const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

async function saveUploadedFile(file, folder) {
  if (!file?.buffer) throw new Error('Uploaded file data is missing.');
  const extension = path.extname(file.originalname || '').toLowerCase();
  const filename = `${folder}_${Date.now()}_${crypto.randomUUID()}${extension}`;

  if (process.env.VERCEL) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required to store uploads on Vercel.');
    }
    const { put } = require('@vercel/blob');
    const blob = await put(`${folder}/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return blob.url;
  }

  const uploadDirectory = path.join(__dirname, '..', 'uploads', folder);
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(path.join(uploadDirectory, filename), file.buffer);
  return `/uploads/${folder}/${filename}`;
}

module.exports = { saveUploadedFile };
