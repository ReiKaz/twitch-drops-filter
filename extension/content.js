/* Twitch Drops Filter
 * Active ONLY on https://www.twitch.tv/drops/campaigns
 * (Twitch is a single-page app, so the script is loaded on twitch.tv and
 *  switches itself on/off depending on the current path.)
 */
(() => {
  'use strict';

  const PATH = '/drops/campaigns';
  const STORE_KEY = 'tdf_settings_v1';

  /* ------------------------------------------------------------------
   * RULES - edit these if Twitch words things differently.
   * Order matters: first match wins. The last entry is the fallback.
   * ------------------------------------------------------------------ */
  const REWARD_TYPES = [
    { id: 'badge', label: 'Badge',        test: /\bbadge\b/i },
    { id: 'emote', label: 'Emote',        test: /\bemote\b/i },
    { id: 'item',  label: 'In-Game Item', test: null } // fallback
  ];

  const REQ_TYPES = [
    { id: 'subscribe', label: 'Subscribe', test: /\b(subscri\w*|sub|subs|gift\w*)\b/i },
    { id: 'watch',     label: 'Watch',     test: /\b(watch\w*|minutes?|mins?|hours?|hrs?)\b/i },
    { id: 'other',     label: 'Other',     test: null }
  ];

  // Section scoping: only campaigns between these two headings are scanned.
  const OPEN_HEADING = /open drop campaigns/i;
  const CLOSED_HEADING = /closed drop campaigns/i;

  // Candidate campaign toggles (accordion buttons).
  const TOGGLE_SEL = 'main button[aria-expanded], main [role="button"][aria-expanded]';

  /* ------------------------------------------------------------------ */

  const defaults = () => ({
    types: Object.fromEntries(REWARD_TYPES.map(t => [t.id, true])),
    reqs: Object.fromEntries(REQ_TYPES.map(t => [t.id, true])),
    hide: true,
    hideClosed: false,
    order: 'bottom'   // 'bottom' = bottom->top (newest first), 'top' = top->bottom (ending soonest first)
  });

  let settings = defaults();
  let host = null, root = null;
  let data = [];            // [{idx, game, rewards:[{name,img,type,req,text}]}]
  let scanning = false, cancel = false, paused = false, progressText = '', scanId = 0;

  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } })();

  const ICON = 'data:image/png;base64,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';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const classify = (list, text) => (list.find(t => t.test && t.test.test(text)) || list[list.length - 1]).id;
  const labelOf = (list, id) => (list.find(t => t.id === id) || {}).label || id;

  async function loadSettings() {
    try {
      const o = await chrome.storage.local.get(STORE_KEY);
      if (o[STORE_KEY]) {
        const d = defaults(), s = o[STORE_KEY];
        settings = { types: { ...d.types, ...s.types }, reqs: { ...d.reqs, ...s.reqs }, hide: s.hide ?? d.hide, hideClosed: s.hideClosed ?? d.hideClosed, order: s.order === 'top' ? 'top' : 'bottom' };
      }
    } catch (e) { /* storage unavailable: keep defaults */ }
  }
  const saveSettings = () => { try { chrome.storage.local.set({ [STORE_KEY]: settings }); } catch (e) {} };

  /* ---------------------------- page scraping --------------------------- */

  function findHeading(rx) {
    const hs = document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main div');
    for (const h of hs) {
      if (h.children.length === 0 && rx.test(h.textContent || '')) return h;
    }
    return null;
  }

  function getToggles() {
    const open = findHeading(OPEN_HEADING);
    const closed = findHeading(CLOSED_HEADING);
    return [...document.querySelectorAll(TOGGLE_SEL)].filter(t => {
      if (t.closest('#tdf-host')) return false;
      if (!t.querySelector('img') && !t.closest('div')?.querySelector('img')) return false; // campaigns have box art
      if (open && !(open.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
      if (closed && !(closed.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING)) return false;
      return true;
    });
  }

  // Largest ancestor that contains this toggle and no other campaign toggle.
  function cardOf(toggle, toggles) {
    let el = toggle;
    while (el.parentElement && el.parentElement.tagName !== 'MAIN' && el.parentElement !== document.body) {
      const p = el.parentElement;
      if (toggles.filter(o => p.contains(o)).length > 1) break;
      el = p;
    }
    return el;
  }

  function gameName(toggle) {
    const lines = (toggle.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
    return lines[0] || toggle.getAttribute('aria-label') || 'Unknown game';
  }

  const isOpen = t => t.getAttribute('aria-expanded') === 'true';

  // Short, readable requirement line for the panel (classification still uses the full text).
  const REQ_LINE = /\b(?:watch|subscribe|gift\w*)\b(?:(?!\b(?:watch|subscribe)\b)[^.\n]){0,80}?\b(?:\d+\s*(?:minutes?|mins?|hours?|hrs?)|subs?\b|subscriptions?)[^.\n]{0,60}/i;
  function conciseReq(lines, name) {
    const rest = lines.filter(l => l !== name && !/^(rewards?|drops?)$/i.test(l));
    const joined = rest.join(' ').replace(/\s+/g, ' ').replace(/^(rewards?|drops?)\s+/i, '').trim();
    if (joined.length <= 60) return joined;
    const m = joined.match(REQ_LINE);
    if (m) return m[0].trim();
    const typeLine = rest.find(l => /^(in-game item|badge|emote)$/i.test(l));
    return typeLine || (joined.slice(0, 80).trim() + '\u2026');
  }

  function extractRewards(card, toggle) {
    const own = new Set(toggle.querySelectorAll('img'));
    const imgs = [...card.querySelectorAll('img')].filter(i => !own.has(i));
    const imgSet = new Set(imgs);
    const out = [], seen = new Set();
    const cardText = card.innerText || '';
    const MAX_TILE_TEXT = 140;   // a reward box never holds more text than this

    const hit = t => REQ_TYPES.find(r => r.test && r.test.test(t));
    const reqId = t => {
      const h = hit(t);
      if (h) return h.id;
      // the tile says nothing: fall back to the campaign's own description
      if (/\bsubscri\w*\b/i.test(cardText)) return 'subscribe';
      const w = REQ_TYPES.find(r => r.id === 'watch');
      return w && w.test.test(cardText) ? 'watch' : 'other';
    };
    const isLabel = l => REWARD_TYPES.some(t => t.label.toLowerCase() === l.toLowerCase());

    for (const img of imgs) {
      // climb until the parent would contain another reward image
      let tile = img;
      while (tile.parentElement && tile.parentElement !== card) {
        const p = tile.parentElement;
        if ([...p.querySelectorAll('img')].filter(i => imgSet.has(i)).length > 1) break;
        if ((p.innerText || '').length > MAX_TILE_TEXT) break;
        tile = p;
      }
      const lines = (tile.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const name = (img.alt || lines[0] || '').trim();
      if (!name && !lines.length) continue;
      const text = [img.alt, ...lines].join(' ');
      const req = lines.filter(l => l !== name && !isLabel(l)).join(' ');
      const key = name + '|' + req;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: name || lines[0],
        img: img.currentSrc || img.src,
        type: classify(REWARD_TYPES, text),
        req: reqId(req),
        reqText: conciseReq(lines, name),
        text
      });
    }
    return out;
  }

  async function waitForRewards(card, toggle, before) {
    const own = new Set(toggle.querySelectorAll('img'));
    const count = () => [...card.querySelectorAll('img')].filter(i => !own.has(i)).length;
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (count() > before) break;
      await sleep(100);
    }
    await sleep(300); // let lazy content settle
  }

  async function scanAll() {
    if (scanning) return;
    scanning = true; cancel = false; paused = false;
    const myId = ++scanId;   // lets an abandoned scan notice it is out of date
    updatePauseBtn();
    data = [];
    render();

    const initial = getToggles();
    const total = initial.length;
    if (!total) { setStatus('No campaigns found. Shift+click the Pause button, then send me the console output (F12).'); scanning = false; updatePauseBtn(); render(); return; }

    const order = [...Array(total).keys()];
    if (settings.order === 'bottom') order.reverse();
    for (const i of order) {
      if (cancel || myId !== scanId) break;
      while (paused && !cancel && myId === scanId) await sleep(150);   // Pause / Resume
      if (cancel || myId !== scanId) break;
      const toggles = getToggles();
      const toggle = toggles[i];
      if (!toggle) break;
      const card = cardOf(toggle, toggles);
      const game = gameName(toggle);
      progressText = `${order.indexOf(i) + 1}/${total}: ${game}`;
      setStatus(`Scanning ${progressText}`);

      const wasOpen = isOpen(toggle);
      const own = new Set(toggle.querySelectorAll('img'));
      const before = [...card.querySelectorAll('img')].filter(x => !own.has(x)).length;

      if (!wasOpen) { toggle.click(); await waitForRewards(card, toggle, before); }
      else { await sleep(150); }

      if (myId !== scanId) return;
      data.push({ idx: i, game, rewards: extractRewards(card, toggle) });

      if (!wasOpen) {
        const again = getToggles()[i];
        if (again && isOpen(again)) again.click();
        await sleep(150);
      }
      if (myId !== scanId) return;
      render();
      applyHiding();
    }
    if (myId !== scanId) return;   // page was left / scan reset meanwhile
    setStatus(cancel ? 'Scan cancelled.' : `Done. ${data.length} campaigns scanned.`);
    scanning = false; paused = false;
    updatePauseBtn();
    render();
    applyHiding();
  }

  /* ----------------------------- filtering ------------------------------ */

  const rewardMatches = r => settings.types[r.type] && settings.reqs[r.req];
  const campaignMatches = c => c.rewards.some(rewardMatches);

  function applyHiding() {
    const toggles = getToggles();
    toggles.forEach((t, i) => {
      const card = cardOf(t, toggles);
      const rec = data.find(d => d.idx === i);
      card.style.display = (settings.hide && rec && !campaignMatches(rec)) ? 'none' : '';
    });
  }
  function clearHiding() {
    const toggles = getToggles();
    toggles.forEach(t => { cardOf(t, toggles).style.display = ''; });
  }

  /* ---- hide the "Closed Drop Campaigns" section ---- */
  const closedHidden = new Set();

  function closedNodes() {
    const h = findHeading(CLOSED_HEADING);
    if (!h) return [];
    const open = findHeading(OPEN_HEADING);
    const main = document.querySelector('main');
    let el = h;
    if (open) {
      // climb as long as the wrapper does not also hold the open section
      while (el.parentElement && el.parentElement !== main && !el.parentElement.contains(open)) el = el.parentElement;
    }
    const nodes = [el];
    // everything that follows it, level by level, up to <main>
    let a = el;
    while (a && a !== main && a !== document.body) {
      for (let n = a.nextElementSibling; n; n = n.nextElementSibling) nodes.push(n);
      a = a.parentElement;
    }
    return nodes;
  }

  function restoreClosed() {
    closedHidden.forEach(n => { n.style.display = ''; });
    closedHidden.clear();
  }

  function applyClosed() {
    if (!settings.hideClosed) { restoreClosed(); return; }
    const nodes = new Set(closedNodes());
    closedHidden.forEach(n => { if (!nodes.has(n)) { n.style.display = ''; closedHidden.delete(n); } });
    nodes.forEach(n => { if (!n.closest('#tdf-host') && n.id !== 'tdf-host') { n.style.display = 'none'; closedHidden.add(n); } });
  }

  function openCampaign(idx) {
    const toggles = getToggles();
    const t = toggles[idx];
    if (!t) return;
    const card = cardOf(t, toggles);
    card.style.display = '';
    if (!isOpen(t)) t.click();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function debugDump() {
    const toggles = getToggles();
    const rows = toggles.map((t, i) => {
      const card = cardOf(t, toggles);
      return { i, game: gameName(t), expanded: isOpen(t), imgs: card.querySelectorAll('img').length, cardTag: card.tagName, cardClass: card.className };
    });
    console.group('[Twitch Drops Filter] debug');
    console.log('toggles found:', toggles.length);
    console.table(rows);
    console.log('scan data:', data);
    console.groupEnd();
    setStatus('Debug written to the browser console (F12).');
  }

  /* -------------------------------- UI ---------------------------------- */

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, "Segoe UI", system-ui, sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; padding: 10px 16px;
      background: #9147ff; color: #fff; border: 0; border-radius: 6px; font-weight: 600; font-size: 13px;
      cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.45); }
    .fab:hover { background: #772ce8; }
    .fab:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid #bf94ff; outline-offset: 2px; }
    .panel { position: fixed; right: 20px; bottom: 70px; z-index: 2147483000; width: 444px; max-width: calc(100vw - 40px);
      max-height: 77vh; display: none; flex-direction: column; background: #18181b; color: #efeff1;
      border: 1px solid #3a3a3d; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.6); font-size: 13px; }
    .panel.open { display: flex; }
    header { padding: 12px 14px 8px; border-bottom: 1px solid #2a2a2d; }
    header h1 { margin: 0 0 8px; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
    .ver { display: inline-flex; align-items: center; gap: 4px; line-height: 1; font-size: 11px; font-weight: 600; color: #6a6a74; user-select: none; cursor: default; }
    .ver img { width: 14px; height: 14px; display: block; flex: none; }
    .group { margin: 6px 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .group .lbl { width: 78px; color: #adadb8; font-size: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
      border: 1px solid #3a3a3d; background: #1f1f23; cursor: pointer; user-select: none; }
    .chip input { accent-color: #9147ff; margin: 0; }
    #order { display: flex; gap: 6px; flex-wrap: nowrap; }
    .chip.plain, .chip.plain.on { border: 0; background: none; padding: 4px 6px 4px 0; }
    .chip.on { border-color: #9147ff; background: #2a1f45; }
    .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    button.btn { padding: 6px 12px; border-radius: 4px; border: 1px solid #3a3a3d; background: #26262c; color: #efeff1;
      cursor: pointer; font-size: 12px; font-weight: 600; }
    button.btn:hover { background: #33333a; }
    button.primary { background: #9147ff; border-color: #9147ff; }
    button.primary:hover { background: #772ce8; }
    .status { color: #adadb8; font-size: 12px; padding: 6px 14px; min-height: 26px; }
    .list { overflow-y: auto; padding: 0 14px 12px; }
    .camp { margin-top: 10px; }
    .camp h2 { margin: 0 0 4px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .camp h2:hover { color: #bf94ff; }
    .rw { display: grid; grid-template-columns: 32px 1fr auto; gap: 8px; align-items: center; padding: 4px 0; }
    .rw img { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; background: #0e0e10; }
    .rw .n { overflow: hidden; text-overflow: ellipsis; }
    .rw .r { color: #adadb8; font-size: 11px; }
    .tag { font-size: 11px; padding: 2px 7px; border-radius: 4px; background: #2a2a30; white-space: nowrap; }
    .tag.badge { background: #3b2a12; } .tag.emote { background: #12313b; } .tag.item { background: #1f3b12; }
    .empty { color: #adadb8; padding: 14px 0; }
  `;

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'tdf-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${CSS}</style>
      <button class="fab" id="fab" aria-expanded="false">Filter drops</button>
      <section class="panel" id="panel" aria-label="Drops filter">
        <header>
          <h1><span>Drops filter</span><span class="ver" title="Extension version"><img src="${ICON}" alt="">${VERSION}</span></h1>
          <div class="group"><span class="lbl">Reward</span><span id="types"></span></div>
          <div class="group"><span class="lbl">Requirement</span><span id="reqs"></span></div>
          <div class="group" style="flex-wrap:nowrap">
            <span class="lbl">Hide on page</span>
            <label class="chip plain" id="hideChip" title="Hide games with no matching reward on the page"><input type="checkbox" id="hide"> Non-matching games</label>
            <label class="chip plain" id="hideClosedChip" title="Hide the Closed Drop Campaigns section"><input type="checkbox" id="hideClosed"> Closed campaigns</label>
          </div>
          <div class="group"><span class="lbl">Scan order</span><span id="order"></span></div>
          <div class="row">
            <button class="btn primary" id="scan">Scan all campaigns</button>
            <button class="btn" id="stop">Stop</button>
            <button class="btn" id="pause" title="Pause / resume the scan">Pause</button>
          </div>
        </header>
        <div class="status" id="status" role="status"></div>
        <div class="list" id="list"></div>
      </section>`;
    document.documentElement.appendChild(host);

    const $ = id => root.getElementById(id);
    $('fab').onclick = () => {
      const p = $('panel'); p.classList.toggle('open');
      $('fab').setAttribute('aria-expanded', p.classList.contains('open'));
    };
    $('scan').onclick = scanAll;
    $('stop').onclick = () => { cancel = true; };
    $('pause').onclick = e => {
      if (e.shiftKey) { debugDump(); return; }   // hidden helper for troubleshooting
      if (!scanning) return;
      paused = !paused;
      updatePauseBtn();
      if (paused) setStatus(`Paused ${progressText}. Press Resume to continue.`);
    };
    updatePauseBtn();
    $('hide').onchange = e => { settings.hide = e.target.checked; e.target.parentElement.classList.toggle('on', e.target.checked); saveSettings(); settings.hide ? applyHiding() : clearHiding(); };

    buildChips();
    $('hide').checked = settings.hide;
    $('hide').parentElement.classList.toggle('on', settings.hide);
    $('hideClosed').checked = settings.hideClosed;
    $('hideClosed').parentElement.classList.toggle('on', settings.hideClosed);
    $('hideClosed').onchange = e => {
      settings.hideClosed = e.target.checked;
      e.target.parentElement.classList.toggle('on', e.target.checked);
      saveSettings(); applyClosed();
    };
    setStatus('Press "Scan all campaigns" once. It opens each game for you and reads the rewards.');
    render();
  }

  function unmount() {
    if (!host) return;
    clearHiding(); restoreClosed();
    // leaving the page: drop any running or paused scan so the next visit starts fresh
    scanId++; scanning = false; paused = false; cancel = false; progressText = ''; data = [];
    host.remove(); host = null; root = null;
  }

  function buildChips() {
    const mk = (list, key, el) => {
      el.innerHTML = '';
      list.forEach(t => {
        const lab = document.createElement('label');
        lab.className = 'chip' + (settings[key][t.id] ? ' on' : '');
        lab.innerHTML = `<input type="checkbox" ${settings[key][t.id] ? 'checked' : ''}> ${esc(t.label)}`;
        lab.querySelector('input').onchange = e => {
          settings[key][t.id] = e.target.checked;
          lab.classList.toggle('on', e.target.checked);
          saveSettings(); render(); applyHiding();
        };
        el.appendChild(lab);
      });
    };
    mk(REWARD_TYPES, 'types', root.getElementById('types'));
    mk(REQ_TYPES, 'reqs', root.getElementById('reqs'));

    const ord = root.getElementById('order');
    ord.innerHTML = '';
    [['bottom', '\u2191 Newest first', 'Scan from the bottom of the page upward'], ['top', '\u2193 Ending soonest', 'Scan from the top of the page downward']].forEach(([v, l, tip]) => {
      const lab = document.createElement('label');
      lab.title = tip;
      lab.className = 'chip' + (settings.order === v ? ' on' : '');
      lab.innerHTML = `<input type="radio" name="tdf-order" ${settings.order === v ? 'checked' : ''}> ${esc(l)}`;
      lab.querySelector('input').onchange = () => { settings.order = v; saveSettings(); buildChips(); render(); };
      ord.appendChild(lab);
    });
  }

  function updatePauseBtn() {
    const b = root && root.getElementById('pause');
    if (!b) return;
    b.textContent = paused ? 'Resume' : 'Pause';
    b.style.opacity = scanning ? '' : '.5';
  }

  function setStatus(msg) { const s = root && root.getElementById('status'); if (s) s.textContent = msg; }

  function render() {
    if (!root) return;
    const list = root.getElementById('list');
    const shown = data.filter(campaignMatches).sort((x, y) => settings.order === 'bottom' ? y.idx - x.idx : x.idx - y.idx);
    if (!data.length) { list.innerHTML = `<div class="empty">${scanning ? 'Working...' : 'Nothing scanned yet.'}</div>`; return; }
    if (!shown.length) { list.innerHTML = '<div class="empty">No campaign matches the current filters.</div>'; return; }

    list.innerHTML = shown.map(c => {
      const rows = c.rewards.filter(rewardMatches).map(r => `
        <div class="rw">
          <img src="${esc(r.img)}" alt="" loading="lazy">
          <div><div class="n">${esc(r.name)}</div><div class="r">${esc(r.reqText || '')}</div></div>
          <div><span class="tag ${esc(r.type)}">${esc(labelOf(REWARD_TYPES, r.type))}</span>
               <span class="tag">${esc(labelOf(REQ_TYPES, r.req))}</span></div>
        </div>`).join('');
      return `<div class="camp"><h2 data-idx="${c.idx}" title="Open on page">${esc(c.game)} (${c.rewards.filter(rewardMatches).length})</h2>${rows}</div>`;
    }).join('');

    list.querySelectorAll('h2').forEach(h => { h.onclick = () => openCampaign(+h.dataset.idx); });
  }

  /* ---------------------- SPA path watcher ------------------------ */

  async function tick() {
    if (location.pathname.replace(/\/+$/, '') === PATH) {
      if (!host) { await loadSettings(); mount(); }
      else applyClosed();
    } else if (host) {
      unmount(); data = [];
    }
  }
  tick();
  setInterval(tick, 800);
})();
