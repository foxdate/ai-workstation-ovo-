# ComfyUI 工作流模板（给 OVO 用）

本目录提供 **API Format** 的 JSON，可直接复制为 `ovo_workspace/comfyui_api_workflow.json` 供 OVO「图片生成」调用。  
OVO 会按 [docs/17-ComfyUI抽卡接入.md](../docs/17-ComfyUI抽卡接入.md) 自动改写：正/负向提示词、`EmptyLatentImage` 宽高与 `batch_size`、`KSampler` 的 `seed` 等。

## 文件说明

| 文件 | 说明 |
|------|------|
| `sd15_basic_api.json` | **Stable Diffusion 1.5** 最简文生图：CheckpointLoaderSimple → 双 CLIPTextEncode → KSampler → VAEDecode → SaveImage |

使用前请在本机 **ComfyUI** 的 `models/checkpoints` 中放入与 JSON 里 **`ckpt_name` 一致**的模型文件；若你的文件名不同，用记事本/VS Code 打开 JSON，修改 `10` 号节点里 `ckpt_name` 的字符串即可。

---

## 在 ComfyUI 里「从零搭工作流」的一般步骤（界面操作）

以下为通用流程，不同版本菜单位置可能略有差异。

### 1. 准备环境

1. 安装并启动 **ComfyUI**，浏览器打开（多为 `http://127.0.0.1:8188`）。
2. 将 **大模型**（`.safetensors` / `.ckpt`）放入 `ComfyUI/models/checkpoints/`。
3. 确认能加载模型：画布上添加 **Load Checkpoint**（或 **CheckpointLoaderSimple**），在节点里选中你的模型。

### 2. 搭一条最小文生图链路（概念）

典型顺序是：

1. **Checkpoint / 加载模型**：得到 `MODEL`、`CLIP`、`VAE` 三个输出。
2. **CLIP Text Encode（两条）**：一条接正向提示词，一条接负向提示词；`clip` 都接到上一步的 CLIP。
3. **Empty Latent Image**：设宽高、批量数（对应 OVO 里改的 width/height/batch）。
4. **KSampler**：`model` 接模型，`positive` / `negative` 接两条编码结果，`latent_image` 接 Empty Latent；设置 `steps`、`cfg`、采样器、`seed`。
5. **VAE Decode**：`samples` 接 KSampler 输出，`vae` 接 Checkpoint 的 VAE。
6. **Save Image**：`images` 接 VAE Decode 输出。

在界面里用**鼠标从输出圆点拖到输入圆点**完成连线。

### 3. 跑通一次

点 **Queue Prompt / 加入队列**，确认**能正常出图**。若报错，先解决模型路径、显存、节点版本等问题，再交给 OVO。

### 4. 导出给 OVO 的格式（重要）

OVO **只认 API 格式**，不认画布编辑器的「整页工作流 JSON」。

1. 菜单 **Workflow**（或 **工作流**）→ **Save (API Format)** / **保存为 API 格式**。
2. 若找不到，可在 **Settings** 里打开 **开发模式 / Developer** 后再试。
3. 保存得到 `.json` 后，用文本编辑器打开检查：应为 **`{ "数字或字符串": { "class_type": "...", "inputs": { ... } } }`** 这种**节点字典**；根级不应是 `nodes` / `links` 那种 UI 专用格式。

### 5. 放到 OVO 项目里

1. 在项目根目录确保有文件夹 **`ovo_workspace`**（没有则新建）。
2. 将导出的文件**重命名**为 **`comfyui_api_workflow.json`**，放入该文件夹。  
   或：复制本目录的 **`sd15_basic_api.json`**，改名为 **`comfyui_api_workflow.json`**，并改好其中的 **`ckpt_name`**。

### 6. 与 OVO 的对应关系

- 第一个 **CLIPTextEncode**（按节点 ID 排序）→ 由 OVO 写入**合并后的正向提示词**（含前缀/后缀）。
- 第二个 **CLIPTextEncode** → **负向提示词**（若前端传了 `negative`）。
- **EmptyLatentImage** → `width` / `height` / `batch_size`。
- 第一个 **KSampler** / **KSamplerAdvanced** → `seed`。

参考图、ControlNet、LoRA 等需你在 Comfy 里先接好，并在 OVO 图片生成侧填写对应 **LoadImage 节点 ID** 等，见 [docs/20-参考图与视觉生词.md](../docs/20-参考图与视觉生词.md)。

---

## 常见问题

- **提示找不到模型**：检查 `ckpt_name` 是否与 `models/checkpoints` 下文件名**完全一致**（含扩展名）。
- **OVO 改了提示词但 Comfy 里不变**：确认导出的是 **API Format**，且路径是 **`ovo_workspace/comfyui_api_workflow.json`**。
- **想用 SDXL / Flux / 其他架构**：请在 ComfyUI 里用对应节点搭通后，再 **Save (API Format)** 覆盖到上述路径；本仓库的 `sd15_basic_api.json` 仅作 SD1.5 示例。
