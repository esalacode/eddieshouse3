function createInputController({
  canvas,
  moveInput,
  lookInput,
  keys,
  onMouseLook,
  onMouseLookReset,
  onDebugToggle
}) {
  function bindPad(pad, stick, target, opts = {}) {
    const radius = 44;
    const active = new Map();

    function updateVisual(id, x, y) {
      if (id == null) {
        stick.style.transform = 'translate(-50%,-50%)';
        target.x = 0;
        target.y = 0;
        return;
      }

      const len = Math.hypot(x, y) || 1;
      const nx = len > radius ? x / len * radius : x;
      const ny = len > radius ? y / len * radius : y;

      stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      target.x = Math.max(-1, Math.min(1, nx / radius));
      target.y = Math.max(-1, Math.min(1, ny / radius));
      if (opts.invertY) target.y *= -1;
    }

    function posFromTouch(touch) {
      const rect = pad.getBoundingClientRect();
      return {
        x: touch.clientX - (rect.left + rect.width / 2),
        y: touch.clientY - (rect.top + rect.height / 2)
      };
    }

    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = posFromTouch(t);
        active.set(t.identifier, p);
        updateVisual(t.identifier, p.x, p.y);
      }
    }, { passive: false });

    pad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (!active.has(t.identifier)) continue;
        const p = posFromTouch(t);
        active.set(t.identifier, p);
        updateVisual(t.identifier, p.x, p.y);
      }
    }, { passive: false });

    function endTouch(e) {
      e.preventDefault();
      for (const t of e.changedTouches) active.delete(t.identifier);
      const first = active.entries().next();
      if (first.done) updateVisual(null, 0, 0);
      else updateVisual(first.value[0], first.value[1].x, first.value[1].y);
    }

    pad.addEventListener('touchend', endTouch, { passive: false });
    pad.addEventListener('touchcancel', endTouch, { passive: false });
  }

    bindPad(document.getElementById('movePad'), document.getElementById('moveStick'), moveInput, { invertY: true });
  bindPad(document.getElementById('lookPad'), document.getElementById('lookStick'), lookInput, { invertY: false });

  function setKey(code, down) {
    if (code === 'KeyW') keys.w = down;
    if (code === 'KeyA') keys.a = down;
    if (code === 'KeyS') keys.s = down;
    if (code === 'KeyD') keys.d = down;
    if (code === 'ArrowLeft') keys.left = down;
    if (code === 'ArrowRight') keys.right = down;
    if (code === 'KeyE' && down) keys.interact = true;

    if (code === 'KeyP' && down) {
      onDebugToggle();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && e.repeat) {
      e.preventDefault();
      return;
    }

    setKey(e.code, true);

    if (
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD' ||
      e.code === 'KeyE' ||
      e.code === 'KeyP' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    setKey(e.code, false);
  }, { passive: true });

  canvas.addEventListener('click', () => {
    keys.interact = true;

    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  });

  let tapStartX = 0;
  let tapStartY = 0;
  let tapStartTime = 0;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    tapStartX = t.clientX;
    tapStartY = t.clientY;
    tapStartTime = performance.now();
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - tapStartX;
    const dy = t.clientY - tapStartY;
    const dist = Math.hypot(dx, dy);
    const elapsed = performance.now() - tapStartTime;

    if (dist <= 14 && elapsed <= 260) {
      keys.interact = true;
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      onMouseLook(e.movementX || 0);
    }
  });

  window.addEventListener('blur', () => {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    keys.left = false;
    keys.right = false;
    keys.interact = false;
    onMouseLookReset();
  });
}

window.createInputController = createInputController;
