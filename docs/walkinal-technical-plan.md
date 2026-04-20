# Walkinal 技术方案与任务拆分

> 历史规划文档。本文包含从旧版 Clui/Claude 会话模型向 Walkinal 队列模型迁移时的分析与拆分，不再代表当前代码现状。当前实现请以 [ARCHITECTURE.md](ARCHITECTURE.md) 和 [feature-progress.md](feature-progress.md) 为准。

## 1. 文档目标

本文档基于当前仓库真实现状产出，而不是沿用 Fork 源项目的抽象设想。目标是把 [prd.md](/Users/justin/workspace/walkinal/docs/prd.md) 中的产品方向，落成一份可以直接指导迭代开发的技术方案和任务拆分。

本文档解决三件事：

- 明确当前代码库的真实基础能力和限制
- 给出 Walkinal 的落地技术方案
- 将改造工作拆成可执行任务，便于分阶段推进

## 2. 当前项目现状

### 2.1 当前技术栈

当前仓库并不是 Vue/JS 项目，也没有 `claude-process.js`、`bridge.js`、`MessageQueue.vue` 这一类文件。当前真实基础如下：

- 桌面框架：Electron
- Renderer：React 19
- 状态管理：Zustand 5
- 语言：TypeScript
- IPC：`src/shared/types.ts` + `src/preload/index.ts` + `src/main/index.ts`
- 核心 Claude 调度：`ControlPlane` + `RunManager`
- 当前输入控件：`InputBar.tsx` 内的 `textarea`
- 当前消息展示：`ConversationView.tsx`
- 当前标签状态中心：`sessionStore.ts`

### 2.2 当前核心运行模式

当前产品本质是一个 Claude Code GUI 包装层：

- Renderer 发起 `window.clui.prompt(...)`
- Main 通过 `ControlPlane.submitPrompt(...)` 派发任务
- `RunManager` 拉起 `claude -p --input-format stream-json --output-format stream-json`
- 输出事件被标准化后回流到前端
- `sessionStore` 将这些事件写成对话消息和工具卡片

### 2.3 当前可复用能力

以下能力可以直接复用，或者在最小适配后复用：

- 悬浮窗、快捷键、Tray、窗口拖拽与点击穿透
- 多标签页和基础标签状态
- 截图能力
- 文件选择与附件能力
- 本地语音转写能力
- 设置面板、主题系统、声音开关
- 历史入口和弹层 UI 机制
- 现有本地日志、诊断、文件读写能力

### 2.4 当前与 PRD 的关键不一致

PRD 中有一些代码示例和文件名更像目标形态，不是当前代码事实。需要以当前仓库为准，做如下校正：

- 当前不是 Vue，而是 React + TypeScript
- 当前没有 Monaco Editor，输入区是 `textarea`
- 当前没有 `TabManager` 这个独立类，tab 状态在 `sessionStore` 与 `ControlPlane` 中分层维护
- 当前没有 `claude-process.js`，Claude 调度逻辑在 `src/main/claude/`
- 当前没有 `terminal-bridge.js`，应在 `src/main/` 下新增 TypeScript 模块
- 当前历史面板的数据源是 Claude 会话目录，不是本地草稿/发送历史

因此，技术方案不能按 PRD 里的示例路径直接实现，必须对齐现有工程结构。

## 3. Walkinal 目标定义

## 3.1 产品核心变化

Walkinal 的核心不是“和 Claude 对话”，而是“组织内容并发送到外部终端”。

系统角色变化如下：

- 现状：内部对话容器
- 目标：外部终端的悬浮输入编排器

### 3.2 新的核心对象

Walkinal 的中心对象不再是“会话消息”，而是“待发送段落队列”。

每个标签页应维护：

- 当前草稿输入内容
- 待发送段落列表
- 最近一次发送结果
- 标签级展示状态

### 3.3 新的关键动作

- `Enter`：把下方输入框内容加入当前标签的临时段落队列
- `Send`：将当前标签队列中的全部内容发送到 Warp 输入区，但不立即执行
- `Send and Run` / `Cmd+Enter`：将当前标签队列中的全部内容发送到 Warp，并立即执行
- 删除段落：从队列中删除
- 编辑段落：回填输入框并从队列移除
- 附件/截图：生成新的段落并插入队列

## 4. 总体技术方案

### 4.1 改造原则

本次改造不建议直接删除 Claude 相关主链路，而建议分阶段“去耦”：

1. 先让前端工作流从“对话消息”切换为“段落队列”
2. 再接入 Warp 桥接发送
3. 再将历史和草稿切换到本地文件
4. 最后清理 Claude 运行链路和不再使用的 UI/类型

这样做的原因是：

- 当前仓库的大量状态和 UI 都绑在“消息流”语义上
- 一次性拆掉 Claude 主链路会导致风险集中爆发
- 渐进式替换更容易验证窗口、输入、工具栏等保留功能是否仍稳定

补充一个关键交互原则：

- Walkinal 后续必须显式区分三个动作：
  - 入队
  - 发送到 Warp 输入区
  - 发送到 Warp 并执行
- 这三者不能在最终实现中继续共用同一个动作
- 当前 Phase 1 为了先打通 Warp 链路，临时采用了“发送即执行”的折中方案
- 进入队列模型后，这个折中方案必须退出

### 4.2 目标架构

目标架构如下：

```text
Renderer
  App / TabStrip / QueueView / InputBar / HistoryPanel
    -> sessionStore（草稿 + 段落队列 + 发送状态）
    -> window.clui.*

Preload
  仅暴露 Walkinal 需要的 IPC API

Main
  DraftStoreService       草稿读写
  HistoryStoreService     历史追加与查询
  WarpBridgeService       AppleScript -> Warp
  AttachmentService       截图/文件转段落
  Window / Tray / Theme   保持现有实现
```

### 4.3 保留与替换边界

保留：

- `src/main/index.ts` 的窗口、快捷键、截图、语音、文件选择、主题检测等主框架能力
- `src/preload/index.ts` 的桥接模式
- `src/renderer/App.tsx` 的整体悬浮布局
- `TabStrip`、`SettingsPopover`、弹层基础设施

替换或重构：

- `ConversationView` -> `QueueView`
- `sessionStore` 中与 Claude 会话/运行状态强绑定的部分
- `HistoryPicker` 的数据源
- `InputBar` 的发送语义
- Main 中 Claude IPC 的使用路径

下线或逐步废弃：

- `ControlPlane`
- `RunManager`
- `EventNormalizer`
- Permission hook server
- Claude session history 读取逻辑

这些模块不需要第一阶段物理删除，但会逐步退出主链路。

## 5. 数据模型方案

### 5.1 新的核心类型

建议在 `src/shared/types.ts` 中新增或替换为以下方向的类型体系：

```ts
export type QueueItemType = 'text' | 'file' | 'screenshot'

export interface QueueItem {
  id: string
  type: QueueItemType
  content: string
  createdAt: number
  metadata?: {
    filePath?: string
    fileName?: string
    mimeType?: string
    size?: number
    preview?: string
    dataUrl?: string
  }
}

export interface DraftTabState {
  id: string
  title: string
  queue: QueueItem[]
  draftInput: string
  hasUnread: boolean
  workingDirectory: string
  additionalDirs: string[]
  lastSend?: {
    sentAt: number
    itemCount: number
    charCount: number
    target: 'warp'
  } | null
}

export interface DraftsFile {
  activeTabId: string
  tabs: DraftTabState[]
}

export interface HistoryEntry {
  id: string
  timestamp: string
  title: string
  content: string
  itemCount: number
  target: 'warp'
  workingDirectory?: string
  favorite?: boolean
  tags?: string[]
}
```

### 5.2 与当前模型的关系

当前 `TabState` 的很多字段已经不适合主模型：

- `claudeSessionId`
- `status`
- `activeRequestId`
- `permissionQueue`
- `permissionDenied`
- `messages`
- `lastResult`
- `sessionModel / sessionTools / sessionSkills / sessionVersion`

这些字段不适合作为 Walkinal 的核心状态。建议不要在旧结构上继续堆补丁，而是在保持 `tabs + activeTabId` 整体形状的前提下，逐步切换为新的草稿模型。

### 5.3 持久化格式

建议落盘到：

```text
~/Documents/Walkinal/
  drafts.json
  history.jsonl
  config.json
```

建议 `config.json` 至少包含：

```json
{
  "storageDir": "~/Documents/Walkinal",
  "terminalTarget": "warp"
}
```

## 6. Renderer 方案

### 6.1 消息区改造为队列视图

当前 `ConversationView.tsx` 的责任是：

- 渲染用户/助手/工具消息
- 渲染权限卡
- 渲染运行状态和重试

目标状态下应改为 `QueueView.tsx`，职责变为：

- 渲染当前标签队列项
- 支持悬停显示编辑/删除操作
- 支持截图预览、文件预览、文本内容折叠
- 展示空态
- 展示最近发送信息，而不是 Claude 运行状态

### 6.2 输入栏改造

当前 `InputBar.tsx` 会：

- 将输入发送给 `sendMessage`
- 支持 slash commands
- 处理模型切换
- 处理语音
- 处理图片粘贴

目标状态下：

- `Enter` 应触发 `enqueueDraftItem()`
- 输入区需要保留一个显式 `Send` 动作，将整个队列发送到 Warp 但不执行
- `Cmd+Enter` 应触发 `sendQueuedItemsAndRun()`
- `slash commands` 中依赖 Claude session 的部分应下线或改造
- 模型切换 UI 不再适合作为主功能，除非未来要扩展为“发送到不同 CLI”
- 粘贴图片仍保留，但行为改为直接入队

### 6.3 状态管理改造

当前 `sessionStore.ts` 过度绑定 Claude 事件流。建议拆分职责：

- `draftStore`: 标签、队列、当前输入、发送动作
- `uiStore`: 展开/收起、市场面板、设置相关 UI
- 可保留单 store，但内部 action 需要彻底重写为草稿语义

建议最少保留的 action：

- `createTab`
- `selectTab`
- `closeTab`
- `renameTab`
- `setDraftInput`
- `enqueueTextItem`
- `enqueueAttachmentItem`
- `removeQueueItem`
- `editQueueItem`
- `reorderQueueItems`
- `sendCurrentQueue`
- `loadDrafts`
- `persistDrafts`
- `loadHistory`

### 6.4 历史面板改造

当前 `HistoryPicker` 从 `~/.claude/projects/...` 读取 Claude transcript。

目标状态下应改为：

- 从 `history.jsonl` 读取发送历史
- 按时间倒序展示
- 点击后支持“恢复为当前标签队列”或“新建标签导入”

第一阶段可以先只做“查看”和“导入为新标签”。

## 7. Main 方案

### 7.1 Warp 桥接模块

建议新增：

- `src/main/warp-bridge.ts`

职责：

- 将拼接后的文本发送给 Warp
- 屏蔽 AppleScript 调用细节
- 统一返回成功/失败结果

建议接口：

```ts
export interface SendToWarpInput {
  text: string
}

export interface SendToWarpResult {
  ok: boolean
  error?: string
}

export async function sendToWarpDraft(input: SendToWarpInput): Promise<SendToWarpResult>
export async function sendToWarpAndRun(input: SendToWarpInput): Promise<SendToWarpResult>
```

实现建议：

- 优先使用 `osascript` 调用 AppleScript
- 避免逐字符输入，优先使用“复制到剪贴板 + 粘贴”的方式
- `sendToWarpDraft` 只负责将内容送入 Warp 输入区
- `sendToWarpAndRun` 在 `sendToWarpDraft` 成功后，再补一个提交动作
- 保留超时与错误信息
- 后续多终端支持时，让 `warp-bridge.ts` 实现统一 terminal adapter 接口

### 7.2 草稿存储服务

建议新增：

- `src/main/storage/drafts-store.ts`

职责：

- 初始化存储目录
- 读取 `drafts.json`
- 保存 `drafts.json`
- 提供 debounce 保存能力

### 7.3 历史存储服务

建议新增：

- `src/main/storage/history-store.ts`

职责：

- 追加写入 `history.jsonl`
- 读取历史
- 解析 JSONL
- 收藏、删除、标签等接口预留

### 7.4 配置服务

建议新增：

- `src/main/storage/config-store.ts`

职责：

- 管理 `config.json`
- 解析存储路径
- 暴露设置读取/更新接口

### 7.5 IPC 设计

建议在 `src/shared/types.ts` 中新增 Walkinal 专用 IPC：

- `clui:drafts-load`
- `clui:drafts-save`
- `clui:history-list`
- `clui:history-import`
- `clui:queue-send`
- `clui:tab-rename`

为了减少混乱，建议不要复用 `PROMPT / RETRY / CANCEL / RESPOND_PERMISSION` 这一套 Claude 语义 IPC。

## 8. 拼接策略

### 8.1 段落拼接原则

发送给 Warp 的文本不是简单 join，而应可读、可审查、可复现。

这里需要再明确一个边界：

- “拼接内容”是一次发送载荷
- “是否进入队列”是编辑编排动作
- “是否发送到 Warp”是桥接动作
- “是否立即执行”是发送动作的执行策略
- 这三层不能耦合成一个 API

建议默认格式：

```text
[Text]
请帮我重构登录模块，重点看状态同步和错误处理。

[Screenshot]
文件名: screenshot-1.png
说明: 用户截图附件

[File]
路径: /absolute/path/src/auth.ts
内容:
...文件内容...
```

### 8.2 不同段落的拼接方式

- 文本段落：原样拼接
- 截图段落：短期可先注入文件路径或文本说明
- 文件段落：默认拼接文件路径 + 内容预览或完整内容

是否发送“完整文件内容”应作为一个策略开关，而不是写死。

### 8.3 建议修正 PRD 的一点

PRD 中“截图段落自动作为图片/文本段落添加到队列”是合理的，但从 Warp 终端消费视角看，真正发送时仍需要转换为可粘贴文本格式。图片本体不会像 GUI 对话框那样直接被终端模型消费，因此这里必须在实现方案中明确“终端发送格式化规则”。

## 9. 分阶段任务拆分

## 9.1 Phase 0：结构准备

目标：不改变用户主体验，先为 Walkinal 铺类型和服务基础。

任务：

- 梳理并冻结当前 Claude 主链路使用范围
- 在 `src/shared/types.ts` 增加 Walkinal 数据类型
- 设计新的 IPC 常量
- 新增 `config-store.ts`、`drafts-store.ts`、`history-store.ts`、`warp-bridge.ts` 空实现
- 在 `preload` 中暴露新的 API 骨架

产出：

- 新类型
- 新服务骨架
- 新 IPC 桥接

验收：

- 项目仍可运行
- 未切换 UI 语义
- 新 API 可被前端调用但不影响旧流程

## 9.2 Phase 1：单段发送 MVP

目标：最小化跑通“输入 -> 发送到 Warp”，暂不做完整队列系统。

任务：

- 将 `InputBar` 的主发送动作从 `sendMessage` 改为 `sendToWarp`
- 先保留单条草稿发送模式
- 在 Main 侧实现 Warp AppleScript 桥接
- 发送成功后写入 `history.jsonl`
- 为错误态提供基础反馈

产出：

- Walkinal 可将输入框文本发送到 Warp
- 历史开始落地到本地文件

验收：

- 手工输入可成功投递到 Warp
- 失败时前端有明确提示
- 本地历史可看到成功记录
- 已知偏差：当前实现仍然将“输入后发送”和“发送并执行”混在一起，这只是临时行为，不代表最终产品定义

## 9.3 Phase 2：段落队列系统

目标：完成 PRD 的核心交互。

任务：

- 将 `ConversationView` 重构为 `QueueView`
- `Enter` 改为入队
- 增加显式 `Send` 动作：发送整个队列到 Warp 但不执行
- `Cmd+Enter` 改为发送整个队列并执行
- 增加段落卡片删除
- 增加段落卡片编辑回填
- 截图、文件、粘贴图片全部走统一入队逻辑

产出：

- 真正的段落队列界面
- 队列编辑能力
- 入队、发送、发送并执行三种动作分离

验收：

- 文本/截图/文件都能进入队列
- 编辑和删除行为稳定
- `Enter` 只负责入队，不直接触发 Warp
- `Send` 只进入 Warp 输入区
- `Send and Run` / `Cmd+Enter` 进入 Warp 并立即提交
- 整体发送后队列按交互定义被清空且写入历史

## 9.4 Phase 3：草稿持久化

目标：标签和队列可恢复。

任务：

- 应用启动时加载 `drafts.json`
- 标签/队列变化时自动保存
- 关闭标签、切换标签、编辑输入时保持一致性
- 当前输入框未提交内容纳入 `draftInput`

产出：

- 草稿恢复能力

验收：

- 关闭重开应用后，标签和草稿全部恢复

## 9.5 Phase 4：历史面板切换

目标：历史入口完全转向 Walkinal 自身数据。

任务：

- 重写 `HistoryPicker` 的数据读取逻辑
- 支持按时间查看发送历史
- 支持从历史恢复为新标签
- 增加基础搜索或标题过滤

产出：

- 基于 `history.jsonl` 的历史面板

验收：

- 不再依赖 Claude transcript
- 历史恢复链路完整

## 9.6 Phase 5：清理 Claude 运行链路

目标：从主产品路径中移除不再需要的 Claude 包装能力。

任务：

- 停用与 `ControlPlane`、`RunManager` 相关的 renderer 调用
- 下线权限卡、运行状态、成本统计、模型切换等不再适用能力
- 清理旧类型和旧 IPC
- 保留必要的日志与诊断通路

产出：

- Walkinal 主链路与 Claude 对话链路解耦

验收：

- 主功能无 Claude 依赖
- 构建通过
- 代码复杂度下降

## 10. 关键风险

### 10.1 Warp 桥接稳定性

风险：

- AppleScript 对 Warp 的控制能力可能不如 Terminal.app 稳定
- 焦点切换、粘贴时机、权限提示都可能影响体验

应对：

- 将桥接封装成单独 service
- 保留超时、重试和错误透出
- 后续抽象 terminal adapter，避免把 Warp 写死在全局流程

### 10.2 当前 UI 强绑定“会话消息”语义

风险：

- `sessionStore`、`ConversationView`、`StatusBar` 都深度依赖 Claude 状态字段

应对：

- 优先切换 renderer 数据模型
- 将“发送状态”与“运行状态”区分

### 10.3 历史与草稿的一致性

风险：

- 多标签、多入口修改状态时容易产生落盘覆盖问题

应对：

- 主进程负责权威文件写入
- renderer 不直接写文件
- 所有保存操作通过统一 IPC 进入主进程

## 11. 建议的实施顺序

建议按以下顺序推进：

1. 新增 Walkinal 类型、IPC、主进程 service 骨架
2. 跑通单条文本发送到 Warp
3. 实现段落队列与编辑
4. 实现草稿持久化
5. 切换历史面板
6. 清理 Claude 旧主链路

这个顺序的好处是：

- 每一步都有可验收结果
- 不需要一开始就大规模删除旧代码
- 便于在保留现有 UI 能力的同时逐步完成产品转向

## 12. 最终结论

Walkinal 不应被实现为“在 Clui CC 上打几个补丁”，而应被实现为“复用 Clui CC 的壳与桌面能力，但把核心数据模型从对话流切换为段落队列”。

从当前仓库现状出发，最合理的路径是：

- 保留 Electron 壳、浮窗体验、标签、截图、附件、语音、设置
- 新建 Warp 桥接与本地存储服务
- 重写 renderer 的核心状态语义
- 最后退出 Claude 会话调度链路

这样既符合 PRD 的产品目标，也符合当前代码库的真实结构。
