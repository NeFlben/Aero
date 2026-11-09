import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { authEnabled, getSessionUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");
  return (
    <AppProvider user={{ ...user, authEnabled }}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
