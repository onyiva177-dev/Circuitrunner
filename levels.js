/* ============================================================
   LEVELS — grid builders + 30+ level definitions
   Each level is built from a small "path script" (a sequence of
   forward/turn moves with a colour attached to every cell the
   robot visits). The builder walks the script once to lay out
   the grid, then trims it to a tight bounding box.
   ============================================================ */
(function (root) {
  "use strict";

  var DIRS = {
    up: { dx: 0, dy: -1 },
    right: { dx: 1, dy: 0 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }
  };
  var ORDER = ["up", "right", "down", "left"];
  function right(d) { return ORDER[(ORDER.indexOf(d) + 1) % 4]; }
  function left(d) { return ORDER[(ORDER.indexOf(d) + 3) % 4]; }

  // ---- generic path -> grid builder -------------------------------------
  function buildFromScript(startColor, startDir, moves) {
    var x = 0, y = 0, dir = startDir;
    var cells = {}; // "x,y" -> color
    cells[x + "," + y] = startColor;
    moves.forEach(function (m) {
      if (m.t === "left") { dir = left(dir); return; }
      if (m.t === "right") { dir = right(dir); return; }
      var d = DIRS[dir];
      x += d.dx; y += d.dy;
      cells[x + "," + y] = m.color;
    });
    var lastX = x, lastY = y;

    var xs = [], ys = [];
    Object.keys(cells).forEach(function (k) {
      var p = k.split(",");
      xs.push(parseInt(p[0], 10));
      ys.push(parseInt(p[1], 10));
    });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var pad = 1;
    var width = maxX - minX + 1 + pad * 2;
    var height = maxY - minY + 1 + pad * 2;

    var grid = [];
    for (var yy = 0; yy < height; yy++) {
      grid.push(new Array(width).fill(null));
    }
    Object.keys(cells).forEach(function (k) {
      var p = k.split(",");
      var gx = parseInt(p[0], 10) - minX + pad;
      var gy = parseInt(p[1], 10) - minY + pad;
      grid[gy][gx] = { color: cells[k], star: false };
    });
    var startGX = 0 - minX + pad;
    var startGY = 0 - minY + pad;
    var starGX = lastX - minX + pad;
    var starGY = lastY - minY + pad;
    grid[starGY][starGX].star = true;

    return {
      width: width,
      height: height,
      grid: grid,
      start: { x: startGX, y: startGY, dir: startDir },
      pathLength: Object.keys(cells).length
    };
  }

  function slotsFor(n) {
    return { F1: n, F2: n, F3: n };
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (a) { if (!seen[a]) { seen[a] = 1; out.push(a); } });
    return out;
  }

  // ---- Family A: straight, colour-alternating corridor -------------------
  // Universal solution for ANY colour sequence in a straight line:
  // every colour's function = [Forward, CallF1, CallF2, CallF3]
  function familyStraight(id, name, segments, dir, slotCount) {
    var moves = [];
    var first = true;
    segments.forEach(function (seg) {
      for (var k = 0; k < seg.len; k++) {
        if (first) { first = false; continue; } // skip: this is the start cell
        moves.push({ t: "fwd", color: seg.color });
      }
    });
    var startColor = segments[0].color;
    var built = buildFromScript(startColor, dir, moves);
    var used = uniq(segments.map(function (s) { return s.color; }));
    var bound = built.pathLength + 2;
    var body = function () {
      return [
        { op: "fwd", limit: null },
        { op: "f1", limit: bound },
        { op: "f2", limit: bound },
        { op: "f3", limit: bound }
      ];
    };
    var solution = { F1: body(), F2: body(), F3: body() };
    var slots = slotsFor(Math.max(4, slotCount || 4));
    return finalize(id, name, built, slots, solution, used);
  }

  // ---- Family B: zigzag staircase -----------------------------------------
  // Pattern repeats identically every step, so ONE recursive function does
  // the whole thing: Forward, Turn, Forward, Turn-back, CallSelf(limit)
  function familyZigzag(id, name, depth, color, turnDir, slotCount) {
    var moves = [];
    for (var i = 0; i < depth; i++) {
      moves.push({ t: "fwd", color: color });
      moves.push({ t: turnDir });
      moves.push({ t: "fwd", color: color });
      moves.push({ t: turnDir === "right" ? "left" : "right" });
    }
    moves.pop(); // drop the final redundant turn-back
    var built = buildFromScript(color, "up", moves);
    var slots = slotsFor(Math.max(5, slotCount || 5));

    // The recursive step must call whichever function's colour matches the
    // path (F1=purple, F2=teal, F3=orange) — F1 is only the *unconditional
    // entry point*, its colour tag is always "purple" regardless of what
    // colour the level actually uses.
    var opForColor = { purple: "f1", teal: "f2", orange: "f3" };
    var selfOp = opForColor[color];
    var body = [
      { op: "fwd", limit: null },
      { op: turnDir, limit: null },
      { op: "fwd", limit: null },
      { op: turnDir === "right" ? "left" : "right", limit: null },
      { op: selfOp, limit: depth + 1 }
    ];
    var solution = {
      F1: body.slice(), // always runs first (unconditional entry)
      F2: new Array(slots.F2).fill(null),
      F3: new Array(slots.F3).fill(null)
    };
    if (selfOp === "f2") solution.F2 = body.slice();
    if (selfOp === "f3") solution.F3 = body.slice();
    return finalize(id, name, built, slots, solution, [color]);
  }

  function finalize(id, name, built, slots, solution, usedColors) {
    return {
      id: id,
      name: name,
      width: built.width,
      height: built.height,
      grid: built.grid,
      start: built.start,
      slots: slots,
      usedColors: usedColors,
      _solution: solution // reference solution, used only by the verifier
    };
  }

  // ---- hand-authored tutorial levels (1-4) --------------------------------
  function handLevel1() {
    var built = buildFromScript("purple", "right", [
      { t: "fwd", color: "purple" },
      { t: "fwd", color: "purple" },
      { t: "fwd", color: "purple" }
    ]);
    var solution = {
      F1: [
        { op: "fwd", limit: null },
        { op: "fwd", limit: null },
        { op: "fwd", limit: null },
        null
      ],
      F2: [null, null, null, null],
      F3: [null, null, null, null]
    };
    return finalize(1, "First Steps", built, slotsFor(4), solution, ["purple"]);
  }

  function handLevel2() {
    var built = buildFromScript("purple", "right", [
      { t: "fwd", color: "purple" },
      { t: "fwd", color: "purple" },
      { t: "right" },
      { t: "fwd", color: "purple" },
      { t: "fwd", color: "purple" }
    ]);
    var solution = {
      F1: [
        { op: "fwd", limit: null },
        { op: "fwd", limit: null },
        { op: "right", limit: null },
        { op: "fwd", limit: null },
        { op: "fwd", limit: null }
      ],
      F2: [null, null, null, null, null],
      F3: [null, null, null, null, null]
    };
    return finalize(2, "Turning Point", built, slotsFor(5), solution, ["purple"]);
  }

  function handLevel3() {
    var built = buildFromScript("purple", "right", [
      { t: "fwd", color: "teal" },
      { t: "fwd", color: "teal" },
      { t: "fwd", color: "purple" }
    ]);
    var solution = {
      F1: [
        { op: "fwd", limit: null },
        { op: "f2", limit: 3 },
        { op: "fwd", limit: null },
        null
      ],
      F2: [
        { op: "fwd", limit: null },
        { op: "f2", limit: 2 },
        { op: "f1", limit: 3 },
        null
      ],
      F3: [null, null, null, null]
    };
    return finalize(3, "Two Colours", built, slotsFor(4), solution, ["purple", "teal"]);
  }

  function handLevel4() {
    // forces the loop: 9-cell single colour hallway, only 3 slots
    var moves = [];
    for (var i = 0; i < 8; i++) moves.push({ t: "fwd", color: "purple" });
    var built = buildFromScript("purple", "up", moves);
    var solution = {
      F1: [
        { op: "fwd", limit: null },
        { op: "f1", limit: 8 },
        null
      ],
      F2: [null, null, null],
      F3: [null, null, null]
    };
    return finalize(4, "The Loop", built, slotsFor(3), solution, ["purple"]);
  }

  // ---- procedural level plan (5..32) --------------------------------------
  function buildProceduralLevels() {
    var levels = [];
    var id = 5;
    var colorCycle = ["purple", "teal", "orange"];
    var dirCycle = ["right", "up", "right", "up"];

    while (id <= 32) {
      var n = id; // difficulty index
      var useZigzag = n % 2 === 0; // alternate families for variety

      if (useZigzag) {
        var depth = 2 + Math.floor((n - 4) / 2);
        depth = Math.min(depth, 16);
        var color = colorCycle[n % 3];
        var turnDir = n % 4 < 2 ? "right" : "left";
        var slotCount = Math.min(5 + Math.floor(n / 10), 6);
        levels.push(
          familyZigzag(id, "Staircase " + depth, depth, color, turnDir, slotCount)
        );
      } else {
        var numColors = n < 9 ? 2 : n < 18 ? 2 : 3;
        var segCount = Math.min(2 + Math.floor(n / 4), numColors === 2 ? 7 : 11);
        var segLen = Math.max(2, 6 - Math.floor(n / 6));
        var segments = [];
        for (var s = 0; s < segCount; s++) {
          var c = colorCycle[s % numColors];
          var len = segLen + (s === 0 ? 1 : 0);
          segments.push({ color: c, len: len });
        }
        var dir = dirCycle[Math.floor(n / 3) % dirCycle.length];
        var slotCount2 = Math.min(4 + Math.floor(n / 8), 5);
        levels.push(
          familyStraight(
            id,
            "Corridor " + segCount + "\u00d7" + numColors,
            segments,
            dir,
            slotCount2
          )
        );
      }
      id++;
    }
    return levels;
  }

  var LEVELS = [handLevel1(), handLevel2(), handLevel3(), handLevel4()].concat(
    buildProceduralLevels()
  );

  var Levels = { LEVELS: LEVELS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Levels;
  } else {
    root.Levels = Levels;
  }
})(typeof window !== "undefined" ? window : global);
