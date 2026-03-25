# OVO - 与 Cursor 联动（整合使用 AI 功能 / 让 AI 读取软件内容）

**推荐入口**：左侧栏 **「🖥️ AI 软件工作站」** 中已接入「Cursor / 本助手」，所有与 Cursor 的联动操作均可在此完成。详见 [14-AI软件工作站与平滑切换](14-AI软件工作站与平滑切换.md)。

通过「工作区」目录，OVO可以和 Cursor（或其它打开同一项目目录的 IDE）联动：**把OVO的运行状态导出给 Cursor 里的 AI 读取**，或**把 Cursor 里 AI 生成的拓展代码在OVO里加载运行**，从而在「不提供 API 密钥」的前提下，间接整合 Cursor AI 的能力。

---

## 一、你能得到什么

1. **AI 能读取OVO的运行内容**  
   在OVO里点击「**导出状态到工作区**」，会把当前对话、多 tab、模型列表摘要等写入项目下的 **`zhiquan_workspace/state.json`**。  
   在 Cursor 中打开同一项目目录后，你可以对 AI 说：「读一下 `zhiquan_workspace/state.json`，根据OVO里的对话帮我总结/改文案/写回复」等，AI 就能基于OVO里的真实内容回答。

2. **AI 能读取电脑状态（本机信息）**  
   在OVO里点击「**采集本机状态**」，会用 Python 脚本采集本机信息（系统、用户、磁盘、进程、内存等，不采集密码等敏感内容），写入 **`zhiquan_workspace/computer_state.json`**。  
   在 Cursor 中对 AI 说：「读一下 `zhiquan_workspace/computer_state.json`，看看我电脑当前状态」或「根据 computer_state 和 state 帮我分析……」即可让 AI 结合电脑状态与OVO对话一起分析。详见 [12-采集本机状态说明](12-采集本机状态说明.md)。

3. **AI 生成的代码可以直接在OVO里跑**  
   在 Cursor 里让 AI 写一段「OVO拓展代码」（使用 `ZhiQuanExt` 的 `addPanel`、`toast`、`getMessages` 等），保存为项目下的 **`zhiquan_workspace/extension.js`**（或其它 `.js` 文件名）。  
   回到OVO，在「自我拓展」里填好文件名，点「**从工作区加载并运行**」，即可执行这段代码，无需复制粘贴。

4. **整体流程**  
   - OVO ↔ 项目目录下的 `zhiquan_workspace/` 读写；  
   - Cursor 打开同一项目 → AI 能读 `state.json`、能写 `extension.js`（或你指定的文件名）；  
   - 这样既「整合了 Cursor AI 的能力」，又「让 AI 能读取软件运行的内容」，而无需给OVO配置 Cursor 的 API 或密钥。

---

## 二、使用前提

- OVO的**本地服务**是用「启动.bat」选 **1** 从**项目根目录**启动的（这样 `zhiquan_workspace` 才会落在项目里）。
- 在 Cursor 里打开的是**同一个项目目录**（即包含 `zhiquan_workspace`、`index.html`、`server_with_proxy.py` 等的那一层）。

---

## 三、操作步骤

### 1. 导出状态（让 AI 读取OVO内容）

1. 在OVO中正常使用（多 tab、对话、选模型等）。
2. 在左侧「自我拓展」区域点击「**导出状态到工作区**」。
3. 成功后，项目目录下会生成或更新 **`zhiquan_workspace/state.json`**，内容包含：
   - `currentTabId`、`conversations`（各 tab 的对话列表）、`modelListSummary` 等（不含 API Key）。
4. 在 Cursor 里对 AI 说例如：
   - 「读一下 `zhiquan_workspace/state.json`，总结当前OVO里最后一个对话在讨论什么」；
   - 「根据 state.json 里当前对话内容，帮我写一段OVO拓展代码，在侧边加一个面板显示最近三条消息的摘要」。

AI 读取的是你导出的那份 `state.json`，即「软件运行的内容」的快照。

### 2. 从工作区加载并运行（使用 AI 生成的拓展代码）

1. 在 Cursor 里让 AI 根据需求写一段OVO拓展代码（可参考 [09-自我拓展-API说明](09-自我拓展-API说明.md) 中的 `ZhiQuanExt` 用法）。
2. 将代码保存到项目下的 **`zhiquan_workspace/extension.js`**（或其它名字，如 `my_ext.js`）。
3. 在OVO「自我拓展」里，在「文件名」输入框中填写该文件名（默认 `extension.js`），点击「**从工作区加载并运行**」。
4. OVO会请求后端读取 `zhiquan_workspace/` 下该文件内容并执行，效果与在「运行拓展代码」弹窗里粘贴同一段代码并运行一致。

这样，你就把「Cursor AI 写好的功能」直接整合进OVO，而无需在OVO里配置 Cursor 的 API 或密钥。

---

## 四、接口说明（给开发者）

- **导出状态**  
  前端 `POST /api/export-state`，body 为 JSON：`{ currentTabId, conversations, modelListSummary }`。  
  服务端写入 `zhiquan_workspace/state.json`（自动创建目录）。

- **列出工作区文件**  
  `GET /api/workspace-files` → 返回 `{ files: ["extension.js", ...] }`，仅列出 `.js` / `.txt` / `.json`。

- **读取工作区文件**  
  `GET /api/workspace-file?name=extension.js` → 返回 `{ name, content }`。  
  文件名仅允许简单名称，禁止路径穿越。

---

## 五、小结

| 目标                     | 做法 |
|--------------------------|------|
| 让 AI 读取OVO运行内容   | OVO里点「导出状态到工作区」，在 Cursor 中让 AI 读 `zhiquan_workspace/state.json`。 |
| 让 AI 获得电脑状态       | OVO里点「采集本机状态」，在 Cursor 中让 AI 读 `zhiquan_workspace/computer_state.json`。 |
| 在OVO里使用 AI 写的功能 | 在 Cursor 中让 AI 写拓展代码并保存为 `zhiquan_workspace/extension.js`，OVO里点「从工作区加载并运行」。 |

这样，软件就可以**整合使用 Cursor AI 的功能**，并且**AI 可以读取软件运行的内容**，而无需在OVO里配置任何 Cursor 的 API 地址或密钥。
