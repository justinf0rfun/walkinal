# Walkinal 性能优化方案

## 1. 目标

本文档面向 Walkinal 当前代码现状，给出一套优先于继续功能扩展的性能优化方案。目标不是做局部补丁，而是在数据规模还不大时先把几个结构性瓶颈拆掉，避免后续功能继续叠加后，草稿持久化、历史查询、发送记录恢复等路径一起恶化。

本文档覆盖：

- 当前已确认的性能瓶颈
- 优化优先级
- 数据结构调整建议
- 分阶段落地顺序
- 风险和迁移策略

## 2. 当前性能风险概览

### 2.1 当前主数据面

当前 Walkinal 的核心数据面有三层：

- `drafts.json`
  - 保存全部 tabs 的当前状态
  - 包含 `queueItems`
  - 包含 `sentEntries`
  - 启动时恢复当前工作上下文

- `history.jsonl`
  - 保存全局完整发送历史
  - 当前作为全局历史面板数据源

- renderer store
  - Zustand 中持有全部 tabs
  - 许多变更会触发 `persistDrafts()`

### 2.2 现阶段为什么还没明显卡

目前还没明显卡顿，主要因为：

- 使用人数低，单机单用户
- `sentEntries` 已经限制最近条数
- 单次 queue 规模一般不大
- drafts/history 文件总体还小

但这只是“规模尚小”的结果，不代表结构本身没有问题。

## 3. 当前明确的结构性瓶颈

## 3.1 `drafts.json` 全量重写

当前 `persistDrafts()` 是整份 `DraftsFile` 重新序列化并整文件写回。

问题：

- 任意一个 tab 的一个小变更，都会重写全部 tabs
- tab 越多，queue 越多，sentEntries 越多，写盘成本越大
- 启动恢复和写入之间更容易形成竞态

当前这条链已经通过：

- 启动 gate
- 原子写
- 串行写

提升了可靠性，但没有解决“写放大”问题。

## 3.2 `history.jsonl` 不是纯追加写

当前 `HistoryStore.append()` 的实现是：

1. 先读整个历史文件
2. 拼接一条新记录
3. 整文件重新写回

问题：

- 随着历史增长，单次发送写入越来越慢
- 这是伪 JSONL，不是真正 append-only
- 未来搜索、过滤、收藏等功能一上，问题会更明显

这块是当前最明确、最优先该处理的性能债。

## 3.3 `history` 查询是全量读取 + 全量排序

当前 `list()`：

- 读取整个 `history.jsonl`
- 每行 parse
- 整体排序
- 全量返回

问题：

- 历史越多，打开历史面板越慢
- 搜索/过滤如果直接基于全量内存数组，会进一步放大成本

## 3.4 drafts 持久化触发过于频繁

当前保存触发有两层：

- `App.tsx` 中的 debounce 自动保存
- 各关键 action 后的 `persistDraftsLater(get)`

优点：

- 非常稳
- 不容易丢数据

问题：

- 写盘次数偏多
- 多个连续动作仍然会产生一串近似保存
- 如果数据量增长，会放大 IO 压力

## 3.5 Renderer 持有全部 tab 的完整内容

当前 renderer store 中每个 tab 直接持有：

- `queueItems`
- `sentEntries`
- 标题、目录、UI 状态

问题：

- 未来如果单 tab 内容变大，状态更新成本会升高
- 任何 tab 级写入都可能让整体 store 变胖
- 当前还没到 React 渲染瓶颈，但有增长风险

## 4. 优化原则

## 4.1 先解决写入路径，再解决读取路径

优先级应是：

1. 修正 `history` 写入模型
2. 收敛 `drafts` 保存策略
3. 再优化历史查询和分页

原因：

- 写入是所有功能的公共底层
- 写入模型不对，后面加搜索、过滤、收藏、排序都会跟着出问题

## 4.2 先保证一致性，再追求性能

Walkinal 不是高吞吐服务，而是本地桌面工具。

因此排序应是：

- 先不丢数据
- 再避免文件损坏
- 再减少冗余 IO
- 最后再做读取加速

## 4.3 不引入过重基础设施

当前阶段不建议直接上：

- SQLite
- IndexedDB 作为主存储
- LevelDB 类库

原因：

- 迁移成本高
- 调试复杂度高
- 对当前规模来说，纯文件模型仍然够用

但应当把文件模型改成“更像真正的日志式存储”，而不是当前这种半同步半全量重写。

## 5. 推荐优化路径

## 5.1 第一优先级：把 `history.jsonl` 改成真正 append-only

### 当前问题

`HistoryStore.append()` 先读全量再重写全量。

### 目标

一条发送成功记录应直接追加到文件末尾，不触碰旧内容。

### 方案

- 使用真正的 append 模式写入
- 每次只写：

```json
{"id":"...","timestamp":"...","title":"...","content":"...","itemCount":3,"target":"warp"}
```

- 保证每条记录以 `\n` 结束

### 预期收益

- 历史文件再大，单次发送写入也接近常量成本
- 发送成功路径会更稳定
- 后面做历史搜索/过滤时，不会被“写入模型错误”拖后腿

### 风险

- 几乎没有
- 属于最优先、最安全的优化

## 5.2 第二优先级：给 `drafts.json` 引入持久化调度器

### 当前问题

`persistDraftsLater(get)` 到处散落，各 action 都会安排写入。

### 目标

把 renderer 侧的“请求保存”统一收口，变成一条明确的写入调度链。

### 方案

新增一个 drafts persistence coordinator，职责：

- 接收保存请求
- 合并短时间内的多次请求
- 串行写入
- 提供 `flushNow()` 给退出/隐藏等关键时机调用

### 推荐形态

不是让各 action 直接调 `persistDraftsLater(get)`，而是：

```ts
requestDraftPersist()
flushDraftPersist()
```

由一个统一模块决定：

- debounce 多久
- 何时合并
- 何时立刻落盘

### 预期收益

- 写盘策略集中管理
- 更容易调优
- 后面接存储路径迁移、应用退出、批量操作时不会到处散

## 5.3 第三优先级：将 `drafts.json` 的内容做轻量裁剪

### 当前思路

保留全部 tabs + queueItems + 每个 tab 最近 20 条 sentEntries。

### 可继续优化点

- 限制单条 `sentEntries.content` 的最大长度
- 对过长内容只保存摘要 + `historyId`
- 对特别大的 file/screenshot queue item 只保留必要元数据

### 推荐方向

`drafts.json` 用于恢复上下文，不应承担“完整历史副本”职责。

因此建议：

- `queueItems` 保留完整当前草稿
- `sentEntries` 保留近期摘要
- 更完整内容仍以 `history.jsonl` 为准

### 推荐数据模型

```ts
interface SentEntry {
  id: string
  historyId?: string
  timestamp: string
  title: string
  contentPreview: string
  itemCount: number
  mode: 'draft' | 'run'
}
```

说明：

- `contentPreview` 只保留适合 UI 恢复和预览的摘要
- 需要完整内容时，再从 `history.jsonl` 按 `historyId` 取

### 预期收益

- `drafts.json` 增长速度显著下降
- 恢复和保存都会更快

## 5.4 第四优先级：历史列表分页化

### 当前问题

历史面板每次都全量读取。

### 目标

第一次打开历史面板时只读最近 N 条，例如 50 条。

### 方案

- `HistoryStore.list()` 改为支持：
  - `limit`
  - `cursor` 或 `offset`
- UI 先显示最近一页
- 需要更多时再继续读

### 推荐最小实现

先不做复杂 cursor，只做：

- `listRecent(limit = 50)`
- `loadMore(beforeTimestamp)`

### 预期收益

- 历史面板初次打开更快
- 搜索/过滤前的基础体验更稳

## 5.5 第五优先级：历史搜索建立轻量索引

### 当前问题

后面做搜索时，如果每次都全量扫描 `history.jsonl`，会变慢。

### 推荐方案

先不上数据库，先做轻量级派生索引：

- `history-index.json`
- 保存最近条目的：
  - `id`
  - `timestamp`
  - `title`
  - `contentPreview`
  - `itemCount`
  - `tags`

完整内容仍在 `history.jsonl`

### 为什么这样做

- 搜索和列表主要依赖标题/摘要
- 不需要每次都把完整正文读入
- 保持文件系统模型简单

## 6. 具体实施顺序

## 6.1 Phase A：修写入模型

目标：

- 历史写入改为真正 append-only
- drafts 保存调度统一化

任务：

- 重写 `HistoryStore.append()`
- 引入 drafts persistence coordinator
- 梳理所有 `persistDraftsLater(get)` 调用点

验收：

- 发送一次只追加一行 history
- 多个连续动作不会造成密集重复整写

## 6.2 Phase B：瘦身 drafts 数据

目标：

- 把 `sentEntries` 从“完整内容”改成“近期摘要”

任务：

- 给 `SentEntry` 增加 `historyId`
- `content` 改成 `contentPreview`
- 发送成功时同时写：
  - 完整 history
  - 轻量 sentEntries

验收：

- drafts 体积显著下降
- 重启后仍能看见每个 tab 最近发送记录

## 6.3 Phase C：优化 history 查询

目标：

- 历史面板不再全量读取

任务：

- `HistoryStore` 增加 recent/paginated 查询
- HistoryPicker 改成分页加载

验收：

- 历史条目多时，打开速度仍稳定

## 6.4 Phase D：搜索/过滤优化

目标：

- 给未来 history 搜索打基础

任务：

- 建立轻量 `history-index.json`
- 搜索先查 index，再按需取正文

验收：

- 历史搜索不会因为正文变大明显变慢

## 7. 对当前代码的具体建议

## 7.1 `HistoryStore`

当前最该先改：

- `src/main/storage/history-store.ts`

建议：

- `append()` 改成真正 append-only
- `list()` 增加 limit/pagination 能力

## 7.2 `sessionStore`

当前最该改造的不是数据字段，而是持久化触发方式：

- `src/renderer/stores/sessionStore.ts`

建议：

- 引入统一的 drafts persist scheduler
- 不要让每个 action 都各自决定“何时落盘”

## 7.3 `ConversationView`

如果后面把 `sentEntries` 改成轻量摘要：

- `Sent History` 区就展示摘要
- 点击某条记录时，再按需展开完整内容

这样能把 UI、恢复和完整历史彻底解耦。

## 8. 不建议现在就做的事

以下方案暂时不建议直接上：

- 用 SQLite 替换全部存储
- 给每个 tab 单独拆一个 JSON 文件
- 把 drafts/history 一起放进 IndexedDB
- 引入复杂的 CRDT/事务层

这些都可能成为过度设计。

当前最合理的方向仍然是：

- 继续文件系统存储
- 但把写入路径改成日志式
- 把恢复数据做轻量化
- 把查询做分页化

## 9. 预期最终状态

优化完成后，预期结构应是：

```text
storageDir/
  config.json
  drafts.json
  history.jsonl
  history-index.json
```

职责分层：

- `drafts.json`
  - 当前 tabs
  - queueItems
  - 每个 tab 最近少量 sent 摘要

- `history.jsonl`
  - 完整历史正文
  - append-only

- `history-index.json`
  - 用于快速列表和搜索

## 10. 结论

当前 Walkinal 的性能风险不在渲染层，而在存储层。

最重要的不是马上优化 React，而是先把：

- `history` 的伪追加写
- `drafts` 的全量整写
- 历史全量读取

这三件事处理掉。

如果只能先做一件事，优先顺序是：

1. `history-store.append()` 改成真正 append-only
2. `drafts` 保存调度统一化
3. `sentEntries` 轻量化

这个顺序最稳，也最不容易在后续功能继续增加后造成返工。
