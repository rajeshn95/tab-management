import type { SessionManager } from "./session"

export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel | null = null
  private readonly TAB_REGISTRY_KEY = "app_tab_registry"
  private readonly LAST_ACTIVITY_KEY = "app_last_activity"
  private readonly SESSION_TIMEOUT = 5000 // 5 seconds after last activity
  private readonly HEARTBEAT_INTERVAL = 1000 // 1 second
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null
  private sessionManager: SessionManager | null = null

  private constructor() {
    this.tabId = this.generateTabId()
    this.initializeBroadcastChannel()
  }

  static getInstance(): TabTracker {
    if (!TabTracker.instance) {
      TabTracker.instance = new TabTracker()
    }
    return TabTracker.instance
  }

  // Method to inject the session manager dependency
  setSessionManager(sessionManager: SessionManager): void {
    this.sessionManager = sessionManager
  }

  private initializeBroadcastChannel(): void {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.close()
      }
      this.broadcastChannel = new BroadcastChannel("tab_tracker")
      this.setupBroadcastListener()
    } catch (error) {
      console.error("Failed to initialize BroadcastChannel:", error)
      this.broadcastChannel = null
    }
  }

  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private setupBroadcastListener() {
    if (!this.broadcastChannel) return

    this.broadcastChannel.addEventListener("message", (event) => {
      const { type } = event.data

      if (type === "tab_opened" || type === "tab_closed" || type === "heartbeat") {
        // Update activity timestamp
        this.updateLastActivity()

        // Notify components of count change
        const currentCount = this.getTabCount()
        window.dispatchEvent(
          new CustomEvent("tabCountChange", {
            detail: { count: currentCount },
          }),
        )
      }
    })

    this.broadcastChannel.addEventListener("messageerror", (error) => {
      console.error("BroadcastChannel message error:", error)
    })
  }

  private safeBroadcast(message: any): void {
    try {
      if (this.broadcastChannel && this.broadcastChannel.readyState !== "closed") {
        this.broadcastChannel.postMessage(message)
      } else {
        // Try to reinitialize the channel
        this.initializeBroadcastChannel()
        if (this.broadcastChannel) {
          this.broadcastChannel.postMessage(message)
        }
      }
    } catch (error) {
      console.error("Failed to broadcast message:", error)
      // Reinitialize channel on error
      this.initializeBroadcastChannel()
    }
  }

  init(): void {
    if (this.isInitialized) return

    // Ensure broadcast channel is ready
    if (!this.broadcastChannel) {
      this.initializeBroadcastChannel()
    }

    // First, check if session should be cleared due to inactivity
    this.checkSessionValidity()

    // Register this tab
    this.registerTab()

    // Start heartbeat
    this.startHeartbeat()

    // Start cleanup process
    this.startCleanupProcess()

    // Set up beforeunload listener
    window.addEventListener("beforeunload", () => {
      this.unregisterTab()
    })

    // Set up page hide listener (more reliable than beforeunload)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Update activity when tab becomes hidden
        this.updateLastActivity()
      } else if (document.visibilityState === "visible") {
        // Re-register when tab becomes visible
        this.registerTab()
      }
    })

    // Set up page hide event (fires when page is being unloaded)
    window.addEventListener("pagehide", () => {
      this.unregisterTab()
    })

    this.isInitialized = true
    console.log(`Tab ${this.tabId} initialized`)
  }

  private checkSessionValidity(): void {
    const lastActivity = this.getLastActivity()
    const now = Date.now()

    // If there's been no activity for longer than the timeout, clear session
    if (lastActivity && now - lastActivity > this.SESSION_TIMEOUT) {
      console.log("Session expired due to inactivity - clearing session")

      // Clear the tab registry
      localStorage.removeItem(this.TAB_REGISTRY_KEY)
      localStorage.removeItem(this.LAST_ACTIVITY_KEY)

      // Clear session if session manager is available
      if (this.sessionManager) {
        try {
          this.sessionManager.clearSession()
        } catch (error) {
          console.error("Error clearing session:", error)
        }
      }

      // Notify components
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("sessionChange", {
            detail: { type: "logout" },
          }),
        )
      }, 100)
    }
  }

  private registerTab(): void {
    const registry = this.getTabRegistry()
    registry[this.tabId] = {
      timestamp: Date.now(),
      active: true,
    }
    localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
    this.updateLastActivity()

    // Broadcast to other tabs
    this.safeBroadcast({
      type: "tab_opened",
      tabId: this.tabId,
      timestamp: Date.now(),
    })

    console.log(`Tab ${this.tabId} registered`)
  }

  private unregisterTab(): void {
    const registry = this.getTabRegistry()
    delete registry[this.tabId]
    localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
    this.updateLastActivity()

    // Broadcast to other tabs
    this.safeBroadcast({
      type: "tab_closed",
      tabId: this.tabId,
      timestamp: Date.now(),
    })

    console.log(`Tab ${this.tabId} unregistered`)
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(() => {
      // Update our own timestamp
      const registry = this.getTabRegistry()
      if (registry[this.tabId]) {
        registry[this.tabId].timestamp = Date.now()
        localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
        this.updateLastActivity()
      }

      // Broadcast heartbeat to other tabs
      this.safeBroadcast({
        type: "heartbeat",
        tabId: this.tabId,
        timestamp: Date.now(),
      })
    }, this.HEARTBEAT_INTERVAL)
  }

  private startCleanupProcess(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadTabs()
    }, this.HEARTBEAT_INTERVAL)
  }

  private cleanupDeadTabs(): void {
    const registry = this.getTabRegistry()
    const now = Date.now()
    let hasChanges = false

    // Remove tabs that haven't sent heartbeat in timeout period
    Object.keys(registry).forEach((tabId) => {
      if (now - registry[tabId].timestamp > this.SESSION_TIMEOUT) {
        delete registry[tabId]
        hasChanges = true
        console.log(`Cleaned up dead tab: ${tabId}`)
      }
    })

    if (hasChanges) {
      localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))

      // Check if this was the last tab
      const remainingTabs = Object.keys(registry).length
      if (remainingTabs === 0) {
        console.log("All tabs closed - clearing session")
        this.clearSessionDueToNoTabs()
      }

      // Notify components
      window.dispatchEvent(
        new CustomEvent("tabCountChange", {
          detail: { count: remainingTabs },
        }),
      )
    }
  }

  private clearSessionDueToNoTabs(): void {
    // Clear last activity
    localStorage.removeItem(this.LAST_ACTIVITY_KEY)

    // Clear session if session manager is available
    if (this.sessionManager) {
      try {
        this.sessionManager.clearSession()
      } catch (error) {
        console.error("Error clearing session:", error)
      }
    }

    // Notify components
    window.dispatchEvent(
      new CustomEvent("sessionChange", {
        detail: { type: "logout" },
      }),
    )
  }

  private updateLastActivity(): void {
    try {
      localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString())
    } catch (error) {
      console.error("Error updating last activity:", error)
    }
  }

  private getLastActivity(): number | null {
    try {
      const activity = localStorage.getItem(this.LAST_ACTIVITY_KEY)
      return activity ? Number.parseInt(activity, 10) : null
    } catch (error) {
      console.error("Error reading last activity:", error)
      return null
    }
  }

  private getTabRegistry(): Record<string, { timestamp: number; active: boolean }> {
    try {
      const registry = localStorage.getItem(this.TAB_REGISTRY_KEY)
      return registry ? JSON.parse(registry) : {}
    } catch (error) {
      console.error("Error reading tab registry:", error)
      return {}
    }
  }

  getTabCount(): number {
    try {
      const registry = this.getTabRegistry()
      const now = Date.now()

      // Only count tabs that are still active (within timeout period)
      const activeTabs = Object.values(registry).filter((tab) => now - tab.timestamp <= this.SESSION_TIMEOUT)

      return activeTabs.length
    } catch (error) {
      console.error("Error reading tab count:", error)
      return 0
    }
  }

  cleanup(): void {
    this.isInitialized = false

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.unregisterTab()

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close()
      } catch (error) {
        console.error("Error closing broadcast channel:", error)
      }
      this.broadcastChannel = null
    }
  }
}
