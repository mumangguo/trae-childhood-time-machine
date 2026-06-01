/**
 * 童年时光机 · 我的梦想档案馆
 * Express + @libsql/client (Turso) + 敏感词过滤 + 24h IP/fp 限流
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createClient } = require('@libsql/client');
const sensitive = require('./lib/sensitive');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', true);

// ---------- 数据库 ----------
function buildDbConfig() {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    };
  }
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
  await db.execute(`
    CREATE TABLE IF NOT EXISTS submitters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip          TEXT,
      fp          TEXT,
      dream_id    INTEGER,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_submitters_ip ON submitters(ip, created_at)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_submitters_fp ON submitters(fp, created_at)`);
})().catch((e) => {
  console.error('DB init failed:', e);
});

async function ensureDb(req, res, next) {
  try { await dbReady; next(); }
  catch (e) { res.status(500).json({ ok: false, msg: '数据库初始化失败' }); }
}

// ---------- 中间件 ----------
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 工具 ----------
function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || (req.socket.remoteAddress || '').replace('::ffff:', '') || 'unknown';
}

const recentSubmits = new Map();
function antiSpam(ip, body) {
  const key = ip + '|' + (body.nickname || '') + '|' + (body.dream || '');
  const now = Date.now();
  const last = recentSubmits.get(key);
  if (last && now - last < 5000) return true;
  recentSubmits.set(key, now);
  if (recentSubmits.size > 500) {
    for (const [k, t] of recentSubmits) if (now - t > 60000) recentSubmits.delete(k);
  }
  return false;
}

// 24h 内 IP / fp 是否已经成功发过
async function already24h(ip, fp) {
  const since = "datetime('now','-24 hours')";
  const rs = await db.execute({
    sql: `SELECT id FROM submitters
            WHERE created_at >= ${since}
              AND ( (ip IS NOT NULL AND ip = ?) OR (fp IS NOT NULL AND fp = ?) )
            LIMIT 1`,
    args: [ip || '', fp || ''],
  });
  return rs.rows.length > 0;
}

// ---------- API ----------
app.post('/api/dream', ensureDb, async (req, res) => {
  try {
    let { nickname, dream, trae, fp } = req.body || {};
    nickname = (nickname || '').toString().trim();
    dream = (dream || '').toString().trim();
    trae = (trae || '').toString().trim();
    fp = (fp || '').toString().trim().slice(0, 64);

    if (!nickname || nickname.length > 10) {
      return res.status(400).json({ ok: false, msg: '昵称必填，且不超过10字' });
    }
    if (!dream || dream.length < 5 || dream.length > 100) {
      return res.status(400).json({ ok: false, msg: '童年梦想必填，5-100字' });
    }
    if (trae && trae.length > 50) {
      return res.status(400).json({ ok: false, msg: 'TRAE实现句不超过50字' });
    }

    const ip = clientIp(req);

    if (antiSpam(ip, { nickname, dream })) {
      return res.status(429).json({ ok: false, msg: '提交太快啦，请稍后再试' });
    }

    if (sensitive.anyDirty(nickname, dream, trae)) {
      return res.status(400).json({ ok: false, code: 'DIRTY', msg: '内容包含违禁词，请修改后再提交' });
    }

    if (await already24h(ip, fp)) {
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMIT',
        msg: '24小时内每人只能写一条梦想哦，明天再来续写吧 ✨',
      });
    }

    const result = await db.execute({
      sql: 'INSERT INTO dreams (nickname, dream, trae) VALUES (?, ?, ?)',
      args: [nickname, dream, trae || null],
    });
    const id = Number(result.lastInsertRowid);

    await db.execute({
      sql: 'INSERT INTO submitters (ip, fp, dream_id) VALUES (?, ?, ?)',
      args: [ip || '', fp || '', id],
    });

    const row = await getOne(id);
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: '服务器开小差啦' });
  }
});

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

// ---------- 页面 ----------
const VIEWS = path.join(__dirname, 'views');
const sendPage = (file) => (_req, res) => res.sendFile(path.join(VIEWS, file));

app.get('/', sendPage('index.html'));
app.get('/create', sendPage('create.html'));
app.get('/create.html', sendPage('create.html'));
app.get('/card', sendPage('card.html'));
app.get('/card.html', sendPage('card.html'));
app.get('/wall', sendPage('wall.html'));
app.get('/wall.html', sendPage('wall.html'));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(VIEWS, '404.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n童年时光机已启动 → http://localhost:${PORT}\n`);
  });
}

module.exports = app;
