use crate::model::Frame;
use rusqlite::{Connection, params};
use std::{collections::VecDeque, sync::Mutex, time::Duration};

pub struct Store(Mutex<Connection>);
impl Store {
    pub fn open(path: &str, identity: &str) -> Result<Self, String> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            std::fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .mode(0o600)
                .open(path)
                .map_err(|e| format!("Create history database: {e}"))?;
        }
        let connection =
            Connection::open(path).map_err(|e| format!("Open history database: {e}"))?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS frames (at TEXT PRIMARY KEY, data TEXT NOT NULL);").map_err(|e| e.to_string())?;
        connection
            .execute("INSERT OR IGNORE INTO identity VALUES (1,?1)", [identity])
            .map_err(|e| e.to_string())?;
        let stored: String = connection
            .query_row("SELECT name FROM identity WHERE id=1", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if stored != identity {
            return Err("History database belongs to a different cluster, endpoint or collector user; use a separate database".into());
        }
        Ok(Self(Mutex::new(connection)))
    }
    pub fn load(&self, limit: usize) -> Result<VecDeque<Frame>, String> {
        let connection = self.0.lock().map_err(|_| "History lock poisoned")?;
        let mut statement = connection
            .prepare("SELECT data FROM frames ORDER BY at DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([limit as i64], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut result = VecDeque::new();
        let mut bytes = 0;
        for row in rows {
            let raw = row.map_err(|e| e.to_string())?;
            bytes += raw.len();
            if bytes > 32 * 1024 * 1024 {
                break;
            }
            result.push_front(
                serde_json::from_str(&raw)
                    .map_err(|e| format!("Invalid persisted history: {e}"))?,
            );
        }
        Ok(result)
    }
    pub fn save(&self, frame: &Frame, oldest: &str) -> Result<(), String> {
        let raw = serde_json::to_string(frame).map_err(|e| e.to_string())?;
        let mut connection = self.0.lock().map_err(|_| "History lock poisoned")?;
        let transaction = connection.transaction().map_err(|e| e.to_string())?;
        transaction
            .execute(
                "INSERT OR REPLACE INTO frames VALUES (?1,?2)",
                params![frame.captured_at, raw],
            )
            .map_err(|e| e.to_string())?;
        transaction
            .execute("DELETE FROM frames WHERE at < ?1", [oldest])
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_survives_restart_and_respects_retention_and_identity() {
        let path =
            std::env::temp_dir().join(format!("slurm-lens-history-{}.sqlite", std::process::id()));
        let path = path.to_str().unwrap();
        let _ = std::fs::remove_file(path);
        let frame = |at: &str| Frame {
            captured_at: at.into(),
            jobs: vec![],
            inventory: None,
            metrics: None,
        };
        {
            let store = Store::open(path, "cluster/user").unwrap();
            store
                .save(&frame("2026-09-22T00:00:00Z"), "2026-09-22T00:00:00Z")
                .unwrap();
            store
                .save(&frame("2026-09-22T00:00:10Z"), "2026-09-22T00:00:00Z")
                .unwrap();
        }
        {
            assert!(Store::open(path, "other/user").is_err());
            let store = Store::open(path, "cluster/user").unwrap();
            assert_eq!(store.load(10).unwrap().len(), 2);
            assert_eq!(store.load(1).unwrap().len(), 1);
            store
                .save(&frame("2026-09-22T00:00:20Z"), "2026-09-22T00:00:10Z")
                .unwrap();
            let frames = store.load(10).unwrap();
            assert_eq!(frames.len(), 2);
            assert_eq!(frames[0].captured_at, "2026-09-22T00:00:10Z");
        }
        std::fs::remove_file(path).unwrap();
    }
}
