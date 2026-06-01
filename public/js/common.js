/* 全局通用脚本：toast、字数计数、装饰元素、时间格式化、API 封装 */

window.TM = (function () {
  // ---- toast ----
  function toast(msg, type) {
    let el = document.querySelector('.pixel-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pixel-toast';
      document.body.appendChild(el);
    }
    el.className = 'pixel-toast' + (type === 'err' ? ' err' : '');
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---- API ----
  async function api(path, opt) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opt || {}));
    let data;
    try { data = await res.json(); } catch (e) { data = { ok: false, msg: '网络异常' }; }
    return data;
  }

  // ---- 时间格式 ----
  function fmtTime(s) {
    if (!s) return '';
    // SQLite CURRENT_TIMESTAMP 返回 UTC 字符串 'YYYY-MM-DD HH:MM:SS'
    const d = new Date(s.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return s;
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ---- HTML 转义 ----
  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- 字数计数 ----
  function bindCounter(inputSel, counterSel, max, min) {
    const i = document.querySelector(inputSel);
    const c = document.querySelector(counterSel);
    if (!i || !c) return;
    const update = () => {
      const len = i.value.length;
      c.textContent = len + ' / ' + max + (min ? ' （至少' + min + '字）' : '');
      c.classList.toggle('warn', len > max);
    };
    i.addEventListener('input', update);
    update();
  }

  // ---- 装饰元素：星星、纸飞机、电波 ----
  function decorate(container) {
    container = container || document.body;
    // 星星 12 颗
    const stars = 14;
    for (let i = 0; i < stars; i++) {
      const s = document.createElement('span');
      s.className = 'pixel-star';
      s.style.left = (Math.random() * 100).toFixed(2) + 'vw';
      s.style.top = (60 + Math.random() * 600).toFixed(0) + 'px';
      s.style.animationDelay = (Math.random() * 2).toFixed(2) + 's';
      s.style.zIndex = 0;
      s.style.pointerEvents = 'none';
      container.appendChild(s);
    }
    // 纸飞机 2 架（像素 SVG）
    const planeSvg = '<svg viewBox="0 0 16 16" shape-rendering="crispEdges">' +
      '<g fill="#00ff85">' +
      '<rect x="1" y="6" width="1" height="1"/>' +
      '<rect x="2" y="6" width="1" height="1"/>' +
      '<rect x="3" y="6" width="1" height="1"/>' +
      '<rect x="4" y="6" width="1" height="1"/>' +
      '<rect x="5" y="6" width="1" height="1"/>' +
      '<rect x="6" y="6" width="1" height="1"/>' +
      '<rect x="7" y="6" width="1" height="1"/>' +
      '<rect x="8" y="6" width="1" height="1"/>' +
      '<rect x="9" y="6" width="1" height="1"/>' +
      '<rect x="10" y="6" width="1" height="1"/>' +
      '<rect x="11" y="6" width="1" height="1"/>' +
      '<rect x="12" y="6" width="1" height="1"/>' +
      '<rect x="13" y="7" width="1" height="1"/>' +
      '<rect x="14" y="8" width="1" height="1"/>' +
      '<rect x="13" y="8" width="1" height="1"/>' +
      '<rect x="12" y="7" width="1" height="1"/>' +
      '<rect x="11" y="7" width="1" height="1"/>' +
      '<rect x="10" y="7" width="1" height="1"/>' +
      '<rect x="9" y="7" width="1" height="1"/>' +
      '<rect x="8" y="7" width="1" height="1"/>' +
      '<rect x="7" y="7" width="1" height="1"/>' +
      '<rect x="6" y="5" width="1" height="1"/>' +
      '<rect x="5" y="5" width="1" height="1"/>' +
      '<rect x="4" y="5" width="1" height="1"/>' +
      '<rect x="3" y="5" width="1" height="1"/>' +
      '<rect x="2" y="5" width="1" height="1"/>' +
      '<rect x="1" y="5" width="1" height="1"/>' +
      '<rect x="0" y="6" width="1" height="1"/>' +
      '<rect x="0" y="7" width="1" height="1"/>' +
      '<rect x="1" y="7" width="1" height="1"/>' +
      '<rect x="2" y="7" width="1" height="1"/>' +
      '<rect x="3" y="7" width="1" height="1"/>' +
      '<rect x="4" y="7" width="1" height="1"/>' +
      '<rect x="5" y="7" width="1" height="1"/>' +
      '</g></svg>';
    for (let i = 0; i < 2; i++) {
      const p = document.createElement('div');
      p.className = 'pixel-plane plane-fly';
      p.innerHTML = planeSvg;
      p.style.top = (120 + i * 220) + 'px';
      p.style.animationDelay = (i * -8) + 's';
      p.style.animationDuration = (18 + i * 6) + 's';
      p.style.zIndex = 0;
      container.appendChild(p);
    }
  }

  // 字符串长度（按 Unicode）
  function lenOf(s) {
    return Array.from(s || '').length;
  }

  // ---- 浏览器指纹（FingerprintJS 开源版） ----
  let _fpPromise = null;
  function getFingerprint() {
    if (_fpPromise) return _fpPromise;
    _fpPromise = (async () => {
      try {
        const cached = localStorage.getItem('tm_fp');
        if (cached) return cached;
        const mod = await import('https://openfpcdn.io/fingerprintjs/v4/esm.min.js');
        const fp = await mod.load();
        const r = await fp.get();
        if (r && r.visitorId) {
          localStorage.setItem('tm_fp', r.visitorId);
          return r.visitorId;
        }
      } catch (e) { /* fall through */ }
      // 兜底：本地随机 ID
      let id = localStorage.getItem('tm_fp');
      if (!id) {
        id = 'fb-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('tm_fp', id);
      }
      return id;
    })();
    return _fpPromise;
  }

  // ---- 用户网络信息：走同域后端，避免第三方接口 CORS/403 ----
  async function getClientInfo() {
    try {
      const j = await api('/api/client-info');
      if (j && j.ok) return j.data;
    } catch (e) {}
    return null;
  }

  return { toast, api, fmtTime, esc, bindCounter, decorate, lenOf, getFingerprint, getClientInfo };
})();
