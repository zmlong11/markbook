import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { MarkbookApi, NoteListItem, WidgetDragSource, WidgetState } from "../shared/types";

const TEXT = {
  title: "\u547d\u4ee4\u901f\u67e5",
  searchPlaceholder: "\u641c\u7d22\u547d\u4ee4\u3001\u8bf4\u660e\u6216\u6807\u7b7e",
  recent: "\u6700\u8fd1\u547d\u4ee4",
  searchResult: "\u641c\u7d22\u7ed3\u679c",
  empty: "\u8fd8\u6ca1\u6709\u53ef\u663e\u793a\u7684\u547d\u4ee4\uff0c\u5148\u5728\u5b8c\u6574\u754c\u9762\u91cc\u6dfb\u52a0\u51e0\u6761\u5427\u3002",
  uncategorized: "\u672a\u5206\u7c7b",
  copy: "\u590d\u5236",
  copied: "\u5df2\u590d\u5236",
  bridgeUnavailable: "\u684c\u9762\u529f\u80fd\u8fde\u63a5\u672a\u5c31\u7eea\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u8f6f\u4ef6\u3002",
  unknownError: "\u53d1\u751f\u4e86\u672a\u77e5\u9519\u8bef"
} as const;

const DRAG_THRESHOLD = 5;
const DEFAULT_WIDGET_NOTE_LIMIT = 8;

function getApi(): MarkbookApi {
  if (!window.markbook) {
    throw new Error(TEXT.bridgeUnavailable);
  }
  return window.markbook;
}

function WidgetShell() {
  const isButtonMode = window.location.hash === "#widget-button";
  const [searchText, setSearchText] = useState("");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [widgetState, setWidgetState] = useState<WidgetState>({
    pinned: true,
    expanded: !isButtonMode,
    docked: true,
    side: "right"
  });
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragStateRef = useRef<{
    source: WidgetDragSource;
    moved: boolean;
    startX: number;
    startY: number;
    clickAction?: () => void;
  } | null>(null);

  const deferredSearchText = useDeferredValue(searchText);
  const widgetTitle = useMemo(
    () => (deferredSearchText.trim() ? TEXT.searchResult : TEXT.recent),
    [deferredSearchText]
  );

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const pageClass = isButtonMode ? "widget-button-page" : "widget-panel-page";
    root.classList.add(pageClass);
    body.classList.add(pageClass);

    return () => {
      root.classList.remove(pageClass);
      body.classList.remove(pageClass);
    };
  }, [isButtonMode]);

  useEffect(() => {
    void hydrate();
  }, []);

  useEffect(() => {
    if (isButtonMode) {
      return;
    }
    void refreshNotes();
  }, [deferredSearchText, isButtonMode]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      detachDragListeners();
    };
  }, []);

  async function hydrate() {
    try {
      const state = await getApi().window.getWidgetState();
      setWidgetState(state);
      if (!isButtonMode) {
        await refreshNotes();
      }
    } catch (hydrateError) {
      setError(getMessage(hydrateError));
    }
  }

  async function refreshNotes() {
    try {
      const hasSearch = Boolean(deferredSearchText.trim());
      const nextNotes = await getApi().notes.list({
        searchText: deferredSearchText.trim() || undefined,
        sortKey: "updated_desc",
        limit: hasSearch ? undefined : DEFAULT_WIDGET_NOTE_LIMIT
      });
      const commandNotes = nextNotes.filter((note) => note.type === "command");
      setNotes(commandNotes);
      setError(null);
    } catch (notesError) {
      setError(getMessage(notesError));
    }
  }

  async function expandWidget() {
    try {
      const nextState = await getApi().window.expandWidget();
      setWidgetState(nextState);
    } catch (expandError) {
      setError(getMessage(expandError));
    }
  }

  async function copyNote(note: NoteListItem) {
    try {
      await getApi().clipboard.copy({
        noteId: note.id,
        format: note.type === "command" ? "command" : "plain"
      });
      setToast(`${TEXT.copied} ${note.title}`);
    } catch (copyError) {
      setError(getMessage(copyError));
    }
  }

  async function beginWidgetDrag(
    source: WidgetDragSource,
    event: React.MouseEvent<HTMLElement>,
    clickAction?: () => void
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      source,
      moved: false,
      startX: event.screenX,
      startY: event.screenY,
      clickAction
    };
    await getApi().window.startWidgetDrag(source, event.screenX, event.screenY);
    attachDragListeners();
  }

  function attachDragListeners() {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function detachDragListeners() {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(event: MouseEvent) {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const distanceX = Math.abs(event.screenX - dragState.startX);
    const distanceY = Math.abs(event.screenY - dragState.startY);
    if (distanceX > DRAG_THRESHOLD || distanceY > DRAG_THRESHOLD) {
      dragState.moved = true;
    }

    void getApi().window.moveWidgetDrag(dragState.source, event.screenX, event.screenY);
  }

  function handleMouseUp() {
    const dragState = dragStateRef.current;
    detachDragListeners();
    dragStateRef.current = null;
    void getApi().window.endWidgetDrag();

    if (!dragState?.moved) {
      dragState.clickAction?.();
    }
  }

  function handlePanelMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a")) {
      return;
    }
    void beginWidgetDrag("panel", event);
  }

  if (isButtonMode) {
    return (
      <div className={`widget-button-shell side-${widgetState.side}`}>
        <button
          className="widget-button-trigger"
          onMouseDown={(event) => {
            void beginWidgetDrag("button", event, () => {
              void expandWidget();
            });
          }}
          aria-label={TEXT.title}
        >
          <span className="widget-button-ring" />
          <span className="widget-button-core">
            <WidgetGlyph />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="widget-panel-shell">
      <div className="widget-panel-frame" onMouseDown={handlePanelMouseDown}>
        <div className="widget-panel-head">
          <div className="widget-panel-brand">
            <span className="widget-panel-brand-icon">
              <WidgetGlyph />
            </span>
            <div>
              <span className="widget-panel-overline">MARKBOOK</span>
              <h1>{TEXT.title}</h1>
            </div>
          </div>
        </div>

        <label className="widget-panel-search">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={TEXT.searchPlaceholder}
          />
        </label>

        <section className="widget-panel-section">
          <div className="widget-panel-section-head">
            <h2>{widgetTitle}</h2>
            <span>{notes.length}</span>
          </div>

          <div className="widget-panel-list">
            {notes.map((note) => (
              <article className="widget-panel-card" key={note.id}>
                <button className="widget-panel-copy" onClick={() => void copyNote(note)}>
                  {TEXT.copy}
                </button>
                <h3>{note.title}</h3>
                <p>{note.commandText || note.summary || note.contentMarkdown}</p>
                <div className="widget-panel-meta">
                  <span>{note.categoryName ?? TEXT.uncategorized}</span>
                  <span>{formatDate(note.updatedAt)}</span>
                </div>
              </article>
            ))}
            {notes.length === 0 ? <div className="widget-panel-empty">{TEXT.empty}</div> : null}
          </div>
        </section>

        {error ? <div className="widget-panel-error">{error}</div> : null}
        {toast ? <div className="widget-panel-toast">{toast}</div> : null}
      </div>
    </div>
  );
}

function WidgetGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5a12 12 0 0 1 16 0" />
      <path d="M7.5 14a7 7 0 0 1 9 0" />
      <path d="M10.75 17.5a2.8 2.8 0 0 1 2.5 0" />
      <circle cx="18" cy="18" r="3" />
      <path d="m18 13.5 1.1-.46" />
      <path d="m15.54 15.54-.78-.78" />
      <path d="m22.5 18 1.1-.46" />
      <path d="m20.46 20.46.78.78" />
    </svg>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : TEXT.unknownError;
}

export default WidgetShell;