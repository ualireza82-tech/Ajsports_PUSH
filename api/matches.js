import fetch from 'node-fetch';

// این-مموری کش ساده
let cachedData = null;
let cachedTime = 0;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

  try {
    // اگه کش معتبره، همونو بفرست
    if (cachedData && (Date.now() - cachedTime) < 15000) {
      return res.json(cachedData);
    }

    // بگیر از منبع
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
  const fallback = [{
    id: '1',
    title: 'مسابقه تست AJ SPORTS',
    time: '۲۱:۰۰',
    status: 'upcoming',
    poster: 'https://via.placeholder.com/400x225?text=AJ+SPORTS',
    stream: null,
    match_id: null
  }];

  return res.json(fallback);
}
