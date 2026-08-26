/* ============================================================================
   The file box and the record player.

   The original piece laid the photographs out as a flat heart-shaped mosaic you
   could drag around. Then they became 29 records standing in a crate. Now they
   stand in a file box you flip through the way you'd flip through a bin in a
   record shop: drag sideways, the front one tips toward you, the next one comes
   up. Tap the one at the front and the cat lifts it onto the turntable, the arm
   comes over, and it spins at 33⅓.

   The heart is not gone. It is embossed on the front of the box, and once
   every record has been played the discs rise out and re-form it.

   Every mesh is built from primitives at runtime — no model files, no textures
   beyond the photographs themselves.
   ========================================================================== */
(function () {
  'use strict';

  var PINK = 0xff8fb0, DEEP = 0xe2467a, RED = 0xd81f45, CREAM = 0xfffdfa, GOLD = 0xf5c85c;

  var api = { mount: mount, pause: pause, resume: resume };
  var ctx = null;

  /** Per-step factor for exponential smoothing with a fixed time constant.
      Independent of frame rate, which `dt * rate` is not. */
  function decay(rate, dt) { return 1 - Math.exp(-rate * dt); }

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
      // the flat version, which offers the same two gestures.
      console.warn('[crate] 3D unavailable, using 2D fallback:', err && err.message);
      if (container.__renderer) { try { container.__renderer.dispose(); } catch (e) {} }
      return mount2D(container, opts);
    }
  }

  /* -- heart layout ---------------------------------------------------------
     Kept verbatim from the crate, because it is what the finale flies to. A
     parametric heart curve sounds better and reads worse: sampled at 29 points
     it comes out as a vague teardrop, because the two top lobes need a hard gap
     between them to register. This grid puts that gap in explicitly — row 0
     skips column 3 — and it is already proven, since it is the shape the
     photographs shipped in. */
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

  /* A solid heart for the relief on the box. Here a bezier outline is the right
     tool — the objection above is about placing discrete discs, not about
     drawing a filled silhouette, which beziers do better than a grid. */
  function heartShape(s) {
    var h = new THREE.Shape();
    h.moveTo(0, -0.95 * s);
    h.bezierCurveTo(-0.62 * s, -0.42 * s, -1.02 * s, 0.18 * s, -1.02 * s, 0.46 * s);
    h.bezierCurveTo(-1.02 * s, 0.86 * s, -0.66 * s, 1.02 * s, -0.40 * s, 1.02 * s);
    h.bezierCurveTo(-0.18 * s, 1.02 * s, -0.05 * s, 0.86 * s, 0, 0.70 * s);
    h.bezierCurveTo(0.05 * s, 0.86 * s, 0.18 * s, 1.02 * s, 0.40 * s, 1.02 * s);
    h.bezierCurveTo(0.66 * s, 1.02 * s, 1.02 * s, 0.86 * s, 1.02 * s, 0.46 * s);
    h.bezierCurveTo(1.02 * s, 0.18 * s, 0.62 * s, -0.42 * s, 0, -0.95 * s);
    return h;
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

  /* -- the file box --------------------------------------------------------- */
  // The records rest on a ledge partway up rather than on the floor of the box.
  // Sitting them on the floor is what a crate does, and it buries two thirds of
  // every sleeve behind the front panel; a file box holds its cards up.
  var BOX = { w: 2.4, h: 1.8, d: 2.6, wall: 0.12, frontH: 0.80, ledgeY: -0.25 };

  // Records sit small in the box and large on the platter, where a 12" record
  // should overhang the mat slightly, the way a real one does.
  var BOX_SCALE = 0.70, PLAY_SCALE = 1.15, HEART_SCALE = 0.52;
  var SPACING = 0.085;
  var Z_FRONT = BOX.d / 2 - 0.30;
  // Standing on the ledge, which leaves each record proud of the rim — the
  // whole reason a file box is legible at a glance.
  var RECORD_Y = BOX.ledgeY + 0.03 + BOX_SCALE;

  function buildBox() {
    var g = new THREE.Group();
    var wood = new THREE.MeshStandardMaterial({ color: 0x7d3550, roughness: 0.88 });
    var rimMat = new THREE.MeshStandardMaterial({ color: 0xa8496b, roughness: 0.62 });
    // A pale floor bounces light back up under the records, which otherwise
    // sit in their own shadow and read as a row of black slots.
    var floorMat = new THREE.MeshStandardMaterial({ color: 0xd9a3b8, roughness: 0.8 });

    function panel(w, h, d, x, y, z, m) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || wood);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    }

    var W = BOX.w, H = BOX.h, D = BOX.d, T = BOX.wall;

    // The front is cut down to just under the ledge, so nothing stands between
    // the camera and the photograph on the record at the front.
    panel(W, BOX.frontH, T, 0, -H / 2 + BOX.frontH / 2, D / 2);
    panel(W, H, T, 0, 0, -D / 2);
    panel(T, H, D, -W / 2, 0, 0);
    panel(T, H, D, W / 2, 0, 0);
    panel(W, T, D, 0, -H / 2, 0);
    // The ledge the records stand on.
    panel(W - T, 0.06, D - T, 0, BOX.ledgeY, 0, floorMat);

    // A lit rim along each top edge, so the box reads as an opening rather than
    // a flat slab of background.
    panel(W, 0.07, 0.2, 0, -H / 2 + BOX.frontH, D / 2, rimMat);
    panel(W, 0.07, 0.2, 0, H / 2, -D / 2, rimMat);
    [-1, 1].forEach(function (s) {
      panel(0.2, 0.07, D, s * W / 2, H / 2, 0, rimMat);
    });

    // The heart, embossed proud of the front panel.
    var heartGeo = new THREE.ExtrudeGeometry(heartShape(0.29), {
      depth: 0.05, bevelEnabled: true, bevelThickness: 0.018,
      bevelSize: 0.018, bevelSegments: 2, curveSegments: 14
    });
    var heart = new THREE.Mesh(heartGeo, new THREE.MeshStandardMaterial({
      color: PINK, roughness: 0.45, metalness: 0.05
    }));
    heart.position.set(0, -H / 2 + BOX.frontH * 0.5, D / 2 + T / 2);
    g.add(heart);

    return g;
  }

  function mount3D(container, opts) {
    var photos = opts.photos || [];
    var W = container.clientWidth || window.innerWidth;
    var H = container.clientHeight || window.innerHeight;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a0f1c);
    scene.fog = new THREE.Fog(0x2a0f1c, 12, 36);

    var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);

    // The content is about as wide as it is tall; a phone is roughly 1:2. A
    // fixed camera distance that frames it on a laptop crops the edges clean
    // off a 390px screen. So solve for the distance that fits on whichever axis
    // is tighter.
    var MARGIN = 1.09;
    var box3 = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    container.__renderer = renderer;

    scene.add(new THREE.AmbientLight(0xffe4ee, 1.0));
    var key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 8);
    scene.add(key);
    var fill = new THREE.PointLight(PINK, 1.6, 44);
    fill.position.set(-5, 2, 5);
    scene.add(fill);
    // A second, tighter light over the turntable: clearcoat only reads as
    // lacquer if there is a highlight for it to sharpen.
    var gloss = new THREE.PointLight(0xffffff, 1.5, 26);
    scene.add(gloss);

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

      g.userData = {
        src: src,
        index: i,
        // Where this record flies to when the heart forms.
        home: new THREE.Vector3(spot.x, spot.y, ((spot.r + spot.c) % 4) * -0.16),
        tilt: ((i % 5) - 2) * 0.05,
        bob: Math.random() * Math.PI * 2,
        played: false
      };
      g.scale.setScalar(BOX_SCALE);
      root.add(g);
      records.push(g);
    });

    // ---- box and turntable ----
    var boxGroup = buildBox();
    root.add(boxGroup);

    var tt = window.GiftTurntable.build();
    // Tipped toward the camera, or the platter is seen edge-on and the
    // photograph riding it is invisible — which is the whole point of it.
    tt.group.rotation.x = 0.62;
    tt.group.scale.setScalar(0.80);
    root.add(tt.group);

    // ---- the cat ----
    var kitty = buildKitty();
    root.add(kitty);

    // ---- state ----
    var flip = 0;                 // fractional index of the record at the front
    var seated = null;            // the record on the platter
    var mode = 'box';             // 'box' | 'heart'
    var playedCount = 0;
    var reach = 0, reachTarget = 0;

    var X_AXIS = new THREE.Vector3(1, 0, 0);
    var Z_AXIS = new THREE.Vector3(0, 0, 1);
    var Q_FLAT = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);
    var seatPos = new THREE.Vector3();
    var seatQuat = new THREE.Quaternion();
    var tmpV = new THREE.Vector3();
    var tmpQ = new THREE.Quaternion();

    function clampFlip() {
      if (flip < 0) flip = 0;
      if (flip > records.length - 1) flip = records.length - 1;
    }

    /* Home position of record i inside the box, given the current flip.
       Returns the lean, and writes the position into `out`.

       Records recede *and rise*, the way cards stagger in a card index. Stacked
       dead flat they are coaxial with the one in front and a head-on camera
       sees exactly one record; the rise is what makes twenty-nine of them
       legible as twenty-nine. */
    function boxSlot(i, out) {
      var d = i - flip;
      var z, y, rx;
      if (d >= 0) {
        z = Z_FRONT - Math.min(1.7, d * SPACING);
        y = RECORD_Y + Math.min(0.46, d * 0.075);
        rx = 0;
      } else {
        // Flipped past: folded backward, away from the camera, so it clears the
        // sight line to whichever record is now at the front. Leaning them
        // *forward* is what a record-shop bin does, and it walls off the very
        // record you just brought up.
        var back = -d;
        z = Z_FRONT - Math.min(0.72, back * 0.16);
        y = RECORD_Y - Math.min(0.34, back * 0.13);
        rx = -Math.min(0.72, back * 0.42);
      }
      out.set(0, y, z);
      return rx;
    }

    // ---- layout ----
    function reflow() {
      var portrait = camera.aspect < 0.82;
      if (portrait) {
        boxGroup.position.set(0, 1.85, 0);
        tt.group.position.set(0, -1.7, 0.2);
        kitty.userData.baseY = 4.55;
      } else {
        // Kept to one band rather than spread over the frame: the camera fits
        // the whole bounding box, so height spent on empty space is height
        // taken off everything in it.
        boxGroup.position.set(-2.75, -0.5, 0);
        tt.group.position.set(2.45, -0.95, 0);
        kitty.userData.baseY = 1.75;
      }
      // Centred above both in landscape: parked over the box she sat in one
      // corner of the frame and left the opposite one empty.
      kitty.position.set(0, kitty.userData.baseY, 1.6);
      gloss.position.copy(tt.group.position).add(new THREE.Vector3(0.6, 3.2, 3.4));
      // Records are placed against boxGroup.matrixWorld, and the turntable's
      // seat against its own — both stale until this runs.
      root.updateMatrixWorld(true);
      fitCamera();
    }

    // Measure the scene rather than deriving its extent by hand: every tweak to
    // the cat, the box or the turntable otherwise needs the framing constants
    // updated in lockstep, and they silently drift out of agreement.
    function fitCamera() {
      box3.setFromObject(root);
      box3.getSize(size);
      box3.getCenter(mid);

      var vFov = camera.fov * Math.PI / 180;
      var dH = (size.y / 2) / Math.tan(vFov / 2);
      var hHalf = Math.atan(Math.tan(vFov / 2) * camera.aspect);
      var dW = (size.x / 2) / Math.tan(hHalf);
      var d = Math.max(dH, dW) * MARGIN + size.z / 2;

      camera.position.set(0, mid.y, d);
      camera.lookAt(0, mid.y, 0);
      camera.updateProjectionMatrix();
      // Fog is set from the camera distance so the far edge stays just-visible
      // at any framing rather than vanishing on a narrow screen.
      scene.fog.near = d * 0.7;
      scene.fog.far = d * 2.2;
    }

    // ---- interaction ----
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();
    var drag = { on: false, x: 0, y: 0, moved: false, vel: 0, hit: null };

    function castAt(ev, targets) {
      var rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(targets, true);
    }

    // Records are tested first and win outright, rather than letting depth
    // decide. The spindle pokes up through the record's centre hole exactly as
    // a real one does, so nearest-hit would answer "the deck" for a tap aimed
    // squarely at the middle of the photograph.
    function pick(ev) {
      var hits = castAt(ev, records);
      if (hits.length) {
        var o = hits[0].object;
        while (o) {
          if (records.indexOf(o) > -1) return { kind: 'record', record: o };
          o = o.parent;
        }
      }
      return castAt(ev, [tt.group]).length ? { kind: 'player' } : null;
    }

    function playRecord(rec) {
      if (seated === rec) { if (opts.onInspect) opts.onInspect(rec.userData.src); return; }
      if (seated) seated.userData.returning = true;
      seated = rec;
      rec.userData.returning = false;
      if (!rec.userData.played) {
        rec.userData.played = true;
        playedCount++;
      }
      // Snap the browse position to whatever was chosen, so the box does not
      // keep showing a different record as "current" than the one playing.
      flip = rec.userData.index;
      tt.start();
      reachTarget = 1;
      setHint();
      if (opts.onPlay) opts.onPlay(rec.userData.src);
      if (playedCount >= records.length && mode === 'box') later(toHeart, 1400);
    }

    function stopRecord() {
      if (!seated) return;
      seated.userData.returning = true;
      seated = null;
      tt.stop();
      reachTarget = 0;
      setHint();
      if (opts.onStop) opts.onStop();
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
      if (mode !== 'box') { if (Math.abs(dx) > 4) drag.moved = true; drag.x = ev.clientX; return; }
      if (Math.abs(dx) > 4) drag.moved = true;
      // Same coupling the crate used for its spin, retargeted at the flip so
      // the momentum feel carries over rather than being re-invented.
      drag.vel = -dx * 0.010;
      flip += -dx * 0.020;
      clampFlip();
      drag.x = ev.clientX;
      drag.y = ev.clientY;
    }

    function onUp() {
      if (!drag.on) return;
      drag.on = false;
      if (drag.moved || !drag.hit) return;
      if (mode === 'heart') {
        if (drag.hit.kind === 'record' && opts.onInspect) opts.onInspect(drag.hit.record.userData.src);
        return;
      }
      if (drag.hit.kind === 'player') { stopRecord(); return; }
      playRecord(drag.hit.record);
    }

    var dom = renderer.domElement;
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // ---- the finale ----
    function toHeart() {
      if (mode === 'heart') return;
      mode = 'heart';
      stopRecord();
      // Removed rather than hidden: Box3.setFromObject walks invisible children
      // too, so hiding them would leave the camera framed around empty space.
      root.remove(boxGroup);
      root.remove(tt.group);
      kitty.userData.baseY = camera.aspect < 0.82 ? 5.6 : 5.0;
      setHint();
      if (heartBtn) heartBtn.style.display = 'none';
      later(fitCamera, 900);
    }

    // ---- hint and buttons ----
    var hint = document.getElementById('crateHint');
    function setHint() {
      if (!hint) return;
      if (mode === 'heart') hint.textContent = 'twenty-nine of them · tap any one to see it';
      else if (seated) hint.textContent = 'tap it again to see it · tap the deck to stop';
      else if (playedCount === 0) hint.textContent = 'drag to flip through · tap one to play it';
      else hint.textContent = playedCount + ' of ' + records.length + ' played';
    }
    setHint();

    var timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'one more thing →';
    next.style.cssText = 'position:absolute;left:50%;bottom:3.5vh;transform:translateX(-50%);z-index:50';
    next.addEventListener('click', function () { if (opts.onDone) opts.onDone(); });
    container.appendChild(next);

    // An escape hatch to the finale, so the heart is not locked behind
    // twenty-nine taps. A gift should never hold someone hostage to its own
    // completion state.
    var heartBtn = document.createElement('button');
    heartBtn.className = 'letter-next crate-heart-btn';
    heartBtn.textContent = 'make the heart ♥';
    heartBtn.style.cssText = 'position:absolute;left:50%;bottom:10vh;transform:translateX(-50%);z-index:50;opacity:0;pointer-events:none;transition:opacity 600ms ease';
    heartBtn.addEventListener('click', function () { toHeart(); });
    container.appendChild(heartBtn);

    // ---- loop ----
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var clock = new THREE.Clock();
    var raf = null;
    var running = true;

    function frame() {
      raf = requestAnimationFrame(frame);
      // Generous clamp: the smoothing below is unconditionally stable, so the
      // cap is only there to stop a backgrounded tab resuming with one huge step.
      var dt = Math.min(clock.getDelta(), 0.1);
      var t = clock.elapsedTime;

      if (mode === 'box' && !drag.on) {
        flip += drag.vel;
        drag.vel *= 0.90;
        // Settle onto a whole record rather than resting between two.
        if (Math.abs(drag.vel) < 0.004) {
          drag.vel = 0;
          flip += (Math.round(flip) - flip) * decay(7, dt);
        }
        clampFlip();
      }

      reach += (reachTarget - reach) * (reduce ? 1 : decay(4.5, dt));
      tt.update(dt, reduce);

      if (mode === 'box') {
        tt.seatWorld(seatPos);
        tt.platter.getWorldQuaternion(tmpQ);
        seatQuat.copy(tmpQ).multiply(Q_FLAT);
      }

      records.forEach(function (r) {
        var u = r.userData;

        if (mode === 'heart') {
          r.position.lerp(u.home, reduce ? 1 : decay(2.6, dt));
          r.scale.lerp(tmpV.setScalar(HEART_SCALE), reduce ? 1 : decay(2.6, dt));
          tmpQ.setFromAxisAngle(Z_AXIS, u.tilt);
          r.quaternion.slerp(tmpQ, reduce ? 1 : decay(3.2, dt));
          if (!reduce) r.position.y = u.home.y + Math.sin(t * 0.9 + u.bob) * 0.045;
          return;
        }

        if (r === seated) {
          r.position.lerp(seatPos, reduce ? 1 : decay(4.2, dt));
          r.scale.lerp(tmpV.setScalar(PLAY_SCALE), reduce ? 1 : decay(4.2, dt));
          r.quaternion.slerp(seatQuat, reduce ? 1 : decay(4.2, dt));
          return;
        }

        var rx = boxSlot(u.index, tmpV);
        tmpV.applyMatrix4(boxGroup.matrixWorld);
        var d = u.index - flip;
        var current = !drag.on && Math.abs(d) < 0.5;
        if (current) tmpV.y += 0.06;
        r.position.lerp(tmpV, reduce ? 1 : decay(u.returning ? 3.6 : 8, dt));
        // Shrinking with depth does the rest of the work the rise starts: it
        // reads as distance rather than as a smaller record.
        var deep = d > 0 ? Math.min(0.22, d * 0.022) : 0;
        var want = BOX_SCALE * (current ? 1.09 : 1 - deep);
        r.scale.lerp(tmpV.setScalar(want), reduce ? 1 : decay(8, dt));
        // Back to upright, plus the lean the slot asks for.
        tmpQ.setFromAxisAngle(X_AXIS, rx);
        r.quaternion.slerp(tmpQ, reduce ? 1 : decay(8, dt));
        if (Math.abs(d) > 0.6) u.returning = false;
      });

      if (playedCount > 0 && mode === 'box' && heartBtn.style.opacity !== '1') {
        heartBtn.style.opacity = '1';
        heartBtn.style.pointerEvents = 'auto';
      }

      animateKitty(kitty, t, reach, seated, reduce);
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
    // Seed every record at its slot so the first frame is composed rather than
    // a pile at the origin easing outward.
    records.forEach(function (r) {
      var rx = boxSlot(r.userData.index, tmpV);
      r.position.copy(tmpV.applyMatrix4(boxGroup.matrixWorld));
      r.quaternion.setFromAxisAngle(X_AXIS, rx);
    });
    frame();

    if (window.__GIFT_DEBUG) {
      window.__dbgRoot = root; window.__dbgCam = camera;
      window.__dbgBox = boxGroup; window.__dbgTT = tt; window.__dbgKitty = kitty;
    }

    ctx = {
      pause: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      resume: function () { running = true; if (!raf) { clock.getDelta(); frame(); } },
      // Verification hooks: the walkthrough drives these rather than guessing
      // at pixel coordinates for a record that is mid-flip.
      flipTo: function (i) { flip = i; drag.vel = 0; clampFlip(); },
      play: function (i) { playRecord(records[i]); },
      stop: stopRecord,
      heart: toHeart,
      /** Client coordinates of the record on the platter, so the walkthrough
          can tap the real thing rather than guess at the container centre. */
      seatScreen: function () {
        if (!seated) return null;
        var rect = renderer.domElement.getBoundingClientRect();
        var p = seated.getWorldPosition(new THREE.Vector3()).project(camera);
        return {
          x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-p.y * 0.5 + 0.5) * rect.height
        };
      },
      state: function () {
        return {
          mode: mode, flip: flip, played: playedCount,
          seated: seated ? seated.userData.index : -1,
          platter: tt.platter.rotation.y,
          playing: tt.isPlaying(),
          atHome: records.filter(function (r) {
            return r.position.distanceTo(r.userData.home) < 0.4;
          }).length
        };
      }
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
    g.userData.baseY = 2.05;
    g.scale.setScalar(0.55);
    return g;
  }

  function animateKitty(k, t, reach, held, reduce) {
    if (!reduce) {
      k.position.y = (k.userData.baseY || 3.4) + Math.sin(t * 1.1) * 0.14;
      k.rotation.z = Math.sin(t * 0.7) * 0.035;
    }
    var arms = k.userData.arms || [];
    arms.forEach(function (a, i) {
      // Arms hang straight down at rotation.x = 0. Swinging them past
      // horizontal points them at the camera and reads as nothing at all, so
      // the reach is a shallow forward tip plus a spread outward — the shape of
      // someone leaning down into a box, seen from the front.
      var idle = reduce ? 0 : Math.sin(t * 1.3 + i * Math.PI) * 0.1;
      var tx = idle + reach * 0.62;
      var tz = a.userData.side * (0.18 + reach * 0.62);
      a.rotation.x += (tx - a.rotation.x) * 0.12;
      a.rotation.z += (tz - a.rotation.z) * 0.12;
    });
  }

  /* -- 2D fallback ----------------------------------------------------------
     No WebGL, so no scene — but the two gestures survive: flip through a stack
     of records, tap one, watch it turn on a pink deck. Everything here is DOM
     and CSS transforms. */
  function mount2D(container, opts) {
    var photos = opts.photos || [];

    var wrap = document.createElement('div');
    wrap.className = 'flat';
    container.appendChild(wrap);

    var bin = document.createElement('div');
    bin.className = 'flat-bin';
    wrap.appendChild(bin);

    var deck = document.createElement('div');
    deck.className = 'flat-deck';
    deck.innerHTML =
      '<div class="flat-platter"><div class="flat-disc" id="flatDisc">' +
        '<div class="flat-label" id="flatLabel"></div><div class="flat-hole"></div>' +
      '</div></div>' +
      '<div class="flat-arm"><i></i></div>';
    wrap.appendChild(deck);

    // The box. Drawn behind the stack so the records stand up out of it, with
    // the same heart the WebGL box carries embossed on its front.
    var carton = document.createElement('div');
    carton.className = 'flat-box';
    carton.innerHTML = '<svg viewBox="0 0 24 22" class="flat-box-heart">' +
      '<use href="#heart" color="#ff8fb0"/></svg>';
    bin.appendChild(carton);

    var stack = document.createElement('div');
    stack.className = 'flat-stack';
    bin.appendChild(stack);

    var heart = document.createElement('div');
    heart.className = 'flat-heart';
    bin.appendChild(heart);

    var disc = deck.querySelector('#flatDisc');
    var label = deck.querySelector('#flatLabel');
    var cards = [];
    var flip = 0, playing = -1, played = {}, playedCount = 0, mode = 'bin';

    photos.forEach(function (src, i) {
      var c = document.createElement('div');
      c.className = 'flat-card';
      var img = document.createElement('img');
      img.src = src;
      img.draggable = false;
      c.appendChild(img);
      stack.appendChild(c);
      cards.push(c);
      c.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mode !== 'bin') { if (opts.onInspect) opts.onInspect(src); return; }
        play(i);
      });
    });

    function paint() {
      if (mode === 'heart') return;
      cards.forEach(function (c, i) {
        var d = i - flip;
        // Only the near neighbours are drawn. Twenty-nine overlapping circles
        // is a blob, not a stack.
        if (d < -2.5 || d > 9) { c.style.display = 'none'; return; }
        c.style.display = '';
        var up, scale, dim;
        if (d < 0) {
          // Filed away: sunk below the front card and dimmed out of the way.
          var back = Math.min(2.5, -d);
          up = back * 9;
          scale = 1 - back * 0.07;
          dim = 0.55 - back * 0.16;
          c.style.zIndex = 1;
        } else {
          up = -Math.min(96, d * 15);
          scale = Math.max(0.58, 1 - d * 0.058);
          dim = d > 7 ? 0 : 1;
          c.style.zIndex = 40 - Math.round(d);
        }
        c.style.transform = 'translate3d(0,' + up + 'px,0) scale(' + scale + ')';
        c.style.opacity = Math.max(0, dim);
        c.style.filter = d > 0.5 ? 'brightness(' + Math.max(0.45, 1 - d * 0.09) + ')' : 'none';
      });
    }

    function play(i) {
      if (playing === i) { if (opts.onInspect) opts.onInspect(photos[i]); return; }
      playing = i;
      flip = i;
      if (!played[i]) { played[i] = true; playedCount++; }
      label.style.backgroundImage = 'url("' + photos[i] + '")';
      deck.classList.add('on');
      paint();
      setHint();
      if (opts.onPlay) opts.onPlay(photos[i]);
      if (playedCount >= photos.length && mode === 'bin') setTimeout(toHeart, 1200);
    }

    function stop() {
      playing = -1;
      deck.classList.remove('on');
      setHint();
      if (opts.onStop) opts.onStop();
    }

    deck.addEventListener('click', function () { if (playing > -1) stop(); });

    disc.addEventListener('click', function (e) {
      e.stopPropagation();
      if (playing > -1 && opts.onInspect) opts.onInspect(photos[playing]);
    });

    function toHeart() {
      if (mode === 'heart') return;
      mode = 'heart';
      stop();
      deck.style.display = 'none';
      carton.style.display = 'none';
      // The deck's gone, so the bin gets the room it was leaving for it.
      wrap.classList.add('is-heart');
      var MASK2 = [[0,1,2,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[1,2,3,4,5],[2,3,4],[3]];
      var slots = [];
      MASK2.forEach(function (cols, r) { cols.forEach(function (c) { slots.push({ r: r, c: c }); }); });
      cards.forEach(function (c, i) {
        var s = slots[i % slots.length];
        c.style.display = '';
        c.className = 'flat-card in-heart';
        c.style.left = (s.c * (100 / 7) + 1.2) + '%';
        c.style.top = (s.r * (100 / 6) + 1.2) + '%';
        c.style.transitionDelay = (i * 34) + 'ms';
        c.style.transform = 'none';
        c.style.opacity = '1';
        c.style.filter = 'none';
        c.style.zIndex = 1;
      });
      heart.classList.add('on');
      if (heartBtn) heartBtn.style.display = 'none';
      setHint();
    }

    // Drag to flip, with the same 4px threshold the rest of the piece uses.
    var d = null;
    bin.addEventListener('pointerdown', function (e) {
      d = { x: e.clientX, moved: false };
      try { bin.setPointerCapture(e.pointerId); } catch (err) {}
    });
    bin.addEventListener('pointermove', function (e) {
      if (!d || mode !== 'bin') return;
      var dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      flip = Math.max(0, Math.min(cards.length - 1, flip - dx * 0.055));
      d.x = e.clientX;
      paint();
    });
    function end() {
      if (!d) return;
      if (d.moved) flip = Math.round(flip);
      d = null;
      paint();
    }
    bin.addEventListener('pointerup', end);
    bin.addEventListener('pointercancel', end);

    var hint = document.getElementById('crateHint');
    function setHint() {
      if (!hint) return;
      if (mode === 'heart') hint.textContent = 'twenty-nine of them · tap any one to see it';
      else if (playing > -1) hint.textContent = 'tap the record to see it · tap the deck to stop';
      else if (playedCount === 0) hint.textContent = 'drag to flip through · tap one to play it';
      else hint.textContent = playedCount + ' of ' + cards.length + ' played';
    }

    var next = document.createElement('button');
    next.className = 'letter-next';
    next.textContent = 'one more thing →';
    next.style.cssText = 'position:absolute;left:50%;bottom:3.5vh;transform:translateX(-50%);z-index:50';
    next.addEventListener('click', function () { if (opts.onDone) opts.onDone(); });
    container.appendChild(next);

    var heartBtn = document.createElement('button');
    heartBtn.className = 'letter-next crate-heart-btn';
    heartBtn.textContent = 'make the heart ♥';
    heartBtn.style.cssText = 'position:absolute;left:50%;bottom:10vh;transform:translateX(-50%);z-index:50';
    heartBtn.addEventListener('click', toHeart);
    container.appendChild(heartBtn);

    paint();
    setHint();

    ctx = {
      pause: function () {}, resume: function () {},
      flipTo: function (i) { flip = i; paint(); },
      play: play, stop: stop, heart: toHeart,
      state: function () {
        var placed = 0;
        cards.forEach(function (c) {
          if (c.classList.contains('in-heart') && c.getBoundingClientRect().width > 4) placed++;
        });
        return {
          mode: mode, flip: flip, played: playedCount, seated: playing,
          playing: playing > -1, flat: true, atHome: placed
        };
      }
    };
    return ctx;
  }

  function pause() { if (ctx && ctx.pause) ctx.pause(); }
  function resume() { if (ctx && ctx.resume) ctx.resume(); }

  /** The live scene controls, for the verification walkthrough. Driving the box
      by index beats guessing at pixel coordinates for a record mid-flip. */
  api.ctl = function () { return ctx; };

  window.GiftCrate = api;
})();
