package com.jjptt.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PttSocketPlugin.class);  // direct connection to PTT
        registerPlugin(ApkUpdaterPlugin.class);  // updating from inside the app
        registerPlugin(SecureStorePlugin.class);  // the saved password, encrypted
        super.onCreate(savedInstanceState);
        // The terminal sizes each character to fit 80 x 24 on the screen; the
        // phone's own font size setting must not enlarge the text on top of
        // that, or the bottom rows (the login prompt...) fall off the screen.
        getBridge().getWebView().getSettings().setTextZoom(100);
        // The status bar and the navigation bar on the app's own dark color:
        // the page runs under them (viewport-fit=cover, mobile/build.js);
        // where the WebView is too old for that, Capacitor pads the window
        // instead and the strip shows the window's background, so that is
        // dark too (it was the light theme's white). Their icons are made
        // light by SystemBars style DARK (capacitor.config.json).
        int bg = Color.parseColor("#111312");
        getWindow().setBackgroundDrawable(new ColorDrawable(bg));
        getWindow().getDecorView().setBackgroundColor(bg);
        getBridge().getWebView().setBackgroundColor(bg);
        getWindow().setStatusBarColor(bg);      // Android 14 and older
        getWindow().setNavigationBarColor(bg);
    }
}
