use std::{cmp::Ordering, fs, path::PathBuf};

use anyhow::{Context, Result, bail};
use ic_agent::export::Principal;
use serde_json::json;

use crate::{
    agent::AgentFactory,
    clients::{
        launcher::{LauncherClient, State},
        memory::MemoryClient,
    },
    commands::convert_pdf,
    embedding::{fetch_embedding, late_chunking},
};

pub(crate) async fn create_memory(
    use_mainnet: bool,
    identity: String,
    name: String,
    description: String,
) -> Result<String> {
    let factory = AgentFactory::new(use_mainnet, identity);
    let agent = factory.build().await?;
    let client = LauncherClient::new(agent);

    let price = client.fetch_deployment_price().await?;
    client.approve_launcher(&price).await?;
    client.deploy_memory(&name, &description).await
}

pub(crate) async fn list_memories(use_mainnet: bool, identity: String) -> Result<Vec<String>> {
    let factory = AgentFactory::new(use_mainnet, identity);
    let agent = factory.build().await?;
    let client = LauncherClient::new(agent);
    let states = client.list_memories().await?;

    let principals = states
        .into_iter()
        .filter_map(|state| state_principal(&state).cloned())
        .map(|principal| principal.to_text())
        .collect();
    Ok(principals)
}

pub(crate) async fn insert_memory(
    use_mainnet: bool,
    identity: String,
    memory_id: String,
    tag: String,
    text: Option<String>,
    file_path: Option<PathBuf>,
) -> Result<usize> {
    let client = build_memory_client(use_mainnet, identity, memory_id).await?;
    let content = resolve_insert_content(text, file_path)?;
    let chunks = late_chunking(&content).await?;
    let chunk_count = chunks.len();

    for chunk in chunks {
        let payload = json!({
            "tag": &tag,
            "sentence": &chunk.sentence
        })
        .to_string();
        client.insert(chunk.embedding, &payload).await?;
    }

    Ok(chunk_count)
}

pub(crate) async fn insert_memory_pdf(
    use_mainnet: bool,
    identity: String,
    memory_id: String,
    tag: String,
    file_path: PathBuf,
) -> Result<usize> {
    let markdown = convert_pdf::pdf_to_markdown(&file_path)?;
    insert_memory(
        use_mainnet,
        identity,
        memory_id,
        tag,
        Some(markdown),
        None,
    )
    .await
}

pub(crate) async fn search_memories(
    use_mainnet: bool,
    identity: String,
    memory_id: String,
    query: String,
) -> Result<Vec<(f32, String)>> {
    let client = build_memory_client(use_mainnet, identity, memory_id).await?;
    let embedding = fetch_embedding(&query).await?;
    let mut results = client.search(embedding).await?;
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));
    Ok(results)
}

async fn build_memory_client(
    use_mainnet: bool,
    identity: String,
    memory_id: String,
) -> Result<MemoryClient> {
    let factory = AgentFactory::new(use_mainnet, identity);
    let agent = factory.build().await?;
    let memory = Principal::from_text(memory_id).context("Failed to parse memory canister id")?;
    Ok(MemoryClient::new(agent, memory))
}

fn resolve_insert_content(text: Option<String>, file_path: Option<PathBuf>) -> Result<String> {
    if let Some(text) = text {
        return Ok(text);
    }

    if let Some(path) = file_path {
        return fs::read_to_string(&path)
            .with_context(|| format!("Failed to read file path {}", path.display()));
    }

    bail!("either text or file_path must be provided");
}

fn state_principal(state: &State) -> Option<&Principal> {
    match state {
        State::Installation(principal, _)
        | State::SettingUp(principal)
        | State::Running(principal) => Some(principal),
        _ => None,
    }
}
