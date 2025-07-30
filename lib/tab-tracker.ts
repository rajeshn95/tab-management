export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel | null = null
  private readonly TAB_REGISTRY_KEY = "app_tab_registry"
  private readonly HEARTBEAT_INTERVAL = 1000 // 1 second
  private readonly TAB_TIMEOUT = 3000 // 3 seconds
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null

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

      if (type === "heartbeat" || type === "tab_registered") {
        // Notify components of count change
        const currentCount = this.getTabCount()
        this.dispatchTabCountChange(currentCount)
      }
    })
  }

  private safeBroadcast(message: any): void {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(message)
      }
    } catch (error) {
      console.error("Failed to broadcast message:", error)
    }
  }

  private dispatchTabCountChange(count: number): void {
    window.dispatchEvent(
      new CustomEvent("tabCountChange", {
        detail: { count },
      }),
    )
  }

  init(): void {
    if (this.isInitialized) return

    console.log(`Initializing tab ${this.tabId}`)

    // Register this tab
    this.registerTab()

    // Start heartbeat immediately
    this.startHeartbeat()

    // Start cleanup process
    this.startCleanupProcess()

    // Handle page unload events
    this.setupUnloadHandlers()

    this.isInitialized = true

    // Initial count dispatch
    const initialCount = this.getTabCount()
    this.dispatchTabCountChange(initialCount)

    console.log(`Tab ${this.tabId} initialized with ${initialCount} total tabs`)
  }

  private registerTab(): void {
    const registry = this.getTabRegistry()
    registry[this.tabId] = Date.now()
    this.saveTabRegistry(registry)

    // Broadcast to other tabs
    this.safeBroadcast({
      type: "tab_registered",
      tabId: this.tabId,
      timestamp: Date.now(),
    })

    console.log(`Tab ${this.tabId} registered`)
  }

  private setupUnloadHandlers(): void {
    const unregister = () => {
      console.log(`Unregistering tab ${this.tabId}`)
      const registry = this.getTabRegistry()
      delete registry[this.tabId]
      this.saveTabRegistry(registry)
    }

    // Multiple event handlers for better coverage
    window.addEventListener("beforeunload", unregister)
    window.addEventListener("pagehide", unregister)

    // Visibility change handler
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Don't unregister immediately, just update timestamp
        this.updateHeartbeat()
      }
    })
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat()
    }, this.HEARTBEAT_INTERVAL)
  }

  private updateHeartbeat(): void {
    const registry = this.getTabRegistry()
    if (registry[this.tabId]) {
      registry[this.tabId] = Date.now()
      this.saveTabRegistry(registry)

      // Broadcast heartbeat
      this.safeBroadcast({
        type: "heartbeat",
        tabId: this.tabId,
        timestamp: Date.now(),
      })
    }
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
      if (now - registry[tabId] > this.TAB_TIMEOUT) {
        delete registry[tabId]
        hasChanges = true
        console.log(`Cleaned up dead tab: ${tabId}`)
      }
    })

    if (hasChanges) {
      this.saveTabRegistry(registry)
      const remainingTabs = Object.keys(registry).length

      console.log(`After cleanup: ${remainingTabs} tabs remaining`)

      // Dispatch count change
      this.dispatchTabCountChange(remainingTabs)

      // If no tabs remain, clear session
      if (remainingTabs === 0) {
        console.log("🚨 ALL TABS CLOSED - CLEARING SESSION")
        this.clearSession()
      }
    }
  }

  private clearSession(): void {
    // Clear the registry
    localStorage.removeItem(this.TAB_REGISTRY_KEY)

    // Clear session from localStorage
    localStorage.removeItem("app_session")

    // Notify the app
    window.dispatchEvent(
      new CustomEvent("sessionChange", {
        detail: { type: "logout" },
      }),
    )

    console.log("Session cleared due to no active tabs")
  }

  private getTabRegistry(): Record<string, number> {
    try {
      const registry = localStorage.getItem(this.TAB_REGISTRY_KEY)
      return registry ? JSON.parse(registry) : {}
    } catch (error) {
      console.error("Error reading tab registry:", error)
      return {}
    }
  }

  private saveTabRegistry(registry: Record<string, number>): void {
    try {
      localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
    } catch (error) {
      console.error("Error saving tab registry:", error)
    }
  }

  getTabCount(): number {
    try {
      const registry = this.getTabRegistry()
      const now = Date.now()

      // Only count tabs that are still active (within timeout period)
      const activeTabs = Object.values(registry).filter((timestamp) => now - timestamp <= this.TAB_TIMEOUT)

      return activeTabs.length
    } catch (error) {
      console.error("Error reading tab count:", error)
      return 0
    }
  }

  cleanup(): void {
    console.log(`Cleaning up tab ${this.tabId}`)

    this.isInitialized = false

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Remove this tab from registry
    const registry = this.getTabRegistry()
    delete registry[this.tabId]
    this.saveTabRegistry(registry)

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
