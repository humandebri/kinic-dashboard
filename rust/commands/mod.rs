use anyhow::Result;

use crate::{agent::AgentFactory, cli::Command};

pub mod create;
pub mod config;
pub mod insert;
pub mod insert_pdf;
pub mod list;
pub mod convert_pdf;
pub mod search;
pub mod update;
pub mod balance;

#[derive(Clone)]
pub struct CommandContext {
    pub agent_factory: AgentFactory,
}

pub async fn run_command(command: Command, ctx: CommandContext) -> Result<()> {
    match command {
        Command::Create(args) => create::handle(args, &ctx).await,
        Command::List(args) => list::handle(args, &ctx).await,
        Command::Insert(args) => insert::handle(args, &ctx).await,
        Command::InsertPdf(args) => insert_pdf::handle(args, &ctx).await,
        Command::Search(args) => search::handle(args, &ctx).await,
        Command::ConvertPdf(args) => convert_pdf::handle(args).await,
        Command::Config(args) => config::handle(args, &ctx).await,
        Command::Update(args) => update::handle(args, &ctx).await,
        Command::Balance(args) => balance::handle(args, &ctx).await,
    }
}
