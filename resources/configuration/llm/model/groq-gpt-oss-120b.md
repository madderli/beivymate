---
id: groq-gpt-oss-120b
name: Groq GPT OSS 120B
provider: openai_compatible
model: openai/gpt-oss-120b
base_url: https://api.groq.com/openai/v1
api_key_env: GROQ_API_KEY
timeout: 120
max_retries: 2
enabled: true
---

# 云端生成验证

密钥仅从 GROQ_API_KEY 环境变量读取。普通 pytest 不访问网络。
免费额度由服务商账户决定，本配置不保证请求免费；请在控制台确认额度。
使用 JSON Schema best-effort 模式，保留程序结构和业务校验。
仅对短暂连接失败、429 和部分 5xx 最多重试两次；不重跑整个 Skill。
模型拒绝、截断、认证及结构错误不会自动重试或更换模型。
