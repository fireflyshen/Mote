# Mote Notes for Raycast / Tinycast

搜索 `Mote Notes`，弹出独立的 macOS 原生悬浮记事本，可放在其他应用上方并自由缩放。

- 直接写正文；标签写成 `#想法`、`#阅读/书摘`。
- 输入立即保存到本机，停笔 1.2 秒后自动同步到 Mote。
- `⌘S` 立即保存并同步，`⌘N` 新建记录；右上角时钟切换本机最近记录。
- 关闭窗口不会清空内容，再次打开继续写同一条记录。
- 断网保留本机内容并每 15 秒重试；网页上的更新会触发冲突提示，不覆盖远端。

## 构建和安装

需要 macOS 13+、Node.js 24+ 和 Xcode Command Line Tools。

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
bash ../native-notes/install.sh
```

构建生成根目录 `output/Mote Notes.app` 和扩展 `dist/`。安装脚本将原生记事本放在 `~/Library/Application Support/Mote/Mote Notes.app`，再把扩展放入 Tinycast，保留插件设置。Raycast 用户可运行 `npm run dev` 加载扩展。

插件沿用已有 SSH / HTTPS 配置与速记令牌，首次启动时传给记事本。令牌和配置仅写入本机 0600 文件，不进入命令行参数。令牌只能新增记录及更新此记事本创建的记录；不能读取或修改其他网页记录。

本机记事本在 `~/Library/Application Support/Mote/notebook.json`，保留全文、同步版本和当前记录，权限为 0600。请保留这个文件。

交互参考：[Raycast Notes](https://manual.raycast.com/notes)。悬浮窗使用独立的原生 AppKit/SwiftUI 程序，插件只负责唤出它。
