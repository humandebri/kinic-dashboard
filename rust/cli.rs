use std::path::PathBuf;

use clap::{ArgGroup, Args, Parser, Subcommand};

use anyhow::Result;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::fmt;

// use crate::{
//     agent::AgentFactory,
//     cli::Cli,
//     commands::{CommandContext, run_command},
// };
use std::process::ExitCode;

use crate::{
    agent::AgentFactory,
    commands::{CommandContext, run_command},
};

#[tokio::main]
async fn main() -> ExitCode {
    let _ = dotenvy::dotenv();
    if let Err(e) = crate::run().await {
        eprintln!("{e:?}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

pub async fn run() -> Result<()> {
    let cli = Cli::parse();

    let max = match cli.global.verbose {
        0 => LevelFilter::INFO,
        1 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    fmt().with_max_level(max).without_time().try_init().ok();

    let context = CommandContext {
        agent_factory: AgentFactory::new(cli.global.ic, cli.global.identity.clone()),
    };

    run_command(cli.command, context).await
}

#[derive(Parser, Debug)]
#[command(
    name = "kinic-cli",
    version,
    about = "Kinic developer CLI for deploying and managing memories"
)]
pub struct Cli {
    #[command(flatten)]
    pub global: GlobalOpts,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Args, Debug)]
pub struct GlobalOpts {
    #[arg(short, long, action = clap::ArgAction::Count)]
    pub verbose: u8,

    #[arg(
        long,
        help = "Use the Internet Computer mainnet instead of local replica"
    )]
    pub ic: bool,

    #[arg(
        long,
        required = true,
        help = "Dfx identity name used to load credentials from the system keyring"
    )]
    pub identity: String,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    #[command(about = "Deploy a new memory canister via the launcher")]
    Create(CreateArgs),
    #[command(about = "List deployed memories and their principals")]
    List(ListArgs),
    #[command(about = "Insert text into an existing memory canister")]
    Insert(InsertArgs),
    #[command(about = "Search within a memory canister using embeddings")]
    Search(SearchArgs),
}

#[derive(Args, Debug)]
pub struct CreateArgs {
    #[arg(long, required = true, help = "Name for the new memory")]
    pub name: String,

    #[arg(long, required = true, help = "Short description for the new memory")]
    pub description: String,
}

#[derive(Args, Debug)]
pub struct ListArgs {}

#[derive(Args, Debug)]
#[command(group = ArgGroup::new("insert_input").required(true).args(["text", "file_path"]))]
pub struct InsertArgs {
    #[arg(
        long,
        required = true,
        help = "Principal of the target memory canister"
    )]
    pub memory_id: String,

    #[arg(long, help = "Markdown text to embed and insert")]
    pub text: Option<String>,

    #[arg(
        long,
        value_name = "PATH",
        help = "Read markdown content from a file (conflicts with --text)"
    )]
    pub file_path: Option<PathBuf>,

    #[arg(long, required = true, help = "Tag metadata stored alongside the text")]
    pub tag: String,
}

#[derive(Args, Debug)]
pub struct SearchArgs {
    #[arg(
        long,
        required = true,
        help = "Principal of the memory canister to search"
    )]
    pub memory_id: String,

    #[arg(long, required = true, help = "Query text to embed and search")]
    pub query: String,
}
