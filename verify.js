var Engine = require("./engine.js");
var Levels = require("./levels.js");

var fails = 0;
Levels.LEVELS.forEach(function (lvl) {
  var interp = new Engine.Interpreter(lvl, lvl._solution);
  var status = interp.runAll(6000);
  var ok = status === "won";
  if (!ok) {
    fails++;
    console.log(
      "FAIL level " + lvl.id + " (" + lvl.name + ") status=" + status +
      " size=" + lvl.width + "x" + lvl.height + " steps=" + interp.steps
    );
  } else {
    console.log(
      "ok   level " + lvl.id + " (" + lvl.name + ") steps=" + interp.steps +
      " size=" + lvl.width + "x" + lvl.height
    );
  }
});
console.log("\n" + (Levels.LEVELS.length - fails) + "/" + Levels.LEVELS.length + " levels solvable");
process.exit(fails ? 1 : 0);
