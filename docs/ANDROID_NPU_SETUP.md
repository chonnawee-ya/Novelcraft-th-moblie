# คู่มือ Build แอป Android & รัน Local AI (Gemma 4 ผ่าน LiteRT-LM)

เอกสารนี้สรุปขั้นตอนการ Build แอป **PlotCraft TH** (`th.plotcraft.novelstudio`) เป็นไฟล์ APK, ติดตั้งลงมือถือผ่าน ADB และใช้งาน **Local AI ออฟไลน์ (`.litertlm`)** บนมือถือ Android (เช่น Snapdragon 8 Elite Gen 5 / SM8850)

---

## 1. สภาพแวดล้อมที่ผ่านการทดสอบแล้ว
- **Node.js:** v20+ / v26+
- **Android Studio JBR (JDK 21):** `C:\Program Files\Android\Android Studio\jbr`
- **Android SDK:** `%LOCALAPPDATA%\Android\Sdk` (Platform 35/36, Build-Tools 35.0.0)
- **Gradle Wrapper:** `8.14.2` + Android Gradle Plugin `8.13.0` + Kotlin `2.4.21`
- **LiteRT-LM Android SDK:** `com.google.ai.edge.litertlm:litertlm-android:0.20.0` (เปิดใช้งานแล้วใน `android/app/build.gradle`)

---

## 2. ขั้นตอน Build เว็บ & APK (Windows PowerShell)

### 2.1 Sync โค้ดเว็บลงโปรเจกต์ Android (ทำทุกครั้งที่แก้โค้ด React/TS)
```powershell
cd Novelcarft-th
npm run cap:sync
```

### 2.2 Build ไฟล์ `app-debug.apk`
> **หมายเหตุสำหรับโฟลเดอร์ภาษาไทยบน Windows:** โปรเจกต์ได้เพิ่ม `android.overridePathCheck=true` ไว้ใน `android/gradle.properties` แล้ว และแนะนำให้เรียก Gradle Wrapper ผ่าน `java.exe` โดยตรงเพื่อเลี่ยงปัญหา codepage ของ `gradlew.bat`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
Set-Location "Novelcarft-th\android"
& "$env:JAVA_HOME\bin\java.exe" -Xmx2048m "-Dorg.gradle.appname=gradlew" `
  -classpath "gradle\wrapper\gradle-wrapper.jar" `
  org.gradle.wrapper.GradleWrapperMain assembleDebug --no-daemon
```
ไฟล์ APK จะอยู่ที่: `Novelcarft-th/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3. ติดตั้งและเปิดแอปลงมือถือผ่านสาย USB (ADB)
1. บนมือถือ เปิด **Developer Options → USB Debugging** *(สำหรับ Xiaomi/HyperOS ให้เปิด **Install via USB** และ **USB debugging (Security settings)** ด้วย)*
2. เสียบสาย USB แล้วกด **Allow USB debugging** บนหน้าจอมือถือ
3. รันคำสั่งติดตั้ง (การติดตั้งด้วย `-r` จะอัปเดตแอปทับโดย **ไม่ลบไฟล์โมเดล `.litertlm`** ที่โหลดไว้ในเครื่อง):
```powershell
$adb = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb install -r "Novelcarft-th\android\app\build\outputs\apk\debug\app-debug.apk"
& $adb shell monkey -p th.plotcraft.novelstudio -c android.intent.category.LAUNCHER 1
```

---

## 4. การเพิ่มและใช้งานโมเดล Local AI (Gemma 4) ในแอป
1. เปิดแอป **PlotCraft TH** → แตะ **ตั้งค่า AI** → เลือก **`Local AI (.litertlm ออฟไลน์)`**
2. เพิ่มไฟล์โมเดลได้ 2 วิธี:
   - **นำเข้าไฟล์จากเครื่อง (แนะนำ):** โหลดไฟล์ `.litertlm` จากคอมแล้วโยนเข้ามือถือ จากนั้นกด **"นำเข้าไฟล์ `.litertlm` จากเครื่อง"**
   - **ดาวน์โหลดจาก URL:** วางลิงก์ไฟล์ `.litertlm` (หรือกดปุ่ม **ลิงก์ด่วน** เช่น Gemma 4 E2B / E4B) รองรับการหยุดและโหลดต่อเมื่อเน็ตหลุด
3. เลือก Backend (**`GPU (แนะนำ)`**, **`NPU→GPU`**, หรือ **`CPU`**) แล้วกด **โหลดใช้งาน** → กด **ทดสอบการเชื่อมต่อ** → กด **บันทึกการตั้งค่า**

---

## 5. การปรับจูนประสิทธิภาพและความเสถียรที่ทำไว้แล้ว
- **`LiteRtLmBridge.kt`:**
  - ปิด Thinking Mode (`ThinkingConfig(enableThinking = false)`) เพื่อไม่ให้ Gemma 4 เสียเวลาคิดในใจจนเครื่องร้อนและกินโควต้า token
  - เปิด Native JSON Mode (`ResponseFormat.json`) เมื่อสร้างโครงเรื่อง/รายตอน และดึงข้อความจาก `Content.Text.text` โดยตรง
  - ตั้ง Context Length ขั้นต่ำ `6,144` tokens สำหรับภาษาไทย และ Fallback `NPU → GPU → CPU` อัตโนมัติ
- **`OnDeviceLLMPlugin.java` & `MainActivity.java`:**
  - ตรวจจับ `SM8850`, RAM, พื้นที่ว่าง และ Thermal Status พร้อม Thermal Guard หยุดทำงานหากเครื่องร้อนระดับ Critical
  - คืนหน่วยความจำโมเดลอัตโนมัติใน `onTrimMemory()` เมื่อระบบแจ้ง RAM ต่ำ
- **`geminiService.ts` & `WriterTab.tsx`:**
  - ปิด Auto-Retry วนซ้ำในโหมด Local AI (`maxRetries = 0`), เพิ่ม `repairTruncatedJson()` และ Compact Prompt
  - จำกัด Auto-Write Batch เป็นชุดละไม่เกิน 2 ตอนพร้อมพักเครื่อง 2.5 วินาทีระหว่างตอน
