export function setupKeyboard(
  dispatch: (action: string) => void,
  options?: { shouldHandle?: (code: string) => boolean },
): () => void {
  const keyMap: Record<string, string> = {
    Space: 'advance',
    Digit1: 'option_1',
    Digit2: 'option_2',
    Digit3: 'option_3',
    KeyR: 'reset_stats',
    KeyN: 'skip_stage',
    KeyV: 'toggle_visualizer',
    ArrowRight: 'advance',
    ArrowLeft: 'step_back',
    KeyM: 'toggle_mode',
    Digit4: 'option_4',
    Digit5: 'option_5',
    Digit6: 'option_6',
    KeyB: 'toggle_quiz_type',
  };

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    // If shouldHandle is provided and returns false, skip this key
    if (options?.shouldHandle && !options.shouldHandle(e.code)) return;

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
