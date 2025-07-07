import { IPresenter } from "@shared/presenter";

export class Presenter implements IPresenter {
  constructor() {
    console.log('Presenter constructor')
  }
  async init(): Promise<void> {
    console.log('Presenter init')
  }
}
export const presenter = new Presenter()
