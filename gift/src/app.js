/* ============================================================================
   For Jennifer — 25 September.

   A port of the original Claude Design piece off its <x-dc> template runtime
   onto plain DOM. Same phases, same easing curves, same drag physics; the
   React/dc-runtime layer is gone because it cost ~250KB and made mounting a
   WebGL scene awkward.

   Phase order deliberately differs from the original: the letter now opens the
   deck instead of closing it, and the photographs come after.
   ========================================================================== */
(function () {
  'use strict';

  var PHASES = ['gate', 'intro', 'envelope', 'letter', 'crate', 'guide'];
  var INTRO_MS = 11000;

  // ---- the letter -----------------------------------------------------------
  // Split into paragraphs for pacing rather than as written; a single 700
  // character block types for seventeen seconds and reads like a wall.
  var LETTER = {
    date: 'September 25 · for Jennifer',
    salutation: 'Honey,',
    paragraphs: [
      "During the time that we've sat together in Math, hung out in Brem/Hawaii, or even gone for a walk in the park while we yap about our lives. These seem mundane and futile, yet they hold the most value.",
      "I'm someone who psychologically doesn't have any object permanence. That means that, normally, once a task, object, animal, or thing is out of my vision, I don't think about it for a while, unless there's a trigger.",
      "I'm saying this because none of it applies to you. None at all. Your eyes and grin stand out, with your sleek, almost shaded like midnight, is what stays in my mind. It's like an imaginary halo that both sides of me can hold on to. Your beauty stands tall, although you may not ;).",
      "I'd like to close this out by saying that you've brought me to a place of warmth and love in me that I was never able to accept by myself. You showed me what it's like to let both sides of me bloom like the stargazer of mine that you are.",
      'Jennifer Huynh, you are my Lily and the sun that reminds me to look and reach for the stars.'
    ],
    signPre: 'I love you,',
    signName: 'DJ Batalona',
    signAlias: 'Tip Man · also known as Coochie Man',
    closer: 'To my love, Tip Mama.'
  };

  // Milliseconds per character. The original hardcoded a steps() count per
  // paragraph, which silently desynced the moment the copy changed. Deriving
  // both the duration and the step count from the text means the reveal is
  // always exactly one step per character, whatever gets rewritten later.
  var MS_PER_CHAR = 21;
  var GAP_MS = 260;

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  PHASES.forEach(function (p) { el[p] = $(p); });

  var state = { phase: 'gate', sound: true, typing: false, started: false };
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); return timers[timers.length - 1]; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ---- phase machine --------------------------------------------------------
  function show(name) {
    state.phase = name;
    PHASES.forEach(function (p) { el[p].hidden = p !== name; });
    paintDots();
    $('sound').style.opacity = name === 'gate' ? '0' : '1';
    $('dots').style.opacity = name === 'gate' || name === 'intro' ? '0' : '1';
  }

  function paintDots() {
    var wrap = $('dots');
    if (!wrap.children.length) {
      PHASES.slice(2).forEach(function () {
        var d = document.createElement('div');
        d.className = 'dot';
        wrap.appendChild(d);
      });
    }
    var idx = PHASES.slice(2).indexOf(state.phase);
    Array.prototype.forEach.call(wrap.children, function (d, i) {
      d.className = 'dot' + (i === idx ? ' on' : '');
    });
  }

  // ---- 1 · gate -------------------------------------------------------------
  el.gate.addEventListener('click', function () {
    if (state.started) return;
    state.started = true;
    show('intro');
    playAudio();
    later(toEnvelope, INTRO_MS);
  });

  // ---- 2 · intro ------------------------------------------------------------
  el.intro.addEventListener('click', function () { clearTimers(); toEnvelope(); });

  function toEnvelope() {
    if (state.phase === 'envelope') return;
    clearTimers();
    show('envelope');
  }

  // ---- 3 · envelope ---------------------------------------------------------
  var envOpened = false;
  $('env').addEventListener('click', function () {
    if (envOpened) return;
    envOpened = true;
    var env = $('env');
    env.style.transform = 'translateY(-30px) scale(1.04)';
    later(function () {
      env.style.opacity = '0';
      buildLetter();
      show('letter');
      later(runTypewriter, 120);
    }, 620);
  });

  // ---- 4 · letter -----------------------------------------------------------
  var lines = [];

  function buildLetter() {
    if (lines.length) return;
    var paper = $('paper');

    function add(cls, text, tag) {
      var node = document.createElement(tag || 'div');
      node.className = cls + ' wipe';
      node.textContent = text;
      paper.appendChild(node);
      lines.push(node);
      return node;
    }

    add('letter-date', LETTER.date);
    add('salutation', LETTER.salutation, 'p');
    LETTER.paragraphs.forEach(function (t) { add('para', t, 'p'); });

    // The signature block wipes as one unit; its three lines are one gesture.
    var sign = document.createElement('div');
    sign.className = 'sign wipe';
    [['sign-pre', LETTER.signPre], ['sign-name', LETTER.signName], ['sign-alias', LETTER.signAlias]]
      .forEach(function (pair) {
        var d = document.createElement('div');
        d.className = pair[0];
        d.textContent = pair[1];
        sign.appendChild(d);
      });
    paper.appendChild(sign);
    lines.push(sign);

    var closer = document.createElement('div');
    closer.className = 'closer wipe';
    var cl = document.createElement('div');
    cl.className = 'closer-line';
    cl.textContent = LETTER.closer;
    closer.appendChild(cl);
    paper.appendChild(closer);
    lines.push(closer);

    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'there are records →';
    next.style.opacity = '0';
    next.style.pointerEvents = 'none';
    next.addEventListener('click', function (e) { e.stopPropagation(); toCrate(); });
    paper.appendChild(next);
    el.letterNext = next;
  }

  function runTypewriter() {
    state.typing = true;
    var t = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    lines.forEach(function (node) {
      var n = Math.max(1, node.textContent.trim().length);
      var dur = reduce ? 1 : n * MS_PER_CHAR;
      node.style.transition = 'clip-path ' + dur + 'ms steps(' + n + ', end) ' + t + 'ms';
      // Two frames: one to commit the transition, one to flip the value, or the
      // browser coalesces both into a jump with no animation at all.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { node.style.clipPath = 'inset(0 0% 0 0)'; });
      });
      t += dur + (reduce ? 0 : GAP_MS);
    });

    later(finishTyping, t + 200);
  }

  function finishTyping() {
    if (!state.typing) return;
    state.typing = false;
    clearTimers();
    lines.forEach(function (node) {
      // Killing the transition outright is the only reliable way to land on the
      // final value: the inline clip-path is already 'inset(0 0% 0 0)' from
      // runTypewriter, so re-assigning it is a no-op and the original long
      // transition would simply carry on counting down its delay.
      node.style.transition = 'none';
      node.style.clipPath = 'inset(0 0% 0 0)';
      void node.offsetWidth;
    });
    if (el.letterNext) {
      el.letterNext.style.opacity = '1';
      el.letterNext.style.pointerEvents = 'auto';
    }
  }

  // Tapping the page while it types completes it. A love letter should never
  // hold someone hostage to its own animation.
  el.letter.addEventListener('click', function () { if (state.typing) finishTyping(); });

  // 46 ornaments ring the page; exactly 20 are bows, one for each year.
  function buildBorder() {
    var layer = $('borderLayer');
    var spots = [];
    var n = 15, m = 9;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 95 + 2;
      spots.push({ left: x, top: 1.4, delay: (i % 6) * 0.45 });
      spots.push({ left: x, top: 96.6, delay: ((i + 3) % 6) * 0.45 });
    }
    for (var j = 1; j < m; j++) {
      var y = (j / m) * 95 + 2;
      spots.push({ left: 1.1, top: y, delay: (j % 6) * 0.45 });
      spots.push({ left: 97.3, top: y, delay: ((j + 2) % 6) * 0.45 });
    }
    // Spread the 20 bows evenly through the ring rather than clustering them.
    var step = spots.length / 20;
    var bowAt = {};
    for (var b = 0; b < 20; b++) bowAt[Math.floor(b * step)] = true;

    spots.forEach(function (s, idx) {
      var d = document.createElement('div');
      d.className = 'orn';
      d.style.left = s.left + '%';
      d.style.top = s.top + '%';
      d.style.animationDelay = s.delay + 's';
      d.innerHTML = bowAt[idx]
        ? '<svg viewBox="0 0 30 23"><use href="#bow" color="#d81f45"/></svg>'
        : '<svg viewBox="0 0 24 22"><use href="#heart" color="#ff8fb0"/></svg>';
      layer.appendChild(d);
    });
  }

  // ---- 5 · the file box and record player ------------------------------------
  function toCrate() {
    clearTimers();
    show('crate');
    if (window.GiftCrate && !el.crateMounted) {
      el.crateMounted = true;
      window.GiftCrate.mount(el.crate, {
        photos: window.GIFT_PHOTOS || [],
        onInspect: openInspect,
        onPlay: onNeedleDrop,
        onDone: toGuide
      });
    }
  }

  // Dropping the needle is a fresh user gesture, which is the one thing that
  // can start audio a browser refused to autoplay back at the gate. Lifting the
  // arm deliberately does not stop the song: she did not ask for silence, and a
  // gift that takes the music away as a side effect of putting a record down
  // reads as a bug.
  function onNeedleDrop() {
    var a = song();
    if (a && state.sound && a.paused) playAudio();
  }

  function openInspect(src) {
    $('inspectImg').src = src;
    $('inspect').classList.add('on');
  }
  $('inspect').addEventListener('click', function () {
    $('inspect').classList.remove('on');
  });

  // ---- 6 · guide ------------------------------------------------------------
  function toGuide() {
    show('guide');
    if (window.GiftCrate) window.GiftCrate.pause();
  }

  // ---- audio ----------------------------------------------------------------
  function song() { return $('song'); }

  function playAudio() {
    var a = song();
    if (!a || !state.sound) return;
    a.volume = 0.5;
    var p = a.play();
    // Autoplay refusal is expected and harmless; the toggle still works.
    if (p && p.catch) p.catch(function () {});
  }

  $('sound').addEventListener('click', function (e) {
    e.stopPropagation();
    state.sound = !state.sound;
    $('soundDot').className = 'sound-dot' + (state.sound ? '' : ' off');
    $('soundLabel').textContent = state.sound ? 'music on' : 'music off';
    if (state.sound) playAudio(); else song().pause();
  });

  // ---- keyboard -------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (state.phase === 'gate') el.gate.click();
    else if (state.phase === 'intro') { clearTimers(); toEnvelope(); }
    else if (state.phase === 'envelope') $('env').click();
    else if (state.phase === 'letter') { if (state.typing) finishTyping(); else toCrate(); }
    else if (state.phase === 'crate') toGuide();
  });

  buildBorder();
  show('gate');

  window.GIFT = {
    toCrate: toCrate, toGuide: toGuide, show: show, state: state,
    // Verification hook: lets the walkthrough run a real, unskipped reveal
    // in a fraction of a second instead of the full two-and-a-half minutes.
    setPace: function (ms, gap) { MS_PER_CHAR = ms; if (gap != null) GAP_MS = gap; }
  };
})();
