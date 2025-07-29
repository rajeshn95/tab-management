interface Session {
  username: string
  loginTime: number
}

export class SessionManager {
  private static instance: SessionManager
  private broadcastChannel: BroadcastChannel
  private readonly SESSION_KEY = "app_session"

  private constructor() {
    this.broadcastChannel = new BroadcastChannel("session_sync")
    this.setupBroadcastListener()
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private setupBroadcastListener() {
    this.broadcastChannel.addEventListener("message", (event) => {
      const { type, session } = event.data

      // Dispatch custom event for components to listen to
      window.dispatchEvent(
        new CustomEvent("sessionChange", {
          detail: { type, session },
        }),
      )
    })
  }

  createSession(username: string): void {
    const session: Session = {
      username,
      loginTime: Date.now(),
    }

    // Store in localStorage
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session))

    // Broadcast to other tabs
    this.broadcastChannel.postMessage({
      type: "login",
      session,
    })

    console.log("Session created and broadcasted")
  }

  getSession(): Session | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY)
      return sessionData ? JSON.parse(sessionData) : null
    } catch (error) {
      console.error("Error reading session:", error)
      return null
    }
  }

  clearSession(): void {
    // Remove from localStorage
    localStorage.removeItem(this.SESSION_KEY)

    // Broadcast logout to other tabs
    this.broadcastChannel.postMessage({
      type: "logout",
    })

    console.log("Session cleared and broadcasted")
  }

  cleanup(): void {
    this.broadcastChannel.close()
  }
}
