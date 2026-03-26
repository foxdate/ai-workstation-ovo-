# OVO

个人 **AI 工作站**：多模型统一入口，**核心是对话互通**——把 A 软件的对话导出为 JSON，导入到 OVO 或其它软件，在 OVO 内换模型继续同一段对话。支持页面内 API 接入、LiteLLM 网关、插件、会议模式与 Cursor 联动等。

**文档：** [对话互通](docs/13-对话互通.md) · [打包分发](docs/打包与发布清单.md) / [首次安装指引](首次安装指引.md) · [安装总结](docs/安装总结.md) · [完整教程](docs/00-详细安装与使用教程.md) · [免费 API](docs/免费API获取与接入.md)

---

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

- **方式一（页面内）**：启动 OVO 后，在左侧栏 **「API 接入」** 填写 **API 地址**（如 `https://api.deepseek.com/v1`）和 **API Key**，点「保存」；模型列表从该接口拉取，对话走该 API。
- **方式二（LiteLLM 网关）**：在 `litellm/config.yaml` 中配置各模型 `api_key`，运行「启动.bat」选 **2** 启动 LiteLLM，页面留空 API 地址即走本地代理。
- **免费 API 来源**：[docs/免费API获取与接入.md](docs/免费API获取与接入.md)；Key 配置：[docs/05-API-Key-配置说明.md](docs/05-API-Key-配置说明.md)。

## 功能概要

- **对话互通**：导出/导入 JSON，与其它 AI 软件 A↔B 互通。见 [docs/13-对话互通.md](docs/13-对话互通.md)。
- **多模型**：通过 LiteLLM 或页面「API 接入」使用 Grok、Claude、GPT、通义、DeepSeek、GLM、Kimi 等；会议模式、单条「转给 B」等。
- **插件与拓展**：[docs/08-插件接入与数据互通.md](docs/08-插件接入与数据互通.md)、[docs/11-与Cursor联动.md](docs/11-与Cursor联动.md)。
- **模型分组**：[docs/03-模型分组说明.md](docs/03-模型分组说明.md)。可选浏览 [highlights.html](highlights.html)。

## 运行方式

- **开发 / 源码运行**：双击 **启动.bat**，选 **1** 打开桌面窗口（需已 `pip install pywebview`）。选 **2** 启动 LiteLLM（Docker）。选 **3** 执行 **build_exe.bat** 生成 **`dist\OVO.exe`**。
- **仅桌面**：不再提供「只开浏览器、不装 pywebview」模式；`python server_with_proxy.py` 会提示改用 `desktop_app.py` 或 exe。

## 项目结构（节选）

```
ai软件集成/
├── litellm/config.yaml      # LiteLLM 配置
├── memory_store/            # 对话总结占位等
├── scripts/                 # 辅助脚本
├── docs/                    # 文档
├── desktop_app.py / server_with_proxy.py / index.html
├── 启动.bat / build_exe.bat / 检查安装.bat
├── dist/OVO.exe             # 由 build_exe.bat 生成
└── README.md
```

---

## OVO (English)

**OVO** is a desktop AI workstation (pywebview) with **Open WebUI** + **LiteLLM**: one entry for multiple LLMs, conversation export/import (JSON), optional plugins and Cursor integration.

**Docker:** use the commands above; in Open WebUI set Base URL to `http://host.docker.internal:4000/v1` and API Key to `master_key` in `litellm/config.yaml`. See [docs/02-Open-WebUI-连接LiteLLM.md](docs/02-Open-WebUI-连接LiteLLM.md).

**Features:** multi-model gateway, China/international model groups, conversation interoperability, optional [highlights.html](highlights.html).
