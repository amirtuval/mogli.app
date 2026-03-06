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
        };
        let json = serde_json::to_string(&account).unwrap();
        let parsed: Account = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-id");
        assert_eq!(parsed.email, "user@example.com");
        assert_eq!(parsed.color, "#4f9cf9");
    }
}
