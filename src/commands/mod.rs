use anyhow::Result;

use crate::{agent::AgentFactory, cli::Command};

pub mod create;
pub mod greet;

#[derive(Clone)]
pub struct CommandContext {
    pub agent_factory: AgentFactory,
}

pub async fn run_command(command: Command, ctx: CommandContext) -> Result<()> {
    match command {
        Command::Greet { name } => greet::handle(name),
        Command::Create(args) => create::handle(args, &ctx).await,
    }
}
