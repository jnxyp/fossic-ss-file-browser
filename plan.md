# ss-file-browser 实施计划 (v3)

## 1. 项目目标
- 面向 Starsector 汉化工作流，提供一个只读源码浏览器。
- 支持从 ParaTranz 词条直接跳到反编译后的 Java 源码行。
- 支持原文 / 译文双视图切换，并尽量保持上下文不丢失。
- 更新链路基于 GitHub 仓库和 CFR 反编译产物自动刷新。

## 2. 当前架构
- `app`
  - Next.js 前端与 API。
  - 负责文件树、源码内容、字符串索引查询、ParaTranz 通信。
- `updater`
  - 负责 Git 同步、CFR 反编译、生成 zip 与 `.strings.json` 聚合索引。
- `artifacts`
  - A/B 槽位产物目录。
  - `manifest.json` 记录当前活动槽位、revision 与更新时间。

## 3. 数据与更新
### 3.1 现状
- 已实现 A/B 全量切换。
- 已实现 `manifest.json` 驱动的当前版本选择。
- 已实现 `updater -> app` 的更新通知接口。

### 3.2 已落地细节
- CFR 直接输出 zip，并生成每个类的 `*.strings.json`。
- `packager.ts` 会把 zip 内 per-class 索引聚合成 jar 级 `.strings.json`，供 app 查询。
- `updater` 现在在“首次启动”时会强制刷新一次，即使 revision 没变化也会重建产物。
- 当前本地已经验证过新的 CFR 索引格式包含 `const_table` 字段。

## 4. ParaTranz 联动
### 4.1 已实现
- 通过 bookmarklet 注入 `paratranz-bookmarklet.js`。
- 仅允许在 `https://paratranz.cn/projects/3489` 下启动。
- 使用 `window.open + postMessage` 与 viewer 通信。
- 右下角紧凑状态条已支持：
  - 连接状态
  - 打开/重开窗口
  - 关闭并完全退出脚本
- 失去连接时只提示，不自动重开；用户手动点击按钮恢复。
- bookmarklet 会从脚本自身 URL 推导 viewer 基址，不再只依赖硬编码 `localhost`。

### 4.2 当前 DOM 解析规则
- 主要读取 `.context .well`。
- 按固定字段解析：
  - `文件：...jar`
  - `类：...class`
  - `常量号：....`
- 发送给 viewer 的字段已统一为：
  - `jarName`
  - `className`
  - `utf8ConstId`

### 4.3 已修复的联动问题
- 不再由 ParaTranz 指示原文 / 译文数据集，viewer 保持当前选择。
- bookmarklet 收到 `FB_READY` 后只在首次握手或重连时自动跟随一次，避免用户手动点文件后又被拉回当前词条。

## 5. Viewer 与导航
### 5.1 已实现
- Shiki 前端高亮。
- 按 `utf8ConstId` 查询并高亮对应行。
- 代码查看器会把 Java `\uXXXX` 转义显示为真实字符。
- 顶部路径栏支持复制定位。
- 数据集 badge 已中文化。

### 5.2 内部类 / 常量表支持
- 协议字段已从 `stringId` 全量切换到 `utf8ConstId`。
- 新 CFR 索引支持 `const_table`：
  - `""` 表示父类常量表
  - `"$1"`、`"$Level1"` 之类表示内部类常量表
- viewer 现已支持：
  - 主路径固定为父类源码文件
  - 通过查询参数 `subclass` 恢复目标内部类
  - 后端读取父类源码文件
  - 行号查询时按 `utf8ConstId + const_table` 精确筛选
- 内部类路径如 `BaseSpecialItemPlugin$1.class` 现在会正确落到 `BaseSpecialItemPlugin.java` 并定位到对应内部类字符串行。

### 5.3 当前 URL 约定
- 主路径始终使用父类源码路径。
- 查询参数包含：
  - `utf8ConstId`
  - `subclass`，例如 `1`、`Level1`
- 仅在需要时附加 `scrollTreeToCurrent=1`，用于驱动文件树自动滚动到当前条目。

## 6. 侧栏文件树
### 6.1 已实现
- 文件树 API 与 UI 已可稳定浏览 jar 内 `.java` 文件。
- API 对外统一使用 `.jar` 语义，内部自动映射到 `.zip` 产物。
- 文件树现在会在 ParaTranz 导航后：
  - 先折叠之前展开的路径
  - 再只展开当前 jar 与当前文件目录链
  - 自动把当前条目滚到视野内，且尽量靠近顶部
- 原文 / 译文切换时保留当前路径上下文。
- 用户手动点击文件树项目时：
  - 不会再被 ParaTranz 当前词条立即拉回
  - 不会触发自动滚动到当前条目

### 6.2 近期新增细节
- 侧栏宽度已支持拖拽调整。
- 宽度会持久化到 `localStorage`。
- 首帧使用默认宽度，挂载后恢复用户宽度，已规避 hydration mismatch。
- tree 区域支持横向滚动。
- 文件 / 文件夹 / jar 名称有最大显示宽度限制。
- 完整路径或名称通过 tooltip 展示。

## 7. 主题与界面
### 7.1 已实现
- 接入 `next-themes`。
- 支持浅色 / 深色 / 跟随系统三态主题。
- 代码高亮主题会随 UI 主题切换。
- 底栏已显示：
  - 版本号
  - 更新时间
  - GitHub commit 链接
  - 单按钮主题轮换
- 顶部和底部部分交互已加轻量动画。
- `devIndicators: false` 已关闭。

### 7.2 已优化
- 顶部路径栏简化。
- 复制按钮改为图标按钮。
- 中文文案统一替换了大部分英文标识。
- 去掉了代码跳转时的平滑滚动，改为直接定位。

## 8. 里程碑状态
### M1: 基础设施
- [x] 仓库与目录结构建立
- [x] app / updater 初始化
- [x] artifacts A/B 槽位结构
- [x] 基础 Docker / manifest / update-notify 机制

### M2: 单点跳转与基础浏览
- [x] 文件树 API 与源码内容 API
- [x] 前端代码高亮与行高亮
- [x] bookmarklet 注入与基础 postMessage 协议
- [x] ParaTranz -> viewer 单向跳转闭环
- [x] `utf8ConstId` 定位与多行高亮
- [x] 内部类 / `const_table` 精确定位

### M3: 双视图与版本信息
- [x] 原文 / 译文切换
- [x] 底栏版本信息展示
- [x] 版本号 GitHub commit 链接
- [x] 切换时保留上下文

### M4: 自动更新
- [x] GitHub 同步
- [x] CFR 反编译与聚合索引生成
- [x] A/B 轮转
- [x] 启动时强制刷新一次

### M5: 扩展视图
- [ ] CSV 表格只读视图
- [ ] JSON/TXT 只读视图
- [ ] 非 Java 文件的专门展示策略

## 9. 最近几次提交落地内容
- `6e42e63` `feat: add theme switcher and status footer`
  - 接入主题系统与底栏状态栏。
- `81e4a8c` `feat: polish theme toggle interactions`
  - 优化主题切换交互、按钮动画与 plan 同步。
- `05bc118` `refactor: simplify viewer header and component layout`
  - 精简查看器头部，清理旧组件。
- `9282384` `fix: tighten protocol and resolver types`
  - 收紧协议与 resolver 类型。
- `18dac53` `feat: update bookmarklet and API to use utf8ConstId instead of stringId`
  - 将 `stringId` 全量切换为 `utf8ConstId`。
- `87736e4` `feat: support const table aware string navigation`
  - 接入新 CFR、首次强制刷新、`const_table` 感知导航。
- `b012a5e` `fix: keep viewer stable for inner class navigation`
  - 父类主路径 + `subclass` 参数，稳定内部类跳转。
- `2d18436` `fix: polish sidebar navigation behavior`
  - 修复文件树导航行为、自动展开、宽度拖拽、tooltip 与横向滚动。

## 10. 当前优先级
- `M5` 暂缓，保留为未来功能。
- 当前重点仍是 ParaTranz 联动体验完善与 viewer 稳定性打磨。
- 下一步更值得继续补的方向：
  - bookmarklet DOM 解析兜底选择器
  - 更细的错误反馈
  - 真实用户流程下的回归测试
