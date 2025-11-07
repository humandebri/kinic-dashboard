use std::fs;

use anyhow::{Context, Result, bail};
use ic_agent::export::Principal;
use serde_json::json;
use tracing::info;

use crate::{cli::InsertArgs, clients::memory::MemoryClient, embedding::late_chunking};

use super::CommandContext;

pub async fn handle(args: InsertArgs, ctx: &CommandContext) -> Result<()> {
    let client = build_memory_client(&args.memory_id, ctx).await?;
    let content = load_insert_content(&args)?;
    let chunks = late_chunking(&content).await?;

    info!(
        canister_id = %client.canister_id(),
        chunk_count = chunks.len(),
        tag = %args.tag,
        source = %insert_source(&args),
        "insert command prepared embeddings"
    );

    for (index, chunk) in chunks.into_iter().enumerate() {
        let payload = format_chunk_text(&args.tag, &chunk.sentence);
        info!(
            chunk_index = index,
            sentence_preview = %chunk
                .sentence
                .chars()
                .take(40)
                .collect::<String>(),
            "inserting chunk"
        );
        client.insert(chunk.embedding, &payload).await?;
    }

    Ok(())
}

async fn build_memory_client(id: &str, ctx: &CommandContext) -> Result<MemoryClient> {
    let agent = ctx.agent_factory.build().await?;
    let memory =
        Principal::from_text(id).context("Failed to parse canister id for insert command")?;
    Ok(MemoryClient::new(agent, memory))
}

fn format_chunk_text(tag: &str, sentence: &str) -> String {
    json!({ "tag": tag, "sentence": sentence }).to_string()
}

fn load_insert_content(args: &InsertArgs) -> Result<String> {
    if let Some(text) = &args.text {
        return Ok(text.clone());
    }

    if let Some(path) = &args.file_path {
        return fs::read_to_string(path)
            .with_context(|| format!("Failed to read --file-path {}", path.display()));
    }

    bail!("Either --text or --file-path must be provided");
}

fn insert_source(args: &InsertArgs) -> &'static str {
    if args.file_path.is_some() {
        "file"
    } else {
        "text"
    }
}
