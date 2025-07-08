import { IPresenter } from '@shared/presenter'
import { WindowPresenter } from './windowPresenter'
import { ProtocolPresenter } from './protocolPresenter'
import { ipcMain, IpcMainInvokeEvent } from 'electron'

export class Presenter implements IPresenter {
  windowPresenter: WindowPresenter
  protocolPresenter: ProtocolPresenter

  constructor() {
    console.log('Presenter constructor')
    this.windowPresenter = new WindowPresenter()
    this.protocolPresenter = new ProtocolPresenter()
  }

  /**
   * Initialize presenter and all its components
   */
  async init(): Promise<void> {
    console.log('Presenter init')
    await this.protocolPresenter.init()
    await this.windowPresenter.init()
  }

  /**
   * Cleanup presenter and all its components
   */
  async cleanup(): Promise<void> {
    console.log('Presenter cleanup')
    await this.windowPresenter.cleanup()
    await this.protocolPresenter.cleanup()
  }
}

export const presenter = new Presenter()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFunction(obj: any, prop: string): obj is { [key: string]: (...args: any[]) => any } {
  return typeof obj[prop] === 'function'
}

ipcMain.handle(
  'presenter:call',
  (_event: IpcMainInvokeEvent, name: string, method: string, ...payloads: unknown[]) => {
    try {
      // 通过名称获取对应的 Presenter 实例
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calledPresenter: any = presenter[name as keyof Presenter]

      if (!calledPresenter) {
        console.warn(`[IPC Warning] calling wrong presenter: ${name}`)
        return { error: `Presenter "${name}" not found` }
      }

      // 检查方法是否存在且为函数
      if (isFunction(calledPresenter, method)) {
        // 调用方法并返回结果
        return calledPresenter[method](...payloads)
      } else {
        console.warn(
          `[IPC Warning] called method is not a function or does not exist: ${name}.${method}`
        )
        return { error: `Method "${method}" not found or not a function on "${name}"` }
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      // 尝试获取调用上下文以改进错误日志
      console.error(`[IPC Error] ${name}.${method}:`, e)
      return { error: e.message || String(e) }
    }
  }
)
