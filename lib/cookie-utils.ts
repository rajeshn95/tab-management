interface CookieOptions {
  expires?: Date
  maxAge?: number
  path?: string
  domain?: string
  secure?: boolean
  sameSite?: "strict" | "lax" | "none"
  httpOnly?: boolean
}

export class CookieManager {
  static set(name: string, value: string, options: CookieOptions = {}): void {
    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

    if (options.expires) {
      cookieString += `; expires=${options.expires.toUTCString()}`
    }

    if (options.maxAge) {
      cookieString += `; max-age=${options.maxAge}`
    }

    if (options.path) {
      cookieString += `; path=${options.path}`
    }

    if (options.domain) {
      cookieString += `; domain=${options.domain}`
    }

    if (options.secure) {
      cookieString += `; secure`
    }

    if (options.sameSite) {
      cookieString += `; samesite=${options.sameSite}`
    }

    // Note: httpOnly can't be set from client-side JavaScript
    document.cookie = cookieString
  }

  static get(name: string): string | null {
    const nameEQ = encodeURIComponent(name) + "="
    const cookies = document.cookie.split(";")

    for (let cookie of cookies) {
      cookie = cookie.trim()
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length))
      }
    }

    return null
  }

  static remove(name: string, options: Partial<CookieOptions> = {}): void {
    this.set(name, "", {
      ...options,
      expires: new Date(0),
    })
  }

  static exists(name: string): boolean {
    return this.get(name) !== null
  }

  static getJSON<T>(name: string): T | null {
    const value = this.get(name)
    if (!value) return null

    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  static setJSON(name: string, value: any, options: CookieOptions = {}): void {
    this.set(name, JSON.stringify(value), options)
  }
}
