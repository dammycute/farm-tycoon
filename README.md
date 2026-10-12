# Farm Tycoon

A 3D idle-arcade farm game for the browser, built with [Three.js](https://threejs.org/).

Walk your farmer around, harvest crops into a carry stack, feed animals, run the bakery and dairy, stock market stalls, serve customers at the till, fill truck orders, and pour coins into unlock zones to grow the farm. Hire a cashier and farmhands to automate it.

## Play locally

No build step. Serve the folder with any static server and open it in a browser:

```bash
python -m http.server 5173
```

Then visit http://localhost:5173.

**Controls:** drag anywhere to use the joystick, or WASD / arrow keys. Scroll to zoom.

## Code

- `src/data.js`: items, layout, unlock zones, prices and upgrade costs
- `src/sim.js`: game rules (production, transfers, unlocks)
- `src/world.js`: 3D scene and per-frame visuals
- `src/agents.js`: player, workers and customers
- `src/models.js`: low-poly meshes
- `src/ui.js`: HUD, sounds and the main loop
