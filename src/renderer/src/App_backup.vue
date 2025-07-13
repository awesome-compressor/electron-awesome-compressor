<!-- Backup of original electron App.vue -->
<script setup lang="ts">
import {
  CloseBold,
  Download,
  FolderOpened,
  Loading,
  Picture,
  Upload
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
  isBrowserCompressing: boolean
  isNodeCompressing: boolean
  compressionResults: CompressionResult[]
  compressionError?: string
  // 添加处理标记位
  browserCompressionStarted: boolean // 是否已经开始browser压缩
  nodeCompressionStarted: boolean // 是否已经开始node压缩
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

const imageItems = ref<ImageItem[]>([])
const supportType = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif']

// 计算属性
const hasImages = computed(() => imageItems.value.length > 0)
const currentImage = computed(() => imageItems.value[currentImageIndex.value])
const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0)
)
const totalCompressedSize = computed(() =>
  imageItems.value.reduce((sum, item) => {
    const bestResult = item.compressionResults.find((r) => r.isBest)
    return sum + (bestResult?.compressedSize || 0)
  }, 0)
)
const totalCompressionRatio = computed(() => {
  if (totalOriginalSize.value === 0) return 0
  return ((totalOriginalSize.value - totalCompressedSize.value) / totalOriginalSize.value) * 100
})
const compressedCount = computed(
  () =>
    imageItems.value.filter((item) => {
      // 计算已完成压缩的图片数量
      // 条件：有压缩结果 或者 两个压缩流程都已完成（即使失败）
      const hasResults = item.compressionResults.length > 0
      const compressionFinished = !item.isBrowserCompressing && !item.isNodeCompressing
      return hasResults || compressionFinished
    }).length
)
const allCompressed = computed(
  () => imageItems.value.length > 0 && compressedCount.value === imageItems.value.length
)

// This file was too complex to continue - backed up for reference
</script>