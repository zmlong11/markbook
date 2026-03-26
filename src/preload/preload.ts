import { contextBridge, ipcRenderer } from "electron";
import type { CategoryInput, CopyPayload, MarkbookApi, NoteInput, NoteQuery, WidgetDragSource } from "../shared/types.js";

const api: MarkbookApi = {
  notes: {
    list: (query?: NoteQuery) => ipcRenderer.invoke("notes:list", query),
    get: (id: number) => ipcRenderer.invoke("notes:get", id),
    classify: (input: NoteInput) => ipcRenderer.invoke("notes:classify", input),
    save: (input: NoteInput) => ipcRenderer.invoke("notes:save", input),
    delete: (id: number) => ipcRenderer.invoke("notes:delete", id)
  },
  categories: {
    list: () => ipcRenderer.invoke("categories:list"),
    save: (input: CategoryInput) => ipcRenderer.invoke("categories:save", input),
    delete: (id: number) => ipcRenderer.invoke("categories:delete", id)
  },
  tags: {
    list: () => ipcRenderer.invoke("tags:list"),
    suggest: (query: string) => ipcRenderer.invoke("tags:suggest", query)
  },
  clipboard: {
    copy: (payload: CopyPayload) => ipcRenderer.invoke("clipboard:copy", payload)
  },
  export: {
    note: (noteId: number) => ipcRenderer.invoke("export:note", noteId),
    library: () => ipcRenderer.invoke("export:library")
  },
  import: {
    library: () => ipcRenderer.invoke("import:library")
  },
  window: {
    showMain: () => ipcRenderer.invoke("window:show-main"),
    showWidget: () => ipcRenderer.invoke("window:show-widget"),
    expandWidget: () => ipcRenderer.invoke("window:expand-widget"),
    collapseWidget: () => ipcRenderer.invoke("window:collapse-widget"),
    getWidgetState: () => ipcRenderer.invoke("window:get-widget-state"),
    setWidgetPinned: (pinned: boolean) => ipcRenderer.invoke("window:set-widget-pinned", pinned),
    closeWidget: () => ipcRenderer.invoke("window:close-widget"),
    startWidgetDrag: (source: WidgetDragSource, screenX: number, screenY: number) =>
      ipcRenderer.invoke("window:start-widget-drag", source, screenX, screenY),
    moveWidgetDrag: (source: WidgetDragSource, screenX: number, screenY: number) =>
      ipcRenderer.invoke("window:move-widget-drag", source, screenX, screenY),
    endWidgetDrag: () => ipcRenderer.invoke("window:end-widget-drag")
  }
};

contextBridge.exposeInMainWorld("markbook", api);