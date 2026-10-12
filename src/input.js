// Floating virtual joystick (touch/mouse drag anywhere on the world) plus WASD / arrow keys.
const RADIUS = 56;

export class Input {
  constructor(canvas, joyEl, onZoom) {
    this.keys = new Set();
    this.joy = { x: 0, z: 0 };
    this.active = null;
    this.moved = false;
    const knob = joyEl.querySelector('.knob');

    canvas.addEventListener('pointerdown', e => {
      if (this.active !== null) return;
      this.active = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
      joyEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      knob.style.transform = 'translate(0px, 0px)';
      joyEl.hidden = false;
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== this.active) return;
      let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / RADIUS, z: dy / RADIUS };
      if (d > 8) this.moved = true;
    });
    const end = e => {
      if (e.pointerId !== this.active) return;
      this.active = null;
      this.joy = { x: 0, z: 0 };
      joyEl.hidden = true;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    addEventListener('keydown', e => {
      if (e.target.closest?.('input, textarea')) return;
      this.keys.add(e.key.toLowerCase());
      if (this.vector.x || this.vector.z) this.moved = true;
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('wheel', e => { e.preventDefault(); onZoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  }

  get vector() {
    const k = this.keys;
    let x = this.joy.x, z = this.joy.z;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }
}
