use std::path::Path;

use anyhow::{Context, Result};
use pdf_extract::extract_text;

use crate::cli::ConvertPdfArgs;

pub async fn handle(args: ConvertPdfArgs) -> Result<()> {
    let markdown = pdf_to_markdown(&args.file_path)?;
    println!("{markdown}");
    Ok(())
}

pub fn pdf_to_markdown(path: &Path) -> Result<String> {
    extract_text(path).with_context(|| format!("Failed to extract text from {}", path.display()))
}
