pub fn asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    let file = match path {
        "/history.js" => (
            "text/javascript",
            include_bytes!("../web/history.js").as_slice(),
        ),
        "/history.css" => ("text/css", include_bytes!("../web/history.css").as_slice()),
        "/live-state.js" => (
            "text/javascript",
            include_bytes!("../web/live-state.js").as_slice(),
        ),
        "/live-views.js" => (
            "text/javascript",
            include_bytes!("../web/live-views.js").as_slice(),
        ),
        "/layout.js" => (
            "text/javascript",
            include_bytes!("../web/layout.js").as_slice(),
        ),
        "/" | "/index.html" => ("text/html", include_bytes!("../web/index.html").as_slice()),
        "/styles.css" => ("text/css", include_bytes!("../web/styles.css").as_slice()),
        "/timeline.css" => ("text/css", include_bytes!("../web/timeline.css").as_slice()),
        "/app.js" => (
            "text/javascript",
            include_bytes!("../web/app.js").as_slice(),
        ),
        "/components.js" => (
            "text/javascript",
            include_bytes!("../web/components.js").as_slice(),
        ),
        "/views.js" => (
            "text/javascript",
            include_bytes!("../web/views.js").as_slice(),
        ),
        "/timeline.js" => (
            "text/javascript",
            include_bytes!("../web/timeline.js").as_slice(),
        ),
        "/inspector.js" => (
            "text/javascript",
            include_bytes!("../web/inspector.js").as_slice(),
        ),
        "/favicon.svg" => (
            "image/svg+xml",
            include_bytes!("../web/favicon.svg").as_slice(),
        ),
        _ => return None,
    };
    Some(file)
}
