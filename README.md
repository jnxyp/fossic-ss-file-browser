# ss-file-browser

`ss-file-browser` 是一个面向 Starsector 汉化工作流的只读源码浏览器。它把 ParaTranz 词条、反编译后的 Java 源码、字符串索引和版本信息串起来，帮助翻译者快速定位上下文，而不需要手动翻找 JAR、类名和常量表。

> 说明：本 README 同时包含“当前已实现的旧架构现状”和“下一阶段重构目标”两部分内容。`TODO / 重构计划` 一节描述的是新版目标设计，不代表这些内容已经落地。

## 项目目标

- 从 ParaTranz 词条直接跳转到对应 Java 源码行。
- 在原文数据集和译文数据集之间切换，同时尽量保留当前上下文。
- 通过自动更新链路持续同步仓库、反编译产物和字符串索引。
- 以只读方式浏览源码，避免人工修改产物目录带来的状态漂移。

## 当前已实现

本节描述当前仓库里已经落地的实现状态，仍然基于文件产物、`manifest.json` 和 A/B 槽位逻辑。

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

本节描述当前版本的目录职责划分；重构后的目标架构请以下方 `TODO / 重构计划` 为准。

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

本节描述当前版本的更新链路；SQLite 方案上线后，这里的数据流会发生变化。

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

本节描述当前版本已经落地的 ParaTranz -> viewer 联动约定；双向联动和新版协议请以下方 `TODO / 重构计划` 中的描述为准。

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

## TODO / 重构计划

下面这些事项是下一阶段的重点重构方向，目标不是在现有文件产物结构上继续打补丁，而是把数据层、查看器交互和 ParaTranz 双向联动一次理顺。

### 1. 已确认的新版关键决策

- 数据主存储改为 SQLite，第一版使用 `better-sqlite3`。
- 数据根目录改为 `data/`，正式数据库为 `data/ssfb.sqlite`。
- `artifacts/`、`manifest.json`、A/B 槽位和聚合 `.strings.json` 不再是新版主流程的数据来源。
- 第一版只保留最新版本数据，不做历史版本管理。
- 导入采用“正式表单事务清空后重写”；失败时回滚，旧库保持不变。
- 临时反编译产物保留最近一次，便于排查。
- viewer 改为单文件树 + 三态查看器：`原文 / 并列 / 译文`。
- 左侧侧栏改为 VS Code 风格双 tab：`资源管理器 / 搜索`。
- 文件树自动展开和自动滚动只在 ParaTranz 导航进入时触发。
- 高亮继续使用前端 `Shiki`，但词条范围高亮和点击交互由自定义渲染层负责。
- 搜索至少支持 class 名和 string 内容；结果按文件分组展示。
- viewer -> bookmarklet 反向定位使用 `FB_NAVIGATE_TO_PARATRANZ_STRING`。

### 2. 数据层改造：从文件产物切换到 SQLite

- 用 SQLite 替代当前以 `artifacts/` 目录和聚合 `.strings.json` 为核心的读取方式。
- SQLite Node 驱动第一版采用 `better-sqlite3`。
- `updater` 在拿到 `original` 和 `localization` 的反编译结果后，直接把可查询数据写入数据库，而不是仅写回磁盘文件。
- 新版统一数据根目录调整为 `data/`，其中：
  - `data/ssfb.sqlite` 作为正式查询数据库
  - `data/decompiled/` 保留最近一次反编译临时产物
  - `data/original/` 和 `data/localization/` 继续承载同步下来的原始输入
- `artifacts/` 不再作为新版主流程的数据来源，只作为旧架构遗留目录看待。
- 以“同一个源码文件的 original / localization 大概率一一对应”为前提，重构存储模型，使一次查询可以同时拿到：
  - 源码文件元数据
  - original 反编译源码
  - localization 反编译源码
  - original 对应 strings 索引
  - localization 对应 strings 索引
- 当前确认的 SQLite 基础结构为 4 张表：

#### `source_files`

表示真正用于文件树展示和右侧查看器打开的源码文件节点，一条记录对应一个实际源码文件，例如 `A.java`。  
如果存在 `A.class` 和 `A$1.class`，它们在这里仍然只对应一条 `A.java` 记录。

- `id INTEGER PRIMARY KEY`
- `jar_name TEXT NOT NULL`
- `source_path TEXT NOT NULL`
- `has_original INTEGER NOT NULL DEFAULT 0`
- `has_localization INTEGER NOT NULL DEFAULT 0`

约束与用途：

- `UNIQUE (jar_name, source_path)`
- 文件树基于这张表构建
- `source_path` 使用实际反编译源码路径，例如 `com/fs/.../A.java`
- `has_original` / `has_localization` 用于标识该文件在两侧是否存在

#### `file_contents`

表示某个源码文件在某一侧数据集中的具体内容。一条 `source_files` 记录最多对应两条内容记录：`original` 和 `localization`。

- `id INTEGER PRIMARY KEY`
- `source_file_id INTEGER NOT NULL`
- `dataset TEXT NOT NULL`
- `source_code TEXT NOT NULL`
- `source_hash TEXT`

约束与用途：

- `CHECK (dataset IN ('original', 'localization'))`
- `UNIQUE (source_file_id, dataset)`
- `FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE CASCADE`
- 某文件如果只存在于一侧，则另一侧没有对应记录
- 右侧查看器读取 original / localization 源码内容时直接从这里取

#### `string_entries`

表示最新 CFR `strings.json` 中解析出的字符串条目和精确范围。  
它挂在 `file_contents` 下，而不是直接挂在 `source_files` 下，因为 original 和 localization 两侧的字符串范围信息不保证完全一致。

- `id INTEGER PRIMARY KEY`
- `file_content_id INTEGER NOT NULL`
- `owner_class_name TEXT NOT NULL`
- `cp_index INTEGER`
- `utf8_index INTEGER NOT NULL`
- `const_table TEXT NOT NULL DEFAULT ''`
- `value TEXT NOT NULL`
- `start_line INTEGER NOT NULL`
- `start_col INTEGER NOT NULL`
- `end_line INTEGER NOT NULL`
- `end_col INTEGER NOT NULL`

约束与用途：

- `FOREIGN KEY (file_content_id) REFERENCES file_contents(id) ON DELETE CASCADE`
- 建议索引：`(file_content_id, utf8_index, const_table)`
- 建议索引：`(file_content_id, owner_class_name, utf8_index)`
- 建议索引：`(file_content_id, start_line, start_col)`
- `owner_class_name` 保存实际所属 class，例如 `A.class` 或 `A$1.class`
- `source_files` 层只显示一个 `A.java`，但字符串仍然可以知道自己属于父类还是内部类
- ParaTranz 导航到 `A$1.class` 中的字符串时，可先归一到 `A.java`，再通过 `owner_class_name + utf8_index (+ const_table)` 精确查询范围

#### `meta`

表示当前数据库中的全局元信息，用于替代 `manifest.json` 承担的轻量状态职责，但不承担历史版本管理。

- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL`

当前至少需要支持：

- `revision`
- `last_updated`
- `schema_version`

用途：

- 底栏显示当前 revision 和更新时间
- 标记当前数据库 schema 版本
- 提供 app 与 updater 的轻量状态读取入口

- 业务扩展信息如字符串标记、人工备注、审核状态暂不进入第一版 schema；本轮重构先只落地上述 4 张基础表，后续再按功能需求补表。
- 适配最新 CFR `strings.json` 格式变更：原先的 `line` 字段已经被更精细的 `start` / `end` 对象取代，例如：

```json
{
  "cp_index": 75,
  "utf8_index": 74,
  "const_table": "...",
  "value": "ui",
  "start": { "line": 51, "col": 127 },
  "end": { "line": 51, "col": 130 }
}
```

- 新的数据模型和查询接口需要保留这组范围信息，而不是退化回单一行号。
- 后续高亮能力要从“按行高亮”升级为“按源码范围高亮”，以支持更精细的词条定位。
- 保留“某个文件只存在于 original 或 localization 一侧”的兼容能力，不能假设所有文件都严格成对出现。
- `app` 后续应直接查询 SQLite，而不是继续围绕磁盘产物和 manifest 进行状态判断。
- `updater` 导入流程当前确认采用以下策略：
  - 如果事务失败，则回滚并保留旧库不变
  - 反编译临时产物默认保留最近一次，便于排查导入问题
  - 继续保留定时轮询更新
  - 同时保留“重启 updater 时强制触发一次导入”的行为，作为当前的手动触发方式
  - 第一版采用“正式表单事务清空后重写”的方式，不引入 staging 表

### 3. ParaTranz 双向联动与通信协议

- 当前状态：
  - `ParaTranz -> viewer` 已落地。
  - `viewer -> ParaTranz` 已在 `app_v2` 中落地，点击代码中的已提取字符串后，会通过 `FB_NAVIGATE_TO_PARATRANZ_STRING` 反向请求 bookmarklet 定位词条。
  - viewer 当前发送的 `locator` 使用完整 class 名，格式为 `jarName:className`，并保留内部类后缀与 `.class`，例如 `ss_api.jar:A/B/C/D$1.class`。
  - bookmarklet 当前搜索时会把完整 `locator` 归一到父类搜索键，例如 `ss_api.jar:A/B/C/D`；精确匹配词条时继续使用完整 class 名。
  - bookmarklet 已实现 `FB_NAVIGATE_TO_PARATRANZ_STRING` 接收、`PT_ERROR` 返回，以及 `PT_ACK` 成功确认。
  - bookmarklet 当前已实现窗口认领、`PT_PING` / `FB_READY` 握手、分页放大、切换到“全部”、按 `key` 搜索、以及在左侧词条列表中点击目标项。
- 剩余工作：
  - 将当前 bookmarklet 中的调试输出整理为可默认关闭的正式行为，并补充更稳定的失败提示。
  - 评估 viewer 是否需要显式消费 `PT_ACK` / `PT_ERROR`，例如 toast、状态提示或调试面板。
  - 继续观察 ParaTranz 页面结构变化风险，决定是否保留现有 DOM 兜底逻辑，或进一步收敛到更稳定的页面接口。

#### 新版通信协议层

新版重构继续使用基于 `window.postMessage` 的双向协议，并沿用以下命名约定：

- `PT_*` 表示 ParaTranz / bookmarklet -> File Browser
- `FB_*` 表示 File Browser -> ParaTranz / bookmarklet

公共消息结构：

- `protocol`
  固定为 `ss-file-browser/v1`
- `type`
  消息类型
- `requestId`
  请求或事件唯一标识
- `timestamp`
  可选时间戳
- `payload`
  对应消息负载

#### ParaTranz / bookmarklet -> File Browser

`PT_NAVIGATE_TO_STRING`

用途：

- ParaTranz 词条跳转到 viewer 中的源码位置

payload：

- `jarName`
- `className`
- `utf8ConstId`

`PT_PING`

用途：

- 轻量心跳或连接探测

`PT_ERROR`

用途：

- bookmarklet 向 viewer 返回错误，例如 ParaTranz 页面状态异常、词条未找到、页面结构变化导致无法定位

payload 建议字段：

- `code`
- `message`
- `detail`

`PT_ACK`

用途：

- bookmarklet 收到 `FB_NAVIGATE_TO_PARATRANZ_STRING` 并成功定位后，回传轻量确认

payload 建议字段：

- `accepted`
- `message`

#### File Browser -> ParaTranz / bookmarklet

`FB_READY`

用途：

- viewer 已打开并可以接收导航消息

payload：

- `connected`
- `appOrigin`
- `dataset`
- `revision`

`FB_ERROR`

用途：

- viewer 向 ParaTranz / bookmarklet 返回协议错误、查询失败或内部错误

payload：

- `code`
- `message`
- `detail`

`FB_NAVIGATE_TO_PARATRANZ_STRING`

用途：

- 用户在 viewer 中点击某个字符串片段后，反向请求 ParaTranz 页面定位对应词条

payload：

- `locator`
  格式为 `jarName:className`，其中 `className` 为完整 class 名并保留 `.class` 与内部类后缀，例如 `ss_api.jar:A/B/C/D$1.class`
- `value`
  字符串值
- `utf8ConstId`
  对应 UTF-8 常量号，例如 `#74`
- `dataset`
  `original` 或 `localization`

协议层当前确认的行为约定：

- `className` 或 `locator` 中必须保留完整内部类信息，不能丢失 `$1`、`$Level1` 等子类后缀
- bookmarklet 搜索 ParaTranz 列表时，使用由完整 `locator` 归一得到的父类搜索键；精确匹配列表项时使用完整 `locator`
- ParaTranz -> viewer 导航时，以 `jarName + className + utf8ConstId` 为核心定位键
- viewer -> ParaTranz 导航时，以 `locator + value + utf8ConstId + dataset` 为核心负载
- `FB_READY` 用于首次握手和重连，不表示用户每次切换文件都要主动广播状态
- `PT_ERROR` 与 `FB_ERROR` 分别承担双向错误反馈，避免静默失败
- `PT_ACK` 已可用，用于 bookmarklet 成功定位后回传轻量确认；viewer 侧暂未消费该确认

### 4. API 与状态层重写

- `app` 后续应直接查询 SQLite，而不是继续围绕磁盘产物和 manifest 进行状态判断。
- 文件树、源码内容、字符串范围和状态信息都需要改为从 SQLite 读取。
- API 设计需要围绕“一个源码文件节点同时返回 original / localization 两侧内容与索引”来组织，而不是继续围绕当前单 dataset API 扩展。
- `meta` 表将替代当前依赖 `manifest.json` 的 revision / 更新时间读取逻辑。
- 搜索 API 需要支持 class 名和 string 内容查询，并返回适合按文件分组展示的结果结构。

### 5. 查看器、文件树与搜索重构

- 代码高亮改为前端执行，减少服务端高亮带来的负担。
- 第一版高亮方案优先沿用 `Shiki`，但职责调整为：
  - `Shiki` 只负责语法高亮
  - 词条范围高亮和点击交互由自定义渲染层负责
- 第一版暂不引入 `Monaco`、`CodeMirror` 这类完整编辑器组件。
- 文件树改为单一树结构，不再把 `original` 和 `localization` 拆成两个独立数据集入口。
- 文件树展示逻辑改为 `original ∪ localization` 的并集。
- 左侧侧栏改为类似 VS Code 的双 tab 结构：
  - `资源管理器`
  - `搜索`
- `资源管理器` tab 展示 union 文件树。
- `搜索` tab 用于查询项目中的 class 和字符串条目。
- 由于文件数量较多，文件树实现需要优先考虑性能：
  - 优先评估现成的高性能前端树组件
  - 或引入虚拟滚动、按需展开、懒加载等优化手段
  - 不默认手写完整树渲染实现，避免在大数据量下出现明显卡顿
- 文件树继续保留“自动展开当前路径”和“将当前文件滚动到顶部附近”的能力，但仅在“从 ParaTranz 收到导航请求”时执行。
- 如果是用户在 viewer 内手动点击文件树切换文件，则不要自动滚动到顶部，也不要强制触发同样的导航滚动行为。
- 选择文件后，右侧支持以下查看模式：
  - 只看 `original`
  - 只看 `localization`
  - `original / localization` 并排对照
- 右侧顶部提供一个三态滑块切换开关，状态分别为：
  - `原文`
  - `并列`
  - `译文`
- 该开关状态采用全局记忆，不按单个文件分别记忆。
- 并排模式需要支持同步滚动。
- 代码区需要支持基于 `start.line/start.col/end.line/end.col` 的更精细词条高亮，而不再只是整行高亮。
- 只有 `string_entries` 命中的字符串片段可点击；非命中代码区域不参与跳转交互。
- 当前定位词条使用更明显的高亮，其它可点击词条使用较弱提示，避免页面信息噪音过高。
- 当文件仅存在于某一侧时：
  - 有内容的一侧正常显示
  - 缺失的一侧明确显示“文件缺失”
- 搜索功能第一版至少需要支持：
  - 按 class 名搜索
  - 按 string 内容搜索
- class 搜索采用包含匹配：
  - 只要 `keyword in 完整 class 路径` 即视为命中
  - 同时匹配文件自身的完整 class 路径和字符串条目上的 `ownerClassName`
- 搜索结果展示形式参考 VS Code：
  - 先按文件分组
  - 每个文件组显示文件名、完整路径和命中数
  - 文件组下展示具体命中摘要
- 命中摘要在不同场景下应至少包含：
  - string 搜索：字符串值摘要
  - class 搜索：命中的 class 名或对应上下文摘要
- 如果同一个文件在不同数据侧都有命中，结果项需要带侧别标识，例如 `原文` / `译文`。
- 点击文件组头时，打开对应文件；点击具体命中项时，打开文件并定位到对应命中。
- 搜索结果点击后，应打开对应源码文件并定位到目标字符串或 class 上下文。

### 6. 配套工作

- 根据 SQLite 落地后的模型，重写文件树、源码内容、字符串索引等 API。
- 重新梳理缓存策略，避免数据库引入后出现前后端状态不一致。
- 补充覆盖重构后的测试：
  - 数据导入与查询测试
  - 双栏查看与同步滚动测试
  - ParaTranz 双向消息协议测试
- 等 ParaTranz 反向定位方案稳定后，再决定是否保留现有 bookmarklet 的部分 DOM 兜底逻辑。
