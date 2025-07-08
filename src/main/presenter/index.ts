import { IPresenter } from '@shared/presenter'
import { WindowPresenter } from './windowPresenter'

export class Presenter implements IPresenter {
  windowPresenter: WindowPresenter

  constructor() {
    console.log('Presenter constructor')
    this.windowPresenter = new WindowPresenter()
  }

  /**
   * Initialize presenter and all its components
   */
  async init(): Promise<void> {
    console.log('Presenter init')
    await this.windowPresenter.init()
  }

  /**
   * Cleanup presenter and all its components
   */
  async cleanup(): Promise<void> {
    console.log('Presenter cleanup')
    await this.windowPresenter.cleanup()
  }
}

export const presenter = new Presenter()
