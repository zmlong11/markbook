# MarkBook

MarkBook 是一个给开发者自己存命令、找命令、复制命令的小工具。

它不是文档系统，也不是后台管理面板。打开以后，核心流程就是：搜索 -> 回车复制 -> 去终端粘贴。

## 适合做什么

- 存常用命令，例如 Git、Docker、Linux、Windows、SSH
- 按标题、说明或命令内容快速搜索
- 把零散命令整理成自己的命令库
- 在日常开发和运维里反复取用

## 给使用者

如果你只是想直接用程序，不需要看源码。

发布文件在这里：

- `release/MarkBook 1.0.0.exe`

使用方法很简单：

1. 双击打开 `MarkBook 1.0.0.exe`
2. 直接输入关键词搜索命令
3. 用方向键选择结果
4. 按 `Enter` 复制命令
5. 回到终端或编辑器粘贴

常用快捷键：

- `Ctrl/Cmd + K`：聚焦搜索框
- `Arrow Up / Arrow Down`：切换结果
- `Enter`：复制当前命令
- `Delete`：删除当前选中命令
- `Esc`：关闭弹窗
- `Ctrl/Cmd + N`：新建命令

## 发布说明

推荐分发这个文件：

- `release/MarkBook 1.0.0.exe`

不建议只单独拷贝下面这个文件：

- `release/win-unpacked/MarkBook.exe`

因为 `win-unpacked` 里的 `MarkBook.exe` 依赖同目录的其他运行文件，单独拿走通常不能正常运行。

## 数据存放

程序数据保存在 Electron 的用户数据目录里，数据库文件名是：

- `markbook.db`

这意味着：

- 升级程序时，已有命令不会因为重新打包而丢失
- 备份数据库文件即可保留数据

程序里也保留了导入、导出和备份功能，迁移数据时优先用程序自己的导出/导入即可。

## 从源码运行

环境要求：

- Node.js 18+
- npm
- Windows

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

构建前端和主进程：

```bash
npm run build
```

打包 Windows 便携版：

```bash
npm run dist
```

## 项目结构

- `src/main`：Electron 主进程、窗口逻辑、数据库
- `src/preload`：预加载桥接
- `src/renderer`：界面
- `src/shared`：共享类型
- `release`：打包输出

## 当前版本

当前发布基线是 `1.0.0`。

这个版本的目标是稳定、轻量、能长期使用。
后续如果要做明显的结构调整或产品方向变化，建议从 `2.x` 开始，而不是直接破坏 `1.0.0` 的稳定基线。
