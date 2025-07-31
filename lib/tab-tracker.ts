export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel
  private readonly TAB_COUNT_KEY = "active_tabs"
  private readonly LAST_ACTIVITY_KEY = "last_activity"
  private readonly HEARTBEAT_INTERVAL = 2000 // 2 seconds
  private readonly SESSION_TIMEOUT = 5000 // 5 seconds - if gap > this, clear session
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  private sessionClearTimeout: NodeJS.Timeout | null = null

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
      } else if (event.data.type === "tab_registered") {
        // Cancel session clearing if a new tab registers
        this.cancelSessionClear()
      }
    })
  }

  // NEW: Check if session is valid based on last activity
  isSessionValid(): boolean {
    try {
      const lastActivity = localStorage.getItem(this.LAST_ACTIVITY_KEY)
      if (!lastActivity) {
        console.log("❌ No last activity found")
        return false
      }

      const lastActivityTime = Number.parseInt(lastActivity)
      const currentTime = Date.now()
      const timeSinceLastActivity = currentTime - lastActivityTime

      console.log(`⏰ Time since last activity: ${timeSinceLastActivity}ms`)

      if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
        console.log("❌ Session expired - too much time passed")
        return false
      }

      console.log("✅ Session valid - recent activity detected")
      return true
    } catch (error) {
      console.error("Error checking session validity:", error)
      return false
    }
  }

  // NEW: Update last activity timestamp
  private updateLastActivity(): void {
    localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString())
  }

  init(): void {
    if (this.isInitialized) return

    console.log("🚀 Tab tracker init")

    // Cancel any pending session clear (in case of refresh)
    this.cancelSessionClear()

    // Update activity timestamp
    this.updateLastActivity()

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

    // Update last activity
    this.updateLastActivity()

    // Broadcast that a new tab registered
    this.broadcastChannel.postMessage({ type: "tab_registered", tabId: this.tabId })
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
      console.log("⏳ Last tab removed - scheduling session clear...")
      this.scheduleSessionClear()
    }

    this.broadcastTabUpdate()
  }

  private scheduleSessionClear(): void {
    // Clear any existing timeout
    this.cancelSessionClear()

    // Schedule session clearing after delay
    this.sessionClearTimeout = setTimeout(() => {
      console.log("🚨 CLEARING SESSION - No tabs registered within delay period")
      localStorage.removeItem("app_session")
      localStorage.removeItem(this.TAB_COUNT_KEY)

      // Notify other potential tabs
      window.dispatchEvent(
        new CustomEvent("sessionChange", {
          detail: { type: "logout" },
        }),
      )
    }, this.SESSION_CLEAR_DELAY)
  }

  private cancelSessionClear(): void {
    if (this.sessionClearTimeout) {
      console.log("✅ Session clear cancelled - new tab registered")
      clearTimeout(this.sessionClearTimeout)
      this.sessionClearTimeout = null
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const tabs = this.getActiveTabs()
      if (tabs[this.tabId]) {
        tabs[this.tabId] = Date.now()
        localStorage.setItem(this.TAB_COUNT_KEY, JSON.stringify(tabs))

        // Update last activity on each heartbeat
        this.updateLastActivity()
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

    // Cancel any pending session clear
    this.cancelSessionClear()

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
