/**
 * 童年时光机 · 我的梦想档案馆
 * Express + better-sqlite3
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 数据库 ----------
// Vercel 文件系统只读，仅 /tmp 可写
const DB_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'dreams.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS dreams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname    TEXT NOT NULL,
    dream       TEXT NOT NULL,
    trae        TEXT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const stmtInsert = db.prepare(
  'INSERT INTO dreams (nickname, dream, trae) VALUES (?, ?, ?)'
);
const stmtList = db.prepare(
  'SELECT id, nickname, dream, trae, create_time FROM dreams ORDER BY id DESC LIMIT ? OFFSET ?'
);
const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM dreams');
const stmtOne = db.prepare(
  'SELECT id, nickname, dream, trae, create_time FROM dreams WHERE id = ?'
);

// ---------- 中间件 ----------
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 简单防重复提交（IP + 内容 hash, 5s 内拒绝） ----------
const recentSubmits = new Map();
function antiSpam(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
  const key = ip + '|' + (req.body.nickname || '') + '|' + (req.body.dream || '');
  const now = Date.now();
  const last = recentSubmits.get(key);
  if (last && now - last < 5000) return true;
  recentSubmits.set(key, now);
  // 简单清理
  if (recentSubmits.size > 500) {
    for (const [k, t] of recentSubmits) if (now - t > 60000) recentSubmits.delete(k);
  }
  return false;
}

// ---------- API ----------
// 发布梦想
app.post('/api/dream', (req, res) => {
  try {
    let { nickname, dream, trae } = req.body || {};
    nickname = (nickname || '').toString().trim();
    dream = (dream || '').toString().trim();
    trae = (trae || '').toString().trim();

    if (!nickname || nickname.length > 10) {
      return res.status(400).json({ ok: false, msg: '昵称必填，且不超过10字' });
    }
    if (!dream || dream.length < 5 || dream.length > 100) {
      return res.status(400).json({ ok: false, msg: '童年梦想必填，5-100字' });
    }
    if (trae && trae.length > 50) {
      return res.status(400).json({ ok: false, msg: 'TRAE实现句不超过50字' });
    }
    if (antiSpam(req)) {
      return res.status(429).json({ ok: false, msg: '提交太快啦，请稍后再试' });
    }
    const info = stmtInsert.run(nickname, dream, trae || null);
    const row = stmtOne.get(info.lastInsertRowid);
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// 列表（分页）
app.get('/api/dreams', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, parseInt(req.query.size) || 12));
    const offset = (page - 1) * size;
    const list = stmtList.all(size, offset);
    const total = stmtCount.get().c;
    res.json({ ok: true, data: list, page, size, total, hasMore: offset + list.length < total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// 单条
app.get('/api/dream/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: '参数错误' });
    const row = stmtOne.get(id);
    if (!row) return res.status(404).json({ ok: false, msg: '梦想不存在' });
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// ---------- 页面路由 ----------
const VIEWS = path.join(__dirname, 'views');
const sendPage = (file) => (_req, res) => res.sendFile(path.join(VIEWS, file));

app.get('/', sendPage('index.html'));
app.get('/create', sendPage('create.html'));
app.get('/create.html', sendPage('create.html'));
app.get('/card', sendPage('card.html'));
app.get('/card.html', sendPage('card.html'));
app.get('/wall', sendPage('wall.html'));
app.get('/wall.html', sendPage('wall.html'));

// 404
app.use((_req, res) => {
  res.status(404).sendFile(path.join(VIEWS, '404.html'));
});

// 本地启动
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n童年时光机已启动 → http://localhost:${PORT}\n`);
  });
}

module.exports = app;
