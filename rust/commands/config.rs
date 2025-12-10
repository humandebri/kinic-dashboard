use anyhow::{Context, Result, bail};
use ic_agent::export::Principal;
use tracing::warn;

use crate::cli::ConfigArgs;

use super::CommandContext;

pub async fn handle(args: ConfigArgs, _ctx: &CommandContext) -> Result<()> {
    if let Some(values) = args.add_user {
        let (user, role) = parse_add_user(values)?;
        warn!(
            user = ?user,
            role = ?role,
            "config command is not implemented yet"
        );
        println!("config command validated add-user input; no actions were performed.");
    } else {
        println!("config command is a placeholder; no actions were performed.");
    }
    Ok(())
}

#[derive(Debug)]
enum UserId {
    Principal(Principal),
    Anonymous,
}

#[derive(Debug)]
enum Role {
    Admin,
    Writer,
    Reader,
}

impl Role {
    fn from_str(value: &str) -> Result<Self> {
        match value.to_lowercase().as_str() {
            "admin" => Ok(Self::Admin),
            "writer" => Ok(Self::Writer),
            "reader" => Ok(Self::Reader),
            _ => bail!("role must be one of: admin, writer, reader"),
        }
    }

    #[allow(dead_code)]
    fn code(&self) -> u8 {
        match self {
            Role::Admin => 1,
            Role::Writer => 2,
            Role::Reader => 3,
        }
    }
}

fn parse_add_user(values: Vec<String>) -> Result<(UserId, Role)> {
    if values.len() != 2 {
        bail!("--add-user expects exactly two values: <user_id> <role>");
    }

    let user_id = values
        .first()
        .context("missing user_id value for --add-user")?;
    let role = values.get(1).context("missing role value for --add-user")?;

    let user = if user_id == "anonymous" {
        UserId::Anonymous
    } else {
        let principal = Principal::from_text(user_id)
            .with_context(|| format!("invalid principal text: {user_id}"))?;
        UserId::Principal(principal)
    };

    let role = Role::from_str(role)?;

    Ok((user, role))
}
