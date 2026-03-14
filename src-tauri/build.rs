fn main() {
    // Forward OAuth credentials to the compiler so `env!()` works in release builds.
    // In debug builds these are loaded at runtime from .env, so missing vars are fine.
    for key in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] {
        // Re-run build.rs when the env var changes so cached builds don't use stale values.
        println!("cargo:rerun-if-env-changed={key}");
        if let Ok(val) = std::env::var(key) {
            println!("cargo:rustc-env={key}={val}");
        }
    }

    tauri_build::build();
}
