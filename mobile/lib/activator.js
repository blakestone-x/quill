// Secret activators — start a recording without unlocking the app or going
// through the UI.
//
// Web apps can NOT see the literal power button; the OS owns it. The
// recommended pairing is an iOS Shortcut or Android Tasker macro that opens
// the deep link `?action=start` in response to the power-button gesture.
//
// In-app activators we do support:
//   - triple-tap anywhere on the launch screen
//   - shake-to-start (DeviceMotion, with permission on iOS)
//   - volume-key combo (best-effort; only fires if the page has focus and
//     the browser exposes AudioVolumeUp/Down keydowns — Android Chrome does,
//     iOS Safari does not)
//   - URL deep link `?action=start` or hash `#start`
//
// All of them call the supplied `onTrigger` callback. Caller decides what
// "start a recording" means.

export class Activator {
  constructor({ settings, onTrigger, hapticOn = true }) {
    this.settings = settings;
    this.onTrigger = onTrigger;
    this.hapticOn = hapticOn;
    this._tapTimes = [];
    this._handlers = [];
    this._motionPermission = 'unknown'; // 'granted' | 'denied' | 'unsupported'
  }

  install() {
    this.uninstall();
    if (this.settings.actTap) this._installTripleTap();
    if (this.settings.actShake) this._installShake();
    if (this.settings.actVolume) this._installVolumeKeys();
    // Deep-link autostart is handled by app.js so the screen routes correctly
    // when the URL is /?action=sessions or /?action=settings instead of start.
  }

  uninstall() {
    for (const off of this._handlers) {
      try { off(); } catch {}
    }
    this._handlers = [];
  }

  fire(reason) {
    if (this.hapticOn && navigator.vibrate) navigator.vibrate([60, 40, 60]);
    try { this.onTrigger?.(reason); } catch (e) { console.error('activator', e); }
  }

  // ── Triple-tap ──
  _installTripleTap() {
    const handler = (e) => {
      // Only count taps on the record screen background, not on form inputs.
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return;
      const now = Date.now();
      this._tapTimes = this._tapTimes.filter((t) => now - t < 800);
      this._tapTimes.push(now);
      if (this._tapTimes.length >= 3) {
        this._tapTimes = [];
        this.fire('triple-tap');
      }
    };
    document.addEventListener('pointerdown', handler, true);
    this._handlers.push(() => document.removeEventListener('pointerdown', handler, true));
  }

  // ── Shake to start ──
  async _installShake() {
    if (typeof DeviceMotionEvent === 'undefined') return;

    // iOS 13+ requires explicit user-gesture permission. We request it lazily
    // on first user tap if needed.
    const requestIfNeeded = async () => {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const res = await DeviceMotionEvent.requestPermission();
          this._motionPermission = res === 'granted' ? 'granted' : 'denied';
        } catch {
          this._motionPermission = 'denied';
        }
      } else {
        this._motionPermission = 'granted';
      }
    };

    let lastShake = 0;
    let lastSample = { x: 0, y: 0, z: 0, t: 0 };
    const SHAKE_THRESHOLD = 22;
    const motion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const t = Date.now();
      const dx = (a.x || 0) - lastSample.x;
      const dy = (a.y || 0) - lastSample.y;
      const dz = (a.z || 0) - lastSample.z;
      const dt = Math.max(1, t - lastSample.t);
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt * 1000;
      lastSample = { x: a.x || 0, y: a.y || 0, z: a.z || 0, t };
      if (speed > SHAKE_THRESHOLD && t - lastShake > 1500) {
        lastShake = t;
        this.fire('shake');
      }
    };

    const oneTimeUnlock = async () => {
      await requestIfNeeded();
      if (this._motionPermission === 'granted') {
        window.addEventListener('devicemotion', motion);
        this._handlers.push(() => window.removeEventListener('devicemotion', motion));
      }
      document.removeEventListener('pointerdown', oneTimeUnlock);
    };
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // Defer until first interaction to satisfy iOS permission flow.
      document.addEventListener('pointerdown', oneTimeUnlock, { once: true });
      this._handlers.push(() => document.removeEventListener('pointerdown', oneTimeUnlock));
    } else {
      window.addEventListener('devicemotion', motion);
      this._handlers.push(() => window.removeEventListener('devicemotion', motion));
    }
  }

  // ── Volume-key combo ──
  // Android Chrome surfaces AudioVolumeUp/Down keydown events when the page
  // is focused. iOS Safari does not. We accept either: 3 presses within 1.2 s,
  // or up+down+up sequence.
  _installVolumeKeys() {
    let presses = [];
    const KEYS = new Set(['AudioVolumeUp', 'AudioVolumeDown', 'VolumeUp', 'VolumeDown']);
    const handler = (e) => {
      if (!KEYS.has(e.key)) return;
      // Don't preventDefault — we don't want to silently swallow the user's
      // volume control if the trigger doesn't fire.
      const now = Date.now();
      presses = presses.filter((p) => now - p.t < 1200);
      presses.push({ key: e.key, t: now });
      if (presses.length >= 3) {
        presses = [];
        this.fire('volume-keys');
      }
    };
    window.addEventListener('keydown', handler);
    this._handlers.push(() => window.removeEventListener('keydown', handler));
  }

}
