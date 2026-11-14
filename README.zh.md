# 深度荣耀

[English](README.md) · [下载安装包](https://github.com/pearjelly/dsh-heros/releases/latest) · [MIT 许可证](LICENSE)

在 DeepSeek Harness 里选英雄、配装备，再用这套阵容开始实际工作。

| [推介片 · 21 秒](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4) | [安装与标准模式实战 · 1 分 42 秒](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4) |
| --- | --- |
| <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4"><img src="docs/media/dsh-heros-preview.gif" width="420" alt="观看深度荣耀推介片"></a> | <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4"><img src="docs/media/dsh-heros-install-guide.jpg" width="420" alt="观看深度荣耀安装与标准模式实战"></a> |

两支视频均配有普通话解说和简体中文字幕。教程先看战旗结算，再跟着实录从安装走到标准模式试装、交付灯塔补给卡和换装续战。[补给卡和首回合任务](docs/demo/lighthouse)

## 安装

支持 DSH 0.2.1-rc.1 至 0.2.1-rc.5，以及 0.2.2-rc.1 至 0.2.2-rc.2。

```sh
npm_config_ignore_workspace_root_check=true dsh plugin --profile web add https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-bundle.tgz
dsh web
```

桌面版用应用随附的 CLI，把 `--profile web` 改为 `--profile desktop`，安装后退出并重新打开应用。如果已安装早期版本，先从同一 Profile 移除 `dsh-agent-loadout` 再安装。发布包沿用这个内部名称，便于兼容原有阵容。

从 DSH 侧栏打开 **深度荣耀**。插件跟随 **设置 → 通用设置 → 语言**，选 English 后显示 **DSH-Heros**。第三方插件或用户填写的内容没有译文时会保留原文。

## 试一套出装

1. 保留 **标准模式**。在装备库搜索 `glob`，点 **给英雄试装**。
2. 选 **交付物预览** 作第二件装备。看过试装前后的能力变化后，点 **试装并筹备连携**，选 **同回合基础连携**。
3. 在开局委托中填写任务目标和 **首回合任务（选填）**。锁定阵容后，点 **打开首回合任务** 并发送。演示中 `glob` 找到文件，`present` 把文件交付到对话。
4. 打开交付的文件确认结果，验收后领取战旗和经验。点 **回城换装**，调整装备后用 **锁定阵容并续战** 接着做。

DSH 已注册的预设、工具和插件会进入英雄图鉴或装备库。同一工具有多个来源时，可以指定具体来源。[完整使用说明](agent-loadout/README.md)
