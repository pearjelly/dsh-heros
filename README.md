# DSH-Heros

[简体中文](README.zh.md) · [Download the plugin](https://github.com/pearjelly/dsh-heros/releases/latest) · [MIT License](LICENSE)

Choose a hero, equip real tools and plugins, and take that loadout into a DeepSeek Harness session.

| [Introduction · 21 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4) | [Installation and Standard Mode walkthrough · 1 min 42 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4) |
| --- | --- |
| <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4"><img src="docs/media/dsh-heros-preview.gif" width="420" alt="Watch the DSH-Heros introduction"></a> | <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4"><img src="docs/media/dsh-heros-install-guide.jpg" width="420" alt="Watch the DSH-Heros installation and Standard Mode walkthrough"></a> |

Both videos have Mandarin narration and Simplified Chinese captions. The walkthrough opens with the banner unlock, then shows installation, a live Standard Mode combo, and how to continue the same conversation with new gear. [Sample files and first-turn task](docs/demo/lighthouse)

## Install

Requires DeepSeek Harness 0.2.1-rc.1 through 0.2.1-rc.5, or 0.2.2-rc.1 through 0.2.2-rc.5. Run the command with the CLI for the DSH installation you use.

```sh
dsh plugin --profile web add -w https://github.com/pearjelly/dsh-heros/releases/download/v0.72.0/dsh-heros-bundle.tgz
dsh web
```

For the desktop app, use its bundled CLI with `--profile desktop`, then quit and reopen the app. If an earlier copy is installed, remove `dsh-agent-loadout` from the same profile before installing the release. The package keeps that identifier for compatibility.

Open **DSH-Heros** in the sidebar. It follows **Settings → General → Language**. Select 中文 to use **深度荣耀**. Third-party plugin text and your own labels remain in their original language when there is no translation.

## Play the Lighthouse Supply Run

1. Open **Lighthouse Supply Run** in the DSH-Heros lobby. Pick **Recon** to find and report the file path with `glob`, or **Delivery** to use `glob → present` and bring the card into the conversation.
2. Lock in to start a Standard Mode session in a separate sample workspace. Choose **Open first-turn task**, review the task, and send it.
3. On the Delivery route, open `02-lighthouse.md` in the conversation to check the card. When both tools succeed in the same turn for the first time, review the result and claim the combo banner.

For your own tasks, try gear in the armory, compare the capabilities, and start a session in your workspace. To change gear during a task, choose **Return to lobby** and then **Lock in & continue**. Installed presets and tools appear as DSH discovers them. Tools with multiple sources retain the chosen provider. [Plugin guide](agent-loadout/README.md) · [Product roadmap (Chinese)](docs/roadmap.md)

## Use a playbook in your workspace

Open **Playbooks** in the lobby. Both **Direct delivery** and **Review before delivery** use Standard Mode and Deliverable Preview. Direct delivery suits a file that is ready to inspect. For work with a distinct handoff, the review playbook prompts the model to show a draft first and ask whether to hand it over or revise it.

Preview what changes in your current loadout, then adopt the playbook to update the lobby draft. Your workspace and choice to start or continue carry through. The loadout takes effect when you lock it in. Save a playbook you use often as a build plan.

## Share a loadout

Open **Loadout plans**, select a plan, and choose **Share plan** to copy its code. The code carries the plan name, the preset and gear sources, removals, and required package versions. Private settings and the plan note stay in your profile. Loadouts with local files or custom gear that the receiver would need to recreate cannot be exported.

In another profile, open **Loadout plans → Import share code**. Check the preset, equipment, and dependencies before applying. When the original requirements are unmet, choose **Compare local replacements**. Search gear, pick a provider, or leave a slot empty. The review shows interface, dependency, and capability changes. Confirm the adapted loadout to update your lobby draft. You can lock it in or save and share your own plan.

## Reuse gear from a verified result

In the match report or settlement, choose **Review proven loadout**. Check which tools ran successfully, which gear has recorded actions, and which pieces were ready when a combo was accepted. The review lists delivered file names you can look up in the original session.

Select the gear you want to keep and review its original sources and current capability changes. Load it into the lobby for a fresh round, or open the existing **Save as plan** form.

## Develop

```sh
cd agent-loadout
npm test
npm pack --dry-run
```

Tests start DSH with an isolated profile. Set `DSH_LOADOUT_TEST_BINARY` to test a different supported DSH CLI. See the [plugin guide](agent-loadout/README.md) for equipment sources, actions, progression, and package metadata.
