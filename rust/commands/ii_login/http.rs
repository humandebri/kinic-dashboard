// Where: Local callback HTTP server for CLI login.
// What: Handles CORS, validates callback payloads, and forwards delegations to the CLI.
// Why: Keeps the login HTTP surface small and auditable.
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header::CONTENT_TYPE},
    response::{IntoResponse, Response},
    routing::post,
};
use tokio::{
    net::TcpListener,
    sync::{Mutex, oneshot},
    task::JoinHandle,
};

use super::crypto::{decrypt_payload, take_private_key};
use super::payload::{CallbackData, CallbackRequest, BrowserPayload};
use crate::identity_store::derive_principal_from_user_key;

const MAX_CALLBACK_BODY_BYTES: usize = 256 * 1024;

pub struct CallbackState {
    expected_nonce: String,
    expected_session_public_key: Vec<u8>,
    expected_derivation_origin: String,
    expected_origin: String,
    box_private_key: Mutex<Option<ring::agreement::EphemeralPrivateKey>>,
    sender: Mutex<Option<oneshot::Sender<CallbackData>>>,
}

impl CallbackState {
    pub fn new(
        expected_nonce: String,
        expected_session_public_key: Vec<u8>,
        expected_derivation_origin: String,
        expected_origin: String,
        box_private_key: ring::agreement::EphemeralPrivateKey,
    ) -> (Arc<Self>, oneshot::Receiver<CallbackData>) {
        let (sender, receiver) = oneshot::channel();
        let state = Arc::new(Self {
            expected_nonce,
            expected_session_public_key,
            expected_derivation_origin,
            expected_origin,
            box_private_key: Mutex::new(Some(box_private_key)),
            sender: Mutex::new(Some(sender)),
        });
        (state, receiver)
    }
}

pub fn spawn_callback_server(
    listener: TcpListener,
    state: Arc<CallbackState>,
    shutdown_rx: oneshot::Receiver<()>,
) -> JoinHandle<Result<()>> {
    tokio::spawn(async move {
        let app = Router::new()
            .route("/callback", post(callback_handler).options(options_handler))
            .with_state(state)
            .layer(DefaultBodyLimit::max(MAX_CALLBACK_BODY_BYTES));

        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
            .context("Callback server failed")?;

        Ok(())
    })
}

async fn options_handler(State(state): State<Arc<CallbackState>>) -> Response {
    cors_response(StatusCode::NO_CONTENT, &state.expected_origin, None)
}

async fn callback_handler(
    State(state): State<Arc<CallbackState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !has_json_content_type(&headers) {
        return cors_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            &state.expected_origin,
            Some("Content-Type must be application/json"),
        );
    }

    if let Some(origin) = headers.get("origin").and_then(|value| value.to_str().ok())
        && origin != state.expected_origin
    {
        return cors_response(
            StatusCode::FORBIDDEN,
            &state.expected_origin,
            Some("Invalid origin"),
        );
    }

    let payload: CallbackRequest = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            return cors_response(
                StatusCode::BAD_REQUEST,
                &state.expected_origin,
                Some("Invalid JSON payload"),
            );
        }
    };

    if payload.nonce != state.expected_nonce {
        return cors_response(
            StatusCode::BAD_REQUEST,
            &state.expected_origin,
            Some("Invalid nonce"),
        );
    }

    let mut key_slot = state.box_private_key.lock().await;
    let private_key = match take_private_key(&mut key_slot) {
        Ok(key) => key,
        Err(_) => {
            return cors_response(
                StatusCode::CONFLICT,
                &state.expected_origin,
                Some("Callback already used"),
            );
        }
    };

    let decrypted = match decrypt_payload(private_key, &payload) {
        Ok(value) => value,
        Err(_) => {
            return cors_response(
                StatusCode::BAD_REQUEST,
                &state.expected_origin,
                Some("Failed to decrypt payload"),
            );
        }
    };

    match validate_payload(&state, decrypted).await {
        Ok(response) => response,
        Err(message) => cors_response(StatusCode::BAD_REQUEST, &state.expected_origin, Some(&message)),
    }
}

async fn validate_payload(state: &Arc<CallbackState>, payload: BrowserPayload) -> Result<Response, String> {
    if payload.session_public_key != state.expected_session_public_key {
        return Err("Session key mismatch".to_string());
    }

    if payload.derivation_origin != state.expected_derivation_origin {
        return Err("Derivation origin mismatch".to_string());
    }

    let principal = derive_principal_from_user_key(&payload.user_public_key)
        .map_err(|_| "Invalid public key".to_string())?;

    let mut sender = state.sender.lock().await;
    if let Some(tx) = sender.take() {
        let _ = tx.send(CallbackData { payload, principal });
    } else {
        return Err("Login already completed".to_string());
    }

    let body = serde_json::json!({
        "status": "ok",
        "principal": principal.to_text(),
    })
    .to_string();

    Ok(cors_response(StatusCode::OK, &state.expected_origin, Some(&body)))
}

fn cors_response(status: StatusCode, origin: &str, body: Option<&str>) -> Response {
    let body = body.unwrap_or("");
    let content_type = if body.starts_with('{') {
        "application/json"
    } else {
        "text/plain"
    };

    let mut response = (status, body.to_string()).into_response();
    let headers = response.headers_mut();
    insert_header(headers, "Access-Control-Allow-Origin", origin);
    insert_header(headers, "Access-Control-Allow-Methods", "POST, OPTIONS");
    insert_header(headers, "Access-Control-Allow-Headers", "content-type");
    insert_header(headers, CONTENT_TYPE.as_str(), content_type);
    response
}

fn insert_header(headers: &mut HeaderMap, name: &str, value: &str) {
    let header_name = HeaderName::from_bytes(name.as_bytes());
    let header_value = HeaderValue::from_str(value);
    if let (Ok(name), Ok(value)) = (header_name, header_value) {
        headers.insert(name, value);
    }
}

fn has_json_content_type(headers: &HeaderMap) -> bool {
    headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or("").trim())
        .map(|value| value.eq_ignore_ascii_case("application/json"))
        .unwrap_or(false)
}
