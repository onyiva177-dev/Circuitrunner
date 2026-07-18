(function () {
  "use strict";

  var LEVELS = window.Levels.LEVELS;
  var TOTAL_LEVELS = LEVELS.length;
  var SESSION_MS = 90 * 60 * 1000; // 1h30m per attempt
  var GAP_PX = 2;
  var BASE_INTERVAL = 450; // ms per step at 1x

  var LS_BEST_LEVEL = "cr_bestLevel";
  var LS_BEST_ELAPSED = "cr_bestElapsed";
  var LS_SESSION = "cr_session";

  // ---------------------------------------------------------------- state
  var session = null;
  var level = null;
  var interp = null;
  var activeFn = "F1";
  var playing = false;
  var playHandle = null;
  var speed = 1;
  var cellSize = 32;
  var traceLog = [];
  var sessionPaused = false;
  var pauseStart = 0;
  var tickHandle = null;

  // ---------------------------------------------------------------- dom
  var $ = function (id) { return document.getElementById(id); };
  var startScreen = $("startScreen");
  var gameScreen = $("gameScreen");
  var howToModal = $("howToModal");
  var levelSelect = $("levelSelect");
  var endModal = $("endModal");
  var boardEl = $("board");
  var traceEl = $("trace");
  var slotsRow = $("slotsRow");
  var msgBar = $("msgBar");
  var fnTabs = $("fnTabs");
  var timerLabel = $("timerLabel");
  var timerFill = $("timerFill");
  var levelNumEl = $("levelNum");
  var levelNameEl = $("levelName");

  // ================================================================
  // Persistence helpers
  // ================================================================
  function loadBestLevel() {
    return parseInt(localStorage.getItem(LS_BEST_LEVEL) || "1", 10);
  }
  function saveBestLevel(n) {
    var cur = loadBestLevel();
    if (n > cur) localStorage.setItem(LS_BEST_LEVEL, String(n));
  }
  function loadBestElapsed() {
    var v = localStorage.getItem(LS_BEST_ELAPSED);
    return v ? parseInt(v, 10) : null;
  }
  function saveBestElapsedIfBetter(levelReached, elapsedMs) {
    var bestLevel = loadBestLevel();
    if (levelReached >= bestLevel) {
      localStorage.setItem(LS_BEST_ELAPSED, String(elapsedMs));
    }
  }
  function fmtDuration(ms) {
    if (ms == null) return "—";
    var s = Math.round(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + sec + "s";
    return sec + "s";
  }
  function saveSession() {
    localStorage.setItem(LS_SESSION, JSON.stringify(session));
  }
  function loadSession() {
    try {
      var raw = localStorage.getItem(LS_SESSION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearSession() {
    localStorage.removeItem(LS_SESSION);
  }

  function newSession() {
    var now = Date.now();
    session = {
      startedAt: now,
      endsAt: now + SESSION_MS,
      currentLevel: 1,
      unlockedLevel: 1,
      completedIds: [],
      programs: {}
    };
    saveSession();
    return session;
  }

  // ================================================================
  // Start screen
  // ================================================================
  function refreshStartScreen() {
    $("bestLevelStat").textContent = loadBestLevel();
    $("bestTimeStat").textContent = fmtDuration(loadBestElapsed());
    var existing = loadSession();
    if (existing && existing.endsAt > Date.now()) {
      $("btnResume").hidden = false;
    } else {
      $("btnResume").hidden = true;
      if (existing) clearSession();
    }
  }

  $("btnNewGame").addEventListener("click", function () {
    newSession();
    beginGame();
  });
  $("btnResume").addEventListener("click", function () {
    session = loadSession();
    if (!session || session.endsAt <= Date.now()) {
      newSession();
    }
    beginGame();
  });
  $("btnHowTo").addEventListener("click", function () { howToModal.hidden = false; });
  $("btnCloseHowTo").addEventListener("click", function () { howToModal.hidden = true; });

  function beginGame() {
    startScreen.hidden = true;
    gameScreen.hidden = false;
    loadLevel(session.currentLevel);
    startTicking();
  }

  // ================================================================
  // Session timer
  // ================================================================
  function startTicking() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(tick, 250);
    tick();
  }

  function tick() {
    if (sessionPaused) return;
    var remaining = session.endsAt - Date.now();
    if (remaining <= 0) {
      timerLabel.textContent = "0:00";
      timerFill.style.width = "0%";
      endSession("time");
      return;
    }
    var pct = Math.max(0, Math.min(100, (remaining / SESSION_MS) * 100));
    timerFill.style.width = pct + "%";
    timerFill.style.background =
      pct < 15 ? "var(--danger)" : pct < 40 ? "var(--orange)" : "var(--purple)";
    timerLabel.textContent = fmtClock(remaining);
  }

  function fmtClock(ms) {
    var s = Math.ceil(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ":" + pad2(m) + ":" + pad2(sec);
    return m + ":" + pad2(sec);
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  $("btnPause").addEventListener("click", function () {
    sessionPaused = !sessionPaused;
    if (sessionPaused) {
      pauseStart = Date.now();
      setPlaying(false);
      showMsg("Attempt paused", "info");
    } else {
      var delta = Date.now() - pauseStart;
      session.endsAt += delta;
      saveSession();
      showMsg("", "");
    }
  });

  function endSession(reason) {
    if (tickHandle) clearInterval(tickHandle);
    setPlaying(false);
    var reached = session.unlockedLevel;
    saveBestLevel(reached);
    saveBestElapsedIfBetter(reached, Date.now() - session.startedAt);
    clearSession();

    gameScreen.hidden = true;
    endModal.hidden = false;
    if (reason === "time") {
      $("endTitle").textContent = "Time's up";
      $("endBody").textContent =
        "Your 90 minutes ran out on level " + session.currentLevel +
        ". Furthest level reached this attempt: " + (reached - 1 > 0 ? reached - 1 : 1) + ".";
    } else {
      $("endTitle").textContent = "All 32 levels cleared!";
      $("endBody").textContent =
        "You solved every circuit with time to spare. That record is saved on this device.";
    }
  }

  $("btnEndRestart").addEventListener("click", function () {
    endModal.hidden = true;
    newSession();
    beginGame();
  });

  // ================================================================
  // Level loading
  // ================================================================
  function loadLevel(n) {
    if (n > TOTAL_LEVELS) { endSession("complete"); return; }
    level = LEVELS[n - 1];
    session.currentLevel = n;
    if (!session.programs[n]) {
      session.programs[n] = window.Engine.emptyProgram(level.slots);
    }
    activeFn = "F1";
    traceLog = [];
    setPlaying(false);
    levelNumEl.textContent = n;
    levelNameEl.textContent = level.name;
    resetInterpreter();
    computeCellSize();
    renderBoard();
    renderTabs();
    renderSlots();
    renderTrace();
    showMsg("", "");
    saveSession();
  }

  function currentProgram() { return session.programs[level.id]; }

  function resetInterpreter() {
    interp = new window.Engine.Interpreter(level, currentProgram());
    traceLog = [];
    renderTrace();
    positionRobot(true);
  }

  // ================================================================
  // Board rendering
  // ================================================================
  function computeCellSize() {
    var wrap = $("boardWrap");
    var availW = wrap.clientWidth - 20;
    var availH = wrap.clientHeight - 20;
    var byW = Math.floor((availW - GAP_PX * (level.width - 1)) / level.width);
    var byH = Math.floor((availH - GAP_PX * (level.height - 1)) / level.height);
    cellSize = Math.max(16, Math.min(44, Math.min(byW, byH)));
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + level.width + ", " + cellSize + "px)";
    boardEl.style.gridTemplateRows = "repeat(" + level.height + ", " + cellSize + "px)";
    boardEl.style.width = level.width * cellSize + GAP_PX * (level.width - 1) + "px";
    boardEl.style.height = level.height * cellSize + GAP_PX * (level.height - 1) + "px";

    for (var y = 0; y < level.height; y++) {
      for (var x = 0; x < level.width; x++) {
        var tile = level.grid[y][x];
        var div = document.createElement("div");
        div.className = "cell";
        if (tile) {
          div.className += " tile-" + tile.color;
          if (tile.star) div.className += " tile-star";
        }
        boardEl.appendChild(div);
      }
    }
    var robot = document.createElement("div");
    robot.className = "robot";
    robot.id = "robotEl";
    robot.style.width = cellSize + "px";
    robot.style.height = cellSize + "px";
    boardEl.appendChild(robot);
    positionRobot(true);
  }

  var DIR_ANGLE = { up: 0, right: 90, down: 180, left: 270 };
  function positionRobot(instant) {
    var el = $("robotEl");
    if (!el) return;
    var left = interp.robot.x * (cellSize + GAP_PX);
    var top = interp.robot.y * (cellSize + GAP_PX);
    if (instant) el.style.transition = "none";
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.transform = "rotate(" + DIR_ANGLE[interp.robot.dir] + "deg)";
    if (instant) {
      void el.offsetWidth;
      el.style.transition = "";
    }
  }

  window.addEventListener("resize", function () {
    if (!level || gameScreen.hidden) return;
    computeCellSize();
    renderBoard();
  });

  // ================================================================
  // Function tabs + slot editor
  // ================================================================
  fnTabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".fn-tab");
    if (!btn) return;
    activeFn = btn.dataset.fn;
    renderTabs();
    renderSlots();
  });

  function renderTabs() {
    Array.prototype.forEach.call(fnTabs.querySelectorAll(".fn-tab"), function (b) {
      b.classList.toggle("active", b.dataset.fn === activeFn);
    });
  }

  var OP_LABEL = { fwd: "\u2191", left: "\u21BA", right: "\u21BB", f1: "F1", f2: "F2", f3: "F3" };
  var OP_COLOR_CLASS = { f1: "tool-purple", f2: "tool-teal", f3: "tool-orange" };

  function renderSlots() {
    slotsRow.innerHTML = "";
    var prog = currentProgram()[activeFn];
    prog.forEach(function (slot, idx) {
      var d = document.createElement("div");
      d.className = "slot";
      if (slot) {
        d.classList.add("filled");
        if (OP_COLOR_CLASS[slot.op]) d.classList.add(OP_COLOR_CLASS[slot.op]);
        d.textContent = OP_LABEL[slot.op];
        if (slot.op === "f1" || slot.op === "f2" || slot.op === "f3") {
          var badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = slot.limit === null ? "\u221E" : slot.limit;
          d.appendChild(badge);
        }
        var rm = document.createElement("span");
        rm.className = "remove";
        rm.textContent = "\u00d7";
        rm.addEventListener("click", function (ev) {
          ev.stopPropagation();
          prog.splice(idx, 1);
          prog.push(null);
          onProgramChanged();
        });
        d.appendChild(rm);

        d.addEventListener("click", function () {
          if (slot.op === "f1" || slot.op === "f2" || slot.op === "f3") {
            var order = [null, 1, 2, 3, 4, 5];
            var i = order.indexOf(slot.limit);
            slot.limit = order[(i + 1) % order.length];
            onProgramChanged();
          }
        });
      }
      slotsRow.appendChild(d);
    });
  }

  function onProgramChanged() {
    saveSession();
    resetInterpreter();
    renderSlots();
    showMsg("", "");
  }

  // Toolbox: tap appends to first empty slot of active function
  $("toolbox").addEventListener("click", function (e) {
    var btn = e.target.closest(".tool-btn");
    if (!btn) return;
    var op = btn.dataset.op;
    var prog = currentProgram()[activeFn];
    var idx = prog.findIndex(function (s) { return !s; });
    if (idx === -1) {
      flashFull();
      return;
    }
    prog[idx] = { op: op, limit: null };
    onProgramChanged();
  });

  function flashFull() {
    slotsRow.style.transition = "none";
    slotsRow.style.boxShadow = "inset 0 0 0 2px var(--danger)";
    setTimeout(function () { slotsRow.style.boxShadow = ""; }, 220);
  }

  // ================================================================
  // Execution trace (left strip)
  // ================================================================
  function renderTrace() {
    traceEl.innerHTML = "";
    traceLog.slice(-40).forEach(function (t) {
      var d = document.createElement("div");
      d.className = "trace-item";
      d.style.background = t.color;
      d.textContent = t.label;
      traceEl.appendChild(d);
    });
  }

  var TRACE_STYLE = {
    fwd: { color: "#3b3d4c", label: "\u2191" },
    left: { color: "#3b3d4c", label: "\u21BA" },
    right: { color: "#3b3d4c", label: "\u21BB" }
  };

  // ================================================================
  // Playback controls
  // ================================================================
  function showMsg(text, kind) {
    msgBar.textContent = text;
    msgBar.className = "msg-bar" + (text ? " show" : "") + (kind ? " " + kind : "");
  }

  function doStep() {
    if (!interp || interp.status !== "running") return interp ? interp.status : null;
    var status = interp.step();
    if (interp.lastAction) {
      var st = TRACE_STYLE[interp.lastAction.type];
      if (st) { traceLog.push(st); renderTrace(); }
    }
    positionRobot(false);
    handleStatus(status);
    return status;
  }

  function handleStatus(status) {
    if (status === "running") return;
    setPlaying(false);
    if (status === "won") {
      onLevelWon();
    } else if (status === "dead") {
      showMsg("You died!", "dead");
    } else if (status === "empty") {
      showMsg("Empty stack — add instructions to F1", "info");
    } else if (status === "timeout" || status === "overflow") {
      showMsg("Infinite loop detected", "dead");
    } else if (status === "halted") {
      showMsg("Program finished — goal not reached", "info");
    }
  }

  function onLevelWon() {
    showMsg("Correct!", "win");
    var n = level.id;
    if (session.completedIds.indexOf(n) === -1) session.completedIds.push(n);
    session.unlockedLevel = Math.max(session.unlockedLevel, n + 1);
    saveBestLevel(n + 1);
    saveSession();
    setTimeout(function () {
      if (n + 1 <= TOTAL_LEVELS) {
        loadLevel(n + 1);
      } else {
        endSession("complete");
      }
    }, 1100);
  }

  function setPlaying(on) {
    playing = on;
    $("btnPlay").classList.toggle("active-state", playing);
    if (playHandle) { clearInterval(playHandle); playHandle = null; }
    if (playing) {
      playHandle = setInterval(function () {
        if (!interp || interp.status !== "running") { setPlaying(false); return; }
        doStep();
      }, BASE_INTERVAL / speed);
    }
  }

  $("btnPlay").addEventListener("click", function () {
    if (!interp) return;
    if (interp.status !== "running") { resetInterpreter(); }
    setPlaying(!playing);
  });
  $("btnStep").addEventListener("click", function () {
    setPlaying(false);
    if (!interp || interp.status !== "running") resetInterpreter();
    doStep();
  });
  $("btnReset").addEventListener("click", function () {
    setPlaying(false);
    resetInterpreter();
    showMsg("", "");
  });
  $("btnClear").addEventListener("click", function () {
    setPlaying(false);
    session.programs[level.id] = window.Engine.emptyProgram(level.slots);
    saveSession();
    resetInterpreter();
    renderSlots();
    showMsg("", "");
  });
  $("btnSpeed").addEventListener("click", function () {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    $("btnSpeed").textContent = speed + "x";
    if (playing) setPlaying(true);
  });

  // ================================================================
  // Level select
  // ================================================================
  $("btnMenu").addEventListener("click", openLevelSelect);
  $("btnCloseLevels").addEventListener("click", function () { levelSelect.hidden = true; });

  function openLevelSelect() {
    var grid = $("levelGrid");
    grid.innerHTML = "";
    LEVELS.forEach(function (lvl) {
      var b = document.createElement("button");
      b.className = "level-cell";
      b.textContent = lvl.id;
      var done = session.completedIds.indexOf(lvl.id) !== -1;
      var locked = lvl.id > session.unlockedLevel;
      if (done) b.classList.add("done");
      if (lvl.id === level.id) b.classList.add("current");
      if (locked) { b.classList.add("locked"); b.disabled = true; }
      b.addEventListener("click", function () {
        levelSelect.hidden = true;
        loadLevel(lvl.id);
      });
      grid.appendChild(b);
    });
    levelSelect.hidden = false;
  }

  // ================================================================
  // PWA install prompt (Android/desktop Chrome + iOS fallback banner)
  // ================================================================
  var deferredInstallPrompt = null;
  var installBanner = $("installBanner");

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!localStorage.getItem("cr_installDismissed")) installBanner.hidden = false;
  });

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  }

  if (isIOS() && !isStandalone() && !localStorage.getItem("cr_installDismissed")) {
    $("installText").textContent =
      "Install: tap the Share icon, then \u201cAdd to Home Screen\u201d.";
    $("btnInstall").hidden = true;
    installBanner.hidden = false;
  }

  $("btnInstall").addEventListener("click", function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      installBanner.hidden = true;
    });
  });
  $("btnInstallDismiss").addEventListener("click", function () {
    installBanner.hidden = true;
    localStorage.setItem("cr_installDismissed", "1");
  });

  // ================================================================
  // Service worker registration
  // ================================================================
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  // ================================================================
  // Boot
  // ================================================================
  refreshStartScreen();
})();
