fn main() {
    // Forward OAuth credentials to the compiler so `env!()` works in release builds.
    // In debug builds these are loaded at runtime from .env, so missing vars are fine.
    for key in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] {
        if let Ok(val) = std::env::var(key) {
            println!("cargo:rustc-env={key}={val}");
        }
    }

    tauri_build::build();
}
