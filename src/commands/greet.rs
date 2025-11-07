use anyhow::Result;
use tracing::info;

pub fn handle(name: String) -> Result<()> {
    info!("greeting started");
    println!("Hello, {name}!");
    Ok(())
}
