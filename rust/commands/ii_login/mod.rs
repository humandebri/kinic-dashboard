// Where: CLI Internet Identity login flow (single local server).
// What: Serves a local login page and accepts the callback on the same port.
// Why: Keeps the flow self-contained and avoids HTTPS->HTTP callback issues.
use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_LENGTH, CONTENT_TYPE},
    },
    response::{Html, IntoResponse},
    routing::{get, post},
};
use ic_agent::export::Principal;
use ic_agent::identity::{Delegation, SignedDelegation};
use ring::rand::{SecureRandom, SystemRandom};
use serde::Deserialize;
use serde_json::json;
use tokio::{
    net::TcpListener,
    sync::{Mutex, oneshot},
};

use crate::{
    cli::LoginArgs,
    commands::CommandContext,
    identity_store::{
        SessionKeyMaterial, StoredIdentity, derive_principal_from_user_key, generate_session_key,
        normalize_spki_key, save_identity,
    },
};

const IDENTITY_PROVIDER_URL: &str = "https://id.ai/#authorize";
const IDENTITY_PROVIDER_ORIGIN: &str = "https://id.ai";
const CALLBACK_PORT: u16 = 8620;
const CALLBACK_TIMEOUT_SECS: u64 = 300;
const MAX_CALLBACK_BODY_BYTES: usize = 256 * 1024;
const DEFAULT_TTL_HOURS: u64 = 6;
const SECONDS_PER_HOUR: u64 = 3_600;
const NANOS_PER_SECOND: u64 = 1_000_000_000;

#[derive(Deserialize)]
struct BrowserPayload {
    #[serde(rename = "delegations")]
    delegations: Vec<BrowserSignedDelegation>,
    #[serde(rename = "userPublicKey")]
    user_public_key: Vec<u8>,
    state: String,
}

struct CallbackData {
    payload: BrowserPayload,
    principal: Principal,
}

struct CallbackState {
    html: String,
    expected_state: String,
    sender: Mutex<Option<oneshot::Sender<CallbackData>>>,
}

#[derive(Deserialize)]
struct BrowserSignedDelegation {
    delegation: BrowserDelegation,
    signature: Vec<u8>,
}

#[derive(Deserialize)]
struct BrowserDelegation {
    pubkey: Vec<u8>,
    #[serde(deserialize_with = "deserialize_u64_from_str_or_int")]
    expiration: u64,
    targets: Option<Vec<String>>,
}

pub async fn handle(_args: LoginArgs, ctx: &CommandContext) -> Result<()> {
    let identity_path = ctx
        .identity_path
        .clone()
        .ok_or_else(|| anyhow!("Identity path is missing"))?;
    let ttl_ns = ttl_nanos()?;
    // CSRF mitigation: random state token is generated per session and verified on callback.
    let state_token = generate_state()?;
    // Session key is generated locally and shared with the browser page.
    let session = generate_session_key()?;
    let session_pubkey = normalize_spki_key(&session.public_key)?;
    let html = build_login_page(&session, ttl_ns, &state_token);

    // Bind a local callback port for the browser to send delegations back.
    let addr = SocketAddr::from(([127, 0, 0, 1], CALLBACK_PORT));
    let listener = match TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
            anyhow::bail!(
                "Failed to bind to {addr}: port {port} is already in use. Stop the process using it and try again.",
                port = CALLBACK_PORT
            );
        }
        Err(err) => {
            return Err(err).with_context(|| format!("Failed to bind to {addr}"));
        }
    };

    let (callback_tx, callback_rx) = oneshot::channel();
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let state = Arc::new(CallbackState {
        html,
        expected_state: state_token,
        sender: Mutex::new(Some(callback_tx)),
    });

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/callback", post(callback_handler))
        .with_state(state)
        .layer(DefaultBodyLimit::max(MAX_CALLBACK_BODY_BYTES));

    let server_handle = tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
        {
            eprintln!("II login callback server failed: {err}");
        }
    });

    // Launch the browser so the user can authenticate with Internet Identity.
    open_browser(CALLBACK_PORT)?;

    // Block until the browser posts back the delegation payload.
    let callback = tokio::time::timeout(Duration::from_secs(CALLBACK_TIMEOUT_SECS), callback_rx)
        .await
        .map_err(|_| anyhow!("Login timed out waiting for browser callback"))?
        .map_err(|_| anyhow!("Login callback channel closed"))?;

    let _ = shutdown_tx.send(());
    let _ = server_handle.await;
    // Verify delegation targets match our session key.
    let delegations = convert_delegations(callback.payload.delegations, &session_pubkey)?;
    let expiration_ns = delegation_expiration(&delegations)?;
    let principal = callback.principal;
    let stored = StoredIdentity {
        version: 1,
        identity_provider: IDENTITY_PROVIDER_URL.to_string(),
        user_public_key_hex: hex::encode(callback.payload.user_public_key),
        session_pkcs8_hex: hex::encode(session.pkcs8),
        delegations,
        expiration_ns,
        created_at_ns: current_time_ns()?,
    };
    save_identity(&identity_path, &stored)?;
    println!(
        "Saved Internet Identity delegation to {}",
        identity_path.display()
    );
    println!("Principal: {}", principal);
    Ok(())
}

fn build_login_page(session: &SessionKeyMaterial, ttl_ns: u64, state: &str) -> String {
    let session_public_key_hex = hex::encode(&session.public_key);
    let template = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/rust/commands/ii_login_page.html"
    ));
    template
        .replace("{{II_URL}}", IDENTITY_PROVIDER_URL)
        .replace("{{II_ORIGIN}}", IDENTITY_PROVIDER_ORIGIN)
        .replace("{{SESSION_KEY_HEX}}", &session_public_key_hex)
        .replace("{{STATE}}", state)
        .replace("{{TTL_NS}}", &ttl_ns.to_string())
}

async fn root_handler(State(state): State<Arc<CallbackState>>) -> Html<String> {
    Html(state.html.clone())
}

async fn callback_handler(
    State(state): State<Arc<CallbackState>>,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    if let Some(value) = headers.get(CONTENT_LENGTH) {
        let content_length = match value
            .to_str()
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
        {
            Some(length) => length,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    "Invalid Content-Length".to_string(),
                )
                    .into_response();
            }
        };

        if content_length > MAX_CALLBACK_BODY_BYTES {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Request body too large".to_string(),
            )
                .into_response();
        }
    }

    if body.len() > MAX_CALLBACK_BODY_BYTES {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            "Request body too large".to_string(),
        )
            .into_response();
    }

    let content_type_ok = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(is_json_content_type)
        .unwrap_or(false);
    if !content_type_ok {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Content-Type must be application/json".to_string(),
        )
            .into_response();
    }

    let payload: BrowserPayload = match serde_json::from_slice(&body) {
        Ok(payload) => payload,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Invalid JSON payload".to_string()).into_response();
        }
    };

    if payload.state != state.expected_state {
        return (StatusCode::BAD_REQUEST, "Invalid state".to_string()).into_response();
    }

    let principal = match derive_principal_from_user_key(&payload.user_public_key) {
        Ok(principal) => principal,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Invalid public key".to_string()).into_response();
        }
    };
    let principal_text = principal.to_text();

    let mut sender = state.sender.lock().await;
    if let Some(tx) = sender.take() {
        let _ = tx.send(CallbackData { payload, principal });
    } else {
        return (StatusCode::CONFLICT, "Login already completed".to_string()).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "principal": principal_text,
        })),
    )
        .into_response()
}

fn is_json_content_type(value: &str) -> bool {
    value
        .split(';')
        .next()
        .map(|part| part.trim().eq_ignore_ascii_case("application/json"))
        .unwrap_or(false)
}

fn convert_delegations(
    entries: Vec<BrowserSignedDelegation>,
    expected_pubkey: &[u8],
) -> Result<Vec<SignedDelegation>> {
    entries
        .into_iter()
        .map(|entry| {
            let normalized_pubkey = normalize_spki_key(&entry.delegation.pubkey)
                .context("Unsupported delegation public key format")?;
            if normalized_pubkey != expected_pubkey {
                anyhow::bail!("Delegation public key does not match session key");
            }
            let targets = match entry.delegation.targets {
                Some(list) => {
                    let principals = list
                        .into_iter()
                        .map(Principal::from_text)
                        .collect::<Result<Vec<_>, _>>()
                        .context("Invalid delegation target principal")?;
                    Some(principals)
                }
                None => None,
            };
            Ok(SignedDelegation {
                delegation: Delegation {
                    pubkey: normalized_pubkey,
                    expiration: entry.delegation.expiration,
                    targets,
                },
                signature: entry.signature,
            })
        })
        .collect()
}

fn delegation_expiration(entries: &[SignedDelegation]) -> Result<u64> {
    let expiration = entries
        .iter()
        .map(|entry| entry.delegation.expiration)
        .min()
        .ok_or_else(|| anyhow!("Missing delegation expiration"))?;
    Ok(expiration)
}

fn ttl_nanos() -> Result<u64> {
    let ttl_seconds = DEFAULT_TTL_HOURS
        .checked_mul(SECONDS_PER_HOUR)
        .ok_or_else(|| anyhow!("TTL overflow"))?;
    ttl_seconds
        .checked_mul(NANOS_PER_SECOND)
        .ok_or_else(|| anyhow!("TTL overflow"))
}

fn current_time_ns() -> Result<u64> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System time before UNIX_EPOCH")?;
    u64::try_from(now.as_nanos()).context("System time overflow")
}

fn open_browser(port: u16) -> Result<()> {
    let url = format!("http://127.0.0.1:{}/", port);
    let mut cmd = if cfg!(target_os = "macos") {
        let mut cmd = std::process::Command::new("open");
        cmd.arg(&url);
        cmd
    } else if cfg!(target_os = "windows") {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", &url]);
        cmd
    } else {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(&url);
        cmd
    };
    let status = cmd.status().context("Failed to open browser")?;
    if !status.success() {
        return Err(anyhow!("Failed to open browser"));
    }
    Ok(())
}

fn deserialize_u64_from_str_or_int<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct Visitor;

    impl<'de> serde::de::Visitor<'de> for Visitor {
        type Value = u64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("u64 as string or integer")
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(value)
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            u64::try_from(value).map_err(|_| E::custom("negative value"))
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            value
                .parse::<u64>()
                .map_err(|_| E::custom("invalid number"))
        }
    }

    deserializer.deserialize_any(Visitor)
}

fn generate_state() -> Result<String> {
    let rng = SystemRandom::new();
    let mut state_bytes = [0u8; 32];
    rng.fill(&mut state_bytes)
        .map_err(|_| anyhow!("Failed to generate state token"))?;
    Ok(hex::encode(state_bytes))
}
