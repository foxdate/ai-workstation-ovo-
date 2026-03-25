# ComfyUI 与OVO「图片生成」抽卡对接

## 原理

OVO后端提供 `POST /api/comfyui-generate`：

1. 读取 `zhiquan_workspace/comfyui_api_workflow.json`（你在 ComfyUI 里导出的 **API Format** 工作流）
2. 自动改写其中的 **正向/反向提示词**、**EmptyLatentImage** 的宽高与 `batch_size`、**KSampler** 的 `seed`（随机）
3. 可选：在 **图片生成** 右侧填写 **固定短语（前缀/后缀）** 与主提示词合并；填写 **LoRA 文件名与强度** 时，会改写工作流中的 **LoraLoader / LoraLoaderModelOnly**（按节点 ID 顺序）；**ControlNet 参考图 + LoadImage 节点 ID** 时，由后端将图上传到 ComfyUI 并写入对应 **LoadImage**（需你在 ComfyUI 里已接好 ControlNet 链）
4. 向本地 ComfyUI `POST /prompt` 提交，轮询 `/history` 后通过 `/view` 拉取图片
5. 返回与 OpenAI 兼容的 `data[].b64_json`，供前端画廊展示

## 你需要做的步骤（概览）

1. 在 ComfyUI 里用**当前能正常出图**的工作流（含 Z-Image / SDXL 等均可）。
2. 菜单选择 **Save (API Format)**（或等价「保存为 API 格式」），保存为 JSON。
3. 将该文件复制/重命名为：

   `zhiquan_workspace/comfyui_api_workflow.json`

4. 启动 ComfyUI，在OVO「图片生成」页选择 ComfyUI 后端并生成。

---

## 方法一：在 ComfyUI 里导出 API 工作流（详细）

### 1. 前提

- 本机已安装并能正常打开 **ComfyUI**（网页或桌面版均可，本质是浏览器里操作）。
- 画布上的工作流**已经能单独跑通一次**（点「Queue」能出图）。若 ComfyUI 自己都报错，先修模型、节点再对接OVO。

### 2. 打开「保存为 API 格式」入口

不同版本菜单位置略有差异，常见几种：

| 环境 | 操作 |
|------|------|
| 网页版 ComfyUI | 顶部菜单 **Workflow** 或 **工作流** → 找 **Save (API Format)** / **保存为 API 格式** |
| 部分中文版 | 同上，或 **文件** → **导出** 类菜单里 |
| 找不到该项 | 打开 **设置 (Settings)**，开启 **「启用开发模式 / Developer / API 保存」** 等选项后刷新页面，再试菜单 |

**不要**用「Save」或「保存工作流」里那种**只有画布节点**的 JSON（通常含大量 `nodes`、`links` 数组）。OVO需要的是 **API Format**，即发给 ComfyUI 的 `prompt` 节点字典。

### 3. 导出文件

1. 在 ComfyUI 里保持当前要用的工作流为打开状态。
2. 点击 **Save (API Format)**（或「保存为 API 格式」）。
3. 在保存对话框里选一个**你记得住的位置**（例如桌面或 `下载` 文件夹），文件名可随意，扩展名一般为 **`.json`**（例如 `my_workflow_api.json`）。
4. 保存完成后，用记事本或 VS Code **打开这个 JSON 快速看一眼**：
   - 若根结构是 **`{ "prompt": { "1": { "class_type": ... } } }`** 这种，**或**直接就是 **`{ "1": { "class_type": ... } }`** 的节点字典，即为正确格式。
   - 若主要是 **`"nodes": [...], "links": [...]`**，说明是**界面工作流**，不是 API 格式，请回到 ComfyUI 用 **API Format** 再导一次。

### 4. 放到OVO项目里的固定路径

OVO项目根目录（例如你机器上的 `d:\ai软件集成`）下需要有：

- 文件夹 **`zhiquan_workspace`**（若没有，请**新建**该文件夹）。
- 其内部放入文件，**文件名必须严格为**：

  **`comfyui_api_workflow.json`**

**示例（Windows）：**

```text
d:\ai软件集成\
  zhiquan_workspace\
    comfyui_api_workflow.json    ← 把你导出的 API 内容放这里（可覆盖旧文件）
```

**做法：**

1. 复制你在第 3 步保存的 `.json` 文件。
2. 粘贴到 `zhiquan_workspace` 文件夹中。
3. **重命名**为 `comfyui_api_workflow.json`（若已有同名文件，选择覆盖）。

也可以：在资源管理器中直接**把导出的文件拖进 `zhiquan_workspace`**，再重命名。

### 5. 启动顺序

1. 先启动 **ComfyUI**（命令行或快捷方式），确认浏览器能打开，默认多为 `http://127.0.0.1:8188`。
2. 再启动 **OVO** 的本地服务（`server_with_proxy.py` 等），浏览器打开OVO页面。

### 6. 在OVO里确认

1. 进入 **「图片生成」**（或带 🖼️ 的入口）。
2. **生成后端** 选 **「ComfyUI 本地」**。
3. **ComfyUI 地址** 填你的实际地址（与浏览器打开 ComfyUI 的地址一致，一般为 `http://127.0.0.1:8188`）。
   - **从控制台一键接入（推荐）**：在 ComfyUI 的启动窗口或终端里**全选复制**日志（通常含 `To see the GUI go to: http://…` 或 `http://127.0.0.1:8188`），在OVO「图片生成」页中部表单中找到 **「从 ComfyUI 控制台粘贴接入」**，粘贴后点 **「解析并保存」**，或在该框内按 **Ctrl+Enter**。OVO会自动识别地址、切换为 ComfyUI 后端，并把地址写入本地保存（与手动填写「ComfyUI 地址」效果相同）。若日志里为 `0.0.0.0:端口`，会自动换成 `127.0.0.1` 以便浏览器访问。
4. 左侧若不再提示「未检测到 comfyui_api_workflow.json」，说明路径已识别（若仍提示，检查文件名拼写、是否放错目录）。
5. 在右侧 **「使用的提示词」** 里填写内容，点击 **「生成一批」**。

### 7. 常见问题（方法一）

- **菜单里始终没有 API 格式**：升级 ComfyUI 或打开设置里的 **开发模式 / API 相关选项**；仍没有则用 **方法二（脚本 + Network 抓 `/prompt`）** 代替。
- **OVO仍报找不到文件**：确认路径是 `OVO项目根目录\zhiquan_workspace\comfyui_api_workflow.json`，不要多一层 `comfyui_api_workflow.json` 文件夹。
- **能生成但提示词不对**：见下文「自动修补规则」，OVO会按节点顺序改前两个 CLIP 文本等；若你工作流特殊，需要调整节点顺序或改工作流 JSON。

---

### 用脚本安装（可不点「Save API Format」）

若中文版界面里不好找「保存为 API 格式」，可在 ComfyUI 网页里 **Queue Prompt** 一次，然后从浏览器 **开发者工具 (F12) → Network** 里找到对 **`/prompt`** 的 POST 请求，将 **Request Payload** 另存为 `payload.json`（或复制为 JSON 文本），再执行：

```powershell
cd d:\ai软件集成
python scripts\install_comfyui_api_workflow.py path\to\payload.json
```

或 PowerShell：

```powershell
.\scripts\install_comfyui_api_workflow.ps1 path\to\payload.json
```

脚本会自动从 `{ "prompt": { ... } }` 中取出 `prompt`，写入 `zhiquan_workspace/comfyui_api_workflow.json`。可先 `--dry-run` 只做校验：

```powershell
python scripts\install_comfyui_api_workflow.py payload.json --dry-run
```

**说明**：仅含画布节点（`nodes` / `links`）的 UI 工作流无法由本脚本转成 API 格式，仍需在 ComfyUI 内导出 API，或使用上述 Network 抓到的 `/prompt` 体。

脚本写入 `comfyui_api_workflow.json` 后，请同样 **启动 ComfyUI**，并在OVO「图片生成」中按上文 **方法一 §6** 选择后端与地址后再生成。

## 自动修补规则（当前版本）

- **CLIPTextEncode**：按节点 ID 排序，第 1 个写正向提示词，第 2 个写反向；若没有该节点，则尝试找带 `inputs.text` 的节点（前两个）。
- **EmptyLatentImage**：设置 `width` / `height` / `batch_size`（找到的第一个）。
- **KSampler / KSamplerAdvanced**：设置随机 `seed`（找到的第一个）。

若你的工作流结构特殊（例如 Z-Image 无 `EmptyLatentImage`），可能需调整工作流节点顺序或向我们反馈节点类型，以便扩展修补逻辑。

## 常见问题

- **400 未找到 comfyui_api_workflow.json**：先按上文导出并放到 `zhiquan_workspace/`。
- **超时 / 无图片**：确认 ComfyUI 能单独跑通同一工作流；检查输出节点（如 SaveImage）是否产生 `output` 类型图片。
- **提示词未生效**：检查 API JSON 里正向/反向是否对应前两个 `CLIPTextEncode`（或带 `text` 的节点）。
