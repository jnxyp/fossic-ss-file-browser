/**
 * ss-file-browser Bookmarklet v1
 * 加载方式：将以下 URL 保存为书签，点击后在 ParaTranz 页面注入状态条。
 *
 * javascript:(function(){var s=document.createElement('script');s.src='YOUR_SERVER/integration/paratranz-bookmarklet.js';document.head.appendChild(s);})();
 */
(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────────────────────────────────
  var BROWSER_BASE_URL = 'http://localhost:3000';
  var BROWSER_WINDOW_NAME = 'ss-file-browser';
  var PROTOCOL_NAME = 'ss-file-browser/v1';
  var ALLOWED_BROWSER_ORIGINS = [BROWSER_BASE_URL];
  // ──────────────────────────────────────────────────────────────────────────

  // 防止重复注入
  if (window.__ssfb_injected) return;
  window.__ssfb_injected = true;

  var browserWindow = null;
  var appOrigin = null;
  var statusEl = null;
  var autoFollow = true;

  // ── 状态条 UI ─────────────────────────────────────────────────────────────
  function createStatusBar() {
    var bar = document.createElement('div');
    bar.id = '__ssfb_bar';
    bar.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:999999',
      'background:#161b22', 'color:#c9d1d9', 'border:1px solid #30363d',
      'border-radius:8px', 'padding:10px 14px', 'font:12px/1.5 monospace',
      'box-shadow:0 4px 16px #0005', 'min-width:200px',
      'display:flex', 'flex-direction:column', 'gap:6px',
    ].join(';');
    document.body.appendChild(bar);
    return bar;
  }

  function renderStatusBar(status) {
    if (!statusEl) return;
    var dot = status === 'connected' ? '#3fb950' : status === 'searching' ? '#d29922' : '#f85149';
    var label = status === 'connected' ? '已连接' : status === 'searching' ? '连接中...' : '未连接';
    statusEl.innerHTML = [
      '<div style="display:flex;align-items:center;gap:6px;justify-content:space-between">',
      '  <span style="display:flex;align-items:center;gap:5px">',
      '    <span style="width:8px;height:8px;border-radius:50%;background:' + dot + ';display:inline-block"></span>',
      '    <strong>ss-file-browser</strong>',
      '  </span>',
      '  <button id="__ssfb_close" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:14px;line-height:1;padding:0">✕</button>',
      '</div>',
      '<div style="color:#8b949e">' + label + '</div>',
      '<div style="display:flex;gap:6px;margin-top:2px">',
      '  <button id="__ssfb_open" style="flex:1;background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px">重开浏览器</button>',
      '  <button id="__ssfb_toggle" style="flex:1;background:' + (autoFollow ? '#1f6feb33' : '#21262d') + ';border:1px solid ' + (autoFollow ? '#388bfd' : '#30363d') + ';color:' + (autoFollow ? '#58a6ff' : '#8b949e') + ';border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px">自动跟随 ' + (autoFollow ? 'ON' : 'OFF') + '</button>',
      '</div>',
    ].join('');

    document.getElementById('__ssfb_close').onclick = function () {
      statusEl.remove();
      statusEl = null;
      window.__ssfb_injected = false;
    };
    document.getElementById('__ssfb_open').onclick = openBrowser;
    document.getElementById('__ssfb_toggle').onclick = function () {
      autoFollow = !autoFollow;
      renderStatusBar(status);
    };
  }

  // ── 浏览器窗口管理 ────────────────────────────────────────────────────────
  function openBrowser() {
    renderStatusBar('searching');
    browserWindow = window.open(BROWSER_BASE_URL + '/viewer/localization', BROWSER_WINDOW_NAME);
  }

  function isBrowserOpen() {
    return browserWindow && !browserWindow.closed;
  }

  function sendNavigate(payload) {
    if (!isBrowserOpen()) {
      renderStatusBar('disconnected');
      return;
    }
    var target = appOrigin || BROWSER_BASE_URL;
    browserWindow.postMessage({
      protocol: PROTOCOL_NAME,
      type: 'PT_NAVIGATE_TO_STRING',
      requestId: Math.random().toString(36).slice(2),
      payload: payload,
    }, target);
  }

  // ── postMessage 监听（接收 FB_READY）────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (!ALLOWED_BROWSER_ORIGINS.some(function (o) { return event.origin.startsWith(o); })) return;
    var msg = event.data;
    if (!msg || msg.protocol !== PROTOCOL_NAME) return;
    if (msg.type === 'FB_READY') {
      appOrigin = msg.payload && msg.payload.appOrigin;
      renderStatusBar('connected');
    }
  });

  // ── DOM 解析：从 ParaTranz 页面提取词条信息 ──────────────────────────────
  function parseCurrentEntry() {
    // 主选择器：.context .well
    var well = document.querySelector('.context .well');
    if (!well) return null;

    var text = well.textContent || '';

    // 格式示例：starfarer.api.jar com/fs/.../FleetAssignment.class #160
    var jarMatch = text.match(/(\S+\.jar)/);
    var classMatch = text.match(/(\S+\.class)/);
    var constMatch = text.match(/#(\d+)/);

    if (!jarMatch || !classMatch || !constMatch) return null;

    return {
      jarName: jarMatch[1],
      className: classMatch[1],
      stringId: '#' + constMatch[1],
    };
  }

  function getActiveDataset() {
    // 尝试从页面 URL 或 UI 判断当前是 original 还是 localization
    // ParaTranz 上默认浏览的是汉化版，暂时固定为 localization
    return 'localization';
  }

  function triggerNavigate() {
    if (!autoFollow) return;
    var entry = parseCurrentEntry();
    if (!entry) return;

    sendNavigate({
      dataset: getActiveDataset(),
      jarName: entry.jarName,
      className: entry.className,
      stringId: entry.stringId,
    });
  }

  // ── 监听 ParaTranz 页面变化 ───────────────────────────────────────────────
  function attachListeners() {
    // 点击任意词条行时触发
    document.addEventListener('click', function (e) {
      var row = e.target.closest('.string-list .row.string, .context .well');
      if (row) setTimeout(triggerNavigate, 100); // 等待 DOM 更新
    });

    // MutationObserver 监听 .context 变化（应对键盘导航）
    var contextEl = document.querySelector('.context');
    if (contextEl) {
      var observer = new MutationObserver(function () {
        setTimeout(triggerNavigate, 150);
      });
      observer.observe(contextEl, { childList: true, subtree: true, characterData: true });
    }
  }

  // ── 初始化 ────────────────────────────────────────────────────────────────
  statusEl = createStatusBar();
  renderStatusBar('disconnected');
  attachListeners();
  openBrowser();
})();
