import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { Readable } from 'stream';

const app = express();

// این-مموری کش برای ۱۰ میلیون کاربر
const memoryCache = new Map();
const CACHE_TTL = {
  matches: 15000,      // 15 ثانیه
  football: 30000,     // 30 ثانیه
  chat: 3600000        // 1 ساعت
};

function setCache(key, value, ttl = 15000) {
  const expires = Date.now() + ttl;
  memoryCache.set(key, { value: JSON.parse(JSON.stringify(value)), expires });
}

async function getCache(key) {
  const memData = memoryCache.get(key);
  if (memData && memData.expires > Date.now()) {
    return memData.value;
  }
  return null;
}

// CORS برای فرانت‌اند خارجی
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'admin-token']
}));
app.use(express.json());

// 🎯 API اصلی مسابقات
app.get('/api/matches', async (req, res) => {
  try {
    const cacheKey = 'live_matches';
    let matches = await getCache(cacheKey);
    
    if (!matches) {
      console.log('🔄 Cache MISS - Fetching from source');
      try {
        const response = await fetch('https://news-et1s.onrender.com/api/matches', {
          timeout: 5000,
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
          const rawData = await response.json();
          matches = Array.isArray(rawData) ? rawData : (rawData.matches || rawData.data || []);
          setCache(cacheKey, matches, CACHE_TTL.matches);
          console.log('✅ Matches fetched and cached');
        }
      } catch (fetchError) {
        console.error('Source fetch error:', fetchError.message);
      }
    }
    
    if (!matches || matches.length === 0) {
      matches = [{
        id: 'fallback',
        title: 'در حال بارگذاری مسابقات...',
        time: 'به‌زودی',
        status: 'upcoming',
        poster: 'https://via.placeholder.com/400x225?text=AJ+SPORTS',
        stream: null,
        match_id: null
      }];
    }
    
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30, stale-if-error=300');
    res.setHeader('X-Cache', matches[0]?.id !== 'fallback' ? 'HIT' : 'MISS');
    res.json(matches);
    
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(200).json([{
      id: 'error_fallback',
      title: 'خطا - لطفاً بروزرسانی کنید',
      time: '---',
      status: 'upcoming',
      poster: 'https://via.placeholder.com/400x225?text=Error',
      stream: null,
      match_id: null
    }]);
  }
});

// 🔄 SSE چت
app.get('/api/chat/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  const matchId = req.query.match_id || 'global';
  
  // Heartbeat هر ۳۰ ثانیه
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 30000);

  // ارسال پیام‌های کش شده
  getCache(`chat_${matchId}`).then(messages => {
    if (messages && Array.isArray(messages)) {
      messages.forEach(msg => {
        res.write(`data: ${JSON.stringify({ type: 'message', payload: msg })}\n\n`);
      });
    }
  });

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// 📨 ارسال پیام چت
app.post('/api/chat/send', async (req, res) => {
  try {
    const { text, email, avatar, reply_text, match_id } = req.body;
    
    if (!text || !email) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    
    const matchId = match_id || 'global';
    const message = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: text.substring(0, 500),
      sender: email.split('@')[0],
      sender_identity_id: email,
      avatar: avatar || '',
      reply_text: reply_text ? reply_text.substring(0, 200) : null,
      match_id: matchId,
      timestamp: Date.now()
    };
    
    const cacheKey = `chat_${matchId}`;
    let messages = (await getCache(cacheKey)) || [];
    messages.unshift(message);
    messages = messages.slice(0, 100);
    setCache(cacheKey, messages, CACHE_TTL.chat);
    
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ error: 'Send failed' });
  }
});

// 📊 API فوتبال (پروکسی با کش)
app.get('/api/football/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const queryParams = new URLSearchParams(req.query).toString();
    const cacheKey = `football_${action}_${queryParams}`;
    
    let data = await getCache(cacheKey);
    
    if (!data) {
      const apiKey = process.env.API_KEY_FOOTBALL || '';
      const url = `https://apiv3.apifootball.com/?action=${action}&${queryParams}&APIkey=${apiKey}`;
      
      const response = await fetch(url, { timeout: 5000 });
      data = await response.json();
      setCache(cacheKey, data, CACHE_TTL.football);
    }
    
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    res.json(data);
  } catch (error) {
    res.status(200).json({ error: 'API unavailable' });
  }
});

// 🎛️ پنل ادمین
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

function adminAuth(req, res, next) {
  const token = req.headers['admin-token'] || req.query.token || (req.body && req.body.token);
  if (token === ADMIN_SECRET) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized - توکن نامعتبر' });
  }
}

// دریافت مسابقات
app.get('/api/admin/matches', adminAuth, async (req, res) => {
  const matches = await getCache('live_matches') || [];
  res.json(matches);
});

// به‌روزرسانی مسابقات
app.post('/api/admin/matches', adminAuth, async (req, res) => {
  const { matches } = req.body;
  
  if (!Array.isArray(matches)) {
    return res.status(400).json({ error: 'Matches must be an array' });
  }
  
  const validMatches = matches.map((match, index) => ({
    id: match.id || `match_${Date.now()}_${index}`,
    title: match.title || 'مسابقه',
    time: match.time || 'نامشخص',
    status: match.status || 'upcoming',
    poster: match.poster || 'https://via.placeholder.com/400x225?text=Match',
    stream: match.stream || null,
    match_id: match.match_id || null
  }));
  
  setCache('live_matches', validMatches, CACHE_TTL.matches);
  
  res.json({ 
    success: true, 
    matches: validMatches,
    message: '✅ مسابقات بروزرسانی شد'
  });
});

// کنترل پخش
app.post('/api/admin/stream-control', adminAuth, async (req, res) => {
  const { matchId, action, streamUrl, posterUrl } = req.body;
  
  // پاکسازی کش
  if (action === 'clear-cache') {
    memoryCache.clear();
    return res.json({ success: true, message: '🧹 کش پاکسازی شد' });
  }
  
  let matches = await getCache('live_matches') || [];
  const matchIndex = matches.findIndex(m => m.id === matchId);
  
  if (matchIndex === -1 && action !== 'add') {
    return res.status(404).json({ error: 'Match not found' });
  }
  
  switch (action) {
    case 'play':
      matches[matchIndex].status = 'live';
      if (streamUrl) matches[matchIndex].stream = streamUrl;
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
    case 'add':
      matches.push({
        id: `match_${Date.now()}`,
        title: req.body.title || 'مسابقه جدید',
        time: req.body.time || 'نامشخص',
        status: 'upcoming',
        poster: posterUrl || '',
        stream: streamUrl || null,
        match_id: matchId || null
      });
      break;
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  
  setCache('live_matches', matches, CACHE_TTL.matches);
  
  res.json({ 
    success: true, 
    matches,
    action: `✅ ${action} روی مسابقه ${matchId || 'جدید'} اجرا شد`
  });
});

// 📡 پروکسی استریم M3U8 / TS — دور زدن CORS و محدودیت‌های IP
app.get('/api/stream-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url param' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://ajsportstv.netlify.app',
        'Referer': 'https://ajsportstv.netlify.app/'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream error' });
    }

    // هدرهای مناسب برای M3U8 و TS
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=5');
    
    // انتقال بدنه به صورت stream
    if (response.body) {
      const readable = Readable.from(response.body);
      readable.pipe(res);
      readable.on('error', (err) => {
        console.error('Stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
        }
      });
    } else {
      const buffer = await response.buffer();
      res.send(buffer);
    }
  } catch (e) {
    console.error('Stream proxy error:', e.message);
    res.status(502).json({ error: 'Proxy failed' });
  }
});

// صفحه اصلی API
app.get('/api', (req, res) => {
  const cacheSize = memoryCache.size;
  const matchCount = memoryCache.get('live_matches')?.value?.length || 0;
  
  res.json({ 
    status: '🚀 AJ SPORTS API v2.0',
    uptime: process.uptime(),
    cache: {
      entries: cacheSize,
      matches: matchCount
    },
    endpoints: {
      matches: '/api/matches',
      chat: '/api/chat/send',
      chatEvents: '/api/chat/events',
      football: '/api/football/:action',
      admin: '/api/admin/matches',
      streamProxy: '/api/stream-proxy?url=...'
    }
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
