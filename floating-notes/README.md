# Mote 插件记事本窗口

这是 Mote Raycast 插件自带的窗口，不是单独发布的桌面客户端。入口、连接方式、SSH 主机和令牌都由 `../raycast-extension` 管理。

窗口在 Raycast 调用时启动；正文停笔后自动保存同步到 Mote 网页，失败保留插件私有草稿并重试。关闭窗口退出配套进程，下次从 Raycast 恢复内容。新建、保存和最近记录在窗口内完成。

用户通过 Raycast 的命令或其快捷键唤出记事本，不需要另装应用，也不启用额外的系统托盘或全局快捷键。

开发检查：`npm run typecheck`、`npm run lint`、`npm test`。完整插件打包在项目根目录运行 `npm run build:plugin`。
