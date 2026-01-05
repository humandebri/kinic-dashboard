use std::{
    net::SocketAddr,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow};
use ic_agent::export::Principal;
use ic_agent::identity::{Delegation, SignedDelegation};
use serde::Deserialize;
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
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
const DEFAULT_TTL_DAYS: u64 = 30;
const SECONDS_PER_DAY: u64 = 86_400;
const NANOS_PER_SECOND: u64 = 1_000_000_000;

#[derive(Deserialize)]
struct BrowserPayload {
    #[serde(rename = "delegations")]
    delegations: Vec<BrowserSignedDelegation>,
    #[serde(rename = "userPublicKey")]
    user_public_key: Vec<u8>,
}

struct CallbackData {
    payload: BrowserPayload,
    principal: Principal,
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
    let session = generate_session_key()?;
    let session_pubkey = normalize_spki_key(&session.public_key)?;
    let html = build_login_page(&session, ttl_ns);

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

    open_browser(CALLBACK_PORT)?;

    let callback = accept_callback(listener, html).await?;
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

fn build_login_page(session: &SessionKeyMaterial, ttl_ns: u64) -> String {
    let session_public_key_hex = hex::encode(&session.public_key);
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kinic CLI Login</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; padding: 24px; }}
    code {{ background: #f3f3f3; padding: 2px 6px; border-radius: 4px; }}
  </style>
</head>
<body>
  <h1>Kinic CLI Login</h1>
  <p id="status">Click the button below to open Internet Identity.</p>
  <p id="principal"></p>
  <button id="open-ii" type="button">Open Internet Identity</button>
  <script>
    const STATUS = document.getElementById("status");
    const OPEN_BUTTON = document.getElementById("open-ii");
    const II_URL = "{ii_url}";
    const II_ORIGIN = "{ii_origin}";
    const SESSION_PUBLIC_KEY_HEX = "{session_key_hex}";
    const MAX_TTL = BigInt("{ttl_ns}");
    const PRINCIPAL = document.getElementById("principal");

    function hexToBytes(hex) {{
      const bytes = [];
      for (let i = 0; i < hex.length; i += 2) {{
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
      }}
      return new Uint8Array(bytes);
    }}

    function normalizeDelegations(delegations) {{
      return delegations.map((entry) => {{
        const delegation = entry.delegation;
        const targets = delegation.targets
          ? delegation.targets.map((t) => (t && t.toText ? t.toText() : t))
          : undefined;
        return {{
          delegation: {{
            pubkey: Array.from(delegation.pubkey),
            expiration: delegation.expiration.toString(),
            targets,
          }},
          signature: Array.from(entry.signature),
        }};
      }});
    }}

    function normalizeUserPublicKey(userPublicKey) {{
      return Array.from(userPublicKey);
    }}

    const sessionPublicKey = hexToBytes(SESSION_PUBLIC_KEY_HEX);
    let authWindow = null;
    function openAuthWindow() {{
      authWindow = window.open(II_URL, "kinic-ii", "width=480,height=720");
      if (!authWindow) {{
        STATUS.textContent = "Popup blocked. Please allow popups and retry.";
        return;
      }}
      STATUS.textContent = "Waiting for authentication...";
      OPEN_BUTTON.disabled = true;
      OPEN_BUTTON.textContent = "Opening...";
    }}

    OPEN_BUTTON.addEventListener("click", () => {{
      openAuthWindow();
    }});

    window.addEventListener("message", async (event) => {{
      if (event.origin !== II_ORIGIN) {{
        return;
      }}
      const msg = event.data;
      if (!msg || !msg.kind) {{
        return;
      }}
      if (msg.kind === "authorize-ready") {{
        if (!authWindow) {{
          STATUS.textContent = "Click 'Open Internet Identity' to continue.";
          return;
        }}
        authWindow.postMessage({{
          kind: "authorize-client",
          sessionPublicKey,
          maxTimeToLive: MAX_TTL,
          derivationOrigin: window.location.origin,
        }}, II_ORIGIN);
      }} else if (msg.kind === "authorize-client-success") {{
        STATUS.textContent = "Saving delegation...";
        const payload = {{
          delegations: normalizeDelegations(msg.delegations || []),
          userPublicKey: normalizeUserPublicKey(msg.userPublicKey),
        }};
        const resp = await fetch("/callback", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify(payload),
        }});
        if (resp.ok) {{
          const data = await resp.json();
          STATUS.textContent = "Done. You can close this tab.";
          if (data.principal) {{
            PRINCIPAL.textContent = `Principal: ${{data.principal}}`;
          }}
          OPEN_BUTTON.style.display = "none";
        }} else {{
          STATUS.textContent = "Callback failed. Please retry.";
          OPEN_BUTTON.disabled = false;
          OPEN_BUTTON.textContent = "Open Internet Identity";
        }}
      }} else if (msg.kind === "authorize-client-failure") {{
        STATUS.textContent = "Login failed. Please retry.";
        OPEN_BUTTON.disabled = false;
        OPEN_BUTTON.textContent = "Open Internet Identity";
      }}
    }});
  </script>
</body>
</html>
"#,
        ii_url = IDENTITY_PROVIDER_URL,
        ii_origin = IDENTITY_PROVIDER_ORIGIN,
        session_key_hex = session_public_key_hex,
        ttl_ns = ttl_ns
    )
}

async fn accept_callback(listener: TcpListener, html: String) -> Result<CallbackData> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        if let Some(callback) = handle_connection(&mut stream, &html).await? {
            return Ok(callback);
        }
    }
}

async fn handle_connection(stream: &mut TcpStream, html: &str) -> Result<Option<CallbackData>> {
    let request = read_request(stream).await?;
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/") => {
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
                html.len(),
                html
            );
            stream.write_all(response.as_bytes()).await?;
            Ok(None)
        }
        ("POST", "/callback") => {
            let payload: BrowserPayload = serde_json::from_slice(&request.body)
                .context("Failed to parse callback payload")?;
            let principal =
                derive_principal_from_user_key(&payload.user_public_key).context("invalid key")?;
            let body = json!({
                "status": "ok",
                "principal": principal.to_text(),
            })
            .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await?;
            Ok(Some(CallbackData { payload, principal }))
        }
        _ => {
            let body = "Not found";
            let response = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await?;
            Ok(None)
        }
    }
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

async fn read_request(stream: &mut TcpStream) -> Result<HttpRequest> {
    let mut buffer = Vec::new();
    let header_end = loop {
        let mut chunk = [0u8; 1024];
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break None;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(pos) = find_header_end(&buffer) {
            break Some(pos);
        }
        if buffer.len() > 64 * 1024 {
            return Err(anyhow!("Request header too large"));
        }
    };

    let header_end = header_end.ok_or_else(|| anyhow!("Invalid request"))?;
    let header_bytes = &buffer[..header_end];
    let mut body = buffer[(header_end + 4)..].to_vec();
    let header_text = String::from_utf8_lossy(header_bytes);
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| anyhow!("Missing request line"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| anyhow!("Missing method"))?
        .to_string();
    let path = parts
        .next()
        .ok_or_else(|| anyhow!("Missing path"))?
        .to_string();

    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find_map(|(name, value)| {
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0);

    if body.len() < content_length {
        let mut remaining = vec![0u8; content_length - body.len()];
        stream.read_exact(&mut remaining).await?;
        body.extend_from_slice(&remaining);
    }

    Ok(HttpRequest { method, path, body })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
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
