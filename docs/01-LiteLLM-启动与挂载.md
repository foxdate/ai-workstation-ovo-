# 第 1 步：LiteLLM 启动与 config 挂载

## 若已有旧容器，先删除

```bash
docker stop litellm
docker rm litellm
```

## 使用挂载的 config 启动（请替换为你的实际路径）

```bash
docker run -d -p 4000:4000 --name litellm -v "D:\ai软件集成\litellm\config.yaml:/app/config.yaml" ghcr.io/berriai/litellm:main-latest --config /app/config.yaml
```

## 修改 config 后重启

```bash
docker restart litellm
```

## 查看日志确认加载成功

```bash
docker logs litellm
```

若看到类似 “Proxy initialized with Config” 或 “Set models”，即表示配置已加载。
