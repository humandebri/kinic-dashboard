// Where: CLI Internet Identity login flow.
// What: Launches a web login and saves delegations from a localhost callback.
// Why: Avoids server-side storage while persisting identity.json for the CLI.
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use ic_agent::export::Principal;
use ic_agent::identity::{Delegation, SignedDelegation};
use reqwest::Url;
use tokio::{net::TcpListener, sync::oneshot, time::timeout};

use crate::{
    cli::LoginArgs,
    commands::CommandContext,
    identity_store::{
        StoredIdentity,
        generate_session_key,
        normalize_spki_key,
        save_identity,
    },
};

mod crypto;
mod http;
mod payload;

use crypto::{generate_box_keypair, generate_nonce_hex};
use http::{CallbackState, spawn_callback_server};
use payload::{BrowserSignedDelegation, delegation_expiration};

const IDENTITY_PROVIDER_URL: &str = "https://id.ai/#authorize";
const DEFAULT_LOGIN_URL: &str = "https://app.example.com/cli-login";
const DEFAULT_DERIVATION_ORIGIN: &str = "https://app.example.com";
const CALLBACK_TIMEOUT_SECS: u64 = 180;
const DEFAULT_TTL_DAYS: u64 = 30;
const SECONDS_PER_DAY: u64 = 86_400;
const NANOS_PER_SECOND: u64 = 1_000_000_000;

pub async fn handle(_args: LoginArgs, ctx: &CommandContext) -> Result<()> {
    let identity_path = ctx
        .identity_path
        .clone()
        .ok_or_else(|| anyhow!("Identity path is missing"))?;
    let ttl_ns = ttl_nanos()?;

    let session = generate_session_key()?;
    let session_public_key_hex = hex::encode(&session.public_key);
    let session_pubkey = normalize_spki_key(&session.public_key)?;

    let nonce = generate_nonce_hex()?;
    let box_keypair = generate_box_keypair()?;
    let box_public_key_hex = hex::encode(&box_keypair.public_key);

    let login_url = std::env::var("KINIC_WEB_LOGIN_URL").unwrap_or_else(|_| DEFAULT_LOGIN_URL.to_string());
    let derivation_origin =
        std::env::var("KINIC_DERIVATION_ORIGIN").unwrap_or_else(|_| DEFAULT_DERIVATION_ORIGIN.to_string());

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("Failed to bind localhost callback")?;
    let addr = listener.local_addr()?;
    let callback_url = format!("http://127.0.0.1:{}/callback", addr.port());

    let full_login_url = build_login_url(
        &login_url,
        &callback_url,
        &nonce,
        &session_public_key_hex,
        &box_public_key_hex,
        &derivation_origin,
        ttl_ns,
    )?;

    open_browser_url(&full_login_url)?;

    let (callback_state, callback_rx) = CallbackState::new(
        nonce,
        session.public_key.clone(),
        derivation_origin.clone(),
        derivation_origin.clone(),
        box_keypair.private_key,
    );
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let server_handle = spawn_callback_server(listener, callback_state, shutdown_rx);

    let callback = timeout(Duration::from_secs(CALLBACK_TIMEOUT_SECS), callback_rx)
        .await
        .context("Login timed out")?
        .context("Login callback channel closed")?;

    let _ = shutdown_tx.send(());
    if let Ok(server_result) = server_handle.await && let Err(err) = server_result {
        eprintln!("II login callback server failed: {err}");
    }

    let delegations = convert_delegations(callback.payload.delegations, &session_pubkey)?;
    let expiration_ns = delegation_expiration(&delegations)?;

    if callback.payload.session_public_key != session.public_key {
        anyhow::bail!("Session public key mismatch");
    }

    if callback.payload.derivation_origin != derivation_origin {
        anyhow::bail!("Derivation origin mismatch");
    }

    if callback.payload.expiration_ns != expiration_ns {
        anyhow::bail!("Delegation expiration mismatch");
    }

    if callback.payload.expiration_ns < current_time_ns()? {
        anyhow::bail!("Delegation already expired");
    }

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

fn build_login_url(
    base: &str,
    callback_url: &str,
    nonce: &str,
    session_public_key_hex: &str,
    box_public_key_hex: &str,
    derivation_origin: &str,
    max_ttl_ns: u64,
) -> Result<String> {
    let mut url = Url::parse(base).context("Invalid login URL")?;
    url.query_pairs_mut()
        .append_pair("callback", callback_url)
        .append_pair("nonce", nonce)
        .append_pair("sessionPublicKey", session_public_key_hex)
        .append_pair("boxPublicKey", box_public_key_hex)
        .append_pair("derivationOrigin", derivation_origin)
        .append_pair("maxTimeToLive", &max_ttl_ns.to_string());
    Ok(url.to_string())
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

fn ttl_nanos() -> Result<u64> {
    let ttl_seconds = DEFAULT_TTL_DAYS
        .checked_mul(SECONDS_PER_DAY)
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

fn open_browser_url(url: &str) -> Result<()> {
    let mut cmd = if cfg!(target_os = "macos") {
        let mut cmd = std::process::Command::new("open");
        cmd.arg(url);
        cmd
    } else if cfg!(target_os = "windows") {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        cmd
    } else {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(url);
        cmd
    };
    let status = cmd.status().context("Failed to open browser")?;
    if !status.success() {
        return Err(anyhow!("Failed to open browser"));
    }
    Ok(())
}
