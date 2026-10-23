const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '512kb' }));

// Lightweight in-memory LAN hotspot relay for offline mobile hotspot multiplayer
const lanTopics = new Map();
let lanSeq = 1;

function pruneLanTopic(topic, now = Date.now()) {
  const list = lanTopics.get(topic);
  if (!list) return [];
  while (list.length > 0 && (now - list[0].at > 25000 || list.length > 240)) {
    list.shift();
  }
  if (lanTopics.size > 64) {
    for (const [k, v] of lanTopics) {
      if (!v.length || now - v[v.length - 1].at > 30000) lanTopics.delete(k);
    }
  }
  return list;
}

app.post('/api/lan-pub', (req, res) => {
  const topic = String(req.body?.topic || 'default').slice(0, 96);
  const msg = req.body?.msg;
  if (!msg || typeof msg !== 'object') return res.status(400).json({ ok: false });
  const now = Date.now();
  const list = pruneLanTopic(topic, now);
  const seq = lanSeq++;
  list.push({ seq, at: now, msg });
  lanTopics.set(topic, list);
  res.json({ ok: true, seq });
});

app.get('/api/lan-poll', (req, res) => {
  const topic = String(req.query?.topic || 'default').slice(0, 96);
  const since = Number(req.query?.since) || 0;
  const list = pruneLanTopic(topic, Date.now());
  const messages = since > 0 ? list.filter(item => item.seq > since) : list.slice(-30);
  res.json({ ok: true, seq: lanSeq - 1, messages });
});

app.use(express.static(path.join(__dirname)));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

