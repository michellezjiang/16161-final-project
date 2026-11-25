// Frame-rate independent exponential smoothing. Used instead of tweens so every
// animation can be interrupted and reversed mid-way (e.g. closing a half-open drawer).

export function dampFactor(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

export function damp(current, target, lambda, dt) {
  return current + (target - current) * dampFactor(lambda, dt);
}
