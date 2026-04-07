import type { OpenerID } from '../openers/types.ts';
import type { VisualizerState } from '../modes/visualizer.ts';
import {
  createVisualizerState,
  stepForward,
  stepBackward,
  switchRoute,
  switchOpener,
  toggleMirror,
  getBag2Routes,
} from '../modes/visualizer.ts';

export interface VisualizerContainer {
  visualizer: VisualizerState;
}

const OPENER_IDS: OpenerID[] = ['ms2', 'honey_cup', 'stray_cannon', 'gamushiro'];

export function dispatchVisualizerAction(
  container: VisualizerContainer,
  action: string,
): boolean {
  const viz = container.visualizer;

  switch (action) {
    case 'advance':
      stepForward(viz);
      return true;
    case 'step_back':
      stepBackward(viz);
      return true;
    case 'option_1':
    case 'option_2':
    case 'option_3':
    case 'option_4': {
      const idx = action === 'option_1' ? 0
        : action === 'option_2' ? 1
        : action === 'option_3' ? 2 : 3;
      container.visualizer = switchOpener(OPENER_IDS[idx]!, viz.mirror);
      return true;
    }
    case 'option_5':
    case 'option_6': {
      const routeIdx = action === 'option_5' ? 0 : 1;
      const routes = getBag2Routes(viz.openerId, viz.mirror);
      if (routeIdx < routes.length) {
        container.visualizer = switchRoute(viz, routeIdx);
        return true;
      }
      return false;
    }
    case 'toggle_mode':
      container.visualizer = toggleMirror(viz);
      return true;
    case 'reset_stats':
      container.visualizer = createVisualizerState(viz.openerId, viz.mirror);
      return true;
    default:
      return false;
  }
}
