export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel
  private readonly TAB_COUNT_KEY = "app_tab_count"
  private tabId: string
  private isInitialized = false

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

      if (type === "tab_opened" || type === "tab_closed") {
        // Update local count and notify components
        const currentCount = this.getTabCount()
        window.dispatchEvent(
          new CustomEvent("tabCountChange", {
            detail: { count: currentCount },
          }),
        )
      } else if (type === "request_count") {
        // Another tab is requesting the current count
        this.broadcastChannel.postMessage({
          type: "count_response",
          tabId: this.tabId,
          count: this.getTabCount(),
        })
      }
    })
  }

  init(): void {
    if (this.isInitialized) return

    // Increment tab count
    this.incrementTabCount()

    // Set up beforeunload listener to decrement count when tab closes
    window.addEventListener("beforeunload", () => {
      this.decrementTabCount()
    })

    // Set up visibility change listener for additional cleanup
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Tab is being hidden, but not necessarily closed
        // We rely on beforeunload for actual closing
      }
    })

    this.isInitialized = true
    console.log(`Tab ${this.tabId} initialized`)
  }

  private incrementTabCount(): void {
    const currentCount = this.getTabCount()
    const newCount = currentCount + 1
    localStorage.setItem(this.TAB_COUNT_KEY, newCount.toString())

    // Broadcast to other tabs
    this.broadcastChannel.postMessage({
      type: "tab_opened",
      tabId: this.tabId,
      count: newCount,
    })

    // Notify local components
    window.dispatchEvent(
      new CustomEvent("tabCountChange", {
        detail: { count: newCount },
      }),
    )

    console.log(`Tab count incremented to ${newCount}`)
  }

  private decrementTabCount(): void {
    const currentCount = this.getTabCount()
    const newCount = Math.max(0, currentCount - 1)
    localStorage.setItem(this.TAB_COUNT_KEY, newCount.toString())

    // Broadcast to other tabs
    this.broadcastChannel.postMessage({
      type: "tab_closed",
      tabId: this.tabId,
      count: newCount,
    })

    // If this was the last tab, clear the session
    if (newCount === 0) {
      // Import SessionManager here to avoid circular dependency
      const { SessionManager } = require("./session")
      const sessionManager = SessionManager.getInstance()
      sessionManager.clearSession()
    }

    console.log(`Tab count decremented to ${newCount}`)
  }

  getTabCount(): number {
    try {
      const count = localStorage.getItem(this.TAB_COUNT_KEY)
      return count ? Number.parseInt(count, 10) : 0
    } catch (error) {
      console.error("Error reading tab count:", error)
      return 0
    }
  }

  cleanup(): void {
    this.broadcastChannel.close()
  }
}
