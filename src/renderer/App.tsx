import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import WidgetShell from "./WidgetShell";
import type {
  Category,
  CopyFormat,
  ImportResult,
  MarkbookApi,
  NoteDetail,
  NoteInput,
  NoteListItem,
  SortKey
} from "../shared/types";

type ModalMode = "preview" | "editor" | null;

const TEXT = {
  appName: "MarkBook",
  searchPlaceholder: "\u641c\u7d22\u547d\u4ee4...",
  searchHint: "\u56de\u8f66\u76f4\u63a5\u590d\u5236",
  searchSorted: "\u6a21\u7cca\u5339\u914d / \u76f8\u5173\u6027",
  commands: "\u547d\u4ee4",
  newCommand: "+",
  tools: "\u22ef",
  importMigration: "\u5bfc\u5165\u8fc1\u79fb",
  exportBackup: "\u5bfc\u51fa\u5907\u4efd",
  showWidget: "\u547c\u51fa\u60ac\u6d6e\u901f\u67e5\u7a97",
  allCategories: "\u5168\u90e8",
  uncategorized: "\u672a\u5f52\u7c7b",
  commandText: "\u547d\u4ee4",
  summary: "\u7528\u9014",
  notes: "\u8865\u5145",
  copy: "\u590d\u5236",
  copied: "Copied!",
  edit: "\u6539",
  save: "\u4fdd\u5b58",
  saving: "\u4fdd\u5b58\u4e2d...",
  cancel: "\u53d6\u6d88",
  close: "\u6536\u8d77",
  more: "\u22ef",
  exportMarkdown: "\u5bfc\u51fa",
  delete: "\u5220\u9664",
  quickDelete: "\u5220",
  categoryPlaceholder: "\u8f93\u5165\u6216\u9009\u62e9\u5206\u7c7b\uff0c\u53ef\u76f4\u63a5\u65b0\u5efa",
  createTitle: "\u65b0\u547d\u4ee4",
  editTitle: "\u4fee\u6539\u547d\u4ee4",
  title: "\u6807\u9898",
  category: "\u5206\u7c7b",
  titlePlaceholder: "\u4f8b\u5982\uff1a\u67e5\u770b 8080 \u7aef\u53e3 / \u91cd\u542f nginx / Docker \u65e5\u5fd7",
  commandPlaceholder: "\u4f8b\u5982\uff1alsof -i:8080 \u6216 ss -tulpn | grep 8080",
  summaryPlaceholder: "\u7528\u4e00\u53e5\u8bdd\u8bf4\u660e\u5b83\u9002\u5408\u4ec0\u4e48\u573a\u666f",
  notesPlaceholder: "\u53ef\u9009\uff1a\u8865\u5145\u53d8\u4f53\u3001\u6ce8\u610f\u4e8b\u9879\u6216\u66f4\u957f\u8bf4\u660e",
  emptyTitle: "\u6ca1\u6709\u5339\u914d\u7684\u547d\u4ee4",
  emptyBody: "\u6362\u4e2a\u5173\u952e\u8bcd\uff0c\u6216\u8005\u65b0\u5efa\u4e00\u6761\u547d\u4ee4\u3002",
  noResultTitle: "\u6ca1\u6709\u627e\u5230\u5339\u914d\u547d\u4ee4",
  noResultBody: "\u8bd5\u8bd5\u66f4\u77ed\u7684\u5173\u952e\u8bcd\u3001\u547d\u4ee4\u7247\u6bb5\uff0c\u6216\u6362\u4e00\u79cd\u63cf\u8ff0\u65b9\u5f0f\u3002",
  emptyPreviewTitle: "\u6253\u5f00\u547d\u4ee4",
  emptyPreviewBody: "\u70b9\u51fb\u5361\u7247\u67e5\u770b\u5b8c\u6574\u8bf4\u660e\u3002",
  recentUsed: "\u6700\u8fd1\u4f7f\u7528",
  createSuccess: "\u547d\u4ee4\u5df2\u521b\u5efa",
  updateSuccess: "\u547d\u4ee4\u5df2\u66f4\u65b0",
  deleteSuccess: "\u547d\u4ee4\u5df2\u5220\u9664",
  exportSuccess: "\u5df2\u5bfc\u51fa\u5230",
  backupSuccess: "\u5907\u4efd\u5df2\u5bfc\u51fa\u5230",
  importSuccess: "\u5df2\u5bfc\u5165\u6570\u636e",
  importNotes: "\u547d\u4ee4",
  importCategories: "\u5206\u7c7b",
  deleteConfirm: "\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u6761\u547d\u4ee4\u5417\uff1f",
  bridgeUnavailable: "\u684c\u9762\u6865\u63a5\u672a\u5c31\u7eea\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u8f6f\u4ef6\u3002",
  unknownError: "\u53d1\u751f\u4e86\u672a\u77e5\u9519\u8bef"
} as const;

const EMPTY_EDITOR: NoteInput = {
  type: "command",
  title: "",
  summary: "",
  commandText: "",
  contentMarkdown: "",
  categoryId: null,
  tags: []
};

const SORT_KEY: SortKey = "updated_desc";
const COPY_FORMAT: CopyFormat = "command";
const DEFAULT_MAIN_NOTE_LIMIT = 18;
const CATEGORY_SUGGESTION_LIMIT = 6;

function getApi(): MarkbookApi {
  if (!window.markbook) {
    throw new Error(TEXT.bridgeUnavailable);
  }
  return window.markbook;
}

function App() {
  if (window.location.hash.startsWith("#widget")) {
    return <WidgetShell />;
  }

  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editorDraft, setEditorDraft] = useState<NoteInput>(EMPTY_EDITOR);
  const [editorCategoryName, setEditorCategoryName] = useState("");
  const [editorNoteId, setEditorNoteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const noteMenuRef = useRef<HTMLDivElement | null>(null);

  const activeCategoryName = useMemo(() => {
    if (selectedCategoryId == null) {
      return TEXT.allCategories;
    }
    return categories.find((item) => item.id === selectedCategoryId)?.name ?? TEXT.uncategorized;
  }, [categories, selectedCategoryId]);

  const suggestedCategories = useMemo(() => {
    const keyword = editorCategoryName.trim().toLowerCase();
    return categories
      .filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
      .slice(0, CATEGORY_SUGGESTION_LIMIT);
  }, [categories, editorCategoryName]);

  useEffect(() => {
    void hydrate();
    focusSearchSoon();
  }, []);

  useEffect(() => {
    void refreshNotes();
  }, [searchText, selectedCategoryId]);

  useEffect(() => {
    if (selectedNoteId == null) {
      setSelectedNote(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const note = await getApi().notes.get(selectedNoteId);
        if (!cancelled) {
          setSelectedNote(note);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(getMessage(fetchError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedNoteId]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (isToolsOpen && toolsMenuRef.current && target && !toolsMenuRef.current.contains(target)) {
        setIsToolsOpen(false);
      }
      if (isMoreOpen && noteMenuRef.current && target && !noteMenuRef.current.contains(target)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isMoreOpen, isToolsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.closest("[contenteditable='true']"));
      const isSearchField = target === searchInputRef.current;
      const isClickableControl = Boolean(target?.closest("button, a"));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearchSoon(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCreate();
        return;
      }

      if (event.key === "Escape") {
        if (isMoreOpen) {
          event.preventDefault();
          setIsMoreOpen(false);
          return;
        }
        if (isToolsOpen) {
          event.preventDefault();
          setIsToolsOpen(false);
          return;
        }
        if (modalMode !== null) {
          event.preventDefault();
          closeModal();
        }
        return;
      }

      if (
        event.key === "Delete" &&
        selectedNoteId != null &&
        !isFormField &&
        !isClickableControl &&
        modalMode !== "editor"
      ) {
        event.preventDefault();
        void deleteNoteById(selectedNoteId);
        return;
      }

      if (modalMode !== null) {
        return;
      }

      if (event.key === "ArrowDown" && (!isFormField || isSearchField)) {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (event.key === "ArrowUp" && (!isFormField || isSearchField)) {
        event.preventDefault();
        moveSelection(-1);
        return;
      }

      if (event.key === "Enter" && selectedNoteId != null && (!isFormField || isSearchField) && !isClickableControl) {
        event.preventDefault();
        void copyNote(selectedNoteId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMoreOpen, isToolsOpen, modalMode, selectedNoteId]);

  useEffect(() => {
    if (modalMode === null) {
      focusSearchSoon();
    }
  }, [modalMode]);

  function focusSearchSoon(select = false) {
    window.setTimeout(() => {
      if (!searchInputRef.current || modalMode !== null) {
        return;
      }
      searchInputRef.current.focus({ preventScroll: true });
      if (select) {
        searchInputRef.current.select();
      }
    }, 30);
  }

  async function hydrate() {
    try {
      const nextCategories = await getApi().categories.list();
      setCategories(nextCategories);
      await refreshNotes();
    } catch (hydrateError) {
      setError(getMessage(hydrateError));
    }
  }

  async function refreshNotes() {
    try {
      const hasScopedResults = Boolean(searchText.trim()) || selectedCategoryId != null;
      const nextNotes = await getApi().notes.list({
        searchText,
        categoryId: selectedCategoryId,
        sortKey: SORT_KEY,
        limit: hasScopedResults ? undefined : DEFAULT_MAIN_NOTE_LIMIT
      });

      setNotes(nextNotes);
      setSelectedNoteId((currentId) => {
        if (nextNotes.length === 0) {
          return null;
        }
        if (currentId != null && nextNotes.some((item) => item.id === currentId)) {
          return currentId;
        }
        return nextNotes[0]?.id ?? null;
      });
    } catch (refreshError) {
      setError(getMessage(refreshError));
    }
  }

  function moveSelection(step: -1 | 1) {
    if (notes.length === 0) {
      return;
    }

    const currentIndex = notes.findIndex((item) => item.id === selectedNoteId);
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = Math.min(notes.length - 1, Math.max(0, safeIndex + step));
    setSelectedNoteId(notes[nextIndex]?.id ?? null);
  }

  function openPreview(noteId: number) {
    setSelectedNoteId(noteId);
    setIsMoreOpen(false);
    setModalMode("preview");
  }

  function openCreate() {
    const presetCategoryName =
      selectedCategoryId == null
        ? ""
        : categories.find((item) => item.id === selectedCategoryId)?.name ?? "";
    setEditorDraft(EMPTY_EDITOR);
    setEditorCategoryName(presetCategoryName);
    setEditorNoteId(null);
    setIsToolsOpen(false);
    setIsMoreOpen(false);
    setModalMode("editor");
  }

  function openEdit(note: NoteDetail | null) {
    if (!note) {
      return;
    }
    setEditorDraft(toEditorInput(note));
    setEditorCategoryName(note.categoryName ?? "");
    setEditorNoteId(note.id);
    setIsMoreOpen(false);
    setModalMode("editor");
  }

  function closeModal() {
    setModalMode(null);
    setIsMoreOpen(false);
  }

  async function saveNote() {
    if (!editorDraft.title.trim()) {
      setError("\u8bf7\u8f93\u5165\u6807\u9898");
      return;
    }

    if (editorDraft.type === "command" && !editorDraft.commandText.trim()) {
      setError("\u8bf7\u8f93\u5165\u547d\u4ee4\u5185\u5bb9");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const normalizedCategoryName = editorCategoryName.trim();
      let categoryId: number | null = null;

      if (normalizedCategoryName) {
        const matchedCategory = categories.find(
          (item) => item.name.trim().toLowerCase() === normalizedCategoryName.toLowerCase()
        );
        categoryId = matchedCategory
          ? matchedCategory.id
          : (await getApi().categories.save({ name: normalizedCategoryName })).id;
      }

      const result = await getApi().notes.save({
        ...editorDraft,
        categoryId,
        id: editorNoteId ?? undefined,
        autoClassify: false
      });
      setToast(editorNoteId == null ? TEXT.createSuccess : TEXT.updateSuccess);
      setSelectedNoteId(result.id);
      await hydrate();
      const latestNote = await getApi().notes.get(result.id);
      setSelectedNote(latestNote);
      setModalMode("preview");
    } catch (saveError) {
      setError(getMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function copyNote(noteId: number, format: CopyFormat = COPY_FORMAT) {
    try {
      await getApi().clipboard.copy({ noteId, format });
      setToast(TEXT.copied);
      await refreshNotes();
      if (selectedNoteId === noteId) {
        const latest = await getApi().notes.get(noteId);
        setSelectedNote(latest);
      }
      if (modalMode == null) {
        focusSearchSoon();
      }
    } catch (copyError) {
      setError(getMessage(copyError));
    }
  }

  async function deleteNoteById(noteId: number) {
    if (!window.confirm(TEXT.deleteConfirm)) {
      return;
    }

    try {
      await getApi().notes.delete(noteId);
      setToast(TEXT.deleteSuccess);
      setIsMoreOpen(false);
      if (selectedNoteId === noteId) {
        setSelectedNote(null);
      }
      if (modalMode === "preview" && selectedNoteId === noteId) {
        closeModal();
      }
      await hydrate();
      if (modalMode == null) {
        focusSearchSoon();
      }
    } catch (deleteError) {
      setError(getMessage(deleteError));
    }
  }

  async function deleteCurrentNote() {
    if (!selectedNote) {
      return;
    }

    await deleteNoteById(selectedNote.id);
  }

  async function exportCurrentNote() {
    if (!selectedNote) {
      return;
    }

    try {
      const result = await getApi().export.note(selectedNote.id);
      if (!result.canceled && result.filePath) {
        setToast(`${TEXT.exportSuccess} ${result.filePath}`);
      }
      setIsMoreOpen(false);
    } catch (exportError) {
      setError(getMessage(exportError));
    }
  }

  async function exportLibrary() {
    try {
      const result = await getApi().export.library();
      if (!result.canceled && result.filePath) {
        setToast(`${TEXT.backupSuccess} ${result.filePath}`);
      }
      setIsToolsOpen(false);
    } catch (exportError) {
      setError(getMessage(exportError));
    }
  }

  async function importLibrary() {
    try {
      const result = await getApi().import.library();
      if (!result.canceled) {
        setToast(buildImportToast(result));
        await hydrate();
      }
      setIsToolsOpen(false);
    } catch (importError) {
      setError(getMessage(importError));
    }
  }

  async function showWidget() {
    try {
      await getApi().window.showWidget();
      setIsToolsOpen(false);
    } catch (widgetError) {
      setError(getMessage(widgetError));
    }
  }

  return (
    <div className="cmd-app-shell">
      <header className="cmd-topbar">
        <div className="cmd-utility-row">
          <div className="cmd-brand">
            <h1>{TEXT.appName}</h1>
          </div>

          <div className="cmd-top-actions">
            <button type="button" className="soft-button primary-button icon-button" aria-label={TEXT.createTitle} onClick={openCreate}>
              {TEXT.newCommand}
            </button>

            <div className="cmd-menu" ref={toolsMenuRef}>
              <button
                type="button"
                className="soft-button icon-button"
                aria-label={TEXT.tools}
                onClick={() => setIsToolsOpen((value) => !value)}
              >
                {TEXT.tools}
              </button>
              {isToolsOpen ? (
                <div className="cmd-popover">
                  <button type="button" className="cmd-popover-item" onClick={() => void showWidget()}>
                    {TEXT.showWidget}
                  </button>
                  <button type="button" className="cmd-popover-item" onClick={() => void importLibrary()}>
                    {TEXT.importMigration}
                  </button>
                  <button type="button" className="cmd-popover-item" onClick={() => void exportLibrary()}>
                    {TEXT.exportBackup}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="cmd-search-wrap">
          <input
            ref={searchInputRef}
            className="cmd-search-input"
            type="text"
            value={searchText}
            placeholder={TEXT.searchPlaceholder}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
                return;
              }
              if (event.key === "Enter" && selectedNoteId != null) {
                event.preventDefault();
                void copyNote(selectedNoteId);
              }
            }}
          />
          <div className="cmd-search-meta">
            <span>{activeCategoryName}</span>
            <span>{searchText.trim() ? TEXT.searchSorted : TEXT.searchHint}</span>
          </div>
        </div>
      </header>

      <div className="cmd-filter-row" role="tablist" aria-label={TEXT.category}>
        <button
          type="button"
          className={`cmd-filter-chip ${selectedCategoryId == null ? "is-active" : ""}`}
          onClick={() => {
            setSelectedCategoryId(null);
            focusSearchSoon();
          }}
        >
          {TEXT.allCategories}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`cmd-filter-chip ${selectedCategoryId === category.id ? "is-active" : ""}`}
            onClick={() => {
              setSelectedCategoryId(category.id);
              focusSearchSoon();
            }}
          >
            <span className="cmd-filter-label">{category.name}</span>
          </button>
        ))}
      </div>

      <main className="cmd-main">
        <section className="cmd-list-panel">
          <div className="cmd-section-head compact-strip">
            <span>{searchText.trim() ? TEXT.searchSorted : activeCategoryName}</span>
          </div>

          {notes.length === 0 ? (
            <div className="cmd-empty-state">
              <h3>{TEXT.emptyTitle}</h3>
              <p>{TEXT.emptyBody}</p>
            </div>
          ) : (
            <div className="cmd-list" role="listbox" aria-label={TEXT.commands}>
              {notes.map((note) => {
                const active = note.id === selectedNoteId;
                return (
                  <article
                    key={note.id}
                    className={`cmd-card ${active ? "is-active" : ""}`}
                    role="option"
                    aria-selected={active}
                    tabIndex={0}
                    onClick={() => openPreview(note.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void copyNote(note.id);
                        return;
                      }
                      if (event.key === " ") {
                        event.preventDefault();
                        openPreview(note.id);
                      }
                    }}
                  >
                    <div className="cmd-card-main">
                      <div className="cmd-card-head">
                        <div className="cmd-card-copy">
                          <h3 className="cmd-card-title">{renderHighlightedText(note.title, searchText)}</h3>
                          <p className="cmd-card-summary">
                            {renderHighlightedText(note.summary || "\u6682\u65e0\u8bf4\u660e", searchText)}
                          </p>
                        </div>
                      </div>
                      <div className="cmd-card-command-row">
                        <code className="cmd-card-command">{renderHighlightedText(getCardCommand(note), searchText)}</code>
                        <div className="cmd-card-actions">
                          <button
                            type="button"
                            className="ghost-button card-copy-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyNote(note.id);
                            }}
                          >
                            {TEXT.copy}
                          </button>
                          <button
                            type="button"
                            className="ghost-button card-delete-button"
                            aria-label={TEXT.delete}
                            title={TEXT.delete}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteNoteById(note.id);
                            }}
                          >
                            {TEXT.quickDelete}
                          </button>
                        </div>
                      </div>
                      <div className="cmd-card-meta">
                        {isRecentlyCopied(note.lastCopiedAt) ? <span className="cmd-meta-pill">{TEXT.recentUsed}</span> : null}
                        <span className="cmd-card-badge">{note.categoryName || TEXT.uncategorized}</span>
                        <span>{formatDate(note.updatedAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {modalMode ? (
        <div
          className="cmd-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }
            if (modalMode === "preview") {
              closeModal();
            }
          }}
        >
          <div className="cmd-modal" role="dialog" aria-modal="true">
            {modalMode === "preview" ? (
              selectedNote ? (
                <>
                  <div className="cmd-modal-head">
                    <div>
                      <span className="cmd-card-badge">{selectedNote.categoryName || TEXT.uncategorized}</span>
                      <h2>{selectedNote.title}</h2>
                      <p>{formatDate(selectedNote.updatedAt)}</p>
                    </div>
                    <div className="cmd-modal-actions">
                      <button
                        type="button"
                        className="soft-button primary-button"
                        onClick={() => void copyNote(selectedNote.id)}
                      >
                        {TEXT.copy}
                      </button>
                      <button
                        type="button"
                        className="soft-button icon-button"
                        onClick={() => openEdit(selectedNote)}
                      >
                        {TEXT.edit}
                      </button>
                      <div className="cmd-menu" ref={noteMenuRef}>
                        <button
                          type="button"
                          className="soft-button icon-button"
                          onClick={() => setIsMoreOpen((value) => !value)}
                        >
                          {TEXT.more}
                        </button>
                        {isMoreOpen ? (
                          <div className="cmd-popover">
                            <button
                              type="button"
                              className="cmd-popover-item"
                              onClick={() => void exportCurrentNote()}
                            >
                              {TEXT.exportMarkdown}
                            </button>
                            <button
                              type="button"
                              className="cmd-popover-item danger-item"
                              onClick={() => void deleteCurrentNote()}
                            >
                              {TEXT.delete}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <button type="button" className="soft-button" onClick={closeModal}>
                        {TEXT.close}
                      </button>
                    </div>
                  </div>

                  <section className="cmd-modal-section">
                    <pre className="cmd-modal-command">
                      <code>{selectedNote.commandText || selectedNote.summary || selectedNote.title}</code>
                    </pre>
                  </section>

                  {selectedNote.summary ? (
                    <section className="cmd-modal-section">
                      <p>{selectedNote.summary}</p>
                    </section>
                  ) : null}

                  {selectedNote.contentMarkdown ? (
                    <section className="cmd-modal-section markdown-body">
                      <ReactMarkdown>{selectedNote.contentMarkdown}</ReactMarkdown>
                    </section>
                  ) : null}
                </>
              ) : (
                <div className="cmd-empty-state modal-empty-state">
                  <h3>{TEXT.emptyPreviewTitle}</h3>
                  <p>{TEXT.emptyPreviewBody}</p>
                </div>
              )
            ) : (
              <>
                <div className="cmd-modal-head compact-head">
                  <div>
                    <h2>{editorNoteId == null ? TEXT.createTitle : TEXT.editTitle}</h2>
                  </div>
                  <div className="cmd-modal-actions">
                    <button type="button" className="soft-button" onClick={closeModal}>
                      {TEXT.cancel}
                    </button>
                    <button
                      type="button"
                      className="soft-button primary-button"
                      onClick={() => void saveNote()}
                      disabled={isSaving}
                    >
                      {isSaving ? TEXT.saving : TEXT.save}
                    </button>
                  </div>
                </div>

                <div className="cmd-editor-form">
                  <div className="cmd-editor-grid compact-grid">
                    <label className="field-block">
                      <span>{TEXT.category}</span>
                      <input
                        type="text"
                        value={editorCategoryName}
                        placeholder={TEXT.categoryPlaceholder}
                        onChange={(event) => setEditorCategoryName(event.target.value)}
                      />
                    </label>
                  </div>

                  {suggestedCategories.length > 0 ? (
                    <div className="cmd-category-suggestions">
                      {suggestedCategories.map((category) => {
                        const active = category.name.trim().toLowerCase() === editorCategoryName.trim().toLowerCase();
                        return (
                          <button
                            key={category.id}
                            type="button"
                            className={`cmd-category-suggestion ${active ? "is-active" : ""}`}
                            onClick={() => setEditorCategoryName(category.name)}
                          >
                            {category.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <label className="field-block">
                    <span>{TEXT.title}</span>
                    <input
                      type="text"
                      value={editorDraft.title}
                      placeholder={TEXT.titlePlaceholder}
                      onChange={(event) =>
                        setEditorDraft((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>

                  <label className="field-block">
                    <span>{TEXT.commandText}</span>
                    <textarea
                      rows={4}
                      value={editorDraft.commandText}
                      placeholder={TEXT.commandPlaceholder}
                      onChange={(event) =>
                        setEditorDraft((current) => ({ ...current, commandText: event.target.value }))
                      }
                    />
                  </label>

                  <label className="field-block">
                    <span>{TEXT.summary}</span>
                    <textarea
                      rows={3}
                      value={editorDraft.summary}
                      placeholder={TEXT.summaryPlaceholder}
                      onChange={(event) =>
                        setEditorDraft((current) => ({ ...current, summary: event.target.value }))
                      }
                    />
                  </label>

                  <label className="field-block">
                    <span>{TEXT.notes}</span>
                    <textarea
                      rows={10}
                      value={editorDraft.contentMarkdown}
                      placeholder={TEXT.notesPlaceholder}
                      onChange={(event) =>
                        setEditorDraft((current) => ({
                          ...current,
                          contentMarkdown: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {error ? <div className="cmd-floating-message error">{error}</div> : null}
      {toast ? <div className="cmd-floating-message toast">{toast}</div> : null}
    </div>
  );
}

function getCardCommand(note: NoteListItem) {
  return note.commandText?.trim() || note.summary?.trim() || note.title;
}

function isRecentlyCopied(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= 14 * 86400000;
}

function renderHighlightedText(text: string, query: string) {
  const ranges = findHighlightRanges(text, query);
  if (ranges.length === 0) {
    return text;
  }

  const nodes: JSX.Element[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (cursor < range.start) {
      nodes.push(<span key={`plain-${index}-${cursor}`}>{text.slice(cursor, range.start)}</span>);
    }
    nodes.push(
      <mark key={`mark-${index}-${range.start}`} className="cmd-highlight">
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key={`plain-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

function findHighlightRanges(text: string, query: string): Array<{ start: number; end: number }> {
  const source = text.trim();
  const normalizedQuery = query.trim().toLowerCase();
  if (!source || !normalizedQuery) {
    return [];
  }

  const ranges = collectExactRanges(source, normalizedQuery);
  if (ranges.length > 0) {
    return mergeHighlightRanges(ranges);
  }

  return buildFuzzyRanges(source, normalizedQuery.replace(/\s+/g, ""));
}

function collectExactRanges(text: string, query: string): Array<{ start: number; end: number }> {
  const lowered = text.toLowerCase();
  const terms = Array.from(
    new Set([query, ...(query.match(/[\p{L}\p{N}_-]+/gu) ?? [])].map((item) => item.trim()).filter(Boolean))
  );
  const ranges: Array<{ start: number; end: number }> = [];

  for (const term of terms) {
    let cursor = 0;
    while (cursor < lowered.length) {
      const index = lowered.indexOf(term.toLowerCase(), cursor);
      if (index < 0) {
        break;
      }
      ranges.push({ start: index, end: index + term.length });
      cursor = index + Math.max(term.length, 1);
    }
  }

  return ranges;
}

function buildFuzzyRanges(text: string, query: string): Array<{ start: number; end: number }> {
  if (!query) {
    return [];
  }

  const lowered = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;

  for (const char of query) {
    const index = lowered.indexOf(char, searchFrom);
    if (index < 0) {
      return [];
    }
    ranges.push({ start: index, end: index + 1 });
    searchFrom = index + 1;
  }

  return ranges;
}

function mergeHighlightRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }];

  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }

  return merged;
}

function toEditorInput(note: NoteDetail): NoteInput {
  return {
    id: note.id,
    type: note.type,
    title: note.title,
    summary: note.summary,
    commandText: note.commandText,
    contentMarkdown: note.contentMarkdown,
    categoryId: note.categoryId,
    tags: note.tags
  };
}

function buildImportToast(result: ImportResult) {
  const noteCount = result.importedNotes ?? 0;
  const categoryCount = result.importedCategories ?? 0;
  return `${TEXT.importSuccess} ${noteCount} ${TEXT.importNotes} / ${categoryCount} ${TEXT.importCategories}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return TEXT.unknownError;
}

export default App;








