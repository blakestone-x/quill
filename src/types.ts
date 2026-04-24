export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  color?: string;
  pinned?: boolean;
  kind?: 'note' | 'template';
  tags?: string[];
}

export interface Pane {
  id: string;
  noteIds: string[];
  activeNoteId: string | null;
  mode?: PaneMode;
}

export type PaneMode = 'edit' | 'preview';

export type Layout = 'single' | 'v' | 'h' | 'grid';
export type SplitMode = 'none' | 'horizontal' | 'vertical';
export type DropEdge = 'center' | 'left' | 'right' | 'top' | 'bottom';

export const TAB_COLORS: { label: string; value: string }[] = [
  { label: 'Amber', value: '#dcb05a' },
  { label: 'Teal', value: '#4fb3a9' },
  { label: 'Rose', value: '#d97a8a' },
  { label: 'Violet', value: '#a489d4' },
  { label: 'Sage', value: '#85a872' },
  { label: 'Sky', value: '#6aa5d4' }
];

export interface DragPayload {
  noteId: string;
  fromPaneId: string;
}
