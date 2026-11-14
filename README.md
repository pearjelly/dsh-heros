# DSH-Heros

[简体中文](README.zh.md) · [Download the plugin](https://github.com/pearjelly/dsh-heros/releases/latest) · [MIT License](LICENSE)

Choose a hero, equip real tools and plugins, and take that loadout into a DeepSeek Harness session.

| [Introduction · 18 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-zh.mp4) | [Installation and Standard Mode walkthrough · 1 min 22 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-zh.mp4) |
| --- | --- |
| <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-zh.mp4"><img src="docs/media/dsh-heros-preview.gif" width="420" alt="Watch the DSH-Heros introduction"></a> | <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-zh.mp4"><img src="docs/media/dsh-heros-install-guide.jpg" width="420" alt="Watch the DSH-Heros installation and Standard Mode walkthrough"></a> |

Both videos have Mandarin narration and Simplified Chinese captions. In the walkthrough, Standard Mode finds and delivers a supply card, unlocks a banner, and resumes the same conversation with new gear. [Sample files and first-turn task](docs/demo/lighthouse)

## Install

Requires DeepSeek Harness 0.2.1-rc.1 through 0.2.1-rc.5, or 0.2.2-rc.1 through 0.2.2-rc.2. Run the command with the CLI for the DSH installation you use.

```sh
npm_config_ignore_workspace_root_check=true dsh plugin --profile web add https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-bundle.tgz
dsh web
```

For the desktop app, use its bundled CLI with `--profile desktop`, then quit and reopen the app. If an earlier copy is installed, remove `dsh-agent-loadout` from the same profile before installing the release. The package keeps that identifier for compatibility.

Open **DSH-Heros** in the sidebar. It follows **Settings → General → Language**. Select 中文 to use **深度荣耀**. Third-party plugin text and your own labels remain in their original language when there is no translation.

## Try a loadout

1. Keep **Standard** selected. Search the armory for `glob` and choose **Try on a hero**.
2. Add **Deliverable Preview** as the second item. Review the capability changes and prepare a basic same-round combo.
3. In the opening quest, name the challenge and add the first-turn task. Lock in, open the task, and send it. In the example, `glob` finds the file and `present` delivers it to the conversation.
4. Open the delivered file and claim the combo reward. Inspect your banner or choose **Return to lobby**, change gear, and use **Lock in & continue** to resume the conversation.

Installed presets and tools appear as DSH discovers them. Tools with multiple sources retain the chosen provider. The armory can import compatible bundles and configure standalone modules. Levels affect appearance and challenge options.

## Develop

```sh
cd agent-loadout
npm test
npm pack --dry-run
```

Tests start DSH with an isolated profile. Set `DSH_LOADOUT_TEST_BINARY` to test a different supported DSH CLI. See the [plugin guide](agent-loadout/README.md) for equipment sources, actions, progression, and package metadata.
