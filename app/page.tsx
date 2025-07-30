"use client"

import { useState, useEffect } from "react"
import LoginForm from "@/components/login-form"
import Dashboard from "@/components/dashboard"
import { SessionManager } from "@/lib/session"
import { TabTracker } from "@/lib/tab-tracker"

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [username, setUsername] = useState("")

  useEffect(() => {
    console.log("🚀 App initializing...")

    // Initialize session manager and tab tracker
    const sessionManager = SessionManager.getInstance()
    const tabTracker = TabTracker.getInstance()

    // Check for existing session first
    const existingSession = sessionManager.getSession()
    if (existingSession) {
      setIsAuthenticated(true)
      setUsername(existingSession.username)
      console.log("✅ Session restored from localStorage")
    }

    // Initialize tab tracking
    tabTracker.init()
    setIsLoading(false)

    // Listen for session changes from other tabs
    const handleSessionChange = (event: CustomEvent) => {
      const { type, session } = event.detail
      console.log("📡 Session change received:", type)

      if (type === "login") {
        setIsAuthenticated(true)
        setUsername(session.username)
        console.log("✅ Session synced from another tab - login")
      } else if (type === "logout") {
        setIsAuthenticated(false)
        setUsername("")
        console.log("❌ Session synced from another tab - logout")
      }
    }

    // Listen for tab count changes
    const handleTabCountChange = (event: CustomEvent) => {
      const { count } = event.detail
      console.log(`📊 Active tabs: ${count}`)

      // If count reaches 0 and we're authenticated, log out
      if (count === 0 && isAuthenticated) {
        console.log("🚨 All tabs closed - logging out user")
        setIsAuthenticated(false)
        setUsername("")
      }
    }

    window.addEventListener("sessionChange", handleSessionChange as EventListener)
    window.addEventListener("tabCountChange", handleTabCountChange as EventListener)

    return () => {
      console.log("🧹 App cleanup")
      window.removeEventListener("sessionChange", handleSessionChange as EventListener)
      window.removeEventListener("tabCountChange", handleTabCountChange as EventListener)
      tabTracker.cleanup()
    }
  }, [isAuthenticated])

  const handleLogin = (loginUsername: string, password: string) => {
    // Simple authentication check (in real app, this would be server-side)
    if (loginUsername === "admin" && password === "password") {
      const sessionManager = SessionManager.getInstance()
      sessionManager.createSession(loginUsername)
      setIsAuthenticated(true)
      setUsername(loginUsername)
      console.log("✅ User logged in successfully")
      return true
    }
    console.log("❌ Login failed")
    return false
  }

  const handleLogout = () => {
    console.log("👋 User manually logged out")
    const sessionManager = SessionManager.getInstance()
    sessionManager.clearSession()
    setIsAuthenticated(false)
    setUsername("")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated ? (
        <Dashboard username={username} onLogout={handleLogout} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </div>
  )
}
