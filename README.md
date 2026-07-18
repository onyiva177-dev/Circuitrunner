# Circuit Runner

A recreation of the colour-triggered programming maze game shown in your
screenshots (the RoboZZle-style puzzle used in the 01-edu / zone01 piscine
games): you write short recursive "functions" for a robot, each instruction
only fires when the robot is standing on the matching colour tile, and you
have to get the robot from its start square onto the star before the clock
runs out.

It's a plain static site — no build step, no framework, no backend. Everything
runs client-side and progress/records are stored in the browser's
`localStorage` on each device.

## What's included

| File | Purpose |
|---|---|
| `index.html` | Page structure / app shell |
| `style.css` | Dark "circuit board" visual theme |
| `engine.js` | Pure game logic: grid, robot, program interpreter (no DOM) |
| `levels.js` | Level builder + all 32 level definitions |
| `app.js` | UI wiring: rendering, editing, execution, timer, PWA install prompt |
| `manifest.json` + `icons/` | PWA metadata so the browser offers "Install" |
| `sw.js` | Service worker — caches the app shell so it works offline once installed |
| `vercel.json` | Static hosting config for Vercel |
| `verify.js` | Node script that solves all 32 levels with their reference solutions to confirm every level is actually beatable (dev tool only, not shipped to users) |

## How the game works

- **Board.** A grid of coloured tiles (purple / teal-striped / orange) forms a
  single path from the start square to a star. Stepping off the path (onto the
  dark void) ends that attempt at the puzzle — hit **Reset** to try again.
- **Three functions.** F1 (purple), F2 (teal) and F3 (orange) each hold a short,
  fixed-length sequence of instructions. **F1 always runs first.**
- **Instructions:** move forward, turn left, turn right, and "call F1/F2/F3".
- **The trick:** a call instruction only actually executes if the robot is
  *currently standing on a tile of that function's colour* — otherwise it's
  silently skipped. That's how you branch behaviour by tile colour, and how a
  function can call itself to repeat over a straight run of same-coloured
  tiles.
- **Loop counters.** Tap a placed call instruction to give it a use-limit
  (1–5) instead of unlimited (∞) — useful for bounding a recursive loop.
- **32 levels**, alternating two families that both get harder as you go:
  straight multi-colour corridors (more colours, more segments, fewer
  slots) and diagonal "staircase" patterns (longer and longer repeating
  zig-zags). Every single level has been auto-verified solvable (see
  `verify.js`).
- **The clock.** One "attempt" = 90 minutes, shared across every level in
  that run, exactly like the piscine game. If time runs out you're shown how
  far you got. Your **furthest level ever reached** is saved permanently on
  that device (`localStorage`), independent of the 90-minute attempts, so you
  can see your personal record even after starting a fresh attempt.

## Deploying to Vercel

**Option A — via GitHub (recommended):**
1. Create a new GitHub repo and push everything in this folder to it:
   ```bash
   git init
   git add .
   git commit -m "Circuit Runner"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset: **Other** (it's a static site, no build command needed).
   Leave "Build Command" and "Output Directory" blank/default — Vercel will
   just serve the files as-is.
4. Deploy. You'll get a `*.vercel.app` URL.

**Option B — via the Vercel CLI, no GitHub needed:**
```bash
npm i -g vercel
cd circuit-runner   # this folder
vercel               # follow the prompts
vercel --prod        # promote to production URL
```

That's it — there's no environment variables, database, or server code to
configure.

## The "install" popup

- **Android / desktop Chrome / Edge:** the browser fires a native
  `beforeinstallprompt` event once the manifest + service worker are detected;
  the app shows its own bottom banner with an **Install** button that triggers
  that native prompt.
- **iOS Safari:** Apple doesn't allow a programmatic install prompt, so the
  same banner instead shows the manual steps ("tap Share → Add to Home
  Screen"). This is the standard way every iOS PWA handles it.
- **Desktop:** once installed it opens in its own window like a native app.

## Customizing

- **Change the attempt length:** edit `SESSION_MS` at the top of `app.js`
  (currently `90 * 60 * 1000`).
- **Add/edit levels:** `levels.js` exports `LEVELS`, an array of level objects.
  You can append hand-built levels using the same `buildFromScript(startColor,
  startDir, moves)` helper used for the tutorial levels, or tweak the
  procedural generator's parameters (segment lengths, colours, zig-zag depth)
  in `buildProceduralLevels()`.
- **Re-verify solvability after editing levels:**
  ```bash
  node verify.js
  ```
  This replays each level's intended solution through the same engine the
  browser uses and reports any level that doesn't reach the star.
- **Visual theme:** all colours are CSS custom properties at the top of
  `style.css` (`--purple`, `--teal`, `--orange`, `--void`, etc.).
