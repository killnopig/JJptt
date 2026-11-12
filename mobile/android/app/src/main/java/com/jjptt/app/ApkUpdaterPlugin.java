package com.jjptt.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updating the app from inside it: downloads the APK from JJptt's GitHub
 * release into the app's cache and opens Android's installer, so no browser
 * download (which kept getting stuck) is needed.
 *
 * JS: install({url}) -> resolves when the installer is shown;
 *     events "progress" {done, total}.
 * Rejects with "permission" when Android first needs "install unknown apps"
 * allowed for JJptt (the settings page is opened for it).
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String ALLOWED_PREFIX = "https://github.com/killnopig/JJptt/releases/download/";

    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED_PREFIX)) {
            call.reject("not JJptt's release");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("permission");
            return;
        }
        new Thread(() -> download(call, url), "apk-update").start();
    }

    /** A small text file from JJptt's release (version.json), redirects followed. */
    @PluginMethod
    public void fetchText(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED_PREFIX)) {
            call.reject("not JJptt's release");
            return;
        }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = open(url);
                StringBuilder sb = new StringBuilder();
                try (InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0 && sb.length() < 65536) sb.append(new String(buf, 0, n, "UTF-8"));
                }
                JSObject r = new JSObject();
                r.put("text", sb.toString());
                call.resolve(r);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                if (c != null) c.disconnect();
            }
        }, "apk-check").start();
    }

    // GitHub answers with a redirect to its file host: follow it by hand
    // (HttpURLConnection does not follow redirects to another host)
    private static HttpURLConnection open(String url) throws Exception {
        String at = url;
        for (int hops = 0; hops < 5; hops++) {
            HttpURLConnection c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "JJptt-Android");
            c.setUseCaches(false);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                at = new URL(new URL(at), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("HTTP " + code);
            }
            return c;
        }
        throw new Exception("too many redirects");
    }

    private void download(PluginCall call, String url) {
        File dir = new File(getContext().getCacheDir(), "update");
        dir.mkdirs();
        File apk = new File(dir, "JJptt.apk");
        HttpURLConnection c = null;
        try {
            c = open(url);
            long total = c.getContentLengthLong();
            long done = 0, lastSent = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    if (done - lastSent > 256 * 1024) {
                        lastSent = done;
                        JSObject p = new JSObject();
                        p.put("done", done);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
            }
            if (total > 0 && done != total) throw new Exception("下載不完整");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
