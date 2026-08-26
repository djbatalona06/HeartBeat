/* ============================================================================
   The record player.

   Pink, polished, and built from primitives like everything else in this scene
   — no model files, no textures. The plinth is a rounded rectangle extruded
   with a bevel, which is the only way to get a soft edge out of three.js core;
   BoxGeometry has hard corners and reads as a brick.

   It exposes a small surface to crate.js rather than owning any interaction:
   the crate decides which record is playing, this decides what a record player
   looks like while it does.
   ========================================================================== */
(function () {
  'use strict';

  var PINK = 0xff8fb0, DEEP = 0xe2467a, RED = 0xd81f45, CREAM = 0xfffdfa, GOLD = 0xf5c85c;

  // 33⅓ rpm, the speed an LP actually turns: 100/3 revolutions per minute is
  // 0.5555 per second, and a revolution is 2π.
  var RPM_33 = (100 / 3) / 60 * Math.PI * 2;   // ≈ 3.491 rad/s

  // Tonearm angles about the pivot, solved for a 2.4-long arm whose pivot sits
  // 2.667 from the platter centre. Rest is clear of the record, PLAY_IN lands
  // on the outer groove at r≈1.42, PLAY_OUT tracks in to the label.
  var ARM_LEN = 2.4;
  var A_REST = -0.30, A_PLAY_IN = -0.03, A_PLAY_OUT = 0.42;
  var CUE_UP = 0.13;                            // arm lift, radians about Z

  var PLATTER = { x: -0.55, z: 0, r: 1.62 };
  var PIVOT = { x: 1.75, y: 0.42, z: -1.35 };

  /* Rounded rectangle as a Shape, so ExtrudeGeometry can bevel it. */
  function roundedRect(w, h, r) {
    var s = new THREE.Shape();
    var x = w / 2, y = h / 2;
    s.moveTo(-x + r, -y);
    s.lineTo(x - r, -y);
    s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r);
    s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y);
    s.quadraticCurveTo(-x, y, -x, y - r);
    s.lineTo(-x, -y + r);
    s.quadraticCurveTo(-x, -y, -x + r, -y);
    return s;
  }

  /* A slab lying in the XZ plane with its top face at y = 0. Extrude builds
     along +Z, so it is tipped back a quarter turn and pushed down by its own
     depth. */
  function slab(w, d, thick, radius, material) {
    var geo = new THREE.ExtrudeGeometry(roundedRect(w, d, radius), {
      depth: thick,
      bevelEnabled: true,
      bevelThickness: Math.min(0.05, thick * 0.35),
      bevelSize: 0.05,
      bevelSegments: 3,
      curveSegments: 10
    });
    geo.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(geo, material);
    m.position.y = -thick;
    return m;
  }

  function build() {
    var g = new THREE.Group();

    // "Polished" is clearcoat: a second specular lobe over the base colour, the
    // difference between painted plastic and lacquer.
    var shell = new THREE.MeshPhysicalMaterial({
      color: PINK, roughness: 0.22, metalness: 0.04,
      clearcoat: 1, clearcoatRoughness: 0.04
    });
    var deck = new THREE.MeshPhysicalMaterial({
      color: 0xffa7c2, roughness: 0.18, metalness: 0.04,
      clearcoat: 1, clearcoatRoughness: 0.03
    });
    var chrome = new THREE.MeshStandardMaterial({ color: 0xf6e2e9, roughness: 0.24, metalness: 0.85 });
    var felt = new THREE.MeshStandardMaterial({ color: DEEP, roughness: 0.96, metalness: 0 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x3d1626, roughness: 0.7 });

    // ---- plinth ----
    var body = slab(5.4, 4.1, 0.62, 0.34, shell);
    g.add(body);
    var top = slab(5.06, 3.78, 0.06, 0.28, deck);
    top.position.y = 0.03;
    g.add(top);

    // ---- platter ----
    var platter = new THREE.Group();
    platter.position.set(PLATTER.x, 0.1, PLATTER.z);
    g.add(platter);

    var disc = new THREE.Mesh(new THREE.CylinderGeometry(PLATTER.r, PLATTER.r, 0.18, 56), chrome);
    disc.position.y = 0.09;
    platter.add(disc);
    var mat = new THREE.Mesh(new THREE.CylinderGeometry(PLATTER.r - 0.11, PLATTER.r - 0.11, 0.03, 56), felt);
    mat.position.y = 0.19;
    platter.add(mat);
    // Strobe dots around the rim. They are why a turntable reads as a
    // turntable, and because they ride the platter they make the spin legible
    // even when the record's own label is close to radially symmetric.
    for (var i = 0; i < 36; i++) {
      var a = (i / 36) * Math.PI * 2;
      var dot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.11), i % 3 === 0 ? felt : dark);
      dot.position.set(Math.cos(a) * (PLATTER.r - 0.05), 0.185, Math.sin(a) * (PLATTER.r - 0.05));
      dot.rotation.y = -a;
      platter.add(dot);
    }

    var spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 14), chrome);
    spindle.position.y = 0.38;
    platter.add(spindle);

    // ---- tonearm ----
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.3, 24), chrome);
    base.position.set(PIVOT.x, 0.15, PIVOT.z);
    g.add(base);

    var yaw = new THREE.Group();                 // swings the arm across the record
    yaw.position.set(PIVOT.x, PIVOT.y, PIVOT.z);
    g.add(yaw);

    var cue = new THREE.Group();                 // raises and lowers it
    yaw.add(cue);

    // Laid along -X from the pivot, so yaw.rotation.y sweeps it toward the
    // platter. Capsules rather than boxes: a tonearm is a tube.
    var tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, ARM_LEN - 0.5, 6, 12), chrome);
    tube.rotation.z = Math.PI / 2;
    tube.position.x = -ARM_LEN * 0.52;
    cue.add(tube);

    var weight = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.3, 20), dark);
    weight.rotation.z = Math.PI / 2;
    weight.position.x = 0.34;
    cue.add(weight);

    var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.19), new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5 }));
    head.position.set(-ARM_LEN + 0.1, -0.06, 0);
    cue.add(head);

    var stylus = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 10), chrome);
    stylus.position.set(-ARM_LEN + 0.02, -0.19, 0);
    stylus.rotation.x = Math.PI;
    cue.add(stylus);

    // The rest the arm parks on, placed where the headshell actually lands.
    var rest = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 12), chrome);
    rest.position.set(PIVOT.x - ARM_LEN * Math.cos(A_REST), 0.15, PIVOT.z - ARM_LEN * Math.sin(-A_REST));
    g.add(rest);

    // ---- pitch slider and power lamp ----
    var wellMat = new THREE.MeshStandardMaterial({ color: 0xd98aa6, roughness: 0.55 });
    var well = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 1.5), wellMat);
    well.position.set(2.05, 0.05, 1.15);
    g.add(well);
    var knob = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.2), chrome);
    knob.position.set(2.05, 0.11, 1.15);
    g.add(knob);

    var lampMat = new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0x000000, roughness: 0.3 });
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), lampMat);
    lamp.position.set(-2.25, 0.09, 1.5);
    g.add(lamp);

    // A bow on the front-left corner, the same mark the seal and the cat wear.
    var bow = new THREE.Group();
    var bowMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.45 });
    [-1, 1].forEach(function (s) {
      var lobe = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 3), bowMat);
      lobe.position.x = s * 0.19;
      lobe.rotation.z = s * Math.PI / 2;
      bow.add(lobe);
    });
    bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2578a, roughness: 0.4 })));
    bow.position.set(-2.25, 0.1, -1.55);
    bow.rotation.x = -Math.PI / 2;
    g.add(bow);

    // ---- state ----
    var spin = 0;              // platter angle
    var speed = 0;             // rad/s, eases up to RPM_33 like a real motor
    var playing = false;
    var armT = 0;              // 0 at rest, 1 fully across the record
    var track = 0;             // 0..1 progress from outer groove to label
    var lift = 1;              // 1 raised, 0 dropped

    // Top of the felt (platter group at y=0.1, mat top at 0.205 local) plus half
    // a record's thickness at playing scale, so the disc rests on the mat
    // rather than sinking into it.
    var seatLocal = new THREE.Vector3(PLATTER.x, 0.33, PLATTER.z);

    // Frame-rate independent, for the same reason the records are: a fixed
    // per-frame fraction makes the arm swing at whatever speed the machine
    // happens to render.
    function decay(rate, dt) { return 1 - Math.exp(-rate * dt); }

    function update(dt, reduce) {
      var wantArm = playing ? 1 : 0;
      var wantLift = playing ? 0 : 1;
      var k = reduce ? 1 : decay(3.4, dt);
      armT += (wantArm - armT) * k;
      lift += (wantLift - lift) * k;

      if (playing) {
        speed += (RPM_33 - speed) * (reduce ? 1 : decay(2.2, dt));
        // A side is ~22 minutes; nobody will sit through it, but the arm should
        // visibly creep inward rather than park at one radius forever.
        track = Math.min(1, track + dt / 90);
      } else {
        speed += (0 - speed) * (reduce ? 1 : decay(1.6, dt));
        track += (0 - track) * (reduce ? 1 : decay(2, dt));
      }

      if (reduce) speed = playing ? RPM_33 : 0;
      spin += speed * dt;
      platter.rotation.y = spin;

      var play = A_PLAY_IN + (A_PLAY_OUT - A_PLAY_IN) * track;
      yaw.rotation.y = A_REST + (play - A_REST) * armT;
      cue.rotation.z = CUE_UP * lift;
      lampMat.emissive.setHex(playing ? 0x6b4a10 : 0x000000);
    }

    return {
      group: g,
      platter: platter,
      /** Where a record's centre sits once it is on the platter, in g's space. */
      seatLocal: seatLocal,
      /** World-space seat point, written into `out`. */
      seatWorld: function (out) {
        g.updateWorldMatrix(true, false);
        return out.copy(seatLocal).applyMatrix4(g.matrixWorld);
      },
      start: function () { playing = true; track = 0; },
      stop: function () { playing = false; },
      isPlaying: function () { return playing; },
      /** True once the platter is actually up to speed — the cue for audio. */
      atSpeed: function () { return speed > RPM_33 * 0.9; },
      update: update
    };
  }

  window.GiftTurntable = { build: build, RPM_33: RPM_33 };
})();
