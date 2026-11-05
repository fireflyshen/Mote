# Mote Raycast 插件

在 Raycast 中运行 **Mote Notes**，直接弹出独立的记事本窗口。窗口随插件打包，保存自动同步到 Mote 网页，无需单独安装应用。

在插件设置中配置 Connection、SSH Host（默认 `rn`）和 Mote Capture Token。SSH 方式复用本机 OpenSSH，先确认 `ssh -o BatchMode=yes rn` 可连接。HTTPS 方式填写 Mote URL。

构建前在项目根目录运行 `npm run setup:plugin`；然后：

```sh
npm run build:plugin
npm run build:plugin:windows
```

Raycast 使用 `Import Extension` 导入这个目录（需要按 Raycast 提示准备本地开发依赖）；Tinycast 可用「Add from folder」导入构建后的 `dist/`。构建出的 `dist/assets/floating-notes/<platform>-<arch>/` 包含对应平台的配套窗口。

`⌘ / Ctrl + S` 立即同步，`⌘ / Ctrl + N` 新建。标签直接写 `#标签`。关闭后本机草稿保留，下次从 Raycast 继续。
