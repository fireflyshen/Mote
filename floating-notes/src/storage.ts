import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultConfig,
  newNotebook,
  parseNotebook,
  validateConfig,
  type Configuration,
  type Notebook,
} from "./model.ts";
export function atomicJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(value));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
    chmodSync(file, 0o600);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
}
export class Storage {
  readonly notebookFile: string;
  readonly configFile: string;
  readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.notebookFile = join(directory, "notebook.json");
    this.configFile = join(directory, "connection.json");
  }
  loadNotebook(legacyFile?: string): Notebook {
    if (existsSync(this.notebookFile))
      return parseNotebook(JSON.parse(readFileSync(this.notebookFile, "utf8")));
    if (legacyFile && existsSync(legacyFile)) {
      const notebook = parseNotebook(JSON.parse(readFileSync(legacyFile, "utf8")));
      const backup = join(this.directory, "migration-backups", "notebook-original.json");
      mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
      if (!existsSync(backup)) {
        copyFileSync(legacyFile, backup);
        chmodSync(backup, 0o600);
      }
      this.saveNotebook(notebook);
      return notebook;
    }
    return newNotebook();
  }
  saveNotebook(notebook: Notebook) {
    atomicJson(this.notebookFile, notebook);
  }
  loadConfig(legacyFile?: string): Configuration {
    if (existsSync(this.configFile))
      return validateConfig(JSON.parse(readFileSync(this.configFile, "utf8")));
    if (legacyFile && existsSync(legacyFile)) {
      const config = validateConfig(JSON.parse(readFileSync(legacyFile, "utf8")));
      this.saveConfig(config);
      return config;
    }
    return defaultConfig();
  }
  saveConfig(config: Configuration) {
    atomicJson(this.configFile, config);
  }
}
