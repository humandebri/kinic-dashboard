use anyhow::{Context, Result, anyhow};
use ic_agent::export::Principal;
use tracing::info;

use crate::{
    cli::InsertPdfArgs, clients::memory::MemoryClient, commands::convert_pdf::pdf_to_markdown,
    embedding::late_chunking,
};

use super::CommandContext;

pub async fn handle(args: InsertPdfArgs, ctx: &CommandContext) -> Result<()> {
    let client = build_memory_client(&args.memory_id, ctx).await?;
    let markdown = pdf_to_markdown(&args.file_path).map_err(|e| {
        anyhow!(
            "Failed to convert PDF {} to markdown: {e}",
            args.file_path.display()
        )
    })?;

    let chunks = late_chunking(&markdown).await?;

    info!(
        canister_id = %client.canister_id(),
        chunk_count = chunks.len(),
        tag = %args.tag,
        source = %args.file_path.display(),
        "insert-pdf prepared embeddings"
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
        Principal::from_text(id).context("Failed to parse canister id for insert-pdf command")?;
    Ok(MemoryClient::new(agent, memory))
}

fn format_chunk_text(tag: &str, sentence: &str) -> String {
    serde_json::json!({ "tag": tag, "sentence": sentence }).to_string()
}
