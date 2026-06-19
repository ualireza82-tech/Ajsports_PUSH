// api/stream-proxy.js
// پروکسی استریم M3U8/TS برای دور زدن CORS و محدودیت IP
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url param' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AJSPORTS/1.0)',
        'Origin': 'https://ajsportstv.netlify.app',
        'Referer': 'https://ajsportstv.netlify.app/',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream fetch error' });
    }

    // هدرها رو ست کن
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=10');

    // بدنه رو مستقیم pipe کن
    res.status(200);
    response.body.pipe(res);
  } catch (error) {
    console.error('Stream proxy error:', error.message);
    res.status(502).json({ error: 'Proxy failed' });
  }
          }
