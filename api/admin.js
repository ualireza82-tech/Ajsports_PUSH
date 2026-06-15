export default function handler(req, res) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'Aj2024Secure#';
  const token = req.query.token || req.headers['admin-token'];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized - توکن نامعتبر' });
  }

  // 🎯 POST: ارسال مستقیم به matches.js برای آپدیت کش
  if (req.method === 'POST') {
    const { matches } = req.body;
    
    if (matches && Array.isArray(matches)) {
      // فراخوانی matches.js با متد POST
      return fetch('https://ajsports-push-3zyq.vercel.app/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'admin-token': token
        },
        body: JSON.stringify({ matches })
      })
      .then(r => r.json())
      .then(data => res.json(data))
      .catch(() => res.json({ success: false, error: 'Failed to update' }));
    }
    
    return res.json({ success: false, error: 'No matches array' });
  }

  // GET: دریافت مسابقات
  return fetch('https://ajsports-push-3zyq.vercel.app/api/matches')
    .then(r => r.json())
    .then(data => res.json(data))
    .catch(() => res.json([]));
        }
