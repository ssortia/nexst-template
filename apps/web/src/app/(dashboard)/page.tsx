import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui';

import { auth } from '../../auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>You are logged in as {session?.user?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is your dashboard. Start building your application here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
