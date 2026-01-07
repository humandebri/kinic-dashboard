use anyhow::{Context, Result, anyhow};
use ic_agent::export::Principal;
use icrc_ledger_types::icrc1::account::Account;

use crate::clients::LEDGER_CANISTER;

pub async fn fetch_balance(agent: &ic_agent::Agent) -> Result<u128> {
    let principal = agent
        .get_principal()
        .map_err(|e| anyhow!("Failed to derive principal for current identity: {e}"))?;

    let ledger_id =
        Principal::from_text(LEDGER_CANISTER).context("Failed to parse ledger canister id")?;

    let account = Account {
        owner: principal,
        subaccount: None,
    };

    let payload = candid::encode_one(account)?;
    let response = agent
        .query(&ledger_id, "icrc1_balance_of")
        .with_arg(payload)
        .call()
        .await
        .context("Failed to query ledger balance")?;

    let balance: u128 =
        candid::decode_one(&response).context("Failed to decode balance response")?;
    Ok(balance)
}
