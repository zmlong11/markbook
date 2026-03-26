export type NoteType = "command" | "markdown";
export type CopyFormat = "command" | "markdown" | "plain";
export type SortKey = "updated_desc" | "title_asc" | "copied_desc";
export type WidgetSide = "left" | "right";
export type WidgetDragSource = "button" | "panel";

export interface Category {
  id: number;
  name: string;
  noteCount: number;
}

export interface Tag {
  id: number;
  name: string;
  noteCount: number;
}

export interface NoteListItem {
  id: number;
  type: NoteType;
  title: string;
  summary: string;
  commandText: string;
  contentMarkdown: string;
  categoryId: number | null;
  categoryName: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastCopiedAt: string | null;
}

export interface NoteDetail extends NoteListItem {}

export interface NoteQuery {
  searchText?: string;
  categoryId?: number | null;
  tagId?: number | null;
  sortKey?: SortKey;
  limit?: number;
}

export interface NoteInput {
  id?: number;
  type: NoteType;
  title: string;
  summary: string;
  commandText: string;
  contentMarkdown: string;
  categoryId: number | null;
  tags: string[];
  autoClassify?: boolean;
}

export interface CategoryInput {
  id?: number;
  name: string;
}

export interface CopyPayload {
  noteId: number;
  format: CopyFormat;
}

export interface SaveResult {
  id: number;
  autoCategoryName?: string | null;
  autoTags?: string[];
}

export interface MetadataSuggestion {
  categoryName: string | null;
  categoryId: number | null;
  tags: string[];
  confidence: number;
  reasons: string[];
  candidateCategories: Array<{
    name: string;
    score: number;
  }>;
}

export interface ExportResult {
  canceled: boolean;
  filePath?: string;
}

export interface ImportResult {
  canceled: boolean;
  filePath?: string;
  importedNotes?: number;
  importedCategories?: number;
}

export interface WidgetState {
  pinned: boolean;
  expanded: boolean;
  docked: boolean;
  side: WidgetSide;
}

export interface LibraryExport {
  exportedAt: string;
  categories: Category[];
  notes: NoteDetail[];
}

export interface MarkbookApi {
  notes: {
    list: (query?: NoteQuery) => Promise<NoteListItem[]>;
    get: (id: number) => Promise<NoteDetail | null>;
    classify: (input: NoteInput) => Promise<MetadataSuggestion>;
    save: (input: NoteInput) => Promise<SaveResult>;
    delete: (id: number) => Promise<void>;
  };
  categories: {
    list: () => Promise<Category[]>;
    save: (input: CategoryInput) => Promise<SaveResult>;
    delete: (id: number) => Promise<void>;
  };
  tags: {
    list: () => Promise<Tag[]>;
    suggest: (query: string) => Promise<string[]>;
  };
  clipboard: {
    copy: (payload: CopyPayload) => Promise<{ text: string }>;
  };
  export: {
    note: (noteId: number) => Promise<ExportResult>;
    library: () => Promise<ExportResult>;
  };
  import: {
    library: () => Promise<ImportResult>;
  };
  window: {
    showMain: () => Promise<void>;
    showWidget: () => Promise<WidgetState>;
    expandWidget: () => Promise<WidgetState>;
    collapseWidget: () => Promise<WidgetState>;
    getWidgetState: () => Promise<WidgetState>;
    setWidgetPinned: (pinned: boolean) => Promise<WidgetState>;
    closeWidget: () => Promise<void>;
    startWidgetDrag: (source: WidgetDragSource, screenX: number, screenY: number) => Promise<boolean>;
    moveWidgetDrag: (source: WidgetDragSource, screenX: number, screenY: number) => Promise<WidgetState>;
    endWidgetDrag: () => Promise<WidgetState>;
  };
}