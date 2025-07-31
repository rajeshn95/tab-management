export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel
  private readonly TAB_REGISTRY_KEY = "app_tab_registry"
  private readonly TAB_COUNT_KEY = "active_tabs"
  private readonly HEARTBEAT_INTERVAL = 2000 // 2 seconds
  private readonly TAB_TIMEOUT = 3000 // 3 seconds
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.broadcastChannel = new BroadcastChannel("tab_sync")
    this.setupListener()
  }

  static getInstance(): TabTracker {
    if (!TabTracker.instance) {
      TabTracker.instance = new TabTracker()
    }
    return TabTracker.instance
  }

  private setupListener() {
    this.broadcastChannel.addEventListener("message", (event) => {
      if (event.data.type === "tab_update") {
        this.updateTabCount()
      }
    })
  }

  init(): void {
    if (this.isInitialized) return

    console.log("🚀 Tab tracker init")

    // Add this tab to the count
    this.addTab()

    // Start heartbeat
    this.startHeartbeat()

    // Handle tab closing
    window.addEventListener("beforeunload", () => this.removeTab())
    window.addEventListener("pagehide", () => this.removeTab())

    this.isInitialized = true

    // Initial count dispatch
    const initialCount = this.getTabCount()
    this.dispatchTabCountChange(initialCount)

    console.log(`Tab ${this.tabId} initialized with ${initialCount} total tabs`)
  }

  private addTab(): void {
    const tabs = this.getActiveTabs()
    tabs[this.tabId] = Date.now()
    localStorage.setItem(this.TAB_COUNT_KEY, JSON.stringify(tabs))

    this.broadcastTabUpdate()
    this.updateTabCount()

    console.log(`✅ Tab added: ${this.tabId}`)
  }

  private removeTab(): void {
    const tabs = this.getActiveTabs()
    delete tabs[this.tabId]
    localStorage.setItem(this.TAB_COUNT_KEY, JSON.stringify(tabs))

    console.log(`❌ Tab removed: ${this.tabId}`)

    // Check if this was the last tab
    if (Object.keys(tabs).length === 0) {
      console.log("🚨 LAST TAB CLOSED - CLEARING SESSION")
      localStorage.removeItem("app_session")
      localStorage.removeItem(this.TAB_COUNT_KEY)
    }

    this.broadcastTabUpdate()
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const tabs = this.getActiveTabs()
      if (tabs[this.tabId]) {
        tabs[this.tabId] = Date.now()
        localStorage.setItem(this.TAB_COUNT_KEY, JSON.stringify(tabs))
      }
    }, this.HEARTBEAT_INTERVAL)
  }

  private getActiveTabs(): Record<string, number> {
    try {
      const tabs = localStorage.getItem(this.TAB_COUNT_KEY)
      return tabs ? JSON.parse(tabs) : {}
    } catch {
      return {}
    }
  }

  private broadcastTabUpdate(): void {
    try {
      this.broadcastChannel.postMessage({ type: "tab_update" })
    } catch (error) {
      console.error("Broadcast failed:", error)
    }
  }

  private updateTabCount(): void {
    const count = Object.keys(this.getActiveTabs()).length
    window.dispatchEvent(new CustomEvent("tabCountChange", { detail: { count } }))
  }

  getTabCount(): number {
    return Object.keys(this.getActiveTabs()).length
  }

  cleanup(): void {
    console.log(`Cleaning up tab ${this.tabId}`)

    this.isInitialized = false

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    this.removeTab()
    this.broadcastChannel.close()
  }

  private dispatchTabCountChange(count: number): void {
    window.dispatchEvent(
      new CustomEvent("tabCountChange", {
        detail: { count },
      }),
    )
  }
}
