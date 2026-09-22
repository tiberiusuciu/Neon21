# Neon21 Android SDK — source from apk scripts or shells
# Usage: . /path/to/scripts/env-android.sh

export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk/jdk-17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
