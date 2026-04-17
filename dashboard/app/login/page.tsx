'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const params = useSearchParams()
  const hasError = params.get('error') === '1'

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-lg font-semibold text-white mb-1">Productivity Dashboard</h1>
        <p className="text-sm text-gray-400 mb-6">Enter the access password to continue</p>
        {hasError && (
          <p className="text-sm text-red-400 mb-4">Incorrect password. Please try again.</p>
        )}
        <form method="POST" action="/api/login" className="space-y-4">
          <input
            type="password"
            name="password"
            autoFocus
            placeholder="Password"
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Access Dashboard
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
