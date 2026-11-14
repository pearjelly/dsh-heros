# 灯塔补给卡 / Lighthouse supply card

For the lighthouse quest, success requires exactly these two tools in the same user turn, in this order:

1. Call `glob` with `{"pattern":"[0-9][0-9]-*.md"}` in the current working directory.
2. As soon as glob lists the files, call `present` with `{"files":[{"path":"02-灯塔.md","description":"北岸灯塔补给卡"}]}`. The Markdown file is already complete and exists in this workspace. The user needs to open it in DSH. After glob returns, the next assistant output must be a call to present, not a text message. Do not write a final answer before the `present` tool returns successfully.
