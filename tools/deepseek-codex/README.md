# Codex DeepSeek Switch

This setup keeps the normal OpenAI login/config as the default and only switches Codex to DeepSeek when you explicitly run the switch script.

## First setup

Run this in PowerShell from `E:\my-ai-app`:

```powershell
.\tools\deepseek-codex\setup-deepseek-codex.ps1
```

The script prompts for `DEEPSEEK_API_KEY` locally. Do not paste the key into chat.

## Use DeepSeek

Open one PowerShell window and keep it running:

```powershell
.\tools\deepseek-codex\start-deepseek-proxy.ps1
```

Then in another PowerShell window:

```powershell
.\tools\deepseek-codex\switch-codex-deepseek.ps1
```

Restart Codex Desktop.

## Restore official OpenAI

```powershell
.\tools\deepseek-codex\switch-codex-official.ps1
```

Restart Codex Desktop.

## Notes

- The DeepSeek API key is stored as a Windows user environment variable named `DEEPSEEK_API_KEY`.
- Codex config backups are created next to `C:\Users\<you>\.codex\config.toml`.
- The LiteLLM Python environment is local to this workspace at `.deepseek-litellm\.venv`.
