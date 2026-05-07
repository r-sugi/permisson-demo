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

/**
 * 基本エラー
 */
export class NotFoundError extends MyAppError {
  constructor(message: string = 'Not Found') {
    super(404, message)
  }
}

// 401 Unauthorized
export class ForbiddenError extends MyAppError {
  constructor(message: string = 'Forbidden') {
    super(403, message)
  }
}

/**
 * Policy系エラー
 */
// ReBAC でリソースが見つからない場合のエラー
export class ResourceNotFoundError extends NotFoundError {
  constructor(message: string = 'Resource not found') {
    super(message)
  }
}
// PBAC で操作が許可されない場合のエラー
export class PermissionDeniedError extends ForbiddenError {
  constructor(message: string = 'Permission denied') {
    super(message)
  }
}

/**
 * Auth系エラー
 */
// 403 Forbidden
export class SubscriptionInactiveError extends ForbiddenError {
  constructor(message: string = 'Subscription is not active') {
    super(message)
  }
}
