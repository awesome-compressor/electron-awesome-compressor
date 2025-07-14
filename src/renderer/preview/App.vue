<template>
  <div class="preview-container" :class="{ fullscreen: isFullscreen }">
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
      <div class="comparison-header" :class="{ 'header-hidden': isFullscreen && !showControls }">
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
              <span class="ratio" :class="{ positive: previewData.compressedImage.ratio > 0 }">
                {{ previewData.compressedImage.ratio > 0 ? '-' : '+'
                }}{{ Math.abs(previewData.compressedImage.ratio).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Image comparison area -->
      <div class="comparison-container" @mousemove="handleMouseMove" @mouseleave="handleMouseLeave">
        <!-- Slider comparison mode -->
        <div v-if="currentMode === 'slider'" class="comparison-mode slider-mode">
          <img-comparison-slider
            v-if="previewData.originalImage.url && previewData.compressedImage.url"
            class="comparison-slider"
            value="50"
          >
            <template #first>
              <img
                :src="previewData.originalImage.url"
                alt="Original Image"
                class="comparison-image"
                loading="eager"
                decoding="sync"
                @load="optimizeImageRendering"
              />
            </template>
            <template #second>
              <img
                :src="previewData.compressedImage.url"
                alt="Compressed Image"
                class="comparison-image"
                loading="eager"
                decoding="sync"
                @load="optimizeImageRendering"
              />
            </template>
          </img-comparison-slider>
        </div>

        <!-- Side-by-side comparison mode -->
        <div v-else-if="currentMode === 'sideBySide'" class="comparison-mode sidebyside-mode">
          <div class="image-panel">
            <img
              :src="previewData.originalImage.url"
              alt="Original Image"
              class="comparison-image"
              :style="getImageStyle()"
              @load="optimizeImageRendering"
            />
            <div class="image-label">Original</div>
          </div>
          <div class="image-panel">
            <img
              :src="previewData.compressedImage.url"
              alt="Compressed Image"
              class="comparison-image"
              :style="getImageStyle()"
              @load="optimizeImageRendering"
            />
            <div class="image-label">Compressed</div>
          </div>
        </div>

        <!-- Toggle comparison mode -->
        <div v-else-if="currentMode === 'toggle'" class="comparison-mode toggle-mode">
          <div class="image-container">
            <img
              :src="
                showOriginalInToggle
                  ? previewData.originalImage.url
                  : previewData.compressedImage.url
              "
              :alt="showOriginalInToggle ? 'Original Image' : 'Compressed Image'"
              class="comparison-image"
              :style="getImageStyle()"
              @load="optimizeImageRendering"
            />
            <div class="toggle-label">
              {{ showOriginalInToggle ? 'Original' : 'Compressed' }}
            </div>
          </div>
        </div>

        <!-- Overlay comparison mode -->
        <div v-else-if="currentMode === 'overlay'" class="comparison-mode overlay-mode">
          <div class="image-container">
            <img
              :src="previewData.originalImage.url"
              alt="Original Image"
              class="comparison-image base-image"
              :style="getImageStyle()"
              @load="optimizeImageRendering"
            />
            <img
              :src="previewData.compressedImage.url"
              alt="Compressed Image"
              class="comparison-image overlay-image"
              :style="{ ...getImageStyle(), opacity: overlayOpacity }"
              @load="optimizeImageRendering"
            />
            <div class="overlay-controls">
              <input
                v-model.number="overlayOpacity"
                type="range"
                min="0"
                max="1"
                step="0.1"
                class="opacity-slider"
              />
              <span class="opacity-label">Overlay: {{ Math.round(overlayOpacity * 100) }}%</span>
            </div>
          </div>
        </div>

        <!-- Zoom and pan controls -->
        <div v-if="zoomLevel > 1" class="zoom-info">Zoom: {{ Math.round(zoomLevel * 100) }}%</div>
      </div>

      <!-- Bottom toolbar -->
      <div class="bottom-toolbar" :class="{ 'toolbar-hidden': isFullscreen && !showControls }">
        <div class="toolbar-content">
          <div class="toolbar-left">
            <button
              class="tool-btn compact"
              :title="getComparisonModeTitle()"
              @click="toggleComparisonMode"
            >
              <el-icon><component :is="getComparisonModeIcon()" /></el-icon>
              <span class="btn-text">{{ getComparisonModeText() }}</span>
            </button>
            <button
              class="tool-btn compact"
              :title="isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen (F11)'"
              @click="toggleFullscreen"
            >
              <el-icon><component :is="isFullscreen ? 'SemiSelect' : 'FullScreen'" /></el-icon>
              <span class="btn-text">{{ isFullscreen ? 'Exit' : 'Full' }}</span>
            </button>
          </div>
          <div class="toolbar-right">
            <button
              class="tool-btn compact"
              :title="'Show/Hide Help (H)'"
              @click="showHelp = !showHelp"
            >
              <el-icon><QuestionFilled /></el-icon>
              <span class="btn-text">Help</span>
            </button>
            <button
              class="tool-btn compact"
              :title="'Download Compressed Image'"
              @click="downloadCompressed"
            >
              <el-icon><Download /></el-icon>
              <span class="btn-text">Save</span>
            </button>
            <button
              class="tool-btn compact close-btn"
              :title="'Close Window (ESC)'"
              @click="closeWindow"
            >
              <el-icon><Close /></el-icon>
              <span class="btn-text">Close</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Keyboard shortcuts help -->
      <div v-if="showHelp" class="help-panel">
        <h3>Keyboard Shortcuts</h3>
        <div class="shortcut-list">
          <div class="shortcut-item">
            <kbd>ESC</kbd>
            <span>Exit fullscreen / Close window</span>
          </div>
          <div class="shortcut-item">
            <kbd>F11</kbd>
            <span>Toggle fullscreen</span>
          </div>
          <div class="shortcut-item">
            <kbd>Space</kbd>
            <span>Toggle comparison mode</span>
          </div>
          <div class="shortcut-item">
            <kbd>←</kbd> / <kbd>→</kbd>
            <span>Quick toggle in toggle mode</span>
          </div>
          <div class="shortcut-item">
            <kbd>+</kbd> / <kbd>-</kbd>
            <span>Zoom in / out</span>
          </div>
          <div class="shortcut-item">
            <kbd>0</kbd>
            <span>Reset zoom</span>
          </div>
          <div class="shortcut-item">
            <kbd>H</kbd>
            <span>Toggle help</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElIcon, ElMessage } from 'element-plus'
import { Loading, Download, QuestionFilled, Close } from '@element-plus/icons-vue'
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
const isFullscreen = ref(false)
const showControls = ref(true)
const showHelp = ref(false)
const currentMode = ref<'slider' | 'sideBySide' | 'toggle' | 'overlay'>('slider')
const showOriginalInToggle = ref(true)
const overlayOpacity = ref(0.5)
const zoomLevel = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)
const controlsTimeout = ref<number | null>(null)

// 对比模式配置
const comparisonModes = ['slider', 'sideBySide', 'toggle', 'overlay'] as const

// 监听来自主进程的预览数据
onMounted(() => {
  // 监听预览数据
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.on('preview-data', (_event, data: PreviewData) => {
      console.log('Received preview data:', data)
      previewData.value = data
    })
  }

  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('wheel', handleWheel, { passive: false })
  window.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)

  // 添加全屏状态监听
  window.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  // 清理事件监听器
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.removeAllListeners('preview-data')
  }

  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('wheel', handleWheel)
  window.removeEventListener('mousedown', handleMouseDown)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('fullscreenchange', handleFullscreenChange)

  if (controlsTimeout.value) {
    clearTimeout(controlsTimeout.value)
  }
})

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape':
      if (isFullscreen.value) {
        exitFullscreen()
      } else {
        closeWindow()
      }
      break
    case 'F11':
      event.preventDefault()
      toggleFullscreen()
      break
    case ' ':
      event.preventDefault()
      toggleComparisonMode()
      break
    case 'ArrowLeft':
      if (currentMode.value === 'toggle') {
        showOriginalInToggle.value = true
      }
      break
    case 'ArrowRight':
      if (currentMode.value === 'toggle') {
        showOriginalInToggle.value = false
      }
      break
    case '+':
    case '=':
      zoomIn()
      break
    case '-':
      zoomOut()
      break
    case '0':
      resetZoom()
      break
    case 'h':
    case 'H':
      showHelp.value = !showHelp.value
      break
  }
}

// 鼠标滚轮缩放
function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    zoomLevel.value = Math.max(0.1, Math.min(5, zoomLevel.value + delta))
  }
}

// 鼠标拖拽处理
function handleMouseDown(event: MouseEvent): void {
  if (zoomLevel.value > 1 && event.button === 0) {
    isDragging.value = true
    lastMouseX.value = event.clientX
    lastMouseY.value = event.clientY
    document.body.style.cursor = 'grabbing'
  }
}

function handleMouseMove(event: MouseEvent): void {
  if (isDragging.value) {
    const deltaX = event.clientX - lastMouseX.value
    const deltaY = event.clientY - lastMouseY.value

    panX.value += deltaX
    panY.value += deltaY

    lastMouseX.value = event.clientX
    lastMouseY.value = event.clientY
  }

  // 显示控制栏
  if (isFullscreen.value) {
    showControls.value = true
    if (controlsTimeout.value) {
      clearTimeout(controlsTimeout.value)
    }
    controlsTimeout.value = setTimeout(() => {
      showControls.value = false
    }, 3000)
  }
}

function handleMouseUp(): void {
  isDragging.value = false
  document.body.style.cursor = 'default'
}

function handleMouseLeave(): void {
  isDragging.value = false
  document.body.style.cursor = 'default'
}

// 全屏处理
function handleFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement !== null
}

function toggleFullscreen(): void {
  if (isFullscreen.value) {
    exitFullscreen()
  } else {
    enterFullscreen()
  }
}

function enterFullscreen(): void {
  document.documentElement.requestFullscreen()
}

function exitFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  }
}

// 对比模式切换
function toggleComparisonMode(): void {
  const currentIndex = comparisonModes.indexOf(currentMode.value)
  const nextIndex = (currentIndex + 1) % comparisonModes.length
  currentMode.value = comparisonModes[nextIndex]
}

function getComparisonModeTitle(): string {
  const titles = {
    slider: 'Slider Comparison',
    sideBySide: 'Side-by-Side Comparison',
    toggle: 'Toggle Comparison',
    overlay: 'Overlay Comparison'
  }
  return titles[currentMode.value]
}

function getComparisonModeIcon(): string {
  const icons = {
    slider: 'Grid',
    sideBySide: 'View',
    toggle: 'Monitor',
    overlay: 'Document'
  }
  return icons[currentMode.value]
}

function getComparisonModeText(): string {
  const texts = {
    slider: 'Slider',
    sideBySide: 'Side',
    toggle: 'Toggle',
    overlay: 'Overlay'
  }
  return texts[currentMode.value]
}

// 缩放控制
function zoomIn(): void {
  zoomLevel.value = Math.min(5, zoomLevel.value + 0.2)
}

function zoomOut(): void {
  zoomLevel.value = Math.max(0.1, zoomLevel.value - 0.2)
}

function resetZoom(): void {
  zoomLevel.value = 1
  panX.value = 0
  panY.value = 0
}

// 获取图片样式
function getImageStyle(): Record<string, string> {
  return {
    transform: `scale(${zoomLevel.value}) translate(${panX.value}px, ${panY.value}px)`,
    transformOrigin: 'center center',
    cursor: zoomLevel.value > 1 ? 'grab' : 'default'
  }
}

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
      duration: 2000
    })
  } catch (error) {
    console.error('Download failed:', error)
    ElMessage({
      message: 'Download failed. Please try again.',
      type: 'error'
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
  position: relative;
}

.preview-container.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
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
  position: relative;
  padding-bottom: 80px; /* Space for bottom toolbar */
}

.preview-container.fullscreen .comparison-view {
  padding: 0;
  padding-bottom: 60px; /* Space for bottom toolbar in fullscreen */
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
  transition: all 0.3s ease;
}

.preview-container.fullscreen .comparison-header {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  z-index: 100;
  border-radius: 8px;
}

.comparison-header.header-hidden {
  opacity: 0;
  pointer-events: none;
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

/* Bottom toolbar */
.bottom-toolbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 20px;
  transition: all 0.3s ease;
  z-index: 100;
}

.preview-container.fullscreen .bottom-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
}

.bottom-toolbar.toolbar-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(100%);
}

.toolbar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
}

.tool-btn.compact {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  min-width: 60px;
  justify-content: center;
}

.tool-btn.compact:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

.tool-btn.compact.close-btn {
  border-color: rgba(239, 68, 68, 0.3);
}

.tool-btn.compact.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.btn-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Responsive bottom toolbar */
@media (max-width: 768px) {
  .bottom-toolbar {
    padding: 8px 12px;
  }

  .toolbar-content {
    flex-direction: column;
    gap: 8px;
  }

  .toolbar-left,
  .toolbar-right {
    width: 100%;
    justify-content: center;
  }

  .tool-btn.compact {
    min-width: 50px;
    padding: 4px 8px;
    font-size: 11px;
  }

  .btn-text {
    display: none;
  }
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.preview-container.fullscreen .comparison-container {
  border-radius: 0;
  border: none;
  flex: 1;
  padding: 0;
}

.comparison-mode {
  width: 100%;
  height: 100%;
  position: relative;
  max-width: 1200px; /* 设置最大宽度 */
  max-height: 800px; /* 设置最大高度 */
  aspect-ratio: 16/10; /* 设置宽高比 */
  margin: 0 auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

.preview-container.fullscreen .comparison-mode {
  max-width: 90vw;
  max-height: 80vh;
  aspect-ratio: auto; /* 全屏时不限制宽高比 */
}

/* Slider mode */
.slider-mode .comparison-slider {
  width: 100%;
  height: 100%;
  --divider-width: 3px;
  --divider-color: rgba(255, 255, 255, 0.8);
  --default-handle-width: 48px;
  --default-handle-color: rgba(255, 255, 255, 0.9);
}

/* Side-by-side mode */
.sidebyside-mode {
  display: flex;
  gap: 2px;
  width: 100%;
  height: 100%;
}

.image-panel {
  flex: 1;
  position: relative;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  overflow: hidden;
}

.image-panel .comparison-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.image-label {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Toggle mode */
.toggle-mode .image-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.toggle-mode .comparison-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.toggle-label {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-size: 18px;
  font-weight: 700;
  padding: 8px 20px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

/* Overlay mode */
.overlay-mode .image-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.overlay-mode .comparison-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.overlay-mode .base-image {
  z-index: 1;
}

.overlay-mode .overlay-image {
  z-index: 2;
}

.overlay-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 10;
}

.opacity-slider {
  width: 100px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.opacity-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.opacity-label {
  color: white;
  font-size: 12px;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  white-space: nowrap;
}

/* Zoom info */
.zoom-info {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  z-index: 10;
}

/* Help panel */
.help-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 24px;
  color: white;
  z-index: 1000;
  min-width: 300px;
}

.help-panel h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.shortcut-item kbd {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 4px 8px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  font-size: 12px;
  font-weight: 500;
  min-width: 32px;
  text-align: center;
}

.shortcut-item span {
  font-size: 14px;
  opacity: 0.9;
}

/* Image styles */
.comparison-image {
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
  /* 图片显示优化 */
  border-radius: 4px;
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
    padding-bottom: 70px;
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

  .image-title {
    font-size: 16px;
  }

  .comparison-container {
    padding: 10px;
  }

  .comparison-mode {
    max-width: 100%;
    max-height: 60vh;
    aspect-ratio: 4/3;
  }

  .sidebyside-mode {
    flex-direction: column;
    gap: 4px;
  }

  .image-label {
    font-size: 12px;
    padding: 4px 8px;
  }

  .toggle-label {
    font-size: 16px;
    padding: 6px 16px;
  }

  .overlay-controls {
    padding: 6px 12px;
    gap: 8px;
  }

  .opacity-slider {
    width: 80px;
  }

  .opacity-label {
    font-size: 11px;
  }

  .help-panel {
    width: 90%;
    max-width: 300px;
  }
}

/* 全屏状态下的特殊样式 */
.preview-container.fullscreen {
  background: black;
}

.preview-container.fullscreen .comparison-container {
  background: transparent;
}

.preview-container.fullscreen .comparison-view {
  padding: 0;
  gap: 0;
}
</style>
