// Where: Login crypto utilities.
// What: Generates nonce, ECDH key pairs, and decrypts callback payloads.
// Why: Keeps cryptographic logic isolated from HTTP handling.
use anyhow::{Context, Result, anyhow};
use ring::{
    aead,
    agreement,
    rand::{self, SecureRandom},
};

use super::payload::{BrowserPayload, CallbackRequest};

const NONCE_BYTES: usize = 32;

pub struct BoxKeyPair {
    pub private_key: agreement::EphemeralPrivateKey,
    pub public_key: Vec<u8>,
}

pub fn generate_nonce_hex() -> Result<String> {
    let rng = rand::SystemRandom::new();
    let mut bytes = [0u8; NONCE_BYTES];
    rng.fill(&mut bytes)
        .map_err(|_| anyhow!("Failed to generate nonce"))?;
    Ok(hex::encode(bytes))
}

pub fn generate_box_keypair() -> Result<BoxKeyPair> {
    let rng = rand::SystemRandom::new();
    let private_key = agreement::EphemeralPrivateKey::generate(&agreement::ECDH_P256, &rng)
        .map_err(|_| anyhow!("Failed to generate box key"))?;
    let public_key = private_key
        .compute_public_key()
        .map_err(|_| anyhow!("Failed to compute box public key"))?;
    Ok(BoxKeyPair {
        private_key,
        public_key: public_key.as_ref().to_vec(),
    })
}

pub fn decrypt_payload(
    private_key: agreement::EphemeralPrivateKey,
    callback: &CallbackRequest,
) -> Result<BrowserPayload> {
    let peer_public_key = hex::decode(&callback.ephemeral_public_key_hex)
        .context("Invalid ephemeral public key")?;
    let iv = hex::decode(&callback.iv_hex).context("Invalid iv")?;
    let mut ciphertext = hex::decode(&callback.ciphertext_hex)
        .context("Invalid ciphertext")?;

    let peer_public_key = agreement::UnparsedPublicKey::new(&agreement::ECDH_P256, peer_public_key);
    let plaintext = agreement::agree_ephemeral(private_key, &peer_public_key, |shared_secret| -> Result<Vec<u8>> {
        let key = aead::UnboundKey::new(&aead::AES_256_GCM, shared_secret)
            .map_err(|_| anyhow!("Invalid shared secret"))?;
        let key = aead::LessSafeKey::new(key);
        let nonce = aead::Nonce::try_assume_unique_for_key(&iv)
            .map_err(|_| anyhow!("Invalid iv length"))?;
        let plaintext = key
            .open_in_place(nonce, aead::Aad::empty(), &mut ciphertext)
            .map_err(|_| anyhow!("Failed to decrypt payload"))?;
        Ok(plaintext.to_vec())
    })
    .map_err(|_| anyhow!("Failed to derive shared secret"))??;

    serde_json::from_slice(&plaintext).context("Invalid payload JSON")
}

pub fn take_private_key(slot: &mut Option<agreement::EphemeralPrivateKey>) -> Result<agreement::EphemeralPrivateKey> {
    slot.take().ok_or_else(|| anyhow!("Callback already handled"))
}
