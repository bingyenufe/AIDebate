const pdf = require('pdf-parse');

export const config = {
  api: {
    bodyParser: false, // Disabling bodyParser to handle raw binary/FormData stream
  },
};

// Simple multipart form data parser helper
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      
      if (!boundaryMatch) {
        return resolve({ buffer, filename: 'file' });
      }
      
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      
      // Basic extraction of file chunk from body
      const parts = [];
      let start = 0;
      while (start < buffer.length) {
        const index = buffer.indexOf(boundaryBuffer, start);
        if (index === -1) break;
        if (start > 0) {
          parts.push(buffer.slice(start, index));
        }
        start = index + boundaryBuffer.length;
      }
      
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headerStr = part.slice(0, headerEnd).toString('utf-8');
          if (headerStr.includes('filename=')) {
            const filenameMatch = headerStr.match(/filename="([^"]+)"/);
            const filename = filenameMatch ? filenameMatch[1] : 'file';
            // Trailing \r\n-- from multipart end
            let body = part.slice(headerEnd + 4);
            if (body.slice(-2).toString() === '\r\n') {
              body = body.slice(0, -2);
            }
            return resolve({ buffer: body, filename });
          }
        }
      }
      
      resolve({ buffer, filename: 'file' });
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { buffer, filename } = await parseMultipart(req);
    const lowerName = filename.toLowerCase();

    let text = '';
    if (lowerName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      // Treat as plain text (txt/md)
      text = buffer.toString('utf-8');
    }

    // Sanitize and trim text
    text = text.trim().replace(/\r\n/g, '\n');
    
    // Safety cap: max 12,000 chars
    if (text.length > 12000) {
      text = text.slice(0, 12000) + '\n\n[注：超出字数限制，后续文本已自动截断]';
    }

    return res.status(200).json({ text, filename });
  } catch (error) {
    console.error('File Parse Error:', error);
    return res.status(500).json({ error: '文件解析失败: ' + error.message });
  }
}
