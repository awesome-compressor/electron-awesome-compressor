import { type IPresenter } from '@shared/presenter'
import { toRaw } from 'vue'

// 安全的序列化函数，避免克隆不可序列化的对象
function safeSerialize(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  // 处理 TypedArray (Uint8Array, Int8Array, etc.)
  if (obj instanceof Uint8Array) {
    return obj // Uint8Array 可以直接通过 IPC 传输
  }

  // 处理其他 TypedArray 类型
  if (ArrayBuffer.isView(obj)) {
    // 转换为 Uint8Array 以便 IPC 传输
    return new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength)
  }

  // 处理 ArrayBuffer
  if (obj instanceof ArrayBuffer) {
    return new Uint8Array(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => safeSerialize(item))
  }

  // 对于普通对象，只复制可序列化的属性
  const serialized: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = (obj as Record<string, unknown>)[key]
      // 跳过函数、Symbol和其他不可序列化的值
      if (
        typeof value !== 'function' &&
        typeof value !== 'symbol' &&
        typeof value !== 'undefined'
      ) {
        serialized[key] = safeSerialize(value)
      }
    }
  }
  return serialized
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createProxy(presenterName: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_, functionName) {
      return async (...payloads: []) => {
        try {

          // 先使用 toRaw 获取原始对象，然后安全序列化
          const rawPayloads = payloads.map((e) => safeSerialize(toRaw(e)))


          return await window.electron.ipcRenderer
            .invoke('presenter:call', presenterName, functionName, ...rawPayloads)
            .catch((e: Error) => {
              console.warn(
                `[Renderer IPC Error] ${presenterName}.${functionName as string}:`,
                e
              )
              return null
            })
        } catch (error) {
          console.warn('error on payload serialization', functionName, error)
          // 如果序列化失败，尝试直接传递原始数据
          return await window.electron.ipcRenderer
            .invoke('presenter:call', presenterName, functionName, ...payloads)
            .catch((e: Error) => {
              console.warn('error on presenter invoke fallback', functionName, e)
              return null
            })
        }
      }
    }
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentersProxy: IPresenter = new Proxy({} as any, {
  get(_, presenterName) {
    return createProxy(presenterName as string)
  }
})

export function usePresenter<T extends keyof IPresenter>(name: T): IPresenter[T] {
  return presentersProxy[name]
}
