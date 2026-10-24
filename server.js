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

const activeRoomAds = new Map();
function pruneActiveRoomAds(now = Date.now()) {
  for (const [roomId, item] of activeRoomAds.entries()) {
    if (now - item.at > 20000) activeRoomAds.delete(roomId);
  }
}

app.post('/api/lan-pub', (req, res) => {
  const topic = String(req.body?.topic || 'default').slice(0, 96);
  const msg = req.body?.msg;
  if (!msg || typeof msg !== 'object') return res.status(400).json({ ok: false });
  const now = Date.now();
  const list = pruneLanTopic(topic, now);
  const seq = lanSeq++;
  list.push({ seq, at: now, msg });
  if (topic === 'ps_darkest_v34/lobby') {
    pruneActiveRoomAds(now);
    if (msg.type === 'ROOM_AD' && msg.roomId) {
      if (msg.locked || Number(msg.count) >= Number(msg.max || 3)) {
        activeRoomAds.delete(msg.roomId);
      } else {
        activeRoomAds.set(msg.roomId, { at: now, msg });
      }
    } else if (msg.type === 'ROOM_CLOSED' && msg.roomId) {
      activeRoomAds.delete(msg.roomId);
    } else if (msg.type === 'ROOM_QUERY' || msg.type === 'ROOM_PROBE') {
      for (const [, entry] of activeRoomAds.entries()) {
        if (!msg.code || entry.msg.code === msg.code) {
          list.push({
            seq: lanSeq++,
            at: now,
            msg: { ...entry.msg, reply: true, id: Math.random().toString(16).slice(2, 18) }
          });
        }
      }
    }
  }
  lanTopics.set(topic, list);
  res.json({ ok: true, seq });
});

app.get('/api/lan-poll', (req, res) => {
  const topic = String(req.query?.topic || 'default').slice(0, 96);
  const since = Number(req.query?.since) || 0;
  const now = Date.now();
  const list = pruneLanTopic(topic, now);
  let messages = since > 0 ? list.filter(item => item.seq > since) : list.slice(-40);
  if (topic === 'ps_darkest_v34/lobby' && since === 0) {
    pruneActiveRoomAds(now);
    for (const [roomId, entry] of activeRoomAds.entries()) {
      if (!messages.some(m => m.msg && m.msg.type === 'ROOM_AD' && m.msg.roomId === roomId)) {
        messages.push({
          seq: lanSeq - 1,
          at: entry.at,
          msg: { ...entry.msg, id: Math.random().toString(16).slice(2, 18) }
        });
      }
    }
  }
  res.json({ ok: true, seq: lanSeq - 1, messages });
});

app.use(express.static(path.join(__dirname)));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

