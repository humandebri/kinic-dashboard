use anyhow::{Result, anyhow};
use tracing::info;

use crate::{cli::BalanceArgs, ledger::fetch_balance};

use super::CommandContext;

pub async fn handle(_args: BalanceArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
    let principal = agent
        .get_principal()
        .map_err(|e| anyhow!("Failed to derive principal for current identity: {e}"))?;

    let balance = fetch_balance(&agent).await?;
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
