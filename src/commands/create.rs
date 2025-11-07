use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use candid::{CandidType, Decode, Deserialize, Nat};
use ic_agent::{export::Principal, Agent};
use icrc_ledger_types::{
    icrc1::{account::Account, transfer::TransferError},
    icrc2::approve::{ApproveArgs, ApproveError},
};
use thiserror::Error;
use tracing::info;

use crate::cli::CreateArgs;

use super::CommandContext;

const LAUNCHER_CANISTER: &str = "xfug4-5qaaa-aaaak-afowa-cai";
const LEDGER_CANISTER: &str = "73mez-iiaaa-aaaaq-aaasq-cai";
const DEFAULT_MEMORY_ALLOCATION: u64 = 1024;
const APPROVAL_TTL_NS: u64 = 10 * 60 * 1_000_000_000;

pub async fn handle(args: CreateArgs, ctx: &CommandContext) -> Result<()> {
    let agent = ctx.agent_factory.build().await?;
    let launcher = Principal::from_text(LAUNCHER_CANISTER)?;
    let ledger = Principal::from_text(LEDGER_CANISTER)?;
    let client = MemoryClient::new(agent, launcher, ledger);

    let price = client.fetch_deployment_price().await?;
    info!(%price, "fetched deployment price");

    client.approve_launcher(&price).await?;
    info!("launcher approved to transfer tokens");

    let id = client.deploy_memory(&args.name, &args.description).await?;
    info!(%id, "memory deployed");
    println!("Memory canister id: {id}");
    Ok(())
}

struct MemoryClient {
    agent: Agent,
    launcher_id: Principal,
    ledger_id: Principal,
}

impl MemoryClient {
    fn new(agent: Agent, launcher_id: Principal, ledger_id: Principal) -> Self {
        Self {
            agent,
            launcher_id,
            ledger_id,
        }
    }

    async fn fetch_deployment_price(&self) -> Result<Nat> {
        let response = self
            .agent
            .query(&self.launcher_id, "get_price")
            .call()
            .await
            .context("Failed to query deployment price")?;

        let price = Decode!(&response, Nat).context("Failed to decode deployment price")?;
        Ok(price)
    }

    async fn approve_launcher(&self, amount: &Nat) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_nanos() as u64;

        let args = ApproveArgs {
            from_subaccount: None,
            spender: Account {
                owner: self.launcher_id,
                subaccount: None,
            },
            amount: amount.clone(),
            expected_allowance: None,
            expires_at: Some(now + APPROVAL_TTL_NS),
            fee: Some(Nat::from(100_000u64)),
            memo: None,
            created_at_time: Some(now),
        };

        let payload = candid::encode_one(args)?;
        let response = self
            .agent
            .update(&self.ledger_id, "icrc2_approve")
            .with_arg(payload)
            .call_and_wait()
            .await
            .context("Failed to call icrc2_approve")?;

        Decode!(&response, std::result::Result<Nat, ApproveError>)
            .context("Failed to decode icrc2_approve response")?
            .map_err(anyhow::Error::msg)?;
        Ok(())
    }

    async fn deploy_memory(&self, name: &str, description: &str) -> Result<String> {
        let payload = encode_deploy_args(name, description)?;
        let response = self
            .agent
            .update(&self.launcher_id, "deploy_instance")
            .with_arg(payload)
            .call_and_wait()
            .await
            .context("Failed to call deploy_instance")?;

        let result = Decode!(&response, std::result::Result<String, DeployInstanceError>)
            .context("Failed to decode deploy_instance response")?;
        Ok(result?)
    }
}

fn encode_deploy_args(name: &str, description: &str) -> Result<Vec<u8>> {
    let payload = format!("{{name: {name}, description: {description}}}");
    Ok(candid::encode_args((payload, DEFAULT_MEMORY_ALLOCATION))?)
}

#[derive(CandidType, Deserialize, Debug, Error)]
enum DeployInstanceError {
    #[error("index out of range")]
    IndexOutOfLange,

    #[error("failed while setting up canister: {0}")]
    SettingUpCanister(String),

    #[error("refund required")]
    Refund,

    #[error("no instances available")]
    NoInstances,

    #[error("failed to create canister")]
    CreateCanister,

    #[error("failed to install canister")]
    InstallCanister,

    #[error("balance check failed: {0}")]
    CheckBalance(TransferError),

    #[error("already running")]
    AlreadyRunning,
}
