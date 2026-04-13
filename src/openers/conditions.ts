import type { PieceType } from '../core/types.ts';
import { appearsBefore } from './decision.ts';
import { MIRROR_PIECE_MAP } from './placements.ts';

export type Condition =
  | { type: 'true' }
  | { type: 'before'; a: PieceType; b: PieceType }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition };

export function evaluate(cond: Condition, bag: PieceType[]): boolean {
  switch (cond.type) {
    case 'true': return true;
    case 'before': return appearsBefore(bag, cond.a, cond.b);
    case 'and': return cond.conditions.every(c => evaluate(c, bag));
    case 'or': return cond.conditions.some(c => evaluate(c, bag));
    case 'not': return !evaluate(cond.condition, bag);
  }
}

export function mirrorCondition(cond: Condition): Condition {
  switch (cond.type) {
    case 'true': return cond;
    case 'before': return { type: 'before', a: mirrorPiece(cond.a), b: mirrorPiece(cond.b) };
    case 'and': return { type: 'and', conditions: cond.conditions.map(mirrorCondition) };
    case 'or': return { type: 'or', conditions: cond.conditions.map(mirrorCondition) };
    case 'not': return { type: 'not', condition: mirrorCondition(cond.condition) };
  }
}

function mirrorPiece(p: PieceType): PieceType {
  return (MIRROR_PIECE_MAP[p] ?? p) as PieceType;
}

export function conditionToLabel(cond: Condition): string {
  switch (cond.type) {
    case 'true': return 'Default';
    case 'before': return `${cond.a} before ${cond.b}`;
    case 'and': return cond.conditions.map(conditionToLabel).join(', ');
    case 'or': return cond.conditions.map(conditionToLabel).join(' or ');
    case 'not': return `not ${conditionToLabel(cond.condition)}`;
  }
}
