import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  type OpenDialogOptions,
  type Rectangle,
  type SaveDialogOptions
} from "electron";
import type {
  CategoryInput,
  CopyPayload,
  NoteInput,
  NoteQuery,
  WidgetDragSource,
  WidgetSide,
  WidgetState
} from "../shared/types.js";
import { MarkbookDatabase } from "./database.js";

const DIALOG_TITLE = {
  exportNote: "\u5bfc\u51fa\u7b14\u8bb0\u4e3a Markdown",
  exportLibrary: "\u5bfc\u51fa\u77e5\u8bc6\u5e93\u5907\u4efd",
  importLibrary: "\u5bfc\u5165\u7b14\u8bb0\u8fc1\u79fb\u6587\u4ef6",
  markdown: "Markdown",
  json: "JSON"
} as const;

const APP_VERSION = "1.0.0";
const MAIN_WINDOW_TITLE = `MarkBook ${APP_VERSION}`;
const WIDGET_BUTTON = { width: 72, height: 72 } as const;
const WIDGET_PANEL = { width: 432, height: 568 } as const;
const WIDGET_MARGIN = 18;
const WIDGET_DOCK_THRESHOLD = 56;
const WIDGET_PANEL_Y_OFFSET = 12;
const WIDGET_BLUR_COLLAPSE_DELAY = 120;

type WidgetPosition = {
  x: number;
  y: number;
};

type WidgetDragSession = {
  source: WidgetDragSource;
  offsetX: number;
  offsetY: number;
};

type ShapedBrowserWindow = BrowserWindow & {
  setShape?: (rectangles: Rectangle[]) => void;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let widgetButtonWindow: BrowserWindow | null = null;
let widgetPanelWindow: BrowserWindow | null = null;
let database: MarkbookDatabase;
let widgetPinned = true;
let widgetExpanded = false;
let widgetDocked = true;
let widgetSide: WidgetSide = "right";
let widgetPosition: WidgetPosition | null = null;
let widgetMoveCommitTimer: NodeJS.Timeout | null = null;
let widgetBoundsSyncTimer: NodeJS.Timeout | null = null;
let widgetBlurTimer: NodeJS.Timeout | null = null;
let syncingWidgetBounds = false;
let widgetDragSession: WidgetDragSession | null = null;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  Menu.setApplicationMenu(null);
  database = new MarkbookDatabase(path.join(app.getPath("userData"), "markbook.db"));
  widgetPosition = getDefaultWidgetPosition();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    }
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: MAIN_WINDOW_TITLE,
    backgroundColor: "#f4efe5",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  void loadRenderer(mainWindow);
}

function createWidgetButtonWindow(): void {
  widgetButtonWindow = new BrowserWindow({
    ...getWidgetButtonBounds(),
    title: "MarkBook Widget Button",
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: widgetPinned,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  configureWidgetWindow(widgetButtonWindow);
  applyButtonWindowShape(widgetButtonWindow);
  widgetButtonWindow.on("move", () => {
    handleWidgetWindowMove("button");
  });
  widgetButtonWindow.on("closed", () => {
    clearWidgetMoveCommitTimer();
    widgetButtonWindow = null;
  });

  void loadRenderer(widgetButtonWindow, "widget-button");
}

function createWidgetPanelWindow(): void {
  widgetPanelWindow = new BrowserWindow({
    ...getWidgetPanelBounds(),
    title: "MarkBook Widget Panel",
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: widgetPinned,
    transparent: false,
    backgroundColor: "#f8f4ec",
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  configureWidgetWindow(widgetPanelWindow);
  widgetPanelWindow.on("move", () => {
    handleWidgetWindowMove("panel");
  });
  widgetPanelWindow.on("blur", () => {
    schedulePanelCollapseOnBlur();
  });
  widgetPanelWindow.on("focus", () => {
    clearWidgetBlurTimer();
  });
  widgetPanelWindow.on("closed", () => {
    clearWidgetMoveCommitTimer();
    clearWidgetBlurTimer();
    widgetPanelWindow = null;
  });

  void loadRenderer(widgetPanelWindow, "widget-panel");
}

function configureWidgetWindow(window: BrowserWindow): void {
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setMenuBarVisibility(false);
  window.webContents.on("context-menu", () => {
    showWidgetContextMenu(window);
  });
}

function applyButtonWindowShape(window: BrowserWindow): void {
  const shapedWindow = window as ShapedBrowserWindow;
  if (!shapedWindow.setShape) {
    return;
  }

  const rectangles: Rectangle[] = [];
  const radius = WIDGET_BUTTON.width / 2;
  const center = radius;

  for (let y = 0; y < WIDGET_BUTTON.height; y += 1) {
    const dy = y + 0.5 - center;
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const x = Math.max(0, Math.floor(center - halfWidth));
    const width = Math.min(WIDGET_BUTTON.width - x, Math.ceil(halfWidth * 2));
    if (width > 0) {
      rectangles.push({ x, y, width, height: 1 });
    }
  }

  shapedWindow.setShape(rectangles);
}

async function loadRenderer(window: BrowserWindow, hash?: string): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = hash ? `${devServerUrl}#${hash}` : devServerUrl;
    await window.loadURL(url);
    return;
  }

  await window.loadFile(path.join(app.getAppPath(), "dist", "index.html"), hash ? { hash } : undefined);
}

function registerIpcHandlers(): void {
  ipcMain.handle("notes:list", (_event, query?: NoteQuery) => database.listNotes(query));
  ipcMain.handle("notes:get", (_event, id: number) => database.getNote(id));
  ipcMain.handle("notes:classify", (_event, input: NoteInput) => database.classifyNote(input));
  ipcMain.handle("notes:save", (_event, input: NoteInput) => database.saveNote(input));
  ipcMain.handle("notes:delete", (_event, id: number) => {
    database.deleteNote(id);
  });

  ipcMain.handle("categories:list", () => database.listCategories());
  ipcMain.handle("categories:save", (_event, input: CategoryInput) => database.saveCategory(input));
  ipcMain.handle("categories:delete", (_event, id: number) => {
    database.deleteCategory(id);
  });

  ipcMain.handle("tags:list", () => database.listTags());
  ipcMain.handle("tags:suggest", (_event, query: string) => database.suggestTags(query));

  ipcMain.handle("clipboard:copy", (_event, payload: CopyPayload) => {
    const text = database.copyNote(payload.noteId, payload.format);
    clipboard.writeText(text);
    return { text };
  });

  ipcMain.handle("export:note", async (_event, noteId: number) => {
    const exportPayload = database.exportNoteMarkdown(noteId);
    const result = await showSaveDialog({
      title: DIALOG_TITLE.exportNote,
      defaultPath: exportPayload.fileName,
      filters: [{ name: DIALOG_TITLE.markdown, extensions: ["md"] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await writeFile(result.filePath, exportPayload.content, "utf8");
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("export:library", async () => {
    const exportPayload = database.exportLibrary();
    const result = await showSaveDialog({
      title: DIALOG_TITLE.exportLibrary,
      defaultPath: exportPayload.fileName,
      filters: [{ name: DIALOG_TITLE.json, extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await writeFile(result.filePath, exportPayload.content, "utf8");
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("import:library", async () => {
    const result = await showOpenDialog({
      title: DIALOG_TITLE.importLibrary,
      properties: ["openFile"],
      filters: [{ name: DIALOG_TITLE.json, extensions: ["json"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const content = await readFile(filePath, "utf8");
    const imported = database.importLibrary(content);
    return { canceled: false, filePath, ...imported };
  });

  ipcMain.handle("window:show-main", () => {
    ensureMainWindow();
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  ipcMain.handle("window:show-widget", () => {
    showWidgetButtonMode();
    return getWidgetState();
  });

  ipcMain.handle("window:expand-widget", () => {
    showWidgetPanelMode();
    return getWidgetState();
  });

  ipcMain.handle("window:collapse-widget", () => {
    collapseToWidgetButton();
    return getWidgetState();
  });

  ipcMain.handle("window:get-widget-state", () => getWidgetState());
  ipcMain.handle("window:set-widget-pinned", (_event, pinned: boolean) => {
    widgetPinned = pinned;
    widgetButtonWindow?.setAlwaysOnTop(pinned);
    widgetPanelWindow?.setAlwaysOnTop(pinned);
    return getWidgetState();
  });
  ipcMain.handle("window:close-widget", () => {
    closeWidgetWindows();
  });
  ipcMain.handle("window:start-widget-drag", (_event, source: WidgetDragSource, screenX: number, screenY: number) => {
    return startWidgetDrag(source, screenX, screenY);
  });
  ipcMain.handle("window:move-widget-drag", (_event, source: WidgetDragSource, screenX: number, screenY: number) => {
    moveWidgetDrag(source, screenX, screenY);
    return getWidgetState();
  });
  ipcMain.handle("window:end-widget-drag", () => {
    endWidgetDrag();
    return getWidgetState();
  });
}

function ensureMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
}

function ensureWidgetButtonWindow(): void {
  if (!widgetButtonWindow || widgetButtonWindow.isDestroyed()) {
    createWidgetButtonWindow();
  }
}

function ensureWidgetPanelWindow(): void {
  if (!widgetPanelWindow || widgetPanelWindow.isDestroyed()) {
    createWidgetPanelWindow();
  }
}

function showWidgetButtonMode(): void {
  ensureWidgetButtonWindow();
  widgetExpanded = false;
  syncWidgetDockState();
  syncButtonWindow();
  hideWidgetPanelWindow();
  showWidgetButtonWindow();
}

function showWidgetPanelMode(): void {
  ensureWidgetButtonWindow();
  ensureWidgetPanelWindow();
  clearWidgetBlurTimer();
  widgetExpanded = true;
  syncWidgetDockState();
  syncPanelWindow();
  hideWidgetButtonWindow();
  showWidgetPanelWindow();
}

function collapseToWidgetButton(): void {
  ensureWidgetButtonWindow();
  clearWidgetBlurTimer();
  widgetExpanded = false;
  syncWidgetDockState();
  syncButtonWindow();
  hideWidgetPanelWindow();
  showWidgetButtonWindow();
}

function showWidgetButtonWindow(): void {
  if (!widgetButtonWindow) {
    return;
  }

  widgetButtonWindow.showInactive();
  widgetButtonWindow.moveTop();
}

function showWidgetPanelWindow(): void {
  if (!widgetPanelWindow) {
    return;
  }

  widgetPanelWindow.show();
  widgetPanelWindow.moveTop();
  widgetPanelWindow.focus();
}

function hideWidgetButtonWindow(): void {
  if (widgetButtonWindow && !widgetButtonWindow.isDestroyed()) {
    widgetButtonWindow.hide();
  }
}

function hideWidgetPanelWindow(): void {
  if (widgetPanelWindow && !widgetPanelWindow.isDestroyed()) {
    widgetPanelWindow.hide();
  }
}

function closeWidgetWindows(): void {
  clearWidgetMoveCommitTimer();
  clearWidgetBlurTimer();
  widgetDragSession = null;
  widgetExpanded = false;
  hideWidgetPanelWindow();
  hideWidgetButtonWindow();
}

function schedulePanelCollapseOnBlur(): void {
  clearWidgetBlurTimer();
  widgetBlurTimer = setTimeout(() => {
    if (widgetExpanded) {
      collapseToWidgetButton();
    }
  }, WIDGET_BLUR_COLLAPSE_DELAY);
}

function clearWidgetBlurTimer(): void {
  if (widgetBlurTimer) {
    clearTimeout(widgetBlurTimer);
    widgetBlurTimer = null;
  }
}

function clearWidgetMoveCommitTimer(): void {
  if (widgetMoveCommitTimer) {
    clearTimeout(widgetMoveCommitTimer);
    widgetMoveCommitTimer = null;
  }
}

function clearWidgetBoundsSyncTimer(): void {
  if (widgetBoundsSyncTimer) {
    clearTimeout(widgetBoundsSyncTimer);
    widgetBoundsSyncTimer = null;
  }
  syncingWidgetBounds = false;
}

function startWidgetDrag(source: WidgetDragSource, screenX: number, screenY: number): boolean {
  clearWidgetBlurTimer();
  const sourceWindow = source === "button" ? widgetButtonWindow : widgetPanelWindow;
  if (!sourceWindow) {
    return false;
  }

  const bounds = sourceWindow.getBounds();
  widgetDragSession = {
    source,
    offsetX: screenX - bounds.x,
    offsetY: screenY - bounds.y
  };
  return true;
}

function moveWidgetDrag(source: WidgetDragSource, screenX: number, screenY: number): void {
  if (!widgetDragSession || widgetDragSession.source !== source) {
    return;
  }

  if (source === "button") {
    widgetPosition = {
      x: screenX - widgetDragSession.offsetX,
      y: screenY - widgetDragSession.offsetY
    };
    syncWidgetDockState();
    syncButtonWindow();
    return;
  }

  widgetPosition = getAnchorPositionFromPanelBounds({
    x: screenX - widgetDragSession.offsetX,
    y: screenY - widgetDragSession.offsetY,
    width: WIDGET_PANEL.width,
    height: WIDGET_PANEL.height
  });
  syncWidgetDockState();
  syncPanelWindow();
}

function endWidgetDrag(): void {
  if (!widgetDragSession) {
    return;
  }

  widgetDragSession = null;
  commitWidgetMove();
}

function handleWidgetWindowMove(source: WidgetDragSource): void {
  if (syncingWidgetBounds || widgetDragSession) {
    return;
  }

  const sourceWindow = source === "button" ? widgetButtonWindow : widgetPanelWindow;
  if (!sourceWindow) {
    return;
  }

  clearWidgetMoveCommitTimer();

  if (source === "button") {
    const bounds = sourceWindow.getBounds();
    widgetPosition = { x: bounds.x, y: bounds.y };
  } else {
    widgetPosition = getAnchorPositionFromPanelBounds(sourceWindow.getBounds());
  }

  widgetMoveCommitTimer = setTimeout(() => {
    commitWidgetMove();
  }, 120);
}

function commitWidgetMove(): void {
  if (!widgetPosition) {
    return;
  }

  syncWidgetDockState();
  if (widgetExpanded) {
    syncPanelWindow();
    return;
  }
  syncButtonWindow();
}

function syncWidgetDockState(): void {
  const currentPosition = widgetPosition ?? getDefaultWidgetPosition();
  const display = screen.getDisplayNearestPoint(currentPosition);
  const workArea = display.workArea;

  const clampedY = clamp(
    currentPosition.y,
    workArea.y + WIDGET_MARGIN,
    workArea.y + workArea.height - WIDGET_BUTTON.height - WIDGET_MARGIN
  );

  const nearLeft = Math.abs(currentPosition.x - workArea.x) <= WIDGET_DOCK_THRESHOLD;
  const rightEdge = workArea.x + workArea.width - WIDGET_BUTTON.width;
  const nearRight = Math.abs(currentPosition.x - rightEdge) <= WIDGET_DOCK_THRESHOLD;

  widgetDocked = nearLeft || nearRight;
  widgetSide = widgetDocked
    ? nearLeft
      ? "left"
      : "right"
    : getWidgetSide({ x: currentPosition.x, width: WIDGET_BUTTON.width });

  const nextX = widgetDocked
    ? widgetSide === "left"
      ? workArea.x
      : rightEdge
    : clamp(
        currentPosition.x,
        workArea.x + WIDGET_MARGIN,
        workArea.x + workArea.width - WIDGET_BUTTON.width - WIDGET_MARGIN
      );

  widgetPosition = { x: nextX, y: clampedY };
}

function syncButtonWindow(): void {
  if (!widgetButtonWindow) {
    return;
  }

  setWidgetBounds(widgetButtonWindow, getWidgetButtonBounds());
}

function syncPanelWindow(): void {
  if (!widgetPanelWindow) {
    return;
  }

  setWidgetBounds(widgetPanelWindow, getWidgetPanelBounds());
}

function setWidgetBounds(window: BrowserWindow, bounds: { x: number; y: number; width: number; height: number }): void {
  syncingWidgetBounds = true;
  clearWidgetBoundsSyncTimer();
  window.setBounds(bounds);
  if (window === widgetButtonWindow) {
    applyButtonWindowShape(window);
  }
  widgetBoundsSyncTimer = setTimeout(() => {
    syncingWidgetBounds = false;
    widgetBoundsSyncTimer = null;
  }, 0);
}

function showWidgetContextMenu(sourceWindow: BrowserWindow): void {
  const menu = Menu.buildFromTemplate([
    {
      label: "\u6253\u5f00\u5b8c\u6574\u754c\u9762",
      click: () => {
        ensureMainWindow();
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: widgetExpanded ? "\u6536\u8d77\u5230\u5c0f\u56fe\u6807" : "\u5c55\u5f00\u60ac\u6d6e\u9762\u677f",
      click: () => {
        if (widgetExpanded) {
          collapseToWidgetButton();
          return;
        }
        showWidgetPanelMode();
      }
    },
    {
      label: widgetPinned ? "\u53d6\u6d88\u7f6e\u9876" : "\u7f6e\u9876\u663e\u793a",
      click: () => {
        widgetPinned = !widgetPinned;
        widgetButtonWindow?.setAlwaysOnTop(widgetPinned);
        widgetPanelWindow?.setAlwaysOnTop(widgetPinned);
      }
    },
    { type: "separator" },
    {
      label: "\u5173\u95ed\u60ac\u6d6e\u7a97",
      click: () => {
        closeWidgetWindows();
      }
    }
  ]);

  menu.popup({ window: sourceWindow });
}

function getWidgetState(): WidgetState {
  return {
    pinned: widgetPinned,
    expanded: widgetExpanded,
    docked: widgetDocked,
    side: widgetSide
  };
}

function getDefaultWidgetPosition(): WidgetPosition {
  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    x: workArea.x + workArea.width - WIDGET_BUTTON.width - WIDGET_MARGIN,
    y: workArea.y + Math.max(WIDGET_MARGIN, Math.round(workArea.height * 0.18))
  };
}

function getWidgetButtonBounds() {
  const anchor = widgetPosition ?? getDefaultWidgetPosition();
  const display = screen.getDisplayNearestPoint(anchor);
  const workArea = display.workArea;
  const x = widgetDocked
    ? widgetSide === "left"
      ? workArea.x
      : workArea.x + workArea.width - WIDGET_BUTTON.width
    : clamp(anchor.x, workArea.x + WIDGET_MARGIN, workArea.x + workArea.width - WIDGET_BUTTON.width - WIDGET_MARGIN);
  const y = clamp(
    anchor.y,
    workArea.y + WIDGET_MARGIN,
    workArea.y + workArea.height - WIDGET_BUTTON.height - WIDGET_MARGIN
  );

  widgetPosition = { x, y };
  return {
    x,
    y,
    width: WIDGET_BUTTON.width,
    height: WIDGET_BUTTON.height
  };
}

function getWidgetPanelBounds() {
  const buttonBounds = getWidgetButtonBounds();
  const display = screen.getDisplayMatching(buttonBounds);
  const workArea = display.workArea;
  const rawX = widgetSide === "right"
    ? buttonBounds.x + buttonBounds.width - WIDGET_PANEL.width
    : buttonBounds.x;
  const x = clamp(rawX, workArea.x + WIDGET_MARGIN, workArea.x + workArea.width - WIDGET_PANEL.width - WIDGET_MARGIN);
  const y = clamp(
    buttonBounds.y - WIDGET_PANEL_Y_OFFSET,
    workArea.y + WIDGET_MARGIN,
    workArea.y + workArea.height - WIDGET_PANEL.height - WIDGET_MARGIN
  );

  return {
    x,
    y,
    width: WIDGET_PANEL.width,
    height: WIDGET_PANEL.height
  };
}

function getAnchorPositionFromPanelBounds(bounds: { x: number; y: number; width: number; height: number }): WidgetPosition {
  return {
    x: widgetSide === "right" ? bounds.x + bounds.width - WIDGET_BUTTON.width : bounds.x,
    y: bounds.y + WIDGET_PANEL_Y_OFFSET
  };
}

function getWidgetSide(bounds: { x: number; width: number }): WidgetSide {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x,
    y: widgetPosition?.y ?? 0
  });
  const midline = display.workArea.x + display.workArea.width / 2;
  return bounds.x + bounds.width / 2 < midline ? "left" : "right";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function showSaveDialog(options: SaveDialogOptions) {
  return mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(options: OpenDialogOptions) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void bootstrap();
