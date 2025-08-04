import { CookieManager } from "./cookie-utils"

interface TabData {
  timestamp: number
  lastSeen: number
}

export class TabTracker {
  private static instance: TabTracker
  private broadcastChannel: BroadcastChannel
  private readonly TAB_COUNT_COOKIE = "active_tabs"
  private readonly CLEANUP_INTERVAL = 10000 // Clean up dead tabs every 10 seconds
  private readonly TAB_TIMEOUT = 15000 // Consider tab dead after 15 seconds
  private readonly TAB_COOKIE_DURATION = 60 * 60 * 1000 // 1 hour
  private tabId: string
  private isInitialized = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

    console.log("🚀 Tab tracker initializing...")

    // Register this tab
    this.registerTab()

    // Start heartbeat
    this.startHeartbeat()

    // Start cleanup process
    this.startCleanup()

    // Handle tab closing
    window.addEventListener("beforeunload", () => this.unregisterTab())
    window.addEventListener("pagehide", () => this.unregisterTab())

    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // Tab became visible - refresh registration
        this.registerTab()
      }
    })

    this.isInitialized = true
    console.log(`✅ Tab tracker initialized: ${this.tabId}`)
  }

  private registerTab(): void {
    const tabs = this.getActiveTabs()
    tabs[this.tabId] = {
      timestamp: Date.now(),
      lastSeen: Date.now(),
    }

    try {
      const expirationTime = new Date(Date.now() + this.TAB_COOKIE_DURATION)
      CookieManager.setJSON(this.TAB_COUNT_COOKIE, tabs, {
        expires: expirationTime,
        path: "/",
        sameSite: "lax",
      })

      this.broadcastTabUpdate()
      console.log(`📝 Tab registered: ${this.tabId}`)
    } catch (error) {
      console.error("Failed to register tab:", error)
    }
  }

  private unregisterTab(): void {
    const tabs = this.getActiveTabs()
    delete tabs[this.tabId]

    try {
      if (Object.keys(tabs).length === 0) {
        // No more tabs - remove the cookie
        CookieManager.remove(this.TAB_COUNT_COOKIE, { path: "/" })
      } else {
        // Update cookie with remaining tabs
        const expirationTime = new Date(Date.now() + this.TAB_COOKIE_DURATION)
        CookieManager.setJSON(this.TAB_COUNT_COOKIE, tabs, {
          expires: expirationTime,
          path: "/",
          sameSite: "lax",
        })
      }

      this.broadcastTabUpdate()
      console.log(`🗑️ Tab unregistered: ${this.tabId}`)
    } catch (error) {
      console.error("Failed to unregister tab:", error)
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updateTabHeartbeat()
    }, 3000) // Every 3 seconds
  }

  private updateTabHeartbeat(): void {
    const tabs = this.getActiveTabs()
    if (tabs[this.tabId]) {
      tabs[this.tabId].lastSeen = Date.now()
      try {
        const expirationTime = new Date(Date.now() + this.TAB_COOKIE_DURATION)
        CookieManager.setJSON(this.TAB_COUNT_COOKIE, tabs, {
          expires: expirationTime,
          path: "/",
          sameSite: "lax",
        })
      } catch (error) {
        console.error("Failed to update tab heartbeat:", error)
      }
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadTabs()
    }, this.CLEANUP_INTERVAL)
  }

  private cleanupDeadTabs(): void {
    const tabs = this.getActiveTabs()
    const currentTime = Date.now()
    let hasChanges = false

    for (const [tabId, tabData] of Object.entries(tabs)) {
      if (currentTime - tabData.lastSeen > this.TAB_TIMEOUT) {
        delete tabs[tabId]
        hasChanges = true
        console.log(`🧹 Cleaned up dead tab: ${tabId}`)
      }
    }

    if (hasChanges) {
      try {
        if (Object.keys(tabs).length === 0) {
          CookieManager.remove(this.TAB_COUNT_COOKIE, { path: "/" })
        } else {
          const expirationTime = new Date(Date.now() + this.TAB_COOKIE_DURATION)
          CookieManager.setJSON(this.TAB_COUNT_COOKIE, tabs, {
            expires: expirationTime,
            path: "/",
            sameSite: "lax",
          })
        }
        this.broadcastTabUpdate()
      } catch (error) {
        console.error("Failed to cleanup dead tabs:", error)
      }
    }
  }

  private getActiveTabs(): Record<string, TabData> {
    return CookieManager.getJSON<Record<string, TabData>>(this.TAB_COUNT_COOKIE) || {}
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
    console.log("🧹 Cleaning up tab tracker")

    this.isInitialized = false

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.unregisterTab()
    this.broadcastChannel.close()
  }
}
