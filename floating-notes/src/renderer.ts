import type { Snapshot } from "./controller.ts";
interface Bridge {
  snapshot(): Promise<Snapshot>;
  update(content: string): Promise<Snapshot>;
  select(id: string): Promise<Snapshot>;
  create(): Promise<Snapshot>;
  duplicate(): Promise<Snapshot>;
  save(): Promise<Snapshot>;
  onState(callback: (state: Snapshot) => void): () => void;
  onFocus(callback: () => void): void;
  onNotice(callback: (message: string) => void): void;
  platform: string;
}
declare global {
  interface Window {
    mote: Bridge;
  }
}
const api = window.mote;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = element<HTMLTextAreaElement>("editor"),
  status = element("status"),
  recent = element<HTMLSelectElement>("recent");
let activeID = "",
  composition = false;
function fail(error: unknown) {
  status.textContent = error instanceof Error ? error.message : String(error);
  element("status-bar").dataset.level = "error";
}
function render(state: Snapshot) {
  const note = state.notebook.notes.find((item) => item.id === state.notebook.activeID)!;
  if (activeID !== note.id || document.activeElement !== editor) {
    const changed = activeID !== note.id;
    editor.value = note.content;
    activeID = note.id;
    if (changed) editor.focus();
  }
  status.textContent = state.status;
  element("status-bar").dataset.level = state.level;
  element("duplicate").hidden = !note.conflict;
  recent.replaceChildren(
    ...state.notebook.notes.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = (item.content.split("\n").find(Boolean) || "新记录").slice(0, 30);
      return option;
    }),
  );
  recent.value = note.id;
}
async function update() {
  if (composition) return;
  try {
    render(await api.update(editor.value));
  } catch (error) {
    fail(error);
  }
}
editor.addEventListener("compositionstart", () => {
  composition = true;
});
editor.addEventListener("compositionend", () => {
  composition = false;
  void update();
});
editor.addEventListener("input", () => void update());
recent.addEventListener("change", () => {
  void api
    .select(recent.value)
    .then((state) => {
      render(state);
      editor.focus();
    })
    .catch(fail);
});
element("new").addEventListener("click", () => {
  void api
    .create()
    .then((state) => {
      render(state);
      editor.focus();
    })
    .catch(fail);
});
element("save").addEventListener("click", () => {
  void api.save().then(render).catch(fail);
});
element("duplicate").addEventListener("click", () => {
  void api
    .duplicate()
    .then((state) => {
      render(state);
      editor.focus();
    })
    .catch(fail);
});
api.onState(render);
api.onFocus(() => editor.focus());
api.onNotice(fail);
element("shortcut").textContent =
  api.platform === "darwin" ? "⌘S 保存   ⌘N 新建" : "Ctrl+S 保存   Ctrl+N 新建";
void api
  .snapshot()
  .then((state) => {
    render(state);
    editor.focus();
  })
  .catch(fail);
