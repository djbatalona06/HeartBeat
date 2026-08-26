/* ============================================================================
   The record crate.

   The original piece laid the photographs out as a flat heart-shaped mosaic you
   could drag around. This keeps the heart but makes it out of records: 29 discs
   standing in a crate, arranged on a parametric heart curve so the silhouette
   only resolves when you look at it head-on. Tap one and the cat reaches in and
   pulls it for you.

   Every mesh is built from primitives at runtime — no model files, no textures
   beyond the photographs themselves.
   ========================================================================== */
(function () {
  'use strict';

  var PINK = 0xff8fb0, DEEP = 0xe2467a, RED = 0xd81f45, CREAM = 0xfffdfa, GOLD = 0xf5c85c;

  var api = { mount: mount, pause: pause, resume: resume };
  var ctx = null;

  function supportsWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  function mount(container, opts) {
    if (!window.THREE || !supportsWebGL()) return mount2D(container, opts);
    try { return mount3D(container, opts); }
    catch (err) {
      // A gift must never show a blank screen. If anything in the WebGL path
      // throws — driver quirk, blocked context, out of memory — fall back to
      // the flat mosaic, which is the interaction this piece shipped with.
      console.warn('[crate] 3D unavailable, using 2D mosaic:', err && err.message);
      if (container.__renderer) { try { container.__renderer.dispose(); } catch (e) {} }
      container.innerHTML = '<div class="crate-hint" id="crateHint">drag them around · tap the middle when you\'re done</div>';
      return mount2D(container, opts);
    }
  }

  /* -- heart layout ---------------------------------------------------------
     The classic parametric heart. Sampled at n points for the outline, then
     filled inward so the middle of the shape carries records too. */
  // The original mosaic's heart mask, reused verbatim. A parametric heart curve
  // sounds better and reads worse: sampled at 29 points it comes out as a vague
  // teardrop, because the two top lobes need a hard gap between them to register.
  // This grid puts that gap in explicitly — row 0 skips column 3 — and it is
  // already proven, since it is the shape the photographs shipped in.
  var MASK = [
    [0, 1, 2, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4, 5],
    [2, 3, 4],
    [3]
  ];
  var CELL_X = 1.42, CELL_Y = 1.36, TOP_Y = 3.15;

  function layout() {
    var pts = [];
    MASK.forEach(function (cols, r) {
      cols.forEach(function (c) {
        pts.push({ x: (c - 3) * CELL_X, y: TOP_Y - r * CELL_Y, r: r, c: c });
      });
    });
    return pts;
  }

  /* -- vinyl texture: concentric grooves, drawn once and shared -------------- */
  function vinylTexture() {
    var s = 256, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var g = cv.getContext('2d');
    g.fillStyle = '#140a10';
    g.fillRect(0, 0, s, s);
    for (var r = 18; r < s / 2; r += 2) {
      g.beginPath();
      g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      g.strokeStyle = r % 4 === 0 ? 'rgba(255,180,200,0.05)' : 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.stroke();
    }
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function mount3D(container, opts) {
    var photos = opts.photos || [];
    var W = container.clientWidth || window.innerWidth;
    var H = container.clientHeight || window.innerHeight;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a0f1c);
    scene.fog = new THREE.Fog(0x2a0f1c, 12, 36);

    var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);

    // The heart is about as wide as it is tall; a phone is roughly 1:2. A fixed
    // camera distance that frames it on a laptop crops the outer columns clean
    // off a 390px screen — and a heart missing its edges is just some photos.
    // So solve for the distance that fits the content on whichever axis is
    // tighter, and accept vertical letterboxing in portrait.
    var MARGIN = 1.07;
    var box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();

    // Portrait has height to spare once the width is satisfied. Rather than
    // letterbox it, push the cat up and the crate down so the composition
    // actually occupies the phone screen.
    function reflow() {
      var portrait = camera.aspect < 0.8;
      // The crate sits just under the heart's bottom point in both layouts, so
      // the lowest record reads as standing in it. Only the cat moves: portrait
      // has vertical room to spare, landscape does not.
      var catY = portrait ? 7.6 : 5.05;
      var crateY = -4.6;
      kitty.userData.baseY = catY;
      kitty.position.y = catY;
      crate.position.y = crateY;
      fitCamera();
    }

    // Measure the scene rather than deriving its extent by hand: every tweak to
    // the cat, the crate or the cell spacing otherwise needs the framing
    // constants updated in lockstep, and they silently drift out of agreement.
    function fitCamera() {
      var wasOut = held;
      if (wasOut) { held = null; records.forEach(function (r) { r.position.copy(r.userData.home); }); }
      var spin = root.rotation.y;
      root.rotation.y = 0;
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      root.rotation.y = spin;
      if (wasOut) held = wasOut;

      box.getSize(size);
      box.getCenter(mid);

      var vFov = camera.fov * Math.PI / 180;
      var dH = (size.y / 2) / Math.tan(vFov / 2);
      var hHalf = Math.atan(Math.tan(vFov / 2) * camera.aspect);
      var dW = (size.x / 2) / Math.tan(hHalf);
      var d = Math.max(dH, dW) * MARGIN + size.z / 2;

      camera.position.set(0, mid.y, d);
      camera.lookAt(0, mid.y, 0);
      camera.updateProjectionMatrix();
      // Fog is set from the camera distance so the far edge of the crate stays
      // just-visible at any framing rather than vanishing on a narrow screen.
      scene.fog.near = d * 0.7;
      scene.fog.far = d * 2.2;
    }

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    container.__renderer = renderer;

    scene.add(new THREE.AmbientLight(0xffe4ee, 1.05));
    var key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 6, 8);
    scene.add(key);
    var fill = new THREE.PointLight(PINK, 1.6, 44);
    fill.position.set(-5, 2, 5);
    scene.add(fill);

    var root = new THREE.Group();
    scene.add(root);

    // ---- records ----
    var vinyl = vinylTexture();
    var loader = new THREE.TextureLoader();
    var discGeo = new THREE.CylinderGeometry(1, 1, 0.035, 48);
    var labelGeo = new THREE.CircleGeometry(0.66, 40);
    var holeGeo = new THREE.CircleGeometry(0.055, 16);
    var vinylMat = new THREE.MeshStandardMaterial({ map: vinyl, roughness: 0.55, metalness: 0.15 });
    var holeMat = new THREE.MeshBasicMaterial({ color: 0x2a0f1c });

    var spots = layout();
    var records = [];

    photos.forEach(function (src, i) {
      var spot = spots[i % spots.length];
      var g = new THREE.Group();

      var disc = new THREE.Mesh(discGeo, vinylMat);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);

      var tex = loader.load(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      var label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: tex }));
      label.position.z = 0.019;
      g.add(label);
      var labelBack = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: tex }));
      labelBack.position.z = -0.019;
      labelBack.rotation.y = Math.PI;
      g.add(labelBack);

      var hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.z = 0.021;
      g.add(hole);

      g.position.set(spot.x, spot.y, ((spot.r + spot.c) % 4) * -0.16);
      g.scale.setScalar(0.52);
      g.userData = {
        src: src,
        home: g.position.clone(),
        tilt: ((i % 5) - 2) * 0.06,
        bob: Math.random() * Math.PI * 2,
        out: false
      };
      g.rotation.z = g.userData.tilt;
      root.add(g);
      records.push(g);
    });

    // ---- crate ----
    // Panels are placed relative to the group's own origin, not in world space:
    // reflow() moves this group, and a panel carrying its own absolute offset
    // would be shifted twice.
    var crateMat = new THREE.MeshStandardMaterial({ color: 0x6b2a42, roughness: 0.9 });
    var rimMat = new THREE.MeshStandardMaterial({ color: 0x8d3a58, roughness: 0.7 });
    var CW = 7.2, CH = 1.3, CD = 2.3;
    var crate = new THREE.Group();

    function panel(w, h, d, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
      m.position.set(x, y, z);
      crate.add(m);
    }
    panel(CW, CH, 0.16, 0, 0, CD / 2);
    panel(CW, CH, 0.16, 0, 0, -CD / 2);
    panel(0.16, CH, CD, -CW / 2, 0, 0);
    panel(0.16, CH, CD, CW / 2, 0, 0);
    panel(CW, 0.16, CD, 0, -CH / 2, 0);

    // A lit rim along the front lip. Without it the front panel reads as a flat
    // slab of background rather than an edge the records stand behind.
    var rim = new THREE.Mesh(new THREE.BoxGeometry(CW, 0.1, 0.24), rimMat);
    rim.position.set(0, CH / 2, CD / 2);
    crate.add(rim);

    root.add(crate);

    // ---- the cat ----
    var kitty = buildKitty();
    kitty.position.set(0, 5.05, 2.2);
    kitty.userData.baseY = 5.05;
    root.add(kitty);

    // ---- interaction ----
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();
    var held = null;
    var reach = 0;          // 0 = idle, 1 = fully extended
    var reachTarget = 0;
    var drag = { on: false, x: 0, y: 0, rotY: 0, vel: 0 };

    function pick(ev) {
      var rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      var hits = raycaster.intersectObjects(records, true);
      if (!hits.length) return null;
      var o = hits[0].object;
      while (o && records.indexOf(o) === -1) o = o.parent;
      return o;
    }

    function onDown(ev) {
      drag.on = true;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      drag.moved = false;
      drag.hit = pick(ev);
    }

    function onMove(ev) {
      if (!drag.on) return;
      var dx = ev.clientX - drag.x;
      if (Math.abs(dx) > 4) drag.moved = true;
      drag.vel = dx * 0.0016;
      root.rotation.y += dx * 0.0032;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
    }

    function onUp() {
      if (!drag.on) return;
      drag.on = false;
      if (drag.moved || !drag.hit) return;

      var rec = drag.hit;
      if (rec.userData.out) {
        // Already presented: a second tap opens it full screen.
        if (opts.onInspect) opts.onInspect(rec.userData.src);
        return;
      }
      if (held) { held.userData.out = false; held = null; }
      held = rec;
      rec.userData.out = true;
      reachTarget = 1;
      var hint = document.getElementById('crateHint');
      if (hint) hint.textContent = 'tap it again to see it properly';
    }

    var dom = renderer.domElement;
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // ---- loop ----
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var clock = new THREE.Clock();
    var raf = null;
    var running = true;

    function frame() {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      if (!drag.on) {
        root.rotation.y += drag.vel;
        drag.vel *= 0.94;
        // Ease back toward head-on, because the heart only reads from the front.
        root.rotation.y += (0 - root.rotation.y) * 0.012;
      }

      reach += (reachTarget - reach) * (reduce ? 1 : dt * 4.5);

      records.forEach(function (r, i) {
        var u = r.userData;
        if (r === held) {
          // Lift out of the crate and present it to camera.
          var tp = new THREE.Vector3(0, mid.y, camera.position.z * 0.44);
          r.position.lerp(tp, reduce ? 1 : dt * 3.2);
          r.scale.lerp(new THREE.Vector3(1.5, 1.5, 1.5), reduce ? 1 : dt * 3.2);
          r.rotation.z += (0 - r.rotation.z) * dt * 4;
          r.rotation.y = -root.rotation.y;
        } else {
          r.position.lerp(u.home, reduce ? 1 : dt * 2.6);
          r.scale.lerp(new THREE.Vector3(0.52, 0.52, 0.52), reduce ? 1 : dt * 2.6);
          r.rotation.z += (u.tilt - r.rotation.z) * dt * 3;
          r.rotation.y = 0;
          if (!reduce) r.position.y = u.home.y + Math.sin(t * 0.9 + u.bob) * 0.045;
        }
      });

      animateKitty(kitty, t, reach, held, reduce);
      renderer.render(scene, camera);
    }

    function onResize() {
      var w = container.clientWidth || window.innerWidth;
      var h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      renderer.setSize(w, h);
      reflow();
    }
    window.addEventListener('resize', onResize);

    function onVis() {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
      else if (running && !raf) { clock.getDelta(); frame(); }
    }
    document.addEventListener('visibilitychange', onVis);

    reflow();
    frame();

    // A quiet way onward once she's had a look.
    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'one more thing →';
    next.style.cssText = 'position:absolute;left:50%;bottom:3vh;transform:translateX(-50%);z-index:50';
    next.addEventListener('click', function () { if (opts.onDone) opts.onDone(); });
    container.appendChild(next);

    if (window.__GIFT_DEBUG) { window.__dbgRoot = root; window.__dbgCam = camera; window.__dbgCrate = crate; window.__dbgKitty = kitty; }

    ctx = {
      pause: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      resume: function () { running = true; if (!raf) { clock.getDelta(); frame(); } }
    };
    return ctx;
  }

  /* -- the cat, from primitives -------------------------------------------- */
  function buildKitty() {
    var g = new THREE.Group();
    var fur = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x2a0f1c, roughness: 0.6 });
    var bowMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5 });

    var head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), fur);
    head.scale.set(1.25, 1, 0.92);
    g.add(head);

    [-0.82, 0.82].forEach(function (x) {
      var ear = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 4), fur);
      ear.position.set(x, 0.78, 0);
      ear.rotation.z = x < 0 ? 0.42 : -0.42;
      ear.rotation.y = Math.PI / 4;
      g.add(ear);
    });

    [-0.42, 0.42].forEach(function (x) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), dark);
      eye.position.set(x, 0.06, 0.88);
      eye.scale.set(0.8, 1.2, 0.6);
      g.add(eye);
    });

    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12),
      new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.45 }));
    nose.position.set(0, -0.2, 0.9);
    nose.scale.set(1.3, 0.85, 0.7);
    g.add(nose);

    // Whiskers: thin boxes are cheaper than lines and take light.
    [-1, 1].forEach(function (side) {
      [-0.16, 0, 0.16].forEach(function (dy, i) {
        var w = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.022, 0.022), dark);
        w.position.set(side * 1.0, -0.14 + dy, 0.66);
        w.rotation.z = side * (0.2 - i * 0.2);
        g.add(w);
      });
    });

    var bow = new THREE.Group();
    [-1, 1].forEach(function (s) {
      var lobe = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 3), bowMat);
      lobe.position.x = s * 0.28;
      lobe.rotation.z = s * Math.PI / 2;
      bow.add(lobe);
    });
    var knot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12),
      new THREE.MeshStandardMaterial({ color: DEEP, roughness: 0.4 }));
    bow.add(knot);
    bow.position.set(-0.95, 0.85, 0.25);
    g.add(bow);

    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.5, 8, 20), fur);
    body.position.y = -1.55;
    g.add(body);

    // Two arms, each a group hinged at the shoulder so a single rotation.x
    // swings the whole limb — enough articulation to read as "reaching".
    var arms = [];
    [-1, 1].forEach(function (side) {
      var pivot = new THREE.Group();
      pivot.position.set(side * 0.62, -1.35, 0.15);
      var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.8, 6, 12), fur);
      upper.position.y = -0.5;
      pivot.add(upper);
      var paw = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), fur);
      paw.position.y = -1.0;
      pivot.add(paw);
      pivot.userData.side = side;
      g.add(pivot);
      arms.push(pivot);
    });

    g.userData.arms = arms;
    g.scale.setScalar(0.62);
    return g;
  }

  function animateKitty(k, t, reach, held, reduce) {
    if (!reduce) {
      k.position.y = (k.userData.baseY || 5.05) + Math.sin(t * 1.1) * 0.14;
      k.rotation.z = Math.sin(t * 0.7) * 0.035;
    }
    var arms = k.userData.arms || [];
    arms.forEach(function (a, i) {
      // Both arms swing down and forward as the reach extends; the idle pose is
      // a small alternating sway so she never looks frozen.
      // Arms hang straight down at rotation.x = 0. Swinging them past
      // horizontal points them at the camera and reads as nothing at all, so
      // the reach is a shallow forward tip plus a spread outward — the shape of
      // someone leaning down into a crate, seen from the front.
      var idle = reduce ? 0 : Math.sin(t * 1.3 + i * Math.PI) * 0.1;
      var tx = idle + reach * 0.62;
      var tz = a.userData.side * (0.18 + reach * 0.62);
      a.rotation.x += (tx - a.rotation.x) * 0.12;
      a.rotation.z += (tz - a.rotation.z) * 0.12;
    });
  }

  /* -- 2D fallback: the original draggable mosaic --------------------------- */
  function mount2D(container, opts) {
    var photos = opts.photos || [];
    var MASK = [[0,1,2,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[1,2,3,4,5],[2,3,4],[3]];
    var COLS = 7, GAPF = 0.13, STAGGER = 95;

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
    var field = document.createElement('div');
    field.style.cssText = 'position:relative;width:min(94vw,86vh);aspect-ratio:7/6';
    wrap.appendChild(field);
    container.appendChild(wrap);

    var slots = [];
    MASK.forEach(function (cols, r) { cols.forEach(function (c) { slots.push({ r: r, c: c }); }); });

    var ROWS = MASK.length;
    var cw = (100 / COLS) * (1 - GAPF), ch = (100 / ROWS) * (1 - GAPF);
    var padX = ((100 / COLS) - cw) / 2, padY = ((100 / ROWS) - ch) / 2;

    slots.forEach(function (s, i) {
      var seed = s.r * 7 + s.c;
      var cell = document.createElement('div');
      cell.style.cssText =
        'position:absolute;left:' + (s.c * (100 / COLS) + padX) + '%;top:' + (s.r * (100 / ROWS) + padY) + '%;' +
        'width:' + cw + '%;height:' + ch + '%;cursor:grab;opacity:0;' +
        'transition:opacity 700ms ease ' + (i * STAGGER) + 'ms, transform 1000ms cubic-bezier(0.16,1,0.3,1) ' + (i * STAGGER) + 'ms;' +
        'transform:translate3d(' + (((seed % 7) - 3) * 22) + 'px,' + (-50 - (seed % 6) * 14) + 'px,0)';
      var img = document.createElement('img');
      img.src = photos[i % photos.length];
      img.draggable = false;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:3px;' +
        'box-shadow:0 8px 26px rgba(0,0,0,0.55),0 0 0 1px rgba(255,143,176,0.2)';
      cell.appendChild(img);
      field.appendChild(cell);

      var tilt = ((seed % 5) - 2) * 1.5;
      requestAnimationFrame(function () {
        cell.style.opacity = '1';
        cell.style.transform = 'rotate(' + tilt + 'deg)';
      });

      // Drag physics carried over verbatim: 4px threshold before it counts as a
      // drag, and rotation coupled to horizontal travel at 0.035deg per pixel.
      var base = { dx: 0, dy: 0, rot: tilt }, d = null;
      cell.addEventListener('pointerdown', function (e) {
        d = { x0: e.clientX, y0: e.clientY, moved: false };
        cell.style.transition = 'none';
        cell.style.zIndex = 40;
        try { cell.setPointerCapture(e.pointerId); } catch (err) {}
      });
      cell.addEventListener('pointermove', function (e) {
        if (!d) return;
        var ddx = e.clientX - d.x0, ddy = e.clientY - d.y0;
        if (Math.abs(ddx) > 4 || Math.abs(ddy) > 4) d.moved = true;
        d.last = { dx: base.dx + ddx, dy: base.dy + ddy, rot: base.rot + ddx * 0.035 };
        cell.style.transform = 'translate3d(' + d.last.dx + 'px,' + d.last.dy + 'px,0) rotate(' + d.last.rot + 'deg) scale(1.07)';
      });
      function end() {
        if (!d) return;
        cell.style.transition = '';
        if (!d.moved) { if (opts.onInspect) opts.onInspect(img.src); }
        else if (d.last) {
          base = d.last;
          cell.style.transform = 'translate3d(' + base.dx + 'px,' + base.dy + 'px,0) rotate(' + base.rot + 'deg)';
        }
        d = null;
      }
      cell.addEventListener('pointerup', end);
      cell.addEventListener('pointercancel', end);
    });

    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'one more thing →';
    next.style.cssText = 'position:absolute;left:50%;bottom:11vh;transform:translateX(-50%);z-index:50';
    next.addEventListener('click', function () { if (opts.onDone) opts.onDone(); });
    container.appendChild(next);

    ctx = { pause: function () {}, resume: function () {} };
    return ctx;
  }

  function pause() { if (ctx && ctx.pause) ctx.pause(); }
  function resume() { if (ctx && ctx.resume) ctx.resume(); }

  window.GiftCrate = api;
})();
