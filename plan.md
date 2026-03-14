# ss-file-browser 实施计划 (v2)

## 1. 项目概况
- **背景**：远行星号 (Starsector) 汉化工具链的一部分，辅助译者在 ParaTranz 查看代码/资源上下文。
- **核心目标**：提供只读源码浏览器，实现从 ParaTranz 词条到反编译代码行的实时跳转（单向）。
- **关键特性**：
  - 基于 `window.open + postMessage` 与 ParaTranz 通信。
  - 支持 **Original / Localized** 双数据集全量切换。
  - 前端 SPA 架构，收到新定位请求后不刷新页面，仅更新状态与路由。
  - 预留多文件类型（Java, CSV, JSON, TXT）扩展能力。

## 2. 系统架构与技术栈
- **部署模型**：Docker Compose 部署，拆分为两个服务：
  - `updater`：负责 Git 同步、CFR 反编译与索引产出。
  - `app` (Next.js)：负责 Web UI、API 以及与 ParaTranz 的通信。
- **共享存储**：通过 Docker Volume 共享 `artifacts/` 目录。
- **开发语言**：全栈 TypeScript，共享类型 definition。
- **核心组件**：
  - 代码高亮：`Shiki` (只读模式)。
  - 反编译器：`CFR` (Java)。

## 3. 数据管理与更新 (A/B 全量切换)
### 3.1 数据来源
- 同步自 GitHub 仓库（包含所有原文/译文 JAR 及资源文件）。
- 目录结构：`artifacts/A/` 与 `artifacts/B/`，每个线下包含 `original/` 与 `localization/` 子目录。

### 3.2 更新流程
1. `updater` 检查 GitHub 更新，获取最新 `commit SHA`。
2. 识别当前“非激活”目录（由 `manifest.json` 指明）。
3. 执行 Git Pull、CFR 反编译、生成 Zip 和 `.strings.json` 索引。
4. 产物就绪后，`updater` 调用 `app` 的 `/api/internal/update-notify` 接口。
5. `app` 收到通知后，更新内存中的 `current_path` 指针（指向新目录）并触发必要的索引重建。
6. `app` 保持无状态设计，所有持久化配置仅存于 `manifest.json`。

## 4. ParaTranz 集成方案
### 4.1 Bookmarklet 注入与状态条
- 用户通过浏览器书签加载 `/integration/paratranz-bookmarklet.js`。
- **状态条 (Status Bar)**：注入后在 ParaTranz 右下角显示固定浮窗：
  - **连接状态**：显示“已连接 / 未连接 / 查找中”。
  - **版本信息**：显示当前数据集 Revision。
  - **控制按钮**：提供“重开浏览器”按钮（解决窗口丢失问题）。
  - **自动开关**：允许用户开启/关闭“跟随点击自动定位”。

### 4.2 DOM 解析规则 (已冻结)
- **主选择器**：`.context .well`。
- **解析字段**：
  - `jar`: 文件名 (e.g., `starfarer.api.jar`)
  - `class`: 类路径 (e.g., `com/fs/.../FleetAssignment.class`)
  - `const_no`: 转换为 `stringId` (格式: `#<utf8_index>`)
- **兜底选择器**：`.context-tab` 及 `.string-list .row.string.active` 的 `title` 属性。

### 4.3 postMessage 协议 (v1)
- **PT_NAVIGATE_TO_STRING**: ParaTranz -> Browser。
  - `payload: { dataset, className, stringId }`
- **FB_READY**: Browser -> ParaTranz。
- **错误处理**: 明确 `CLASS_NOT_FOUND`, `STRING_NOT_FOUND` 等错误反馈。

## 5. 核心逻辑：定位约定
- **定位键**：`className + utf8_index`（对应 `stringId` 的数值部分）。
- **多重匹配**：若同一文件内存在多个相同 `utf8_index`，高亮所有候选行，默认滚动到第一个。
- **视图切换**：切换 Original/Localized 时，优先保持 `className + utf8_index` 位置；失效则降级为同路径 + 近邻行号。

## 6. 实施里程碑
- **M1 (基座)**：完成 Docker 拓扑、A/B 目录结构、Next.js 基础 API。
- **M2 (单点跳转)**：实现 `PT_NAVIGATE_TO_STRING` 定位闭环，支持 Java 高亮与滚动。
- **M3 (双视图)**：支持双数据集无刷新切换，显示版本信息。
- **M4 (全自动更新)**：打通 `updater` 通知机制与 GitHub 自动拉取。
- **M5 (扩展视图)**：支持 CSV (Table View) 与 JSON 展示。

## 7. 验收标准
- 跳转请求响应时长 < 3s（本地网络/数据量下）。
- `utf8_index` 映射准确，无漂移。
- 更新任务执行期间，用户浏览不受影响。
- Bookmarklet 状态条能准确恢复丢失的浏览器窗口连接。

## 8. 实现进度表 (Checklist)

### M1: 基座搭建 (进行中)
- [x] Git 仓库初始化与 .gitignore 配置
- [x] 基础目录结构 (app, updater, artifacts, tools)
- [x] A/B 存储结构与 manifest.json 初始定义
- [x] docker-compose.yml 基础拓扑定义
- [x] 反编译器 (cfr.jar) 就位
- [x] app 服务初始化 (Next.js + TypeScript)
- [x] updater 服务初始化 (Node.js + Dockerfile)
- [ ] A/B 切换逻辑 (API /api/internal/update-notify)


### M2: 单点跳转闭环
- [ ] postMessage 协议定义与类型共享
- [ ] Shiki 代码高亮集成
- [ ] className + utf8_index 定位逻辑实现
- [ ] 自动滚动与高亮

### M3: 双视图与版本管理
- [ ] Original / Localized 视图切换 UI
- [ ] 版本信息展示 (基于 manifest.json)
- [ ] 切换时的上下文保持逻辑

### M4: 全自动更新
- [ ] updater: GitHub 仓库同步逻辑
- [ ] updater: 反编译与索引生成流水线
- [ ] updater: A/B 目录轮转与更新通知

### M5: 扩展视图
- [ ] CSV 表格只读视图
- [ ] JSON/TXT 文本视图
- [ ] Bookmarklet 状态条增强
