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
    console.log("🚀 App starting...")

    const sessionManager = SessionManager.getInstance()
    const tabTracker = TabTracker.getInstance()

    // FIRST: Check if session exists
    const existingSession = sessionManager.getSession()
    console.log("Session check:", existingSession ? "Found" : "None")

    if (existingSession) {
      setIsAuthenticated(true)
      setUsername(existingSession.username)
    }

    // THEN: Initialize tab tracking
    tabTracker.init()
    setIsLoading(false)

    // Listen for session changes from other tabs
    const handleSessionChange = (event: CustomEvent) => {
      const { type, session } = event.detail

      if (type === "login") {
        setIsAuthenticated(true)
        setUsername(session.username)
        console.log("✅ Login from another tab")
      } else if (type === "logout") {
        setIsAuthenticated(false)
        setUsername("")
        console.log("❌ Logout from another tab")
      }
    }

    window.addEventListener("sessionChange", handleSessionChange as EventListener)

    return () => {
      window.removeEventListener("sessionChange", handleSessionChange as EventListener)
      tabTracker.cleanup()
    }
  }, [])

  const handleLogin = (loginUsername: string, password: string) => {
    if (loginUsername === "admin" && password === "password") {
      const sessionManager = SessionManager.getInstance()
      sessionManager.createSession(loginUsername)
      setIsAuthenticated(true)
      setUsername(loginUsername)
      console.log("✅ Login successful")
      return true
    }
    return false
  }

  const handleLogout = () => {
    const sessionManager = SessionManager.getInstance()
    sessionManager.clearSession()
    setIsAuthenticated(false)
    setUsername("")
    console.log("👋 Manual logout")
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
