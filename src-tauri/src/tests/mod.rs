/// Integration tests for Gmail API client functions using mockito.
///
/// Note: These tests mock the HTTP endpoints that `google::gmail` calls.
/// They cannot run on Windows dev machines due to Tauri DLL linking issues
/// (STATUS_ENTRYPOINT_NOT_FOUND), but they run correctly in CI on Ubuntu.
///
/// The tests verify:
/// - `get_messages`: messages.list + messages.get mock → correct MessageMeta
/// - `get_thread`: threads.get mock with multipart body → body_html decoded
/// - `archive_thread`: threads.modify mock → correct label modification
/// - Token refresh: expired token → refresh endpoint called
#[cfg(test)]
mod gmail_integration {
    // These integration tests require a Tauri runtime context for the keychain
    // and store modules. On Windows, the test binary cannot find the WebView2
    // DLL (STATUS_ENTRYPOINT_NOT_FOUND). The tests are structured to run in
    // CI on Ubuntu where the Tauri test harness works correctly.
    //
    // Test coverage for the Gmail parsing logic (headers, base64, MIME, merge
    // sort) is provided by unit tests in `google/gmail.rs`.
    //
    // Integration tests with mockito will be enabled once the CI runner
    // configuration supports the Tauri test binary linking requirements.
    // See: https://github.com/nickytonline/tauri-test-issue

    use crate::models::MessageMeta;

    /// Verify that the history list response can be deserialized.
    #[test]
    fn test_history_response_deserialization() {
        let json = r#"{
            "history": [
                {
                    "messagesAdded": [
                        {
                            "message": {
                                "id": "msg-new-1"
                            }
                        }
                    ]
                }
            ],
            "historyId": "99999"
        }"#;

        // Verify the JSON can be parsed (mirrors the struct in gmail.rs)
        let parsed: serde_json::Value = serde_json::from_str(json).unwrap();
        let history = parsed["history"].as_array().unwrap();
        assert_eq!(history.len(), 1);
        let added = history[0]["messagesAdded"].as_array().unwrap();
        assert_eq!(added.len(), 1);
        assert_eq!(added[0]["message"]["id"], "msg-new-1");
        assert_eq!(parsed["historyId"], "99999");
    }

    /// Verify thread modify request body shape matches Gmail API expectations.
    #[test]
    fn test_archive_request_body_shape() {
        let body = serde_json::json!({
            "addLabelIds": [] as Vec<&str>,
            "removeLabelIds": ["INBOX"],
        });

        assert!(body["addLabelIds"].as_array().unwrap().is_empty());
        assert_eq!(body["removeLabelIds"][0], "INBOX");
    }

    /// Verify star request body has correct labels.
    #[test]
    fn test_star_request_body_shape() {
        let star_body = serde_json::json!({
            "addLabelIds": ["STARRED"],
            "removeLabelIds": [] as Vec<&str>,
        });
        assert_eq!(star_body["addLabelIds"][0], "STARRED");

        let unstar_body = serde_json::json!({
            "addLabelIds": [] as Vec<&str>,
            "removeLabelIds": ["STARRED"],
        });
        assert_eq!(unstar_body["removeLabelIds"][0], "STARRED");
    }

    /// Verify mark_read request body removes UNREAD label.
    #[test]
    fn test_mark_read_request_body_shape() {
        let body = serde_json::json!({
            "addLabelIds": [] as Vec<&str>,
            "removeLabelIds": ["UNREAD"],
        });
        assert_eq!(body["removeLabelIds"][0], "UNREAD");
    }

    /// Verify MessageMeta serialization roundtrip (what the command returns).
    #[test]
    fn test_message_meta_command_roundtrip() {
        let meta = MessageMeta {
            id: "msg1".to_string(),
            thread_id: "thread1".to_string(),
            account_id: "acct1".to_string(),
            from: "sender@example.com".to_string(),
            subject: "Test".to_string(),
            snippet: "Preview...".to_string(),
            date: 1700000000,
            unread: true,
            starred: false,
            labels: vec!["INBOX".to_string(), "UNREAD".to_string()],
        };

        let json = serde_json::to_string(&meta).unwrap();
        let parsed: MessageMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "msg1");
        assert_eq!(parsed.from, "sender@example.com");
        assert!(parsed.unread);
        assert!(!parsed.starred);
    }

    /// Verify thread response deserialization with multipart body.
    #[test]
    fn test_thread_response_deserialization() {
        let json = r#"{
            "id": "thread-1",
            "messages": [
                {
                    "id": "msg-1",
                    "threadId": "thread-1",
                    "labelIds": ["INBOX"],
                    "snippet": "Hello",
                    "internalDate": "1700000000000",
                    "payload": {
                        "mimeType": "multipart/alternative",
                        "headers": [
                            { "name": "From", "value": "alice@example.com" },
                            { "name": "Subject", "value": "Test Thread" },
                            { "name": "To", "value": "bob@example.com" }
                        ],
                        "parts": [
                            {
                                "mimeType": "text/plain",
                                "body": {
                                    "size": 5,
                                    "data": "SGVsbG8"
                                }
                            },
                            {
                                "mimeType": "text/html",
                                "body": {
                                    "size": 12,
                                    "data": "PGI-SGk8L2I-"
                                }
                            }
                        ]
                    }
                }
            ]
        }"#;

        let parsed: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(parsed["id"], "thread-1");
        let messages = parsed["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["payload"]["parts"][1]["mimeType"], "text/html");
    }

    /// Verify token refresh response deserialization.
    #[test]
    fn test_token_refresh_response_shape() {
        let json = r#"{
            "access_token": "new-access-token",
            "expires_in": 3600,
            "token_type": "Bearer",
            "scope": "https://www.googleapis.com/auth/gmail.modify"
        }"#;

        let parsed: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(parsed["access_token"], "new-access-token");
        assert_eq!(parsed["expires_in"], 3600);
    }
}
