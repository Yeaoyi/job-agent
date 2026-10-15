# 求职 Agent

面向个人秋招求职的 Windows 桌面应用，使用 Electron、React 和 TypeScript。当前是初步体验版，包含企业/岗位管理、表格导入、简历资料编辑、简历版本及主题设置。

产品需求和当前实现边界见 [REQUIREMENTS.md](./REQUIREMENTS.md)。真实招聘平台网申、简历文件解析和 AI 岗位分析尚未接入；演示企业数据不是实际招聘信息。

## 环境

- Node.js 24 LTS
- npm
- Windows 10 或更新版本（首要目标平台）

## 开发

```powershell
npm install
npm run dev
```

如果当前 PowerShell 找不到 `npm`，先将 Node.js 安装目录加入当前终端的 PATH，再运行以上命令。

## 检查与构建

```powershell
npm run typecheck
npm run build
npm run build:win
```

## 企业表格导入

支持 `.xlsx`、`.xls`、`.csv` 和 `.tsv`。每行代表一个岗位，同一企业名称下的岗位会合并。建议列包含：企业名称、行业、城市/地点、招聘链接、岗位名称、岗位类型、薪资、岗位描述、投递链接。企业名称是唯一必填列；不含岗位名称的行可用于补充企业信息。

## 本地数据

企业、岗位、简历资料、已保存的简历版本和投递意向保存在 Windows 当前用户的应用数据目录中，文件名为 `workspace-v1.json`。应用会自动创建该文件，不需要安装或新建数据库。

在“设置 → 本地数据”中可以导出 JSON 备份或从备份恢复。恢复会覆盖当前本地数据，因此应先导出备份。简历编辑页的未保存草稿会暂存于本机，点击“保存修改”后才纳入数据文件与版本历史。

此版本不会把简历或导入文件上传到服务器，也不会执行真实网申或批量投递。“记录投递意向”仅保存用户主动选择单个岗位的本地记录，不会打开招聘网站或提交申请。

## 项目结构

- `src/main`：Electron 主进程
- `src/preload`：安全的预加载边界
- `src/renderer`：React 用户界面
- `REQUIREMENTS.md`：已确认需求、阶段范围和后续路线
