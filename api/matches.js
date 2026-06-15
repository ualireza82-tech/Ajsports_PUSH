import fetch from 'node-fetch';

const CACHE = new Map();
const CACHE_TTL = 15000;

export default async function handler(req, res) {
  const cacheKey = 'live_matches';
  const cached = CACHE.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
    return res.json(cached.data);
  }
  
  try {
    const response = await fetch('https://news-et1s.onrender.com/api/matches', {
      timeout: 5000,
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      CACHE.set(cacheKey, { data, timestamp: Date.now() });
      
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
      return res.json(data);
    }
  } catch (e) {}
  
  // Fallback
  const fallbackData = [{
    id: 'fallback',
    title: 'در حال بارگذاری...',
    time: 'به‌زودی',
    status: 'upcoming',
    poster: 'https://via.placeholder.com/400x225?text=AJ+SPORTS'
  }];
  
  res.setHeader('X-Cache', 'FALLBACK');
  res.json(fallbackData);
}
