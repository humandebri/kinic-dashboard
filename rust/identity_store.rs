use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow};
use ic_agent::identity::{BasicIdentity, DelegatedIdentity, DelegationError, SignedDelegation};
use ic_agent::Identity;
use der::{Decode, SliceReader};
use ic_agent::export::Principal;
use ic_ed25519::PublicKey;
use pkcs8::{ObjectIdentifier, spki::SubjectPublicKeyInfoRef};
use tracing::warn;
use ring::signature::Ed25519KeyPair;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredIdentity {
    pub version: u8,
    pub identity_provider: String,
    pub user_public_key_hex: String,
    pub session_pkcs8_hex: String,
    pub delegations: Vec<SignedDelegation>,
    pub expiration_ns: u64,
    pub created_at_ns: u64,
}

pub struct SessionKeyMaterial {
    pub pkcs8: Vec<u8>,
    pub public_key: Vec<u8>,
}

pub fn default_identity_path() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME is not set")?;
    Ok(PathBuf::from(home).join(".config/kinic/identity.json"))
}

pub fn generate_session_key() -> Result<SessionKeyMaterial> {
    let rng = ring::rand::SystemRandom::new();
    let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng)
        .map_err(|_| anyhow!("Failed to generate session key"))?
        .as_ref()
        .to_vec();
    let key_pair =
        Ed25519KeyPair::from_pkcs8(&pkcs8).map_err(|_| anyhow!("Invalid session key"))?;
    let identity = BasicIdentity::from_key_pair(key_pair);
    let public_key = identity
        .public_key()
        .ok_or_else(|| anyhow!("Session public key missing"))?;
    Ok(SessionKeyMaterial { pkcs8, public_key })
}

pub fn load_delegated_identity(path: &Path) -> Result<DelegatedIdentity> {
    let payload = fs::read_to_string(path)
        .with_context(|| format!("Failed to read identity file at {}", path.display()))?;
    let stored: StoredIdentity =
        serde_json::from_str(&payload).context("Failed to parse identity.json")?;
    ensure_not_expired(&stored)?;

    let user_public_key_raw = hex::decode(&stored.user_public_key_hex)
        .context("Failed to decode user public key")?;
    let user_public_key = normalize_spki_key(&user_public_key_raw)
        .context("Unsupported user public key format")?;
    let pkcs8 = hex::decode(&stored.session_pkcs8_hex)
        .context("Failed to decode session key")?;
    let key_pair =
        Ed25519KeyPair::from_pkcs8(&pkcs8).map_err(|_| anyhow!("Invalid session key"))?;
    let session_identity = BasicIdentity::from_key_pair(key_pair);
    let delegations = normalize_delegations(&stored.delegations)?;

    if is_canister_signature_key(&user_public_key)? {
        warn!("Delegation chain uses canister signature keys; skipping local verification.");
        eprintln!("Warning: delegation uses canister signature keys; skipped local verification.");
        return Ok(DelegatedIdentity::new_unchecked(
            user_public_key,
            Box::new(session_identity),
            delegations,
        ));
    }

    let delegated = DelegatedIdentity::new(
        user_public_key.clone(),
        Box::new(session_identity),
        delegations.clone(),
    );
    match delegated {
        Ok(identity) => Ok(identity),
        Err(DelegationError::UnknownAlgorithm) => {
            warn!("Delegation chain uses an unknown algorithm; skipping local verification.");
            eprintln!("Warning: delegation uses an unknown algorithm; skipped local verification.");
            let key_pair = Ed25519KeyPair::from_pkcs8(&pkcs8)
                .map_err(|_| anyhow!("Invalid session key"))?;
            let session_identity = BasicIdentity::from_key_pair(key_pair);
            Ok(DelegatedIdentity::new_unchecked(
                user_public_key,
                Box::new(session_identity),
                delegations,
            ))
        }
        Err(err) => Err(err.into()),
    }
}

pub fn derive_principal_from_user_key(user_public_key_raw: &[u8]) -> Result<Principal> {
    // Internet Identity may return either SPKI DER or raw Ed25519. Normalize to SPKI before deriving.
    let user_public_key = normalize_spki_key(user_public_key_raw)
        .context("Unsupported user public key format")?;
    Ok(Principal::self_authenticating(&user_public_key))
}

pub fn save_identity(path: &Path, stored: &StoredIdentity) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create identity directory at {}",
                parent.display()
            )
        })?;
    }
    let payload = serde_json::to_string_pretty(stored).context("Failed to encode identity.json")?;

    // Write atomically with restricted permissions (0600) to protect the session key.
    let tmp_path = path.with_extension("tmp");
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp_path)
            .with_context(|| format!("Failed to open temp identity file at {}", tmp_path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perm = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&tmp_path, perm)
                .with_context(|| format!("Failed to set permissions on {}", tmp_path.display()))?;
        }
        file.write_all(payload.as_bytes())
            .context("Failed to write identity payload")?;
        file.sync_all().context("Failed to sync identity file")?;
    }
    fs::rename(&tmp_path, path).with_context(|| {
        format!(
            "Failed to move temp identity file into place at {}",
            path.display()
        )
    })?;
    Ok(())
}


fn ensure_not_expired(stored: &StoredIdentity) -> Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("System time before UNIX_EPOCH")?;
    let now_ns = u64::try_from(now.as_nanos()).context("System time overflow")?;
    if now_ns >= stored.expiration_ns {
        return Err(anyhow!(
            "Saved Internet Identity delegation has expired. Run `kinic-cli login` again."
        ));
    }
    Ok(())
}

fn normalize_delegations(entries: &[SignedDelegation]) -> Result<Vec<SignedDelegation>> {
    entries
        .iter()
        .map(|entry| {
            let pubkey = normalize_spki_key(&entry.delegation.pubkey)
                .context("Unsupported delegation public key format")?;
            Ok(SignedDelegation {
                delegation: ic_agent::identity::Delegation {
                    pubkey,
                    expiration: entry.delegation.expiration,
                    targets: entry.delegation.targets.clone(),
                },
                signature: entry.signature.clone(),
            })
        })
        .collect()
}

pub fn normalize_spki_key(bytes: &[u8]) -> Result<Vec<u8>> {
    if SubjectPublicKeyInfoRef::decode(&mut SliceReader::new(bytes).map_err(|_| anyhow!("parse"))?)
        .is_ok()
    {
        return Ok(bytes.to_vec());
    }
    if bytes.len() == 32 {
        let public_key = PublicKey::deserialize_raw(bytes)
            .map_err(|_| anyhow!("Invalid Ed25519 raw key"))?;
        return Ok(public_key.serialize_rfc8410_der());
    }
    Err(anyhow!("Unknown public key encoding"))
}

fn is_canister_signature_key(bytes: &[u8]) -> Result<bool> {
    let spki =
        SubjectPublicKeyInfoRef::decode(&mut SliceReader::new(bytes).map_err(|_| anyhow!("parse"))?)
            .map_err(|_| anyhow!("parse"))?;
    let canister_sig_oid = ObjectIdentifier::new_unwrap("1.3.6.1.4.1.56387.1.2");
    Ok(spki.algorithm.oid == canister_sig_oid)
}
