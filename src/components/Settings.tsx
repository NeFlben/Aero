"use client";

import { Copy, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { CURRENCIES, type Currency } from "@/lib/types";
import { api, useApp } from "./AppProvider";
import { clearOfflineData } from "@/lib/offline";
import { LocaleSwitch, useTheme } from "./Shell";
import { btnClass, Button, Field, Input, PageHeader, Panel, Select } from "./ui";

interface Share {
  token: string;
  enabled: boolean;
  title: string | null;
  showPrices: boolean;
  showValues: boolean;
  showDates: boolean;
  showNotes: boolean;
  showStorage: boolean;
}

export function Settings() {
  const { t } = useI18n();
  const { user, setUser, toast, ref, setRef } = useApp();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [name, setName] = useState(user.name);
  const [share, setShare] = useState<Share | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [maker, setMaker] = useState("");

  useEffect(() => {
    api<{ share: Share }>("/api/settings").then((r) => setShare(r.share)).catch(() => {});
  }, []);

  const saveProfile = async (p: { name?: string; baseCurrency?: Currency }) => {
    try {
      await api("/api/settings", { method: "PATCH", json: p });
      setUser(p);
      toast(t("Saved"));
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };
  const saveShare = async (next: Share, rotate = false) => {
    setShare(next);
    try {
      const r = await api<{ share: Share }>("/api/settings", { method: "PATCH", json: { share: { enabled: next.enabled, title: next.title, showPrices: next.showPrices, showValues: next.showValues, showDates: next.showDates, showNotes: next.showNotes, showStorage: next.showStorage, rotate } } });
      setShare(r.share);
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };
  const changePassword = async () => {
    setPwError(null);
    const { error } = await authClient.changePassword({ currentPassword: pw.current, newPassword: pw.next, revokeOtherSessions: true });
    if (error) setPwError(t("Check your current password. The new one needs at least 8 characters."));
    else {
      setPw({ current: "", next: "" });
      toast(t("Password changed"));
    }
  };
  const addMaker = async () => {
    if (!maker.trim()) return;
    const r = await api<NonNullable<typeof ref>>("/api/reference", { json: { name: maker } });
    setRef(r);
    setMaker("");
    toast(t("Manufacturer added"));
  };

  const link = share && typeof window !== "undefined" ? `${window.location.origin}/s/${share.token}` : "";
  const toggles: [keyof Share, string][] = [["showPrices", "Purchase prices"], ["showValues", "Market values"], ["showDates", "Purchase dates"], ["showNotes", "Personal notes"], ["showStorage", "Storage locations"]];

  return (
    <>
      <PageHeader title={t("Settings")} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Panel title={t("Profile")}>
          <div className="space-y-3 p-4">
            <Field label={t("Name")}><div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={!name.trim() || name === user.name} onClick={() => saveProfile({ name })}>{t("Save")}</Button></div></Field>
            <Field label={t("Email")}><Input value={user.email} disabled /></Field>
            <Field label={t("Main currency")} hint={t("for totals only; prices keep their currency")}>
              <Select value={user.baseCurrency} onChange={(e) => saveProfile({ baseCurrency: e.target.value as Currency })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <div className="flex items-center justify-between pt-1"><span className="text-[13px]">{t("Language")}</span><LocaleSwitch /></div>
            <div className="flex items-center justify-between"><span className="text-[13px]">{t("Dark mode")}</span><input type="checkbox" role="switch" aria-label={t("Dark mode")} className="size-4 accent-[var(--accent)]" checked={theme === "dark"} onChange={toggle} /></div>
            {user.authEnabled && <Button variant="ghost" onClick={async () => { await authClient.signOut(); await clearOfflineData(); router.push("/login"); router.refresh(); }}>{t("Sign out")}</Button>}
          </div>
        </Panel>

        <Panel title={t("Share your collection")}>
          {share ? (
            <div className="space-y-3 p-4">
              <label className="flex items-center gap-2 text-[13.5px] font-medium"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={share.enabled} onChange={(e) => saveShare({ ...share, enabled: e.target.checked })} />{t("Public link active")}</label>
              <p className="text-[12.5px] text-ink-2">{t("Your collection is private by default. People with the link see the models, never your wishlist or email address.")}</p>
              {share.enabled && (
                <>
                  <div className="flex gap-2">
                    <Input readOnly value={link} className="code text-[12px]" aria-label={t("Public link")} onFocus={(e) => e.target.select()} />
                    <Button aria-label={t("Copy link")} onClick={() => { navigator.clipboard.writeText(link); toast(t("Link copied")); }}><Copy className="size-4" /></Button>
                    <Button aria-label={t("Create a new link")} title={t("Create a new link")} onClick={() => saveShare(share, true)}><RefreshCw className="size-4" /></Button>
                  </div>
                  <Field label={t("Title")}><Input value={share.title ?? ""} placeholder={t("{name}'s collection", { name: user.name })} onChange={(e) => setShare({ ...share, title: e.target.value })} onBlur={() => saveShare(share)} /></Field>
                  <fieldset>
                    <legend className="mb-1 text-[12px] font-medium text-ink-2">{t("Also show (off by default)")}</legend>
                    {toggles.map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!share[k]} onChange={(e) => saveShare({ ...share, [k]: e.target.checked })} />{t(l)}</label>
                    ))}
                  </fieldset>
                </>
              )}
            </div>
          ) : <div className="skeleton m-4 h-24 rounded" />}
        </Panel>

        <Panel title={t("Password")}>
          <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); changePassword(); }}>
            <Field label={t("Current password")}><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label={t("New password")} error={pwError}><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Button type="submit" disabled={!pw.current || !pw.next}>{t("Change password")}</Button>
          </form>
        </Panel>

        <Panel title={t("Data")}>
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              {["json", "csv", "xlsx"].map((f) => <a key={f} href={`/api/export?format=${f}`} className={btnClass("secondary")}><Download className="size-3.5" /><span className="code uppercase">{f}</span></a>)}
              <Link href="/import" className={btnClass("secondary")}>{t("Import a file")}</Link>
            </div>
            <Field label={t("Add a model manufacturer to your list")}>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addMaker(); }}><Input value={maker} onChange={(e) => setMaker(e.target.value)} /><Button type="submit" disabled={!maker.trim()}>{t("Add")}</Button></form>
            </Field>
            {(ref?.makers.filter((m) => m.own).length ?? 0) > 0 && <p className="text-[12.5px] text-ink-2">{ref!.makers.filter((m) => m.own).map((m) => m.name).join(", ")}</p>}
          </div>
        </Panel>
      </div>
    </>
  );
}
