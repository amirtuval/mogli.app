use std::fmt::Write as _;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;

use crate::google::oauth::{OAuthCredentials, get_valid_token};
use crate::models::{Attachment, Message, MessageMeta, Thread};

const GMAIL_BASE_URL: &str = "https://gmail.googleapis.com/gmail/v1";

// --- Gmail API response types ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListMessagesResponse {
    messages: Option<Vec<MessageRef>>,
    // next_page_token will be added back for pagination in Phase 5
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageRef {
    id: String,
    // thread_id will be added back when thread grouping is implemented
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailMessage {
    id: String,
    thread_id: String,
    label_ids: Option<Vec<String>>,
    snippet: Option<String>,
    internal_date: Option<String>,
    payload: Option<MessagePart>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessagePart {
    mime_type: Option<String>,
    headers: Option<Vec<Header>>,
    body: Option<MessageBody>,
    parts: Option<Vec<MessagePart>>,
    filename: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageBody {
    attachment_id: Option<String>,
    size: Option<u64>,
    data: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailThread {
    id: String,
    messages: Option<Vec<GmailMessage>>,
}

// --- Helper functions ---

fn get_header(headers: &[Header], name: &str) -> String {
    headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case(name))
        .map(|h| h.value.clone())
        .unwrap_or_default()
}

fn decode_base64url(data: &str) -> Option<String> {
    URL_SAFE_NO_PAD
        .decode(data)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

/// Recursively extract body text/html from MIME parts.
fn extract_body(part: &MessagePart) -> (Option<String>, Option<String>) {
    let mime = part.mime_type.as_deref().unwrap_or("");

    match mime {
        "text/html" => {
            let html = part
                .body
                .as_ref()
                .and_then(|b| b.data.as_deref())
                .and_then(decode_base64url);
            (html, None)
        }
        "text/plain" => {
            let text = part
                .body
                .as_ref()
                .and_then(|b| b.data.as_deref())
                .and_then(decode_base64url);
            (None, text)
        }
        _ if mime.starts_with("multipart/") => {
            let mut html = None;
            let mut text = None;
            if let Some(parts) = &part.parts {
                for sub in parts {
                    let (h, t) = extract_body(sub);
                    if h.is_some() {
                        html = h;
                    }
                    if t.is_some() {
                        text = t;
                    }
                }
            }
            (html, text)
        }
        _ => (None, None),
    }
}

/// Extract attachments from MIME parts.
fn extract_attachments(part: &MessagePart) -> Vec<Attachment> {
    let mut attachments = Vec::new();
    let filename = part.filename.as_deref().unwrap_or("");

    if !filename.is_empty()
        && let Some(body) = &part.body
        && let Some(att_id) = &body.attachment_id
    {
        attachments.push(Attachment {
            id: att_id.clone(),
            filename: filename.to_string(),
            mime_type: part.mime_type.clone().unwrap_or_default(),
            size: body.size.unwrap_or(0),
        });
    }

    if let Some(parts) = &part.parts {
        for sub in parts {
            attachments.extend(extract_attachments(sub));
        }
    }

    attachments
}

fn parse_message_meta(msg: &GmailMessage, account_id: &str) -> MessageMeta {
    let headers = msg
        .payload
        .as_ref()
        .and_then(|p| p.headers.as_ref())
        .map_or(&[] as &[Header], Vec::as_slice);

    let labels = msg.label_ids.clone().unwrap_or_default();

    MessageMeta {
        id: msg.id.clone(),
        thread_id: msg.thread_id.clone(),
        account_id: account_id.to_string(),
        from: get_header(headers, "From"),
        subject: get_header(headers, "Subject"),
        snippet: msg.snippet.clone().unwrap_or_default(),
        date: msg
            .internal_date
            .as_deref()
            .and_then(|d| d.parse::<i64>().ok())
            .map_or(0, |ms| ms / 1000), // Gmail uses milliseconds
        unread: labels.contains(&"UNREAD".to_string()),
        starred: labels.contains(&"STARRED".to_string()),
        labels,
    }
}

fn parse_full_message(msg: &GmailMessage) -> Message {
    let headers = msg
        .payload
        .as_ref()
        .and_then(|p| p.headers.as_ref())
        .map_or(&[] as &[Header], Vec::as_slice);

    let (body_html, body_text) = msg.payload.as_ref().map_or((None, None), extract_body);

    let attachments = msg
        .payload
        .as_ref()
        .map_or_else(Vec::new, extract_attachments);

    let to_header = get_header(headers, "To");
    let to: Vec<String> = to_header
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Message {
        id: msg.id.clone(),
        from: get_header(headers, "From"),
        to,
        subject: get_header(headers, "Subject"),
        body_html,
        body_text,
        date: msg
            .internal_date
            .as_deref()
            .and_then(|d| d.parse::<i64>().ok())
            .map_or(0, |ms| ms / 1000),
        attachments,
    }
}

// --- Public API functions ---

/// Fetch message metadata for a single account.
pub async fn fetch_messages(
    creds: &OAuthCredentials,
    account_id: &str,
    email: &str,
    label: &str,
    page_token: Option<&str>,
) -> Result<Vec<MessageMeta>, String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    // List message IDs
    let mut url = format!("{GMAIL_BASE_URL}/users/me/messages?labelIds={label}&maxResults=50");
    if let Some(pt) = page_token {
        let _ = write!(url, "&pageToken={pt}");
    }

    let list_resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Gmail list request failed: {e}"))?;

    if !list_resp.status().is_success() {
        let body = list_resp.text().await.unwrap_or_default();
        return Err(format!("Gmail list failed: {body}"));
    }

    let list_data: ListMessagesResponse = list_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse message list: {e}"))?;

    let msg_refs = list_data.messages.unwrap_or_default();
    if msg_refs.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch metadata for all messages in parallel
    let mut join_set = tokio::task::JoinSet::new();
    for msg_ref in msg_refs {
        let client = client.clone();
        let token = token.clone();
        let account_id = account_id.to_string();
        let msg_id = msg_ref.id;
        join_set.spawn(async move {
            let msg_url = format!(
                "{GMAIL_BASE_URL}/users/me/messages/{msg_id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
            );
            let msg_resp = client
                .get(&msg_url)
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|e| format!("Gmail get message failed: {e}"))?;

            if !msg_resp.status().is_success() {
                return Err(format!("Gmail get message {msg_id} failed: {}", msg_resp.status()));
            }

            let gmail_msg: GmailMessage = msg_resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse message: {e}"))?;
            Ok(parse_message_meta(&gmail_msg, &account_id))
        });
    }

    let mut messages = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(meta)) => messages.push(meta),
            Ok(Err(e)) => log::warn!("Skipping message: {e}"),
            Err(e) => log::warn!("Message fetch task panicked: {e}"),
        }
    }

    // Sort by date descending
    messages.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(messages)
}

/// Fetch a full thread with message bodies.
pub async fn fetch_thread(
    creds: &OAuthCredentials,
    account_id: &str,
    email: &str,
    thread_id: &str,
) -> Result<Thread, String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    let url = format!("{GMAIL_BASE_URL}/users/me/threads/{thread_id}?format=full");
    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Gmail thread request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gmail thread fetch failed: {body}"));
    }

    let gmail_thread: GmailThread = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse thread: {e}"))?;

    let messages: Vec<Message> = gmail_thread
        .messages
        .unwrap_or_default()
        .iter()
        .map(parse_full_message)
        .collect();

    Ok(Thread {
        id: gmail_thread.id,
        account_id: account_id.to_string(),
        messages,
    })
}

/// Modify labels on all messages in a thread.
async fn modify_thread_labels(
    creds: &OAuthCredentials,
    email: &str,
    thread_id: &str,
    add_labels: &[&str],
    remove_labels: &[&str],
) -> Result<(), String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    let url = format!("{GMAIL_BASE_URL}/users/me/threads/{thread_id}/modify");
    let body = serde_json::json!({
        "addLabelIds": add_labels,
        "removeLabelIds": remove_labels,
    });

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gmail modify request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gmail modify failed: {body}"));
    }

    Ok(())
}

/// Archive a thread (remove INBOX label).
pub async fn archive_thread(
    creds: &OAuthCredentials,
    email: &str,
    thread_id: &str,
) -> Result<(), String> {
    modify_thread_labels(creds, email, thread_id, &[], &["INBOX"]).await
}

/// Star or unstar a thread.
pub async fn star_thread(
    creds: &OAuthCredentials,
    email: &str,
    thread_id: &str,
    starred: bool,
) -> Result<(), String> {
    if starred {
        modify_thread_labels(creds, email, thread_id, &["STARRED"], &[]).await
    } else {
        modify_thread_labels(creds, email, thread_id, &[], &["STARRED"]).await
    }
}

/// Mark a thread as read (remove UNREAD label).
pub async fn mark_read(
    creds: &OAuthCredentials,
    email: &str,
    thread_id: &str,
) -> Result<(), String> {
    modify_thread_labels(creds, email, thread_id, &[], &["UNREAD"]).await
}

// --- Incremental sync via history.list ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryListResponse {
    history: Option<Vec<HistoryRecord>>,
    history_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryRecord {
    messages_added: Option<Vec<HistoryMessageAdded>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryMessageAdded {
    #[allow(dead_code)]
    message: MessageRef,
}

/// Result of an incremental sync check via `history.list`.
pub struct HistorySyncResult {
    /// Whether new messages were added since the last sync.
    pub has_new_messages: bool,
    /// The new `historyId` to store for next sync.
    pub new_history_id: String,
}

/// Check for new messages since `start_history_id` using Gmail's history API.
///
/// Returns `Ok(None)` if the `historyId` is too old (Google returns 404),
/// in which case the caller should fall back to a full sync.
pub async fn fetch_history(
    creds: &OAuthCredentials,
    email: &str,
    start_history_id: &str,
) -> Result<Option<HistorySyncResult>, String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    let url = format!(
        "{GMAIL_BASE_URL}/users/me/history?startHistoryId={start_history_id}&historyTypes=messageAdded&labelId=INBOX"
    );

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Gmail history request failed: {e}"))?;

    // 404 means the historyId is too old — caller should do full sync
    if resp.status().as_u16() == 404 {
        return Ok(None);
    }

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gmail history.list failed: {body}"));
    }

    let data: HistoryListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse history response: {e}"))?;

    let has_new_messages = data.history.as_ref().is_some_and(|records| {
        records.iter().any(|r| {
            r.messages_added
                .as_ref()
                .is_some_and(|added| !added.is_empty())
        })
    });

    let new_history_id = data
        .history_id
        .unwrap_or_else(|| start_history_id.to_string());

    Ok(Some(HistorySyncResult {
        has_new_messages,
        new_history_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_header() {
        let headers = vec![
            Header {
                name: "From".to_string(),
                value: "alice@example.com".to_string(),
            },
            Header {
                name: "Subject".to_string(),
                value: "Hello World".to_string(),
            },
        ];
        assert_eq!(get_header(&headers, "From"), "alice@example.com");
        assert_eq!(get_header(&headers, "subject"), "Hello World"); // case-insensitive
        assert_eq!(get_header(&headers, "Missing"), "");
    }

    #[test]
    fn test_decode_base64url() {
        // "Hello World" in base64url (no padding)
        let encoded = "SGVsbG8gV29ybGQ";
        assert_eq!(decode_base64url(encoded), Some("Hello World".to_string()));
    }

    #[test]
    fn test_decode_base64url_invalid() {
        assert!(decode_base64url("!!!invalid!!!").is_none());
    }

    #[test]
    fn test_parse_message_meta() {
        let msg = GmailMessage {
            id: "msg1".to_string(),
            thread_id: "thread1".to_string(),
            label_ids: Some(vec!["INBOX".to_string(), "UNREAD".to_string()]),
            snippet: Some("Hey there...".to_string()),
            internal_date: Some("1700000000000".to_string()), // milliseconds
            payload: Some(MessagePart {
                mime_type: None,
                headers: Some(vec![
                    Header {
                        name: "From".to_string(),
                        value: "bob@example.com".to_string(),
                    },
                    Header {
                        name: "Subject".to_string(),
                        value: "Test Subject".to_string(),
                    },
                ]),
                body: None,
                parts: None,
                filename: None,
            }),
        };

        let meta = parse_message_meta(&msg, "account-1");
        assert_eq!(meta.id, "msg1");
        assert_eq!(meta.thread_id, "thread1");
        assert_eq!(meta.account_id, "account-1");
        assert_eq!(meta.from, "bob@example.com");
        assert_eq!(meta.subject, "Test Subject");
        assert_eq!(meta.snippet, "Hey there...");
        assert_eq!(meta.date, 1700000000); // converted from ms to s
        assert!(meta.unread);
        assert!(!meta.starred);
    }

    #[test]
    fn test_extract_body_plain_text() {
        let part = MessagePart {
            mime_type: Some("text/plain".to_string()),
            headers: None,
            body: Some(MessageBody {
                attachment_id: None,
                size: Some(11),
                data: Some("SGVsbG8gV29ybGQ".to_string()), // "Hello World"
            }),
            parts: None,
            filename: None,
        };
        let (html, text) = extract_body(&part);
        assert!(html.is_none());
        assert_eq!(text, Some("Hello World".to_string()));
    }

    #[test]
    fn test_extract_body_multipart() {
        let part = MessagePart {
            mime_type: Some("multipart/alternative".to_string()),
            headers: None,
            body: None,
            parts: Some(vec![
                MessagePart {
                    mime_type: Some("text/plain".to_string()),
                    headers: None,
                    body: Some(MessageBody {
                        attachment_id: None,
                        size: Some(5),
                        data: Some("SGVsbG8".to_string()), // "Hello"
                    }),
                    parts: None,
                    filename: None,
                },
                MessagePart {
                    mime_type: Some("text/html".to_string()),
                    headers: None,
                    body: Some(MessageBody {
                        attachment_id: None,
                        size: Some(12),
                        data: Some("PGI-SGk8L2I-".to_string()), // "<b>Hi</b>"
                    }),
                    parts: None,
                    filename: None,
                },
            ]),
            filename: None,
        };
        let (html, text) = extract_body(&part);
        assert!(html.is_some());
        assert!(text.is_some());
    }

    #[test]
    fn test_multi_account_merge_sort() {
        // Simulate messages from two different accounts, merged and sorted by date desc
        let mut messages = vec![
            MessageMeta {
                id: "m1".to_string(),
                thread_id: "t1".to_string(),
                account_id: "account-work".to_string(),
                from: "alice@work.com".to_string(),
                subject: "Work email".to_string(),
                snippet: "...".to_string(),
                date: 1700000100,
                unread: true,
                starred: false,
                labels: vec!["INBOX".to_string()],
            },
            MessageMeta {
                id: "m2".to_string(),
                thread_id: "t2".to_string(),
                account_id: "account-personal".to_string(),
                from: "bob@personal.com".to_string(),
                subject: "Personal email".to_string(),
                snippet: "...".to_string(),
                date: 1700000300, // newest
                unread: false,
                starred: true,
                labels: vec!["INBOX".to_string()],
            },
            MessageMeta {
                id: "m3".to_string(),
                thread_id: "t3".to_string(),
                account_id: "account-work".to_string(),
                from: "charlie@work.com".to_string(),
                subject: "Another work email".to_string(),
                snippet: "...".to_string(),
                date: 1700000200,
                unread: true,
                starred: false,
                labels: vec!["INBOX".to_string()],
            },
        ];

        // Same sort logic as get_messages command
        messages.sort_by(|a, b| b.date.cmp(&a.date));

        assert_eq!(messages[0].id, "m2"); // newest (300)
        assert_eq!(messages[0].account_id, "account-personal");
        assert_eq!(messages[1].id, "m3"); // middle (200)
        assert_eq!(messages[1].account_id, "account-work");
        assert_eq!(messages[2].id, "m1"); // oldest (100)
        assert_eq!(messages[2].account_id, "account-work");
    }

    #[test]
    fn test_extract_attachments() {
        let part = MessagePart {
            mime_type: Some("multipart/mixed".to_string()),
            headers: None,
            body: None,
            parts: Some(vec![
                MessagePart {
                    mime_type: Some("text/plain".to_string()),
                    headers: None,
                    body: Some(MessageBody {
                        attachment_id: None,
                        size: None,
                        data: Some("dGVzdA".to_string()),
                    }),
                    parts: None,
                    filename: None,
                },
                MessagePart {
                    mime_type: Some("application/pdf".to_string()),
                    headers: None,
                    body: Some(MessageBody {
                        attachment_id: Some("att-1".to_string()),
                        size: Some(12345),
                        data: None,
                    }),
                    parts: None,
                    filename: Some("document.pdf".to_string()),
                },
            ]),
            filename: None,
        };
        let atts = extract_attachments(&part);
        assert_eq!(atts.len(), 1);
        assert_eq!(atts[0].filename, "document.pdf");
        assert_eq!(atts[0].mime_type, "application/pdf");
        assert_eq!(atts[0].size, 12345);
    }
}
