const https = require('https');

const url = 'https://lifemakers.netlify.app/.netlify/functions/debug-locks';

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
      console.log('Raw response:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
