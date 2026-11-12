package com.jjptt.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PttSocketPlugin.class);  // direct connection to PTT
        registerPlugin(ApkUpdaterPlugin.class);  // updating from inside the app
        super.onCreate(savedInstanceState);
        // The terminal sizes each character to fit 80 x 24 on the screen; the
        // phone's own font size setting must not enlarge the text on top of
        // that, or the bottom rows (the login prompt...) fall off the screen.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
