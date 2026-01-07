use anyhow::{Context, Result, bail};
use ic_agent::export::Principal;
use serde_json::json;
use tracing::info;

use crate::{cli::InsertRawArgs, clients::memory::MemoryClient};

use super::CommandContext;

pub async fn handle(args: InsertRawArgs, ctx: &CommandContext) -> Result<()> {
    let client = build_memory_client(&args.memory_id, ctx).await?;
    let embedding = parse_embedding(&args.embedding)?;
    let payload = format_chunk_text(&args.tag, &args.text);

    info!(
        canister_id = %client.canister_id(),
        embedding_len = embedding.len(),
        tag = %args.tag,
        "insert-raw prepared embedding"
    );

    client.insert(embedding, &payload).await?;
    Ok(())
}

async fn build_memory_client(id: &str, ctx: &CommandContext) -> Result<MemoryClient> {
    let agent = ctx.agent_factory.build().await?;
    let memory =
        Principal::from_text(id).context("Failed to parse canister id for insert-raw command")?;
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

fn format_chunk_text(tag: &str, sentence: &str) -> String {
    json!({ "tag": tag, "sentence": sentence }).to_string()
}
