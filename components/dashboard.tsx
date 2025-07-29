"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LogOut, Users, Monitor } from "lucide-react"
import { TabTracker } from "@/lib/tab-tracker"

interface DashboardProps {
  username: string
  onLogout: () => void
}

export default function Dashboard({ username, onLogout }: DashboardProps) {
  const [tabCount, setTabCount] = useState(1)
  const [sessionTime, setSessionTime] = useState(0)

  useEffect(() => {
    // Listen for tab count changes
    const handleTabCountChange = (event: CustomEvent) => {
      setTabCount(event.detail.count)
    }

    window.addEventListener("tabCountChange", handleTabCountChange as EventListener)

    // Session timer
    const timer = setInterval(() => {
      setSessionTime((prev) => prev + 1)
    }, 1000)

    // Get initial tab count
    const tabTracker = TabTracker.getInstance()
    setTabCount(tabTracker.getTabCount())

    return () => {
      window.removeEventListener("tabCountChange", handleTabCountChange as EventListener)
      clearInterval(timer)
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const openNewTab = () => {
    window.open(window.location.href, "_blank")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
              <Badge variant="secondary">Welcome, {username}</Badge>
            </div>
            <Button onClick={onLogout} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tabs</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tabCount}</div>
              <p className="text-xs text-muted-foreground">Tabs with this app open</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Session Time</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(sessionTime)}</div>
              <p className="text-xs text-muted-foreground">Time since login</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Cross-Tab Demo</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={openNewTab} className="w-full">
                Open New Tab
              </Button>
              <p className="text-xs text-muted-foreground mt-2">New tab will auto-login</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Cross-Tab Session Features</CardTitle>
              <CardDescription>
                This application demonstrates advanced session management across browser tabs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800 mb-2">✓ Auto-Login</h3>
                  <p className="text-sm text-green-700">
                    When you login in one tab, all other tabs automatically login using BroadcastChannel API
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">✓ Tab Tracking</h3>
                  <p className="text-sm text-blue-700">
                    The app tracks how many tabs are open and displays the count in real-time
                  </p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold text-orange-800 mb-2">✓ Auto-Logout</h3>
                  <p className="text-sm text-orange-700">
                    When you close all tabs, the session is automatically cleared for security
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-800 mb-2">✓ Session Persistence</h3>
                  <p className="text-sm text-purple-700">
                    Session state is stored in localStorage and restored when you revisit the app
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
