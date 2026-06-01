# NEXUS 本地化工具集

NEXUS 是一个面向游戏本地化工作流的本地工具 MVP。当前版本无外部 npm 依赖，包含静态前端和一个本地 Node 代理服务。

## 启动

```powershell
node server.mjs
```

打开：

```text
http://localhost:4173
```

可以用 `samples/mercenary-town.csv` 快速验证拆分、转换、演示翻译和检测流程。

如需换端口：

```powershell
$env:PORT=5180
node server.mjs
```

## 已实现

- 左侧信息架构：文件拆分、文本翻译、格式转换、本地化检测、术语表、设置。
- 文件上传：点击选择、拖拽上传、原生 file input 兜底。
- CSV 读取：UTF-8、UTF-8 BOM、GBK/GB18030 自动判断。
- XLSX 读取：内置轻量 ZIP/XML 解析器读取第一个工作表。
- 文件信息：文件名、大小、编码/类型、行列数。
- 文件拆分：按数据行拆分、表头策略、单文件下载、ZIP 打包下载。
- 格式转换：编码选项、分隔符、真实换行符输出、自动下载。
- 项目规则管理：内置“佣兵小镇”，支持新增、编辑、删除自定义项目。
- 文本翻译：本地代理 `/api/chat`、并发、暂停/继续、失败重跑、进度 CSV、结果 CSV。
- 本地化检测：本地规则检查、可选 AI 语义检查、报告 CSV、术语 CSV。
- 术语表：规则提取、AI 提取、术语表导入、在线编辑、CSV 下载。
- API 配置只在 AI 模块显示，浏览器不保存 API Key。

## AI 后端代理

前端只调用本地代理：

```text
POST /api/chat
```

API Key 使用后端环境变量配置：

```powershell
$env:OPENAI_API_KEY="..."
$env:GEMINI_API_KEY="..."
$env:DEEPSEEK_API_KEY="..."
$env:DASHSCOPE_API_KEY="..."
$env:ARK_API_KEY="..."
$env:CUSTOM_OPENAI_API_KEY="..."
$env:CUSTOM_OPENAI_BASE_URL="https://example.com/v1"
node server.mjs
```

未配置 Key 时，可以选择“本地演示（无需 Key）”验证完整任务流程。

## 当前限制

- `.xls` 是旧版二进制格式，当前无依赖 MVP 暂不解析；建议另存为 `.xlsx` 或 `.csv`。
- GBK/GB2312 导出需要可靠编码库，当前前端会提示并回退为 UTF-8。后续可在 `/api/convert-encoding` 接入 `iconv-lite`。
- XLSX 解析聚焦本地化文本表常用结构，复杂公式、样式、日期格式不会完整还原。
- 腾讯云混元、有道智云等非 OpenAI 兼容接口已预留入口，正式接入还需要签名或平台适配层。
