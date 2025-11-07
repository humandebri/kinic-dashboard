use anyhow::Result;
use tracing::info;

use crate::{cli::ListArgs, clients::launcher::LauncherClient};

use super::CommandContext;

pub async fn handle(_args: ListArgs, ctx: &CommandContext) -> Result<()> {
    info!("list command invoked (not implemented yet)");
    let agent = ctx.agent_factory.build().await?;
    let client = LauncherClient::new(agent);
    let memories: Vec<_> = client
        .list_memories()
        .await?
        .into_iter()
        .filter_map(|state| match state {
            crate::clients::launcher::State::Running(principal) => Some(principal),
            _ => None,
        })
        .collect();
    Ok(())
}
