/** HTTP 応答へマッピングするアプリ共通エラー（フレームワーク非依存） */
export class MyAppError extends Error {
  readonly status: number

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MyAppError'
    this.status = status
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isMyAppError(err: unknown): err is MyAppError {
  return err instanceof MyAppError
}
