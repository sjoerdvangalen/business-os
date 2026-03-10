import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/app/components/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={user?.email} />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {children}
      </main>
    </div>
  )
}
