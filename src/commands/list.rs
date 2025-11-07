use anyhow::Result;
use ic_agent::export::Principal;
use tracing::info;

use crate::{
    cli::ListArgs,
    clients::launcher::{LauncherClient, State},
};

use super::CommandContext;

pub async fn handle(_args: ListArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
    let client = LauncherClient::new(agent);
    let states = client.list_memories().await?;

    let principals: Vec<Principal> = states
        .iter()
        .filter_map(memory_principal)
        .cloned()
        .collect();

    if principals.is_empty() {
        println!("No memories found.");
    } else {
        println!("Memories:");
        for principal in principals {
            println!("- {principal}");
        }
    }

    info!("listed memories");
    Ok(())
}

fn memory_principal(state: &State) -> Option<&Principal> {
    match state {
        State::Installation(principal, _)
        | State::SettingUp(principal)
        | State::Running(principal) => Some(principal),
        _ => None,
    }
}
