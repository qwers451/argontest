(() => {
  'use strict';

  const CFG = window.COMPARE;
  const MODELS = CFG.models;
  const KEYS = Object.keys(MODELS);
  const TARGET = CFG.guess || KEYS[0];
  const OTHER = KEYS.find((k) => k !== TARGET);
  const LETTERS = ['A', 'B'];
  const ROUNDS = CFG.rounds.filter((r) => KEYS.some((k) => r.sites[k]));
  const FLAT = ROUNDS.flatMap((r, ri) => KEYS.map((k) => ({ ri, k })));
  const READY = FLAT.filter(({ ri, k }) => ROUNDS[ri].sites[k]).length;

  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const stage = $('#stage');
  const barLeft = $('#barLeft');
  const barCenter = $('#barCenter');
  const barRight = $('#barRight');
  const intro = $('#intro');
  const results = $('#results');
  const vote = $('#vote');
  const toastEl = $('#toast');

  document.documentElement.style.setProperty('--claude', MODELS.claude?.color || '');
  document.documentElement.style.setProperty('--argon', MODELS.argon?.color || '');

  /* ---------------- хранилище ---------------- */

  // Ключ зависит от набора сайтов: добавили новую версию — прогресс теста сбрасывается.
  const SIG = hash(JSON.stringify(ROUNDS.map((r) => [r.id, KEYS.map((k) => r.sites[k])])));
  const TEST_KEY = `cvs.test.${SIG}`;
  const UI_KEY = 'cvs.ui';

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch { /* приватный режим */ }
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  /* ---------------- состояние ---------------- */

  let mode = 'intro';
  let test = load(TEST_KEY);
  if (!isValidTest(test)) test = null;
  const ui = Object.assign({ barHidden: false, last: null }, load(UI_KEY));
  let view = siteFromId(ui.last) || FLAT.find(({ ri, k }) => ROUNDS[ri].sites[k]) || FLAT[0];

  function isValidTest(t) {
    return t && Array.isArray(t.order) && t.order.length === ROUNDS.length &&
      t.order.every((o) => o.length === 2 && o.includes(TARGET) && o.includes(OTHER)) &&
      t.round >= 0 && t.round < ROUNDS.length;
  }

  function newTest() {
    return {
      order: ROUNDS.map(() => (Math.random() < 0.5 ? [TARGET, OTHER] : [OTHER, TARGET])),
      round: 0,
      slot: 0,
      viewed: ROUNDS.map(() => [false, false]),
      answers: ROUNDS.map(() => null),
      done: false,
    };
  }

  const saveTest = () => test && save(TEST_KEY, test);
  const saveUi = () => save(UI_KEY, ui);

  function siteId({ ri, k }) { return `${ROUNDS[ri].id}-${k}`; }
  function siteFromId(id) {
    if (!id) return null;
    return FLAT.find((s) => siteId(s) === id) || null;
  }

  /* ---------------- иконки ---------------- */

  const svg = (d) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
  const I = {
    arrow: svg('<path d="M3 8h10M9 4l4 4-4 4"/>'),
    reload: svg('<path d="M13 3.5v3h-3"/><path d="M12.6 6.5A5 5 0 1 0 13 9"/>'),
    ext: svg('<path d="M9 3h4v4M13 3L7.5 8.5"/><path d="M11 9.5V13H3V5h3.5"/>'),
    hide: svg('<path d="M4 10l4-4 4 4"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    cross: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
    close: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
    retest: svg('<path d="M3 3.5v3h3"/><path d="M3.4 6.5A5 5 0 1 1 3 9"/>'),
    chevron: svg('<path d="M4 6l4 4 4-4"/>'),
    clock: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>'),
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------------- сцена с сайтом ---------------- */

  let frame = null;
  let mountedKey = null;

  // Живёт только один iframe: старый удаляется целиком, чтобы скрытый сайт
  // не тратил GPU и не играл звук, пока смотрят соседний.
  function mount(key, src, label, emptyText, force) {
    if (!force && key === mountedKey) return;
    unmount();
    mountedKey = key;
    stage.classList.remove('is-loaded', 'is-empty');

    if (!src) {
      stage.classList.add('is-empty');
      stage.insertAdjacentHTML('beforeend', `
        <div class="placeholder"><div class="ph-card">
          <div class="ph-icon">${I.clock}</div>
          <h3>Сайт ещё не загружен</h3>
          <p>${esc(emptyText)}</p>
        </div></div>`);
      return;
    }

    frame = document.createElement('iframe');
    frame.src = src;
    frame.title = label;
    frame.allow = 'autoplay; fullscreen; accelerometer; gyroscope; clipboard-write';
    frame.setAttribute('allowfullscreen', '');
    const f = frame;
    f.addEventListener('load', () => {
      if (f !== frame) return;
      stage.classList.add('is-loaded');
      // Тот же origin: ловим горячие клавиши, даже когда фокус внутри сайта.
      try { f.contentWindow.addEventListener('keydown', onKey); } catch { /* file:// */ }
    });
    stage.appendChild(f);
  }

  function unmount() {
    if (frame) { frame.remove(); frame = null; }
    stage.querySelectorAll('.placeholder').forEach((el) => el.remove());
    stage.classList.remove('is-loaded', 'is-empty');
    mountedKey = null;
  }

  /* ---------------- общие куски панели ---------------- */

  function brand(text) {
    return `<button class="brand" type="button" data-act="home" title="На главную"><span class="brand-mark"></span><span class="brand-text">${esc(text)}</span></button>`;
  }

  function tools(src, extra = '') {
    return `<div class="tools">
      <button class="icon-btn tool-reload" type="button" data-act="reload" title="Перезагрузить сайт" aria-label="Перезагрузить сайт">${I.reload}</button>
      <a class="icon-btn ${src ? '' : 'is-disabled'}" href="${src ? esc(src) : '#'}" target="_blank" rel="noopener" title="Открыть в новой вкладке" aria-label="Открыть в новой вкладке">${I.ext}</a>
      <button class="icon-btn" type="button" data-act="hide" title="Скрыть панель (H)" aria-label="Скрыть панель">${I.hide}</button>
      ${extra}
    </div>`;
  }

  function setBarHidden(hidden, silent) {
    ui.barHidden = hidden;
    saveUi();
    app.classList.toggle('bar-hidden', hidden);
    if (hidden && !silent) toast('Панель скрыта — нажмите H или язычок сверху, чтобы вернуть');
  }

  /* ---------------- режимы ---------------- */

  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    intro.hidden = m !== 'intro';
    results.hidden = m !== 'results';
    if (m !== 'test' && vote.open) vote.close();
    if (m === 'intro' || m === 'results') unmount();
    if (m !== 'free' && location.hash) history.replaceState(null, '', location.pathname + location.search);
    render();
  }

  function render() {
    if (mode === 'intro') renderIntro();
    else if (mode === 'test') renderTest();
    else if (mode === 'results') renderResults();
    else renderFree();
  }

  /* ---------- вступление ---------- */

  function renderIntro() {
    $('#introEyebrow').textContent = `Слепой тест · ${ROUNDS.length} ${plural(ROUNDS.length, 'раунд', 'раунда', 'раундов')}`;
    $('#introModelA').textContent = MODELS[TARGET].name;
    $('#introModelB').textContent = MODELS[OTHER].name;

    const inProgress = test && !test.done && test.viewed.flat().some(Boolean);
    $('#introCta').innerHTML = inProgress
      ? `<button class="btn btn-primary btn-lg" type="button" data-act="resume">Продолжить · раунд ${test.round + 1}/${ROUNDS.length}${I.arrow}</button>
         <button class="btn btn-ghost btn-lg" type="button" data-act="start">Начать заново</button>`
      : `<button class="btn btn-primary btn-lg" type="button" data-act="start">Начать тест${I.arrow}</button>
         <button class="link-btn" type="button" data-act="free">Пропустить и смотреть все версии</button>`;

    const total = FLAT.length;
    $('#introNote').textContent = READY < total
      ? `Загружено ${READY} из ${total} версий — пока вместо недостающих показывается заглушка.`
      : '';
  }

  /* ---------- слепой тест ---------- */

  function renderTest() {
    const r = test.round;
    const R = ROUNDS[r];
    const order = test.order[r];
    const slot = test.slot;
    const revealed = test.answers[r] != null;

    test.viewed[r][slot] = true;
    saveTest();

    const allSeen = test.viewed[r].every(Boolean);
    const isLast = r === ROUNDS.length - 1;
    const src = R.sites[order[slot]];

    barLeft.innerHTML = `${brand('Слепой тест')}
      <div class="crumb"><span class="crumb-k">Раунд</span><b>${r + 1}</b><span class="crumb-of">/${ROUNDS.length}</span>${R.title ? `<span class="crumb-t">${esc(R.title)}</span>` : ''}</div>`;

    barCenter.innerHTML = `<div class="seg" role="tablist" aria-label="Сайты раунда">${order.map((k, i) => {
      const m = MODELS[k];
      const on = i === slot;
      const label = revealed ? m.short : `Сайт ${LETTERS[i]}`;
      const modelAttr = revealed ? ` data-model="${k}" style="--c:${m.color}"` : '';
      const fresh = !revealed && !test.viewed[r][i] ? '<span class="seg-new" title="Ещё не смотрели"></span>' : '';
      return `<button class="seg-btn ${on ? 'is-on' : ''}" type="button" role="tab" aria-selected="${on}" data-act="slot" data-slot="${i}"${modelAttr} title="Сайт ${LETTERS[i]} (${i + 1})">
        <span class="seg-letter">${LETTERS[i]}</span><span class="seg-label">${esc(label)}</span>${fresh}</button>`;
    }).join('')}</div>`;

    let primary;
    if (revealed) {
      primary = `<button class="btn btn-primary" type="button" data-act="next">${isLast ? 'Итоги' : '<span class="btn-long">Следующий раунд</span><span class="btn-short">Дальше</span>'}${I.arrow}</button>`;
    } else if (!allSeen) {
      const next = test.viewed[r].indexOf(false);
      primary = `<button class="btn btn-primary" type="button" data-act="slot" data-slot="${next}"><span class="btn-long">Смотреть сайт ${LETTERS[next]}</span><span class="btn-short">Сайт ${LETTERS[next]}</span>${I.arrow}</button>`;
    } else {
      primary = `<button class="btn btn-primary is-ready" type="button" data-act="vote"><span class="btn-long">Выбрать, где ${esc(MODELS[TARGET].short)}</span><span class="btn-short">Выбрать</span>${I.arrow}</button>`;
    }
    barRight.innerHTML = primary + tools(src);

    const emptyText = revealed
      ? `Версия ${MODELS[order[slot]].name} появится позже.`
      : 'Эта версия появится позже.';
    mount(`test:${r}:${slot}`, src, `Сайт ${LETTERS[slot]}`, emptyText);
  }

  function openVote() {
    renderVote();
    if (!vote.open) vote.showModal();
  }

  function renderVote() {
    const r = test.round;
    const order = test.order[r];
    const answer = test.answers[r];
    const target = MODELS[TARGET];
    const other = MODELS[OTHER];

    if (answer == null) {
      vote.innerHTML = `<div class="vote-in">
        <button class="icon-btn vote-close" type="button" data-act="close" aria-label="Закрыть">${I.close}</button>
        <p class="eyebrow">Раунд ${r + 1} из ${ROUNDS.length}</p>
        <h2 id="voteTitle">Какой сайт сделал <span style="color:${target.color}">${esc(target.name)}</span>?</h2>
        <p class="vote-sub">Второй, соответственно, — ${esc(other.name)}.</p>
        <div class="choices">${order.map((_, i) => `
          <button class="choice" type="button" data-act="choose" data-slot="${i}">
            <span class="seg-letter">${LETTERS[i]}</span>Сайт ${LETTERS[i]}
          </button>`).join('')}
        </div>
        <button class="link-btn" type="button" data-act="close">Посмотреть ещё</button>
      </div>`;
      return;
    }

    const correct = order[answer] === TARGET;
    const isLast = r === ROUNDS.length - 1;
    vote.innerHTML = `<div class="vote-in">
      <p class="eyebrow">Раунд ${r + 1} из ${ROUNDS.length}</p>
      <div class="verdict" id="voteTitle" style="--m:var(${correct ? '--good' : '--bad'})">
        <span class="badge">${correct ? I.check : I.cross}</span>${correct ? 'Угадали!' : 'Мимо'}
      </div>
      <div class="reveal">${order.map((k, i) => `
        <div class="reveal-card" style="--c:${MODELS[k].color}">
          ${i === answer ? '<span class="pick">ваш выбор</span>' : ''}
          <span class="seg-letter">${LETTERS[i]}</span>
          <strong>${esc(MODELS[k].name)}</strong>
        </div>`).join('')}
      </div>
      <div class="vote-actions">
        <button class="btn btn-ghost btn-lg" type="button" data-act="close">Посмотреть ещё раз</button>
        <button class="btn btn-primary btn-lg" type="button" data-act="next">${isLast ? 'К итогам' : 'Следующий раунд'}${I.arrow}</button>
      </div>
    </div>`;
  }

  function nextRound() {
    if (vote.open) vote.close();
    if (test.round >= ROUNDS.length - 1) {
      test.done = true;
      saveTest();
      setMode('results');
      return;
    }
    test.round += 1;
    test.slot = 0;
    saveTest();
    render();
  }

  /* ---------- итоги ---------- */

  function renderResults() {
    const total = ROUNDS.length;
    const hits = ROUNDS.filter((_, r) => test.answers[r] != null && test.order[r][test.answers[r]] === TARGET).length;
    $('#score').innerHTML = `${hits}<span>/${total}</span>`;

    const ratio = hits / total;
    $('#verdict').textContent =
      ratio === 1 ? `Ни одной ошибки — почерк ${MODELS[TARGET].short} вы узнаёте сразу.`
      : ratio === 0 ? `Ни одного попадания. ${MODELS[OTHER].short} отлично маскируется — или вы перехитрили сами себя.`
      : ratio === 0.5 ? 'Ровно половина — как подбросить монетку.'
      : ratio > 0.5 ? 'Больше попаданий, чем промахов — неплохое чутьё.'
      : 'Промахов больше, чем попаданий — модели оказались похожи.';

    $('#rows').innerHTML = ROUNDS.map((R, r) => {
      const order = test.order[r];
      const answer = test.answers[r];
      const ok = answer != null && order[answer] === TARGET;
      return `<li class="row">
        <span class="row-mark" style="--m:var(${ok ? '--good' : '--bad'})">${ok ? I.check : I.cross}</span>
        <div class="row-head">Раунд ${r + 1}${R.title ? ` <small>${esc(R.title)}</small>` : ''}</div>
        <div class="row-sites">${order.map((k, i) => `
          <button class="row-site ${i === answer ? 'is-pick' : ''}" type="button" data-act="view" data-site="${siteId({ ri: r, k })}" style="--c:${MODELS[k].color}" title="Открыть эту версию">
            <span class="seg-letter">${LETTERS[i]}</span>${esc(MODELS[k].name)}${i === answer ? ' <em>· ваш выбор</em>' : ''}
          </button>`).join('')}
        </div>
      </li>`;
    }).join('');
  }

  /* ---------- свободный просмотр ---------- */

  function renderFree() {
    const R = ROUNDS[view.ri];
    const m = MODELS[view.k];
    const src = R.sites[view.k];
    const id = siteId(view);

    barLeft.innerHTML = brand(CFG.title);

    const groups = ROUNDS.map((G, ri) => `
      <div class="group" role="group" aria-label="${esc(G.title)}">
        <span class="group-t">${esc(G.title)}</span>
        <div class="seg">${KEYS.map((k) => {
          const on = ri === view.ri && k === view.k;
          const n = FLAT.findIndex((s) => s.ri === ri && s.k === k) + 1;
          const missing = !G.sites[k];
          return `<button class="seg-btn dotted ${on ? 'is-on' : ''} ${missing ? 'is-missing' : ''}" type="button" data-act="view" data-site="${siteId({ ri, k })}" style="--c:${MODELS[k].color}" aria-pressed="${on}" title="${esc(MODELS[k].name)} · ${esc(G.title)}${n <= 9 ? ` (${n})` : ''}${missing ? ' — ещё не загружен' : ''}">
            <span class="dot"></span>${esc(MODELS[k].short)}</button>`;
        }).join('')}</div>
      </div>`).join('');

    const options = ROUNDS.map((G, ri) => `<optgroup label="${esc(G.title)}">${KEYS.map((k) => {
      const sid = siteId({ ri, k });
      return `<option value="${sid}" ${sid === id ? 'selected' : ''}>${esc(MODELS[k].short)} · ${esc(G.title)}${G.sites[k] ? '' : ' (скоро)'}</option>`;
    }).join('')}</optgroup>`).join('');

    barCenter.innerHTML = `<div class="groups">${groups}</div>
      <label class="picker"><span hidden>Сайт</span><select data-act="pick" aria-label="Выбор сайта">${options}</select>${I.chevron}</label>`;

    barRight.innerHTML = tools(src, `<span class="tools-sep"></span>
      <button class="btn btn-ghost" type="button" data-act="retest" title="Пройти слепой тест заново">${I.retest}<span class="retest-label">Тест</span></button>`);

    mount(`free:${id}`, src, `${m.name} — ${R.title}`, `Версия ${m.name} появится позже.`);

    ui.last = id;
    saveUi();
    const hash = `#${id}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function showSite(s) {
    if (!s) return;
    view = s;
    if (mode !== 'free') setMode('free');
    else render();
  }

  /* ---------------- события ---------------- */

  document.addEventListener('click', (e) => {
    if (e.target === vote) { vote.close(); return; } // клик по фону окна

    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT') return;
    const act = el.dataset.act;

    switch (act) {
      case 'start':
        test = newTest();
        saveTest();
        setMode('test');
        break;
      case 'resume':
        setMode('test');
        break;
      case 'free':
        setMode('free');
        break;
      case 'home':
        if (mode === 'free') setMode(test && test.done ? 'results' : 'intro');
        else if (mode === 'test') setMode('intro');
        break;
      case 'retest':
        drop(TEST_KEY);
        test = null;
        setMode('intro');
        break;
      case 'slot':
        test.slot = Number(el.dataset.slot);
        render();
        break;
      case 'vote':
        openVote();
        break;
      case 'choose':
        test.answers[test.round] = Number(el.dataset.slot);
        saveTest();
        renderVote();
        render();
        break;
      case 'close':
        vote.close();
        break;
      case 'next':
        nextRound();
        break;
      case 'view':
        showSite(siteFromId(el.dataset.site));
        break;
      case 'reload':
        mountedKey = null;
        render();
        break;
      case 'hide':
        setBarHidden(true);
        break;
      case 'show':
        setBarHidden(false);
        break;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('select[data-act="pick"]')) showSite(siteFromId(e.target.value));
  });

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (vote.open || (mode !== 'test' && mode !== 'free')) return;

    if (e.code === 'KeyH') {
      setBarHidden(!ui.barHidden);
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (mode === 'test') {
      let slot = null;
      if (digit && Number(digit[1]) <= 2) slot = Number(digit[1]) - 1;
      if (e.code === 'KeyA') slot = 0;
      if (e.code === 'KeyB') slot = 1;
      if (slot != null && slot !== test.slot) { test.slot = slot; render(); }
    } else if (digit) {
      const s = FLAT[Number(digit[1]) - 1];
      if (s) showSite(s);
    }
  }
  document.addEventListener('keydown', onKey);

  window.addEventListener('hashchange', () => {
    const s = siteFromId(location.hash.slice(1));
    if (s) showSite(s);
  });

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2800);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------------- старт ---------------- */

  setBarHidden(ui.barHidden, true);

  const linked = siteFromId(location.hash.slice(1));
  if (linked) {
    view = linked;
    setMode('free');
  } else if (test && !test.done && test.viewed.flat().some(Boolean)) {
    setMode('test');
  } else if (test && test.done) {
    setMode('free');
  } else {
    setMode('intro');
  }
})();
