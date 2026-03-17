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
  var HANDSHAKE_TIMEOUT_MS = 800;
  var VIEWER_WINDOW_NAME = '__ssfb_viewer';
  var VIEWER_WINDOW_FEATURES = [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'width=1440',
    'height=960',
    'left=80',
    'top=80',
  ].join(',');

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
  var PAGE_SIZE = '800';
  var NAVIGATION_TIMEOUT_MS = 12000;

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
        if (typeof browserWindow.focus === 'function') {
          browserWindow.focus();
        }
      } catch {
        // Ignore focus failures for cross-origin window proxies.
      }
      sendPing();
      return;
    }

    appOrigin = null;
    hasCompletedHandshake = false;
    setConnectionStatus('searching');

    var claimedWindow = null;
    try {
      claimedWindow = window.open('', VIEWER_WINDOW_NAME, VIEWER_WINDOW_FEATURES);
    } catch {
      claimedWindow = null;
    }

    if (claimedWindow) {
      browserWindow = claimedWindow;
      try {
        if (typeof browserWindow.focus === 'function') {
          browserWindow.focus();
        }
      } catch {
        // Ignore focus failures for cross-origin window proxies.
      }

      sendPing();

      window.setTimeout(function () {
        if (!hasCompletedHandshake) {
          openFreshBrowserWindow();
        }
      }, HANDSHAKE_TIMEOUT_MS);
      return;
    }

    openFreshBrowserWindow();
  }

  function openFreshBrowserWindow() {
    browserWindow = window.open(
      browserBaseUrl + '/viewer/localization',
      VIEWER_WINDOW_NAME,
      VIEWER_WINDOW_FEATURES
    );
    if (!browserWindow) {
      setConnectionStatus('disconnected');
      return;
    }
    try {
      if (typeof browserWindow.focus === 'function') {
        browserWindow.focus();
      }
    } catch {
      // Ignore focus failures for cross-origin window proxies.
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

  function sendPing() {
    if (!isBrowserOpen()) {
      return;
    }

    try {
      browserWindow.postMessage(
        {
          protocol: PROTOCOL_NAME,
          type: 'PT_PING',
          requestId: Math.random().toString(36).slice(2),
        },
        appOrigin || allowedBrowserOrigin
      );
    } catch {
      setConnectionStatus('disconnected');
    }
  }

  function sendToViewer(type, requestId, payload) {
    if (!isBrowserOpen()) {
      return;
    }
    try {
      browserWindow.postMessage(
        {
          protocol: PROTOCOL_NAME,
          type: type,
          requestId: requestId,
          payload: payload,
        },
        appOrigin || allowedBrowserOrigin
      );
    } catch {
      setConnectionStatus('disconnected');
    }
  }

  function sendAck(requestId, message) {
    sendToViewer('PT_ACK', requestId, {
      accepted: true,
      message: message,
    });
  }

  function sendError(requestId, code, message, detail) {
    sendToViewer('PT_ERROR', requestId, {
      code: code,
      message: message,
      detail: detail,
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function waitFor(predicate, timeoutMs, intervalMs) {
    var started = Date.now();
    var interval = intervalMs || 100;
    return new Promise(function (resolve, reject) {
      (function poll() {
        try {
          var result = predicate();
          if (result) {
            resolve(result);
            return;
          }
        } catch {
          // Ignore transient DOM errors during route updates.
        }

        if (Date.now() - started >= timeoutMs) {
          reject(new Error('TIMEOUT'));
          return;
        }
        window.setTimeout(poll, interval);
      })();
    });
  }

  function setControlValue(el, value) {
    if (!el) return;
    var proto = Object.getPrototypeOf(el);
    var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function getSearchModeSelect() {
    return document.querySelector('select.custom-select');
  }

  function getSearchInput() {
    return document.querySelector('input[type="search"]');
  }

  function getPageSizeSelect() {
    return Array.prototype.find.call(document.querySelectorAll('select.custom-select'), function (el) {
      return Array.prototype.some.call(el.options || [], function (opt) {
        return opt.value === PAGE_SIZE;
      });
    }) || null;
  }

  function getAllStageLink() {
    return Array.prototype.find.call(document.querySelectorAll('a.dropdown-item'), function (el) {
      return (el.textContent || '').trim() === '全部';
    }) || null;
  }

  function getStringRows() {
    return Array.prototype.slice.call(document.querySelectorAll('.string-list .row.string'));
  }

  function parseRow(row) {
    var title = row && row.getAttribute ? (row.getAttribute('title') || '') : '';
    var parts = title.split(/\n\n/);
    return {
      row: row,
      title: title,
      locatorAndValue: parts[0] || '',
      original: parts[1] || '',
      translation: parts[2] || '',
    };
  }

  function normalizeLocatorForSearch(locator) {
    return String(locator || '').replace(/\.class$/, '');
  }

  function currentPageMatchesLocator(locator) {
    var currentLocator = normalizeLocatorForSearch(new URL(window.location.href).searchParams.get('key'));
    return currentLocator === normalizeLocatorForSearch(locator);
  }

  function hasRowsForLocator(locator) {
    var expected = String(locator || '') + '#';
    return getStringRows().map(parseRow).some(function (entry) {
      return entry.locatorAndValue.indexOf(expected) === 0;
    });
  }

  function isStringsPage() {
    return document.body && document.body.getAttribute('data-page') === 'strings';
  }

  async function ensurePageSize() {
    var select = getPageSizeSelect();
    if (!select) {
      throw new Error('PAGE_SIZE_SELECT_NOT_FOUND');
    }
    if (String(select.value) === PAGE_SIZE && new URL(window.location.href).searchParams.get('pageSize') === PAGE_SIZE) {
      return;
    }

    setControlValue(select, PAGE_SIZE);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(function () {
      var url = new URL(window.location.href);
      return String(select.value) === PAGE_SIZE && url.searchParams.get('pageSize') === PAGE_SIZE;
    }, NAVIGATION_TIMEOUT_MS);
  }

  async function ensureAllStages() {
    var url = new URL(window.location.href);
    if (!url.searchParams.has('stage')) {
      return;
    }

    var link = getAllStageLink();
    if (!link) {
      throw new Error('ALL_STAGE_LINK_NOT_FOUND');
    }
    link.click();

    await waitFor(function () {
      return !new URL(window.location.href).searchParams.has('stage');
    }, NAVIGATION_TIMEOUT_MS);
  }

  async function searchByLocator(locator) {
    if (currentPageMatchesLocator(locator)) {
      return;
    }

    var select = getSearchModeSelect();
    var input = getSearchInput();
    if (!select || !input) {
      throw new Error('SEARCH_CONTROL_NOT_FOUND');
    }

    var searchVm = input.__vue__ && input.__vue__.$parent;
    if (searchVm && typeof searchVm.search === 'function') {
      searchVm.searchKey = 'key';
      searchVm.keyword = locator;
      searchVm.search();
    } else {
      setControlValue(select, 'key');
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));

      if (typeof input.click === 'function') {
        input.click();
      }
      input.focus();
      if (typeof input.select === 'function') {
        input.select();
      }
      setControlValue(input, locator);
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: locator,
      }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('search', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      input.blur();
    }

    await waitFor(function () {
      return currentPageMatchesLocator(locator);
    }, NAVIGATION_TIMEOUT_MS);

    await waitFor(function () {
      return hasRowsForLocator(locator);
    }, NAVIGATION_TIMEOUT_MS);

    await wait(100);
  }

  function findMatchingRow(payload) {
    var rows = getStringRows().map(parseRow);
    var exactOriginal = null;
    var exactTranslation = null;
    var exactEither = null;

    for (var i = 0; i < rows.length; i++) {
      var entry = rows[i];
      if (entry.locatorAndValue.indexOf(payload.locator + '#') !== 0) continue;

      if (entry.original === payload.value) {
        if (!exactOriginal) exactOriginal = entry;
        exactEither = exactEither || entry;
      }
      if (entry.translation === payload.value) {
        if (!exactTranslation) exactTranslation = entry;
        exactEither = exactEither || entry;
      }
    }

    if (payload.dataset === 'original' && exactOriginal) return exactOriginal;
    if (payload.dataset === 'localization' && exactTranslation) return exactTranslation;
    return exactEither;
  }

  async function navigateToParatranzString(requestId, payload) {
    if (!isStringsPage()) {
      throw new Error('NOT_ON_STRINGS_PAGE');
    }
    if (!payload || !payload.locator || typeof payload.value !== 'string') {
      throw new Error('BAD_NAVIGATE_PAYLOAD');
    }

    var match = findMatchingRow(payload);
    if (!match || !match.row) {
      if (currentPageMatchesLocator(payload.locator)) {
        await waitFor(function () {
          return getStringRows().length > 0;
        }, NAVIGATION_TIMEOUT_MS);
        match = findMatchingRow(payload);
      }
    }

    if ((!match || !match.row) && !currentPageMatchesLocator(payload.locator)) {
      await ensurePageSize();
      await ensureAllStages();
      await searchByLocator(payload.locator);
      await waitFor(function () {
        return hasRowsForLocator(payload.locator);
      }, NAVIGATION_TIMEOUT_MS);
      match = findMatchingRow(payload);
    }

    if (!match || !match.row) {
      throw new Error('STRING_ROW_NOT_FOUND');
    }

    match.row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await waitFor(function () {
      var active = document.querySelector('.string-list .row.string.active');
      if (!active) return false;
      var parsed = parseRow(active);
      return parsed.title === match.title;
    }, NAVIGATION_TIMEOUT_MS);

    sendAck(requestId, '已定位到 ParaTranz 词条');
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
      return;
    }

    if (message.type === 'FB_NAVIGATE_TO_PARATRANZ_STRING') {
      appOrigin = event.origin;
      navigateToParatranzString(message.requestId, message.payload).catch(function (err) {
        var reason = err && err.message ? err.message : String(err);
        sendError(
          message.requestId,
          reason,
          '无法在 ParaTranz 页面定位到目标词条',
          {
            locator: message.payload && message.payload.locator,
            value: message.payload && message.payload.value,
            dataset: message.payload && message.payload.dataset,
          }
        );
      });
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
