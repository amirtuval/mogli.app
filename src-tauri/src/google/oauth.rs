use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

use chrono::Utc;
use log::info;
use url::Url;

use crate::keychain::{self, StoredTokens};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPES: &str = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

/// OAuth credentials loaded from environment or build-time config.
#[derive(Debug, Clone)]
pub struct OAuthCredentials {
    pub client_id: String,
    pub client_secret: String,
}

impl OAuthCredentials {
    /// Load OAuth credentials.
    ///
    /// - **Debug builds:** reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
    ///   from environment variables at runtime (via `.env` file).
    /// - **Release builds:** embeds the credentials at compile time via `env!()`,
    ///   sourced from CI secrets or the build environment.
    pub fn load() -> Result<Self, String> {
        #[cfg(debug_assertions)]
        {
            let client_id =
                std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set")?;
            let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
                .map_err(|_| "GOOGLE_CLIENT_SECRET not set")?;
            Ok(Self {
                client_id,
                client_secret,
            })
        }

        #[cfg(not(debug_assertions))]
        {
            Ok(Self {
                client_id: env!("GOOGLE_CLIENT_ID").to_string(),
                client_secret: env!("GOOGLE_CLIENT_SECRET").to_string(),
            })
        }
    }
}

/// User info returned from Google's userinfo endpoint.
#[derive(Debug, serde::Deserialize)]
struct UserInfo {
    email: String,
    name: String,
}

/// Token response from Google's token endpoint.
#[derive(Debug, serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
    // token_type and scope also returned but not needed
}

/// Result of a successful OAuth flow.
pub struct OAuthResult {
    pub email: String,
    pub display_name: String,
}

/// Run the full `OAuth2` authorization code flow using a loopback redirect.
///
/// 1. Starts a local TCP listener on a random port
/// 2. Opens the browser to Google's consent screen
/// 3. Captures the auth code from the redirect
/// 4. Exchanges the code for tokens
/// 5. Fetches user info
/// 6. Stores tokens in the OS keychain
#[allow(clippy::too_many_lines)] // Sequential flow reads best as one function
pub async fn run_oauth_flow(creds: &OAuthCredentials) -> Result<OAuthResult, String> {
    // 1. Bind to a random available port
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Failed to bind listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    info!("OAuth redirect listener on {redirect_uri}");

    // 2. Build the authorization URL
    let auth_url = format!(
        "{GOOGLE_AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        urlencoding::encode(&creds.client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPES),
    );

    // Open in system browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    // 3. Wait for the redirect with the auth code
    let auth_code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let (stream, _) = listener
            .accept()
            .map_err(|e| format!("Failed to accept connection: {e}"))?;

        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader
            .read_line(&mut request_line)
            .map_err(|e| format!("Failed to read request: {e}"))?;

        // Parse the code from "GET /?code=AUTH_CODE&... HTTP/1.1"
        let path = request_line
            .split_whitespace()
            .nth(1)
            .ok_or("Invalid HTTP request")?
            .to_string();

        // Send a response to the browser
        let response_body = r#"<!DOCTYPE html>
<html><body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0c0c0e; color: #c4c4c8;">
<div style="text-align: center;">
<h1>&#x2B21; Mogly</h1>
<p>Authentication successful! You can close this tab.</p>
</div></body></html>"#;

        let response = format!(
            "HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: {}
Connection: close

{}",
            response_body.len(),
            response_body
        );

        // Use the underlying stream for writing
        drop(reader);
        let mut stream_ref = &stream;
        let _ = stream_ref.write_all(response.as_bytes());
        let _ = stream_ref.flush();
        drop(stream);

        // Extract the code parameter
        let fake_base = format!("http://localhost{path}");
        let url = Url::parse(&fake_base).map_err(|e| format!("Failed to parse redirect URL: {e}"))?;
        let code = url
            .query_pairs()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.to_string())
            .ok_or_else(|| {
                let error = url
                    .query_pairs()
                    .find(|(k, _)| k == "error")
                    .map_or_else(|| "unknown".to_string(), |(_, v)| v.to_string());
                format!("OAuth error: {error}")
            })?;

        Ok(code)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    info!("Received OAuth auth code");

    // 4. Exchange the code for tokens
    let client = reqwest::Client::new();
    let token_resp = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("code", auth_code.as_str()),
            ("client_id", creds.client_id.as_str()),
            ("client_secret", creds.client_secret.as_str()),
            ("redirect_uri", &format!("http://127.0.0.1:{port}")),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?;

    if !token_resp.status().is_success() {
        let body = token_resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {body}"));
    }

    let token_data: TokenResponse = token_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    let refresh_token = token_data
        .refresh_token
        .ok_or("No refresh token received — user may need to re-consent")?;

    let expires_at = Utc::now().timestamp() + token_data.expires_in;

    // 5. Fetch user info
    let user_resp = client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .map_err(|e| format!("User info request failed: {e}"))?;

    if !user_resp.status().is_success() {
        let body = user_resp.text().await.unwrap_or_default();
        return Err(format!("User info request failed: {body}"));
    }

    let user_info: UserInfo = user_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {e}"))?;

    // 6. Store tokens in keychain
    let stored = StoredTokens {
        access_token: token_data.access_token,
        refresh_token,
        expires_at,
    };

    keychain::store_tokens(&user_info.email, &stored)?;

    info!("OAuth flow complete for {}", user_info.email);

    Ok(OAuthResult {
        email: user_info.email,
        display_name: user_info.name,
    })
}

/// Refresh the access token if expired. Returns a valid access token.
pub async fn get_valid_token(creds: &OAuthCredentials, email: &str) -> Result<String, String> {
    let mut tokens = keychain::get_tokens(email)?;

    if !tokens.is_expired() {
        return Ok(tokens.access_token);
    }

    info!("Refreshing expired token for {email}");

    let client = reqwest::Client::new();
    let resp = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", creds.client_id.as_str()),
            ("client_secret", creds.client_secret.as_str()),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {body}"));
    }

    let token_data: TokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    tokens.access_token = token_data.access_token.clone();
    tokens.expires_at = Utc::now().timestamp() + token_data.expires_in;
    // Refresh token may or may not be rotated
    if let Some(new_refresh) = token_data.refresh_token {
        tokens.refresh_token = new_refresh;
    }

    keychain::store_tokens(email, &tokens)?;

    Ok(token_data.access_token)
}
