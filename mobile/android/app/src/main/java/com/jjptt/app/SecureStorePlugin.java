package com.jjptt.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The saved PTT password, encrypted with a key that lives in Android's
 * Keystore (it never leaves the phone and cannot be copied out), instead of
 * plain text in the page's localStorage.
 *
 * JS: set({key, value}), get({key}) -> {value} ("" when there is none or it
 * can no longer be read), remove({key}).
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String KEY_ALIAS = "jjptt-secret";
    private static final String PREFS = "jjptt-secure";
    private static final int IV_LEN = 12;

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("key", "");
        String value = call.getString("value", "");
        if (name.isEmpty()) {
            call.reject("no key");
            return;
        }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] all = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, all, 0, iv.length);
            System.arraycopy(ct, 0, all, iv.length, ct.length);
            if (!prefs().edit().putString(name, Base64.encodeToString(all, Base64.NO_WRAP)).commit()) {
                call.reject("not saved");
                return;
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = call.getString("key", "");
        JSObject r = new JSObject();
        String stored = prefs().getString(name, null);
        if (stored == null) {
            r.put("value", "");
            call.resolve(r);
            return;
        }
        try {
            byte[] all = Base64.decode(stored, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, IV_LEN));
            byte[] pt = c.doFinal(all, IV_LEN, all.length - IV_LEN);
            r.put("value", new String(pt, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // the key is gone (app data moved to another phone...): it can
            // never be read again, so forget it and log in by hand once
            prefs().edit().remove(name).apply();
            r.put("value", "");
        }
        call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        prefs().edit().remove(call.getString("key", "")).commit();
        call.resolve();
    }
}
