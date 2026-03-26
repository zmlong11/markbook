import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  Category,
  CategoryInput,
  CopyFormat,
  LibraryExport,
  MetadataSuggestion,
  NoteDetail,
  NoteInput,
  NoteListItem,
  NoteQuery,
  SaveResult,
  SortKey,
  Tag
} from "../shared/types.js";
import { suggestMetadata } from "./classification.js";

interface NoteRow {
  id: number;
  type: "command" | "markdown";
  title: string;
  summary: string | null;
  command_text: string | null;
  content_markdown: string | null;
  category_id: number | null;
  category_name: string | null;
  created_at: string;
  updated_at: string;
  last_copied_at: string | null;
  tags_csv: string | null;
}

const MESSAGE = {
  emptyCategoryName: "\u5206\u7c7b\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a",
  noteNotFoundToCopy: "\u672a\u627e\u5230\u8981\u590d\u5236\u7684\u7b14\u8bb0",
  noteNotFoundToExport: "\u672a\u627e\u5230\u8981\u5bfc\u51fa\u7684\u7b14\u8bb0",
  invalidImportFile: "\u5bfc\u5165\u6587\u4ef6\u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u65e0\u6cd5\u8fc1\u79fb\u7b14\u8bb0\u6570\u636e",
  importNoNotes: "\u5bfc\u5165\u6587\u4ef6\u91cc\u6ca1\u6709\u53ef\u8fc1\u79fb\u7684\u7b14\u8bb0",
  emptyTitle: "\u6807\u9898\u4e0d\u80fd\u4e3a\u7a7a",
  emptyCommand: "\u547d\u4ee4\u6b63\u6587\u4e0d\u80fd\u4e3a\u7a7a",
  emptyMarkdown: "Markdown \u7b14\u8bb0\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a",
  headingCommand: "## \u547d\u4ee4",
  headingDescription: "## \u8bf4\u660e",
  headingContent: "## \u5185\u5bb9",
  headingExtras: "## \u793a\u4f8b\u4e0e\u8865\u5145",
  headingMeta: "## \u5143\u4fe1\u606f",
  metaCategory: "- \u5206\u7c7b\uff1a",
  metaTags: "- \u6807\u7b7e\uff1a"
} as const;

const SORT_SQL: Record<SortKey, string> = {
  updated_desc: "n.updated_at DESC, n.id DESC",
  title_asc: "LOWER(n.title) ASC, n.updated_at DESC",
  copied_desc: "COALESCE(n.last_copied_at, '') DESC, n.updated_at DESC"
};

export class MarkbookDatabase {
  private readonly db: Database.Database;

  private readonly ftsEnabled: boolean;

  constructor(dbFilePath: string) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new Database(dbFilePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeSchema();
    this.ftsEnabled = this.initializeFts();
  }

  listCategories(): Category[] {
    return this.db
      .prepare(
        `
        SELECT
          c.id,
          c.name,
          COUNT(n.id) AS noteCount
        FROM categories c
        LEFT JOIN notes n ON n.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY LOWER(c.name) ASC
        `
      )
      .all() as Category[];
  }

  saveCategory(input: CategoryInput): SaveResult {
    const name = input.name.trim();
    if (!name) {
      throw new Error(MESSAGE.emptyCategoryName);
    }

    const timestamp = nowIso();
    if (input.id) {
      this.db
        .prepare("UPDATE categories SET name = ?, updated_at = ? WHERE id = ?")
        .run(name, timestamp, input.id);
      return { id: input.id };
    }

    const result = this.db
      .prepare("INSERT INTO categories (name, created_at, updated_at) VALUES (?, ?, ?)")
      .run(name, timestamp, timestamp);
    return { id: Number(result.lastInsertRowid) };
  }

  deleteCategory(id: number): void {
    const timestamp = nowIso();
    const tx = this.db.transaction((categoryId: number) => {
      this.db
        .prepare("UPDATE notes SET category_id = NULL, updated_at = ? WHERE category_id = ?")
        .run(timestamp, categoryId);
      this.db.prepare("DELETE FROM categories WHERE id = ?").run(categoryId);
    });
    tx(id);
  }

  listTags(): Tag[] {
    return this.db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          COUNT(nt.note_id) AS noteCount
        FROM tags t
        LEFT JOIN note_tags nt ON nt.tag_id = t.id
        GROUP BY t.id, t.name
        ORDER BY noteCount DESC, LOWER(t.name) ASC
        `
      )
      .all() as Tag[];
  }

  suggestTags(query: string): string[] {
    const normalized = query.trim();
    if (!normalized) {
      return this.listTags()
        .slice(0, 12)
        .map((tag) => tag.name);
    }

    const rows = this.db
      .prepare(
        `
        SELECT name
        FROM tags
        WHERE name LIKE ? ESCAPE '\\'
        ORDER BY LOWER(name) ASC
        LIMIT 12
        `
      )
      .all(`%${escapeLike(normalized)}%`) as Array<{ name: string }>;

    return rows.map((row) => row.name);
  }

  listNotes(query: NoteQuery = {}): NoteListItem[] {
    const params: Array<number | string> = [];
    const where: string[] = [];
    const sortKey = query.sortKey ?? "updated_desc";
    const searchText = query.searchText?.trim() ?? "";
    const limit = normalizeLimit(query.limit);

    if (query.categoryId != null) {
      where.push("n.category_id = ?");
      params.push(query.categoryId);
    }

    if (query.tagId != null) {
      where.push(
        "EXISTS (SELECT 1 FROM note_tags nt_filter WHERE nt_filter.note_id = n.id AND nt_filter.tag_id = ?)"
      );
      params.push(query.tagId);
    }

    const rows = this.queryNotes(where, params, searchText ? "updated_desc" : sortKey, searchText ? undefined : limit);
    const rankedRows = searchText ? rankRowsBySearch(rows, searchText) : rows;
    const limitedRows = limit ? rankedRows.slice(0, limit) : rankedRows;
    return limitedRows.map(mapRowToNote);
  }

  getNote(id: number): NoteDetail | null {
    const row = this.db
      .prepare(
        `
        SELECT
          n.id,
          n.type,
          n.title,
          n.summary,
          n.command_text,
          n.content_markdown,
          n.category_id,
          c.name AS category_name,
          n.created_at,
          n.updated_at,
          n.last_copied_at,
          COALESCE(GROUP_CONCAT(t.name, '|||'), '') AS tags_csv
        FROM notes n
        LEFT JOIN categories c ON c.id = n.category_id
        LEFT JOIN note_tags nt ON nt.note_id = n.id
        LEFT JOIN tags t ON t.id = nt.tag_id
        WHERE n.id = ?
        GROUP BY n.id
        `
      )
      .get(id) as NoteRow | undefined;

    return row ? mapRowToNote(row) : null;
  }

  classifyNote(input: NoteInput): MetadataSuggestion {
    return suggestMetadata(
      {
        ...input,
        title: input.title.trim(),
        summary: input.summary.trim(),
        commandText: input.commandText.trim(),
        contentMarkdown: input.contentMarkdown.trim(),
        tags: Array.from(
          new Set(
            input.tags
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        )
      },
      this.listCategories()
    );
  }

  saveNote(input: NoteInput): SaveResult {
    const normalized = normalizeNoteInput(input);
    const suggestion = normalized.autoClassify
      ? suggestMetadata(normalized, this.listCategories())
      : null;
    const enriched = this.applyAutomaticMetadata(normalized, suggestion);

    const tx = this.db.transaction(
      (noteInput: NoteInput, autoCategoryName: string | null, autoTags: string[]) => {
        const timestamp = nowIso();
        let noteId = noteInput.id;

        if (noteId) {
          this.db
            .prepare(
              `
              UPDATE notes
              SET
                type = ?,
                title = ?,
                summary = ?,
                command_text = ?,
                content_markdown = ?,
                category_id = ?,
                updated_at = ?
              WHERE id = ?
              `
            )
            .run(
              noteInput.type,
              noteInput.title,
              noteInput.summary,
              noteInput.commandText,
              noteInput.contentMarkdown,
              noteInput.categoryId,
              timestamp,
              noteId
            );
        } else {
          const result = this.db
            .prepare(
              `
              INSERT INTO notes (
                type,
                title,
                summary,
                command_text,
                content_markdown,
                category_id,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `
            )
            .run(
              noteInput.type,
              noteInput.title,
              noteInput.summary,
              noteInput.commandText,
              noteInput.contentMarkdown,
              noteInput.categoryId,
              timestamp,
              timestamp
            );
          noteId = Number(result.lastInsertRowid);
        }

        this.db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
        const insertNoteTag = this.db.prepare(
          "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)"
        );
        for (const tagName of noteInput.tags) {
          insertNoteTag.run(noteId, this.ensureTag(tagName));
        }

        this.syncSearchIndex(noteId);
        this.cleanupUnusedTags();
        return { id: noteId, autoCategoryName, autoTags };
      }
    );

    return tx(enriched.note, enriched.autoCategoryName, enriched.autoTags);
  }

  deleteNote(id: number): void {
    const tx = this.db.transaction((noteId: number) => {
      this.db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
      this.db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
      if (this.ftsEnabled) {
        this.db.prepare("DELETE FROM note_search WHERE note_id = ?").run(noteId);
      }
      this.cleanupUnusedTags();
    });
    tx(id);
  }

  copyNote(noteId: number, format: CopyFormat): string {
    const note = this.getNote(noteId);
    if (!note) {
      throw new Error(MESSAGE.noteNotFoundToCopy);
    }

    const text = formatCopyText(note, format);
    this.db
      .prepare("UPDATE notes SET last_copied_at = ? WHERE id = ?")
      .run(nowIso(), noteId);
    this.syncSearchIndex(noteId);
    return text;
  }

  exportNoteMarkdown(noteId: number): { fileName: string; content: string } {
    const note = this.getNote(noteId);
    if (!note) {
      throw new Error(MESSAGE.noteNotFoundToExport);
    }

    return {
      fileName: sanitizeFileName(`${note.title}.md`),
      content: formatMarkdownExport(note)
    };
  }

  exportLibrary(): { fileName: string; content: string } {
    const payload: LibraryExport = {
      exportedAt: nowIso(),
      categories: this.listCategories(),
      notes: this.listNotes({ sortKey: "updated_desc" })
        .map((item) => this.getNote(item.id))
        .filter((item): item is NoteDetail => Boolean(item))
    };

    return {
      fileName: `markbook-backup-${nowIso().slice(0, 10)}.json`,
      content: JSON.stringify(payload, null, 2)
    };
  }

  importLibrary(content: string): { importedNotes: number; importedCategories: number } {
    const payload = parseLibraryImport(content);
    if (payload.notes.length === 0) {
      throw new Error(MESSAGE.importNoNotes);
    }

    const beforeCategoryNames = new Set(this.listCategories().map((category) => normalizeName(category.name)));
    let importedNotes = 0;

    for (const category of payload.categories) {
      if (category.trim()) {
        this.ensureCategory(category.trim());
      }
    }

    for (const rawNote of payload.notes) {
      const noteInput = normalizeImportedNote(rawNote);
      const categoryName = rawNote.categoryName?.trim();
      if (categoryName) {
        noteInput.categoryId = this.ensureCategory(categoryName);
      }

      const existingId = this.findExistingNoteId(noteInput);
      if (existingId) {
        const existing = this.getNote(existingId);
        if (existing) {
          noteInput.id = existingId;
          noteInput.categoryId = noteInput.categoryId ?? existing.categoryId;
          noteInput.summary = noteInput.summary || existing.summary;
          noteInput.commandText = noteInput.commandText || existing.commandText;
          noteInput.contentMarkdown = noteInput.contentMarkdown || existing.contentMarkdown;
          noteInput.tags = Array.from(new Set([...existing.tags, ...noteInput.tags]));
        }
      }

      this.saveNote({ ...noteInput, autoClassify: false });
      importedNotes += 1;
    }

    const afterCategoryNames = new Set(this.listCategories().map((category) => normalizeName(category.name)));
    const importedCategories = Array.from(afterCategoryNames).filter((name) => !beforeCategoryNames.has(name)).length;

    return {
      importedNotes,
      importedCategories
    };
  }

  private applyAutomaticMetadata(
    note: NoteInput,
    suggestion: MetadataSuggestion | null
  ): { note: NoteInput; autoCategoryName: string | null; autoTags: string[] } {
    if (!note.autoClassify || !suggestion) {
      return { note, autoCategoryName: null, autoTags: [] };
    }

    const nextTags = Array.from(new Set([...note.tags, ...suggestion.tags]));
    const autoTags = nextTags.filter((tag) => !note.tags.includes(tag));

    let categoryId = note.categoryId;
    let autoCategoryName: string | null = null;
    if (categoryId == null && suggestion.categoryName) {
      categoryId = suggestion.categoryId ?? this.ensureCategory(suggestion.categoryName);
      autoCategoryName = suggestion.categoryName;
    }

    return {
      note: {
        ...note,
        categoryId,
        tags: nextTags
      },
      autoCategoryName,
      autoTags
    };
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('command', 'markdown')),
        title TEXT NOT NULL,
        summary TEXT,
        command_text TEXT,
        content_markdown TEXT,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_copied_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_last_copied_at ON notes(last_copied_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
      CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
    `);
  }

  private initializeFts(): boolean {
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS note_search
        USING fts5(
          note_id UNINDEXED,
          title,
          command_text,
          summary,
          content_markdown,
          tags
        );
      `);

      const rows = this.db.prepare("SELECT id FROM notes").all() as Array<{ id: number }>;
      for (const row of rows) {
        this.syncSearchIndex(row.id);
      }
      return true;
    } catch {
      return false;
    }
  }

  private syncSearchIndex(noteId: number): void {
    if (!this.ftsEnabled) {
      return;
    }

    this.db.prepare("DELETE FROM note_search WHERE note_id = ?").run(noteId);
    const note = this.getNote(noteId);
    if (!note) {
      return;
    }

    this.db
      .prepare(
        `
        INSERT INTO note_search (note_id, title, command_text, summary, content_markdown, tags)
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        note.id,
        note.title,
        note.commandText,
        note.summary,
        note.contentMarkdown,
        note.tags.join(" ")
      );
  }

  private findExistingNoteId(note: NoteInput): number | null {
    const existing = this.db
      .prepare(
        `
        SELECT id
        FROM notes
        WHERE type = ?
          AND title = ?
          AND COALESCE(command_text, '') = ?
          AND COALESCE(content_markdown, '') = ?
        LIMIT 1
        `
      )
      .get(note.type, note.title, note.commandText, note.contentMarkdown) as { id: number } | undefined;

    return existing?.id ?? null;
  }

  private ensureCategory(categoryName: string): number {
    const existing = this.db
      .prepare("SELECT id FROM categories WHERE name = ?")
      .get(categoryName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const timestamp = nowIso();
    const result = this.db
      .prepare("INSERT INTO categories (name, created_at, updated_at) VALUES (?, ?, ?)")
      .run(categoryName, timestamp, timestamp);
    return Number(result.lastInsertRowid);
  }

  private ensureTag(tagName: string): number {
    const existing = this.db
      .prepare("SELECT id FROM tags WHERE name = ?")
      .get(tagName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const result = this.db
      .prepare("INSERT INTO tags (name, created_at) VALUES (?, ?)")
      .run(tagName, nowIso());
    return Number(result.lastInsertRowid);
  }

  private cleanupUnusedTags(): void {
    this.db.exec(`
      DELETE FROM tags
      WHERE id NOT IN (
        SELECT DISTINCT tag_id FROM note_tags
      )
    `);
  }

  private addLikeSearch(where: string[], params: Array<number | string>, text: string): void {
    const pattern = `%${escapeLike(text)}%`;
    where.push(
      `(
        n.title LIKE ? ESCAPE '\\'
        OR COALESCE(n.command_text, '') LIKE ? ESCAPE '\\'
        OR COALESCE(n.summary, '') LIKE ? ESCAPE '\\'
        OR COALESCE(n.content_markdown, '') LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM note_tags nt_like
          INNER JOIN tags t_like ON t_like.id = nt_like.tag_id
          WHERE nt_like.note_id = n.id
            AND t_like.name LIKE ? ESCAPE '\\'
        )
      )`
    );
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  private queryNotes(where: string[], params: Array<number | string>, sortKey: SortKey, limit?: number): NoteRow[] {
    const sql = `
      SELECT
        n.id,
        n.type,
        n.title,
        n.summary,
        n.command_text,
        n.content_markdown,
        n.category_id,
        c.name AS category_name,
        n.created_at,
        n.updated_at,
        n.last_copied_at,
        COALESCE(GROUP_CONCAT(t.name, '|||'), '') AS tags_csv
      FROM notes n
      LEFT JOIN categories c ON c.id = n.category_id
      LEFT JOIN note_tags nt ON nt.note_id = n.id
      LEFT JOIN tags t ON t.id = nt.tag_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY n.id
      ORDER BY ${SORT_SQL[sortKey]}
      ${limit ? "LIMIT ?" : ""}
    `;

    try {
      const finalParams = limit ? [...params, limit] : params;
      return this.db.prepare(sql).all(...finalParams) as NoteRow[];
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const isFtsSyntaxError = message.includes("fts5") && message.includes("syntax error");
      if (!isFtsSyntaxError) {
        throw error;
      }

      const matchIndex = where.findIndex((clause) => clause.includes("note_search MATCH ?"));
      if (matchIndex < 0) {
        throw error;
      }

      const fallbackWhere = where.filter((_, index) => index !== matchIndex);
      const fallbackParams = [...params];
      fallbackParams.splice(matchIndex, 1);
      return this.queryNotes(fallbackWhere, fallbackParams, sortKey, limit);
    }
  }
}

function normalizeLimit(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const next = Math.max(1, Math.floor(value));
  return next;
}

function mapRowToNote(row: NoteRow): NoteDetail {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    summary: row.summary ?? "",
    commandText: row.command_text ?? "",
    contentMarkdown: row.content_markdown ?? "",
    categoryId: row.category_id,
    categoryName: row.category_name,
    tags: row.tags_csv ? row.tags_csv.split("|||").filter(Boolean) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCopiedAt: row.last_copied_at
  };
}

function normalizeNoteInput(input: NoteInput): NoteInput {
  const title = input.title.trim();
  const commandText = input.commandText.trim();
  const contentMarkdown = input.contentMarkdown.trim();
  const summary = input.summary.trim();

  if (!title) {
    throw new Error(MESSAGE.emptyTitle);
  }
  if (input.type === "command" && !commandText) {
    throw new Error(MESSAGE.emptyCommand);
  }
  if (input.type === "markdown" && !contentMarkdown) {
    throw new Error(MESSAGE.emptyMarkdown);
  }

  return {
    ...input,
    title,
    summary,
    commandText,
    contentMarkdown,
    tags: Array.from(
      new Set(
        input.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    )
  };
}

function formatCopyText(note: NoteDetail, format: CopyFormat): string {
  if (format === "command") {
    return note.commandText || note.contentMarkdown || note.summary || note.title;
  }
  if (format === "markdown") {
    return formatMarkdownExport(note);
  }
  return [note.title, note.summary, note.commandText, note.contentMarkdown]
    .filter(Boolean)
    .join("\n\n");
}

function formatMarkdownExport(note: NoteDetail): string {
  const lines: string[] = [`# ${note.title}`, ""];

  if (note.type === "command" && note.commandText) {
    lines.push(MESSAGE.headingCommand, "", "```bash", note.commandText, "```", "");
  }
  if (note.summary) {
    lines.push(MESSAGE.headingDescription, "", note.summary, "");
  }
  if (note.contentMarkdown) {
    lines.push(note.type === "markdown" ? MESSAGE.headingContent : MESSAGE.headingExtras, "", note.contentMarkdown, "");
  }
  if (note.categoryName || note.tags.length > 0) {
    lines.push(MESSAGE.headingMeta, "");
    if (note.categoryName) {
      lines.push(`${MESSAGE.metaCategory}${note.categoryName}`);
    }
    if (note.tags.length > 0) {
      lines.push(`${MESSAGE.metaTags}${note.tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*]+/g, "-");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function tokenizeFts(value: string): string {
  const tokens = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((token) => `${token}*`).join(" ");
}function tokenizeSearch(value: string): string[] {
  const tokens = value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return Array.from(new Set(tokens.filter(Boolean)));
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function rankRowsBySearch(rows: NoteRow[], query: string): NoteRow[] {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = tokenizeSearch(normalizedQuery);
  if (!normalizedQuery || tokens.length === 0) {
    return rows;
  }

  return rows
    .map((row) => ({ row, score: scoreRowAgainstQuery(row, normalizedQuery, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const copiedDiff = compareIsoDesc(left.row.last_copied_at, right.row.last_copied_at);
      if (copiedDiff !== 0) {
        return copiedDiff;
      }
      const updatedDiff = compareIsoDesc(left.row.updated_at, right.row.updated_at);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      return right.row.id - left.row.id;
    })
    .map((entry) => entry.row);
}

function scoreRowAgainstQuery(row: NoteRow, normalizedQuery: string, tokens: string[]): number {
  const title = normalizeSearchText(row.title);
  const summary = normalizeSearchText(row.summary);
  const commandText = normalizeSearchText(row.command_text);
  const contentMarkdown = normalizeSearchText(row.content_markdown);
  const categoryName = normalizeSearchText(row.category_name);
  const tagText = normalizeSearchText(row.tags_csv?.split("|||").join(" "));

  let score = 0;
  score += scoreField(title, normalizedQuery, tokens, 140);
  score += scoreField(summary, normalizedQuery, tokens, 90);
  score += scoreField(commandText, normalizedQuery, tokens, 120);
  score += scoreField(contentMarkdown, normalizedQuery, tokens, 36);
  score += scoreField(categoryName, normalizedQuery, tokens, 22);
  score += scoreField(tagText, normalizedQuery, tokens, 20);

  const mergedHaystack = [title, summary, commandText].filter(Boolean).join(" ");
  const mergedCoverage = tokens.filter((token) => mergedHaystack.includes(token) || fuzzyMatchScore(mergedHaystack, token) > 0).length;
  score += mergedCoverage * 16;
  if (mergedCoverage === tokens.length) {
    score += 30;
  }

  if (row.last_copied_at) {
    const recencyBoost = scoreRecentCopy(row.last_copied_at);
    score += recencyBoost;
  }

  return score;
}

function scoreField(text: string, normalizedQuery: string, tokens: string[], weight: number): number {
  if (!text) {
    return 0;
  }

  let score = 0;
  if (text === normalizedQuery) {
    score += weight * 7;
  } else if (text.startsWith(normalizedQuery)) {
    score += weight * 5;
  } else if (text.includes(normalizedQuery)) {
    score += weight * 3.6;
  }

  for (const token of tokens) {
    if (text === token) {
      score += weight * 4;
      continue;
    }
    if (text.startsWith(token)) {
      score += weight * 2.6;
      continue;
    }
    if (hasWordBoundaryMatch(text, token)) {
      score += weight * 2.15;
      continue;
    }
    if (text.includes(token)) {
      score += weight * 1.55;
      continue;
    }

    const fuzzyScore = fuzzyMatchScore(text, token);
    if (fuzzyScore > 0) {
      score += weight * fuzzyScore;
    }
  }

  return Math.round(score);
}

function hasWordBoundaryMatch(text: string, token: string): boolean {
  return text.includes(` ${token}`) || text.includes(`-${token}`) || text.includes(`_${token}`) || text.includes(`/${token}`);
}

function fuzzyMatchScore(text: string, token: string): number {
  if (!text || !token) {
    return 0;
  }

  let firstIndex = -1;
  let lastIndex = -1;
  let searchFrom = 0;
  let contiguousMatches = 0;

  for (const char of token) {
    const index = text.indexOf(char, searchFrom);
    if (index < 0) {
      return 0;
    }
    if (firstIndex < 0) {
      firstIndex = index;
    }
    if (lastIndex >= 0 && index === lastIndex + 1) {
      contiguousMatches += 1;
    }
    lastIndex = index;
    searchFrom = index + 1;
  }

  const span = lastIndex - firstIndex + 1;
  const compactness = token.length / Math.max(span, token.length);
  const startBonus = 1 - firstIndex / Math.max(text.length, 1);
  const contiguousBonus = contiguousMatches / Math.max(token.length - 1, 1);
  const score = compactness * 1.45 + startBonus * 0.45 + contiguousBonus * 0.35;
  return Math.max(0.35, Math.min(score, 1.85));
}

function scoreRecentCopy(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const days = (Date.now() - timestamp) / 86400000;
  if (days <= 1) {
    return 28;
  }
  if (days <= 7) {
    return 18;
  }
  if (days <= 30) {
    return 9;
  }
  return 4;
}

function compareIsoDesc(left: string | null, right: string | null): number {
  const leftTimestamp = left ? Date.parse(left) : 0;
  const rightTimestamp = right ? Date.parse(right) : 0;
  return rightTimestamp - leftTimestamp;
}

function parseLibraryImport(content: string): { categories: string[]; notes: Array<Partial<NoteDetail> & { categoryName?: string | null }> } {
  try {
    const parsed = JSON.parse(content) as { categories?: unknown; notes?: unknown };
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
          .map((item) => {
            if (typeof item === "string") {
              return item;
            }
            if (item && typeof item === "object" && "name" in item && typeof item.name === "string") {
              return item.name;
            }
            return "";
          })
          .filter(Boolean)
      : [];

    const notes = Array.isArray(parsed.notes)
      ? (parsed.notes.filter((item) => item && typeof item === "object") as Array<
          Partial<NoteDetail> & { categoryName?: string | null }
        >)
      : [];

    return { categories, notes };
  } catch {
    throw new Error(MESSAGE.invalidImportFile);
  }
}

function normalizeImportedNote(rawNote: Partial<NoteDetail>): NoteInput {
  const type = rawNote.type === "markdown" ? "markdown" : "command";
  const contentMarkdown = typeof rawNote.contentMarkdown === "string" ? rawNote.contentMarkdown : "";
  const commandText = typeof rawNote.commandText === "string" && rawNote.commandText.trim()
    ? rawNote.commandText
    : type === "command"
      ? contentMarkdown
      : "";

  return normalizeNoteInput({
    type,
    title: typeof rawNote.title === "string" ? rawNote.title : "",
    summary: typeof rawNote.summary === "string" ? rawNote.summary : "",
    commandText,
    contentMarkdown,
    categoryId: null,
    tags: Array.isArray(rawNote.tags) ? rawNote.tags.filter((tag): tag is string => typeof tag === "string") : [],
    autoClassify: false
  });
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}


