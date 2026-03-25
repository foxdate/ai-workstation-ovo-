# OVO

**AI 工作站** — 接入多个 AI 软件与模型，**重点在对话互通**：把 A 软件的对话给 B 软件用，在OVO内换模型继续聊。多模型统一入口，支持自主 API、插件、会议模式与自我拓展。

**👉 对话互通：** [docs/13-对话互通.md](docs/13-对话互通.md)（导出/导入对话，A↔B 互通）  
**👉 发给别人安装：** [docs/打包与发布清单.md](docs/打包与发布清单.md) · 对方解压后读 [首次安装指引.md](首次安装指引.md)  
**安装总结：** [docs/安装总结.md](docs/安装总结.md) · **完整安装：** [docs/00-详细安装与使用教程.md](docs/00-详细安装与使用教程.md) · **免费 API：** [docs/免费API获取与接入.md](docs/免费API获取与接入.md)

---

## 项目介绍

OVO定位为** AI 工作站**：接入多种 AI 软件与模型（API、插件、会议等），**核心能力是对话内容互通**——将某处的对话导出为标准 JSON，导入到OVO或其他软件，实现「把 A 的对话给 B」、在OVO内换 AI 继续同一段对话。基于 Open WebUI + LiteLLM，支持多模型统一入口与自主 API/插件接入。

## 一键启动（需已安装 Docker）

```bash
# 1. 启动 LiteLLM 代理（请将下方路径改为你本机的 config.yaml 所在目录）
docker run -d -p 4000:4000 --name litellm \
  -v "D:\ai软件集成\litellm\config.yaml:/app/config.yaml" \
  ghcr.io/berriai/litellm:main-latest --config /app/config.yaml

# 2. 启动 Open WebUI（若尚未运行）
docker run -d -p 3000:8080 --name open-webui \
  -v open-webui:/app/backend/data \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/open-webui/open-webui:main
```

在 Open WebUI 中添加连接：**Base URL** `http://host.docker.internal:4000/v1`，**API Key** 与 `litellm/config.yaml` 中 `general_settings.master_key` 一致（默认 `sk-1234`）。详见 [docs/02-Open-WebUI-连接LiteLLM.md](docs/02-Open-WebUI-连接LiteLLM.md)。

## 接入 API

- **方式一（页面内）**：启动OVO后，在左侧栏 **「API 接入」** 填写 **API 地址**（如 `https://api.deepseek.com/v1`）和 **API Key**，点「保存」即可；模型列表会自动从该接口拉取，对话走该 API。
- **方式二（LiteLLM 统一网关）**：在 `litellm/config.yaml` 中为各模型配置 `api_key`，再运行「启动.bat」选 3 启动 LiteLLM，页面留空 API 地址即走本地代理。适合多模型、多 Key 统一管理。
- **免费 API 来源**：见 [docs/免费API获取与接入.md](docs/免费API获取与接入.md)；Key 配置细节见 [docs/05-API-Key-配置说明.md](docs/05-API-Key-配置说明.md)。

## 功能列表

- **对话互通（重点）**：tab 栏「导出对话」将当前对话导出为 JSON（剪贴板 + 工作区），「导入对话」从文件或粘贴的 JSON 导入，在OVO内换模型继续聊，或与其他 AI 软件 A↔B 互通。见 [docs/13-对话互通.md](docs/13-对话互通.md)。
- **多模型统一入口**：通过 LiteLLM 或页面「API 接入」使用 Grok、Claude、GPT、通义、DeepSeek、GLM、Kimi 等；会议模式多 AI 按序发言；单条回复可「转给 B」到另一模型。
- **插件与自我拓展**：接入外部 AI 服务为插件；运行 AI 生成的 JS 拓展代码；与 Cursor 联动（导出状态/本机状态、从工作区加载代码）。见 [docs/08-插件接入与数据互通.md](docs/08-插件接入与数据互通.md)、[docs/11-与Cursor联动.md](docs/11-与Cursor联动.md)。
- **国际/中国模型**：见 [docs/03-模型分组说明.md](docs/03-模型分组说明.md)。**最新 AI 技术亮点**：[highlights.html](highlights.html)。

## 项目结构

```
ai软件集成/
├── litellm/
│   └── config.yaml          # LiteLLM 模型与密钥配置
├── memory_store/
│   └── chat_summaries.txt   # 对话总结（占位）
├── scripts/
│   └── append_summary.py    # 追加总结到 chat_summaries.txt
├── docs/
│   ├── 02-Open-WebUI-连接LiteLLM.md
│   └── 03-模型分组说明.md
├── highlights.html          # 最新技术亮点页（可关闭）
└── README.md
```

## 截图占位

<!-- 可替换为仓库内截图路径 -->
![聊天界面](docs/screenshot-chat.png)
![设置连接](docs/screenshot-settings.png)

## 社交发布文案模板（可复制到 B站 / X / 小红书 / CSDN）

- **标题示例：** 用 Docker 搭了一个「永不遗忘」的网页版 AI 集成（Open WebUI + LiteLLM）
- **正文示例：** 最近用 Open WebUI + LiteLLM 搭了个人用的多模型聊天入口，支持 Grok、Claude、GPT、通义、DeepSeek、智谱、Kimi，对话总结先用手动存本地，后面打算接记忆层。项目名OVO，仓库链接：[你的 GitHub 链接]。适合想自建、又不想写太多代码的同学。

## 发布建议

- **B站：** 标题带「Docker」「Open WebUI」「多模型」；简介里放 GitHub 链接与一句话功能说明；可录 1～2 分钟演示「添加连接 → 选模型 → 发测试提示词」。
- **X (Twitter)：** 英文短句 + 仓库链接 + 标签 #OpenWebUI #LiteLLM #SelfHosted。
- **小红书：** 标题突出「零代码」「网页版」「多模型」「国产模型」；正文 3～5 条要点 + 一张界面截图 + 仓库链接。
- **CSDN：** 按「需求 → 环境 → 步骤 → 常见问题」写成教程，文末附仓库与一键命令。

---

# OVO (English)

## Intro

**OVO** (display name; packaged exe: `OVO.exe`) is a personal, web-based AI integration (MVP) using **Open WebUI** and **LiteLLM**, providing a single entry for multiple LLMs and self-configured API access.

## Quick start (Docker)

See the Chinese section for `docker run` commands. Add connection in Open WebUI: Base URL `http://host.docker.internal:4000/v1`, API Key = `master_key` in `litellm/config.yaml` (e.g. `sk-1234`). See [docs/02-Open-WebUI-连接LiteLLM.md](docs/02-Open-WebUI-连接LiteLLM.md).

## Features

- One gateway for Grok, Claude, GPT, Qwen, DeepSeek, GLM, Kimi via LiteLLM.
- International vs China models; China models tuned for Chinese and cost-effectiveness.
- Conversation memory: placeholder (local file + `scripts/append_summary.py`); Mem0 or vector DB later.
- Optional "Latest AI highlights" page ([highlights.html](highlights.html)), closable, links to official sites.

## Screenshots

![Chat](docs/screenshot-chat.png)
![Settings](docs/screenshot-settings.png)
