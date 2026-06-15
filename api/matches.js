import fetch from 'node-fetch';

// 🟢 کش مشترک - هم برای کاربرا هم ادمین
let cachedData = null;
let cachedTime = 0;
const CACHE_DURATION = 15000; // 15 ثانیه برای کاربرا

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, admin-token');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 🎯 POST: ادمین می‌خواد مسابقات رو آپدیت کنه
  if (req.method === 'POST') {
    const token = req.headers['admin-token'] || req.query?.token;
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'Aj2024Secure#';
    
    if (token !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { matches } = req.body;
    if (matches && Array.isArray(matches)) {
      cachedData = matches;
      cachedTime = Date.now();
      console.log('✅ Admin updated matches:', matches.length);
      return res.json({ success: true, matches: cachedData, message: 'کش آپدیت شد' });
    }
    
    return res.status(400).json({ error: 'Invalid matches' });
  }

  // 📡 GET: کاربرا مسابقات رو می‌گیرن
  try {
    // اگه کش معتبره
    if (cachedData && (Date.now() - cachedTime) < CACHE_DURATION) {
      return res.json(cachedData);
    }

    // بگیر از منبع اصلی
    const response = await fetch('https://news-et1s.onrender.com/api/matches', {
      timeout: 5000
    });

    if (response.ok) {
      const rawData = await response.json();
      const matches = Array.isArray(rawData) ? rawData : (rawData.matches || rawData.data || []);
      
      if (matches.length > 0) {
        cachedData = matches;
        cachedTime = Date.now();
        return res.json(matches);
      }
    }
  } catch (e) {
    console.error('Fetch error:', e.message);
  }

  // Fallback
  if (cachedData) {
    return res.json(cachedData);
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
