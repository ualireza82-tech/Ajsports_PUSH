export default function handler(req, res) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'Aj2024Secure#';
  const token = req.query.token || req.headers['admin-token'];

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, admin-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // احراز هویت
  if (token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - توکن نامعتبر' });
  }

  // GET - دریافت مسابقات
  if (req.method === 'GET') {
    // ریدایرکت به matches
    return fetch('https://ajsports-push-3zyq.vercel.app/api/matches')
      .then(r => r.json())
      .then(data => res.json(data))
      .catch(() => res.json([]));
  }

  // POST - بروزرسانی مسابقات
  if (req.method === 'POST') {
    const { matches, action, matchId, streamUrl, posterUrl, title, time } = req.body;

    return res.json({
      success: true,
      message: '✅ دستور ادمین دریافت شد',
      action: action || 'update',
      matches: matches || [],
      timestamp: Date.now()
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
