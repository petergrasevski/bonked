export function engineAudible(phase, car, connected, visible, fresh) {
  return (
    phase === 'racing' &&
    !!car &&
    !car.eliminated &&
    !car.wrecked &&
    !car.falling &&
    !car.finished &&
    connected &&
    visible &&
    fresh
  );
}
