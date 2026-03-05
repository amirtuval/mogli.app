use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "mogly";

/// Token data stored in the OS keychain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix timestamp when the access token expires.
    pub expires_at: i64,
}

impl StoredTokens {
    /// Check if the access token is expired (with 60s buffer).
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        self.expires_at <= now + 60
    }
}

/// Store tokens in the OS keychain under key `mogly::{email}`.
pub fn store_tokens(email: &str, tokens: &StoredTokens) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, email)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    let json = serde_json::to_string(tokens).map_err(|e| format!("Serialize error: {e}"))?;
    entry
        .set_password(&json)
        .map_err(|e| format!("Keychain store error: {e}"))?;
    Ok(())
}

/// Retrieve tokens from the OS keychain.
pub fn get_tokens(email: &str) -> Result<StoredTokens, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, email)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    let json = entry
        .get_password()
        .map_err(|e| format!("Keychain retrieve error: {e}"))?;
    let tokens: StoredTokens =
        serde_json::from_str(&json).map_err(|e| format!("Deserialize error: {e}"))?;
    Ok(tokens)
}

/// Delete tokens from the OS keychain.
pub fn delete_tokens(email: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, email)
        .map_err(|e| format!("Keychain entry error: {e}"))?;
    entry
        .delete_credential()
        .map_err(|e| format!("Keychain delete error: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_expired() {
        let tokens = StoredTokens {
            access_token: "test".to_string(),
            refresh_token: "test".to_string(),
            expires_at: 0, // Unix epoch — definitely expired
        };
        assert!(tokens.is_expired());
    }

    #[test]
    fn test_token_not_expired() {
        let tokens = StoredTokens {
            access_token: "test".to_string(),
            refresh_token: "test".to_string(),
            expires_at: chrono::Utc::now().timestamp() + 3600, // 1 hour from now
        };
        assert!(!tokens.is_expired());
    }

    #[test]
    fn test_token_expired_within_buffer() {
        let tokens = StoredTokens {
            access_token: "test".to_string(),
            refresh_token: "test".to_string(),
            expires_at: chrono::Utc::now().timestamp() + 30, // 30s from now, within 60s buffer
        };
        assert!(tokens.is_expired());
    }

    #[test]
    fn test_stored_tokens_roundtrip() {
        let tokens = StoredTokens {
            access_token: "access123".to_string(),
            refresh_token: "refresh456".to_string(),
            expires_at: 1700000000,
        };
        let json = serde_json::to_string(&tokens).unwrap();
        let parsed: StoredTokens = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.access_token, "access123");
        assert_eq!(parsed.refresh_token, "refresh456");
        assert_eq!(parsed.expires_at, 1700000000);
    }
}
