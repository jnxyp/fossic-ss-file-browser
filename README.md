# ss-file-browser

`ss-file-browser` 是一个面向 Starsector 汉化工作流的只读源码浏览器。它把 ParaTranz 词条、反编译后的 Java 源码、字符串索引和版本信息串起来，帮助翻译者快速定位上下文，而不需要手动翻找 JAR、类名和常量表。

## 项目目标

- 从 ParaTranz 词条直接跳转到对应 Java 源码行。
- 在原文数据集和译文数据集之间切换，同时尽量保留当前上下文。
- 通过自动更新链路持续同步仓库、反编译产物和字符串索引。
- 以只读方式浏览源码，避免人工修改产物目录带来的状态漂移。

## 当前已实现

- ParaTranz bookmarklet 联动，基于 `window.open + postMessage` 通信。
- 使用 `utf8ConstId` 进行字符串定位。
- 支持内部类定位，URL 通过 `subclass` 参数恢复目标内部类。
- 文件树浏览 JAR 内的 `.java` 文件，并在 ParaTranz 跳转后自动展开当前路径。
- 原文 / 译文双数据集切换。
- Shiki 语法高亮与目标行高亮。
- Java `\uXXXX` 转义在查看器中按真实字符显示。
- 底栏显示当前 revision、更新时间和 GitHub commit 链接。
- `next-themes` 三态主题切换：浅色、深色、跟随系统。
- Updater 使用 A/B 槽位切换产物，首次启动会强制刷新一次。

## 架构概览

- `app/`
  Next.js 16 App Router 应用，同时提供前端界面和 API。
- `updater/`
  TypeScript 后台服务，负责 Git 同步、CFR 反编译、索引聚合和 A/B 槽位切换。
- `artifacts/`
  持久化产物目录，包含 A/B 槽位以及 `manifest.json`。
- `tools/`
  外部工具目录，当前用于挂载 `cfr.jar`。

## 技术栈

- Next.js `16.1.6`
- React `19.2.3`
- TypeScript
- Shiki
- `next-themes`
- CFR
- Docker / Docker Compose

## 数据与更新流程

1. `updater` 拉取 `TruthOriginem/Starsector-Localization-CN` 仓库的 `master` 分支。
2. 仓库内 `original/` 和 `localization/` 下的 JAR 会被 CFR 反编译为 zip。
3. CFR 同时输出每个类的 `.strings.json`，`packager.ts` 会聚合成 jar 级索引。
4. 新产物写入非活动槽位。
5. `manifest.json` 翻转活动槽位，`app` 之后读取新的槽位。
6. `updater` 调用 `app` 的内部通知接口，让服务端重新感知当前 manifest。

说明：

- `app` 总是通过 `app/src/lib/manifest.ts` 读取当前活动槽位。
- API 对外使用 `.jar` 语义，内部会映射到对应的 `.zip` 反编译产物。
- 不应手动改写 `artifacts/` 中的产物文件，应该通过 `updater` 流程生成。

## ParaTranz 联动约定

- 允许来源：`https://paratranz.cn`
- bookmarklet 当前只允许在 `https://paratranz.cn/projects/3489` 下启动
- 导航消息核心字段：
  - `jarName`
  - `className`
  - `utf8ConstId`
- viewer 会把内部类路径归一到父类源码文件，再通过 `subclass` 查询参数恢复目标内部类。

当前 bookmarklet 默认读取 ParaTranz 页面 `.context .well` 中的以下字段：

- `文件：...jar`
- `类：...class`
- `常量号：...`

## 快速开始

### 运行整个项目

根目录执行：

```bash
docker-compose up --build
```

启动后访问：

- `http://localhost:3000`

默认首页会跳转到：

- `http://localhost:3000/viewer/localization`

### 目录挂载

`docker-compose.yml` 当前会挂载：

- `./artifacts -> /app/artifacts`
- `./tools -> /app/tools`（仅 updater）

## 本地开发

推荐使用 Node.js 22，与当前 Dockerfile 保持一致。

### 启动 app

```bash
cd app
npm install
npm run dev
```

### 启动 updater

```bash
cd updater
npm install
npx tsx src/index.ts
```

或使用：

```bash
npm run start
```

本地运行时至少需要确认这些环境变量：

- `DATA_ROOT`
  指向根目录下的 `artifacts`
- `APP_INTERNAL_URL`
  默认是 `http://app:3000`，本地单独运行时通常需要改成你的 app 地址
- `SYNC_INTERVAL`
  默认 `600` 秒
- `CFR_JAR`
  默认 `/app/tools/cfr.jar`

另外，`updater` 默认会把仓库拉到：

- `/tmp/ss-repo`

可通过 `WORK_DIR` 覆盖。

## Bookmarklet 使用

1. 确保 `app` 已经启动并可访问。
2. 打开 [`app/public/integration/paratranz-bookmarklet.js`](/d:/ProjectsLocal/fossic-ss-file-browser/app/public/integration/paratranz-bookmarklet.js)。
3. 按文件头部注释中的方式，把脚本地址包装成浏览器书签。
4. 在 ParaTranz 项目页面点击书签，viewer 会弹出新窗口并建立连接。

当前 bookmarklet 还有这些行为：

- 会根据脚本自身 URL 自动推导 viewer 基址，不再只依赖硬编码 `localhost`
- 右下角提供紧凑状态条，可重新打开窗口或彻底关闭集成
- 收到 `FB_READY` 后只在首次握手或重连时自动跟随一次，避免抢走用户手动浏览的上下文

## API 与核心文件

- [`app/src/app/api/files/tree/route.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/app/src/app/api/files/tree/route.ts)
  文件树和 jar 内 `.java` 列表
- [`app/src/app/api/files/content/route.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/app/src/app/api/files/content/route.ts)
  源码内容读取
- [`app/src/app/api/files/index/route.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/app/src/app/api/files/index/route.ts)
  按 `utf8ConstId` 查询行号
- [`app/src/lib/protocol.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/app/src/lib/protocol.ts)
  ParaTranz 通信协议
- [`app/src/lib/resolver.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/app/src/lib/resolver.ts)
  源码读取与索引解析
- [`updater/src/lib/pipeline.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/updater/src/lib/pipeline.ts)
  更新主流程
- [`updater/src/lib/packager.ts`](/d:/ProjectsLocal/fossic-ss-file-browser/updater/src/lib/packager.ts)
  聚合 `.strings.json`

## 当前限制与后续方向

- 当前文件树主要面向 `.java` 文件浏览，非 Java 文件的专门视图还没有完成。
- `CSV`、`JSON`、`TXT` 只读视图仍在计划中。
- bookmarklet 的 DOM 解析还可以继续补强兜底选择器和错误反馈。
- 更真实的端到端回归测试仍然值得补上。
