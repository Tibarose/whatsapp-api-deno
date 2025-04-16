import express from 'npm:express@^4.17.1';
import { Client, LocalAuth } from 'npm:whatsapp-web.js@^1.23.0';
import qrcode from 'npm:qrcode@^1.5.0';
import cors from 'npm:cors@^2.8.5';
import { v4 as uuidv4 } from 'npm:uuid@^8.3.2';
import puppeteer from 'npm:puppeteer@^21.0.0';

const app = express();
const port = Deno.env.get('PORT') || 8000;

app.use(cors());
app.use(express.json());

const clients = {};
const qrCodes = {};

async function initializeClient(instanceId) {
  if (Object.keys(clients).length >= 1) {
    throw new Error('Only one client allowed');
  }
  if (clients[instanceId]) {
    return { success: true, message: 'Client exists' };
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: instanceId }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log(`QR for ${instanceId}`);
    qrcode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('QR failed:', err);
        return;
      }
      qrCodes[instanceId] = url;
    });
  });

  client.on('ready', () => {
    console.log(`Client ${instanceId} ready`);
  });

  client.on('auth_failure', (msg) => {
    console.error(`Auth failed for ${instanceId}:`, msg);
    delete clients[instanceId];
    delete qrCodes[instanceId];
  });

  client.on('disconnected', () => {
    console.log(`Client ${instanceId} disconnected`);
    delete clients[instanceId];
    delete qrCodes[instanceId];
  });

  clients[instanceId] = client;
  try {
    await client.initialize();
    return { success: true };
  } catch (error) {
    console.error(`Init failed for ${instanceId}:`, error);
    delete clients[instanceId];
    throw error;
  }
}

app.post('/instance', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const instanceId = uuidv4();
  try {
    await initializeClient(instanceId);
    res.json({ instanceId, apiKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/qr/:instanceId', (req, res) => {
  const { instanceId } = req.params;
  const { apiKey } = req.query;
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (qrCodes[instanceId]) {
    res.json({ qr: qrCodes[instanceId] });
  } else {
    res.status(400).json({ error: 'QR not available' });
  }
});

app.post('/send/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const { apiKey, number, message } = req.body;
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (!number || !message) {
    return res.status(400).json({ error: 'Number and message required' });
  }
  const client = clients[instanceId];
  if (!client) {
    return res.status(400).json({ error: 'Client not initialized' });
  }
  try {
    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    await client.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/logout/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const { apiKey } = req.body;
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const client = clients[instanceId];
  if (client) {
    try {
      await client.logout();
      await client.destroy();
      delete clients[instanceId];
      delete qrCodes[instanceId];
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  } else {
    res.status(400).json({ error: 'Client not found' });
  }
});

Deno.serve({ port }, app);
console.log(`Server on port ${port}`);