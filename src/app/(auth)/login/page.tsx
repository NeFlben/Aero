import { LoginForm } from "@/components/AuthForms";
import { signupOpen } from "@/server/auth";
export const metadata = { title: "Sign in" };
export default function Page() {
  return <LoginForm signup={signupOpen} />;
}
