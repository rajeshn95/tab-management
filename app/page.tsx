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
    // Initialize session manager and tab tracker
    const sessionManager = SessionManager.getInstance()
    const tabTracker = TabTracker.getInstance()

    // Check for existing session on app init
    const existingSession = sessionManager.getSession()
    if (existingSession) {
      setIsAuthenticated(true)
      setUsername(existingSession.username)
      console.log("Session restored from localStorage")
    }
    setIsLoading(false)

    // Listen for session changes from other tabs
    const handleSessionChange = (event: CustomEvent) => {
      const { type, session } = event.detail

      if (type === "login") {
        setIsAuthenticated(true)
        setUsername(session.username)
        console.log("Session synced from another tab - login")
      } else if (type === "logout") {
        setIsAuthenticated(false)
        setUsername("")
        console.log("Session synced from another tab - logout")
      }
    }

    // Listen for tab count changes
    const handleTabCountChange = (event: CustomEvent) => {
      const { count } = event.detail
      console.log(`Active tabs: ${count}`)

      // Only clear session if count is 0 and we have a session
      // This prevents clearing session on page refresh
      if (count === 0 && sessionManager.getSession()) {
        console.log("All tabs closed - clearing session")
        sessionManager.clearSession()
        setIsAuthenticated(false)
        setUsername("")
      }
    }

    window.addEventListener("sessionChange", handleSessionChange as EventListener)
    window.addEventListener("tabCountChange", handleTabCountChange as EventListener)

    // Initialize tab tracking after a small delay to ensure proper setup
    setTimeout(() => {
      tabTracker.init()
    }, 100)

    return () => {
      window.removeEventListener("sessionChange", handleSessionChange as EventListener)
      window.removeEventListener("tabCountChange", handleTabCountChange as EventListener)
      tabTracker.cleanup()
    }
  }, [])

  const handleLogin = (loginUsername: string, password: string) => {
    // Simple authentication check (in real app, this would be server-side)
    if (loginUsername === "admin" && password === "password") {
      const sessionManager = SessionManager.getInstance()
      sessionManager.createSession(loginUsername)
      setIsAuthenticated(true)
      setUsername(loginUsername)
      return true
    }
    return false
  }

  const handleLogout = () => {
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
