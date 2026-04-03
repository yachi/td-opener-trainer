export function setupKeyboard(dispatch: (action: string) => void): () => void {
  const keyMap: Record<string, string> = {
    Digit1: 'pick_stray_cannon',
    Digit2: 'pick_honey_cup',
    Digit3: 'pick_ms2',
    Space: 'next_question',
    KeyR: 'reset_stats',
    KeyS: 'toggle_mode',
  };

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    const action = keyMap[e.code];
    if (action) {
      e.preventDefault();
      dispatch(action);
    }
  }

  window.addEventListener('keydown', onKeyDown);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
  };
}
