import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { signupOpen } from "@/server/auth";
export const metadata = { title: "Create account" };
export default function Page() {
  if (!signupOpen) redirect("/login");
  return <RegisterForm />;
}
