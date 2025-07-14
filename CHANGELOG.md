# 更新日志 (Changelog)

本文档记录了 Electron Awesome Compressor 项目的所有重要更改。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，并且本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [1.1.0] - 2025-01-XX

### 🆕 新增 (Added)

- 集成 browser-compress-image 项目的最新代码和功能
- 新的现代化用户界面设计和样式系统
- 改进的响应式设计，更好支持不同屏幕尺寸
- 优化的拖拽和粘贴交互体验
- 更详细的压缩进度和状态显示

### ✨ 改进 (Changed)

- **重大更新**：将应用副标题更新为 "Compress your images with ease, right in your browser • Support batch processing"
- 简化了浏览器端压缩 API 调用，移除了过时的 `toolConfigs` 参数
- 优化了压缩算法选择逻辑，提高压缩效率
- 改进了错误处理机制，提供更好的用户反馈
- 更新了 TypeScript 类型定义，提高代码类型安全性
- 优化了构建配置，排除了备份文件的类型检查

### 🛠️ 修复 (Fixed)

- 修复了所有 TypeScript 编译错误和警告
- 解决了 Vue 3 Composition API 导入缺失的问题
- 修复了 JSZip 类型定义冲突
- 移除了未使用的变量和函数，清理代码
- 修复了拖拽功能中的类型错误

### 🔧 技术改进 (Technical)

- 添加了正确的 Vue 3 Composition API 导入 (`ref`, `computed`, `onMounted`, `onUnmounted`, `nextTick`)
- 移除了过时的 `@types/jszip` 依赖，使用 JSZip 内置类型
- 更新了 `tsconfig.web.json` 以排除备份文件
- 改进了代码结构和模块化
- 优化了 IPC 通信和 Presenter 模式实现

### 🔒 保留功能 (Preserved)

本次更新确保了所有 Electron 特有功能的完整保留：

- ✅ **macOS 原生支持**：透明标题栏、拖拽区域、应用生命周期
- ✅ **预览窗口系统**：独立的图片对比预览窗口
- ✅ **Node.js 压缩引擎**：后台多线程压缩处理
- ✅ **自定义文件协议**：安全的 `eacompressor-file://` 协议支持
- ✅ **Presenter 架构模式**：清晰的进程间通信和业务逻辑分离
- ✅ **工具配置系统**：TinyPNG 等外部工具的 API 配置
- ✅ **本地存储**：用户设置和配置的持久化

### 📚 文档更新 (Documentation)

- 更新了 README.md，添加了详细的集成说明
- 创建了本 CHANGELOG.md 文档
- 添加了技术实现细节和代码示例
- 更新了 CLAUDE.md 开发指南

### 🧪 开发体验 (Developer Experience)

- 改进了类型检查流程，确保代码质量
- 优化了构建流程，提高开发效率
- 更新了依赖管理，移除了冲突和过时的包
- 添加了更严格的 ESLint 规则

---

## [1.0.1] - 之前版本

### 基础功能

- 图片压缩核心功能
- 多压缩引擎支持
- Electron 桌面应用框架
- Vue 3 + TypeScript 前端
- Presenter 模式架构

---

## 版本说明

### 版本号格式

本项目使用 [语义化版本](https://semver.org/spec/v2.0.0.html) 格式：`主版本号.次版本号.修订号`

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 更新类型

- **🆕 新增 (Added)**：新功能
- **✨ 改进 (Changed)**：现有功能的变更
- **🛠️ 修复 (Fixed)**：错误修复
- **❌ 废弃 (Deprecated)**：即将移除的功能
- **🗑️ 移除 (Removed)**：已移除的功能
- **🔒 安全 (Security)**：安全相关的修复

### 支持政策

- 当前主版本：完全支持，持续更新
- 上一个主版本：安全修复和重要错误修复
- 更早版本：不再支持

---

更多信息请查看项目的 [发布页面](https://github.com/awesome-compressor/electron-awesome-compressor/releases)。
