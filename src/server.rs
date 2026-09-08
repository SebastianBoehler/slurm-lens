use tiny_http::{Header, Method, Response, Server, StatusCode};

fn asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    let file = match path {
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

pub fn serve(session: Vec<u8>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let server = Server::http("127.0.0.1:4317")?;
    println!("Slurm Lens → http://127.0.0.1:4317\nRecorded session · read-only · Ctrl+C to stop");
    for request in server.incoming_requests() {
        let path = request.url().split('?').next().unwrap_or("");
        let local_host = request.headers().iter().any(|h| {
            h.field.equiv("Host")
                && ["127.0.0.1:4317", "localhost:4317"].contains(&h.value.as_str())
        });
        let (status, mime, body) = if !local_host {
            (403, "text/plain", b"Local host required".as_slice())
        } else if request.method() != &Method::Get && request.method() != &Method::Head {
            (
                405,
                "text/plain",
                b"Read-only: GET and HEAD only".as_slice(),
            )
        } else if path == "/api/session" {
            (200, "application/json", session.as_slice())
        } else if let Some((mime, bytes)) = asset(path) {
            (200, mime, bytes)
        } else {
            (404, "text/plain", b"Not found".as_slice())
        };
        let mut response = Response::from_data(body).with_status_code(StatusCode(status));
        for (name, value) in [
            ("Content-Type", format!("{mime}; charset=utf-8")),
            ("Cache-Control", "no-cache".into()),
            ("X-Content-Type-Options", "nosniff".into()),
            ("Referrer-Policy", "no-referrer".into()),
            ("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'".into()),
        ] {
            response.add_header(Header::from_bytes(name, value).expect("static header"));
        }
        if let Err(error) = request.respond(response) {
            eprintln!("Response failed: {error}");
        }
    }
    Ok(())
}
