import EventEmitter from 'events'

export class EventBus extends EventEmitter {

  constructor() {
    super()
  }
  /**
   * 仅向主进程发送事件
   */
  sendToMain(eventName: string, ...args: unknown[]): void {
    this.emit(eventName, ...args)
  }

  /**
   * 向渲染进程发送事件
   * @param eventName 事件名称
   * @param target 发送目标：所有窗口或默认标签页
   * @param args 事件参数
   */
  sendToRenderer(eventName: string, ...args: unknown[]): void {

    this.sendToMain(eventName, ...args)
  }

  /**
   * 同时发送到主进程和渲染进程
   * @param eventName 事件名称
   * @param target 发送目标
   * @param args 事件参数
   */
  sendAll(eventName: string, ...args: unknown[]): void {
    // 发送到主进程
    this.sendToMain(eventName, ...args)

    // 发送到渲染进程
    this.sendToRenderer(eventName, ...args)
  }
}

// 创建全局事件总线实例
export const eventBus = new EventBus()
