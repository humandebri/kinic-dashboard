use anyhow::{Context, Result, anyhow};
use ic_agent::export::Principal;
use icrc_ledger_types::icrc1::account::Account;
use tracing::info;

use crate::{cli::BalanceArgs, clients::LEDGER_CANISTER};

use super::CommandContext;

pub async fn handle(_args: BalanceArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
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
    let kinic = balance as f64 / 100_000_000f64;

    info!(
        %principal,
        balance_base_units = balance,
        balance_kinic = kinic,
        "fetched token balance"
    );
    println!("Balance for {principal}: {kinic:.7} KINIC (= {balance} e8s)");

    Ok(())
}
