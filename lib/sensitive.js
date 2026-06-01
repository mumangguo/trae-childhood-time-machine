/**
 * 敏感词过滤（DFA + 文本归一化）
 * 词库：data/sensitive-words.txt（每行一个词，UTF-8）
 * 命中即返回 true，且不返回命中的词，避免被对抗探测。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'sensitive-words.txt');

// 归一化：去空白与常见标点；全角→半角；英文统一小写
const PUNC_RE = /[\s　\.\,\!\?\;\:\-\_\(\)\[\]\{\}\<\>\/\\\|`~@#\$%\^&\*\+=\"'。，！？；：—（）【】《》、…·]/g;
function normalize(s) {
  if (!s) return '';
  // 全角转半角
  s = String(s).replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/　/g, ' ');
  s = s.toLowerCase().replace(PUNC_RE, '');
  return s;
}

// ---------- DFA ----------
function buildTrie(words) {
  const root = Object.create(null);
  for (const raw of words) {
    const w = normalize(raw);
    // 过滤单字词，避免“妈”“爸”“色”等高频单字误杀正常内容。
    // 这类词需要更强上下文判断，活动站点优先降低误伤。
    if (!w || Array.from(w).length < 2) continue;
    let node = root;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (!node[ch]) node[ch] = Object.create(null);
      node = node[ch];
    }
    node.__end = true;
    SIZE++;
  }
  return root;
}

let TRIE = null;
let SIZE = 0;

function load() {
  if (TRIE) return;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const words = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    TRIE = buildTrie(words);
    console.log(`[sensitive] loaded ${SIZE} words`);
  } catch (e) {
    console.warn('[sensitive] dict not found, allow all:', e.message);
    TRIE = Object.create(null);
    SIZE = 0;
  }
}

/**
 * 是否命中敏感词。
 * @param {string} text
 * @returns {boolean}
 */
function isDirty(text) {
  load();
  if (!SIZE) return false;
  const s = normalize(text);
  if (!s) return false;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    let node = TRIE[s[i]];
    if (!node) continue;
    if (node.__end) return true;
    for (let j = i + 1; j < n && node; j++) {
      node = node[s[j]];
      if (node && node.__end) return true;
    }
  }
  return false;
}

/** 一次校验多个字段，任一命中即返回 true */
function anyDirty(...fields) {
  for (const f of fields) if (f && isDirty(f)) return true;
  return false;
}

module.exports = { isDirty, anyDirty, normalize, load, get size() { load(); return SIZE; } };
