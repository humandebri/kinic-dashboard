// Where: Tagged embeddings command handler.
// What: Fetches embeddings for a tag from a memory canister.
// Why: Enables debugging and analysis of stored embeddings.
use anyhow::{Context, Result};
use ic_agent::export::Principal;
use serde_json::to_string;
use tracing::info;

use crate::{cli::TaggedEmbeddingsArgs, clients::memory::MemoryClient};

use super::CommandContext;

pub async fn handle(args: TaggedEmbeddingsArgs, ctx: &CommandContext) -> Result<()> {
    let client = build_memory_client(&args.memory_id, ctx).await?;
    let embeddings = client.tagged_embeddings(args.tag.clone()).await?;

    info!(
        canister_id = %client.canister_id(),
        tag = %args.tag,
        embedding_count = embeddings.len(),
        "tagged-embeddings fetched"
    );

    println!("{}", to_string(&embeddings)?);
    Ok(())
}

async fn build_memory_client(id: &str, ctx: &CommandContext) -> Result<MemoryClient> {
    let agent = ctx.agent_factory.build().await?;
    let memory = Principal::from_text(id)
        .context("Failed to parse canister id for tagged-embeddings command")?;
    Ok(MemoryClient::new(agent, memory))
}
