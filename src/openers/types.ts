import type { PieceType } from '../core/types';

export type OpenerID = 'stray_cannon' | 'honey_cup' | 'gamushiro' | 'ms2';

export interface OpenerDefinition {
  id: OpenerID;
  nameEn: string;
  nameJa: string;
  nameCn: string;
  holdPiece: PieceType;
  holdPieceMirror: PieceType;
  setupRate: { oneSide: number; withMirror: number };
  canBuild: (bag: PieceType[]) => boolean;
  canBuildMirror: (bag: PieceType[]) => boolean;
  priority: number;
}

export const OPENER_ORDER: OpenerID[] = [
  'stray_cannon',
  'honey_cup',
  'gamushiro',
  'ms2',
];
