/**
 * Parse multipart/form-data from Netlify Lambda event (base64 or raw body).
 */

const Busboy = require('busboy');

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers['content-type'] ||
      event.headers['Content-Type'] ||
      '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      reject(new Error('Expected multipart/form-data'));
      return;
    }

    const fields = {};
    let fileBuffer = null;
    let fileName = 'upload.xlsx';
    let fileMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const bb = Busboy({ headers: { 'content-type': contentType } });

    bb.on('file', (fieldname, file, info) => {
      if (fieldname !== 'file') {
        file.resume();
        return;
      }
      fileName = info.filename || fileName;
      fileMime = info.mimeType || fileMime;
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('error', reject);
    bb.on('finish', () => {
      if (!fileBuffer || fileBuffer.length === 0) {
        reject(new Error('No file uploaded'));
        return;
      }
      resolve({
        fileBuffer,
        fileName,
        fileMime,
        sheetName: fields.sheet_name || fields.sheetName || null,
        validateMode: fields.validate_mode || fields.validateMode || 'both',
      });
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');
    bb.end(body);
  });
}

module.exports = { parseMultipart };
