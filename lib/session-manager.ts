import { CookieManager } from "./cookie-utils"

interface Session {
  username: string
  loginTime: number
  sessionId: string
}

export class SessionManager {
  private static instance: SessionManager
  private broadcastChannel: BroadcastChannel
  private readonly SESSION_COOKIE = "app_session"
  private readonly HEARTBEAT_COOKIE = "session_heartbeat"
  private readonly SESSION_DURATION = 30 * 60 * 1000 // 30 minutes
  private readonly HEARTBEAT_INTERVAL = 5000 // 5 seconds
  private heartbeatInterval: NodeJS.Timeout | null = null
  private sessionId: string

  private constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.broadcastChannel = new BroadcastChannel("session_sync")
    this.setupBroadcastListener()
    this.setupVisibilityListener()
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private setupBroadcastListener() {
    this.broadcastChannel.addEventListener("message", (event) => {
      const { type, session, sessionId } = event.data

      // Ignore messages from this same session
      if (sessionId === this.sessionId) return

      console.log(`📡 Received ${type} message from another tab`)

      // Dispatch custom event for components to listen to
      window.dispatchEvent(
        new CustomEvent("sessionChange", {
          detail: { type, session },
        }),
      )
    })
  }

  private setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // Tab became visible - validate session
        console.log("👁️ Tab became visible - validating session")
        this.validateSession()
      }
    })
  }

  private startHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Start new heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat()
    }, this.HEARTBEAT_INTERVAL)

    // Initial heartbeat
    this.updateHeartbeat()
    console.log("💓 Session heartbeat started")
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      console.log("💔 Session heartbeat stopped")
    }
  }

  private updateHeartbeat() {
    const session = this.getSession()
    if (!session) {
      this.stopHeartbeat()
      return
    }

    // Update heartbeat cookie with fresh expiration
    const expirationTime = new Date(Date.now() + this.SESSION_DURATION)

    CookieManager.setJSON(
      this.HEARTBEAT_COOKIE,
      {
        timestamp: Date.now(),
        sessionId: this.sessionId,
      },
      {
        expires: expirationTime,
        path: "/",
        sameSite: "lax",
      },
    )

    // Also refresh the session cookie expiration
    CookieManager.setJSON(this.SESSION_COOKIE, session, {
      expires: expirationTime,
      path: "/",
      sameSite: "lax",
    })
  }

  private validateSession(): boolean {
    try {
      const session = this.getSession()
      if (!session) {
        console.log("❌ No session cookie found")
        return false
      }

      const heartbeat = CookieManager.getJSON<{ timestamp: number; sessionId: string }>(this.HEARTBEAT_COOKIE)
      if (!heartbeat) {
        console.log("❌ No heartbeat cookie found - session invalid")
        this.clearSession()
        return false
      }

      // Check if session is too old (fallback check)
      const sessionAge = Date.now() - session.loginTime
      if (sessionAge > this.SESSION_DURATION) {
        console.log(`❌ Session too old - ${sessionAge}ms`)
        this.clearSession()
        return false
      }

      console.log("✅ Session is valid")
      return true
    } catch (error) {
      console.error("Error validating session:", error)
      this.clearSession()
      return false
    }
  }

  createSession(username: string): void {
    const session: Session = {
      username,
      loginTime: Date.now(),
      sessionId: this.sessionId,
    }

    const expirationTime = new Date(Date.now() + this.SESSION_DURATION)

    try {
      // Store session in cookie
      CookieManager.setJSON(this.SESSION_COOKIE, session, {
        expires: expirationTime,
        path: "/",
        sameSite: "lax",
      })

      // Start heartbeat
      this.startHeartbeat()

      // Broadcast to other tabs
      this.broadcastChannel.postMessage({
        type: "login",
        session,
        sessionId: this.sessionId,
      })

      console.log("✅ Session created successfully")
    } catch (error) {
      console.error("Failed to create session:", error)
    }
  }

  getSession(): Session | null {
    try {
      const session = CookieManager.getJSON<Session>(this.SESSION_COOKIE)

      if (!session) return null

      // Validate session structure
      if (!session.username || !session.loginTime || !session.sessionId) {
        console.log("❌ Invalid session structure")
        this.clearSession()
        return null
      }

      return session
    } catch (error) {
      console.error("Error reading session:", error)
      this.clearSession()
      return null
    }
  }

  clearSession(): void {
    try {
      // Stop heartbeat
      this.stopHeartbeat()

      // Remove cookies
      CookieManager.remove(this.SESSION_COOKIE, { path: "/" })
      CookieManager.remove(this.HEARTBEAT_COOKIE, { path: "/" })

      // Broadcast logout to other tabs
      this.broadcastChannel.postMessage({
        type: "logout",
        sessionId: this.sessionId,
      })

      console.log("🚨 Session cleared successfully")
    } catch (error) {
      console.error("Failed to clear session:", error)
    }
  }

  // Updated: Only clear session if it's truly the first tab (not a refresh)
  initializeSession(isTrueFirstTab: boolean): boolean {
    console.log(`🔍 Initializing session... (True first tab: ${isTrueFirstTab})`)

    // If this is truly the first tab (not a refresh), clear session and force login
    if (isTrueFirstTab) {
      console.log("🆕 True first tab detected - clearing any existing session")
      this.clearSession()
      return false
    }

    // Not first tab or it's a refresh - check for existing valid session
    const session = this.getSession()
    if (!session) {
      console.log("❌ No existing session")
      return false
    }

    const isValid = this.validateSession()
    if (isValid) {
      // Restart heartbeat for existing valid session
      this.startHeartbeat()
      console.log("✅ Session initialized successfully")
      return true
    }

    return false
  }

  cleanup(): void {
    console.log("🧹 Cleaning up session manager")
    this.stopHeartbeat()
    this.broadcastChannel.close()
  }
}
