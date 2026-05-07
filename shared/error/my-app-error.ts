/** HTTP 応答へマッピングするアプリ共通エラー（フレームワーク非依存） */
export class MyAppError extends Error {
  readonly status: number

  constructor(status: number, message: string = 'Internal Server Error', options?: ErrorOptions) {
    super(message, options)
    this.name = 'MyAppError'
    this.status = status
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isMyAppError(err: unknown): err is MyAppError {
  return err instanceof MyAppError
}

export class NotFoundError extends MyAppError {
  constructor(message: string = 'Not Found') {
    super(404, message)
  }
}

// 403 Forbidden
export class ForbiddenError extends MyAppError {
  constructor(message: string = 'Forbidden') {
    super(403, message)
  }
}
// 403 Forbidden
export class SubscriptionInactiveError extends ForbiddenError {
  constructor(message: string = 'Subscription is not active') {
    super(message)
  }
}
