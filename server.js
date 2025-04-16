import express from 'npm:express@^4.17.1';
import { Client, LocalAuth } from 'npm:whatsapp-web.js@^1.23.0';
import cors from 'npm:cors@^2.8.5';

const app = express();
const port = Deno.env.get('PORT') || 8000;

app.use(cors());
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'default' })
});

client.on('ready', () => {
  console.log('Client is ready');
});

client.on('auth_failure', (msg) => {
  console.error('Auth failure:', msg);
});

client.on('disconnected', () => {
  console.log('Client disconnected');
});

// Initialize client on startup
client.initialize().catch(err => {
  console.error('Client initialization failed:', err);
});

app.post('/send', async (req, res) => {
  const { apiKey, number, message } = req.body;
  if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (!number || !message) {
    return res.status(400).json({ error: 'Number and message required' });
  }
  try {
    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    await client.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

Deno.serve({ port }, app);
console.log(`Server on port ${port}`);
