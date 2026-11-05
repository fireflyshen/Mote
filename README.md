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

Windows / macOS 悬浮记事本已独立到同级 [MoteNotes](../MoteNotes/README.md)，支持自动保存、SSH 同步与可选的 Raycast/Tinycast 启动入口。客户端不参与本服务的构建或部署。

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
