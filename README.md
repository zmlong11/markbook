# MarkBook

MarkBook 是一个给开发者使用的命令检索工具，用来保存、搜索和复制常用命令。

它不是文档系统，也不是传统的增删改查后台。这个项目的核心流程很简单：

搜索 -> 选中 -> 复制 -> 去终端粘贴

## 功能特点

- 按标题、说明、命令内容搜索
- 键盘优先，适合高频使用
- 本地 SQLite 存储，启动后可直接离线使用
- 支持新建、编辑、删除、导入、导出、备份
- 支持打包为 Windows 便携版

## 仓库说明

这个 GitHub 仓库默认提供的是源码，不一定长期附带可直接下载的 release 文件。

如果你是第一次使用这个项目，建议按下面的“编译与运行”步骤自己构建。

## 运行环境

当前项目以 Windows 为主要打包目标，但源码也可以在 Linux 下安装依赖、开发和构建。

推荐环境：

### Windows

- Windows 10 / 11
- Node.js 18 及以上
- npm 9 及以上
- PowerShell
- Git

检查环境：

```powershell
node -v
npm -v
git --version
```

### Linux

- Ubuntu 22.04+、Debian 12+，或其他主流桌面 Linux 发行版
- Node.js 18 及以上
- npm 9 及以上
- Git
- 图形桌面环境
- 编译 `better-sqlite3` 所需的基础工具链

建议先安装基础依赖。以 Ubuntu / Debian 为例：

```bash
sudo apt update
sudo apt install -y git build-essential python3 make g++ pkg-config libsqlite3-dev libgtk-3-0 libnss3 libxss1 libasound2
```

检查环境：

```bash
node -v
npm -v
git --version
```

如果命令能正常输出版本号，就可以继续。

## 获取源码

如果你是第一次拉取项目：

```powershell
git clone https://github.com/zmlong11/markbook.git
cd markbook
```

如果你已经有项目目录，直接进入项目根目录即可。

## 安装依赖

在项目根目录执行：

```powershell
npm install
```

这一步会安装 Electron、React、TypeScript、better-sqlite3 等依赖。

如果安装过程较慢，通常和网络环境有关，重新执行一次即可。

## 开发模式运行

开发模式适合本地改代码和调试。

执行：

```powershell
npm run dev
```

这个命令会同时启动三部分：

- Vite 前端开发服务器
- Electron 主进程 TypeScript 监听编译
- Electron 桌面程序

正常情况下，等待十几秒内会自动弹出桌面窗口。

如果窗口没有弹出，可以先看终端里是否有报错；常见原因通常是依赖没装完整，或者开发端口被占用。

## 生产构建

如果你只是想确认项目是否能正常编译，执行：

```powershell
npm run build
```

构建完成后会生成两部分产物：

- `dist/`：前端构建结果
- `dist-electron/`：Electron 主进程构建结果

这一步不会生成最终可分发 exe，但可以用来验证源码是否正常。

## 打包 Windows 便携版

如果你想打包成可直接运行的 Windows 程序，执行：

```powershell
npm run dist
```

当前项目默认打包目标是 Windows portable 版本。

打包成功后，输出目录通常在：

- `release/MarkBook 1.0.0.exe`
- `release/win-unpacked/`

说明：

- `MarkBook 1.0.0.exe` 是便携版单文件，适合分发给别人
- `release/win-unpacked/MarkBook.exe` 适合本机快速调试
- 不要只单独拷贝 `win-unpacked` 目录里的一个 `MarkBook.exe` 给别人，因为它依赖同目录其他文件

## Linux 下的编译与运行

Linux 下可以正常完成源码安装、开发运行和生产构建。

### 1. 获取源码

```bash
git clone https://github.com/zmlong11/markbook.git
cd markbook
```

### 2. 安装依赖

```bash
npm install
```

如果 `better-sqlite3` 编译失败，通常是系统缺少编译工具链或 SQLite 相关开发库，先补齐上面的系统依赖再重试。

### 3. 启动开发模式

```bash
npm run dev
```

正常情况下会启动：

- Vite 前端开发服务器
- Electron 主进程监听编译
- Electron 桌面窗口

### 4. 执行生产构建

```bash
npm run build
```

构建完成后会生成：

- `dist/`
- `dist-electron/`

### 5. 运行构建后的程序

当前仓库没有单独提供 Linux 的一键打包脚本，但完成 `npm run build` 后，可以继续基于 Electron Builder 自行扩展 Linux 目标。

需要说明的是：

- 当前 `package.json` 里的 `dist` 脚本默认只打 Windows portable
- 如果你在 Linux 上直接执行 `npm run dist`，默认目标仍然是 Windows，不适合直接作为 Linux 打包方案
- Linux 更适合用于源码运行、开发调试、前端构建，或者后续按需要补充 `AppImage`、`deb`、`tar.gz` 等打包配置

## 首次使用

程序启动后，主流程如下：

1. 在顶部搜索框输入关键词
2. 使用方向键切换结果
3. 按 `Enter` 复制当前命令
4. 回到终端或编辑器直接粘贴

常用快捷键：

- `Ctrl/Cmd + K`：聚焦搜索框
- `Arrow Up / Arrow Down`：切换搜索结果
- `Enter`：复制当前选中命令
- `Delete`：删除当前选中命令
- `Esc`：关闭弹窗
- `Ctrl/Cmd + N`：新建命令

## 数据保存位置

程序数据保存在 Electron 的用户数据目录中，数据库文件名是：

- `markbook.db`

这意味着：

- 重新打包程序不会自动清空已有命令
- 迁移电脑时，只要备份数据库或使用导出功能即可
- 升级版本前，建议先做一次导出或数据库备份

## 常见问题

### 1. 为什么仓库里没有 release 文件？

因为这个仓库主要维护源码，发布文件不一定每次都同步上传到 GitHub。
如果你需要可运行版本，直接按上面的步骤本地打包即可。

### 2. 为什么 `npm install` 或 `npm run dist` 失败？

常见原因有：

- Node.js 版本过低
- 网络问题导致依赖下载不完整
- 有旧的 MarkBook 进程正在运行，占用了打包输出目录

可以先关闭所有 MarkBook 进程，然后重新执行命令。

### 3. 为什么单独复制 `win-unpacked/MarkBook.exe` 不能运行？

因为 `win-unpacked` 是一个完整运行目录，不是单文件程序。
如果要分发，优先使用 `release/MarkBook 1.0.0.exe`。

## 项目结构

- `src/main`：Electron 主进程、窗口逻辑、数据库
- `src/preload`：预加载桥接
- `src/renderer`：界面层
- `src/shared`：共享类型
- `dist`：前端构建输出
- `dist-electron`：Electron 构建输出
- `release`：打包输出

## 当前版本

当前稳定基线是 `1.0.0`。

`1.x` 以稳定性、性能、轻量化和可维护性为主。
如果后续需要明显改变结构或交互方向，建议从 `2.x` 开始继续演进。

