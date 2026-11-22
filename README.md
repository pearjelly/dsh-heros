# DSH-Heros

[简体中文](README.zh.md) · [Download the plugin](https://github.com/pearjelly/dsh-heros/releases/latest) · [MIT License](LICENSE)

Choose a hero, equip real tools and plugins, and take that loadout into a DeepSeek Harness session.

| [Introduction · 21 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4) | [Installation and Standard Mode walkthrough · 1 min 42 sec](https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4) |
| --- | --- |
| <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-promo-standard-narrated-zh.mp4"><img src="docs/media/dsh-heros-preview.gif" width="420" alt="Watch the DSH-Heros introduction"></a> | <a href="https://github.com/pearjelly/dsh-heros/releases/download/v0.67.1/dsh-heros-standard-guide-intro-zh.mp4"><img src="docs/media/dsh-heros-install-guide.jpg" width="420" alt="Watch the DSH-Heros installation and Standard Mode walkthrough"></a> |

Both videos have Mandarin narration and Simplified Chinese captions. The walkthrough opens with the banner unlock, then shows installation, a live Standard Mode combo, and how to continue the same conversation with new gear. [Sample files and first-turn task](docs/demo/lighthouse)

## Install

Supports DeepSeek Harness 0.2.1-rc.1 through 0.2.1-rc.5, 0.2.2-rc.1 through 0.2.2-rc.5, and the 0.2.3-alpha.2 preview. Use the CLI for your DSH installation. The preview requires Node.js 24.22.3 or later in the 24.x series, or 26.13.1 or later. [DSH preview requirements](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.3-alpha.2)

```sh
dsh plugin --profile web add -w https://github.com/pearjelly/dsh-heros/releases/download/v0.176.0/dsh-heros-bundle.tgz
dsh web
```

If this is your first Desktop installation, open DeepSeek Harness Desktop once to initialize its profile. Fully quit the app before running the install command with its bundled CLI and `--profile desktop`. Reopen Desktop after installation. When upgrading, remove `dsh-agent-loadout` from the same profile before installing the release.

If you came from the community catalog, use the command above to install this release. The versioned address has its own pnpm cache entry, and `-w` lets the CLI install at the profile workspace root.

Open **DSH-Heros** from the sidebar, or choose **Open DSH-Heros** above the composer in a blank conversation. The plugin follows **Settings → General → Language**. Select 中文 to use **深度荣耀**. Third-party plugin text and your own labels remain in their original language when there is no translation.

In the Armory, use **Choose a loadout** to jump to **Hero roster**. Select a hero, then equip tools or plugins from the gear list. Choose **Use this loadout on a task** beside the gear list. Pick your own material, write the task, and review the gear and any new decisions. Confirm to open a new DSH draft, then send it yourself. After Standard has handed off the verified original, choose **Try Delivery Review** in that conversation. Add just that gear and send the same task in the new draft. The top of the verified report shows both outcomes, including the real choice, files and links to both conversations. Review the loadout you want to keep. Once you save it as a named plan, choose **Start a task with this loadout** from the save confirmation to pick a new file and write a new task.

## Try two heroes on the same task

1. Choose **Lighthouse hero trial** from the lobby's **Armory** or from **Standard** or **Minimal** in **Hero gallery**. Both supported stock presets need to be active in your profile.
2. Choose **Openable original** or **Verifiable text summary**. For an original, Standard can attach the file and Minimal can hand off text, with Deliverable Preview available for a replay. For a summary, the key facts are enough. Minimal reads the card in the terminal, and Standard can also attach the original. Choose **Open Standard session** or **Open Minimal session**. The DSH draft shows what the next shift needs. Review and manually send the prepared task.
3. Choose **View the hero trial** from the session, or **Continue the last trial** in the Armory’s Lighthouse section to open your latest comparison directly. You can view it even if a stock preset is disabled. To play the other hero, open that session when ready. The two sessions use the same task and separate copies of the same bundled card. Compare actual replies and attachments, and open either source session to see the full result.

[Hero selection](docs/media/lighthouse-choose-en.webp) · [Recorded handoff comparison](docs/media/lighthouse-results-en.webp)

### Share the hero trial

1. After one stock hero finishes a verified round, choose **Share hero trial**. **Copy challenge invitation** lets you ask a friend which hero they would pick for the same supply card. You can also copy the code alone. The code identifies the public sample version and task language and carries the handoff need. Your replies, files, and workspaces stay in your profile.
2. In the Armory's Lighthouse section, choose **Join a Lighthouse challenge** and paste the whole message or a raw code into **Challenge invitation or code**. The plugin extracts one distinct supported code locally. If your paste contains different codes, keep the one you want to check. Choose **Check challenge code**, read the original task, handoff need, and what each hero can deliver, then choose your first hero and manually send the task in DSH. The same entry accepts shared Lighthouse evidence challenges.

### Compare a friend's trial report

In a verified hero session, choose **Copy this round’s report code**. The code is also available from **Share this round report** in the trial comparison. It carries the public sample identifier, handoff need, selected run, and whether the original card was attached. Replies and files stay in your profile.

Choose **Compare a friend's report** on a verified local run with the same public sample, task language, and handoff need. The comparison shows **Verified on this device** for your result and **Shared by your friend** for the outcome supplied by the code.

**Read with** on your card identifies the tool that returned the verified card in your own round.

Choose **Copy my report code** in the comparison and send it to your friend. The two handoffs stay on screen while you copy.

When your local round qualifies for a new personal task, its side of the comparison offers to use that tested loadout. Pick your own material and review the tools before opening a draft. Back returns to the same comparison.

If your Minimal gave only text on a challenge that needed the original, and your friend's report shows an original attachment, choose **Add Deliverable Preview to Minimal** on your side of the comparison. The preview shows what one piece of equipment adds. After reviewing it, open a separate draft for the same task and send it manually.

If your friend played a different stock hero and you haven't played it on this board, you can try it from their result. The plugin opens a separate DSH draft with the same task and a fresh copy of the supply card. Send it manually when you are ready.

### Use Standard on your own task

When Standard has read the bundled card and delivered the verified original, choose **Use Standard on my task** in that DSH session or on the Standard result. Select a workspace or **Add a materials folder**, choose your own file, and write a new brief. In **Review file and loadout**, check the stock Standard preset and its tool sources. Choose **Confirm and open session**, then manually send the new task in DSH.

After verified delivery, [try a review step on the same task](#try-a-review-step-before-delivery).

### Use Minimal on your own task

When the next shift needed a **Verifiable text summary** and stock Minimal read the supply card and completed a verified text handoff, choose **Use Minimal on my task** in the original DSH session or on the Minimal result. Select a workspace or add your materials folder, pick a file, and write a new brief. Review the Minimal preset and Bash tool source, open a new DSH session, and manually send the task. Read the summary in the new conversation.

### Give Minimal one more tool

If the next shift needed an **Openable original** and Minimal’s verified round read the card and handed off text, choose **Add Deliverable Preview to Minimal** in the original DSH conversation or on the trial board. The preview shows the single piece of gear and what it lets the next shift do. Expand **View tools and sources** to inspect the native `present` tool. Choose **Open the equipped session** and manually send the same task against a new copy of the supply card. Once the replay verifies the original attachment, choose **View gear replay report** to compare both results and open the card.

In the verified gear replay report, choose **Compare a friend's report** to compare that equipped run with the report your friend shared.

After **Minimal + Deliverable Preview** delivers the original sample card and passes verification, choose **Use this loadout on my task** directly in the equipped DSH conversation or at the top of the gear replay report. Select a workspace or **Add a materials folder**, choose your own file, and write a new brief. In **Review file and loadout**, check Minimal and the equipment sources from the trial. Confirm and manually send the new task in DSH. The original Standard, Minimal, and equipped runs remain available in the trial comparison.

After a verified personal delivery with equipped Minimal, **Try Standard in the Lighthouse trial** can return to the same practice board and focus Standard. Open its sample session and manually send the task against the built-in supply card. Once the Standard handoff verifies, choose **Return to personal task result** to review the same task with Standard. If you opened that practice session from several personal tasks, choose the file and session you want to return to. Entries for the same file also show part of each task brief.

If Standard and equipped Minimal both delivered the original in the same local trial, a verified personal delivery can show **Try the same task with Standard** or **Try the same task with Minimal + Deliverable Preview** near the top of its task result. Review the two loadouts and your original file and task. Confirm to open a separate draft, then send it manually.

After the alternate session finishes, its task result can show both personal runs together. Open either native session to check the details. On a run that attached the selected original, choose **Keep this loadout**. Review its hero, equipment changes, actual tool calls, and attachment. The naming form keeps those observations in view while you save the selected build. Choose new material and write a fresh brief when you run the plan again.

## Play Lighthouse evidence choices

1. In the lobby's **Armory**, open **Evidence Check** and choose **Try an evidence choice**. **Lighthouse evidence choices** also opens from **Lighthouse Supply Run**. In **Missing key evidence**, use **Opening choice (optional)** to record what you would do about the dispatch report of two spare batteries. Choose to gather more evidence, qualify the recommendation, or pause submission. Leave **Skip for now** selected if you want to decide during the session. If you choose **Back** before starting, focus returns to the armory button and you can resume the same loadout draft.
2. Choose **Start evidence exercise**. The fresh Standard Mode session comes with Evidence Check and the sample supply card. Review and manually send the prepared task in DSH, then decide when the native question card appears. In **Evidence available**, the card records two cans of lamp oil, so the handoff can proceed without asking you to resolve a missing source.
3. Choose **View evidence run** in the session, or find the run in **Run history**. Once the run finishes and passes verification, **Opening choice and actual decision** puts your recorded intention next to your native choice and any delivered files. You might start by planning to pause, then choose a qualified recommendation once you see what the supply card supports. XP follows the verified activity in the native session.
4. After a recorded decision in **Missing key evidence** or a verified handoff in **Evidence available**, choose **Use this loadout on my task** in the original DSH conversation. **View evidence run** still opens the full practice record.
5. Choose your workspace, or use **Add a materials folder** to add an existing folder through DSH's workspace picker. Pick the file, fill in the new task brief, and review the loadout. Adding a folder keeps the task text you have entered. Open a fresh DSH session and send the task yourself. In **View task result**, check any choices and delivered files, and save the gear as a plan if you want to reuse it.

## Replay a personal task without Evidence Check

1. Open **View task result** on a personal Standard Mode run with a verified Evidence Check choice. Choose **Try one gear change**, then **Review Evidence Check removal**. The preview removes only Evidence Check and keeps Deliverable Preview and its original tool source.
2. Choose **Open rematch session**, then manually send the same task in the new DSH session. The replay uses the original workspace, material and brief. The original material and source must still pass verification.
3. In **Evidence gear comparison**, compare the actual tool calls, recorded choices, and files from both sessions. A choice to pause can leave zero files. If the replay asks a question of its own, any recorded answer appears on that side. Open either source session to inspect the conversation and decide whether to equip Evidence Check next time.
4. Once you have a completed personal comparison, open **Armory → Evidence Check → View evidence replay history**. Search by task, material, or workspace. Select a comparison and open either original DSH session to check the recorded choices and attachments. Completed records stay available if you later change the material.

## Share a Lighthouse challenge

1. Complete the public **Missing key evidence** exercise and open **View evidence run**. Choose **Share a Lighthouse challenge** and **Copy invitation** to share the problem with a friend. The invitation includes the installation guide and a code for the packaged sample and standard loadout.
2. To play a shared challenge, choose **Join a Lighthouse challenge** in the Armory's Lighthouse section. You can also reach it from **Lighthouse Supply Run**. Paste the code yourself and choose **Check challenge code**. After checking the sample and equipment sources, you can record your own optional opening choice and open a fresh session. Manually send the task and decide on the native DSH question card.
3. If the sample and stock loadout match and only the source package versions differ, choose **Review the local Standard loadout**. Check the original DSH version alongside the gear and sources this session will actually use. You can then record an opening choice and manually send the task in a new DSH session. A missing stock source or a different loadout blocks this option, while exact matches continue to open from the original check.
4. After your decision is verified, choose **Copy my decision for a friend** in the same DSH conversation and send the code to your friend yourself. When you have their code, open **View evidence run** and choose **Compare a friend's decision**. The code carries only the public sample version, the recorded choice, and whether a file was delivered. The board labels your own verified result and your friend's shared result.
5. Choose **Play again with the same loadout** from the comparison to try another choice on the same sample. Open the new draft and manually send the same task, then make a fresh decision on the native question card.

Before your first send in an evidence or hero trial, the conversation shows whether the original task is ready. If you clear the draft, choose **Fill original task**. If you edit it or add attachments, choose **Copy original task**, then restore the original text and remove any extra attachments yourself so the game can verify this run.

After switching away from an unsent Lighthouse run, choose **Resume a Lighthouse draft** in the Armory. Choose an evidence exercise or the hero you opened, then choose **Open draft** to return to that conversation with its current draft.
If its loadout changed, the run shows a warning. Restore the original loadout before sending to get a verified challenge result.

### Replay a public challenge with one gear change

1. Finish a public **Missing key evidence** run with a recorded native choice. Choose **Replay without Evidence Check** from that conversation or its evidence record, then **Review Evidence Check removal**. Check the one gear change and the retained Deliverable Preview source.
2. Choose **Open rematch session** and manually send the identical task. The replay runs against a fresh copy of the same packaged sample. Each session keeps its own output files.
3. In **Observed handoff results**, open each actual delivered file or its original conversation and compare the recorded choices. Apply the side you want with **Use Evidence Check on my task** or **Use direct delivery on my task**.
4. Select or add your own material folder, pick a file, and write a new task. Review the equipment and its sources, then manually send the task in a new DSH conversation.

## Keep a loadout for next time

In a completed **Evidence gear comparison**, **Keep a loadout for next time** shows the actual choices and attachments from both runs. On the side you prefer, choose **Keep this loadout**, review the gear and its sources, then name and save the plan. Saving leaves your current Armory draft in place. In **Loadout plans**, select the saved plan and choose **Start a task with this loadout** to use it on new material.

Plans saved from a verified evidence comparison in v0.95 or later link to the run you chose. In **Loadout plans**, choose **View tested source** to return to that run and check the recorded choice and attachments in DSH. Renaming a plan, editing its notes, or changing the original material later keeps the link. Replacing the plan's gear clears the link. Share codes carry the reusable loadout and keep the evidence link in your local profile.

## Play your first rematch

1. Open **Lighthouse Supply Run** in the lobby and choose **Lighthouse rematch lesson**, then **Start rematch lesson**. The lesson prepares the sample files and a Standard Mode loadout for direct delivery. You can start without setting up a workspace or saving a plan.
2. In the new DSH session, review and manually send the prepared task. Open the delivered lighthouse card. Once the delivery is verified, choose **Try Delivery Review** in the same conversation.
3. Review the one change, then open the rematch in its own DSH session and send the same task yourself. When the DSH question card appears, confirm delivery or request changes. Open the rematch result to see **Observed handoff results**. The two sides show the actual choice and what each run delivered, including a run with zero files. **View lesson results** in the original conversation still offers the full results and equipment editor.
4. Choose **Replay review** after a verified choice. Send the same task yourself in the new conversation and make a fresh choice. The report can then show two different recorded choices made with the same gear, with each run’s actual files and source conversation.

**Lighthouse Supply Run** also offers the original **Recon** and **Delivery** routes.

Choose **Play & invite a friend** in the lobby to start a Lighthouse handoff. Pick **Deliver directly** or **Review before delivery**, then send the prepared task yourself in DSH. After the round is verified, choose **Invite a friend to the same handoff** and copy the invitation. Your friend pastes it into **Join a Lighthouse challenge** and picks a route. Both use the same public card and task language. Review lets either player request changes before delivery. The invitation contains the public sample and your route.

After both players finish, open **Exchange handoff reports** from a verified handoff. Copy your code and paste your friend's code to compare routes, recorded review decisions, and whether each handoff included the original card. **Try Delivery Review again** opens a new draft for the same public task so you can make another choice. Your files and session stay in your Profile.

If you played Review and your friend reports delivering the original directly, choose **Try your friend's direct route** on their card. DSH opens a direct delivery draft for the same public task. Send it yourself to see how the handoff changes.

After that direct delivery is verified, choose **Compare my two handoffs**. See your original review decision and the second run's actual attachment side by side. You can open either native conversation from the comparison.

Choose **Use this loadout** on either card to take that route into your own task. Select your own file, write a task brief, and review the loadout before opening a new draft. Review is available after a verified request for changes, even when that practice round delivered no files.

After a verified result from a v0.171.0 personal task opened from these cards, try the other route on the same task. The form brings in your file and brief, and shows the other tested loadout before you open a draft and send it yourself.

When a same-task replay opened in v0.172.0 finishes, its result compares both personal runs. Check the review decision and the actual original-file delivery, or open either conversation from the comparison.

Choose **Keep this loadout** on either personal result card. Check that run's actual choice, delivery and tool calls while naming the plan. From the save confirmation, start a new task with the saved loadout and choose a new file and brief. The plan saves the loadout and the details you enter when naming it.

You can reach the same personal comparison from solo practice. In Lighthouse, deliver the card in Standard mode, add Delivery Review and run the same task. After both runs are verified, choose either loadout from that result. Use your own file and, after the first result, try the other route on the same task.

From Loadout plans, choose **View tested source** on a loadout saved from a personal comparison in v0.175.0 or later. See the run's actual decision, tools and delivered files in the plan library. Return to the same plan or open the exact original conversation. The source link stays in your Profile. Sharing sends the loadout recipe.

To return to an unsent friend challenge or review replay, open **Resume a Lighthouse draft** in the lobby. Select the route and task language to reopen the original draft.

## Use the lesson loadout on your own task

1. Open **Observed handoff results** in a verified Lighthouse rematch. Choose **Use this loadout** on the direct delivery or Delivery Review side. A verified request to revise can also provide the review loadout. You can reach loadouts from **Run history**. Saving a plan is optional.
2. Choose one of your existing workspaces, use **Browse files** to pick your own material, and fill in **New task brief**. Choose **Review file and loadout** to check the preset, equipment sources, and prepared task, then choose **Confirm and open session**.
3. Check the task in the DSH input box and send it yourself. With Delivery Review, answer the new session's question card to confirm delivery or request changes, then open any file actually delivered for this task.

## Keep a loadout that worked on your task

1. After running a personal task with a loadout from the Lighthouse lesson, choose **View task result** in that session. The result shows actual tool calls, any recorded answer, delivered files, and XP earned in this task. You can also review a matching task opened in v0.82.
2. Choose **Open delivered file** when DSH offers it, or **View source session** to find the native attachment. A request to revise appears as a recorded choice. The result lists files once they have been delivered.
3. Choose **Review this loadout** to check the equipment and sources used for this task. Choose **Save as a plan** and enter a name to reuse the loadout with new material.

## Replay your own task with one gear change

1. Open **View task result** in the original personal session. When the run has verified material, choose **Try one gear change**, then add, remove, or swap one piece of gear and review the change.
2. Open the rematch in the same workspace and manually send the prepared task. The task and material carry over. Open the two original sessions to compare actual tool calls, any DSH question-card choices, and the files each session delivered.
3. If the file has changed or the run was opened in v0.82 or v0.83 without a material check, choose **Rerun baseline with current material**. Select the current file or another material, review the original task brief and edit it if needed, then manually send from the new baseline session. You can still view the earlier result in its original session.

## Try a review step before delivery

1. After a Standard Mode direct delivery run actually delivers your selected file, open **Try one gear change** from its task result. This includes personal tasks started with **Use Standard on my task** from the Lighthouse trial. **Try Delivery Review** appears when the material is still verified and adding review preserves the original delivery source. For the stock Standard loadout from the trial, the preview also checks the original file-reading source.
2. Choose **Try Delivery Review** to preview adding just that piece of gear. Review the changes, then choose **Open rematch session** and manually send the same task in DSH.
3. Compare the original delivery with the rematch. The rematch records what you chose on the DSH question card. A successful delivery after approval shows its actual attachment. If you request changes, check the recorded choice and whether a file was delivered in the rematch.

## Try direct delivery after a reviewed run

1. On a verified personal run with **Delivery Review**, open **Try one gear change**. A personal task or its first review rematch can offer **Try direct delivery** once DSH has recorded your choice and actually delivered the selected file. The original material and delivery source must still be verifiable.
2. Choose **Try direct delivery** to preview removing just Delivery Review. Check the change, then choose **Open rematch session** and manually send the same task.
3. Compare the recorded choice and attachment in the reviewed run with the actual calls, choices, and files in the new run. Open either source session to inspect the result, then decide whether you want review for future handoffs.

## Keep the loadout you prefer after comparing results

After a verified Standard Mode rematch on your own material that adds or removes **Delivery Review**, open the comparison and look for **Observed handoff results**. Each side shows your recorded DSH choices and whether it delivered the selected material, other files, or zero files. A same-named file in a different folder counts as another file. Use the original session links and call lists to inspect either run.

Choose **Keep this loadout** on an eligible side. Check its original gear and sources, then choose **Save as a plan** and enter a name. You can start a new task from that plan with fresh material.

## Try one gear change

1. On a completed, verified side of a workspace or saved plan comparison, choose **Try one gear change**. Add, remove, or swap one piece of gear and preview the resulting capabilities and sources.
2. Keep the same material and task. Open a fresh DSH session, review the prepared task, and send it yourself. If the material has changed, start a new comparison to establish a baseline.
3. Open the two source sessions to check the actual tool calls, recorded choices, and delivered files. Add **Delivery Review** to a direct delivery loadout to see whether the new session asks you to confirm delivery or request changes.
4. When the rematch is verified, choose **Try one gear change** on that run to use it as the next baseline. Choose **View previous comparison** to follow the changes one run at a time. From **Run history**, revisit any verified run, review its loadout, and save it as a plan.

## Find gear for a rematch

In **Try one gear change**, choose **Add one piece of gear** or **Swap one piece of gear**. For a swap, select the gear to remove first. In **Search gear by name or purpose**, enter a gear name, what you want it to do, or a decision it offers. For example, typing “request changes” finds **Delivery Review**. Search accepts both English and Chinese terms.

Changing or clearing the search keeps your selected gear and source. Choose **Review gear change** to check the effect of the one change you selected.

## Compare your saved loadouts

If you saved plans from both sides of the same **Evidence gear comparison**, select either plan and choose **Retest these loadouts with new material**. A single plan from the other side is preselected. If there are several, choose which one to use. Pick a workspace, one new file for both runs, and a new task brief. Review both plans and manually send the task in each new DSH session to compare their actual choices and files. **Compare with another saved plan** is also available for pairing other loadouts.

Once both retest runs are complete, **What changed in this retest** shows each plan's recorded choices and delivered files under **Original test** and **This retest**. Choose **View original comparison** to check the source sessions. Retests started in v0.97 or later keep that link through later edits or gear replacement in the saved plans. A v0.96 retest can show the same panel when both saved plans still match their original sources.

For either side that still matches its saved plan, choose **Record when to use it**. Edit the existing **Plan note** in your own words, then choose **Save note**. You can read and search the note in **Loadout plans**. If the plan changes while you edit, review its latest note before saving. The comparison still shows the recorded run results.

1. In **Loadout plans**, select a plan and choose **Compare with another saved plan**. Select a different plan, choose one workspace, and use **Browse files** to pick the shared material. Enter the task for both plans.
2. Choose **Review both plans** to check capability changes, tool sources, and whether both loadouts are ready to run. Open each loadout in its own DSH session and manually send the same prepared task in both.
3. Compare the actual tool calls, choices recorded in DSH question cards, and delivered files. Open either original session to check its results. Return through **Run history** to find the comparison and keep the loadout you verified.

## Use saved gear for a new task

1. In **Loadout plans**, select a plan and choose **Start a task with this loadout**. Choose an existing workspace and use **Browse files** to select material. You can search by file name or relative path, including names with spaces or Chinese characters. Picking another file keeps the task description you entered.
2. If you have an eligible saved plan from the other side of the same evidence comparison, **Choose a tested loadout** shows the available plans and your notes. After choosing material and entering the task, you can switch plans and keep those inputs.
3. Choose **Review file and loadout** to check the preset and the equipment sources available now. Choose **Confirm and open session** to open a fresh DSH session. Review the prepared task in the conversation and send it yourself.
4. With a review-first loadout, check the draft and answer the DSH question card when it asks whether to confirm delivery or request changes. Open the actual attachment from that session after it is delivered.

If DSH reopens an unsent task from a saved plan or a lesson with a different preset, the task banner flags the change. Choose **Restore the reviewed loadout** to restore the original loadout in that same session when it is still available. Your draft stays in the composer. Check the restored loadout and send the task yourself when ready.

## Find a run worth keeping

Open **Run history** in the lobby. Search by task, workspace, or material to find a previous comparison or rematch. Filter for delivered files or recorded choices. Follow the source sessions to open attachments and read the original DSH question cards.

Choose **Review and reuse loadout** for the route you want to keep. For a review route, you can check the recorded decision before reusing its gear. Choose **Save as plan** and enter a name you can find again.

## Compare delivery playbooks on your own material

1. Open **Compare in workspace** in the lobby. Choose an existing workspace and use **Browse files** to select the material for both routes. Start **Deliver directly** and **Review before delivery** in separate Standard Mode sessions in that workspace.
2. Review and manually send the same prepared task in each session. The review route can show a draft and ask for confirmation or revisions. Answer the question card in its source session.
3. Return to the comparison to check any pending question, your recorded answer, actual tool calls, and delivered file names. Open either source session to inspect the result. Use **Review proven loadout** to reuse the gear from a completed round.

If the selected file changes, start a new comparison with the current version. Earlier verified results stay available from their source sessions.

## Compare two Lighthouse loadouts

1. Choose **Compare runs** in the lobby to open **Lighthouse comparison**. Start **Recon** and **Delivery** in separate, fresh Standard Mode sessions seeded with matching copies of the sample files.
2. Send the same prepared task yourself in each session. Recon can find the card with `glob` and ask whether the path is enough. Delivery equips Deliverable Preview and can attach the card with `present`. Open the original session to inspect the attachment when it is delivered.
3. Choose **Compare runs** in either session to finish the other route or review both results. Compare actual tool calls, any answer you gave in a DSH question card, and delivered file names. Use **Review proven loadout** in the original session to reuse the gear you verified.

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
