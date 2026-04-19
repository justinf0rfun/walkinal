# Walkinal 本地开发与手测流程

## 1. 文档目的

本文档用于约束 Walkinal 当前阶段的本地开发、联调和手动测试方式，避免开发过程中反复混淆：

- 源码版与安装版
- Renderer 热更新与 Main 进程重启
- 环境问题与业务问题

当前结论很明确：

- 日常迭代以源码版为主
- 不需要每次改动后都重新打包安装
- 只有在验证安装分发行为时，才需要重新生成 `.app`

## 2. 当前推荐工作模式

### 2.1 主要模式：源码版开发

当前阶段的主工作模式应为：

```bash
npm run dev
```

该模式用于：

- 日常功能开发
- UI 联调
- IPC 联调
- 文件存储联调
- Warp/AppleScript 桥接联调
- 手动功能验证

### 2.2 次要模式：安装版验证

安装版仅用于以下场景：

- 验证安装流程是否正常
- 验证 `/Applications` 中应用是否能独立运行
- 验证应用名、图标、签名告警、首次启动体验
- 验证打包产物行为是否和源码版一致

当前阶段不要把安装版当成主调试环境。

## 3. 启动前准备

### 3.1 首次环境准备

当前仓库依赖 Node + Electron + 原生模块编译链。首次启动前需要完成：

1. 安装依赖
2. 确保 Python 编译环境可被 `npm install` 使用
3. 确保项目能执行 `npm run dev`

### 3.2 当前推荐的 Python 处理方式

如果系统 Python 受 Homebrew / PEP 668 保护，不要强行往系统 Python 装包。推荐为 Node 原生模块编译创建一个单独的 Python venv。

示例：

```bash
uv venv .python-build-venv --python 3.12 --seed
.python-build-venv/bin/python -m pip install --upgrade pip setuptools
npm_config_python="$PWD/.python-build-venv/bin/python" npm install
```

说明：

- 这个 venv 不是项目 Python 运行环境
- 它只是提供给 `node-gyp` / 原生模块编译使用
- 之后如果 `node_modules` 不删，一般不需要反复处理

## 4. 日常开发流程

### 4.1 标准流程

建议固定用这一套顺序：

1. 进入仓库目录
2. 启动源码版
3. 修改代码
4. 在源码版里手测
5. 必要时重启 dev 进程

示例：

```bash
npm run dev
```

### 4.2 改动后如何判断是否需要重启

不是所有修改都需要重启。

通常可以直接热更新的改动：

- `src/renderer/` 下的大部分 React 组件
- 样式、布局、颜色、文案
- 纯前端交互逻辑

通常需要手动重启 `npm run dev` 的改动：

- `src/main/` 下的任何改动
- `src/preload/` 下的改动
- `src/shared/types.ts` 中 IPC 或共享类型改动
- Electron 窗口行为相关改动
- AppleScript / Warp 桥接逻辑
- 文件读写、历史存储、草稿存储
- 应用启动流程、快捷键、Tray 相关逻辑

### 4.3 最稳妥的经验法则

如果你不确定是否需要重启，直接重启即可。

当前阶段最省时间的做法不是“尽量不重启”，而是“发现行为不一致时，先重启排除缓存与进程残留因素”。

## 5. 手动测试策略

### 5.1 当前阶段优先验证什么

在 Walkinal 改造阶段，手动测试应优先覆盖这些基础链路：

- 悬浮窗是否正常显示
- 快捷键是否正常呼出/隐藏
- 标签页是否正常创建、关闭、切换
- 输入框是否可用
- 截图按钮是否正常
- 附件按钮是否正常
- 设置面板是否正常
- 语音输入是否仍可工作

在功能改造开始后，再逐步补充：

- 段落入队
- 段落编辑/删除
- 整体发送到 Warp
- 草稿恢复
- 历史读取

### 5.2 每轮开发后的建议测试节奏

建议按“小改动，小验证”的方式进行：

1. 改一小块功能
2. 立即在源码版里手测
3. 确认行为符合预期后再继续下一块

不要累计过多改动后再统一测试，否则很难定位问题来源。

### 5.3 测试源码版时的注意事项

如果 `/Applications` 里已经存在旧安装版，请注意不要混淆：

- 测源码版时，尽量先退出安装版
- 不要同时运行旧 `.app` 和当前 `npm run dev` 启动的版本

否则很容易出现：

- 看到的是旧窗口
- 测到的是旧逻辑
- 误以为新代码没生效

## 6. 什么时候需要重新打包安装

以下情况才需要重新跑安装版验证：

- 应用名称变更
- 图标资源变更
- 安装脚本变更
- `package.json` 中 `productName` / `appId` / build 配置变更
- 需要验证 `.app` 在 `/Applications` 中的实际表现
- 需要验证首次启动、权限提示、Gatekeeper 提示

非以上情况，不建议每次都重新打包。

## 7. 当前建议的安装版验证方式

如果后续需要验证安装版，优先走仓库已有链路：

```bash
./install-app.command
```

或手动：

```bash
npm run dist
```

说明：

- 当前 `npm run dist` 产出的是 macOS `.app` 目录，不是正式 `.dmg`
- 当前更适合做“本机构建并复制到 `/Applications`”的验证
- 不适合作为高频开发调试方式

## 8. 遇到问题时的排查顺序

### 8.1 启动失败

先看：

- `node_modules` 是否已安装
- `npm install` 是否完整成功
- Python 编译环境是否可用
- 是否有明显的 `npm ERR!` 或 `gyp ERR!`

### 8.2 改了代码但没生效

先做这几个动作：

1. 确认改动的是 `renderer` 还是 `main/preload`
2. 如果是 `main/preload`，直接重启 `npm run dev`
3. 确认前台运行的不是旧安装版
4. 重新呼出悬浮窗验证

### 8.3 行为异常但不知道是环境问题还是代码问题

建议这样判断：

- 如果项目根本起不来，大概率是环境问题
- 如果项目能起，但某个新功能不符合预期，大概率是代码问题
- 如果 UI 更新了，但桥接/文件/快捷键不对，先重启进程再判断

## 9. 推荐的当前工作约定

为避免开发阶段混乱，建议遵循这些约定：

- 默认只用源码版进行日常开发
- 改完 `main/preload/shared` 后主动重启
- 不同时运行安装版与源码版
- 环境问题优先先收敛到“能稳定跑 `npm run dev`”
- 功能问题优先在源码版复现和修复

## 10. 一份最短执行清单

### 10.1 首次准备

```bash
uv venv .python-build-venv --python 3.12 --seed
.python-build-venv/bin/python -m pip install --upgrade pip setuptools
npm_config_python="$PWD/.python-build-venv/bin/python" npm install
```

### 10.2 日常启动

```bash
npm run dev
```

### 10.3 改了主进程之后

```bash
# 先 Ctrl+C 停掉旧进程
npm run dev
```

### 10.4 需要验证安装版时

```bash
./install-app.command
```

## 11. 当前阶段的最终建议

Walkinal 进入功能迭代后，应采用：

- 源码版开发
- 小步修改
- 高频手测
- 主进程改动后立即重启
- 阶段性再做安装版验证

这能把开发成本和调试复杂度压到最低。
