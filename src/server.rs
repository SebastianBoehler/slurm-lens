use crate::{live::Live, model::Session};
use axum::{
    Router,
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
};
use std::{convert::Infallible, future::IntoFuture, sync::Arc};
#[derive(Clone)]
pub enum Source {
    Recording(Arc<Session>),
    Live(Live),
}

pub async fn serve(source: Source) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = router(source);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:4317").await?;
    println!("Slurm Lens → http://127.0.0.1:4317\nRead-only · Ctrl+C to stop");
    tokio::select! {
        result = axum::serve(listener, app).into_future() => result?,
        _ = tokio::signal::ctrl_c() => {},
    }
    Ok(())
}
pub fn router(source: Source) -> Router {
    Router::new()
        .route("/api/session", axum::routing::get(session))
        .route("/api/status", axum::routing::get(status))
        .route("/api/events", axum::routing::get(events))
        .fallback(asset)
        .with_state(source)
        .layer(middleware::from_fn(guard))
}
async fn guard(request: Request, next: Next) -> Response {
    if !request
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| ["localhost:4317", "127.0.0.1:4317"].contains(&h))
    {
        return (StatusCode::FORBIDDEN, "Local host required").into_response();
    }
    if request.method() != axum::http::Method::GET && request.method() != axum::http::Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            "Read-only: GET and HEAD only",
        )
            .into_response();
    }
    let mut response = next.run(request).await;
    for (key, value) in [
        ("cache-control", "no-store"),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        (
            "content-security-policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        ),
    ] {
        response.headers_mut().insert(
            axum::http::HeaderName::from_static(key),
            axum::http::HeaderValue::from_static(value),
        );
    }
    response
}
async fn asset(request: Request) -> Response {
    if let Some((mime, bytes)) = crate::assets::asset(request.uri().path()) {
        ([(header::CONTENT_TYPE, mime)], bytes).into_response()
    } else {
        (StatusCode::NOT_FOUND, "Not found").into_response()
    }
}
async fn session(State(source): State<Source>) -> Response {
    let data = match source {
        Source::Recording(s) => (*s).clone(),
        Source::Live(l) => l.session().await,
    };
    axum::Json(data).into_response()
}
async fn status(State(source): State<Source>) -> Response {
    match source {
        Source::Recording(_) => axum::Json(serde_json::json!({"mode":"recording"})).into_response(),
        Source::Live(l) => {
            axum::Json(serde_json::json!({"mode":"live","update":l.state.read().await.clone()}))
                .into_response()
        }
    }
}
async fn events(State(source): State<Source>) -> Response {
    let Source::Live(live) = source else {
        return (StatusCode::CONFLICT, "Not a live connection").into_response();
    };
    let mut receiver = live.events.subscribe();
    let stream = async_stream::stream! {
        let initial=live.state.read().await.clone();
        yield Ok::<Event,Infallible>(Event::default().event("update").json_data(&initial).expect("serializable update"));
        loop {
            let update=match receiver.recv().await {
                Ok(update)=>update,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_))=>Arc::new(live.state.read().await.clone()),
                Err(_)=>break,
            };
            yield Ok(Event::default().event("update").json_data(&*update).expect("serializable update"));
        }
    };
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
