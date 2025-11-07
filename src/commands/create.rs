use anyhow::Result;
use tracing::info;

use crate::{cli::CreateArgs, clients::launcher::LauncherClient};

use super::CommandContext;

pub async fn handle(args: CreateArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
    let client = LauncherClient::new(agent);

    let price = client.fetch_deployment_price().await?;
    info!(%price, "fetched deployment price");

    client.approve_launcher(&price).await?;
    info!("launcher approved to transfer tokens");

    let id = client.deploy_memory(&args.name, &args.description).await?;
    info!(%id, "memory deployed");
    println!("Memory canister id: {id}");
    Ok(())
}
