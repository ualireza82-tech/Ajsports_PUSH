import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { createClient } from '@vercel/kv';

const app = express();
const PORT = process.env.PORT || 3000;

// Vercel KV client (برای دیتابیس رایگان)
let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
} catch (e) {
  console.log('KV not available, using in-memory cache');
}

// این-مموری کش با TTL برای Fallback
const memoryCache = new Map();
const CACHE_TTL = {
  matches: 15000,      // 15 ثانیه
  static: 3600000,     // 1 ساعت
};

function setCache(key, value, ttl = 15000) {
  const expires = Date.now() + ttl;
  memoryCache.set(key, { value, expires });
  
  // تلاش برای ذخیره در KV هم
  if (kv) {
    try {
      kv.set(key, JSON.stringify(value), { ex: Math.floor(ttl / 1000) });
    } catch (e) {}
  }
}

async function getCache(key) {
  // اول چک مموری کش
  const memData = memoryCache.get(key);
  if (memData && memData.expires > Date.now()) {
    return memData.value;
  }
  
  // بعد چک KV
  if (kv) {
    try {
      const kvData = await kv.get(key);
      if (kvData) {
        const parsed = JSON.parse(kvData);
        memoryCache.set(key, { value: parsed, expires: Date.now() + 30000 });
        return parsed;
      }
    } catch (e) {}
  }
  
  return null;
}

// Middleware
app.use(cors());
app.use(express.json());

// 🎯 API Endpoint اصلی - با کش لبه
app.get('/api/matches', async (req, res) => {
  try {
    const cacheKey = 'live_matches';
    let matches = await getCache(cacheKey);
    
    if (!matches) {
      // فچ از منبع اصلی
      const response = await fetch('https://news-et1s.onrender.com/api/matches');
      if (response.ok) {
        matches = await response.json();
        setCache(cacheKey, matches, CACHE_TTL.matches);
      }
    }
    
    if (!matches) {
      // Fallback data
      matches = [
        {
          id: 'match_1',
          title: 'بارگذاری مجدد...',
          time: 'به‌زودی',
          status: 'upcoming',
          poster: 'https://via.placeholder.com/400x225?text=AJ+SPORTS',
          stream: null,
          match_id: null
        }
      ];
    }
    
    // هدرهای کش قدرتمند
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30, stale-if-error=300');
    res.setHeader('Surrogate-Control', 'max-age=15, stale-while-revalidate=30');
    res.setHeader('CDN-Cache-Control', 'max-age=15');
    res.json(matches);
    
  } catch (error) {
    res.status(500).json({ error: 'Server Error', cached: true });
  }
});

// 🔄 API برای SSE چت
app.get('/api/chat/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const matchId = req.query.match_id || 'global';
  
  // ارسال heartbeat هر 30 ثانیه
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 30000);

  // ارسال آخرین پیام‌ها
  const sendCachedMessages = async () => {
    const messages = await getCache(`chat_${matchId}`) || [];
    messages.forEach(msg => {
      res.write(`data: ${JSON.stringify({ type: 'message', payload: msg })}\n\n`);
    });
  };
  
  sendCachedMessages();

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// 📨 API برای ارسال پیام چت
app.post('/api/chat/send', async (req, res) => {
  try {
    const { text, email, avatar, reply_text, match_id } = req.body;
    const matchId = match_id || 'global';
    
    const message = {
      id: Date.now().toString(36),
      text,
      sender: email,
      sender_identity_id: email,
      avatar: avatar || '',
      reply_text: reply_text || null,
      match_id: matchId,
      timestamp: Date.now()
    };
    
    // ذخیره در کش
    const cacheKey = `chat_${matchId}`;
    let messages = await getCache(cacheKey) || [];
    messages.unshift(message);
    messages = messages.slice(0, 100); // نگه داشتن 100 پیام آخر
    setCache(cacheKey, messages, 3600000); // 1 ساعت
    
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ error: 'Send Failed' });
  }
});

// 🔐 API برای احراز هویت ساده
app.post('/api/auth/send-otp', async (req, res) => {
  // این اندپوینت می‌تواند با Supabase کار کند
  res.json({ success: true, message: 'OTP sent' });
});

// 📊 API برای دیتای فوتبال (با کش)
app.get('/api/football/:action', async (req, res) => {
  const { action } = req.params;
  const queryParams = new URLSearchParams(req.query).toString();
  const cacheKey = `football_${action}_${queryParams}`;
  
  let data = await getCache(cacheKey);
  
  if (!data) {
    try {
      const response = await fetch(
        `https://apiv3.apifootball.com/?action=${action}&${queryParams}&APIkey=${process.env.API_KEY_FOOTBALL || ''}`
      );
      data = await response.json();
      setCache(cacheKey, data, 30000); // 30 ثانیه
    } catch (e) {
      data = { error: 'API unavailable' };
    }
  }
  
  res.setHeader('Cache-Control', 'public, s-maxage=30');
  res.json(data);
});

// 🎛️ API های ادمین
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

// Middleware احراز هویت ادمین
function adminAuth(req, res, next) {
  const token = req.headers['admin-token'] || req.query.token;
  if (token === ADMIN_SECRET) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// دریافت تمام مسابقات (ادمین)
app.get('/api/admin/matches', adminAuth, async (req, res) => {
  const matches = await getCache('live_matches') || [];
  res.json(matches);
});

// به‌روزرسانی مسابقات (ادمین)
app.post('/api/admin/matches', adminAuth, async (req, res) => {
  const { matches } = req.body;
  
  if (!Array.isArray(matches)) {
    return res.status(400).json({ error: 'Matches must be an array' });
  }
  
  // اعتبارسنجی هر مسابقه
  const validMatches = matches.map((match, index) => ({
    id: match.id || `match_${Date.now()}_${index}`,
    title: match.title || 'مسابقه',
    time: match.time || 'نامشخص',
    status: match.status || 'upcoming',
    poster: match.poster || 'https://via.placeholder.com/400x225?text=Match',
    stream: match.stream || null,
    match_id: match.match_id || null,
    matchData: match.matchData || null
  }));
  
  setCache('live_matches', validMatches, CACHE_TTL.matches);
  
  res.json({ 
    success: true, 
    matches: validMatches,
    message: 'مسابقات با موفقیت به‌روزرسانی شد'
  });
});

// کنترل پخش (ادمین)
app.post('/api/admin/stream-control', adminAuth, async (req, res) => {
  const { matchId, action, streamUrl, posterUrl } = req.body;
  
  let matches = await getCache('live_matches') || [];
  const matchIndex = matches.findIndex(m => m.id === matchId);
  
  if (matchIndex === -1) {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  switch (action) {
    case 'play':
      matches[matchIndex].status = 'live';
      if (streamUrl) matches[matchIndex].stream = streamUrl;
      if (posterUrl) matches[matchIndex].poster = posterUrl;
      break;
    case 'pause':
      matches[matchIndex].status = 'paused';
      break;
    case 'stop':
      matches[matchIndex].status = 'finished';
      matches[matchIndex].stream = null;
      break;
    case 'update':
      if (streamUrl) matches[matchIndex].stream = streamUrl;
      if (posterUrl) matches[matchIndex].poster = posterUrl;
      break;
    case 'delete':
      matches.splice(matchIndex, 1);
      break;
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  
  setCache('live_matches', matches, CACHE_TTL.matches);
  
  res.json({ 
    success: true, 
    matches,
    action: `Action '${action}' applied to match ${matchId}`
  });
});

// روت اصلی
app.get('/', (req, res) => {
  res.json({ 
    status: 'AJ SPORTS API is running',
    version: '2.0',
    endpoints: {
      matches: '/api/matches',
      chat: '/api/chat/send',
      admin: '/api/admin/matches'
    }
  });
});

// Export for Vercel
export default app;

// برای اجرای لوکال
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 AJ SPORTS Server running on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api/matches`);
    console.log(`🎛️ Admin: http://localhost:${PORT}/api/admin/matches?token=admin123`);
  });
}
