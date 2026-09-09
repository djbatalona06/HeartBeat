/* ==========================================================================
   The projector.

   The letter ends, and the records are next. Between them, a beat: the tomcat
   walks a screen down out of the ceiling and shows her the photographs before
   she ever touches one.

   It reads window.GIFT_PHOTOS -- the same 44 data: URIs the crate cuts into
   vinyl -- so the two scenes cannot drift apart and the file does not grow.
   Nothing here is 3D. Five of the six phases are DOM and CSS, three.js is
   already carrying one WebGL context for the crate, and a second one for a
   cross-fade would be a cost with no picture to show for it.
   ========================================================================== */
(function () {
  'use strict';

  var HOLD_MS = 3000;        // one photograph, before it hands over
  var FADE_MS = 900;         // the overlap between two of them
  var ROLL_MS = 1500;        // the screen coming down
  var FREE_AFTER = 3;        // photographs before the way out is offered

  var api = { mount: mount, stop: stop, ctl: ctl };
  var state = {
    photos: [], i: -1, front: null, back: null,   // both filled in by mount()
    timer: null, mounted: false, rolled: false, done: false, reduce: false,
  };
  var el = {};
  var onDone = null;

  function $(id) { return document.getElementById(id); }

  function clear() { if (state.timer) { clearTimeout(state.timer); state.timer = null; } }

  /**
   * Shows photograph `n`, cross-fading whichever <img> is currently behind.
   *
   * Two elements swapped rather than one element re-sourced: setting .src on a
   * visible <img> blanks it for a frame while the next one decodes, and a
   * blank frame in the middle of a slow fade reads as a bug rather than a cut.
   */
  function showPhoto(n) {
    if (!state.photos.length) return;
    var idx = ((n % state.photos.length) + state.photos.length) % state.photos.length;
    state.i = idx;

    var next = state.back;
    var prev = state.front;
    next.src = state.photos[idx];
    next.classList.add('on');
    if (prev) prev.classList.remove('on');
    state.front = next;
    state.back = prev;

    if (idx + 1 >= FREE_AFTER) offerTheWayOut();
    queue();
  }

  function queue() {
    clear();
    if (state.reduce) return;   // no clock at all: every advance is a tap
    state.timer = setTimeout(function () {
      if (state.i + 1 >= state.photos.length) { finish(); return; }
      showPhoto(state.i + 1);
    }, HOLD_MS + FADE_MS);
  }

  /** The last photograph has been seen. Stop, and let the button stand alone. */
  function finish() {
    clear();
    state.done = true;
    offerTheWayOut();
    if (el.hint) el.hint.textContent = 'that is all of them';
  }

  function offerTheWayOut() {
    if (!el.next || el.next.style.opacity === '1') return;
    el.next.style.opacity = '1';
    el.next.style.pointerEvents = 'auto';
  }

  /** A tap anywhere on the phase moves it along, the way the letter does. */
  function advance() {
    if (!state.rolled) return;
    if (state.i + 1 >= state.photos.length) { finish(); return; }
    showPhoto(state.i + 1);
  }

  function mount(container, opts) {
    onDone = (opts && opts.onDone) || null;
    state.photos = (opts && opts.photos) || [];

    if (state.mounted) { resume(); return api; }
    state.mounted = true;
    state.reduce = !!(window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    el.stage = $('projStage');
    el.screen = $('projScreen');
    el.hint = $('projHint');
    el.a = $('projA');
    el.b = $('projB');
    // Both slots are real elements from the start. Seeding front as null
    // works exactly once: the first swap hands that null back to state.back,
    // and the second photograph then sets .src on nothing.
    state.front = el.b;
    state.back = el.a;

    // The advance button is built here rather than in the markup for the same
    // reason the letter builds its own: it must not exist as a tab stop or a
    // tap target before there is anything to advance past.
    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'there are records →';
    next.style.opacity = '0';
    next.style.pointerEvents = 'none';
    next.addEventListener('click', function (e) {
      e.stopPropagation();
      stop();
      if (onDone) onDone();
    });
    container.appendChild(next);
    el.next = next;

    container.addEventListener('click', advance);

    // Under reduced motion the screen is simply already down: the roll is the
    // one thing here that is purely a flourish, and the photographs are not.
    if (state.reduce) {
      el.stage.setAttribute('data-rolled', 'true');
      state.rolled = true;
      el.hint.textContent = 'tap for the next one';
      showPhoto(0);
      return api;
    }

    requestAnimationFrame(function () {
      el.stage.setAttribute('data-rolled', 'true');
    });
    state.timer = setTimeout(function () {
      state.rolled = true;
      showPhoto(0);
    }, ROLL_MS);

    return api;
  }

  function resume() {
    if (state.done) { offerTheWayOut(); return; }
    if (state.rolled) queue();
  }

  function stop() { clear(); }

  /** The hook gift/tools/verify.mjs drives the scene through. */
  function ctl() {
    return {
      state: function () {
        return {
          rolled: state.rolled,
          done: state.done,
          index: state.i,
          count: state.photos.length,
          showing: state.front ? state.front.getAttribute('src') : null,
        };
      },
      advance: advance,
      finish: finish,
      // Lets the walkthrough see all 44 without waiting three minutes.
      setPace: function (hold, fade) {
        if (hold != null) HOLD_MS = hold;
        if (fade != null) FADE_MS = fade;
      },
    };
  }

  window.GiftProjector = api;
})();
