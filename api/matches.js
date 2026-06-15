import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, admin-token');
  res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 🎯 POST: ادمین مسابقات رو ذخیره می‌کنه
  if (req.method === 'POST') {
    const token = req.headers['admin-token'];
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'Aj2024Secure#';
    
    if (token !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { matches } = req.body;
    if (matches && Array.isArray(matches)) {
      await redis.set('live_matches', JSON.stringify(matches), { ex: 60 });
      return res.json({ success: true, message: '✅ ذخیره شد - ۵ ثانیه دیگه روی سایت میاد' });
    }
    return res.status(400).json({ error: 'Invalid matches' });
  }

  // 📡 GET: کاربرا مسابقات رو می‌گیرن
  try {
    // اول Redis
    const cached = await redis.get('live_matches');
    if (cached) {
      return res.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
    }

    // بعد منبع اصلی
    const response = await fetch('https://news-et1s.onrender.com/api/matches', { timeout: 5000 });
    if (response.ok) {
      const rawData = await response.json();
      const matches = Array.isArray(rawData) ? rawData : (rawData.matches || rawData.data || []);
      if (matches.length > 0) {
        await redis.set('live_matches', JSON.stringify(matches), { ex: 60 });
        return res.json(matches);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }

  return res.json([{
    id: '1',
    title: 'مسابقه تست AJ SPORTS',
    time: '۲۱:۰۰',
    status: 'upcoming',
    poster: 'https://via.placeholder.com/400x225?text=AJ+SPORTS',
    stream: null,
    match_id: null
  }]);
  }
