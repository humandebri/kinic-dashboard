use anyhow::{Context, Result, bail};
use ic_agent::export::Principal;
use tracing::info;

use crate::{cli::SearchRawArgs, clients::memory::MemoryClient};

use super::CommandContext;

pub async fn handle(args: SearchRawArgs, ctx: &CommandContext) -> Result<()> {
    let client = build_memory_client(&args.memory_id, ctx).await?;
    let embedding = parse_embedding(&args.embedding)?;
    let mut results = client.search(embedding).await?;

    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    info!(
        canister_id = %client.canister_id(),
        result_count = results.len(),
        "search-raw completed"
    );

    for (score, text) in results {
        println!("{score:.6}\t{text}");
    }

    Ok(())
}

async fn build_memory_client(id: &str, ctx: &CommandContext) -> Result<MemoryClient> {
    let agent = ctx.agent_factory.build().await?;
    let memory =
        Principal::from_text(id).context("Failed to parse canister id for search-raw command")?;
    Ok(MemoryClient::new(agent, memory))
}

fn parse_embedding(raw: &str) -> Result<Vec<f32>> {
    let parsed: Vec<f32> = serde_json::from_str(raw)
        .with_context(|| "Embedding must be a JSON array of floats, e.g. [0.1, 0.2]")?;
    if parsed.is_empty() {
        bail!("Embedding array cannot be empty");
    }
    Ok(parsed)
}
