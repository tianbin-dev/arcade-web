/* 本站今日访问计数（免注册公开计数服务 abacus，服务端全局计数）
   口径：本站当日页面访问次数（含刷新），非独立访客数、非在线人数。
   任何失败都降级为「—」，不抛异常。 */
'use strict';
(() => {
  const BASE = 'https://abacus.jasoncameron.dev';
  const NS = 'tianbin-arcade';
  const TIMEOUT = 6000;
  const site = document.body.dataset.site;
  const el = document.getElementById('visit-count');
  if (!site || !el) return;

  function today() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      const d = new Date(), p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  fetch(`${BASE}/hit/${NS}/${encodeURIComponent(site + '-' + today())}`,
        { signal: ctrl.signal, cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      const v = data && data.value;
      el.textContent = (typeof v === 'number' && isFinite(v)) ? v.toLocaleString('en-US') : '—';
    })
    .catch(() => { el.textContent = '—'; })
    .finally(() => clearTimeout(timer));
})();
