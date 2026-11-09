// Hangar desktop launcher.
// Builds the app when the source changed since the last build, starts `next start`
// in the background and opens Hangar in its own app window (Edge or Chrome).
// Closing the window stops the server. Compiled by desktop/build-launcher.ps1 (C# 5, .NET Framework 4).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Hangar")]
[assembly: System.Reflection.AssemblyProduct("Hangar")]

static class HangarLauncher
{
    // Replaced by build-launcher.ps1; the HANGAR_DIR environment variable overrides it.
    const string DefaultRoot = @"__HANGAR_DIR__";
    const int Port = 3210;

    static string root;
    static string logPath;
    static readonly object logLock = new object();

    [STAThread]
    static int Main()
    {
        Application.EnableVisualStyles();
        root = Environment.GetEnvironmentVariable("HANGAR_DIR");
        if (string.IsNullOrEmpty(root)) root = DefaultRoot;
        if (!File.Exists(Path.Combine(root, "package.json")))
        {
            MessageBox.Show("Projektordner nicht gefunden:\n" + root, "Hangar", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        string appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Hangar");
        Directory.CreateDirectory(appData);
        logPath = Path.Combine(appData, "launcher.log");
        string url = "http://localhost:" + Port + "/";

        bool first;
        using (var mutex = new Mutex(true, "Local\\HangarDesktopLauncher", out first))
        {
            if (!first)
            {
                // Already running: just open another window on the running server.
                OpenWindow(appData, url, false);
                return 0;
            }

            try { File.WriteAllText(logPath, "Hangar launcher " + DateTime.Now + "\r\n"); } catch { }

            var splash = new Splash();
            Process server = null;
            string error = null;

            var worker = new Thread(() =>
            {
                try { server = Prepare(splash, url); }
                catch (Exception e) { error = e.Message; }
                splash.CloseSafe();
            });
            worker.IsBackground = true;
            worker.Start();
            Application.Run(splash);
            worker.Join();

            if (error != null)
            {
                KillTree(server);
                MessageBox.Show(error + "\n\nDetails: " + logPath + "\n\n" + Tail(25), "Hangar", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            OpenWindow(appData, url, true);
            KillTree(server);
            return 0;
        }
    }

    // ---------------------------------------------------------------- build + start

    static Process Prepare(Splash splash, string url)
    {
        string stamp = Path.Combine(root, ".next", "desktop-build.stamp");
        string buildId = Path.Combine(root, ".next", "BUILD_ID");

        // Dependencies changed (package-lock newer than the installed tree)?
        string lockFile = Path.Combine(root, "package-lock.json");
        string installed = Path.Combine(root, "node_modules", ".package-lock.json");
        if (!File.Exists(installed) || (File.Exists(lockFile) && File.GetLastWriteTimeUtc(lockFile) > File.GetLastWriteTimeUtc(installed)))
        {
            splash.SetStatus("Pakete werden installiert …");
            if (Run("cmd.exe", "/c npm install --legacy-peer-deps") != 0)
                throw new Exception("npm install ist fehlgeschlagen.");
        }

        DateTime newest = NewestSource();
        bool stale = !File.Exists(stamp) || !File.Exists(buildId) || newest > File.GetLastWriteTimeUtc(stamp);
        Log("Neueste Quelländerung: " + newest.ToLocalTime() + ", Build nötig: " + stale);

        if (stale)
        {
            splash.SetStatus("Änderungen gefunden – Hangar wird aktualisiert …\n(das dauert beim ersten Mal 1–2 Minuten)");
            DateTime started = DateTime.UtcNow;
            if (Run("node.exe", "node_modules/next/dist/bin/next build") != 0)
            {
                bool hasOld = File.Exists(buildId) && File.Exists(stamp);
                if (!hasOld) throw new Exception("Der Build ist fehlgeschlagen.");
                var answer = MessageBox.Show(
                    "Der neue Build ist fehlgeschlagen (Fehler im Code?).\n\n" + Tail(15) +
                    "\n\nTrotzdem die zuletzt funktionierende Version starten?",
                    "Hangar", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (answer != DialogResult.Yes) throw new Exception("Build fehlgeschlagen.");
                // A failed build may have removed the old output.
                if (!File.Exists(buildId)) throw new Exception("Keine lauffähige alte Version vorhanden.");
            }
            else
            {
                File.WriteAllText(stamp, DateTime.Now.ToString("o"));
                // Files edited during the build stay newer than the stamp and trigger the next build.
                File.SetLastWriteTimeUtc(stamp, started);
            }
        }

        splash.SetStatus("Hangar wird gestartet …");
        var server = Start("node.exe", "node_modules/next/dist/bin/next start -p " + Port);

        for (int i = 0; i < 120; i++)
        {
            if (server.HasExited)
                throw new Exception("Der Server hat sich beendet.\nLäuft noch \"npm run dev\"? Die lokale Datenbank erlaubt nur einen Prozess gleichzeitig.");
            if (Responds(url)) return server;
            Thread.Sleep(500);
        }
        throw new Exception("Der Server antwortet nicht.");
    }

    static readonly string[] SourceDirs = { "src", "public", "drizzle" };
    static readonly string[] SourceFiles = { "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", ".env", ".env.local", ".env.production", ".env.production.local" };

    static DateTime NewestSource()
    {
        DateTime newest = DateTime.MinValue;
        foreach (var d in SourceDirs)
        {
            string p = Path.Combine(root, d);
            if (!Directory.Exists(p)) continue;
            foreach (var f in Directory.EnumerateFiles(p, "*", SearchOption.AllDirectories))
            {
                var t = File.GetLastWriteTimeUtc(f);
                if (t > newest) newest = t;
            }
        }
        foreach (var f in SourceFiles)
        {
            string p = Path.Combine(root, f);
            if (File.Exists(p) && File.GetLastWriteTimeUtc(p) > newest) newest = File.GetLastWriteTimeUtc(p);
        }
        return newest;
    }

    // ---------------------------------------------------------------- processes

    static ProcessStartInfo Info(string exe, string args)
    {
        var psi = new ProcessStartInfo(exe, args);
        psi.WorkingDirectory = root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["NODE_ENV"] = "production";
        psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
        psi.EnvironmentVariables["FORCE_COLOR"] = "0";
        return psi;
    }

    static Process Start(string exe, string args)
    {
        Log("> " + exe + " " + args);
        var p = new Process();
        p.StartInfo = Info(exe, args);
        p.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
        p.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
        try { p.Start(); }
        catch (Exception e) { throw new Exception(exe + " konnte nicht gestartet werden (Node.js installiert?): " + e.Message); }
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    static int Run(string exe, string args)
    {
        var p = Start(exe, args);
        p.WaitForExit();
        Log("Exit code " + p.ExitCode);
        return p.ExitCode;
    }

    static void KillTree(Process p)
    {
        if (p == null) return;
        try
        {
            if (p.HasExited) return;
            var k = Process.Start(new ProcessStartInfo("taskkill.exe", "/PID " + p.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false });
            k.WaitForExit(5000);
        }
        catch { }
    }

    static bool Responds(string url)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 2000;
            req.AllowAutoRedirect = false;
            using (req.GetResponse()) { }
            return true;
        }
        catch (WebException e) { return e.Response != null; }
        catch { return false; }
    }

    // ---------------------------------------------------------------- window

    static void OpenWindow(string appData, string url, bool wait)
    {
        string browser = FindBrowser();
        if (browser == null)
        {
            Process.Start(url);
            if (wait) MessageBox.Show("Hangar läuft im Browser.\nDieses Fenster schließen, um Hangar zu beenden.", "Hangar");
            return;
        }
        string profile = Path.Combine(appData, "window");
        string args = "--app=" + url + " --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check --window-size=1440,920";
        var p = Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
        if (wait) p.WaitForExit();
    }

    static string FindBrowser()
    {
        var candidates = new List<string>();
        foreach (var baseDir in new[] {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) })
        {
            if (string.IsNullOrEmpty(baseDir)) continue;
            candidates.Add(Path.Combine(baseDir, @"Microsoft\Edge\Application\msedge.exe"));
            candidates.Add(Path.Combine(baseDir, @"Google\Chrome\Application\chrome.exe"));
        }
        foreach (var c in candidates) if (File.Exists(c)) return c;
        return null;
    }

    // ---------------------------------------------------------------- log

    static void Log(string line)
    {
        lock (logLock)
        {
            try { File.AppendAllText(logPath, line + "\r\n", Encoding.UTF8); } catch { }
        }
    }

    static string Tail(int n)
    {
        try
        {
            string[] lines;
            lock (logLock) lines = File.ReadAllLines(logPath, Encoding.UTF8);
            int start = Math.Max(0, lines.Length - n);
            return string.Join("\n", lines, start, lines.Length - start);
        }
        catch { return ""; }
    }

    // ---------------------------------------------------------------- splash

    class Splash : Form
    {
        readonly Label label;

        public Splash()
        {
            Text = "Hangar";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(420, 130);
            BackColor = Color.FromArgb(18, 20, 24);
            ForeColor = Color.FromArgb(230, 232, 236);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var title = new Label { Text = "Hangar", Font = new Font("Segoe UI Semibold", 14f), AutoSize = true, Location = new Point(20, 14) };
            label = new Label { Text = "Wird vorbereitet …", Font = new Font("Segoe UI", 9.5f), Location = new Point(22, 48), Size = new Size(380, 40) };
            var bar = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 25, Location = new Point(22, 98), Size = new Size(376, 10) };
            Controls.Add(title);
            Controls.Add(label);
            Controls.Add(bar);
        }

        public void SetStatus(string text)
        {
            if (!IsHandleCreated) { label.Text = text; return; }
            BeginInvoke((Action)(() => label.Text = text));
        }

        public void CloseSafe()
        {
            // The worker may finish before the form handle exists.
            while (!IsHandleCreated) Thread.Sleep(20);
            BeginInvoke((Action)Close);
        }
    }
}
