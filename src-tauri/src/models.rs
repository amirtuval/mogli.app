use serde::{Deserialize, Serialize};
use specta::Type;

/// Account stored in JSON config.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub color: String,
    pub history_id: String,
    /// Whether this account's OAuth token has expired or been revoked.
    /// Skipped in background sync/reminders until re-authenticated.
    #[serde(default)]
    pub auth_expired: bool,
}

/// A single Google Calendar within an account.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Calendar {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub color: String,
    pub enabled: bool,
    pub primary: bool,
}

/// Calendar event.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CalEvent {
    pub id: String,
    pub account_id: String,
    pub calendar_id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
    pub location: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub conference_url: Option<String>,
}

/// Message metadata — never stores body.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MessageMeta {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
    pub date: i64,
    pub unread: bool,
    pub starred: bool,
    pub labels: Vec<String>,
}

/// Full thread — fetched on demand.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Thread {
    pub id: String,
    pub account_id: String,
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub date: i64,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Attachment {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
}

/// Request payload for sending a new email.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SendMessageRequest {
    pub account_id: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub subject: String,
    pub body: String,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
}

/// Payload emitted to the frontend when a calendar reminder fires.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReminderPayload {
    pub event_id: String,
    pub title: String,
    pub start: i64,
    pub calendar_name: String,
    pub calendar_color: String,
    pub minutes_until: i64,
}

/// Ordered list of account colors assigned on add.
pub const ACCOUNT_COLORS: &[&str] = &[
    "#4f9cf9", // blue
    "#f97316", // orange
    "#a78bfa", // purple
    "#34d399", // green
    "#f43f5e", // rose
    "#fbbf24", // amber
];

/// Returns the color for the nth account (cycles if > 6 accounts).
pub fn color_for_index(index: usize) -> String {
    ACCOUNT_COLORS[index % ACCOUNT_COLORS.len()].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_assignment_order() {
        assert_eq!(color_for_index(0), "#4f9cf9");
        assert_eq!(color_for_index(1), "#f97316");
        assert_eq!(color_for_index(2), "#a78bfa");
        assert_eq!(color_for_index(3), "#34d399");
        assert_eq!(color_for_index(4), "#f43f5e");
        assert_eq!(color_for_index(5), "#fbbf24");
    }

    #[test]
    fn test_color_assignment_wraps() {
        assert_eq!(color_for_index(6), "#4f9cf9");
        assert_eq!(color_for_index(7), "#f97316");
    }

    #[test]
    fn test_account_roundtrip() {
        let account = Account {
            id: "test-id".to_string(),
            email: "user@example.com".to_string(),
            display_name: "Test User".to_string(),
            color: "#4f9cf9".to_string(),
            history_id: "12345".to_string(),
            auth_expired: false,
        };
        let json = serde_json::to_string(&account).unwrap();
        let parsed: Account = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-id");
        assert_eq!(parsed.email, "user@example.com");
        assert_eq!(parsed.color, "#4f9cf9");
        assert!(!parsed.auth_expired);
    }

    #[test]
    fn test_account_auth_expired_defaults_false() {
        // Simulate loading a legacy account JSON without the auth_expired field
        let json =
            r##"{"id":"x","email":"a@b.com","display_name":"A","color":"#000","history_id":""}"##;
        let parsed: Account = serde_json::from_str(json).unwrap();
        assert!(!parsed.auth_expired);
    }

    #[test]
    fn test_reminder_payload_roundtrip() {
        let payload = ReminderPayload {
            event_id: "ev-123".to_string(),
            title: "Team Standup".to_string(),
            start: 1_772_000_000,
            calendar_name: "Work".to_string(),
            calendar_color: "#4f9cf9".to_string(),
            minutes_until: 5,
        };
        let json = serde_json::to_string(&payload).unwrap();
        let parsed: ReminderPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.event_id, "ev-123");
        assert_eq!(parsed.title, "Team Standup");
        assert_eq!(parsed.start, 1_772_000_000);
        assert_eq!(parsed.calendar_name, "Work");
        assert_eq!(parsed.calendar_color, "#4f9cf9");
        assert_eq!(parsed.minutes_until, 5);
    }
}
