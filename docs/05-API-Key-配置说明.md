# API Key 配置说明

使用对话功能前，需在 `litellm/config.yaml` 中把占位符替换为真实的 API Key。  
**想用免费 API？** 见 [免费API获取与接入](免费API获取与接入.md)。  
未配置的模型会报错（如 AuthenticationError），可暂时不在页面中选择该模型。

## 通义千问（阿里云 Dashscope）- 当前报错模型

- **获取 Key：** https://dashscope.console.aliyun.com/  
  登录阿里云 → 开通模型服务灵积（Dashscope）→ API-KEY 管理 → 创建并复制 Key。
- **在 config 中替换：** 搜索 `your-dashscope-api-key`，改为你的 Key（两处：qwen-turbo、qwen-plus）。

```yaml
# 示例：将
api_key: "your-dashscope-api-key"
# 改为（Key 用你自己的）
api_key: "sk-xxxxxxxxxxxxxxxx"
```

修改后**重启 LiteLLM** 才会生效：命令行执行 `docker restart litellm`，或 `docker stop litellm` 后重新「启动.bat」选 2。

## 其他模型（可选）

| 模型 | 占位符 | 获取地址 |
|------|--------|----------|
| DeepSeek | your-deepseek-api-key | https://platform.deepseek.com/ |
| 智谱 GLM | your-zhipu-api-key | https://open.bigmodel.cn/ |
| Kimi 月之暗面 | your-moonshot-api-key | https://platform.moonshot.cn/ |
| OpenAI GPT | your-openai-api-key | https://platform.openai.com/ |
| Anthropic Claude | your-anthropic-api-key | https://console.anthropic.com/ |
| xAI Grok | your-xai-api-key | https://console.x.ai/ |

只替换你打算使用的模型对应的 Key 即可，未替换的模型不要选就不会报错。
