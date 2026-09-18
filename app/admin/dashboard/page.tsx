export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Trainers</div>
            <div className="mt-2 text-3xl font-bold">0</div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Clients</div>
            <div className="mt-2 text-3xl font-bold">0</div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Total Reservations</div>
            <div className="mt-2 text-3xl font-bold">0</div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="text-sm font-medium text-muted-foreground">Revenue</div>
            <div className="mt-2 text-3xl font-bold">$0</div>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-muted-foreground">No recent activity</p>
          </div>
        </div>
      </div>
    </div>
  )
}
