<template>
  <div class="preview-container">
    <!-- Loading state -->
    <div v-if="!previewData" class="loading-state">
      <el-icon class="is-loading" size="40px">
        <Loading />
      </el-icon>
      <div class="loading-text">Loading comparison data...</div>
    </div>

    <!-- Comparison view -->
    <div v-else class="comparison-view">
      <!-- Header with image info -->
      <div class="comparison-header">
        <div class="image-info">
          <h2 class="image-title">{{ previewData.originalImage.name }}</h2>
          <div class="comparison-stats">
            <div class="original-info">
              <span class="label">Original:</span>
              <span class="size">{{ formatFileSize(previewData.originalImage.size) }}</span>
            </div>
            <div class="arrow">→</div>
            <div class="compressed-info">
              <span class="label">Compressed ({{ previewData.compressedImage.tool }}):</span>
              <span class="size">{{ formatFileSize(previewData.compressedImage.size) }}</span>
              <span class="ratio" :class="{ 'positive': previewData.compressedImage.ratio > 0 }">
                {{ previewData.compressedImage.ratio > 0 ? '-' : '+' }}{{ Math.abs(previewData.compressedImage.ratio).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <button class="tool-btn" @click="downloadCompressed">
            <el-icon><Download /></el-icon>
            Download Compressed
          </button>
          <button class="tool-btn close-btn" @click="closeWindow">
            <el-icon><CloseBold /></el-icon>
            Close
          </button>
        </div>
      </div>

      <!-- Image comparison slider -->
      <div class="comparison-container">
        <img-comparison-slider
          v-if="previewData.originalImage.url && previewData.compressedImage.url"
          class="comparison-slider"
          value="50"
        >
          <!-- eslint-disable -->
          <img
            slot="first"
            :src="previewData.originalImage.url"
            alt="Original Image"
            class="comparison-image"
            loading="eager"
            decoding="sync"
            @load="optimizeImageRendering"
          />
          <img
            slot="second"
            :src="previewData.compressedImage.url"
            alt="Compressed Image"
            class="comparison-image"
            loading="eager"
            decoding="sync"
            @load="optimizeImageRendering"
          />
          <!-- eslint-enable -->
        </img-comparison-slider>

        <!-- Image labels -->
        <div class="image-labels">
          <div class="label-left">Original</div>
          <div class="label-right">Compressed</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElIcon, ElMessage } from 'element-plus'
import { Loading, Download, CloseBold } from '@element-plus/icons-vue'
import { download } from 'lazy-js-utils'
import 'img-comparison-slider/dist/styles.css'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 预览数据接口
interface PreviewData {
  originalImage: {
    url: string
    name: string
    size: number
  }
  compressedImage: {
    url: string
    tool: string
    size: number
    ratio: number
  }
}

// 响应式数据
const previewData = ref<PreviewData | null>(null)

// 监听来自主进程的预览数据
onMounted(() => {
  // 监听预览数据
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.on('preview-data', (_event, data: PreviewData) => {
      console.log('Received preview data:', data)
      previewData.value = data
    })
  }
})

onUnmounted(() => {
  // 清理事件监听器
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('preview-data')
  }
})

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// 优化图片渲染
function optimizeImageRendering(): void {
  console.log('Optimizing image rendering for comparison')

  setTimeout(() => {
    const images = document.querySelectorAll('.comparison-image')
    images.forEach((img) => {
      if (img instanceof HTMLImageElement) {
        img.style.transform = 'translateZ(0)'
        img.style.backfaceVisibility = 'hidden'
        img.style.imageRendering = 'crisp-edges'
        img.style.opacity = '1'
        img.style.visibility = 'visible'
        img.style.transition = 'none'
      }
    })

    const slider = document.querySelector('img-comparison-slider')
    if (slider instanceof HTMLElement) {
      slider.style.opacity = '1'
      slider.style.visibility = 'visible'
      slider.style.transition = 'none'
    }
  }, 50)
}

// 下载压缩后的图片
async function downloadCompressed(): Promise<void> {
  if (!previewData.value) return

  try {
    const originalName = previewData.value.originalImage.name
    const lastDotIndex = originalName.lastIndexOf('.')
    const nameWithoutExt = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName
    const extension = lastDotIndex > 0 ? originalName.substring(lastDotIndex) : ''
    const compressedFileName = `${nameWithoutExt}_${previewData.value.compressedImage.tool}${extension}`

    download(previewData.value.compressedImage.url, compressedFileName)

    ElMessage({
      message: `Downloaded: ${compressedFileName}`,
      type: 'success',
      duration: 2000,
    })
  } catch (error) {
    console.error('Download failed:', error)
    ElMessage({
      message: 'Download failed. Please try again.',
      type: 'error',
    })
  }
}

// 关闭窗口
function closeWindow(): void {
  window.close()
}
</script>

<style scoped>
.preview-container {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Loading state */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  gap: 16px;
}

.loading-text {
  font-size: 18px;
  font-weight: 500;
}

/* Comparison view */
.comparison-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
}

/* Header */
.comparison-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.image-info {
  flex: 1;
}

.image-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: white;
}

.comparison-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.original-info,
.compressed-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.label {
  opacity: 0.9;
}

.size {
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.ratio {
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.ratio.positive {
  color: #4ade80;
}

.arrow {
  opacity: 0.7;
  font-size: 16px;
}

/* Toolbar */
.toolbar {
  display: flex;
  gap: 8px;
}

.tool-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

.close-btn {
  border-color: rgba(239, 68, 68, 0.3);
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

/* Comparison container */
.comparison-container {
  flex: 1;
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.comparison-slider {
  width: 100%;
  height: 100%;
  --divider-width: 3px;
  --divider-color: rgba(255, 255, 255, 0.8);
  --default-handle-width: 48px;
  --default-handle-color: rgba(255, 255, 255, 0.9);
}

.comparison-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.05);
  /* 防闪烁优化 */
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  /* 渲染优化 */
  transform: translateZ(0);
  backface-visibility: hidden;
  image-rendering: crisp-edges;
  -webkit-backface-visibility: hidden;
}

/* Image labels */
.image-labels {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 20px;
  color: white;
  pointer-events: none;
}

.label-left,
.label-right {
  font-size: 16px;
  font-weight: 600;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Slider custom styles */
:deep(.comparison-slider .handle) {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

:deep(.comparison-slider .handle:hover) {
  transform: scale(1.1);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.3);
}

:deep(.comparison-slider .divider) {
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

/* 全局防闪烁规则 */
img-comparison-slider,
img-comparison-slider *,
.comparison-image,
.comparison-slider {
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  -webkit-filter: none !important;
}

/* 防止浏览器默认的图片加载动画 */
img-comparison-slider img {
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  -webkit-filter: none !important;
  transform: translateZ(0) !important;
  will-change: auto !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .comparison-view {
    padding: 10px;
    gap: 10px;
  }

  .comparison-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .comparison-stats {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .toolbar {
    justify-content: center;
  }

  .image-title {
    font-size: 16px;
  }

  .tool-btn {
    padding: 10px 14px;
  }
}
</style>
