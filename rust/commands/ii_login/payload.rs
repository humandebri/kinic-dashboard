// Where: Login payload types.
// What: Serde models for II delegations and callback payloads.
// Why: Keeps parsing and validation structures isolated.
use anyhow::{Result, anyhow};
use ic_agent::export::Principal;
use ic_agent::identity::SignedDelegation;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CallbackRequest {
    pub nonce: String,
    #[serde(rename = "ephemeralPublicKeyHex")]
    pub ephemeral_public_key_hex: String,
    #[serde(rename = "ivHex")]
    pub iv_hex: String,
    #[serde(rename = "ciphertextHex")]
    pub ciphertext_hex: String,
}

#[derive(Deserialize)]
pub struct BrowserPayload {
    #[serde(rename = "delegations")]
    pub delegations: Vec<BrowserSignedDelegation>,
    #[serde(rename = "userPublicKey")]
    pub user_public_key: Vec<u8>,
    #[serde(rename = "sessionPublicKey")]
    pub session_public_key: Vec<u8>,
    #[serde(rename = "expirationNs", deserialize_with = "deserialize_u64_from_str_or_int")]
    pub expiration_ns: u64,
    #[serde(rename = "derivationOrigin")]
    pub derivation_origin: String,
}

pub struct CallbackData {
    pub payload: BrowserPayload,
    pub principal: Principal,
}

#[derive(Deserialize)]
pub struct BrowserSignedDelegation {
    pub delegation: BrowserDelegation,
    pub signature: Vec<u8>,
}

#[derive(Deserialize)]
pub struct BrowserDelegation {
    pub pubkey: Vec<u8>,
    #[serde(deserialize_with = "deserialize_u64_from_str_or_int")]
    pub expiration: u64,
    pub targets: Option<Vec<String>>,
}

pub fn delegation_expiration(entries: &[SignedDelegation]) -> Result<u64> {
    let expiration = entries
        .iter()
        .map(|entry| entry.delegation.expiration)
        .min()
        .ok_or_else(|| anyhow!("Missing delegation expiration"))?;
    Ok(expiration)
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
            value.parse::<u64>().map_err(|_| E::custom("invalid number"))
        }
    }

    deserializer.deserialize_any(Visitor)
}
