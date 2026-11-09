import { Suspense } from "react";
import { ResetForm } from "@/components/AuthForms";
export const metadata = { title: "New password" };
export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
