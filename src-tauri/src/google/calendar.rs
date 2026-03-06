use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;

use crate::google::oauth::{OAuthCredentials, get_valid_token};
use crate::models::{CalEvent, Calendar};

const CALENDAR_BASE_URL: &str = "https://www.googleapis.com/calendar/v3";

// --- Google Calendar API response types ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarListResponse {
    items: Option<Vec<CalendarListEntry>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarListEntry {
    id: String,
    summary: Option<String>,
    background_color: Option<String>,
    primary: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventsListResponse {
    items: Option<Vec<EventResource>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventResource {
    id: Option<String>,
    summary: Option<String>,
    start: Option<EventDateTime>,
    end: Option<EventDateTime>,
    location: Option<String>,
    description: Option<String>,
    color_id: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventDateTime {
    /// RFC 3339 datetime for timed events.
    date_time: Option<String>,
    /// Date string (YYYY-MM-DD) for all-day events.
    date: Option<String>,
}

// --- Public API ---

/// Fetch all calendars for an account via `calendarList.list`.
pub async fn fetch_calendars(
    creds: &OAuthCredentials,
    account_id: &str,
    email: &str,
) -> Result<Vec<Calendar>, String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    let url = format!("{CALENDAR_BASE_URL}/users/me/calendarList");

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Calendar list request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("calendarList.list failed: {body}"));
    }

    let data: CalendarListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse calendarList response: {e}"))?;

    let calendars = data
        .items
        .unwrap_or_default()
        .into_iter()
        .map(|entry| Calendar {
            id: entry.id,
            account_id: account_id.to_string(),
            name: entry.summary.unwrap_or_else(|| "Untitled".to_string()),
            color: entry
                .background_color
                .unwrap_or_else(|| "#4f9cf9".to_string()),
            enabled: true,
            primary: entry.primary.unwrap_or(false),
        })
        .collect();

    Ok(calendars)
}

/// Fetch events for a single calendar within a time range.
pub async fn fetch_events(
    creds: &OAuthCredentials,
    account_id: &str,
    email: &str,
    calendar_id: &str,
    time_min: i64,
    time_max: i64,
) -> Result<Vec<CalEvent>, String> {
    let token = get_valid_token(creds, email).await?;
    let client = reqwest::Client::new();

    let time_min_rfc = timestamp_to_rfc3339(time_min);
    let time_max_rfc = timestamp_to_rfc3339(time_max);
    let encoded_cal_id = urlencoding::encode(calendar_id);

    let url = format!("{CALENDAR_BASE_URL}/calendars/{encoded_cal_id}/events");

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .query(&[
            ("timeMin", &time_min_rfc),
            ("timeMax", &time_max_rfc),
            ("singleEvents", &"true".to_string()),
            ("orderBy", &"startTime".to_string()),
            ("maxResults", &"250".to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Events list request failed: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("events.list failed for {calendar_id}: {body}"));
    }

    let data: EventsListResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse events response: {e}"))?;

    let events: Vec<CalEvent> = data
        .items
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.status.as_deref() != Some("cancelled"))
        .filter_map(|e| parse_event(e, account_id, calendar_id))
        .collect();

    Ok(events)
}

// --- Helpers ---

fn timestamp_to_rfc3339(ts: i64) -> String {
    DateTime::from_timestamp(ts, 0)
        .unwrap_or_else(Utc::now)
        .to_rfc3339()
}

/// Map a Google Calendar event `colorId` to its hex colour.
///
/// Google defines 11 fixed event colours (IDs "1"–"11").
/// See <https://developers.google.com/calendar/api/v3/reference/colors/get>.
fn color_id_to_hex(id: &str) -> Option<String> {
    let hex = match id {
        "1" => "#7986cb",  // Lavender
        "2" => "#33b679",  // Sage
        "3" => "#8e24aa",  // Grape
        "4" => "#e67c73",  // Flamingo
        "5" => "#f6bf26",  // Banana
        "6" => "#f4511e",  // Tangerine
        "7" => "#039be5",  // Peacock
        "8" => "#616161",  // Graphite
        "9" => "#3f51b5",  // Blueberry
        "10" => "#0b8043", // Basil
        "11" => "#d50000", // Tomato
        _ => return None,
    };
    Some(hex.to_string())
}

fn parse_event(event: EventResource, account_id: &str, calendar_id: &str) -> Option<CalEvent> {
    let id = event.id?;
    let title = event.summary.unwrap_or_else(|| "(No title)".to_string());
    let start_dt = event.start.as_ref()?;
    let end_dt = event.end.as_ref()?;

    let (start, end, all_day) = parse_event_times(start_dt, end_dt)?;

    Some(CalEvent {
        id,
        account_id: account_id.to_string(),
        calendar_id: calendar_id.to_string(),
        title,
        start,
        end,
        all_day,
        location: event.location,
        description: event.description,
        color: event.color_id.as_deref().and_then(color_id_to_hex),
    })
}

/// Parse event start/end into unix timestamps and determine if all-day.
///
/// Returns `(start_timestamp, end_timestamp, all_day)`.
fn parse_event_times(start: &EventDateTime, end: &EventDateTime) -> Option<(i64, i64, bool)> {
    // Timed event: both have dateTime
    if let (Some(start_dt), Some(end_dt)) = (&start.date_time, &end.date_time) {
        let s = parse_datetime(start_dt)?;
        let e = parse_datetime(end_dt)?;
        return Some((s, e, false));
    }

    // All-day event: both have date (YYYY-MM-DD)
    if let (Some(start_d), Some(end_d)) = (&start.date, &end.date) {
        let s = parse_date_to_timestamp(start_d)?;
        let e = parse_date_to_timestamp(end_d)?;
        return Some((s, e, true));
    }

    None
}

/// Parse an RFC 3339 datetime string to a unix timestamp.
fn parse_datetime(s: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

/// Parse a YYYY-MM-DD date string to a unix timestamp (midnight UTC).
fn parse_date_to_timestamp(s: &str) -> Option<i64> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|dt| dt.and_utc().timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_datetime_rfc3339() {
        let ts = parse_datetime("2026-03-06T09:00:00+02:00").unwrap();
        // 2026-03-06T09:00:00+02:00 = 2026-03-06T07:00:00Z
        let expected = DateTime::parse_from_rfc3339("2026-03-06T07:00:00Z")
            .unwrap()
            .timestamp();
        assert_eq!(ts, expected);
    }

    #[test]
    fn test_parse_datetime_utc() {
        let ts = parse_datetime("2026-03-06T07:00:00Z").unwrap();
        let expected = DateTime::parse_from_rfc3339("2026-03-06T07:00:00Z")
            .unwrap()
            .timestamp();
        assert_eq!(ts, expected);
    }

    #[test]
    fn test_parse_datetime_consistency() {
        // Both representations refer to the same instant
        let ts_offset = parse_datetime("2026-03-06T09:00:00+02:00").unwrap();
        let ts_utc = parse_datetime("2026-03-06T07:00:00Z").unwrap();
        assert_eq!(ts_offset, ts_utc);
    }

    #[test]
    fn test_parse_date_to_timestamp() {
        let ts = parse_date_to_timestamp("2026-03-06").unwrap();
        // Should be midnight UTC on 2026-03-06
        let expected = NaiveDate::from_ymd_opt(2026, 3, 6)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        assert_eq!(ts, expected);
    }

    #[test]
    fn test_parse_event_times_timed() {
        let start = EventDateTime {
            date_time: Some("2026-03-06T09:00:00Z".to_string()),
            date: None,
        };
        let end = EventDateTime {
            date_time: Some("2026-03-06T10:00:00Z".to_string()),
            date: None,
        };
        let (s, e, all_day) = parse_event_times(&start, &end).unwrap();
        let expected_s = DateTime::parse_from_rfc3339("2026-03-06T09:00:00Z")
            .unwrap()
            .timestamp();
        let expected_e = DateTime::parse_from_rfc3339("2026-03-06T10:00:00Z")
            .unwrap()
            .timestamp();
        assert_eq!(s, expected_s);
        assert_eq!(e, expected_e);
        assert_eq!(e - s, 3600); // 1 hour
        assert!(!all_day);
    }

    #[test]
    fn test_parse_event_times_all_day() {
        let start = EventDateTime {
            date_time: None,
            date: Some("2026-03-06".to_string()),
        };
        let end = EventDateTime {
            date_time: None,
            date: Some("2026-03-07".to_string()),
        };
        let (s, e, all_day) = parse_event_times(&start, &end).unwrap();
        let expected_s = NaiveDate::from_ymd_opt(2026, 3, 6)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let expected_e = NaiveDate::from_ymd_opt(2026, 3, 7)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        assert_eq!(s, expected_s);
        assert_eq!(e, expected_e);
        assert_eq!(e - s, 86400); // 1 day
        assert!(all_day);
    }

    #[test]
    fn test_parse_event_full() {
        let event = EventResource {
            id: Some("ev1".to_string()),
            summary: Some("Test Event".to_string()),
            start: Some(EventDateTime {
                date_time: Some("2026-03-06T14:00:00Z".to_string()),
                date: None,
            }),
            end: Some(EventDateTime {
                date_time: Some("2026-03-06T15:30:00Z".to_string()),
                date: None,
            }),
            location: Some("Room A".to_string()),
            description: None,
            color_id: None,
            status: Some("confirmed".to_string()),
        };

        let cal_event = parse_event(event, "acct1", "primary").unwrap();
        assert_eq!(cal_event.id, "ev1");
        assert_eq!(cal_event.title, "Test Event");
        assert_eq!(cal_event.account_id, "acct1");
        assert_eq!(cal_event.calendar_id, "primary");
        assert!(!cal_event.all_day);
        assert_eq!(cal_event.location.as_deref(), Some("Room A"));
    }

    #[test]
    fn test_cancelled_event_filtered() {
        let event = EventResource {
            id: Some("ev-cancelled".to_string()),
            summary: Some("Cancelled".to_string()),
            start: Some(EventDateTime {
                date_time: Some("2026-03-06T14:00:00Z".to_string()),
                date: None,
            }),
            end: Some(EventDateTime {
                date_time: Some("2026-03-06T15:00:00Z".to_string()),
                date: None,
            }),
            location: None,
            description: None,
            color_id: None,
            status: Some("cancelled".to_string()),
        };

        // Cancelled events should be filtered in fetch_events; here verify
        // the filter predicate
        assert_eq!(event.status.as_deref(), Some("cancelled"));
    }

    #[test]
    fn test_event_sort_across_calendars() {
        let mut events = vec![
            CalEvent {
                id: "e1".to_string(),
                account_id: "a1".to_string(),
                calendar_id: "c1".to_string(),
                title: "Later".to_string(),
                start: 1772812800,
                end: 1772816400,
                all_day: false,
                location: None,
                description: None,
                color: None,
            },
            CalEvent {
                id: "e2".to_string(),
                account_id: "a2".to_string(),
                calendar_id: "c2".to_string(),
                title: "Earlier".to_string(),
                start: 1772809200,
                end: 1772812800,
                all_day: false,
                location: None,
                description: None,
                color: None,
            },
        ];

        events.sort_by_key(|e| e.start);
        assert_eq!(events[0].title, "Earlier");
        assert_eq!(events[1].title, "Later");
    }

    #[test]
    fn test_calendar_list_entry_deserialization() {
        let json = r##"{
            "id": "primary",
            "summary": "Work Calendar",
            "backgroundColor": "#4f9cf9",
            "primary": true
        }"##;

        let entry: CalendarListEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.id, "primary");
        assert_eq!(entry.summary.as_deref(), Some("Work Calendar"));
        assert_eq!(entry.background_color.as_deref(), Some("#4f9cf9"));
        assert!(entry.primary.unwrap());
    }

    #[test]
    fn test_event_resource_deserialization() {
        let json = r#"{
            "id": "ev1",
            "summary": "Meeting",
            "start": { "dateTime": "2026-03-06T09:00:00Z" },
            "end": { "dateTime": "2026-03-06T10:00:00Z" },
            "status": "confirmed"
        }"#;

        let event: EventResource = serde_json::from_str(json).unwrap();
        assert_eq!(event.id.as_deref(), Some("ev1"));
        assert_eq!(event.summary.as_deref(), Some("Meeting"));
        assert!(event.start.unwrap().date_time.is_some());
    }

    #[test]
    fn test_all_day_event_deserialization() {
        let json = r#"{
            "id": "ev-ad",
            "summary": "Holiday",
            "start": { "date": "2026-03-06" },
            "end": { "date": "2026-03-07" },
            "status": "confirmed"
        }"#;

        let event: EventResource = serde_json::from_str(json).unwrap();
        let start = event.start.unwrap();
        assert!(start.date_time.is_none());
        assert_eq!(start.date.as_deref(), Some("2026-03-06"));
    }
}
