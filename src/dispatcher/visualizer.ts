import type { OpenerID } from '../openers/types.ts';
import type { VisualizerState } from '../modes/visualizer.ts';
import {
  createVisualizerState,
  getOpenerSequence,
  stepForward,
  stepBackward,
  switchBag2Route,
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
      const id = OPENER_IDS[idx]!;
      container.visualizer = createVisualizerState(
        getOpenerSequence(id, viz.sequence.mirror),
      );
      return true;
    }
    case 'option_5':
    case 'option_6': {
      const routeIdx = action === 'option_5' ? 0 : 1;
      const routes = getBag2Routes(viz.sequence.openerId, viz.sequence.mirror);
      if (routeIdx < routes.length) {
        switchBag2Route(viz, routeIdx);
        if (viz.bag !== 2) {
          viz.bag = 2;
          viz.currentStep = 0;
        }
        return true;
      }
      return false;
    }
    case 'toggle_mode': {
      const seq = getOpenerSequence(viz.sequence.openerId, !viz.sequence.mirror);
      container.visualizer = createVisualizerState(seq);
      return true;
    }
    case 'reset_stats':
      container.visualizer = createVisualizerState(
        getOpenerSequence(viz.sequence.openerId, viz.sequence.mirror),
      );
      return true;
    default:
      return false;
  }
}
