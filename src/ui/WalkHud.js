/**
 * Overlay for walking mode: a centre reticle while the mouse is captured, and a
 * "click to explore" card with the controls when it isn't.
 */
export class WalkHud {
  constructor(parent) {
    this.reticle = document.createElement('div');
    this.reticle.className = 'reticle';
    this.prompt = document.createElement('div');
    this.prompt.className = 'walk-prompt';
    this.prompt.innerHTML = `
      <p class="walk-prompt__title">Click to explore</p>
      <p class="walk-prompt__keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> hurry · mouse to look</p>
      <p class="walk-prompt__keys">Aim at a drawer or object and click · <kbd>Esc</kbd> frees the mouse</p>
    `;
    parent.append(this.reticle, this.prompt);
    this.update({ locked: false, inspecting: false });
  }

  update({ locked, inspecting }) {
    this.reticle.classList.toggle('is-visible', locked && !inspecting);
    this.prompt.classList.toggle('is-visible', !locked && !inspecting);
  }
}
