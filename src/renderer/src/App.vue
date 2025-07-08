<script setup lang="ts">
import {
  CloseBold,
  Download,
  FolderOpened,
  Loading,
  Picture,
  Upload,
} from '@element-plus/icons-vue'
import GitForkVue from '@simon_he/git-fork-vue'
import { ElMessage } from 'element-plus'
import { download } from 'lazy-js-utils'
import { computed, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { compress } from '@awesome-compressor/browser-compress-image'
import { usePresenter } from './composables/usePresenter'
import 'img-comparison-slider/dist/styles.css'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 检测是否为 macOS
const isMacOS = ref(false)

// 单个图片的状态接口
interface ImageItem {
  id: string
  file: File
  originalUrl: string
  originalSize: number
  quality: number // 压缩质量设置
  isCompressing: boolean
  compressionResults: CompressionResult[]
  compressionError?: string
}

// 压缩结果接口
interface CompressionResult {
  tool: string
  compressedUrl: string
  compressedSize: number
  compressionRatio: number
  blob: Blob | null // Node压缩结果可能为null
  isBest: boolean
}

// 响应式状态
const downloading = ref(false)
const fileRef = ref()
const isDragOver = ref(false)
const currentImageIndex = ref(0)

// Get presenter instances
const nodeCompressPresenter = usePresenter('nodeCompressPresenter')

// 图片列表状态
const imageItems = ref<ImageItem[]>([])
const supportType = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif']

// 计算属性
const hasImages = computed(() => imageItems.value.length > 0)
const currentImage = computed(() => imageItems.value[currentImageIndex.value])
const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0),
)
const totalCompressedSize = computed(() =>
  imageItems.value.reduce((sum, item) => {
    const bestResult = item.compressionResults.find(r => r.isBest)
    return sum + (bestResult?.compressedSize || 0)
  }, 0),
)
const totalCompressionRatio = computed(() => {
  if (totalOriginalSize.value === 0) return 0
  return (
    ((totalOriginalSize.value - totalCompressedSize.value) /
      totalOriginalSize.value) *
    100
  )
})
const compressedCount = computed(
  () =>
    imageItems.value.filter(
      (item) => item.compressionResults.length > 0 && !item.compressionError,
    ).length,
)
const allCompressed = computed(
  () =>
    imageItems.value.length > 0 &&
    compressedCount.value === imageItems.value.length,
)

// 检测操作系统
onMounted(() => {
  isMacOS.value = navigator.userAgent.includes('Mac')

  fileRef.value!.addEventListener('change', handleFileInputChange)

  // 添加全局拖拽事件监听
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
})

onUnmounted(() => {
  // 清理事件监听器
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)

  // 清理对象URL
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    item.compressionResults.forEach((result) => {
      URL.revokeObjectURL(result.compressedUrl)
    })
  })
})

// 拖拽事件处理
function handleDragOver(e: DragEvent): void {
  e.preventDefault()
}

function handleDragEnter(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer?.items) {
    // 检查是否包含图片文件或文件夹
    const hasImageOrFolder = Array.from(e.dataTransfer.items).some(
      (item) =>
        (item.kind === 'file' && item.type.startsWith('image/')) ||
        (item.kind === 'file' && item.type === ''),
    )
    if (hasImageOrFolder) {
      isDragOver.value = true
    }
  }
}

function handleDragLeave(e: DragEvent): void {
  e.preventDefault()
  // 只有当离开整个应用区域时才设置为false
  if (
    !e.relatedTarget ||
    !document.querySelector('.app-container')?.contains(e.relatedTarget as Node)
  ) {
    isDragOver.value = false
  }
}

async function handleDrop(e: DragEvent): Promise<void>  {
  e.preventDefault()
  isDragOver.value = false

  try {
    let files: File[] = []

    console.log('=== Drop Event Debug ===')
    console.log('dataTransfer.items:', e.dataTransfer?.items)
    console.log('dataTransfer.files:', e.dataTransfer?.files)
    console.log('items length:', e.dataTransfer?.items?.length)
    console.log('files length:', e.dataTransfer?.files?.length)

    // 首先尝试使用 DataTransferItemList API（支持文件夹）
    const items = e.dataTransfer?.items
    if (items && items.length > 0) {
      console.log('使用 DataTransferItemList API')
      files = await extractFilesFromDataTransfer(items)
      console.log(
        'extractFilesFromDataTransfer 结果:',
        files.length,
        files.map((f) => f.name),
      )
    }

    // 如果上面的方法没有获取到文件，回退到传统的 files API
    if (files.length === 0 && e.dataTransfer?.files) {
      console.log('回退到传统 files API')
      files = Array.from(e.dataTransfer.files)
      console.log(
        '传统 API 结果:',
        files.length,
        files.map((f) => f.name),
      )
    }

    if (files.length === 0) {
      console.warn('没有找到任何文件')
      ElMessage({
        message: 'No files found. Please try again.',
        type: 'warning',
      })
      return
    }

    const imageFiles = files.filter((file) => supportType.includes(file.type))
    console.log(
      '过滤后的图片文件:',
      imageFiles.length,
      imageFiles.map((f) => f.name),
    )

    if (imageFiles.length === 0) {
      ElMessage({
        message:
          'No valid image files found. Please drop PNG, JPG, JPEG, or GIF files.',
        type: 'warning',
      })
      return
    }

    await addNewImages(imageFiles)

    ElMessage({
      message: `Successfully loaded ${imageFiles.length} image(s)`,
      type: 'success',
    })
  } catch (error) {
    console.error('Error processing dropped files:', error)
    ElMessage({
      message: 'Error processing files. Please try again.',
      type: 'error',
    })
  }
}

// 从DataTransfer中提取所有文件（包括文件夹中的文件）
async function extractFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<File[]> {
  console.log('extractFilesFromDataTransfer 开始处理', items.length, '个 items')

  const promises: Promise<File[]>[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    console.log(`处理 Item ${i}:`, { kind: item.kind, type: item.type })

    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry()
      console.log(`Item ${i} webkitGetAsEntry:`, entry)

      if (entry) {
        console.log(`Item ${i} 使用 processEntry`)
        const itemFiles: File[] = []
        promises.push(
          processEntry(entry, itemFiles).then(() => {
            console.log(
              `Item ${i} processEntry 完成，文件数:`,
              itemFiles.length,
              itemFiles.map((f) => f.name),
            )
            return itemFiles
          }),
        )
      } else {
        // 回退到传统文件API - 当webkitGetAsEntry返回null时
        console.log(`Item ${i} 回退到 getAsFile`)
        const file = item.getAsFile()
        if (file) {
          console.log(`Item ${i} getAsFile 成功:`, file.name)
          promises.push(Promise.resolve([file]))
        } else {
          console.log(`Item ${i} getAsFile 失败`)
          promises.push(Promise.resolve([]))
        }
      }
    }
  }

  // 等待所有文件处理完成
  const allFileArrays = await Promise.all(promises)
  const files = allFileArrays.flat()

  console.log(
    'extractFilesFromDataTransfer 完成，总共',
    files.length,
    '个文件:',
    files.map((f) => f.name),
  )
  return files
}

// 递归处理文件和文件夹
async function processEntry(
  entry: FileSystemEntry,
  files: File[],
): Promise<void> {
  console.log(
    'processEntry 开始处理:',
    entry.name,
    entry.isFile,
    entry.isDirectory,
  )

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    console.log('处理文件:', fileEntry.name)

    try {
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      console.log('成功获取文件:', file.name, file.size, file.type)
      files.push(file)
      console.log('当前文件数组长度:', files.length)
    } catch (error) {
      console.error('获取文件失败:', fileEntry.name, error)
    }
  } else if (entry.isDirectory) {
    console.log('处理目录:', entry.name)
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })

    console.log('目录中的条目数:', entries.length)
    for (const childEntry of entries) {
      await processEntry(childEntry, files)
    }
  }

  console.log('processEntry 完成:', entry.name, '当前总文件数:', files.length)
}

// 文件输入框变化处理
async function handleFileInputChange(): Promise<void> {
  const selectedFiles = Array.from(fileRef.value.files || []) as File[]
  if (selectedFiles.length > 0) {
    try {
      const imageFiles = selectedFiles.filter((file) =>
        supportType.includes(file.type),
      )
      await addNewImages(imageFiles)

      ElMessage({
        message: `Successfully loaded ${imageFiles.length} image(s)`,
        type: 'success',
      })
    } catch (error) {
      console.error('Error processing files:', error)
      ElMessage({
        message: 'Error processing files. Please try again.',
        type: 'error',
      })
    }
  }
}

// 添加新图片到列表
async function addNewImages(files: File[]): Promise<void> {
  const newItems: ImageItem[] = files.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    originalUrl: URL.createObjectURL(file),
    originalSize: file.size,
    isCompressing: false,
    quality: 60, // 默认质量
    compressionResults: [],
  }))

  // 如果之前没有图片，默认选中第一张
  const isFirstImages = imageItems.value.length === 0

  imageItems.value.push(...newItems)

  // 默认选中第一张图片
  if (isFirstImages && newItems.length > 0) {
    currentImageIndex.value = 0
  }

  // 并行启动browser压缩和node压缩
  compressImages(newItems) // 不阻塞
  newItems.forEach(item => compressWithNode(item)) // 并行执行node压缩
}

// 压缩单个图片
async function compressImage(item: ImageItem): Promise<void> {
  if (item.isCompressing) return

  item.isCompressing = true
  item.compressionError = undefined
  // 不清空已有结果，保留Node压缩结果

  try {
    // 保留现有的 node 压缩结果（用于日志记录）
    const existingNodeResults = item.compressionResults.filter(r => r.tool.startsWith('node-'))
    if (existingNodeResults.length > 0) {
      console.log('Preserving existing node results:', existingNodeResults.length)
    }

    // 使用 @awesome-compressor/browser-compress-image 获取所有工具的压缩结果
    const allResults = await compress(item.file, {
      quality: item.quality / 100,
      preserveExif: false,
      returnAllResults: true, // 返回所有工具的结果
      type: 'blob',
    })

    console.log('Browser compression completed:')
    console.log('最优工具:', allResults.bestTool)
    console.log('最优结果:', allResults.bestResult)
    console.log('所有结果:')
    allResults.allResults.forEach((result) => {
      console.log(
        `${result.tool}: ${result.compressedSize} bytes (${result.compressionRatio.toFixed(1)}% reduction)`,
      )
    })

    // 处理所有压缩结果
    if (allResults.allResults && allResults.allResults.length > 0) {
      for (const resultItem of allResults.allResults) {
        if (resultItem && resultItem.result && resultItem.result instanceof Blob) {
          // 从结果项中提取数据
          const tool = resultItem.tool || 'unknown'
          const result = resultItem.result
          const compressedSize = resultItem.compressedSize || result.size
          const compressionRatio = resultItem.compressionRatio ||
            ((item.originalSize - result.size) / item.originalSize) * 100

          const compressedUrl = URL.createObjectURL(result)

          const newResult: CompressionResult = {
            tool,
            compressedUrl,
            compressedSize,
            compressionRatio,
            blob: result,
            isBest: false // 将在下面设置
          }

          // 移除该工具的旧结果并添加新结果
          item.compressionResults = item.compressionResults.filter(r => r.tool !== tool)
          item.compressionResults.push(newResult)

          // 每次有新结果就立即重新排序并更新显示
          sortCompressionResults(item)

          console.log(`${tool} compression completed: ${compressedSize} bytes (${compressionRatio.toFixed(1)}% reduction)`)
        } else {
          console.warn('Invalid result object:', resultItem)
        }
      }
    }

    // 为当前图片优化渲染性能
    nextTick(() => {
      optimizeImageRendering()
    })
  } catch (error) {
    console.error('Compression error:', error)
    item.compressionError =
      error instanceof Error ? error.message : 'Compression failed'
  } finally {
    item.isCompressing = false
  }
}

// 批量压缩图片
async function compressImages(items: ImageItem[] = imageItems.value): Promise<void> {
  try {
    // 并发压缩，但限制并发数量避免性能问题
    const batchSize = 3
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await Promise.all(batch.map((item) => compressImage(item)))
    }
  } catch (error) {
    console.error('Batch compression error:', error)
  }
}

// Node压缩功能（不阻塞主流程）
async function compressWithNode(item: ImageItem): Promise<void> {
  if (!item.file) return

  try {
    console.log(`Starting node compression for: ${item.file.name}`)

    // 将文件转换为ArrayBuffer，传递给主进程处理
    const arrayBuffer = await item.file.arrayBuffer()
    // 转换为 Uint8Array 以便在 IPC 中传输
    const uint8Array = new Uint8Array(arrayBuffer)

    // 使用presenter调用node压缩，传递字节数组而不是Buffer
    const result = await nodeCompressPresenter.compressImageFromBytes(
      uint8Array,
      item.file.name,
      {
        quality: item.quality / 100,
        preserveExif: false
      }
    )

    if (result && result.bestTool) {
      // 确保文件路径正确编码，避免特殊字符问题
      const encodedPath = encodeURI(result.bestFilePath)

      // 添加node压缩结果到已有结果中
      const nodeResult: CompressionResult = {
        tool: `node-${result.bestTool}`,
        compressedUrl: `eacompressor-file://${encodedPath.startsWith('/') ? encodedPath : '/' + encodedPath}`,
        compressedSize: result.allResults[0]?.compressedSize || 0,
        compressionRatio: result.compressionRatio,
        blob: null, // Node结果不是blob
        isBest: false
      }

      // 添加结果并重新排序
      item.compressionResults.push(nodeResult)
      sortCompressionResults(item)

      console.log(`Node compression completed for ${item.file.name}: ${result.compressionRatio.toFixed(1)}%`)
      console.log(`Generated protocol URL: ${nodeResult.compressedUrl}`)
      console.log(`Original file path: ${result.bestFilePath}`)
    }
  } catch (error) {
    console.error('Node compression error for', item.file.name, ':', error)
  }
}

// 对压缩结果按压缩率排序并标记最佳结果
function sortCompressionResults(item: ImageItem): void {
  if (item.compressionResults.length === 0) return

  // 按压缩率从高到低排序
  item.compressionResults.sort((a, b) => b.compressionRatio - a.compressionRatio)

  // 重新标记最佳结果
  item.compressionResults.forEach((result, index) => {
    result.isBest = index === 0
  })
}

// 单张图片质量改变处理
async function handleImageQualityChange(item: ImageItem, newQuality: number): Promise<void> {
  item.quality = newQuality
  // 并行启动browser压缩和node压缩
  compressImage(item) // 不阻塞
  compressWithNode(item) // 并行执行node压缩
}

// 优化图片渲染性能
function optimizeImageRendering(): void {
  console.log('Optimizing image rendering')
  // 实现图片渲染优化逻辑
}

// 删除单个图片
function deleteImage(index: number): void {
  const item = imageItems.value[index]
  URL.revokeObjectURL(item.originalUrl)
  item.compressionResults.forEach((result) => {
    URL.revokeObjectURL(result.compressedUrl)
  })

  imageItems.value.splice(index, 1)

  // 调整当前图片索引
  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }
}

// 清空所有图片
function clearAllImages(): void {
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    item.compressionResults.forEach((result) => {
      URL.revokeObjectURL(result.compressedUrl)
    })
  })

  imageItems.value = []
  currentImageIndex.value = 0
}

// 上传图片
function uploadImages(): void {
  document.getElementById('file')?.click()
}

// 下载单个压缩结果
async function downloadCompressionResult(item: ImageItem, result: CompressionResult): Promise<void> {
  try {
    const originalName = item.file.name
    const lastDotIndex = originalName.lastIndexOf('.')
    const nameWithoutExt =
      lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName
    const extension =
      lastDotIndex > 0 ? originalName.substring(lastDotIndex) : ''
    const compressedFileName = `${nameWithoutExt}_${result.tool}${extension}`

    download(result.compressedUrl, compressedFileName)

    ElMessage({
      message: `Downloaded: ${compressedFileName}`,
      type: 'success',
      duration: 2000,
    })
  } catch (error: unknown) {
    console.error('Download failed:', error)
    ElMessage({
      message: 'Download failed. Please try again.',
      type: 'error',
    })
  }
}

// 预览压缩结果对比
async function previewCompressionResult(item: ImageItem, result: CompressionResult): Promise<void> {
  try {
    // 通过 IPC 调用 windowPresenter 创建预览窗口
    const previewData = {
      originalImage: {
        url: item.originalUrl,
        name: item.file.name,
        size: item.originalSize
      },
      compressedImage: {
        url: result.compressedUrl,
        tool: result.tool,
        size: result.compressedSize,
        ratio: result.compressionRatio
      }
    }

    // 调用 presenter 方法
    await window.electron.ipcRenderer.invoke('presenter:call', 'windowPresenter', 'previewComparison', previewData)
  } catch (error) {
    console.error('Failed to open preview:', error)
    ElMessage({
      message: 'Failed to open preview window',
      type: 'error'
    })
  }
}

// 批量下载所有压缩结果
async function downloadAllImages(): Promise<void> {
  if (downloading.value) return

  const downloadableItems = imageItems.value.filter(
    (item) => item.compressionResults.length > 0 && !item.compressionError,
  )
  if (downloadableItems.length === 0) {
    ElMessage({
      message: 'No compressed results to download',
      type: 'warning',
    })
    return
  }

  downloading.value = true

  try {
    // 添加延迟显示加载状态
    await new Promise((resolve) => setTimeout(resolve, 300))

    for (const item of downloadableItems) {
      for (const result of item.compressionResults) {
        await downloadCompressionResult(item, result)
        // 添加小延迟避免浏览器下载限制
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    ElMessage({
      message: h('div', { style: 'line-height: 1.5;' }, [
        h(
          'div',
          { style: 'color: #16a34a; font-weight: 500; margin-bottom: 4px;' },
          `Successfully downloaded ${downloadableItems.length} results!`,
        ),
        h(
          'div',
          {
            style:
              'color: #059669; font-size: 13px; font-family: monospace; background: rgba(5, 150, 105, 0.1); padding: 2px 6px; border-radius: 4px;',
          },
          `Total saved: ${totalCompressionRatio.value.toFixed(1)}%`,
        ),
      ]),
      type: 'success',
      duration: 4000,
    })
  } catch (error: unknown) {
    console.error('Batch download failed:', error)
    ElMessage({
      message: 'Batch download failed. Please try again.',
      type: 'error',
    })
  } finally {
    downloading.value = false
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

// 切换当前预览图片
function setCurrentImage(index: number): void  {
  currentImageIndex.value = index
}
</script>

<template>
  <div class="app-container" :class="{ 'drag-over': isDragOver }">
    <!-- macOS 透明标题栏区域 -->
    <div v-if="isMacOS" class="macos-titlebar">
      <div class="titlebar-drag-region" />
    </div>

    <!-- 拖拽覆盖层 -->
    <div v-show="isDragOver" class="drag-overlay">
      <div class="drag-message">
        <el-icon class="drag-icon">
          <FolderOpened />
        </el-icon>
        <div class="drag-text">Drop images or folders here</div>
        <div class="drag-subtitle">
          Support multiple images and folder drag & drop
        </div>
      </div>
    </div>



    <!-- Background Elements -->
    <div class="bg-decoration">
      <div class="bg-circle bg-circle-1" />
      <div class="bg-circle bg-circle-2" />
      <div class="bg-circle bg-circle-3" />
    </div>

    <GitForkVue
      link="https://github.com/awesome-compressor/electron-awesome-compressor"
      position="right"
      type="corners"
      content="Star on GitHub"
      color="#667eea"
    />

    <!-- Header -->
    <header class="header-section" :class="{ 'macos-header': isMacOS }">
      <div class="title-container">
        <vivid-typing content="Browser Compress Image" class="main-title" />
        <p class="subtitle">
          Compress your images with multiple algorithms • Find the best compression
        </p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- 初始上传区域 - 仅在没有图片时显示 -->
      <section v-if="!hasImages" class="upload-zone">
        <button class="upload-btn-hero" @click="uploadImages">
          <el-icon class="upload-icon">
            <Picture />
          </el-icon>
          <span class="upload-text">Drop or Click to Upload Images</span>
          <span class="upload-hint">
            Support PNG, JPG, JPEG, GIF formats • Multiple files & folders
            supported
          </span>
        </button>
      </section>

      <!-- 简化的工具栏 - 仅在有图片时显示 -->
      <div v-if="hasImages" class="floating-toolbar">
        <div class="toolbar-section files-section">
          <div class="files-info">
            <div class="files-icon">📷</div>
            <span class="files-count">{{ imageItems.length }} image(s)</span>
            <span class="compressed-count"
              >({{ compressedCount }} compressed)</span
            >
          </div>

          <div class="action-buttons">
            <button
              class="action-btn add-btn"
              title="Add More Images"
              @click="uploadImages"
            >
              <div class="btn-icon">
                <el-icon>
                  <Upload />
                </el-icon>
              </div>
              <span class="btn-text">Add More</span>
            </button>
            <button
              class="action-btn delete-btn"
              title="Clear All Images"
              @click="clearAllImages"
            >
              <div class="btn-icon">
                <el-icon>
                  <CloseBold />
                </el-icon>
              </div>
              <span class="btn-text">Clear All</span>
            </button>
          </div>
        </div>

        <div v-if="totalCompressedSize > 0" class="toolbar-divider" />

        <div
          v-if="totalCompressedSize > 0"
          class="toolbar-section stats-section"
        >
          <div class="stats-info">
            <span class="size-label"
              >Total: {{ formatFileSize(totalOriginalSize) }} →
              {{ formatFileSize(totalCompressedSize) }}</span
            >
            <div class="savings-badge">
              <span class="saved-mini"
                >-{{ totalCompressionRatio.toFixed(1) }}%</span
              >
            </div>
          </div>
        </div>

        <div v-if="allCompressed" class="toolbar-divider" />

        <div v-if="allCompressed" class="toolbar-section download-section">
          <button
            class="download-btn-new"
            :class="[{ downloading }]"
            :disabled="downloading"
            title="Download All Best Results"
            @click="downloadAllImages"
          >
            <div class="download-btn-content">
              <div class="download-icon">
                <el-icon v-if="!downloading">
                  <Download />
                </el-icon>
                <el-icon v-else class="is-loading">
                  <Loading />
                </el-icon>
              </div>
              <span class="download-text">
                {{
                  downloading
                    ? 'Downloading...'
                    : `Download All (${compressedCount})`
                }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- 图片列表和结果区域 -->
      <section v-if="hasImages" class="images-section">
        <!-- 图片列表缩略图 -->
        <div class="images-grid">
          <div
            v-for="(item, index) in imageItems"
            :key="item.id"
            class="image-card"
            :class="{ active: index === currentImageIndex }"
            @click="setCurrentImage(index)"
          >
            <div class="image-preview">
              <img
                style="object-fit: contain"
                :src="item.originalUrl"
                :alt="item.file.name"
              />
              <div v-if="item.isCompressing" class="compressing-overlay">
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
              </div>
              <div v-if="item.compressionError" class="error-overlay">
                <span class="error-text">Error</span>
              </div>
            </div>
            <div class="image-info">
              <div class="image-name">
                {{ item.file.name }}
              </div>
              <div class="image-stats">
                <span class="original-size">{{
                  formatFileSize(item.originalSize)
                }}</span>
                <span v-if="item.compressionResults.length > 0" class="best-result">
                  Best: {{ item.compressionResults.find(r => r.isBest)?.tool }}
                </span>
              </div>
              <!-- 独立的质量控制 -->
              <div class="image-quality-control">
                <span class="quality-label-small"
                  >Quality: {{ item.quality }}%</span
                >
                <el-slider
                  v-model="item.quality"
                  :max="100"
                  :step="5"
                  class="image-quality-slider"
                  :show-tooltip="false"
                  size="small"
                  @change="(val) => handleImageQualityChange(item, val)"
                />
              </div>
            </div>
            <div class="image-actions">
              <button
                class="action-btn-small delete-single"
                title="Remove this image"
                @click.stop="deleteImage(index)"
              >
                <el-icon>
                  <CloseBold />
                </el-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- 压缩结果展示区域 -->
        <div v-if="currentImage && currentImage.compressionResults.length > 0" class="results-section">
          <div class="results-header">
            <h3 class="results-title">Compression Results for "{{ currentImage.file.name }}"</h3>
            <div class="results-stats">
              Original: {{ formatFileSize(currentImage.originalSize) }}
            </div>
          </div>

          <div class="results-grid">
                       <div
             v-for="result in currentImage.compressionResults"
             :key="result.tool"
             class="result-card"
             :class="{ 'best-result': result.isBest }"
           >
              <div class="result-preview">
                <img
                  :src="result.compressedUrl"
                  :alt="`Compressed by ${result.tool}`"
                  class="result-image"
                />
                <div v-if="result.isBest" class="best-badge">
                  👑 Best
                </div>
              </div>
              <div class="result-info">
                <div class="result-tool">{{ result.tool }}</div>
                <div class="result-stats">
                  <span class="result-size">{{ formatFileSize(result.compressedSize) }}</span>
                  <span class="result-ratio" :class="{ 'positive': result.compressionRatio > 0 }">
                    {{ result.compressionRatio > 0 ? '-' : '+' }}{{ Math.abs(result.compressionRatio).toFixed(1) }}%
                  </span>
                </div>
              </div>
              <div class="result-actions">
                <button
                  class="action-btn-small preview-btn"
                  title="Preview comparison"
                  @click="previewCompressionResult(currentImage, result)"
                >
                  <el-icon>
                    <Picture />
                  </el-icon>
                </button>
                <button
                  class="action-btn-small download-btn"
                  title="Download this result"
                  @click="downloadCompressionResult(currentImage, result)"
                >
                  <el-icon>
                    <Download />
                  </el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <input
      id="file"
      ref="fileRef"
      type="file"
      accept="image/*"
      multiple
      hidden
    />
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow: hidden;
  /* 优化滚动性能 */
  -webkit-overflow-scrolling: touch;
  /* 减少重绘 */
  transform: translateZ(0);
  will-change: scroll-position;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.app-container.drag-over {
  background: linear-gradient(135deg, #667eea 20%, #764ba2 80%);
}

/* macOS 透明标题栏 */
.macos-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: transparent;
  z-index: 9999;
  -webkit-app-region: drag;
  -webkit-user-select: none;
  user-select: none;
}

.titlebar-drag-region {
  width: 100%;
  height: 100%;
  position: absolute;
}

/* macOS 标题调整 */
.macos-header {
  padding-top: 40px; /* 为标题栏留空间 */
}

.macos-header .title-container {
  -webkit-app-region: drag;
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(102, 126, 234, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

.drag-message {
  text-align: center;
  color: white;
  padding: 40px;
  border: 3px dashed rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 480px;
  margin: 0 auto;
}

.drag-icon {
  font-size: 64px;
  opacity: 0.9;
  display: block;
}

.drag-text {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}

.drag-subtitle {
  font-size: 14px;
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.6;
  margin: 0;
  text-align: center;
  max-width: 320px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Background Decoration */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.1),
    rgba(255, 255, 255, 0.05)
  );
  animation: float 6s ease-in-out infinite;
}

.bg-circle-1 {
  width: 300px;
  height: 300px;
  top: 10%;
  left: -5%;
  animation-delay: 0s;
}

.bg-circle-2 {
  width: 200px;
  height: 200px;
  top: 60%;
  right: -5%;
  animation-delay: 2s;
}

.bg-circle-3 {
  width: 150px;
  height: 150px;
  top: 80%;
  left: 20%;
  animation-delay: 4s;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0px) rotate(0deg);
  }

  33% {
    transform: translateY(-20px) rotate(120deg);
  }

  66% {
    transform: translateY(10px) rotate(240deg);
  }
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.95),
    rgba(118, 75, 162, 0.95)
  );
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  text-align: center;
  color: white;
}

.loading-text {
  margin-top: 16px;
  font-size: 18px;
  font-weight: 500;
}

/* Header */
.header-section {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 40px 20px 20px;
  touch-action: none;
}

.title-container {
  width: 100%;
  margin: 0 auto;
  app-region: drag;
}

.main-title {
  font-size: 2.8rem;
  font-weight: 700;
  background: linear-gradient(45deg, #fff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 12px;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.subtitle {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.2rem;
  font-weight: 300;
  margin: 0;
}

/* Main Content */
.main-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* 英雄上传区域 */
.upload-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.upload-btn-hero {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  padding: 60px 40px;
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
  min-width: 400px;
  text-align: center;
}

.upload-btn-hero:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-4px);
}

.upload-icon {
  font-size: 48px;
  opacity: 0.8;
}

.upload-text {
  font-size: 20px;
  font-weight: 700;
}

.upload-hint {
  font-size: 14px;
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.4;
}

/* 悬浮工具栏 */
.floating-toolbar {
  margin: 10px auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.08),
    0 2px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 95vw;
  overflow: hidden;
  /* 使工具栏更紧凑 */
  flex-shrink: 0;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.toolbar-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(0, 0, 0, 0.1),
    transparent
  );
  margin: 0 6px;
}

/* 图片列表和预览区域 */
.images-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 15px;
  gap: 15px;
  overflow: hidden;
}

/* 文件信息区域 */
.files-section {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 200px;
}

.files-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.files-icon {
  font-size: 16px;
  opacity: 0.8;
}

.files-count {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.compressed-count {
  font-size: 12px;
  color: #6b7280;
  font-weight: 400;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.action-btn {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  transition: left 0.5s;
}

.action-btn:hover::before {
  left: 100%;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #374151;
  transition: transform 0.2s ease;
}

.btn-text {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}

.add-btn {
  border-color: rgba(59, 130, 246, 0.2);
}

.add-btn:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.add-btn:hover .btn-icon {
  transform: scale(1.1);
  color: #2563eb;
}

.add-btn:hover .btn-text {
  color: #2563eb;
}

.delete-btn {
  border-color: rgba(239, 68, 68, 0.2);
}

.delete-btn:hover {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: rgba(239, 68, 68, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

.delete-btn:hover .btn-icon {
  transform: scale(1.1);
  color: #dc2626;
}

.delete-btn:hover .btn-text {
  color: #dc2626;
}

.action-btn:active {
  transform: translateY(0px) scale(0.98);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* 质量控制区域 */
.quality-section {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 100px;
}

.quality-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quality-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-value {
  font-size: 14px;
  color: #374151;
  font-weight: 700;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.quality-slider-wrapper {
  width: 90px;
}

.mini-slider {
  --el-slider-height: 5px;
  --el-slider-button-size: 14px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.1);
}

/* 统计信息区域 */
.stats-section {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-label {
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.savings-badge {
  align-self: flex-start;
}

.saved-mini {
  font-size: 11px;
  color: #16a34a;
  font-weight: 700;
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.1),
    rgba(34, 197, 94, 0.2)
  );
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid rgba(34, 197, 94, 0.2);
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  box-shadow: 0 2px 4px rgba(34, 197, 94, 0.1);
}

/* 下载按钮区域 */
.download-section {
  justify-content: center;
}

.download-btn-new {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
}

.download-btn-new::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.6s;
}

.download-btn-new:hover::before {
  left: 100%;
}

.download-btn-new:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.35);
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
}

.download-btn-new:active {
  transform: translateY(0px) scale(0.98);
}

.download-btn-new.downloading {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
}

.download-btn-new.downloading:hover {
  transform: none;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
}

.download-btn-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.download-text {
  font-size: 13px;
  font-weight: 600;
}

/* 压缩结果展示区域 */
.results-section {
  flex: 1;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  max-height: 100%;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.results-title {
  font-size: 18px;
  font-weight: 600;
}

.results-stats {
  font-size: 14px;
  color: #6b7280;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.result-card {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.result-card.best-result {
  border-color: #667eea;
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
}

.best-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.result-preview {
  position: relative;
  width: 100%;
  height: 120px;
  overflow: hidden;
}

.result-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.result-card:hover .result-preview img {
  transform: scale(1.05);
}

.result-info {
  padding: 8px;
  background: white;
}

.result-tool {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
}

.result-stats {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #6b7280;
}

.result-size {
  font-weight: 500;
}

.result-ratio {
  color: #16a34a;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.result-ratio.positive {
  color: #4ade80;
}

.result-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: #f8fafc;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.action-btn-small {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex: 1;
}

.action-btn-small:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.preview-btn {
  color: #667eea;
  border-color: rgba(102, 126, 234, 0.2);
}

.preview-btn:hover {
  background: #f0f5ff;
  border-color: rgba(102, 126, 234, 0.4);
}

.download-btn {
  color: #059669;
  border-color: rgba(5, 150, 105, 0.2);
}

.download-btn:hover {
  background: #ecfdf5;
  border-color: rgba(5, 150, 105, 0.4);
}

/* 调试信息样式 */
.debug-info {
  color: white;
  padding: 20px;
  background: rgba(255, 0, 0, 0.3);
  margin: 10px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.4;
}

.debug-info p {
  margin: 5px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-container {
    height: 100vh;
    overflow: hidden;
  }

  .drag-overlay {
    padding: 20px;
  }

  .drag-message {
    padding: 30px;
  }

  .drag-icon {
    font-size: 48px;
  }

  .drag-text {
    font-size: 18px;
  }

  .header-section {
    padding: 40px 20px 20px;
  }

  .title-container {
    max-width: 600px;
  }

  .main-title {
    font-size: 2.5rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .floating-toolbar {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: 20px;
    border-radius: 16px;
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    max-width: none;
  }

  .toolbar-section {
    justify-content: center;
  }

  .images-section {
    padding: 10px;
    overflow: hidden;
    flex: 1;
  }

  .images-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    max-height: 180px;
  }

  .image-card {
    width: 100%;
  }

  .image-preview {
    height: 60px;
  }

  .floating-toolbar {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: 20px;
    border-radius: 16px;
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    max-width: none;
  }

  .toolbar-section {
    justify-content: center;
  }

  .files-section {
    align-items: center;
    flex-direction: column;
    justify-content: center;
    min-width: auto;
    gap: 8px;
  }

  .files-info {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .action-buttons {
    flex-direction: row;
  }

  .stats-section {
    align-items: center;
    flex-direction: row;
    justify-content: center;
  }

  .toolbar-divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(0, 0, 0, 0.1),
      transparent
    );
    margin: 0;
  }

  .upload-btn-hero {
    min-width: auto;
    width: 100%;
    max-width: 350px;
  }

  .results-section {
    padding: 10px;
  }

  .results-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    max-height: 180px;
  }

  .result-card {
    width: 100%;
  }

  .result-preview {
    height: 60px;
  }
}

@media (max-width: 480px) {
  .floating-toolbar {
    padding: 10px;
    gap: 10px;
  }

  .action-btn {
    padding: 8px 12px;
  }

  .btn-text {
    font-size: 12px;
  }

  .quality-slider-wrapper {
    width: 80px;
  }

  .download-btn-new {
    padding: 12px 16px;
  }

  .download-text {
    font-size: 14px;
  }
}

/* 全局防闪烁规则 */
img-comparison-slider,
img-comparison-slider *,
.comparison-image-fullscreen,
.comparison-slider-fullscreen {
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

/* 自定义全屏滑块样式 */
:deep(.comparison-slider-fullscreen .handle) {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

:deep(.comparison-slider-fullscreen .handle:hover) {
  transform: scale(1.1);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.3);
}

:deep(.comparison-slider-fullscreen .divider) {
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

/* 图片网格 */
.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 200px;
  min-height: 120px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  /* 自适应高度 */
  flex-shrink: 0;
}

.images-grid::-webkit-scrollbar {
  width: 6px;
}

.images-grid::-webkit-scrollbar-track {
  background: transparent;
}

.images-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.images-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* 图片卡片 */
.image-card {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.image-card.active {
  border-color: #667eea;
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
}

/* 图片预览 */
.image-preview {
  position: relative;
  width: 100%;
  height: 80px;
  overflow: hidden;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.image-card:hover .image-preview img {
  transform: scale(1.05);
}

/* 压缩中覆盖层 */
.compressing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(102, 126, 234, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

/* 错误覆盖层 */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(239, 68, 68, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.error-text {
  font-size: 12px;
  font-weight: 600;
}

/* 图片信息 */
.image-info {
  padding: 8px;
  background: white;
}

.image-name {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #6b7280;
  margin-bottom: 6px;
}

/* 图片质量控制 */
.image-quality-control {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.quality-label-small {
  font-size: 9px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 4px;
}

.image-quality-slider {
  --el-slider-height: 3px;
  --el-slider-button-size: 10px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.1);
}

.original-size {
  font-weight: 500;
}

.best-result {
  color: #16a34a;
  font-weight: 700;
}

/* 图片操作按钮 */
.image-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: #f8fafc;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.delete-single {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.2);
}

.delete-single:hover {
  background: #fef2f2;
  border-color: rgba(220, 38, 38, 0.4);
}
</style>
