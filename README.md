# Mote · 碎记

从 Tessera 的便签模块独立出来的个人记录应用。打开就写，按 `⌘↵` 保存；标签、搜索、编辑、回收站、草稿和 JSON 导入导出均保留，不包含热力图。

- 网页和 Raycast/Tinycast 读取、写入同一个 RN SQLite 数据库。
- 网页用访问密码登录；悬浮记事本使用专用令牌，只能新增记录及修改它自己创建的记录，支持离线草稿和版本冲突保护。
- 服务与 Tessera 完全分离，不连接或修改 Tessera 数据；可以通过网页导入既有 Ripple 备份，保留 ID、日期、历史版本，冲突整批回滚。

## 当前入口

服务部署在 RN `/opt/mote`，只监听服务器 `127.0.0.1:4174`。本机运行：

```sh
npm run server:connect
```

保持此终端运行，浏览器打开 [http://127.0.0.1:5174](http://127.0.0.1:5174)。密码在本机 `output/login.md`（不入 Git）。关闭连接不影响服务器保存的记录。域名尚未启用。

## Raycast 记事本

项目包含部署在 RN 的网页、Raycast 插件和插件自带的独立悬浮窗口。使用顺序：在 Raycast 搜索 `Mote Notes` → 弹出记事本 → 写下内容 → 自动保存同步到 Mote 网页。`⌘ / Ctrl + S` 立即保存，`⌘ / Ctrl + N` 新建；关闭后下次从 Raycast 继续。

连接方式、`rn` SSH 主机和速记令牌都在插件设置中配置。令牌由 Mote 网页「设置与 Raycast」生成。记事本是插件配套窗口，无需单独安装桌面客户端。

```sh
npm run setup:plugin             # 安装插件及窗口的构建依赖
npm run test:plugin
npm run build:plugin             # 当前平台插件，包含记事本窗口
npm run build:plugin:windows     # Windows x64 插件包
```

Raycast 使用 `Import Extension` 导入 `raycast-extension/`；Tinycast 可在设置中将构建后的 `raycast-extension/dist/` 作为扩展文件夹导入。Windows 与 macOS 都从插件启动配套窗口。平台包位于 `output/Mote-raycast-<platform>-<arch>.zip`，Windows 真机导入尚未验证。

`floating-notes/` 是窗口的内部实现，`raycast-extension/` 是入口与连接配置；网页/服务端继续由项目根目录构建和部署。草稿、记录 ID 和版本会从旧窗口迁移到插件的私有数据目录，原文件与备份保留。

## 本地开发

Node.js 24.12+：

```sh
npm ci
cp .env.example .env.local
# 在 .env.local 设置至少 16 位随机 MOTE_PASSWORD
npm run dev
```

本地开发数据保存在 `data/mote.sqlite`，与 RN 数据独立。不要同时占用隧道与开发服务的 5174 端口。

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## 部署与维护

```sh
npm run deploy
```

先完成检查，再上传构建产物到 RN。使用独立容器、160 MiB 内存上限、持久卷与自动重启。更新前在线备份 SQLite 和配置；更新失败回退镜像及配置，保留新写入的数据。历史版本在 `/opt/mote/releases/`，备份在 `/opt/mote/backups/` 与 `/opt/mote/data/pre-deploy-*.sqlite`。

`MOTE_PASSWORD` 在 RN `/opt/mote/.env`，0600 权限；更改密码后需手动删除 `mote_sessions` 中的会话使已有登录失效。令牌在网页重新生成会立即撤销旧令牌。

启用 `mote.caten.top` 前：添加 DNS，在 Caddy 添加该域名的 `reverse_proxy mote:4174`，将容器接入 `caddy_net` 并设置 `MOTE_COOKIE_SECURE=true`。继续保持主机端口只绑定回环地址；密码与令牌通过 HTTPS 发送。当前 SSH 方案已可完整使用。
