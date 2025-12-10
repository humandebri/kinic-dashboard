use anyhow::{Context, Result};
use ic_agent::export::Principal;
use tracing::info;

use crate::{cli::UpdateArgs, clients::launcher::LauncherClient};

use super::CommandContext;

pub async fn handle(args: UpdateArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
    let client = LauncherClient::new(agent);

    let pid = Principal::from_text(&args.memory_id)
        .context("Failed to parse canister id for update command")?
        .to_text();

    client
        .update_instance(&pid)
        .await
        .context("Failed to update instance via launcher canister")?;

    info!(
        launcher_id = %client.launcher_id(),
        instance = %pid,
        "update instance completed"
    );

    println!("Updated memory canister instance {pid}");
    Ok(())
}
