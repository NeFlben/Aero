"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { LocaleSwitch, Wordmark } from "./Shell";
import { Silhouette } from "./Silhouette";
import { Button, Field, Input } from "./ui";

function Frame({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <main className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between"><Wordmark /><LocaleSwitch /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
          {foot && <div className="mt-5 text-[13.5px] text-ink-2">{foot}</div>}
        </div>
      </main>
      <aside aria-hidden className="relative hidden flex-col justify-end overflow-hidden bg-board p-12 text-board-ink lg:flex">
        <Silhouette shape="jumbo" className="absolute top-1/2 -right-16 w-[120%] -translate-y-1/2 text-[#1d242b]" />
        <div className="relative">
          <div className="code text-[11px] tracking-[0.16em] text-flap uppercase">1:200 · 1:400 · 1:500</div>
          <p className="mt-2 max-w-md text-[26px] leading-tight font-semibold tracking-tight">{t("Every model in your collection, on one board.")}</p>
        </div>
      </aside>
    </div>
  );
}

export function LoginForm({ signup = true }: { signup?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(error.status === 429 ? t("Too many attempts. Please wait a minute.") : t("Email or password is not correct."));
    router.push("/");
    router.refresh();
  };
  return (
    <Frame title={t("Sign in")} foot={signup ? <>{t("New here?")} <Link className="text-accent hover:underline" href="/register">{t("Create an account")}</Link></> : null}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("Email")}><Input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t("Password")} hint={<Link href="/forgot" className="text-accent hover:underline">{t("Forgot it?")}</Link>} error={error}><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{t("Sign in")}</Button>
      </form>
    </Frame>
  );
}

export function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t("Use at least 8 characters."));
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (error) return setError(error.status === 429 ? t("Too many attempts. Please wait a minute.") : t("This account could not be created. The email may already be in use."));
    router.push("/");
    router.refresh();
  };
  return (
    <Frame title={t("Create your account")} foot={<>{t("Already registered?")} <Link className="text-accent hover:underline" href="/login">{t("Sign in")}</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("Name")}><Input required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("Email")}><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t("Password")} hint={t("at least 8 characters")} error={error}><Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{t("Create account")}</Button>
      </form>
    </Frame>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await authClient.requestPasswordReset({ email, redirectTo: "/reset" });
    // Same answer either way, so the form does not reveal who has an account.
    setSent(true);
  };
  return (
    <Frame title={t("Reset your password")} foot={<Link className="text-accent hover:underline" href="/login">{t("Back to sign in")}</Link>}>
      {sent ? <p role="status">{t("If an account exists for this address, a reset link is on its way.")}</p> : (
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("Email")}><Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="primary" size="lg" className="w-full">{t("Send reset link")}</Button>
        </form>
      )}
    </Frame>
  );
}

export function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t("Use at least 8 characters."));
    const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    if (error) return setError(t("This link is no longer valid. Please request a new one."));
    router.push("/login");
  };
  return (
    <Frame title={t("Choose a new password")} foot={<Link className="text-accent hover:underline" href="/login">{t("Back to sign in")}</Link>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("New password")} hint={t("at least 8 characters")} error={error}><Input type="password" required autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" variant="primary" size="lg" className="w-full">{t("Save password")}</Button>
      </form>
    </Frame>
  );
}
