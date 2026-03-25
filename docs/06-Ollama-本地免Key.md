# 使用 Ollama 本地模型（无需 API Key）

通过 **Ollama** 在本机运行开源模型，不依赖任何云服务，**无需申请或填写 API Key** 即可对话。

## 1. 安装 Ollama

- 打开 https://ollama.com 下载并安装（Windows / Mac / Linux 均有）。
- 安装后 Ollama 会在后台运行，默认端口 **11434**。

## 2. 拉取模型（任选一个即可）

在命令行或 PowerShell 中执行（首次会下载，需一定时间）：

```bash
# 推荐：通义 Qwen2 7B，中文表现好
ollama run qwen2:7b

# 或：Llama 3.2 3B，体积小
ollama run llama3.2:3b

# 或：Phi-3 小模型
ollama run phi3:mini
```

执行后可以关掉该窗口，Ollama 会继续在后台运行，模型已缓存在本机。

## 3. 使用OVO对话

1. 确保 **Ollama 已安装且至少拉取过一个模型**（如上）。
2. **先保持 Ollama 在运行**，再启动 **LiteLLM**：`启动.bat` 选 3。（若先开 LiteLLM 再开 Ollama，Ollama 类模型可能不出现，需关掉 LiteLLM 再重新运行一次。）
3. 启动 **本地网页**：`启动.bat` 选 1，在浏览器打开提示的地址。
4. 在页面「当前模型」下拉框中选择出现的 Ollama 模型（仅显示 LiteLLM 已注册的模型）：
   - **Ollama Qwen2 7B (免 Key)**  
   - **Ollama Llama3.2 3B (免 Key)**  
   - **Ollama Phi-3 (免 Key)**  
   任选其一即可开始对话，无需填写任何 Key。

## 说明

- LiteLLM 在 Docker 中通过 `host.docker.internal:11434` 访问你本机的 Ollama，无需改端口。
- **顺序建议**：先启动 Ollama 并拉取模型，再启动 LiteLLM，这样下拉框里才会出现 Ollama 模型；若出现「Invalid model name」，请先 `docker stop litellm` 再重新「启动.bat」选 3。
- 若提示连不上，请确认 Ollama 已启动（任务栏或托盘有图标），且执行过至少一次 `ollama run 模型名`。
- 更多模型见：https://ollama.com/library
