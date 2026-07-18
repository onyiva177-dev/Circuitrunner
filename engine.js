/* ============================================================
   ENGINE — grid + robot + program interpreter
   Pure logic, no DOM. Works in browser (window.Engine) and Node
   (module.exports) so it can be unit-tested from the command line.
   ============================================================ */
(function (root) {
  "use strict";

  var COLORS = ["purple", "teal", "orange"];
  var FN_FOR_COLOR = { purple: "F1", teal: "F2", orange: "F3" };
  var COLOR_FOR_FN = { F1: "purple", F2: "teal", F3: "orange" };
  var OP_FOR_FN = { F1: "f1", F2: "f2", F3: "f3" };

  var DIRS = {
    up: { dx: 0, dy: -1 },
    right: { dx: 1, dy: 0 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }
  };
  var DIR_ORDER = ["up", "right", "down", "left"];

  function turnRight(dir) {
    var i = DIR_ORDER.indexOf(dir);
    return DIR_ORDER[(i + 1) % 4];
  }
  function turnLeft(dir) {
    var i = DIR_ORDER.indexOf(dir);
    return DIR_ORDER[(i + 3) % 4];
  }

  function tileAt(level, x, y) {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
    return level.grid[y][x] || null; // null = void
  }

  function cloneProgram(program) {
    var out = {};
    ["F1", "F2", "F3"].forEach(function (fn) {
      out[fn] = program[fn].map(function (slot) {
        return slot ? { op: slot.op, limit: slot.limit } : null;
      });
    });
    return out;
  }

  function emptyProgram(slotCounts) {
    var out = {};
    ["F1", "F2", "F3"].forEach(function (fn) {
      out[fn] = new Array(slotCounts[fn] || 0).fill(null);
    });
    return out;
  }

  // ----------------------------------------------------------
  // Interpreter — explicit stack machine, step()-able
  // ----------------------------------------------------------
  function Interpreter(level, program) {
    this.level = level;
    this.program = cloneProgram(program);
    this.robot = { x: level.start.x, y: level.start.y, dir: level.start.dir };
    this.callStack = [{ fn: "F1", pc: 0 }];
    this.status = "running"; // running | won | dead | empty | overflow | timeout | halted
    this.steps = 0;
    this.lastAction = null; // {type:'fwd'|'left'|'right', ...} for animation/trace
  }

  Interpreter.prototype.currentTile = function () {
    return tileAt(this.level, this.robot.x, this.robot.y);
  };

  Interpreter.prototype._moveForward = function () {
    var d = DIRS[this.robot.dir];
    var nx = this.robot.x + d.dx;
    var ny = this.robot.y + d.dy;
    var tile = tileAt(this.level, nx, ny);
    if (!tile) {
      this.robot.x = nx;
      this.robot.y = ny;
      this.status = "dead";
      return;
    }
    this.robot.x = nx;
    this.robot.y = ny;
    if (tile.star) {
      this.status = "won";
    }
  };

  // Advance exactly one *visible* action (move or turn), or settle into a
  // terminal state. Internally resolves no-ops / calls / returns silently.
  Interpreter.prototype.step = function () {
    if (this.status !== "running") return this.status;
    if (this.callStack.length === 0) {
      var slots0 = this.program.F1;
      if (slots0.every(function (s) { return !s; })) {
        this.status = "empty";
      } else {
        this.status = "halted";
      }
      return this.status;
    }
    var budget = 20000;
    while (budget-- > 0) {
      if (this.callStack.length === 0) {
        this.status = "halted";
        return this.status;
      }
      var frame = this.callStack[this.callStack.length - 1];
      var slots = this.program[frame.fn];
      if (frame.pc >= slots.length) {
        this.callStack.pop();
        continue;
      }
      var instr = slots[frame.pc];
      frame.pc++;
      if (!instr) continue; // empty slot: no-op

      if (instr.op === "fwd") {
        this._moveForward();
        this.steps++;
        this.lastAction = { type: "fwd" };
        return this.status;
      }
      if (instr.op === "left" || instr.op === "right") {
        this.robot.dir =
          instr.op === "left" ? turnLeft(this.robot.dir) : turnRight(this.robot.dir);
        this.steps++;
        this.lastAction = { type: instr.op };
        return this.status;
      }
      // call instruction: f1 / f2 / f3
      var targetFn = instr.op === "f1" ? "F1" : instr.op === "f2" ? "F2" : "F3";
      var targetColor = COLOR_FOR_FN[targetFn];
      var tile = this.currentTile();
      var curColor = tile ? tile.color : null;
      if (curColor !== targetColor) continue; // conditional fails: no-op
      if (instr.limit !== null) {
        if (instr.limit <= 0) continue; // exhausted
        instr.limit -= 1;
      }
      if (this.callStack.length >= 64) {
        this.status = "overflow";
        return this.status;
      }
      this.callStack.push({ fn: targetFn, pc: 0 });
    }
    this.status = "timeout";
    return this.status;
  };

  // Run to completion (used by the offline level-verifier / auto-play).
  Interpreter.prototype.runAll = function (maxTicks) {
    maxTicks = maxTicks || 4000;
    var n = 0;
    while (this.status === "running" && n++ < maxTicks) this.step();
    return this.status;
  };

  var Engine = {
    COLORS: COLORS,
    FN_FOR_COLOR: FN_FOR_COLOR,
    COLOR_FOR_FN: COLOR_FOR_FN,
    OP_FOR_FN: OP_FOR_FN,
    DIRS: DIRS,
    DIR_ORDER: DIR_ORDER,
    turnRight: turnRight,
    turnLeft: turnLeft,
    tileAt: tileAt,
    cloneProgram: cloneProgram,
    emptyProgram: emptyProgram,
    Interpreter: Interpreter
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Engine;
  } else {
    root.Engine = Engine;
  }
})(typeof window !== "undefined" ? window : global);
