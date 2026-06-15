// کش ساده برای پیام‌ها
const chatCache = new Map();

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - ارسال پیام
  if (req.method === 'POST') {
    const { text, email, avatar, reply_text, match_id } = req.body;

    if (!text || !email) {
      return res.status(400).json({ error: 'متن و ایمیل الزامی است' });
    }

    const message = {
      id: Date.now().toString(36),
      text: text.substring(0, 500),
      sender: email.split('@')[0],
      sender_identity_id: email,
      avatar: avatar || '',
      reply_text: reply_text || null,
      match_id: match_id || 'global',
      timestamp: Date.now()
    };

    // ذخیره تو کش
    const key = `chat_${match_id || 'global'}`;
    let messages = chatCache.get(key) || [];
    messages.unshift(message);
    messages = messages.slice(0, 100);
    chatCache.set(key, messages);

    return res.status(200).json({ success: true, message });
  }

  // GET - دریافت پیام‌ها
  if (req.method === 'GET') {
    const matchId = req.query.match_id || 'global';
    const key = `chat_${matchId}`;
    const messages = chatCache.get(key) || [];
    return res.status(200).json({ messages });
  }

  res.status(405).json({ error: 'Use POST or GET' });
}
