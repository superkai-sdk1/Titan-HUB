'use client'
// Telegram Mini App — Wallet
// Reads tg initData from window.Telegram.WebApp.initData, calls /api/auth/login/telegram

export default function WalletPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-6">
      <h1 className="text-2xl font-bold">Titan Wallet</h1>
      <p className="mt-2 text-muted-foreground">Загрузка...</p>
    </main>
  )
}
