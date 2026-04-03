export function setupKeyboard(dispatch: (action: string) => void): () => void {
  const keyMap: Record<string, string> = {
    Space: 'advance',
    Digit1: 'option_1',
    Digit2: 'option_2',
    Digit3: 'option_3',
    KeyR: 'reset_stats',
    KeyS: 'toggle_mode',
    KeyN: 'skip_stage',
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
