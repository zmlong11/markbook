# MarkBook v1

MarkBook v1 是一个面向开发者的轻量命令启动器，用来快速搜索、查看、复制常用命令。

它不是文档系统，也不是传统 CRUD 笔记软件。核心目标是：

- 搜索优先
- 键盘优先
- 轻量、可长期运行
- 便于后续维护和继续演进到 v2

## 适用场景

- 保存和检索 Linux / Windows / Docker / Git / 运维命令
- 快速模糊搜索命令标题、说明和命令正文
- 2 秒内完成“搜索 -> 回车复制 -> 粘贴”
- 作为个人或团队内部命令工具长期使用

## 发布版本

当前稳定基线：`1.0.0`

推荐对外分发的文件：

- [MarkBook 1.0.0.exe](./release/MarkBook%201.0.0.exe)

说明：

- 给别人使用时，优先发上面的单文件便携包
- 不要只单独拷贝 `release/win-unpacked/MarkBook.exe`
- 如果不用单文件包，就要把整个 `release/win-unpacked` 目录一起带走

## 使用方式

启动后默认进入命令搜索界面。

常用流程：

1. 打开程序
2. 直接输入关键词
3. 用方向键切换命令
4. 按 `Enter` 复制当前命令
5. 回到终端或编辑器粘贴

常用快捷键：

- `Ctrl/Cmd + K`：聚焦搜索框
- `Arrow Up / Arrow Down`：切换结果
- `Enter`：复制当前选中命令
- `Delete`：快速删除当前选中命令
- `Esc`：关闭弹窗
- `Ctrl/Cmd + N`：新建命令

## 数据存储

程序数据保存在 Electron 的用户数据目录中，数据库文件名为：

- `markbook.db`

程序源码里数据库初始化位置在 [database.ts](./src/main/database.ts)。

这意味着：

- 更新程序版本时，原有数据不会因为重新打包而丢失
- 只要备份数据库文件，就能保留命令数据

## 备份与迁移

程序内支持导出和导入。

建议的做法：

- 定期导出知识库备份
- 发布新版本前保留一份数据库或导出文件
- 跨机器迁移时优先使用程序内导出/导入

## 项目结构

主要目录如下：

- [src/main](./src/main)：Electron 主进程、数据库、窗口逻辑
- [src/preload](./src/preload)：预加载桥接
- [src/renderer](./src/renderer)：React 界面
- [src/shared](./src/shared)：主进程与渲染层共享类型
- [release](./release)：构建输出与发布包

关键文件：

- [package.json](./package.json)：项目版本、依赖、打包脚本
- [src/main/main.ts](./src/main/main.ts)：主窗口和悬浮窗入口
- [src/main/database.ts](./src/main/database.ts)：SQLite 数据层
- [src/renderer/App.tsx](./src/renderer/App.tsx)：主界面
- [src/renderer/WidgetShell.tsx](./src/renderer/WidgetShell.tsx)：悬浮窗界面
- [src/renderer/styles.css](./src/renderer/styles.css)：样式

## 开发环境

要求：

- Node.js 18+
- npm
- Windows 环境下建议直接使用 PowerShell

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

构建生产资源：

```bash
npm run build
```

打包 Windows 便携版：

```bash
npm run dist
```

## 稳定性与维护策略

v1 的目标不是继续无限叠功能，而是作为稳定基线长期维护。

当前已经做的基础收口包括：

- 依赖版本固定，不再使用 `latest`
- 默认结果限量展示，降低无意义渲染
- 数据库增加常用索引，降低长期运行下的查询开销
- 发布目录已收口为 v1 版本

建议后续策略：

- `1.x`：只做稳定性、性能、可维护性优化和小幅体验修正
- `2.x`：再做结构变化、交互重构或新的产品方向

## 发布建议

如果要发给别人使用，建议一起附上这几条说明：

- 直接双击运行 `MarkBook 1.0.0.exe`
- 第一次启动后即可开始录入命令
- 如需迁移数据，请先在旧版本里导出备份
- 升级前建议保留一份数据库或导出文件

## 备注

这是 v1 发布基线。

后续如果进入大改版，请从 `v2` 分支或 `2.x` 版本线继续，不要直接破坏当前 `1.0.0` 的稳定基线。
