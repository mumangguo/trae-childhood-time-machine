/**
 * 童年时光机 · 我的梦想档案馆
 * Express + @libsql/client (Turso)
 *
 * 环境变量：
 *   TURSO_DATABASE_URL  Turso 数据库 URL（libsql://xxx.turso.io 或 file:./data/dreams.db）
 *   TURSO_AUTH_TOKEN    Turso 鉴权 token（远端必填，本地 file: 可省略）
 *
 * 不设环境变量时，本地默认落到 ./data/dreams.db 文件。
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 数据库 ----------
function buildDbConfig() {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    };
  }
  // 本地兜底：写入 ./data/dreams.db
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { url: 'file:' + path.join(dir, 'dreams.db') };
}

const db = createClient(buildDbConfig());

let dbReady = (async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS dreams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname    TEXT NOT NULL,
      dream       TEXT NOT NULL,
      trae        TEXT,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
})().catch((e) => {
  console.error('DB init failed:', e);
});

// 中间件：确保表已创建后再处理 API
async function ensureDb(req, res, next) {
  try { await dbReady; next(); }
  catch (e) { res.status(500).json({ ok: false, msg: '数据库初始化失败' }); }
}

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
  if (recentSubmits.size > 500) {
    for (const [k, t] of recentSubmits) if (now - t > 60000) recentSubmits.delete(k);
  }
  return false;
}

// ---------- API ----------
// 发布梦想
app.post('/api/dream', ensureDb, async (req, res) => {
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

    const result = await db.execute({
      sql: 'INSERT INTO dreams (nickname, dream, trae) VALUES (?, ?, ?)',
      args: [nickname, dream, trae || null],
    });
    const id = Number(result.lastInsertRowid);
    const row = await getOne(id);
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// 列表（分页）
app.get('/api/dreams', ensureDb, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, parseInt(req.query.size) || 12));
    const offset = (page - 1) * size;

    const [listRs, countRs] = await Promise.all([
      db.execute({
        sql: 'SELECT id, nickname, dream, trae, create_time FROM dreams ORDER BY id DESC LIMIT ? OFFSET ?',
        args: [size, offset],
      }),
      db.execute('SELECT COUNT(*) AS c FROM dreams'),
    ]);
    const list = listRs.rows.map(rowToObj);
    const total = Number(countRs.rows[0].c);
    res.json({ ok: true, data: list, page, size, total, hasMore: offset + list.length < total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// 单条
app.get('/api/dream/:id', ensureDb, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: '参数错误' });
    const row = await getOne(id);
    if (!row) return res.status(404).json({ ok: false, msg: '梦想不存在' });
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

// ---------- 工具 ----------
function rowToObj(row) {
  // libsql Row 是数组风格，但带列名属性
  return {
    id: Number(row.id),
    nickname: row.nickname,
    dream: row.dream,
    trae: row.trae,
    create_time: row.create_time,
  };
}
async function getOne(id) {
  const rs = await db.execute({
    sql: 'SELECT id, nickname, dream, trae, create_time FROM dreams WHERE id = ?',
    args: [id],
  });
  return rs.rows[0] ? rowToObj(rs.rows[0]) : null;
}

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
