// Browser/OS pairs remain intact; only input routing is split into two players.
export function isJoyConPair(pad) {
  return (
    !!pad &&
    pad.mapping === 'standard' &&
    pad.axes.length >= 4 &&
    pad.buttons.length >= 16 &&
    /joy.?con/i.test(pad.id) &&
    /l\s*[/+]\s*r|pair/i.test(pad.id)
  );
}
export function splitJoyCon(pad) {
  const button = (index) => pad.buttons[index] || { pressed: false, value: 0 };
  return ['L', 'R'].map((side, i) => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    // Sideways positions verified with the player's macOS paired profile:
    // bottom = accelerate, right = weapon, left = reverse on BOTH halves.
    // Chromium's Nintendo extras: capture 17, L SL/SR 18/19, R SL/SR 20/21.
    // Keep outer shoulders/triggers available for custom remapping only.
    const source = i
      ? { 0: 0, 1: 3, 2: 1, 5: 2, 6: 20, 7: 21, 4: 5, 8: 7, 9: 9, 10: 11, 16: 16 }
      : { 0: 14, 1: 15, 2: 12, 5: 13, 6: 18, 7: 19, 4: 4, 8: 6, 9: 8, 10: 10, 16: 17 };
    for (const [to, from] of Object.entries(source)) buttons[to] = button(from);
    return {
      index: i ? -(pad.index + 1) : pad.index,
      id: `Joy-Con (${side}) · split ${pad.id}`,
      mapping: 'standard',
      connected: pad.connected,
      axes: i ? [-pad.axes[3], pad.axes[2]] : [pad.axes[1], -pad.axes[0]],
      buttons,
      physicalIndex: pad.index,
      joyConSide: side,
      railButtonsAvailable: pad.buttons.length > (i ? 21 : 19),
    };
  });
}
