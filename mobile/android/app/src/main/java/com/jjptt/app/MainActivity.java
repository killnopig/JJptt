package com.jjptt.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PttSocketPlugin.class);  // direct connection to PTT
        super.onCreate(savedInstanceState);
    }
}
