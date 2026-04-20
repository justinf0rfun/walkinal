# Walkinal 功能进度

## 基础链路

- [x] Warp 发送链路打通
- [x] Send / Send and Run 区分
- [x] Queue 入队与发送主流程
- [x] 多 tab 基础能力
- [x] tab 重命名

## 草稿与恢复

- [x] drafts.json 持久化
- [x] 多 tab 重启恢复
- [x] 删除 tab 后不再恢复
- [x] 存储目录切换

## 历史

- [x] history.jsonl 全局历史写入
- [x] HistoryPicker 切到 Walkinal 历史
- [x] History 最近一页加载
- [x] History Load more 分页
- [x] History 搜索
- [x] History 过滤

## 队列体验

- [x] Queue 编辑回填
- [x] Queue 删除
- [x] Queue 上下排序
- [ ] Queue 批量操作

## 数据模型

- [x] sentEntries 接入
- [x] tab.messages 退场
- [x] sentEntries 轻量化（摘要 + historyId）

## 存储与性能

- [x] history append-only
- [x] drafts 持久化调度器收口
- [x] history-index.json
- [x] 基于索引的历史查询

## 文档

- [x] README / package metadata 全量改为 Walkinal
- [x] docs 全量对齐 Walkinal 现状

## 备注

- 当前进度以代码实现为准。
- 历史链路已切到 `history-index.json` + 索引查询，`HistoryPicker` 已支持搜索和模式过滤。
- 仓库内部仍保留 `window.clui`、`clui:*` IPC 前缀等兼容性命名，但文档已改按 Walkinal 现状描述。
