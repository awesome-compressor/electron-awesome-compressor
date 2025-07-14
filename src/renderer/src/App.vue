<script setup lang="ts">
import {
  CloseBold,
  Download,
  FolderOpened,
  Loading,
  Picture,
  Upload,
  ZoomIn,
  ZoomOut,
  FullScreen,
  Aim,
  Setting,
  Key,
  Plus,
  Delete
} from '@element-plus/icons-vue'
import GitForkVue from '@simon_he/git-fork-vue'
import { ElMessage } from 'element-plus'
import 'img-comparison-slider/dist/styles.css'
import JSZip from 'jszip'
import { download } from 'lazy-js-utils'
import { h, ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { compress } from '@awesome-compressor/browser-compress-image'
import { usePresenter } from './composables/usePresenter'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 检测是否为 macOS
const isMacOS = ref(false)

// 单个图片的状态接口 (Merged)
interface ImageItem {
  id: string
  file: File
  originalUrl: string
  compressedUrl?: string
  originalSize: number
  compressedSize?: number
  compressionRatio?: number
  isCompressing: boolean
  compressionError?: string
  quality: number // 每张图片独立的质量设置
  isQualityCustomized: boolean // 标记图片质量是否被用户单独修改过
  qualityDragging: number // 拖动过程中的临时质量值
  // Electron specific
  isNodeCompressing?: boolean
  nodeCompressionStarted?: boolean
}

// 响应式状态
const loading = ref(false)
const downloading = ref(false)
const fileRef = ref()
const isDragOver = ref(false)
const currentImageIndex = ref(0)
const isCompressingAll = ref(false)
const isMobileDragging = ref(false)
const isPCDragging = ref(false)

// 图片查看相关状态
const imageZoom = ref(1)
const isFullscreen = ref(false)
const imageTransform = ref({ x: 0, y: 0 })

// 全局配置
const preserveExif = ref(false)
const globalQuality = ref(0.6)
const globalQualityDragging = ref(0.6)

// 设置面板相关状态
const showSettingsPanel = ref(false)

// 工具配置接口
interface ToolConfig {
  name: string
  key: string
  enabled: boolean
}

// 可用的工具选项
const availableTools = ['tinypng']
const toolConfigs = ref<ToolConfig[]>([])
const tempToolConfigs = ref<ToolConfig[]>([])

// Electron specific - Get presenter instances
const nodeCompressPresenter = usePresenter('nodeCompressPresenter')

const openSettingsPanel = () => {
  tempToolConfigs.value = JSON.parse(JSON.stringify(toolConfigs.value))
  showSettingsPanel.value = true
}

const closeSettingsPanel = () => {
  showSettingsPanel.value = false
}

const loadSettings = () => {
  try {
    const savedConfigs = localStorage.getItem('toolConfigs')
    if (savedConfigs) {
      toolConfigs.value = JSON.parse(savedConfigs)
    } else {
      toolConfigs.value = [{ name: 'tinypng', key: '', enabled: false }]
    }
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error)
    toolConfigs.value = [{ name: 'tinypng', key: '', enabled: false }]
  }
  globalQualityDragging.value = globalQuality.value
}

const saveSettings = () => {
  try {
    toolConfigs.value = JSON.parse(JSON.stringify(tempToolConfigs.value))
    localStorage.setItem('toolConfigs', JSON.stringify(toolConfigs.value))
    ElMessage.success('Settings saved successfully!')
    showSettingsPanel.value = false
  } catch (error) {
    console.error('Failed to save settings:', error)
    ElMessage.error('Failed to save settings')
  }
}

const addToolConfig = () => {
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  const availableTool = availableTools.find((tool) => !usedTools.includes(tool))
  if (availableTool) {
    tempToolConfigs.value.push({ name: availableTool, key: '', enabled: false })
  }
}

const removeToolConfig = (index: number) => {
  tempToolConfigs.value.splice(index, 1)
}

const globalQualityPercent = computed(() => Math.round(globalQualityDragging.value * 100))

const handleGlobalQualityInput = (value: number) => {
  globalQualityDragging.value = value / 100
}

const handleGlobalQualitySliderChange = async (value: number) => {
  const newGlobalQuality = value / 100
  globalQualityDragging.value = newGlobalQuality
  await handleGlobalQualityChange(newGlobalQuality)
}

const handleGlobalQualityChange = async (newGlobalQuality: number) => {
  globalQuality.value = newGlobalQuality
  globalQualityDragging.value = newGlobalQuality
  const recompressPromises = imageItems.value
    .filter((item) => !item.isQualityCustomized)
    .map(async (item) => {
      item.quality = newGlobalQuality
      item.qualityDragging = newGlobalQuality
      if (!item.isCompressing) {
        await compressImage(item)
      }
    })
  await Promise.all(recompressPromises)
}

const handleImageQualityInput = (item: ImageItem, value: number) => {
  item.qualityDragging = value / 100
}

const handleImageQualitySliderChange = async (item: ImageItem, value: number) => {
  const newQuality = value / 100
  item.qualityDragging = newQuality
  await handleImageQualityChange(item, value)
}

const resetImageQualityToGlobal = async (item: ImageItem) => {
  item.quality = globalQuality.value
  item.qualityDragging = globalQuality.value
  item.isQualityCustomized = false
  if (!item.isCompressing) {
    await compressImage(item)
  }
}

const handleImageQualityChange = async (item: ImageItem, newQualityPercent: number) => {
  const newQuality = newQualityPercent / 100
  item.quality = newQuality
  item.qualityDragging = newQuality
  if (Math.abs(newQuality - globalQuality.value) < 0.01) {
    item.isQualityCustomized = false
  } else {
    item.isQualityCustomized = true
  }
  if (!item.isCompressing) {
    await compressImage(item)
  }
}

const imageItems = ref<ImageItem[]>([])
const supportType = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp']

function filterAndNotifyUnsupportedFiles(files: File[]): File[] {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  const supportedFiles = imageFiles.filter((file) => supportType.includes(file.type))
  const unsupportedFiles = imageFiles.filter((file) => !supportType.includes(file.type))
  if (unsupportedFiles.length > 0) {
    const unsupportedFormats = [
      ...new Set(
        unsupportedFiles.map((file) => file.name.split('.').pop()?.toLowerCase() || 'unknown')
      )
    ]
    ElMessage({
      message: h('div', [
        h('div', `Filtered ${unsupportedFiles.length} unsupported image files.`),
        h('div', `Unsupported formats: ${unsupportedFormats.join(', ')}`)
      ]),
      type: 'warning',
      duration: 5000
    })
  }
  const nonImageFiles = files.filter((file) => !file.type.startsWith('image/'))
  if (nonImageFiles.length > 0) {
    ElMessage({
      message: h('div', `Filtered ${nonImageFiles.length} non-image files.`),
      type: 'info',
      duration: 3000
    })
  }
  return supportedFiles
}

const hasImages = computed(() => imageItems.value.length > 0)
const currentImage = computed(() => imageItems.value[currentImageIndex.value])
const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0)
)
const totalCompressedSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + (item.compressedSize || 0), 0)
)
const totalCompressionRatio = computed(() => {
  if (totalOriginalSize.value === 0) return 0
  return ((totalOriginalSize.value - totalCompressedSize.value) / totalOriginalSize.value) * 100
})
const compressedCount = computed(
  () => imageItems.value.filter((item) => item.compressedUrl && !item.compressionError).length
)
const allCompressed = computed(
  () => imageItems.value.length > 0 && compressedCount.value === imageItems.value.length
)
const canAddToolConfig = computed(() => {
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  return availableTools.some((tool) => !usedTools.includes(tool))
})

onMounted(() => {
  isMacOS.value = navigator.userAgent.includes('Mac')
  loadSettings()
  fileRef.value!.addEventListener('change', handleFileInputChange)
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
  document.addEventListener('paste', handlePaste)
  document.addEventListener('touchstart', handleTouchStart, { passive: true })
  document.addEventListener('touchend', handleTouchEnd, { passive: true })
  document.addEventListener('touchcancel', handleTouchEnd, { passive: true })
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('mousemove', handleImageMouseMove)
  document.addEventListener('mouseup', handleImageMouseUp)
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)
  document.removeEventListener('paste', handlePaste)
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchend', handleTouchEnd)
  document.removeEventListener('touchcancel', handleTouchEnd)
  document.removeEventListener('mousedown', handleMouseDown)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', handleImageMouseMove)
  document.removeEventListener('mouseup', handleImageMouseUp)
  window.removeEventListener('resize', handleWindowResize)
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
  })
})

function handleTouchStart(e: TouchEvent) {
  const target = e.target as HTMLElement
  if (target.closest('img-comparison-slider') || target.closest('.comparison-slider-fullscreen')) {
    isMobileDragging.value = true
  }
}

function handleTouchEnd() {
  isMobileDragging.value = false
}

function handleMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('img-comparison-slider') || target.closest('.comparison-slider-fullscreen')) {
    isPCDragging.value = true
  }
}

function handleMouseUp() {
  isPCDragging.value = false
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.items) {
    const hasImageOrFolder = Array.from(e.dataTransfer.items).some(
      (item) =>
        (item.kind === 'file' && item.type.startsWith('image/')) ||
        (item.kind === 'file' && item.type === '')
    )
    if (hasImageOrFolder) isDragOver.value = true
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  if (
    !e.relatedTarget ||
    !document.querySelector('.app-container')?.contains(e.relatedTarget as Node)
  ) {
    isDragOver.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  loading.value = true
  try {
    let files: File[] = []
    const items = e.dataTransfer?.items
    if (items && items.length > 0) {
      files = await extractFilesFromDataTransfer(items)
    }
    if (files.length === 0 && e.dataTransfer?.files) {
      files = Array.from(e.dataTransfer.files)
    }
    if (files.length === 0) return
    const imageFiles = filterAndNotifyUnsupportedFiles(files)
    if (imageFiles.length === 0) return
    await addNewImages(imageFiles)
    ElMessage.success(`Successfully loaded ${imageFiles.length} image(s)`)
  } catch (error) {
    console.error('Error processing dropped files:', error)
    ElMessage.error('Error processing files.')
  } finally {
    loading.value = false
  }
}

async function handlePaste(e: ClipboardEvent) {
  const activeElement = document.activeElement
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement as HTMLElement).isContentEditable)
  )
    return
  e.preventDefault()
  const items = e.clipboardData?.items
  if (!items || items.length === 0) return
  loading.value = true
  try {
    const files = await extractFilesFromItems(items)
    const imageFiles = filterAndNotifyUnsupportedFiles(files)
    if (imageFiles.length === 0) return
    await addNewImages(imageFiles)
    ElMessage.success(`Successfully pasted ${imageFiles.length} image(s)`)
  } catch (error) {
    console.error('Error processing pasted files:', error)
    ElMessage.error('Error processing pasted files.')
  } finally {
    loading.value = false
  }
}

async function extractFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  return await extractFilesFromItems(items)
}

async function extractFilesFromItems(items: DataTransferItemList): Promise<File[]> {
  const promises: Promise<File[]>[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        const itemFiles: File[] = []
        promises.push(processEntry(entry, itemFiles).then(() => itemFiles))
      } else {
        const file = item.getAsFile()
        if (file) promises.push(Promise.resolve([file]))
      }
    }
  }
  const allFileArrays = await Promise.all(promises)
  return allFileArrays.flat()
}

async function processEntry(entry: FileSystemEntry, files: File[]): Promise<void> {
  if (entry.isFile) {
    try {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      )
      files.push(file)
    } catch (error) {
      console.error('Failed to get file:', entry.name, error)
    }
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    )
    for (const childEntry of entries) {
      await processEntry(childEntry, files)
    }
  }
}

async function handleFileInputChange() {
  const selectedFiles = Array.from(fileRef.value.files || []) as File[]
  if (selectedFiles.length > 0) {
    loading.value = true
    try {
      const imageFiles = filterAndNotifyUnsupportedFiles(selectedFiles)
      if (imageFiles.length === 0) return
      await addNewImages(imageFiles)
      ElMessage.success(`Successfully loaded ${imageFiles.length} image(s)`)
    } finally {
      loading.value = false
      fileRef.value.value = ''
    }
  }
}

async function addNewImages(files: File[]) {
  const newItems: ImageItem[] = files.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    originalUrl: URL.createObjectURL(file),
    originalSize: file.size,
    isCompressing: false,
    quality: globalQuality.value,
    isQualityCustomized: false,
    qualityDragging: globalQuality.value,
    isNodeCompressing: false,
    nodeCompressionStarted: false
  }))
  await compressImages(newItems)
  imageItems.value.push(...newItems)
}

async function compressImage(item: ImageItem): Promise<void> {
  if (item.isCompressing) return
  item.isCompressing = true
  item.compressionError = undefined
  try {
    const enabledToolConfigs = toolConfigs.value.filter(
      (config) => config.enabled && config.key.trim()
    )
    const compressedBlob = await compress(item.file, {
      quality: item.quality,
      type: 'blob',
      preserveExif: preserveExif.value,
      toolConfigs: enabledToolConfigs
    })
    if (!compressedBlob) {
      ElMessage.error('Size is too large')
      return
    }
    if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
    item.compressedUrl = URL.createObjectURL(compressedBlob)
    item.compressedSize = compressedBlob.size
    item.compressionRatio = ((item.originalSize - compressedBlob.size) / item.originalSize) * 100

    // Electron specific: also try node compression
    if (nodeCompressPresenter && !item.nodeCompressionStarted) {
      compressWithNode(item)
    }
  } catch (error) {
    console.error('Compression error:', error)
    item.compressionError = error instanceof Error ? error.message : 'Compression failed'
  } finally {
    item.isCompressing = false
  }
}

async function compressWithNode(item: ImageItem): Promise<void> {
  if (!item.file || item.isNodeCompressing) return
  item.isNodeCompressing = true
  item.nodeCompressionStarted = true
  try {
    const arrayBuffer = await item.file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const result = await nodeCompressPresenter.compressImageFromBytes(uint8Array, item.file.name, {
      quality: item.quality,
      preserveExif: false
    })
    if (result && result.bestTool && result.bestFileId) {
      const fileId = result.bestFileId
      const compressedSize = result.allResults.length > 0 ? result.allResults[0].compressedSize : 0
      const nodeResultUrl = `eacompressor-file://getFile?id=${fileId}`
      if (result.compressionRatio > (item.compressionRatio || 0)) {
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
        item.compressedUrl = nodeResultUrl
        item.compressedSize = compressedSize
        item.compressionRatio = result.compressionRatio
      }
    }
  } catch (error) {
    console.error('Node compression error:', error)
  } finally {
    item.isNodeCompressing = false
  }
}

async function compressImages(items: ImageItem[] = imageItems.value) {
  isCompressingAll.value = true
  try {
    const batchSize = 3
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await Promise.all(batch.map((item) => compressImage(item)))
    }
  } finally {
    isCompressingAll.value = false
  }
}

async function handlePreserveExifChange() {
  for (const item of imageItems.value) {
    if (!item.isCompressing) await compressImage(item)
  }
}

function deleteImage(index: number) {
  const item = imageItems.value[index]
  URL.revokeObjectURL(item.originalUrl)
  if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
  imageItems.value.splice(index, 1)
  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }
}

function clearAllImages() {
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
  })
  imageItems.value = []
  currentImageIndex.value = 0
}

function uploadImages() {
  document.getElementById('file')?.click()
}

function generateFolderName(): string {
  const now = new Date()
  return `browser-compress-image_${now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_')}`
}

async function downloadImage(item: ImageItem) {
  if (!item.compressedUrl) return
  try {
    download(item.compressedUrl, item.file.name)
    ElMessage.success(`Downloaded: ${item.file.name}`)
  } catch (error) {
    ElMessage.error('Download failed.')
  }
}

async function downloadAllImages() {
  if (downloading.value) return
  const downloadableItems = imageItems.value.filter(
    (item) => item.compressedUrl && !item.compressionError
  )
  if (downloadableItems.length === 0) {
    ElMessage.warning('No compressed images to download')
    return
  }
  downloading.value = true
  try {
    const folderName = generateFolderName()
    const zip = new JSZip()
    const folder = zip.folder(folderName)
    if (!folder) throw new Error('Failed to create folder in ZIP')
    await new Promise((resolve) => setTimeout(resolve, 300))
    for (const item of downloadableItems) {
      if (item.compressedUrl) {
        const response = await fetch(item.compressedUrl)
        const blob = await response.blob()
        folder.file(item.file.name, blob)
      }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const zipFileName = `${folderName}.zip`
    download(URL.createObjectURL(zipBlob), zipFileName)
    ElMessage.success(
      `Successfully downloaded ${downloadableItems.length} images in ${zipFileName}`
    )
  } catch (error) {
    console.error('Batch download error:', error)
    ElMessage.error('Batch download failed.')
  } finally {
    downloading.value = false
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function setCurrentImage(index: number) {
  currentImageIndex.value = index
  if (isFullscreen.value) {
    nextTick(() => constrainImagePosition())
  } else {
    resetImageTransform()
  }
}

function zoomIn() {
  imageZoom.value = Math.min(imageZoom.value * 1.2, 5)
  nextTick(() => constrainImagePosition())
}

function zoomOut() {
  imageZoom.value = Math.max(imageZoom.value / 1.2, 0.1)
  nextTick(() => constrainImagePosition())
}

function constrainImagePosition() {
  const bounds = calculateImageBounds()
  imageTransform.value.x = Math.max(bounds.minX, Math.min(bounds.maxX, imageTransform.value.x))
  imageTransform.value.y = Math.max(bounds.minY, Math.min(bounds.maxY, imageTransform.value.y))
}

function handleImageLoad() {
  nextTick(() => constrainImagePosition())
}

function handleWindowResize() {
  if (isFullscreen.value) {
    nextTick(() => constrainImagePosition())
  }
}

function resetZoom() {
  imageZoom.value = 1
  imageTransform.value = { x: 0, y: 0 }
}

function resetImageTransform() {
  imageZoom.value = 1
  imageTransform.value = { x: 0, y: 0 }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  resetImageTransform()
}

function handleKeydown(e: KeyboardEvent) {
  if (!hasImages.value) return
  switch (e.key) {
    case 'Escape':
      if (isFullscreen.value) toggleFullscreen()
      break
    case '+':
    case '=':
      e.preventDefault()
      zoomIn()
      break
    case '-':
      e.preventDefault()
      zoomOut()
      break
    case '0':
      e.preventDefault()
      resetZoom()
      break
    case 'f':
    case 'F':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        toggleFullscreen()
      }
      break
    case 'ArrowLeft':
      if (isFullscreen.value) {
        e.preventDefault()
        setCurrentImage(Math.max(0, currentImageIndex.value - 1))
      }
      break
    case 'ArrowRight':
      if (isFullscreen.value) {
        e.preventDefault()
        setCurrentImage(Math.min(imageItems.value.length - 1, currentImageIndex.value + 1))
      }
      break
  }
}

function handleWheel(e: WheelEvent) {
  if (!isFullscreen.value) return
  e.preventDefault()
  if (e.deltaY > 0) zoomOut()
  else zoomIn()
}

let isDragging = false
let dragStartX = 0
let dragStartY = 0

function handleImageMouseDown(e: MouseEvent) {
  if (!isFullscreen.value || imageZoom.value <= 1) return
  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  e.preventDefault()
  e.stopPropagation()
}

function calculateImageBounds() {
  if (!isFullscreen.value || imageZoom.value <= 1) return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  const container = document.querySelector('.comparison-container-fullscreen') as HTMLElement
  if (!container) return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  const containerRect = container.getBoundingClientRect()
  const imgElement = container.querySelector(
    '.comparison-image-fullscreen, .single-image'
  ) as HTMLImageElement
  if (!imgElement) return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  const { naturalWidth, naturalHeight } = imgElement
  if (naturalWidth === 0 || naturalHeight === 0) return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  const containerAspect = containerRect.width / containerRect.height
  const imageAspect = naturalWidth / naturalHeight
  let displayWidth, displayHeight
  if (imageAspect > containerAspect) {
    displayWidth = containerRect.width
    displayHeight = containerRect.width / imageAspect
  } else {
    displayHeight = containerRect.height
    displayWidth = containerRect.height * imageAspect
  }
  const scaledWidth = displayWidth * imageZoom.value
  const scaledHeight = displayHeight * imageZoom.value
  const maxMoveX = Math.max(0, (scaledWidth - containerRect.width) / 2)
  const maxMoveY = Math.max(0, (scaledHeight - containerRect.height) / 2)
  return { maxX: maxMoveX, maxY: maxMoveY, minX: -maxMoveX, minY: -maxMoveY }
}

function handleImageMouseMove(e: MouseEvent) {
  if (!isDragging) return
  const newX = e.clientX - dragStartX
  const newY = e.clientY - dragStartY
  const bounds = calculateImageBounds()
  imageTransform.value.x = Math.max(bounds.minX, Math.min(bounds.maxX, newX))
  imageTransform.value.y = Math.max(bounds.minY, Math.min(bounds.maxY, newY))
}

function handleImageMouseUp() {
  isDragging = false
}

async function previewCompressionResult(item: ImageItem): Promise<void> {
  try {
    const previewData = {
      originalImage: { url: item.originalUrl, name: item.file.name, size: item.originalSize },
      compressedImage: {
        url: item.compressedUrl || '',
        tool: 'best',
        size: item.compressedSize || 0,
        ratio: item.compressionRatio || 0
      }
    }
    await window.electron.ipcRenderer.invoke(
      'presenter:call',
      'windowPresenter',
      'previewComparison',
      previewData
    )
  } catch (error) {
    console.error('Failed to open preview:', error)
    ElMessage.error('Failed to open preview window')
  }
}
</script>

<template>
  <div class="app-container" :class="{ 'drag-over': isDragOver }">
    <div v-if="isMacOS" class="macos-titlebar"><div class="titlebar-drag-region" /></div>
    <div v-show="isDragOver" class="drag-overlay">
      <div class="drag-message">
        <el-icon class="drag-icon"><FolderOpened /></el-icon>
        <div class="drag-text">Drop images or folders here</div>
        <div class="drag-subtitle">
          Support multiple images and folder drag & drop • Or use Ctrl+V to paste
        </div>
      </div>
    </div>
    <div v-show="loading || isCompressingAll" class="loading-overlay">
      <div class="loading-spinner">
        <el-icon class="is-loading" size="40px"><Loading /></el-icon>
        <div class="loading-text">
          {{ loading ? 'Loading images...' : 'Compressing images...' }}
        </div>
      </div>
    </div>
    <GitForkVue
      link="https://github.com/awesome-compressor/electron-awesome-compressor"
      position="right"
      type="corners"
      content="Star on GitHub"
      color="#667eea"
    />
    <header class="header-section" :class="{ 'macos-header': isMacOS }">
      <div class="title-container">
        <vivid-typing content="Electron Awesome Compressor" class="main-title" />
        <p class="subtitle">
          Compress your images with ease, right in your browser • Support batch processing
        </p>
      </div>
    </header>
    <main class="main-content">
      <section class="settings-section-main">
        <div class="settings-container">
          <el-button
            type="primary"
            class="settings-btn-main"
            :icon="Setting"
            plain
            @click="openSettingsPanel"
            >Configure Compression Tools</el-button
          >
          <p class="settings-hint">
            Configure API keys and enable compression tools before uploading images
          </p>
        </div>
      </section>
      <section v-if="!hasImages" class="upload-zone">
        <button class="upload-btn-hero" @click="uploadImages">
          <el-icon class="upload-icon"><Picture /></el-icon>
          <span class="upload-text">Drop, Paste or Click to Upload Images</span>
          <span class="upload-hint"
            >Support PNG, JPG, JPEG, GIF formats • Multiple files & folders supported ��� Use Ctrl+V
            to paste images</span
          >
        </button>
      </section>
      <div v-if="hasImages" class="floating-toolbar">
        <div class="toolbar-section files-section">
          <div class="files-info">
            <div class="files-icon">📷</div>
            <span class="files-count">{{ imageItems.length }} image(s)</span>
            <span class="compressed-count">({{ compressedCount }} compressed)</span>
          </div>
          <div class="action-buttons">
            <button class="action-btn add-btn" title="Add More Images" @click="uploadImages">
              <div class="btn-icon">
                <el-icon><Upload /></el-icon>
              </div>
              <span class="btn-text">Add More</span>
            </button>
            <button class="action-btn delete-btn" title="Clear All Images" @click="clearAllImages">
              <div class="btn-icon">
                <el-icon><CloseBold /></el-icon>
              </div>
              <span class="btn-text">Clear All</span>
            </button>
          </div>
        </div>
        <div class="toolbar-divider" />
        <div class="toolbar-section stats-section">
          <div class="stats-info">
            <span class="size-label"
              >Total: {{ formatFileSize(totalOriginalSize) }} →
              {{ formatFileSize(totalCompressedSize) }}</span
            >
            <span class="saved-mini" :class="{ 'saved-negative': totalCompressionRatio < 0 }">
              {{ totalCompressionRatio < 0 ? '+' : '-'
              }}{{ Math.abs(totalCompressionRatio).toFixed(1) }}%
            </span>
          </div>
        </div>
        <div class="toolbar-divider" />
        <div class="toolbar-section options-section">
          <div class="exif-option">
            <el-checkbox v-model="preserveExif" @change="handlePreserveExifChange">
              <span class="exif-label"><span>Preserve</span> EXIF</span>
            </el-checkbox>
          </div>
          <div class="quality-control">
            <div class="global-quality-header">
              <div class="quality-info-global">
                <span class="quality-label-global">Global Quality</span>
                <span class="quality-value-global">{{ globalQualityPercent }}%</span>
              </div>
              <div class="quality-indicator">
                <div class="quality-bar-bg">
                  <div
                    class="quality-bar-fill"
                    :style="{ width: globalQualityPercent + '%' }"
                  ></div>
                </div>
              </div>
            </div>
            <el-slider
              :model-value="globalQualityPercent"
              :max="100"
              :step="1"
              :min="1"
              class="global-quality-slider"
              :show-tooltip="false"
              size="small"
              @input="handleGlobalQualityInput"
              @change="handleGlobalQualitySliderChange"
            />
          </div>
        </div>
        <div v-if="allCompressed" class="toolbar-divider" />
        <div v-if="allCompressed" class="toolbar-section download-section">
          <button
            class="download-btn-new"
            :class="[{ downloading }]"
            :disabled="downloading"
            title="Download All Compressed Images"
            @click="downloadAllImages"
          >
            <div class="download-btn-content">
              <div class="download-icon">
                <el-icon v-if="!downloading"><Download /></el-icon>
                <el-icon v-else class="is-loading"><Loading /></el-icon>
              </div>
              <span class="download-text">{{
                downloading ? 'Downloading...' : `Download All (${compressedCount})`
              }}</span>
            </div>
          </button>
        </div>
      </div>
      <section v-if="hasImages" class="images-section">
        <div class="images-grid">
          <div
            v-for="(item, index) in imageItems"
            :key="item.id"
            class="image-card"
            :class="{ active: index === currentImageIndex }"
            @click="setCurrentImage(index)"
          >
            <div class="image-preview">
              <img class="preview-image" :src="item.originalUrl" :alt="item.file.name" />
              <div v-if="item.isCompressing || item.isNodeCompressing" class="compressing-overlay">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
              <div v-if="item.compressionError" class="error-overlay">
                <span class="error-text">Error</span>
              </div>
            </div>
            <div class="image-info">
              <div class="image-header">
                <div class="image-name" :title="item.file.name">{{ item.file.name }}</div>
                <div class="image-format">{{ item.file.type.split('/')[1].toUpperCase() }}</div>
              </div>
              <div class="image-stats">
                <div class="compression-result">
                  <div class="size-comparison">
                    <div class="size-item">
                      <span class="size-label">Original</span
                      ><span class="size-value original">{{
                        formatFileSize(item.originalSize)
                      }}</span>
                    </div>
                    <div class="size-arrow">
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path
                          d="M1 4H11M11 4L8 1M11 4L8 7"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                    <div class="size-item">
                      <span class="size-label">Compressed</span
                      ><span class="size-value compressed">{{
                        formatFileSize(item.compressedSize || 0)
                      }}</span>
                    </div>
                  </div>
                  <div class="compression-ratio">
                    <span
                      class="ratio-badge"
                      :class="{ 'ratio-negative': (item.compressionRatio || 0) < 0 }"
                      >{{ (item.compressionRatio || 0) < 0 ? '+' : '-'
                      }}{{ Math.abs(item.compressionRatio || 0).toFixed(1) }}%</span
                    >
                  </div>
                </div>
              </div>
              <div class="image-quality-control">
                <div class="quality-header">
                  <div class="quality-info">
                    <span class="quality-label">Quality</span
                    ><span class="quality-value"
                      >{{ Math.round(item.qualityDragging * 100) }}%</span
                    >
                  </div>
                  <button
                    v-if="item.isQualityCustomized"
                    class="reset-quality-btn"
                    title="Reset to global quality"
                    @click.stop="resetImageQualityToGlobal(item)"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6C2 3.79 3.79 2 6 2C7.5 2 8.78 2.88 9.41 4.12M10 6C10 8.21 8.21 10 6 10C4.5 10 3.22 9.12 2.59 7.88M9.5 3.5L9.41 4.12L8.79 4.03"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <el-slider
                  :model-value="Math.round(item.qualityDragging * 100)"
                  :max="100"
                  :step="1"
                  :min="1"
                  class="image-quality-slider"
                  :show-tooltip="false"
                  size="small"
                  @input="(val: number) => handleImageQualityInput(item, val)"
                  @change="(val: number) => handleImageQualitySliderChange(item, val)"
                />
              </div>
            </div>
            <div class="image-actions">
              <button
                v-if="item.compressedUrl && !item.compressionError"
                class="action-btn-small download-single"
                title="Download this image"
                @click.stop="downloadImage(item)"
              >
                <el-icon><Download /></el-icon>
              </button>
              <button
                v-if="item.compressedUrl && !item.compressionError"
                class="action-btn-small preview-single"
                title="Preview comparison"
                @click.stop="previewCompressionResult(item)"
              >
                <el-icon><Picture /></el-icon>
              </button>
              <button
                class="action-btn-small delete-single"
                title="Remove this image"
                @click.stop="deleteImage(index)"
              >
                <el-icon><CloseBold /></el-icon>
              </button>
            </div>
          </div>
        </div>
        <div
          v-if="currentImage"
          class="fullscreen-comparison"
          :class="{ 'fullscreen-mode': isFullscreen }"
        >
          <div
            class="comparison-container-fullscreen"
            :style="{ cursor: imageZoom > 1 ? 'move' : 'default' }"
            @wheel="handleWheel"
            @mousedown="handleImageMouseDown"
          >
            <img-comparison-slider
              v-if="currentImage.originalUrl && currentImage.compressedUrl"
              class="comparison-slider-fullscreen"
              value="50"
            >
              <template #first>
                <img
                  :src="currentImage.originalUrl"
                  alt="Original Image"
                  class="comparison-image-fullscreen"
                  :style="{
                    transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`
                  }"
                  @load="handleImageLoad"
                />
              </template>
              <template #second>
                <img
                  :src="currentImage.compressedUrl"
                  alt="Compressed Image"
                  class="comparison-image-fullscreen"
                  :style="{
                    transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`
                  }"
                  @load="handleImageLoad"
                />
              </template>
            </img-comparison-slider>
            <div v-else-if="currentImage.originalUrl" class="single-image-preview">
              <img
                :src="currentImage.originalUrl"
                :alt="currentImage.file.name"
                class="single-image"
                :style="{
                  transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`
                }"
                @load="handleImageLoad"
              />
              <div
                v-if="currentImage.isCompressing || currentImage.isNodeCompressing"
                class="preview-overlay"
              >
                <el-icon class="is-loading" size="30px"><Loading /></el-icon>
                <div class="overlay-text">Compressing...</div>
              </div>
              <div v-if="currentImage.compressionError" class="preview-overlay error">
                <div class="overlay-text">Compression Error</div>
                <div class="overlay-subtext">{{ currentImage.compressionError }}</div>
              </div>
            </div>
            <div
              class="image-overlay-info"
              :class="{ 'mobile-dragging': isMobileDragging, 'pc-dragging': isPCDragging }"
            >
              <div class="overlay-header">
                <div class="image-title">{{ currentImage.file.name }}</div>
                <div class="image-controls">
                  <el-button
                    circle
                    size="small"
                    :disabled="imageZoom <= 0.1"
                    title="缩小 (-)
                  "
                    @click="zoomOut"
                    ><el-icon><ZoomOut /></el-icon
                  ></el-button>
                  <span class="zoom-info">{{ Math.round(imageZoom * 100) }}%</span>
                  <el-button
                    circle
                    size="small"
                    :disabled="imageZoom >= 5"
                    title="放大 (+)"
                    @click="zoomIn"
                    ><el-icon><ZoomIn /></el-icon
                  ></el-button>
                  <el-button circle size="small" title="重置缩放 (0)" @click="resetZoom"
                    ><el-icon><Aim /></el-icon
                  ></el-button>
                  <el-button
                    circle
                    size="small"
                    :title="isFullscreen ? '退出全屏 (Esc)' : '全屏 (Ctrl+F)'"
                    @click="toggleFullscreen"
                    ><el-icon><FullScreen /></el-icon
                  ></el-button>
                </div>
              </div>
              <div class="image-details">
                <span>{{ currentImageIndex + 1 }} / {{ imageItems.length }}</span>
                <span>Quality: {{ Math.round(currentImage.quality * 100) }}%</span>
                <span>{{ formatFileSize(currentImage.originalSize) }}</span>
                <span v-if="currentImage.compressedSize">
                  → {{ formatFileSize(currentImage.compressedSize) }}</span
                >
                <span
                  v-if="currentImage.compressionRatio"
                  class="savings"
                  :class="{ 'savings-negative': currentImage.compressionRatio < 0 }"
                  >({{ currentImage.compressionRatio < 0 ? '+' : '-'
                  }}{{ Math.abs(currentImage.compressionRatio).toFixed(1) }}%)</span
                >
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
      accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
      multiple
      hidden
    />
    <el-dialog
      v-model="showSettingsPanel"
      title="Settings"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="settings-content">
        <div class="settings-section">
          <h3 class="settings-title">
            <el-icon><Key /></el-icon> Tool Configurations
          </h3>
          <p class="settings-description">
            Configure API keys and settings for different compression tools.
          </p>
          <div class="tool-config-list">
            <div v-for="(config, index) in tempToolConfigs" :key="index" class="tool-config-item">
              <div class="tool-header">
                <div class="tool-info">
                  <el-icon class="tool-icon"><Picture /></el-icon>
                  <span class="tool-name">{{ config.name.toUpperCase() }}</span>
                  <el-tag :type="config.enabled && config.key ? 'success' : 'info'" size="small">{{
                    config.enabled && config.key ? 'Enabled' : 'Disabled'
                  }}</el-tag>
                </div>
                <div class="tool-actions">
                  <el-switch v-model="config.enabled" :disabled="!config.key.trim()" />
                  <el-button
                    v-if="tempToolConfigs.length > 1"
                    type="danger"
                    size="small"
                    :icon="Delete"
                    circle
                    @click="removeToolConfig(index)"
                  />
                </div>
              </div>
              <div class="tool-config">
                <el-form-item label="Tool">
                  <el-select v-model="config.name" placeholder="Select a tool">
                    <el-option
                      v-for="tool in availableTools"
                      :key="tool"
                      :label="tool.toUpperCase()"
                      :value="tool"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="API Key">
                  <el-input
                    v-model="config.key"
                    type="password"
                    placeholder="Enter your API key"
                    show-password
                    clearable
                  >
                    <template #prepend
                      ><el-icon><Key /></el-icon
                    ></template>
                  </el-input>
                </el-form-item>
              </div>
            </div>
          </div>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="!canAddToolConfig"
            class="add-tool-btn"
            @click="addToolConfig"
            >Add Tool</el-button
          >
        </div>
      </div>
      <template #footer>
        <el-button @click="closeSettingsPanel">Cancel</el-button>
        <el-button type="primary" @click="saveSettings">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* General App Styling */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f0f2f5;
  color: #333;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  position: relative;
  overflow: hidden;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(99, 102, 241, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.drag-message {
  text-align: center;
  color: white;
  animation: pulse 1.5s infinite;
}

.drag-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.drag-text {
  font-size: 28px;
  font-weight: 600;
}

.drag-subtitle {
  font-size: 16px;
  margin-top: 8px;
  opacity: 0.8;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  backdrop-filter: blur(4px);
}

.loading-spinner {
  text-align: center;
}

.loading-text {
  margin-top: 12px;
  font-size: 16px;
  color: #4a5568;
}

/* Header */
.header-section {
  padding: 24px 48px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  text-align: center;
}

.title-container {
  max-width: 800px;
  margin: 0 auto;
}

.main-title {
  font-size: 36px;
  font-weight: 700;
  color: #2d3748;
  letter-spacing: -0.02em;
}

.subtitle {
  margin-top: 8px;
  font-size: 16px;
  color: #718096;
}

/* Main Content */
.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

/* Settings Section */
.settings-section-main {
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
  background-color: #f0f2f5;
}

.settings-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: white;
  border-radius: 12px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.settings-btn-main {
  font-weight: 500;
}

.settings-hint {
  font-size: 13px;
  color: #718096;
  margin: 0;
}

/* Upload Zone */
.upload-zone {
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

.upload-btn-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 600px;
  height: 300px;
  border: 2px dashed #cbd5e0;
  border-radius: 16px;
  background-color: #fafafa;
  color: #4a5568;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  padding: 24px;
}

.upload-btn-hero:hover {
  border-color: #667eea;
  background-color: #f7f7ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.upload-icon {
  font-size: 48px;
  color: #94a3b8;
  margin-bottom: 16px;
  transition: color 0.2s ease-in-out;
}

.upload-btn-hero:hover .upload-icon {
  color: #667eea;
}

.upload-text {
  font-size: 20px;
  font-weight: 500;
}

.upload-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #a0aec0;
  max-width: 80%;
  text-align: center;
}

/* Floating Toolbar */
.floating-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  margin: 0 auto 16px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  width: fit-content;
  max-width: 95%;
  z-index: 10;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.files-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.files-icon {
  font-size: 20px;
}

.compressed-count {
  color: #718096;
  font-size: 13px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background-color: #f8fafc;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #f1f5f9;
  border-color: #cbd5e0;
}

.action-btn .btn-icon {
  font-size: 16px;
}

.delete-btn:hover {
  background-color: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.toolbar-divider {
  width: 1px;
  height: 32px;
  background-color: #e2e8f0;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.size-label {
  color: #4a5568;
}

.saved-mini {
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 13px;
  background-color: #dcfce7;
  color: #16a34a;
}

.saved-negative {
  background-color: #fee2e2;
  color: #b91c1c;
}

.options-section {
  display: flex;
  align-items: center;
  gap: 24px;
}

.exif-option .exif-label {
  font-size: 14px;
  font-weight: 500;
  color: #4a5568;
}

.quality-control {
  width: 200px;
}

.global-quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.quality-info-global {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.quality-label-global {
  font-size: 14px;
  font-weight: 500;
  color: #4a5568;
}

.quality-value-global {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.quality-indicator {
  width: 60px;
}

.quality-bar-bg {
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.quality-bar-fill {
  height: 100%;
  background-color: #667eea;
  border-radius: 3px;
  transition: width 0.2s;
}

.global-quality-slider {
  --el-slider-main-bg-color: #667eea;
  --el-slider-runway-bg-color: #e2e8f0;
  height: 24px;
  margin-top: -8px;
}

.download-section {
  margin-left: auto;
}

.download-btn-new {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  background-color: #4f46e5;
  color: white;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2);
}

.download-btn-new:hover {
  background-color: #4338ca;
  transform: translateY(-1px);
}

.download-btn-new:disabled {
  background-color: #a5b4fc;
  cursor: not-allowed;
}

.download-btn-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-icon {
  font-size: 18px;
}

/* Images Section */
.images-section {
  flex-grow: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
}

.images-grid {
  width: 400px;
  min-width: 400px;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.image-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 12px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.image-card:hover {
  border-color: #c7d2fe;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.image-card.active {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.image-preview {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compressing-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
  color: #4a5568;
  font-size: 24px;
}

.error-overlay {
  background: rgba(239, 68, 68, 0.8);
  color: white;
}

.error-text {
  font-size: 14px;
  font-weight: 600;
}

.image-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.image-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.image-name {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-format {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 6px;
  background-color: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
}

.image-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.compression-result {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-comparison {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.size-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.size-label {
  font-size: 10px;
  color: #94a3b8;
}

.size-value {
  font-weight: 500;
  color: #475569;
}

.size-arrow {
  color: #94a3b8;
}

.compression-ratio {
  margin-left: 8px;
}

.ratio-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  background-color: #dcfce7;
  color: #16a34a;
}

.ratio-negative {
  background-color: #fee2e2;
  color: #b91c1c;
}

.image-quality-control {
  margin-top: 4px;
}

.quality-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: -4px;
}

.quality-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.quality-label {
  font-size: 12px;
  color: #64748b;
}

.quality-value {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.reset-quality-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition:
    color 0.2s,
    background-color 0.2s;
}

.reset-quality-btn:hover {
  color: #475569;
  background-color: #f1f5f9;
}

.image-quality-slider {
  --el-slider-main-bg-color: #818cf8;
  --el-slider-runway-bg-color: #e2e8f0;
  height: 20px;
  margin-top: -4px;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  background: white;
  padding: 4px;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-card:hover .image-actions {
  opacity: 1;
}

.action-btn-small {
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn-small:hover {
  background: #f1f5f9;
  color: #334155;
}

.delete-single:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* Fullscreen Comparison */
.fullscreen-comparison {
  flex-grow: 1;
  background: white;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.comparison-container-fullscreen {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.comparison-slider-fullscreen {
  width: 100%;
  height: 100%;
  --divider-width: 2px;
  --divider-color: #667eea;
  --handle-size: 40px;
}

.comparison-image-fullscreen,
.single-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.2s ease-out;
}

.single-image-preview {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
  color: #4a5568;
  text-align: center;
}

.preview-overlay.error {
  background: rgba(239, 68, 68, 0.8);
  color: white;
}

.overlay-text {
  font-size: 18px;
  font-weight: 600;
  margin-top: 12px;
}

.overlay-subtext {
  font-size: 14px;
  margin-top: 8px;
  padding: 0 20px;
}

.image-overlay-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  color: white;
  transition: opacity 0.3s;
}

.image-overlay-info.mobile-dragging,
.image-overlay-info.pc-dragging {
  opacity: 0.2;
}

.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.image-title {
  font-size: 16px;
  font-weight: 500;
}

.image-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-info {
  font-size: 14px;
  font-weight: 500;
  min-width: 40px;
  text-align: center;
}

.image-details {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.8;
  display: flex;
  gap: 16px;
}

.savings {
  font-weight: 600;
  color: #a7f3d0;
}

.savings-negative {
  color: #fecaca;
}

/* Settings Dialog */
.settings-content {
  padding: 0 10px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-description {
  font-size: 14px;
  color: #718096;
  margin-bottom: 16px;
}

.tool-config-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-config-item {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  font-size: 18px;
}

.tool-name {
  font-weight: 600;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.add-tool-btn {
  margin-top: 16px;
  width: 100%;
}

/* macOS specific styles */
.macos-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px; /* Adjust to match your title bar height */
  z-index: 100;
}

.titlebar-drag-region {
  width: 100%;
  height: 100%;
  -webkit-app-region: drag;
}

.macos-header {
  padding-top: 48px; /* Adjust to provide space for the title bar */
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
