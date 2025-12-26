const express = require('express');
const webpush = require('web-push');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

webpush.setVapidDetails(
  'mailto:ajsports.org@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  try {
    await pool.query(
      'INSERT INTO subscriptions (endpoint, p256dh, auth) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3',
      [endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/send-alert', async (req, res) => {
  const { title, message, url } = req.body;
  const payload = JSON.stringify({ title, body: message, launchUrl: url });

  const result = await pool.query('SELECT * FROM subscriptions');
  const notifications = result.rows.map(s => {
    return webpush.sendNotification({
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth }
    }, payload).catch(err => {
        if (err.statusCode === 410) {
            pool.query('DELETE FROM subscriptions WHERE endpoint = $1', [s.endpoint]);
        }
    });
  });

  await Promise.all(notifications);
  res.json({ status: 'Done' });
});

app.listen(process.env.PORT || 3000);
