export type PieceType = 'I' | 'T' | 'O' | 'S' | 'Z' | 'L' | 'J';
export type CellType = PieceType | 'G';
export type Offset = readonly [col: number, row: number];

export interface PieceDefinition {
  readonly type: PieceType;
  readonly cells: readonly [
    readonly Offset[],
    readonly Offset[],
    readonly Offset[],
    readonly Offset[],
  ];
  readonly color: string;
}

export const BOARD_WIDTH = 10;
export const BOARD_VISIBLE_HEIGHT = 20;
export const ALL_PIECE_TYPES: readonly PieceType[] = [
  'I',
  'T',
  'O',
  'S',
  'Z',
  'L',
  'J',
];
