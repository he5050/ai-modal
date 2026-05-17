# Changelog

# [0.8.0](https://github.com/he5050/ai-modal/compare/v0.7.0...v0.8.0) (2026-05-17)


### Bug Fixes

* 修复安全与空值问题，统一文件检测逻辑 ([858ae74](https://github.com/he5050/ai-modal/commit/858ae740c2a1e74bb2b97a7d16f01e742bc08f41))
* 修复导入路径与日志记录问题 ([380f3d8](https://github.com/he5050/ai-modal/commit/380f3d86e5adba04b1c54c0ca8b33a308e83fe33))
* 修复配置路径解析及类型导入 ([833c894](https://github.com/he5050/ai-modal/commit/833c894b5b851efa225e7eddd7f0f7f3d2d2d2f9))


### Features

* 模型检测接入选择弹窗并移除加密存储 ([9f12167](https://github.com/he5050/ai-modal/commit/9f12167d9d8e8886cd2bacb36d248d7e512a5d4e))
* 添加模型检测取消、XSS防护与技能列表虚拟滚动 ([905e610](https://github.com/he5050/ai-modal/commit/905e610a3c32e99600000c438334c9a414664db7))
* 引入通用UI组件并替换现有使用点 ([f4db781](https://github.com/he5050/ai-modal/commit/f4db7813e56e2b65b1f554a86b1755ff7f08fab8))
* 优化性能与重构模型管理模块 ([674b7eb](https://github.com/he5050/ai-modal/commit/674b7eb29692f3f4174858f4f89594318e56c721))
* **models:** 添加详情页跳转功能和本地模型选择 ([0db1261](https://github.com/he5050/ai-modal/commit/0db1261ef3a109246d23a585ef82c066b754d15a))

# [0.7.0](https://github.com/he5050/ai-modal/compare/v0.6.0...v0.7.0) (2026-05-15)


### Bug Fixes

* 避免重复添加 claude 前缀并优化复选框组件 ([c5489ac](https://github.com/he5050/ai-modal/commit/c5489acbeedf0ead879562ab902e3ad7a1d6440b))


### Features

* 导入模型时支持按需选择模型列表 ([5935126](https://github.com/he5050/ai-modal/commit/5935126097e6dfb8efe281d5291f9602478869cf))
* 将请求配置提取为独立弹窗并优化列表样式 ([bf3406f](https://github.com/he5050/ai-modal/commit/bf3406fa090fc1cef8d7eadc70fed61dc164c154))
* 支持 Gemini 协议并增强映射日志 ([f3088ea](https://github.com/he5050/ai-modal/commit/f3088ea2fbeb84207a0cf4a2f7e2f5264476df46))
* 支持自定义模型槽位与显示名称 ([1079faa](https://github.com/he5050/ai-modal/commit/1079faa20136a8572c0c40a4fa103be8b74c7866))
* 新增 ModelScope MCP 服务器搜索与详情获取功能 ([a8bcd97](https://github.com/he5050/ai-modal/commit/a8bcd970029cca5baf71f89c6b0094b6bf208d2a))
* 添加 MCP 服务器配置与同步管理页面 ([ddfbfcf](https://github.com/he5050/ai-modal/commit/ddfbfcf9a0bf8635aa881fbf0be93686881d5484))
* 适配 ModelScope 新版 MCP API 及 stdio 初始化握手 ([7a68994](https://github.com/he5050/ai-modal/commit/7a689942e9032e7bfb8740c900dcea51a90be3b2))
* 重构ModelScope在线安装并增强MCP同步功能 ([23c10dd](https://github.com/he5050/ai-modal/commit/23c10dd8b12fd3a0a899c8b017aae14dc1e6be76))
* 隐藏在线导入功能 ([de50128](https://github.com/he5050/ai-modal/commit/de501283dbd48624c11611a47c16f6d73df4d274))

# [0.6.0](https://github.com/he5050/ai-modal/compare/v0.5.0...v0.6.0) (2026-05-10)


### Features

* 升级AI模态框版本并改进提示词编辑功能 ([e6c6d2b](https://github.com/he5050/ai-modal/commit/e6c6d2b39ab035013d4f26c9f1e9d6c293254b60))
* 添加技能增强功能支持多LLM系统集成 ([4ccde97](https://github.com/he5050/ai-modal/commit/4ccde97556b24a72dd86322d0d8086c9e1ef43ff))
* 添加快捷应用功能并优化模型配置逻辑 ([7b7b138](https://github.com/he5050/ai-modal/commit/7b7b138560817afaf3ee647d4b7e0bb510c57f70))
* 添加模型映射代理网关功能 ([0193a3a](https://github.com/he5050/ai-modal/commit/0193a3abfe0f7afed1f1cc9625dffab1997f6775))
* 优化UI样式与模型映射日志 ([6ed34cf](https://github.com/he5050/ai-modal/commit/6ed34cff12d8f5404464f532c9940e7d3cb64e49))
* 增强协议测试结果结构，添加请求和响应的详细信息 ([c428ffb](https://github.com/he5050/ai-modal/commit/c428ffbb58346d62167dfb22390b8b1c0a0c7167))
* **ConfigPage:** 添加Codex和OpenCode配置应用功能 ([3bc4f83](https://github.com/he5050/ai-modal/commit/3bc4f83eff2967253192cc8100e05594b9bc117d))
* **router:** 优化模型测试逻辑并增强错误处理,提升模型测试的准确性和效率： ([fff627d](https://github.com/he5050/ai-modal/commit/fff627d2b9cee2d6ca6aed65202bd935d6d870e7))
* **rules:** 添加规则文件监听功能，支持轮询降级处理 ([c3740af](https://github.com/he5050/ai-modal/commit/c3740afd506ce72715f1d04c4ad7559a0e49676b))
* **RulesPage:** 添加ConfirmModal组件并重构规则页面 ([9640bd3](https://github.com/he5050/ai-modal/commit/9640bd3bd26d616424373986d60fde91880562c8))
* **skill-enrichment:** 实现技能文档语义分析和结构化处理 ([21abb9b](https://github.com/he5050/ai-modal/commit/21abb9b10d3fe1792d1d28dd405ad15ddfb1d070))
* **skill-translation:** 添加在线技能详情翻译功能，支持本地化处理 ([e4af2e3](https://github.com/he5050/ai-modal/commit/e4af2e3361fc981feac6297905b746872e4ef1a1))
* **skills:** 添加技能命令进度跟踪功能 ([0d10960](https://github.com/he5050/ai-modal/commit/0d1096036e509b15864ab0ceceadf7ef825acc4a))
* **skills:** 添加在线技能详情查看功能 ([7091a3b](https://github.com/he5050/ai-modal/commit/7091a3bf6da8e1d8ee3383fb68aa0d3ef8056a94))
* **tauri:** 添加文件系统监控 ([1c5ea2f](https://github.com/he5050/ai-modal/commit/1c5ea2f297c944fcdfc20e406c3147e74ec11c00))

# [0.5.0](https://github.com/he5050/ai-modal/compare/v0.3.2...v0.5.0) (2026-04-20)


### Features

* 增加协议测试结果和配置文件管理增强 ([9c5ea30](https://github.com/he5050/ai-modal/commit/9c5ea30c6f6115e66dc98ac29cc6df78c926ddfc))
* 添加 debounced 搜索与技能安装优化 ([64b433b](https://github.com/he5050/ai-modal/commit/64b433bebc83183e52ff20ec8339d2316cd6de0b))
* 添加图标并调整样式 ([ef29e8b](https://github.com/he5050/ai-modal/commit/ef29e8b867c91efbf6cbfacfa236607979bb8897))
* 添加模型支持的协议检测与展示 ([b3260d6](https://github.com/he5050/ai-modal/commit/b3260d6d29207a6de008163c693b5e991b466932))
* 添加测试支持与配置模块化 ([154df69](https://github.com/he5050/ai-modal/commit/154df69cde17868218a050f24634e7cf6481e6dc))
* 统一按钮样式并添加删除功能 ([cfdf2a5](https://github.com/he5050/ai-modal/commit/cfdf2a5d38e9c8e731fcc0eec523ea9117d512a1))

# [0.4.0](https://github.com/he5050/ai-modal/compare/v0.3.2...v0.4.0) (2026-04-20)


### Features

* 增加协议测试结果和配置文件管理增强 ([9c5ea30](https://github.com/he5050/ai-modal/commit/9c5ea30c6f6115e66dc98ac29cc6df78c926ddfc))
* 添加 debounced 搜索与技能安装优化 ([64b433b](https://github.com/he5050/ai-modal/commit/64b433bebc83183e52ff20ec8339d2316cd6de0b))
* 添加图标并调整样式 ([ef29e8b](https://github.com/he5050/ai-modal/commit/ef29e8b867c91efbf6cbfacfa236607979bb8897))
* 添加模型支持的协议检测与展示 ([b3260d6](https://github.com/he5050/ai-modal/commit/b3260d6d29207a6de008163c693b5e991b466932))
* 添加测试支持与配置模块化 ([154df69](https://github.com/he5050/ai-modal/commit/154df69cde17868218a050f24634e7cf6481e6dc))
* 统一按钮样式并添加删除功能 ([cfdf2a5](https://github.com/he5050/ai-modal/commit/cfdf2a5d38e9c8e731fcc0eec523ea9117d512a1))

## [0.3.2](https://github.com/he5050/ai-modal/compare/v0.4.0...v0.3.2) (2026-04-07)

## 0.3.1 (2026-04-01)
