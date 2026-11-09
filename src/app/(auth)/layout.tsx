import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/auth";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getSessionUser(await headers())) redirect("/");
  return children;
}
