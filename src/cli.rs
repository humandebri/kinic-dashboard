use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "kinic-cli", version, about)]
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

    #[arg(long)]
    pub ic: bool,

    #[arg(long, default_value = "default")]
    pub identity: String,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    Greet {
        #[arg(default_value = "World")]
        name: String,
    },
    Create(CreateArgs),
}

#[derive(Args, Debug)]
pub struct CreateArgs {
    #[arg(long)]
    pub name: String,

    #[arg(long)]
    pub description: String,
}
