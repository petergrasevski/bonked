export function countdownText(state, now) {
  if (!state) return '';
  const remaining = (state.startAt - now) / 1000;
  return state.phase === 'countdown'
    ? String(Math.max(1, Math.ceil(remaining)))
    : state.phase === 'racing' && remaining > -0.8
      ? 'GO!'
      : '';
}
