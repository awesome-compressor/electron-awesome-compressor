# 🚀 Electron 多媒体压缩工具

一个基于 [browser-compress-image](https://github.com/awesome-compressor/browser-compress-image) 库构建的强大桌面多媒体文件压缩应用。使用 Electron + Vue 3 + TypeScript 打造，提供现代化的用户界面和高效的压缩算法。

![Cover](https://github.com/user-attachments/assets/61a702d6-e313-4b35-ba0c-c2f2f4779613)

## ✨ 特性

🖼️ **多格式图片压缩**

- 支持 JPEG、PNG、WebP、GIF 等主流图片格式
- 智能压缩算法，最优质量与文件大小平衡
- 保留图片 EXIF 信息（可选）

🛠️ **多引擎压缩**

- Browser Image Compression - 快速压缩，兼容性好
- CompressorJS - 轻量级，配置灵活
- Canvas - 原生浏览器 API，通用性强
- Gifsicle - GIF 专用压缩引擎

🎯 **智能优化**

- 自动选择最佳压缩工具
- 实时压缩效果预览
- 批量文件处理支持

💻 **桌面应用优势**

- 本地处理，保护隐私安全
- 无需网络连接
- 系统集成，拖拽操作
- 跨平台支持（Windows、macOS、Linux）

## 📸 应用截图

_即将添加应用界面截图_

## 🚀 快速开始

### 环境要求

- Node.js 16.0+
- pnpm

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/electron-awesome-compressor.git
cd electron-awesome-compressor

# 安装依赖
pnpm install
```

### 开发

```bash
# 启动开发服务器
pnpm dev
```

### 构建

```bash
# Windows 构建
pnpm build:win

# macOS 构建
pnpm build:mac

# Linux 构建
pnpm build:linux

```

## 🎯 使用方法

### 基本使用

1. **启动应用** - 运行 `pnpm dev` 或打开构建后的应用
2. **导入文件** - 拖拽图片文件到应用窗口或点击选择文件
3. **设置参数** - 调整压缩质量、输出格式等参数
4. **开始压缩** - 点击压缩按钮，等待处理完成
5. **保存结果** - 选择保存位置，导出压缩后的文件

### 压缩参数

| 参数      | 范围          | 默认值 | 说明                     |
| --------- | ------------- | ------ | ------------------------ |
| 压缩质量  | 0.1 - 1.0     | 0.8    | 值越小文件越小，质量越低 |
| 保留 EXIF | 布尔值        | false  | 是否保留图片元数据信息   |
| 输出格式  | JPEG/PNG/WebP | 原格式 | 压缩后的文件格式         |

### 支持格式

#### 输入格式

| 格式 | 扩展名      | 压缩引擎    | EXIF 支持 |
| ---- | ----------- | ----------- | --------- |
| JPEG | .jpg, .jpeg | ✅ 多引擎   | ✅        |
| PNG  | .png        | ✅ 多引擎   | ✅        |
| WebP | .webp       | ✅ Canvas   | ❌        |
| GIF  | .gif        | ✅ Gifsicle | ❌        |

#### 输出格式

- **Blob** - 二进制对象，用于内存处理
- **File** - 文件对象，保留原始文件名
- **Base64** - 编码字符串，便于传输显示
- **ArrayBuffer** - 二进制缓冲区，底层数据处理

## 🔧 技术栈

### 核心框架

- **Electron** - 跨平台桌面应用框架
- **Vue 3** - 渐进式前端框架
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 现代化构建工具

### 压缩引擎

- **browser-image-compression** - 主要图片压缩库
- **compressorjs** - 轻量级压缩工具
- **gifsicle-wasm-browser** - GIF 专用压缩

### UI 和样式

- **UnoCSS** - 原子化 CSS 引擎
- **Vue Router** - 单页面路由管理
- **Composables** - Vue 3 组合式 API

## 📊 压缩效果

根据 browser-compress-image 库的测试数据，压缩效果显著：

- **JPEG 图片**：平均压缩率 60-80%
- **PNG 图片**：平均压缩率 40-70%
- **GIF 动图**：平均压缩率 30-50%

_实际效果取决于图片内容、质量设置和原始文件大小_

## 🛣️ 开发计划

### 当前版本 (v1.0)

- ✅ 图片压缩核心功能
- ✅ 多压缩引擎支持
- ✅ 基础用户界面
- ✅ 批量处理支持

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献

1. **Fork 项目** - 点击右上角 Fork 按钮
2. **克隆仓库** - `git clone https://github.com/your-username/electron-awesome-compressor.git`
3. **创建分支** - `git checkout -b feature/amazing-feature`
4. **提交更改** - `git commit -m 'Add amazing feature'`
5. **推送分支** - `git push origin feature/amazing-feature`
6. **提交 PR** - 在 GitHub 上创建 Pull Request

### 开发规范

- 遵循 ESLint 代码规范
- 使用 TypeScript 编写类型安全的代码
- 注释和提交信息使用英文
- 确保代码可读性和可维护性

### 报告问题

发现 Bug 或有功能建议？请在 [Issues](https://github.com/your-username/electron-awesome-compressor/issues) 页面提交。

## 📄 许可证

MIT License © 2025 [awesome-compressor]

本项目基于 [browser-compress-image](https://github.com/awesome-compressor/browser-compress-image) 构建，感谢原作者的贡献。

## 🙏 致谢

### 核心依赖

- [browser-compress-image](https://github.com/awesome-compressor/browser-compress-image) - 图片压缩核心库
- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [Vue 3](https://vuejs.org/) - 现代前端框架
- [Vite](https://vitejs.dev/) - 快速构建工具

### 开发工具

- [TypeScript](https://typescriptlang.org/) - 类型安全
- [UnoCSS](https://unocss.dev/) - 原子化 CSS
- [ESLint](https://eslint.org/) - 代码质量检查

---

如果这个项目对您有帮助，请给个 ⭐️ 支持一下！

Made with ❤️ for better media compression experience.
