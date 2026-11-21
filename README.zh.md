# 深度荣耀

[English](README.md) · [下载安装包](https://github.com/pearjelly/dsh-heros/releases/latest) · [MIT 许可证](LICENSE)

在 DeepSeek Harness 里选英雄、配装备，再用这套阵容开始实际工作。

| [推介片 · 21 秒](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4) | [安装与标准模式实战 · 1 分 42 秒](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4) |
| --- | --- |
| <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4"><img src="docs/media/dsh-heros-preview.gif" width="420" alt="观看深度荣耀推介片"></a> | <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4"><img src="docs/media/dsh-heros-install-guide.jpg" width="420" alt="观看深度荣耀安装与标准模式实战"></a> |

两支视频均配有普通话解说和简体中文字幕。教程先看战旗结算，再跟着实录从安装走到标准模式试装、交付灯塔补给卡和换装续战。[补给卡和首回合任务](docs/demo/lighthouse)

## 安装

支持 DSH 0.2.1-rc.1 至 0.2.1-rc.5，以及 0.2.2-rc.1 至 0.2.2-rc.5。

```sh
npm_config_ignore_workspace_root_check=true dsh plugin --profile web add https://github.com/pearjelly/dsh-heros/releases/download/v0.68.0/dsh-heros-bundle.tgz
dsh web
```

桌面版用应用随附的 CLI，把 `--profile web` 改为 `--profile desktop`，安装后退出并重新打开应用。如果已安装早期版本，先从同一 Profile 移除 `dsh-agent-loadout` 再安装。发布包沿用这个内部名称，便于兼容原有阵容。

从 DSH 侧栏打开 **深度荣耀**。插件跟随 **设置 → 通用设置 → 语言**，选 English 后显示 **DSH-Heros**。第三方插件或用户填写的内容没有译文时会保留原文。

## 打一局灯塔补给行动

1. 在深度荣耀大厅打开 **灯塔补给行动**。选 **侦察路线**，让标准模式用 `glob` 带回文件路径。选 **交付路线**，就能用 `glob → present` 把补给卡摆到对话里。
2. 锁定路线后，插件会在独立的示例工作区开一局。点 **打开首回合任务**，确认内容并发送。
3. 走交付路线时，打开对话里的 `02-lighthouse.md` 核对内容。两件装备在同一回合成功使用后，首次达成可以验收并领取连携战旗。

想给自己的任务出装时，可以在装备库试装，比较前后能力变化，再到自己的工作区开局。需要调整装备时，用 **回城换装** 和 **锁定阵容并续战** 接着做。DSH 已注册的预设、工具和插件会进入英雄图鉴或装备库，同一工具有多个来源时可以指定来源。[完整使用说明](agent-loadout/README.md) · [迭代路线](docs/roadmap.md)
