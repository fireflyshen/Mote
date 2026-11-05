# Mote for Raycast / Tinycast

flomo 风格的单页输入：`MEMO` + `Tags`，`⌘↵` 发送。发送成功关闭窗口；失败保留草稿，再次发送复用记录 ID，防止重复保存。

```sh
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

Raycast：运行 `npm run dev`。Tinycast：设置 → Extensions → Import Local Extension，选择构建后的 `dist/`。

设置：
- Connection：当前选择 `SSH (RN)`；复用 `~/.ssh/config` 的 `rn`，不需要浏览器登录或开放服务器端口。
- Capture Token：在 Mote 网页「设置与 Raycast」生成；只允许新增记录。
- Default Tags：可留空，例如 `#碎记`，也可在每次输入时修改。
- 配好 HTTPS 域名后可改选 `HTTPS`，Server URL 填 Mote 首页地址。

仅供本机私有安装。`lint` 检查 ESLint 和 Prettier；`lint:store` 另要求有效的 Raycast 商店作者账号，发布商店前需修改作者资料。

交互参考：[Send to flomo](https://www.raycast.com/ahonn/send-to-flomo)、[flomo 官方说明](https://help.flomoapp.com/advance/extension/raycast-to-flomo.html)。本插件独立实现。
