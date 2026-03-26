# 免费 API 获取与接入

在OVO里可通过「API 接入」或 LiteLLM 使用以下免费/有免费额度的接口，按需选择。

---

## API 地址是什么？

**API 地址**就是你要连的**接口根地址**（Base URL），OVO会用它请求「模型列表」和「对话」。要求：

- 必须是 **OpenAI 兼容** 的接口（支持 `/v1/models`、`/v1/chat/completions`）。
- 一般以 **`/v1` 结尾**（有的平台是 `/v1`，有的没有，以官方文档为准）。
- **不要**在地址后面再加 `/models` 或 `/chat/completions`，程序会自动拼路径。

| 你填的 API 地址 | 实际请求示例 |
|-----------------|--------------|
| `https://api.deepseek.com/v1` | `https://api.deepseek.com/v1/models`、`https://api.deepseek.com/v1/chat/completions` |
| `https://api.openai.com/v1` | `https://api.openai.com/v1/models`、`https://api.openai.com/v1/chat/completions` |
| **留空** | 使用当前页面的 `/api/v1`（即本机「启动.bat」选 1 提供的代理，再转发到 LiteLLM） |

**总结**：用哪家的模型，就填那家文档里给的 **Base URL / API 根地址**（多数是 `https://xxx.com/v1`）；用本机 LiteLLM 时留空即可。

---

## 一、完全免 Key（本地）

### Ollama（推荐入门）

- **说明**：本机运行开源模型，不经过外网、不消耗任何 API 额度。
- **获取**：无需 API Key，安装 [Ollama](https://ollama.com) 后执行例如 `ollama run qwen2:7b` 拉取模型。
- **在本项目中的使用**：先启动 Ollama，再「启动.bat」选 2 启动 LiteLLM，再选 1 打开 OVO，在页面选择 Ollama 模型即可。
- **详细步骤**：见 [06-Ollama-本地免Key](06-Ollama-本地免Key.md)。

---

## 二、官方免费额度（需注册获取 Key）

以下均为厂商官方，注册后在控制台创建 API Key，在「API 接入」或 `litellm/config.yaml` 中填写即可。

| 服务 | 免费额度概况 | 获取 Key / 文档 |
|------|----------------|------------------|
| **通义千问（阿里云 Dashscope）** | 新用户有免费额度 | [控制台](https://dashscope.console.aliyun.com/) → 开通灵积 → API-KEY 管理 |
| **DeepSeek** | 新用户赠送额度，价格较低 | [平台](https://platform.deepseek.com/) 注册并创建 API Key |
| **智谱 GLM（开放平台）** | 有免费体验额度 | [开放平台](https://open.bigmodel.cn/) 注册并创建 Key |
| **Kimi（月之暗面）** | 有免费额度 | [开放平台](https://platform.moonshot.cn/) 注册并创建 Key |
| **Google AI（Gemini）** | 免费 tier 可用 Gemini 1.5 Flash 等 | [Google AI Studio](https://aistudio.google.com/) 获取 API Key |
| **Groq** | 免费 tier，推理速度快 | [Groq Console](https://console.groq.com/) 注册并创建 Key（OpenAI 兼容） |

接入方式（二选一）：

- **方式 A**：在页面侧栏「API 接入」中填写 **API 地址** 和 **API Key**，保存后模型列表会从该接口拉取。
- **方式 B**：用 LiteLLM 统一转发时，在 `litellm/config.yaml` 里为对应模型填写 `api_key` 与（如需要）`api_base`，详见 [05-API-Key-配置说明](05-API-Key-配置说明.md)。

---

## 三、常见免费 API 地址示例（用于「API 接入」）

在侧栏「API 接入」里，**API 地址** 可填为下列 base（一般已包含 `/v1`，无需再加 `/chat/completions`）：

| 服务 | API 地址（Base URL） | 说明 |
|------|----------------------|------|
| **Groq** | `https://api.groq.com/openai/v1` | 填 Groq 的 Key，可选模型如 `llama-3.1-70b-versatile` |
| **Google Gemini（OpenAI 兼容）** | 以 LiteLLM 或官方文档为准 | 需用支持 Gemini 的网关或官方兼容端点 |
| **通义（OpenAI 兼容模式）** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 见 [Dashscope 文档](https://help.aliyun.com/zh/dashscope/developer-reference/use-qwen-by-openai-api) |
| **DeepSeek** | `https://api.deepseek.com/v1` | 官方 OpenAI 兼容接口 |
| **智谱** | 以开放平台文档为准，通常为 `https://open.bigmodel.cn/api/paas/v4` 等 | 见 [智谱开放平台文档](https://open.bigmodel.cn/dev/api) |

「API Key」处填各平台控制台里创建的 Key；若接口要求 `Bearer`，本程序会自动按 `Bearer <Key>` 发送。

---

## 四、第三方免费/公益中转（谨慎使用）

网上有不少「免费 API」「公益中转」服务，例如：

- 某些 **Free Qwen / 分布式算力** 站点提供临时免费接口；
- 一些 **API 中转站** 提供国内直连、新用户送额度。

这类服务**非官方**，可能随时变更、限速或下线，仅作尝鲜。使用时请注意：

1. 不要填写重要账号的密码或敏感 Key。
2. 优先用「API 接入」单独填该服务的地址和 Key，与官方 Key 分开。
3. 若请求失败，多为服务方限制或地址变更，可尝试更换或使用官方/本地方案。

---

## 五、使用顺序建议

1. **零门槛**：本机安装 Ollama，用 [06-Ollama-本地免Key](06-Ollama-本地免Key.md) 先跑通对话。
2. **要更好效果**：在通义 / DeepSeek / 智谱 / Kimi 等选一家，注册后在「API 接入」或 `config.yaml` 里配置对应 Key 和地址。
3. **要国外模型**：可用 Groq 免费 tier，或 Google AI Studio 的 Gemini；若使用第三方中转，请自行甄别安全性与稳定性。

更多 Key 的配置细节见 [05-API-Key-配置说明](05-API-Key-配置说明.md)。
