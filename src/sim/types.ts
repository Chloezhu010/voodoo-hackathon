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
  starts_concealed?: boolean;
  revealed_by?: string;
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

export interface WallCell {
  col: number;
  row: number;
}

export interface LevelData {
  level_id: number;
  name: string;
  difficulty: number;
  board_size: BoardSize;
  blocks: BlockRecord[];
  walls?: WallCell[];
  box_columns: BoxColumn[];
  editor_metadata?: {
    schema_version: 1;
    design_summary: string;
    validation_summary: string;
  };
  /** Legacy Queue/Tray editor data. Runtime uses box_columns. */
  trays?: TrayConfig[];
  conveyor_speed?: number;
  /** Legacy Queue/Tray editor data. Runtime uses the conveyor capacity constants. */
  queue_capacity?: number;
  gravity_flip_enabled?: boolean;
  magnet_count?: number;
}

export type IdGen = () => string;
