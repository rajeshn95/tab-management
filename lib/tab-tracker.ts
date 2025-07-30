export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel
  private readonly TAB_COUNT_KEY = "app_tab_count"
  private readonly TAB_REGISTRY_KEY = "app_tab_registry"
  private readonly HEARTBEAT_INTERVAL = 1000 // 1 second
  private readonly TAB_TIMEOUT = 3000 // 3 seconds
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.broadcastChannel = new BroadcastChannel("tab_tracker")
    this.tabId = this.generateTabId()
    this.setupBroadcastListener()
  }

  static getInstance(): TabTracker {
    if (!TabTracker.instance) {
      TabTracker.instance = new TabTracker()
    }
    return TabTracker.instance
  }

  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private setupBroadcastListener() {
    this.broadcastChannel.addEventListener("message", (event) => {
      const { type, tabId, count } = event.data

      if (type === "tab_opened" || type === "tab_closed" || type === "tab_cleanup") {
        // Update local count and notify components
        const currentCount = this.getTabCount()
        window.dispatchEvent(
          new CustomEvent("tabCountChange", {
            detail: { count: currentCount },
          }),
        )
      } else if (type === "heartbeat") {
        // Another tab is sending a heartbeat - update its timestamp
        this.updateTabHeartbeat(event.data.tabId)
      }
    })
  }

  init(): void {
    if (this.isInitialized) return

    // Register this tab
    this.registerTab()

    // Start heartbeat
    this.startHeartbeat()

    // Clean up dead tabs periodically
    this.startTabCleanup()

    // Set up beforeunload listener
    window.addEventListener("beforeunload", () => {
      this.unregisterTab()
    })

    // Set up visibility change listener
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // Tab became visible, ensure it's registered
        this.registerTab()
      }
    })

    this.isInitialized = true
    console.log(`Tab ${this.tabId} initialized`)
  }

  private registerTab(): void {
    const registry = this.getTabRegistry()
    registry[this.tabId] = {
      timestamp: Date.now(),
      active: true,
    }
    localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))

    this.updateTabCount()

    // Broadcast to other tabs
    this.broadcastChannel.postMessage({
      type: "tab_opened",
      tabId: this.tabId,
      count: this.getTabCount(),
    })

    console.log(`Tab ${this.tabId} registered`)
  }

  private unregisterTab(): void {
    const registry = this.getTabRegistry()
    delete registry[this.tabId]
    localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))

    this.updateTabCount()

    // Broadcast to other tabs
    this.broadcastChannel.postMessage({
      type: "tab_closed",
      tabId: this.tabId,
      count: this.getTabCount(),
    })

    console.log(`Tab ${this.tabId} unregistered`)
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Update our own timestamp
      const registry = this.getTabRegistry()
      if (registry[this.tabId]) {
        registry[this.tabId].timestamp = Date.now()
        localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
      }

      // Broadcast heartbeat to other tabs
      this.broadcastChannel.postMessage({
        type: "heartbeat",
        tabId: this.tabId,
        timestamp: Date.now(),
      })
    }, this.HEARTBEAT_INTERVAL)
  }

  private updateTabHeartbeat(tabId: string): void {
    const registry = this.getTabRegistry()
    if (registry[tabId]) {
      registry[tabId].timestamp = Date.now()
      localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
    }
  }

  private startTabCleanup(): void {
    setInterval(() => {
      this.cleanupDeadTabs()
    }, this.HEARTBEAT_INTERVAL)
  }

  private cleanupDeadTabs(): void {
    const registry = this.getTabRegistry()
    const now = Date.now()
    let hasChanges = false

    Object.keys(registry).forEach((tabId) => {
      if (now - registry[tabId].timestamp > this.TAB_TIMEOUT) {
        delete registry[tabId]
        hasChanges = true
        console.log(`Cleaned up dead tab: ${tabId}`)
      }
    })

    if (hasChanges) {
      localStorage.setItem(this.TAB_REGISTRY_KEY, JSON.stringify(registry))
      this.updateTabCount()

      // Broadcast cleanup to other tabs
      this.broadcastChannel.postMessage({
        type: "tab_cleanup",
        count: this.getTabCount(),
      })

      // Check if this was the last tab
      const tabCount = this.getTabCount()
      if (tabCount === 0) {
        console.log("All tabs closed - clearing session")
        // Import SessionManager here to avoid circular dependency
        const { SessionManager } = require("./session")
        const sessionManager = SessionManager.getInstance()
        sessionManager.clearSession()

        // Notify components
        window.dispatchEvent(
          new CustomEvent("tabCountChange", {
            detail: { count: 0 },
          }),
        )
      }
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

  private updateTabCount(): void {
    const registry = this.getTabRegistry()
    const count = Object.keys(registry).length
    localStorage.setItem(this.TAB_COUNT_KEY, count.toString())
  }

  getTabCount(): number {
    try {
      const registry = this.getTabRegistry()
      return Object.keys(registry).length
    } catch (error) {
      console.error("Error reading tab count:", error)
      return 0
    }
  }

  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    this.unregisterTab()
    this.broadcastChannel.close()
  }
}
