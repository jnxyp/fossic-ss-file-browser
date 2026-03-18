# ss-file-browser

> 注意：本项目由 LLM 辅助生成，代码未经过严格审查，使用前请自行检查和测试。

`ss-file-browser` 是一个面向 Starsector 汉化流程的只读源码浏览器。
它把 ParaTranz 词条、反编译后的 Java 源码、字符串索引和 SQLite 数据库串起来，方便在“词条 <-> 源码上下文”之间快速跳转。

仓库主要目录：

- `app_v2/`
- `updater_v2/`
- `data/`
- `tools/`

## 当前能力

- 基于 SQLite 存储数据，数据库位于 `data/ssfb.sqlite`
- 支持 `original` / `localization` 双侧源码浏览
- 支持文件树浏览与全文搜索
- 支持 ParaTranz -> 文件浏览器跳转
- 支持 文件浏览器 -> ParaTranz 反向定位
- 仅对 ParaTranz 已提取字符串做高亮与反向跳转
- 搜索全量字符串，并标记是否“已提取”
- 支持 ParaTranz 心跳连接状态显示
- 支持快捷键快速切到搜索面板

当前运行时主要目录：

- `data/`
  持久化数据目录，包含 `ssfb.sqlite` 和反编译产物
- `tools/cfr.jar`
  updater 反编译 JAR 时使用

## 项目结构

- `app_v2/`
  Next.js 16 前端与 API 服务
- `updater_v2/`
  TypeScript updater，负责同步仓库、反编译并写入 SQLite
- `docker-compose.yml`
  Docker 运行入口

## Docker 运行

要求：

- 已安装 Docker 和 Docker Compose
- 本地存在 `tools/cfr.jar`

启动：

```bash
docker compose up --build -d
```

查看日志：

```bash
docker compose logs -f app
docker compose logs -f updater
```

停止：

```bash
docker compose down
```

服务说明：

- `app`
  默认监听 `http://localhost:3000`
- `updater`
  周期性同步远端仓库并更新 `data/ssfb.sqlite`

挂载：

- `./data -> /app/data`
- `./tools -> /app/tools`（仅 updater）

## 本地运行

建议环境：

- Node.js 22
- Java 17+
- Git

另外需要：

- `tools/cfr.jar`

### 1. 启动 updater_v2

安装依赖：

```bash
cd updater_v2
npm install
```

启动：

```bash
npm run start
```

常用环境变量：

- `DATA_ROOT`
  默认是 `/app/data`，本地运行建议改成仓库下的 `data`
- `CFR_JAR`
  本地建议指向 `tools/cfr.jar`
- `SYNC_INTERVAL`
  同步间隔，单位秒，默认 `600`
- `APP_INTERNAL_URL`
  updater 通知 app 刷新时使用；本地运行建议设为 `http://localhost:3000`
- `WORK_DIR`
  Git 工作目录；默认 `/tmp/ss-repo`

示例：

```bash
cd updater_v2
npm install
DATA_ROOT=../data CFR_JAR=../tools/cfr.jar APP_INTERNAL_URL=http://localhost:3000 npm run start
```

PowerShell 示例：

```powershell
cd updater_v2
npm install
$env:DATA_ROOT="../data"
$env:CFR_JAR="../tools/cfr.jar"
$env:APP_INTERNAL_URL="http://localhost:3000"
npm run start
```

### 2. 启动 app_v2

安装依赖：

```bash
cd app_v2
npm install
```

开发模式：

```bash
npm run dev
```

生产构建：

```bash
npm run build
npm run start
```

本地运行时需要让 app 能读到 SQLite：

```bash
cd app_v2
DATA_ROOT=../data npm run dev
```

PowerShell 示例：

```powershell
cd app_v2
npm install
$env:DATA_ROOT="../data"
npm run dev
```

启动后访问：

```text
http://localhost:3000
```

## ParaTranz 联动

当前联动方式是 bookmarklet + `postMessage`。

bookmarklet 文件位置：

- [app_v2/public/integration/paratranz-bookmarklet.js](/d:/ProjectsLocal/fossic-ss-file-browser/app_v2/public/integration/paratranz-bookmarklet.js)

本地开发环境 bookmarklet：

```javascript
javascript:(function(){var s=document.createElement('script');s.src='http://localhost:3000/integration/paratranz-bookmarklet.js?ts='+Date.now();document.head.appendChild(s);})();
```

已部署环境 bookmarklet：

```javascript
javascript:(function(){var s=document.createElement('script');s.src='https://ss-file.jnxyp.net/integration/paratranz-bookmarklet.js?ts='+Date.now();document.head.appendChild(s);})();
```

部署环境当前启用了 Basic Auth，访问时需要先输入：

- 用户名：`guest`
- 密码：`7355608114514`

在 ParaTranz 项目页面执行后：

- 会显示右下角悬浮状态条
- 可打开或复用文件浏览器窗口
- 可开启“跟随词条导航”

当前联动行为：

- 注入后会尝试把 ParaTranz 当前词条同步到文件浏览器
- 点击 ParaTranz 左侧词条时，会跳转到对应源码位置
- 点击 ParaTranz 编辑区“上一条 / 下一条”按钮时，也会同步跳转
- 按 `Alt+Enter` / `Shift+Enter` 切换词条时，也会同步跳转
- 点击文件浏览器中已提取字符串时，会反向定位到 ParaTranz 词条

## Viewer 快捷键

在 viewer 页面中：

- 连按两下 `Shift`
  切换到搜索面板并聚焦搜索框
- `Ctrl+Shift+F`
  切换到搜索面板并聚焦搜索框

如果搜索框已有内容，触发快捷键时会自动全选，方便直接修改或替换。

## 数据说明

核心数据：

- `data/ssfb.sqlite`
- `data/decompiled/`

ParaTranz 子集信息会写入数据库，用于：

- 前端字符串高亮
- viewer -> ParaTranz 反向定位
- 搜索结果中的“已提取”标记

## 部署说明

当前线上部署方式：

- 服务器：`cn-hk-docker`
- 项目目录：`~/docker_projects/fossic-ss-file-browser`
- 启动方式：`docker compose up -d --build`
- 访问域名：`https://ss-file.jnxyp.net`
- 外部入口：Caddy 反向代理
- 认证方式：HTTP Basic Auth

说明：

- 目前 Caddy 反代到 `localhost:3000`
- updater 与 app 的内部通知使用容器内地址 `http://app:3000`

## 开发备注

- `app_v2` 使用 `better-sqlite3` 直接读取 `data/ssfb.sqlite`
- `updater_v2` 默认会同步以下远端仓库内容：
  - `https://github.com/TruthOriginem/Starsector-Localization-CN`
  - `original/`
  - `localization/`
  - `para_tranz/para_tranz_map.json`
- ParaTranz map 只提取真正需要的字符串子集，不会把平台上的所有字符串都当成高亮目标

## 常用命令

Docker：

```bash
docker compose up --build -d
docker compose logs -f app
docker compose logs -f updater
docker compose down
```

本地：

```bash
cd updater_v2 && npm install && npm run start
cd app_v2 && npm install && npm run dev
```
