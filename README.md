# 会话管家

会话管家是 Jnm 开发的 Codex CLI 会话管理工具。它提供 Electron 桌面界面，用来统一管理本机 Codex 历史会话、备注、归档、路径绑定、Profile、Codex 配置和 LLM 助手。

## 功能

- 会话扫描、收藏、归档、备注和路径重新绑定
- PowerShell 恢复 Codex 历史会话，并检测当前会话窗口状态
- Profile 管理，支持读取 `config.toml` 和 `model_instructions_file`
- Codex 主配置和 `auth.json` 编辑入口
- LLM 助手，会话分类、置顶、排序和流式回复
- GitHub `version.jsonl` 非强制更新检测
- GitHub `announcement.jsonl` 公告展示
- GitHub Releases Windows 安装包和便携包发布

## 本地开发

```powershell
npm install
npm install --prefix renderer
npm run app
```

## 打包

```powershell
npm run dist:win
```

产物会生成在 `release/` 目录。

## 发布

推送 tag 后，GitHub Actions 会构建 Windows NSIS 安装包和 portable 便携包，并上传到 GitHub Releases。

```powershell
git tag v0.1.0
git push origin v0.1.0
```

## 更新与公告源

应用会读取仓库根目录的两个 JSONL 文件：

- `version.jsonl`：每行一个版本记录，用于更新检测和更新记录。
- `announcement.jsonl`：每行一个公告记录，用于右上角公告入口和关于页。

更新检测只提示，不强制安装。

## 数据位置

本工具不会修改 Codex 原始会话文件。自身元数据默认存放在：

```text
%USERPROFILE%\.codex-session-manager\store.json
```

## License

MIT
