package th.plotcraft.novelstudio;

import android.content.ComponentCallbacks2;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OnDeviceLLMPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // Proactively release the 2.6GB Gemma 4 E4B NPU/RAM footprint when Android reports low memory
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL && getBridge() != null) {
            PluginHandle handle = getBridge().getPlugin("OnDeviceLLM");
            if (handle != null && handle.getInstance() instanceof OnDeviceLLMPlugin) {
                ((OnDeviceLLMPlugin) handle.getInstance()).releaseEngineInternal();
            }
        }
    }
}
