import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, atomicJson } from "./storage.ts";
import { Controller } from "./controller.ts";
import { validateConfig } from "./model.ts";
import { launchOptions } from "./launch.ts";

// This window belongs to the extension. Raycast owns launch and connection settings.
const launch = launchOptions(process.argv);
app.setName("Mote Notes");
if (launch) app.setPath("userData", launch.dataDirectory);
const lock = !!launch && app.requestSingleInstanceLock();
if (!lock) app.quit();
let window: BrowserWindow | undefined,
  controller: Controller | undefined,
  quitting = false;
const root = resolve(__dirname, "..");
function show() {
  if (!window) return;
  window.show();
  window.focus();
  window.webContents.focus();
  window.webContents.send("notes:focus");
}
let refreshConfig: (() => void) | undefined;
app.on("second-instance", () => {
  refreshConfig?.();
  show();
});
app.on("activate", show);
app.on("before-quit", () => {
  quitting = true;
  controller?.dispose();
});
app.on("window-all-closed", () => app.quit());

if (lock && launch)
  void app.whenReady().then(() => {
    try {
      if (process.platform === "darwin") app.dock?.hide();
      const directory = app.getPath("userData"),
        home = app.getPath("home"),
        storage = new Storage(directory);
      let config = validateConfig(
        JSON.parse(readFileSync(launch.configurationFile, "utf8")),
        storage.loadConfig(),
      );
      storage.saveConfig(config);
      const legacyCandidates =
        process.platform === "darwin"
          ? [
              join(home, "Library/Application Support/Mote Notes/notebook.json"),
              join(home, "Library/Application Support/Mote/notebook.json"),
            ]
          : [join(app.getPath("appData"), "Mote Notes/notebook.json")];
      const notebook = storage.loadNotebook(legacyCandidates.find(existsSync));
      let bounds: { width?: number; height?: number; x?: number; y?: number } = {};
      const boundsFile = join(directory, "window.json");
      if (existsSync(boundsFile)) {
        try {
          bounds = JSON.parse(readFileSync(boundsFile, "utf8"));
        } catch {
          /* Optional window geometry can be recreated. */
        }
      }
      window = new BrowserWindow({
        width: Math.max(390, bounds.width || 560),
        height: Math.max(300, bounds.height || 440),
        ...(typeof bounds.x === "number" && typeof bounds.y === "number"
          ? { x: bounds.x, y: bounds.y }
          : {}),
        minWidth: 390,
        minHeight: 300,
        title: "Mote Notes",
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        backgroundColor: "#151719",
        autoHideMenuBar: true,
        icon: join(root, "assets/icon.png"),
        webPreferences: {
          preload: join(root, "build/preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      const page = join(root, "build/index.html");
      function trusted(event: Electron.IpcMainInvokeEvent) {
        if (
          event.sender !== window?.webContents ||
          !event.senderFrame?.url.startsWith("file:") ||
          fileURLToPath(event.senderFrame.url) !== page
        )
          throw new Error("不允许此请求");
      }
      controller = new Controller(notebook, config, storage, (state) =>
        window?.webContents.send("notes:state", state),
      );
      refreshConfig = () => {
        try {
          config = validateConfig(
            JSON.parse(readFileSync(launch.configurationFile, "utf8")),
            config,
          );
          storage.saveConfig(config);
          controller!.configure(config);
        } catch {
          window?.webContents.send("notes:notice", "连接设置读取失败，请在 Raycast 插件中检查配置");
        }
      };
      const handle = (name: string, action: (value: unknown) => unknown) =>
        ipcMain.handle(name, (event, value) => {
          trusted(event);
          return action(value);
        });
      handle("notes:snapshot", () => controller!.snapshot());
      handle("notes:update", (value) => controller!.update(value));
      handle("notes:select", (value) => controller!.select(value));
      handle("notes:new", () => controller!.create());
      handle("notes:duplicate", () => controller!.duplicate());
      handle("notes:save", () => {
        void controller!.sync();
        return controller!.snapshot();
      });
      const menu = Menu.buildFromTemplate([
        ...(process.platform === "darwin"
          ? [{ label: "Mote Notes", submenu: [{ role: "quit" as const }] }]
          : []),
        {
          label: "记录",
          submenu: [
            {
              label: "新记录",
              accelerator: "CommandOrControl+N",
              click: () => controller?.create(),
            },
            {
              label: "保存并同步",
              accelerator: "CommandOrControl+S",
              click: () => void controller?.sync(),
            },
            { label: "关闭记事本", accelerator: "CommandOrControl+W", click: () => app.quit() },
          ],
        },
        {
          label: "编辑",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
      ]);
      Menu.setApplicationMenu(menu);
      window.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          app.quit();
        }
      });
      let resizeTimer: ReturnType<typeof setTimeout>;
      const saveBounds = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (window && !window.isDestroyed()) atomicJson(boundsFile, window.getBounds());
        }, 300);
      };
      window.on("resize", saveBounds);
      window.on("move", saveBounds);
      window.webContents.on("did-finish-load", show);
      void window.loadFile(page);
      const retry = setInterval(() => void controller?.sync(), 15_000);
      retry.unref();
      void controller.sync();
    } catch (error) {
      dialog.showErrorBox(
        "Mote 记事本无法打开",
        `${error instanceof Error ? error.message : "本机数据读取失败"}\n请检查 Raycast 插件设置。原有草稿会保留。`,
      );
      app.quit();
    }
  });
