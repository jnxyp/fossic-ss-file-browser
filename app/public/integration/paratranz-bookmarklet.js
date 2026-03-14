/**
 * ss-file-browser Bookmarklet v2
 *
 * 加载方式：
 * javascript:(function(){var s=document.createElement('script');s.src='YOUR_SERVER/integration/paratranz-bookmarklet.js';document.head.appendChild(s);})();
 */
(function () {
  'use strict';

  var REQUIRED_PROJECT_PREFIX = 'https://paratranz.cn/projects/3489';

  if (!window.location.href.startsWith(REQUIRED_PROJECT_PREFIX)) {
    window.alert('ss-file-browser 仅支持在 ParaTranz 项目 3489 页面中启动。');
    return;
  }

  if (window.__ssfb_injected) {
    return;
  }
  window.__ssfb_injected = true;

  var SCRIPT_PATH = '/integration/paratranz-bookmarklet.js';
  var PROTOCOL_NAME = 'ss-file-browser/v1';
  var AUTO_FOLLOW_STORAGE_KEY = '__ssfb_auto_follow';
  var WINDOW_CHECK_INTERVAL_MS = 1500;

  function resolveBrowserBaseUrl() {
    var currentScript = document.currentScript;
    if (!currentScript || !currentScript.src) {
      currentScript = document.querySelector('script[src*="' + SCRIPT_PATH + '"]');
    }

    if (currentScript && currentScript.src) {
      var scriptUrl = new URL(currentScript.src, window.location.href);
      return scriptUrl.origin + scriptUrl.pathname.replace(/\/integration\/paratranz-bookmarklet\.js$/, '');
    }

    return 'http://localhost:3000';
  }

  var browserBaseUrl = resolveBrowserBaseUrl();
  var allowedBrowserOrigin = new URL(browserBaseUrl, window.location.href).origin;

  var browserWindow = null;
  var appOrigin = null;
  var statusEl = null;
  var autoFollow = loadAutoFollow();
  var connectionStatus = 'disconnected';
  var monitorTimer = null;
  var contextObserver = null;
  var hasCompletedHandshake = false;

  function loadAutoFollow() {
    try {
      var stored = window.localStorage.getItem(AUTO_FOLLOW_STORAGE_KEY);
      return stored !== 'false';
    } catch {
      return true;
    }
  }

  function getStatusMeta() {
    if (connectionStatus === 'connected') {
      return { dot: '#3fb950', label: '已连接' };
    }
    if (connectionStatus === 'searching') {
      return { dot: '#d29922', label: '正在连接' };
    }
    return { dot: '#f85149', label: '连接已断开' };
  }

  function createStatusBar() {
    var bar = document.createElement('div');
    bar.id = '__ssfb_bar';
    bar.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:999999',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px 10px',
      'background:#161b22',
      'color:#c9d1d9',
      'border:1px solid #30363d',
      'border-radius:999px',
      'box-shadow:0 10px 30px rgba(0,0,0,0.28)',
      'font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(bar);
    return bar;
  }

  function renderStatusBar() {
    if (!statusEl) {
      return;
    }

    var statusMeta = getStatusMeta();
    var reopenLabel = isBrowserOpen() ? '重开窗口' : '打开窗口';

    statusEl.innerHTML = [
      '<span style="display:flex;align-items:center;gap:6px;padding:0 2px">',
      '  <span style="width:8px;height:8px;border-radius:999px;background:' + statusMeta.dot + ';display:inline-block;flex:0 0 auto"></span>',
      '  <strong style="font-size:12px;font-weight:600">' + statusMeta.label + '</strong>',
      '</span>',
      '<button id="__ssfb_open" type="button" style="background:#21262d;border:1px solid #30363d;color:#c9d1d9;border-radius:999px;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1.2">' + reopenLabel + '</button>',
      '<button id="__ssfb_close_bar" type="button" style="background:#2d1f21;border:1px solid #5a2d31;color:#f08888;border-radius:999px;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1.2">关闭</button>',
    ].join('');

    document.getElementById('__ssfb_open').onclick = function () {
      openBrowser();
    };
    document.getElementById('__ssfb_close_bar').onclick = function () {
      closeIntegration();
    };
  }

  function setConnectionStatus(nextStatus) {
    connectionStatus = nextStatus;
    renderStatusBar();
  }

  function openBrowser() {
    if (isBrowserOpen()) {
      try {
        browserWindow.close();
      } catch {
        // Ignore close failures before reopening a fresh window.
      }
      browserWindow = null;
    }

    appOrigin = null;
    hasCompletedHandshake = false;
    setConnectionStatus('searching');
    browserWindow = window.open(
      browserBaseUrl + '/viewer/localization',
      '_blank',
      'popup=yes,resizable=yes,scrollbars=yes'
    );
    if (!browserWindow) {
      setConnectionStatus('disconnected');
      return;
    }
    if (browserWindow && typeof browserWindow.focus === 'function') {
      browserWindow.focus();
    }
  }

  function isBrowserOpen() {
    try {
      return Boolean(browserWindow) && !browserWindow.closed;
    } catch {
      return false;
    }
  }

  function closeIntegration() {
    if (isBrowserOpen()) {
      try {
        browserWindow.close();
      } catch {
        // Ignore close failures during teardown.
      }
    }

    browserWindow = null;
    appOrigin = null;
    hasCompletedHandshake = false;
    cleanup();
  }

  function sendNavigate(payload) {
    if (!isBrowserOpen()) {
      setConnectionStatus('disconnected');
      return;
    }

    try {
      browserWindow.postMessage(
        {
          protocol: PROTOCOL_NAME,
          type: 'PT_NAVIGATE_TO_STRING',
          requestId: Math.random().toString(36).slice(2),
          payload: payload,
        },
        appOrigin || allowedBrowserOrigin
      );
    } catch {
      setConnectionStatus('disconnected');
    }
  }

  function parseCurrentEntry() {
    var well = document.querySelector('.context .well');
    if (!well) {
      return null;
    }

    var text = well.textContent || '';
    var jarMatch = text.match(/文件：\s*([^\s]+\.jar)/);
    var classMatch = text.match(/类：\s*([^\s]+\.class)/);
    var constMatch = text.match(/常量号：\s*(\d+)/);

    if (!jarMatch || !classMatch || !constMatch) {
      return null;
    }

    return {
      jarName: jarMatch[1],
      className: classMatch[1],
      utf8ConstId: '#' + String(Number(constMatch[1])),
    };
  }

  function triggerNavigate() {
    if (!autoFollow) {
      return;
    }

    var entry = parseCurrentEntry();
    if (!entry) {
      return;
    }

    sendNavigate({
      jarName: entry.jarName,
      className: entry.className,
      utf8ConstId: entry.utf8ConstId,
    });
  }

  function handleDocumentClick(event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') {
        return;
      }

      var row = target.closest('.string-list .row.string, .context .well');
      if (row) {
        window.setTimeout(triggerNavigate, 100);
      }
  }

  function attachListeners() {
    document.addEventListener('click', handleDocumentClick);

    var contextEl = document.querySelector('.context');
    if (contextEl) {
      contextObserver = new MutationObserver(function () {
        window.setTimeout(triggerNavigate, 150);
      });
      contextObserver.observe(contextEl, { childList: true, subtree: true, characterData: true });
    }
  }

  function startWindowMonitor() {
    monitorTimer = window.setInterval(function () {
      if (connectionStatus !== 'disconnected' && !isBrowserOpen()) {
        setConnectionStatus('disconnected');
      }
    }, WINDOW_CHECK_INTERVAL_MS);
  }

  function handleMessage(event) {
    if (event.origin !== allowedBrowserOrigin) {
      return;
    }

    var message = event.data;
    if (!message || message.protocol !== PROTOCOL_NAME) {
      return;
    }

    if (message.type === 'FB_READY') {
      var shouldTriggerNavigate = autoFollow && !hasCompletedHandshake;
      appOrigin = message.payload && message.payload.appOrigin ? message.payload.appOrigin : allowedBrowserOrigin;
      hasCompletedHandshake = true;
      setConnectionStatus('connected');
      if (shouldTriggerNavigate) {
        window.setTimeout(triggerNavigate, 50);
      }
    }
  }

  function cleanup() {
    if (monitorTimer) {
      window.clearInterval(monitorTimer);
      monitorTimer = null;
    }

    if (contextObserver) {
      contextObserver.disconnect();
      contextObserver = null;
    }

    document.removeEventListener('click', handleDocumentClick);
    window.removeEventListener('message', handleMessage);

    if (statusEl) {
      statusEl.remove();
      statusEl = null;
    }

    window.__ssfb_injected = false;
  }

  statusEl = createStatusBar();
  renderStatusBar();
  attachListeners();
  startWindowMonitor();
  window.addEventListener('message', handleMessage);
  openBrowser();
})();
