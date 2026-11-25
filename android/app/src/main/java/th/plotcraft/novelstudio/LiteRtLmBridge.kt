package th.plotcraft.novelstudio

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ResponseFormat
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig

/**
 * Kotlin bridge around Google's LiteRT-LM Android SDK (0.20.0).
 * - Disables Gemma 4 thinking tokens (ThinkingConfig(enableThinking = false)) for speed & low heat
 * - Uses native ResponseFormat.json() when jsonMode = true
 * - Extracts clean text from Content.Text blocks
 * - Handles NPU -> GPU -> CPU automatic fallback
 */
class LiteRtLmBridge {
    companion object {
        private const val TAG = "LiteRtLmBridge"
    }

    @Volatile
    private var engine: Engine? = null

    @Volatile
    var activeBackend: String? = null
        private set

    fun isLoaded(): Boolean = engine != null

    @Synchronized
    fun load(
        context: Context,
        modelPath: String,
        preferredBackend: String,
        maxContextLength: Int
    ): String {
        close()

        val nativeLibDir = context.applicationInfo.nativeLibraryDir ?: ""
        val cacheDirPath = context.cacheDir.absolutePath
        // Allow up to 6144 tokens for Thai structured JSON outlines on high-RAM flagships
        val effectiveContext = maxOf(maxContextLength, 6144)

        val candidates: List<Pair<String, Backend>> = when (preferredBackend) {
            "npu-qnn" -> listOf(
                "npu-qnn" to Backend.NPU(nativeLibraryDir = nativeLibDir),
                "gpu" to Backend.GPU(),
                "cpu" to Backend.CPU()
            )
            "gpu" -> listOf(
                "gpu" to Backend.GPU(),
                "cpu" to Backend.CPU()
            )
            else -> listOf(
                "cpu" to Backend.CPU()
            )
        }

        var lastError: Throwable? = null
        for ((name, backend) in candidates) {
            try {
                Log.i(TAG, "Initializing LiteRT-LM with backend=$name, context=$effectiveContext, model=$modelPath")
                val config = EngineConfig(
                    modelPath = modelPath,
                    backend = backend,
                    cacheDir = cacheDirPath,
                    maxNumTokens = effectiveContext
                )
                val newEngine = Engine(config)
                newEngine.initialize()
                engine = newEngine
                activeBackend = name
                Log.i(TAG, "LiteRT-LM initialized successfully on backend=$name")
                return name
            } catch (t: Throwable) {
                lastError = t
                Log.w(TAG, "Backend $name failed, trying fallback: ${t.message}", t)
            }
        }

        throw RuntimeException(
            "ไม่สามารถโหลดโมเดลบน NPU/GPU/CPU ได้: ${lastError?.message ?: "Unknown error"}",
            lastError
        )
    }

    fun generate(
        systemInstruction: String,
        prompt: String,
        temperature: Double,
        jsonMode: Boolean = false
    ): String {
        val currentEngine = engine
            ?: throw IllegalStateException("ยังไม่ได้โหลดโมเดลเข้าเครื่อง กรุณากด 'โหลดใช้งาน' ก่อนครับ")

        val sampler = SamplerConfig(
            topK = 40,
            topP = 0.95,
            temperature = temperature.coerceIn(0.05, 1.5)
        )

        // Disable thinking mode on Gemma 4 so it outputs directly without burning tokens/heat
        val noThinking = ThinkingConfig(enableThinking = false)

        val runOnce = { useNativeJsonFormat: Boolean ->
            val convConfig = ConversationConfig(
                systemInstruction = if (systemInstruction.isNotBlank()) Contents.of(systemInstruction) else null,
                samplerConfig = sampler,
                thinkingConfig = noThinking,
                enableResponseFormat = useNativeJsonFormat
            )

            currentEngine.createConversation(convConfig).use { conversation ->
                val message = if (useNativeJsonFormat) {
                    conversation.sendMessage(
                        prompt,
                        thinkingConfig = noThinking,
                        responseFormat = ResponseFormat.json("{\"type\":\"object\"}")
                    )
                } else {
                    conversation.sendMessage(
                        prompt,
                        thinkingConfig = noThinking
                    )
                }

                val extracted = message.contents.contents
                    .filterIsInstance<Content.Text>()
                    .joinToString("") { it.text }
                    .ifBlank { message.toString() }

                Log.d(TAG, "Generated ${extracted.length} chars (jsonMode=$useNativeJsonFormat): ${extracted.take(220)}")
                extracted
            }
        }

        return if (jsonMode) {
            try {
                runOnce(true)
            } catch (t: Throwable) {
                Log.w(TAG, "Native ResponseFormat.json failed, falling back to plain JSON prompt: ${t.message}")
                runOnce(false)
            }
        } else {
            runOnce(false)
        }
    }

    @Synchronized
    fun close() {
        try {
            engine?.close()
        } catch (t: Throwable) {
            Log.w(TAG, "Error closing LiteRT-LM engine", t)
        } finally {
            engine = null
            activeBackend = null
        }
    }
}
