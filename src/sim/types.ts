export type ColorId = 'pink' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Vec2 {
  x: number;
  y: number;
}

export interface BlockRecord {
  id: string;
  col: number;
  row: number;
  z: number;
  color: ColorId;
  is_hidden?: boolean;
  isCleared?: boolean;
}

export interface TrayConfig {
  color: ColorId;
  capacity: number;
}

export interface BoxColumn {
  col: number;
  boxes: ColorId[];
}

export interface BoardSize {
  cols: number;
  rows: number;
}

export interface LevelData {
  level_id: number;
  name: string;
  difficulty: number;
  board_size: BoardSize;
  blocks: BlockRecord[];
  box_columns: BoxColumn[];
  trays?: TrayConfig[];
  conveyor_speed?: number;
  queue_capacity?: number;
  gravity_flip_enabled?: boolean;
  magnet_count?: number;
}

export type IdGen = () => string;
