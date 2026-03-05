# Mogly — Desktop Gmail & Calendar App

A native desktop app (macOS, Windows, Linux) that provides a unified inbox and calendar view across multiple Google accounts. Built with **Tauri v2** (Rust backend) and **React + TypeScript** frontend.

For the full design and technical specification, see [docs/mogly-design.md](./docs/mogly-design.md).

## Project Status

**Phase 1: Scaffold + OAuth + Debug View** — core architecture is set up, OAuth is functional, and a minimal debug UI can display account and message data.

## Prerequisites

- **Node.js** ≥ 22 with **Yarn Classic** (v1.22.x)
- **Rust** 1.94.0 (managed automatically via `rust-toolchain.toml`)
- **Rustup** — [rustup.rs](https://rustup.rs/)

### Platform-specific

**Windows:**
- [MSVC Build Tools 2022](https://visualstudio.microsoft.com/downloads/) — ensure ARM64 components are installed if targeting ARM64
- [LLVM / Clang](https://llvm.org/builds/) — required by the `ring` crate on ARM64. Install via `choco install llvm -y`

**Linux:**
- `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libdbus-1-dev`, `pkg-config`

**macOS:**
- Xcode Command Line Tools

## Setup

```bash
git clone <repository-url>
cd mogli.app
yarn install
```

### Google Cloud credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project and enable the **Gmail API** and **Google Calendar API**
3. Create an OAuth 2.0 Client ID → Application type: **Desktop app**
4. Copy `.env.example` to `.env` and fill in your credentials:

```dotenv
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

> **Do not commit `.env`** — it is gitignored.

## Development

```bash
yarn tauri dev
```

On **ARM64 Windows**, run from a Visual Studio Developer Command Prompt and set:

```powershell
set CC="C:\Program Files\LLVM\bin\clang.exe"
yarn tauri dev
```

## Production Build

```bash
yarn tauri build
```

Binaries are output to `src-tauri/target/release/`, installers to `src-tauri/target/release/bundle/`.

## Testing

```bash
# Frontend tests (Vitest)
yarn test

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml --all
```

## Linting & Formatting

```bash
# Frontend
yarn lint
yarn format:check

# Rust
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::pedantic -D warnings
```

## Tech Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Zustand, TanStack Query     |
| Backend  | Rust (Tauri v2), reqwest, keyring, serde                |
| Styling  | CSS Modules + CSS custom properties                     |
| Testing  | Vitest + React Testing Library (frontend), cargo test + mockito (Rust) |
| CI       | GitHub Actions — lint, format, clippy pedantic, typecheck, tests |

## License

MIT
