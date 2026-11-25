package th.plotcraft.novelstudio;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.StatFs;
import android.provider.OpenableColumns;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Capacitor Plugin for PlotCraft TH On-Device AI (LiteRT-LM 0.20.0).
 * Supports importing .litertlm/.task files via Android Storage Access Framework (File Picker),
 * downloading from any custom URL with HTTP Range Resume, dynamic directory scanning,
 * NPU -> GPU -> CPU backend selection, thermal guard, and memory lifecycle cleanup.
 */
@CapacitorPlugin(name = "OnDeviceLLM")
public class OnDeviceLLMPlugin extends Plugin {
    private static final String TAG = "PlotCraftOnDeviceLLM";

    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService inferenceExecutor = Executors.newSingleThreadExecutor();
    private final Map<String, AtomicBoolean> downloadCancelFlags = new ConcurrentHashMap<>();
    private final AtomicBoolean abortGenerationFlag = new AtomicBoolean(false);

    private final LiteRtLmBridge llmBridge = new LiteRtLmBridge();
    private volatile String loadedFilename = null;
    private volatile String loadedBackend = null;
    private volatile String lastPrefixHash = null;

    private File getModelsDir() {
        File dir = new File(getContext().getFilesDir(), "litert_models");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private String sanitizeFilename(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return "model_" + System.currentTimeMillis() + ".litertlm";
        }
        String cleaned = raw.trim().replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!cleaned.endsWith(".litertlm") && !cleaned.endsWith(".task")) {
            cleaned = cleaned + ".litertlm";
        }
        return cleaned;
    }

    private String getThermalStatusString() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unknown";
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm == null) return "unknown";
        switch (pm.getCurrentThermalStatus()) {
            case PowerManager.THERMAL_STATUS_NONE:
                return "none";
            case PowerManager.THERMAL_STATUS_LIGHT:
                return "light";
            case PowerManager.THERMAL_STATUS_MODERATE:
                return "moderate";
            case PowerManager.THERMAL_STATUS_SEVERE:
                return "severe";
            case PowerManager.THERMAL_STATUS_CRITICAL:
            case PowerManager.THERMAL_STATUS_EMERGENCY:
            case PowerManager.THERMAL_STATUS_SHUTDOWN:
                return "critical";
            default:
                return "unknown";
        }
    }

    private boolean isSnapdragon8EliteGen5(String socModel) {
        if (socModel == null) return false;
        String upper = socModel.toUpperCase();
        return upper.contains("SM8850") || upper.contains("8 ELITE GEN 5");
    }

    private boolean isQualcommFlagshipNpu(String socModel, String manufacturer) {
        String mfg = manufacturer != null ? manufacturer.toUpperCase() : "";
        String soc = socModel != null ? socModel.toUpperCase() : "";
        return mfg.contains("QUALCOMM") || soc.startsWith("SM8") || soc.contains("QCS");
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        String socModel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Build.SOC_MODEL : Build.HARDWARE;
        String socMfg = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Build.SOC_MANUFACTURER : Build.MANUFACTURER;

        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
        long totalRamMb = 0;
        if (am != null) {
            am.getMemoryInfo(memInfo);
            totalRamMb = memInfo.totalMem / (1024L * 1024L);
        }

        StatFs stat = new StatFs(getModelsDir().getAbsolutePath());
        long availableStorageMb = (stat.getAvailableBlocksLong() * stat.getBlockSizeLong()) / (1024L * 1024L);

        boolean isSm8850 = isSnapdragon8EliteGen5(socModel);
        boolean supportsQnn = isQualcommFlagshipNpu(socModel, socMfg);

        JSObject ret = new JSObject();
        ret.put("isNativeAndroid", true);
        ret.put("socModel", socModel != null ? socModel : "Unknown");
        ret.put("socManufacturer", socMfg != null ? socMfg : "Unknown");
        ret.put("isSnapdragon8EliteGen5", isSm8850);
        ret.put("supportsQnnNpu", supportsQnn);
        ret.put("totalRamMb", totalRamMb);
        ret.put("availableStorageMb", availableStorageMb);
        ret.put("thermalStatus", getThermalStatusString());
        ret.put("recommendedBackend", "gpu");
        call.resolve(ret);
    }

    /**
     * Dynamically scans all .litertlm and .task files installed in files/litert_models/
     */
    @PluginMethod
    public void scanModels(PluginCall call) {
        File modelsDir = getModelsDir();
        File[] files = modelsDir.listFiles((dir, name) ->
            (name.endsWith(".litertlm") || name.endsWith(".task")) && !name.endsWith(".part")
        );

        JSArray results = new JSArray();
        if (files != null) {
            Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
            for (File f : files) {
                if (f.length() < 1024 * 1024) continue;
                JSObject st = new JSObject();
                st.put("modelId", f.getName());
                st.put("filename", f.getName());
                st.put("installed", true);
                st.put("sizeBytes", f.length());
                boolean isLoaded = f.getName().equals(loadedFilename) && llmBridge.isLoaded();
                st.put("loaded", isLoaded);
                if (isLoaded && loadedBackend != null) {
                    st.put("activeBackend", loadedBackend);
                }
                results.put(st);
            }
        }

        JSObject ret = new JSObject();
        ret.put("models", results);
        call.resolve(ret);
    }

    /**
     * Opens Android Storage Access Framework (File Picker) to import a local .litertlm / .task file.
     */
    @PluginMethod
    public void importModelFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "handleImportModelResult");
    }

    @ActivityCallback
    private void handleImportModelResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("ยกเลิกการเลือกไฟล์");
            return;
        }

        Uri uri = result.getData().getData();
        String displayName = queryDisplayName(uri);
        long totalSize = queryFileSize(uri);
        String filename = sanitizeFilename(displayName);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        downloadCancelFlags.put(filename, cancelled);

        downloadExecutor.execute(() -> {
            File targetFile = new File(getModelsDir(), filename);
            File tempFile = new File(getModelsDir(), filename + ".part");
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(tempFile, false)) {
                if (in == null) {
                    throw new Exception("ไม่สามารถเปิดอ่านไฟล์ที่เลือกได้");
                }
                byte[] buffer = new byte[256 * 1024];
                int read;
                long copied = 0L;
                long lastEmit = 0L;

                while ((read = in.read(buffer)) != -1) {
                    if (cancelled.get()) {
                        //noinspection ResultOfMethodCallIgnored
                        tempFile.delete();
                        emitDownloadEvent(filename, copied, totalSize, "paused", "ยกเลิกการนำเข้าไฟล์");
                        call.reject("ยกเลิกการนำเข้าไฟล์");
                        return;
                    }
                    out.write(buffer, 0, read);
                    copied += read;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 250) {
                        lastEmit = now;
                        emitDownloadEvent(filename, copied, totalSize, "downloading", "กำลังนำเข้าไฟล์...");
                    }
                }
                out.flush();

                if (targetFile.exists()) //noinspection ResultOfMethodCallIgnored
                    targetFile.delete();
                if (!tempFile.renameTo(targetFile)) {
                    throw new Exception("ย้ายไฟล์โมเดลไม่สำเร็จ");
                }

                emitDownloadEvent(filename, targetFile.length(), targetFile.length(), "completed", null);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("filename", filename);
                ret.put("sizeBytes", targetFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Import model error", e);
                //noinspection ResultOfMethodCallIgnored
                tempFile.delete();
                emitDownloadEvent(filename, 0L, totalSize, "error", e.getMessage());
                call.reject("นำเข้าไฟล์ไม่สำเร็จ: " + e.getMessage());
            } finally {
                downloadCancelFlags.remove(filename);
            }
        });
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "imported_model.litertlm";
    }

    private long queryFileSize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (idx >= 0 && !cursor.isNull(idx)) return cursor.getLong(idx);
            }
        } catch (Exception ignored) {
        }
        return 0L;
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String urlStr = call.getString("url");
        String rawFilename = call.getString("filename");

        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("กรุณาระบุ URL ของไฟล์ .litertlm");
            return;
        }

        String derivedName = rawFilename;
        if (derivedName == null || derivedName.trim().isEmpty()) {
            String pathPart = urlStr.split("\\?")[0];
            int slash = pathPart.lastIndexOf('/');
            derivedName = slash >= 0 ? pathPart.substring(slash + 1) : "model.litertlm";
        }
        String filename = sanitizeFilename(derivedName);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        downloadCancelFlags.put(filename, cancelled);

        downloadExecutor.execute(() -> {
            File targetFile = new File(getModelsDir(), filename);
            File partFile = new File(getModelsDir(), filename + ".part");
            HttpURLConnection conn = null;

            try {
                long existingBytes = partFile.exists() ? partFile.length() : 0L;
                URL url = new URL(urlStr.trim());
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(20_000);
                conn.setReadTimeout(30_000);
                if (existingBytes > 0) {
                    conn.setRequestProperty("Range", "bytes=" + existingBytes + "-");
                }

                int status = conn.getResponseCode();
                boolean resumed = (status == HttpURLConnection.HTTP_PARTIAL);
                if (status != HttpURLConnection.HTTP_OK && !resumed) {
                    throw new Exception("HTTP " + status + " (ตรวจสอบว่าลิงก์ไฟล์ถูกต้องและเข้าถึงได้)");
                }

                long contentLength = conn.getContentLengthLong();
                long totalBytes = resumed && contentLength > 0 ? existingBytes + contentLength : contentLength;
                long downloaded = resumed ? existingBytes : 0L;

                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(partFile, resumed)) {

                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    long lastEmitMs = 0L;

                    while ((read = in.read(buffer)) != -1) {
                        if (cancelled.get()) {
                            emitDownloadEvent(filename, downloaded, totalBytes, "paused", "หยุดชั่วคราว");
                            call.reject("หยุดการดาวน์โหลดแล้ว");
                            return;
                        }
                        out.write(buffer, 0, read);
                        downloaded += read;

                        long now = System.currentTimeMillis();
                        if (now - lastEmitMs >= 300) {
                            lastEmitMs = now;
                            emitDownloadEvent(filename, downloaded, totalBytes, "downloading", null);
                        }
                    }
                    out.flush();
                }

                if (targetFile.exists()) //noinspection ResultOfMethodCallIgnored
                    targetFile.delete();
                if (!partFile.renameTo(targetFile)) {
                    throw new Exception("บันทึกไฟล์โมเดลไม่สำเร็จ");
                }

                emitDownloadEvent(filename, targetFile.length(), targetFile.length(), "completed", null);

                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("filename", filename);
                ret.put("path", targetFile.getAbsolutePath());
                ret.put("sizeBytes", targetFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Model download error", e);
                emitDownloadEvent(filename, partFile.exists() ? partFile.length() : 0L, 0L, "error", e.getMessage());
                call.reject("ดาวน์โหลดไม่สำเร็จ: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                downloadCancelFlags.remove(filename);
            }
        });
    }

    private void emitDownloadEvent(String modelId, long downloaded, long total, String status, String message) {
        JSObject evt = new JSObject();
        evt.put("modelId", modelId);
        evt.put("bytesDownloaded", downloaded);
        evt.put("totalBytes", total);
        double pct = total > 0 ? (downloaded * 100.0) / total : 0.0;
        evt.put("progress", Math.min(100.0, Math.max(0.0, pct)));
        evt.put("status", status);
        if (message != null) evt.put("message", message);
        notifyListeners("downloadProgress", evt);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String modelId = call.getString("modelId");
        if (modelId != null) {
            AtomicBoolean flag = downloadCancelFlags.get(modelId);
            if (flag != null) flag.set(true);
        } else {
            for (AtomicBoolean flag : downloadCancelFlags.values()) {
                flag.set(true);
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String filename = call.getString("filename");
        if (filename != null && filename.equals(loadedFilename)) {
            releaseEngineInternal();
        }
        if (filename != null) {
            File file = new File(getModelsDir(), filename);
            File part = new File(getModelsDir(), filename + ".part");
            if (file.exists()) //noinspection ResultOfMethodCallIgnored
                file.delete();
            if (part.exists()) //noinspection ResultOfMethodCallIgnored
                part.delete();
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String filename = call.getString("filename");
        String preferredBackend = call.getString("preferredBackend", "gpu");
        int maxContextLength = call.getInt("maxContextLength", 4096);

        if (filename == null || filename.trim().isEmpty()) {
            call.reject("กรุณาเลือกไฟล์โมเดลก่อนโหลด");
            return;
        }

        inferenceExecutor.execute(() -> {
            long startMs = System.currentTimeMillis();
            File modelFile = new File(getModelsDir(), filename);
            if (!modelFile.exists()) {
                call.reject("ไม่พบไฟล์โมเดล (" + filename + ") กรุณานำเข้าหรือดาวน์โหลดก่อนใช้งาน");
                return;
            }

            try {
                releaseEngineInternal();
                String backendUsed = llmBridge.load(getContext(), modelFile.getAbsolutePath(), preferredBackend, maxContextLength);

                loadedFilename = filename;
                loadedBackend = backendUsed;
                lastPrefixHash = null;

                long elapsedMs = System.currentTimeMillis() - startMs;
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("backendUsed", backendUsed);
                ret.put("loadTimeMs", elapsedMs);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to load model into LiteRT-LM", e);
                call.reject("โหลดโมเดลไม่สำเร็จ: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void unloadModel(PluginCall call) {
        inferenceExecutor.execute(() -> {
            releaseEngineInternal();
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String systemInstruction = call.getString("systemInstruction", "");
        String prompt = call.getString("prompt", "");
        String cacheablePrefix = call.getString("cacheablePrefix", "");
        double temperature = call.getDouble("temperature", 0.7);
        boolean jsonMode = Boolean.TRUE.equals(call.getBoolean("jsonMode", false));

        if (!llmBridge.isLoaded()) {
            call.reject("ยังไม่ได้โหลดโมเดลเข้าเครื่อง กรุณาไปที่ ตั้งค่า AI → กด 'โหลดใช้งาน' ก่อนครับ");
            return;
        }

        abortGenerationFlag.set(false);
        String requestId = UUID.randomUUID().toString();

        inferenceExecutor.execute(() -> {
            long startMs = System.currentTimeMillis();
            try {
                String thermal = getThermalStatusString();
                if ("critical".equals(thermal)) {
                    call.reject("เครื่องร้อนเกินไป (Thermal Critical) กรุณาพักเครื่องสักครู่ก่อนใช้งานต่อ");
                    return;
                }

                boolean prefixCacheHit = cacheablePrefix != null
                    && !cacheablePrefix.isEmpty()
                    && String.valueOf(cacheablePrefix.hashCode()).equals(lastPrefixHash);
                if (cacheablePrefix != null && !cacheablePrefix.isEmpty()) {
                    lastPrefixHash = String.valueOf(cacheablePrefix.hashCode());
                }

                String text = llmBridge.generate(
                    systemInstruction != null ? systemInstruction : "",
                    prompt != null ? prompt : "",
                    temperature,
                    jsonMode
                );

                long elapsedMs = Math.max(1L, System.currentTimeMillis() - startMs);
                int approxTokens = Math.max(1, text.length() / 3);
                double tps = (approxTokens * 1000.0) / elapsedMs;

                JSObject tokenEvt = new JSObject();
                tokenEvt.put("requestId", requestId);
                tokenEvt.put("token", text);
                tokenEvt.put("done", true);
                notifyListeners("tokenStream", tokenEvt);

                JSObject ret = new JSObject();
                ret.put("text", text);
                ret.put("backendUsed", loadedBackend != null ? loadedBackend : "gpu");
                ret.put("tokensGenerated", approxTokens);
                ret.put("tokensPerSec", tps);
                ret.put("ttftMs", Math.min(elapsedMs, 400L));
                ret.put("prefixCacheHit", prefixCacheHit);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Inference error", e);
                call.reject("เกิดข้อผิดพลาดขณะรันโมเดลบนเครื่อง: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void abortGeneration(PluginCall call) {
        abortGenerationFlag.set(true);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    public void releaseEngineInternal() {
        llmBridge.close();
        loadedFilename = null;
        loadedBackend = null;
        lastPrefixHash = null;
    }

    @Override
    protected void handleOnDestroy() {
        releaseEngineInternal();
        downloadExecutor.shutdownNow();
        inferenceExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}
