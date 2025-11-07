use clap::{Args, Parser, Subcommand};

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
        help = "Identity suffix used to load credentials from the system keyring"
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
pub struct InsertArgs {
    #[arg(
        long,
        required = true,
        help = "Principal of the target memory canister"
    )]
    pub memory_id: String,

    #[arg(long, required = true, help = "Markdown text to embed and insert")]
    pub text: String,

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
