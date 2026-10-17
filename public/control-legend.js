export const DESKTOP_CONTROLS_HTML =
  '<span class="control-hint"><span class="key-cluster" aria-label="W A S D"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><strong>Drive</strong></span><span class="control-hint"><kbd>Enter ↵</kbd><strong>Fire</strong></span><span class="control-hint"><span class="key-pair"><kbd>←</kbd><kbd>→</kbd></span><strong>Nudge</strong></span>';
const CONTROLLER_CONTROLS_HTML =
  '<span class="control-hint"><kbd>Left stick</kbd><strong>Steer</strong></span><span class="control-hint"><kbd>✕</kbd><strong>Accelerate</strong></span><span class="control-hint"><kbd>□</kbd><strong>Reverse</strong></span><span class="control-hint"><kbd>R1</kbd><strong>Fire</strong></span><span class="control-hint"><kbd>L2 / R2</kbd><strong>Nudge</strong></span>';
export function updateControlLegend(element, connected, sky = false) {
  const mode = (connected ? 'controller' : 'keyboard') + (sky ? '-sky' : '');
  if (element.dataset.mode === mode) return;
  element.dataset.mode = mode;
  element.innerHTML = sky
    ? `<span class="control-hint"><kbd>${connected ? 'Left stick' : 'W A S D'}</kbd><strong>Aim sky beam</strong></span><span class="control-hint"><kbd>${connected ? 'R1' : 'Enter ↵'}</kbd><strong>Fire</strong></span>`
    : connected
      ? CONTROLLER_CONTROLS_HTML
      : DESKTOP_CONTROLS_HTML;
}
