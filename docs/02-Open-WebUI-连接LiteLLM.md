# 第 2 步：在 Open WebUI 里连接 LiteLLM

## 操作步骤

1. 打开 **http://localhost:3000**，登录后点击左下角 **Settings（设置）**。
2. 进入 **Connections（连接）** → **Add connection** 或 **Add OpenAI-compatible API**。
3. 填写：
   - **Base URL：** `http://host.docker.internal:4000/v1`
   - **API Key：** `sk-1234`
   - **名称（可选）：** `LiteLLM` 或 `OVO`
4. 保存后，在模型选择下拉框中应能看到 LiteLLM 里配置的模型。

## 连接成功测试提示词（复制到聊天框）

```
请用一句话介绍你自己：你是什么模型、来自哪家厂商？并回复「连接成功」。
```

若返回了模型名和「连接成功」，说明 Open WebUI → LiteLLM → 对应厂商的链路已通。若某模型报错，请检查 `litellm/config.yaml` 中该模型的 `api_key` 是否已替换为真实 Key。
